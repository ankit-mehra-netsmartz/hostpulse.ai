import type { Express } from "express";
import type { IStorage } from "../storage";
import crypto from "crypto";
import { z } from "zod";
import { logger } from "../logger";
import { config } from "../config";
import { hospitable_connect } from "../services/hospitable-connect";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  baseURL: config.openai.baseUrl,
});

const hospitableBaseWebhookSchema = z.object({
  action: z.string(),
  data: z.record(z.any()).optional(),
});

const hospitableReviewWebhookSchema = z.object({
  action: z.literal("review.created"),
  data: z.object({
    reservation_id: z.string(),
    review: z
      .object({
        public: z
          .object({
            rating: z.number().optional(),
            review: z.string().optional(),
            response: z.string().optional(),
          })
          .optional(),
        private: z
          .object({
            feedback: z.string().optional(),
            detailed_ratings: z
              .array(
                z.object({
                  type: z.string(),
                  rating: z.number(),
                  comment: z.string().optional(),
                }),
              )
              .optional(),
          })
          .optional(),
        reviewed_at: z.string().optional(),
        public_review: z.string().optional(),
        private_remarks: z.string().optional(),
        rating: z.number().optional(),
        category_ratings: z.record(z.number()).optional(),
        host_reply: z.string().optional(),
      })
      .optional(),
  }),
});

const hospitableReservationWebhookSchema = z.object({
  id: z.string().optional(),
  action: z.enum([
    "reservation.created",
    "reservation.changed",
    "reservation.cancelled",
  ]),
  data: z.object({
    id: z.string(),
    conversation_id: z.string().optional(),
    platform: z
      .enum(["airbnb", "homeaway", "booking", "direct", "manual"])
      .optional(),
    platform_id: z.string().optional(),
    booking_date: z.string().optional(),
    arrival_date: z.string().optional(),
    departure_date: z.string().optional(),
    nights: z.number().optional(),
    check_in: z.string().optional(),
    check_out: z.string().optional(),
    last_message_at: z.string().optional(),
    status: z.string().optional(),
    reservation_status: z
      .object({
        current: z
          .object({
            category: z.string().optional(),
            sub_category: z.string().nullable().optional(),
          })
          .optional(),
        history: z
          .array(
            z.object({
              category: z.string().optional(),
              sub_category: z.string().nullable().optional(),
              changed_at: z.string().optional(),
            }),
          )
          .optional(),
      })
      .optional(),
    guests: z
      .object({
        total: z.number().optional(),
        adult_count: z.number().optional(),
        child_count: z.number().optional(),
        infant_count: z.number().optional(),
        pet_count: z.number().optional(),
      })
      .optional(),
    issue_alert: z.string().nullable().optional(),
    stay_type: z.enum(["guest_stay", "owner_stay"]).optional(),
    note: z.string().optional(),
    guest: z
      .object({
        id: z.string().optional(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        email: z.string().nullable().optional(),
        phone_numbers: z.array(z.string()).optional(),
        profile_picture: z.string().nullable().optional(),
        picture_url: z.string().nullable().optional(),
      })
      .optional(),
    properties: z
      .array(
        z.object({
          id: z.string(),
          name: z.string().optional(),
          public_name: z.string().optional(),
          timezone: z.string().optional(),
        }),
      )
      .optional(),
    listings: z
      .array(
        z.object({
          platform: z.string().optional(),
          platform_id: z.string().optional(),
        }),
      )
      .optional(),
    review: z
      .object({
        id: z.string().optional(),
        public_review: z.string().optional(),
        private_remarks: z.string().optional(),
        rating: z.number().optional(),
      })
      .nullable()
      .optional(),
    financials: z.any().optional(),
  }),
  triggers: z
    .array(
      z.enum([
        "status_changed",
        "dates_changed",
        "guests_changed",
        "listing_changed",
        "checkin_changed",
        "checkout_changed",
        "financials_changed",
        "guest_issue_detected",
        "test",
        "historic_reservation",
      ]),
    )
    .optional(),
  created: z.string().optional(),
  version: z.string().optional(),
});

const hospitablePropertyWebhookSchema = z.object({
  action: z.enum([
    "property.created",
    "property.changed",
    "property.deleted",
    "property.merged",
  ]),
  data: z.object({
    property: z
      .object({
        id: z.string(),
        name: z.string().optional(),
        public_name: z.string().optional(),
        address: z
          .union([
            z.string(),
            z.object({
              number: z.string().optional(),
              street: z.string().optional(),
              city: z.string().optional(),
              state: z.string().optional(),
              country: z.string().optional(),
              postcode: z.string().optional(),
              display: z.string().optional(),
            }),
          ])
          .optional(),
        picture: z.string().optional(),
        property_type: z.string().optional(),
        bedrooms: z.number().optional(),
        bathrooms: z.number().optional(),
        timezone: z.string().optional(),
        currency: z.string().optional(),
        capacity: z
          .object({
            max_guests: z.number().optional(),
          })
          .optional(),
        listings: z
          .array(
            z.object({
              id: z.string(),
              platform: z.string().optional(),
              url: z.string().optional(),
            }),
          )
          .optional(),
      })
      .optional(),
    merged_into: z.string().optional(),
    user: z
      .object({
        id: z.string().optional(),
        email: z.string().optional(),
      })
      .optional(),
  }),
});

const hospitableMessageWebhookSchema = z.object({
  id: z.string().optional(),
  action: z.enum([
    "message.created",
    "message.updated",
    "message.sent",
    "message.received",
  ]),
  data: z.object({
    platform: z.string().optional(),
    platform_id: z.union([z.number(), z.string()]).optional(),
    conversation_id: z.string().nullable().optional(),
    reservation_id: z.string().nullable().optional(),
    content_type: z.string().optional(),
    body: z.string().nullable().optional(),
    attachments: z
      .array(
        z.object({
          type: z.string().optional(),
          url: z.string().optional(),
        }),
      )
      .optional(),
    sender_type: z.enum(["host", "guest"]).optional(),
    sender_role: z.string().nullable().optional(),
    sender: z
      .object({
        first_name: z.string().nullable().optional(),
        full_name: z.string().nullable().optional(),
        locale: z.string().nullable().optional(),
        picture_url: z.string().nullable().optional(),
        thumbnail_url: z.string().nullable().optional(),
        location: z.any().optional(),
      })
      .optional(),
    user: z
      .object({
        id: z.string().optional(),
        email: z.string().nullable().optional(),
        name: z.string().nullable().optional(),
      })
      .optional(),
    created_at: z.string().optional(),
    source: z.string().optional(),
    integration: z.string().nullable().optional(),
    sent_reference_id: z.string().nullable().optional(),
    reactions: z
      .array(
        z.object({
          emoji: z.string().optional(),
          sender_type: z.enum(["host", "guest"]).optional(),
          sender: z
            .object({
              first_name: z.string().nullable().optional(),
              full_name: z.string().nullable().optional(),
            })
            .optional(),
          reacted_at: z.string().optional(),
        }),
      )
      .optional(),
    property: z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        name: z.string().nullable().optional(),
        public_name: z.string().nullable().optional(),
      })
      .optional(),
    listing: z
      .object({
        platform: z.string().optional(),
        platform_id: z.union([z.string(), z.number()]).optional(),
      })
      .optional(),
  }),
  triggers: z.array(z.string()).optional(),
  created: z.string().optional(),
  version: z.string().optional(),
});

function verifyWebhookSignature(
  payload: Buffer | string,
  signature: string,
  secret: string,
): boolean {
  const cleanSignature = signature.startsWith("sha256=")
    ? signature.slice(7)
    : signature;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  const sigBuffer = Buffer.from(cleanSignature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

export function registerWebhookRoutes(app: Express, storage: IStorage) {
  app.post("/api/webhooks/hospitable", async (req, res) => {
    const startTime = Date.now();
    const eventType = req.body?.event || req.body?.action || "unknown";
    let logStatus = "success";
    let logStatusCode = 200;
    let logErrorMessage: string | undefined;
    let logReservationId: string | undefined;
    let logListingId: string | undefined;
    let logWorkspaceId: string | undefined;

    try {
      const webhookSecret = config.isDevelopment
        ? config.hospitable.webhookSecretDev
        : config.hospitable.webhookSecret;

      if (!webhookSecret) {
        const secretName = config.isDevelopment
          ? "HOSPITABLE_WEBHOOK_SECRET_DEV"
          : "HOSPITABLE_WEBHOOK_SECRET";
        logger.error("Webhook", `${secretName} not configured`);
        await storage.createWebhookLog({
          source: "hospitable",
          eventType,
          status: "error",
          statusCode: 500,
          payload: req.body,
          errorMessage: "Webhook secret not configured",
          processingTimeMs: Date.now() - startTime,
        });
        return res.status(500).json({ message: "Webhook not configured" });
      }

      const signature = req.headers["signature"] as string;
      if (!signature) {
        await storage.createWebhookLog({
          source: "hospitable",
          eventType,
          status: "error",
          statusCode: 401,
          payload: req.body,
          errorMessage: "Missing webhook signature",
          processingTimeMs: Date.now() - startTime,
        });
        return res.status(401).json({ message: "Missing webhook signature" });
      }

      const rawBody = (req as any).rawBody as Buffer | undefined;
      if (!rawBody) {
        await storage.createWebhookLog({
          source: "hospitable",
          eventType,
          status: "error",
          statusCode: 500,
          payload: req.body,
          errorMessage: "Raw body not available",
          processingTimeMs: Date.now() - startTime,
        });
        return res.status(500).json({ message: "Webhook verification failed" });
      }

      try {
        if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
          await storage.createWebhookLog({
            source: "hospitable",
            eventType,
            status: "error",
            statusCode: 401,
            payload: req.body,
            errorMessage: "Invalid signature",
            processingTimeMs: Date.now() - startTime,
          });
          return res.status(401).json({ message: "Invalid webhook signature" });
        }
      } catch (err) {
        logger.error("Webhook", "Signature verification error:", err);
        await storage.createWebhookLog({
          source: "hospitable",
          eventType,
          status: "error",
          statusCode: 401,
          payload: req.body,
          errorMessage: `Signature verification error: ${err}`,
          processingTimeMs: Date.now() - startTime,
        });
        return res
          .status(401)
          .json({ message: "Signature verification failed" });
      }

      const baseParseResult = hospitableBaseWebhookSchema.safeParse(req.body);
      if (!baseParseResult.success) {
        await storage.createWebhookLog({
          source: "hospitable",
          eventType,
          status: "error",
          statusCode: 400,
          payload: req.body,
          errorMessage: `Invalid payload: ${baseParseResult.error.message}`,
          processingTimeMs: Date.now() - startTime,
        });
        return res.status(400).json({ message: "Invalid webhook payload" });
      }

      const { action: event } = baseParseResult.data;
      logger.info("Webhook", `Received Hospitable webhook: ${event}`);

      switch (event) {
        // ========== RESERVATION EVENTS ==========
        case "reservation.created":
        case "reservation.changed":
        case "reservation.cancelled": {
          const parseResult = hospitableReservationWebhookSchema.safeParse(
            req.body,
          );
          if (!parseResult.success) {
            logger.error(
              "Webhook",
              "Invalid reservation webhook payload:",
              parseResult.error,
            );
            await storage.createWebhookLog({
              source: "hospitable",
              eventType: event,
              status: "error",
              statusCode: 400,
              payload: req.body,
              errorMessage: `Invalid payload: ${parseResult.error.message}`,
              processingTimeMs: Date.now() - startTime,
            });
            return res
              .status(400)
              .json({ message: "Invalid reservation webhook payload" });
          }

          const resData = parseResult.data.data;
          logReservationId = resData.id;

          const existingReservation = await storage.findReservationByExternalId(
            resData.id,
          );

          const propertyId = resData.properties?.[0]?.id;
          const listingPlatformId = resData.listings?.[0]?.platform_id;
          let listing = propertyId
            ? await storage.findListingByExternalId(propertyId)
            : null;

          if (!listing && listingPlatformId) {
            listing = await storage.findListingByExternalId(listingPlatformId);
          }

          logListingId = listing?.id;
          logWorkspaceId = listing?.workspaceId || undefined;

          const triggers = parseResult.data.triggers || [];
          logger.info(
            "Webhook",
            `Reservation webhook: ${event}, triggers: ${triggers.join(", ") || "none"}`,
          );

          let derivedStatus: string;
          if (event === "reservation.cancelled") {
            derivedStatus = "cancelled";
          } else {
            derivedStatus =
              resData.reservation_status?.current?.category ||
              resData.status ||
              "confirmed";
          }

          const confirmationCode = resData.platform_id || null;

          const checkInDateStr = resData.check_in || resData.arrival_date;
          const checkInDate = checkInDateStr ? new Date(checkInDateStr) : null;

          const checkOutDateStr = resData.check_out || resData.departure_date;
          const checkOutDate = checkOutDateStr
            ? new Date(checkOutDateStr)
            : null;

          if (existingReservation) {
            const updateData: any = {
              status: derivedStatus,
              confirmationCode:
                confirmationCode || existingReservation.confirmationCode,
            };

            if (checkInDate) {
              updateData.checkInDate = checkInDate;
            }
            if (checkOutDate) {
              updateData.checkOutDate = checkOutDate;
            }

            if (resData.guest) {
              const guestName = [
                resData.guest.first_name,
                resData.guest.last_name,
              ]
                .filter(Boolean)
                .join(" ");
              if (guestName) updateData.guestName = guestName;
              if (resData.guest.email)
                updateData.guestEmail = resData.guest.email;
              const guestPic =
                resData.guest.profile_picture || resData.guest.picture_url;
              if (guestPic) updateData.guestProfilePicture = guestPic;
              if (resData.guest.location)
                updateData.guestLocation = resData.guest.location;
            }

            if (resData.guests?.total !== undefined) {
              updateData.guestCount = resData.guests.total;
            }

            if (resData.platform) {
              updateData.platform =
                resData.platform.charAt(0).toUpperCase() +
                resData.platform.slice(1);
            }

            await storage.updateReservation(existingReservation.id, updateData);
            logger.info(
              "Webhook",
              `Updated reservation: ${existingReservation.id} (status: ${derivedStatus}, event: ${event}, triggers: ${triggers.join(", ")})`,
            );

            const acceptedStatuses = ["accepted", "confirmed", "new"];
            if (
              listing &&
              listing.workspaceId &&
              acceptedStatuses.includes(derivedStatus) &&
              checkOutDate
            ) {
              try {
                const existingTask = await storage.findExistingCleaningTask(
                  listing.workspaceId,
                  listing.id,
                  existingReservation.id,
                );
                if (!existingTask) {
                  const assignments = await storage.getAssignmentsByListing(
                    listing.id,
                  );
                  const activeAssignments = assignments.filter(
                    (a) => a.isActive,
                  );
                  if (activeAssignments.length > 0) {
                    const assignment = activeAssignments[0];
                    const accessToken = crypto.randomBytes(32).toString("hex");
                    const guestName = resData.guest
                      ? [resData.guest.first_name, resData.guest.last_name]
                          .filter(Boolean)
                          .join(" ")
                      : existingReservation.guestName || "Unknown Guest";

                    let webhookProcedureId = assignment.procedureId;
                    if (!webhookProcedureId && listing.defaultProcedureId) {
                      webhookProcedureId = listing.defaultProcedureId;
                    }

                    const webhookTaskData: any = {
                      workspaceId: listing.workspaceId,
                      cleanerId: assignment.cleanerId,
                      listingId: listing.id,
                      reservationId: existingReservation.id,
                      assignmentId: assignment.id,
                      procedureId: webhookProcedureId,
                      scheduledDate: checkOutDate,
                      guestName: guestName || "Unknown Guest",
                      status: "scheduled",
                      accessToken,
                    };
                    if (
                      assignment.assignmentMode === "auto" &&
                      assignment.defaultMemberId
                    ) {
                      webhookTaskData.assignedMemberId =
                        assignment.defaultMemberId;
                    }
                    const task =
                      await storage.createCleaningTask(webhookTaskData);

                    if (webhookProcedureId) {
                      const procedureWithSteps =
                        await storage.getProcedureWithSteps(webhookProcedureId);
                      if (
                        procedureWithSteps &&
                        procedureWithSteps.steps.length > 0
                      ) {
                        const items = procedureWithSteps.steps.map((step) => ({
                          cleaningTaskId: task.id,
                          stepOrder: step.stepOrder,
                          label: step.label,
                          description: step.description,
                          moduleTitle: step.moduleTitle,
                          moduleOrder: step.moduleOrder,
                          requiresPhotoVerification:
                            step.requiresPhotoVerification,
                          photoVerificationMode:
                            step.photoVerificationMode ||
                            (step.requiresPhotoVerification
                              ? "required"
                              : "none"),
                          requiresGpsVerification: step.requiresGpsVerification,
                        }));
                        await storage.createCleaningTaskItems(items);
                      }
                    }
                    logger.info(
                      "Webhook",
                      `Auto-generated cleaning task ${task.id} for reservation ${existingReservation.id} via webhook`,
                    );
                  }
                }
              } catch (autoGenError) {
                logger.error(
                  "Webhook",
                  "Error auto-generating cleaning task from webhook:",
                  autoGenError,
                );
              }
            }

            try {
              const cleaningTasksForRes =
                await storage.getCleaningTasksByReservationId(
                  existingReservation.id,
                );
              if (cleaningTasksForRes.length > 0 && listing) {
                const baseUrl = config.appUrl || "https://hostpulse.ai";
                const {
                  renderTemplate,
                  DEFAULT_TEMPLATES,
                  sendTemplatedEmail,
                } = await import("../services/email");

                for (const ct of cleaningTasksForRes) {
                  if (ct.status === "completed") continue;

                  const cleaner = await storage.getCleaner(ct.cleanerId);
                  if (!cleaner) continue;

                  const checklistUrl = `${baseUrl}/checklist/${ct.accessToken}`;
                  const scheduledDate = new Date(
                    ct.scheduledDate,
                  ).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  });
                  const shortCodeData = {
                    property_name: ct.listing.name,
                    address: ct.listing.address || "",
                    check_in_date: checkInDate
                      ? checkInDate.toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                        })
                      : "",
                    check_out_date: checkOutDate
                      ? checkOutDate.toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                        })
                      : scheduledDate,
                    guest_name: updateData.guestName || ct.guestName || "",
                    cleaner_name: cleaner.name,
                    checklist_link: checklistUrl,
                    scheduled_date: scheduledDate,
                  };

                  if (event === "reservation.cancelled") {
                    await storage.updateCleaningTask(ct.id, {
                      status: "cancelled",
                    });
                    const emailTmpl = await storage.getNotificationTemplate(
                      ct.workspaceId,
                      "cancelled_email",
                    );
                    const smsTmpl = await storage.getNotificationTemplate(
                      ct.workspaceId,
                      "cancelled_sms",
                    );

                    if (cleaner.notifyByEmail && cleaner.email) {
                      const tmpl =
                        emailTmpl || DEFAULT_TEMPLATES.cancelled_email;
                      await sendTemplatedEmail({
                        toEmail: cleaner.email,
                        subject:
                          tmpl.subject ||
                          DEFAULT_TEMPLATES.cancelled_email.subject,
                        body: tmpl.body,
                        shortCodeData,
                      }).catch((e) =>
                        logger.error(
                          "Webhook",
                          "Failed to send cancellation email:",
                          e,
                        ),
                      );
                    }
                    if (cleaner.notifyBySms && cleaner.phone) {
                      try {
                        const { sendSMS } = await import("../services/twilio");
                        const tmpl = smsTmpl || DEFAULT_TEMPLATES.cancelled_sms;
                        await sendSMS(
                          cleaner.phone,
                          renderTemplate(tmpl.body, shortCodeData),
                        );
                      } catch (e) {
                        logger.error(
                          "Webhook",
                          "Failed to send cancellation SMS:",
                          e,
                        );
                      }
                    }
                    logger.info(
                      "Webhook",
                      `Notified cleaner ${cleaner.name} about cancelled reservation ${existingReservation.id}`,
                    );
                  } else if (event === "reservation.changed") {
                    if (checkOutDate) {
                      const newScheduledDate = new Date(checkOutDate);
                      const oldScheduledDate = new Date(ct.scheduledDate);
                      if (
                        newScheduledDate.toDateString() !==
                        oldScheduledDate.toDateString()
                      ) {
                        await storage.updateCleaningTask(ct.id, {
                          scheduledDate: newScheduledDate,
                          reminderSentAt: null,
                        });
                        shortCodeData.scheduled_date =
                          newScheduledDate.toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          });
                      }
                    }

                    const emailTmpl = await storage.getNotificationTemplate(
                      ct.workspaceId,
                      "changed_email",
                    );
                    const smsTmpl = await storage.getNotificationTemplate(
                      ct.workspaceId,
                      "changed_sms",
                    );

                    if (cleaner.notifyByEmail && cleaner.email) {
                      const tmpl = emailTmpl || DEFAULT_TEMPLATES.changed_email;
                      await sendTemplatedEmail({
                        toEmail: cleaner.email,
                        subject:
                          tmpl.subject ||
                          DEFAULT_TEMPLATES.changed_email.subject,
                        body: tmpl.body,
                        shortCodeData,
                      }).catch((e) =>
                        logger.error(
                          "Webhook",
                          "Failed to send change email:",
                          e,
                        ),
                      );
                    }
                    if (cleaner.notifyBySms && cleaner.phone) {
                      try {
                        const { sendSMS } = await import("../services/twilio");
                        const tmpl = smsTmpl || DEFAULT_TEMPLATES.changed_sms;
                        await sendSMS(
                          cleaner.phone,
                          renderTemplate(tmpl.body, shortCodeData),
                        );
                      } catch (e) {
                        logger.error(
                          "Webhook",
                          "Failed to send change SMS:",
                          e,
                        );
                      }
                    }
                    logger.info(
                      "Webhook",
                      `Notified cleaner ${cleaner.name} about changed reservation ${existingReservation.id}`,
                    );
                  }
                }
              }
            } catch (notifyError) {
              logger.error(
                "Webhook",
                "Error notifying cleaners about reservation change:",
                notifyError,
              );
            }
          } else if (listing && event !== "reservation.cancelled") {
            const guestName = resData.guest
              ? [resData.guest.first_name, resData.guest.last_name]
                  .filter(Boolean)
                  .join(" ") || resData.guest.first_name
              : "Unknown Guest";

            const platform = resData.platform
              ? resData.platform.charAt(0).toUpperCase() +
                resData.platform.slice(1)
              : "Airbnb";

            const newReservation = await storage.createReservation({
              userId: listing.userId,
              listingId: listing.id,
              workspaceId: listing.workspaceId || "",
              externalId: resData.id,
              guestName: guestName || "Unknown Guest",
              guestEmail: resData.guest?.email || null,
              guestProfilePicture:
                resData.guest?.profile_picture ||
                resData.guest?.picture_url ||
                null,
              guestLocation: resData.guest?.location || null,
              checkInDate: checkInDate || new Date(),
              checkOutDate: checkOutDate || new Date(),
              status: derivedStatus,
              platform: platform,
              confirmationCode: confirmationCode,
              guestCount: resData.guests?.total || null,
            });
            logger.info(
              "Webhook",
              `Created reservation: ${newReservation.id} from webhook (guest: ${guestName}, platform: ${platform})`,
            );
            logReservationId = newReservation.id;

            const newResAcceptedStatuses = ["accepted", "confirmed", "new"];
            if (
              checkOutDate &&
              listing.workspaceId &&
              newResAcceptedStatuses.includes(derivedStatus)
            ) {
              try {
                const assignments = await storage.getAssignmentsByListing(
                  listing.id,
                );
                const activeAssignments = assignments.filter((a) => a.isActive);
                if (activeAssignments.length > 0) {
                  const assignment = activeAssignments[0];
                  const accessToken = crypto.randomBytes(32).toString("hex");

                  const newResTaskData: any = {
                    workspaceId: listing.workspaceId,
                    cleanerId: assignment.cleanerId,
                    listingId: listing.id,
                    reservationId: newReservation.id,
                    assignmentId: assignment.id,
                    procedureId: assignment.procedureId,
                    scheduledDate: checkOutDate,
                    guestName: guestName || "Unknown Guest",
                    status: "scheduled",
                    accessToken,
                  };
                  if (
                    assignment.assignmentMode === "auto" &&
                    assignment.defaultMemberId
                  ) {
                    newResTaskData.assignedMemberId =
                      assignment.defaultMemberId;
                  }
                  const task = await storage.createCleaningTask(newResTaskData);

                  if (assignment.procedureId) {
                    const procedureWithSteps =
                      await storage.getProcedureWithSteps(
                        assignment.procedureId,
                      );
                    if (
                      procedureWithSteps &&
                      procedureWithSteps.steps.length > 0
                    ) {
                      const items = procedureWithSteps.steps.map((step) => ({
                        cleaningTaskId: task.id,
                        stepOrder: step.stepOrder,
                        label: step.label,
                        description: step.description,
                        moduleTitle: step.moduleTitle,
                        moduleOrder: step.moduleOrder,
                        requiresPhotoVerification:
                          step.requiresPhotoVerification,
                        photoVerificationMode:
                          step.photoVerificationMode ||
                          (step.requiresPhotoVerification
                            ? "required"
                            : "none"),
                        requiresGpsVerification: step.requiresGpsVerification,
                      }));
                      await storage.createCleaningTaskItems(items);
                    }
                  }
                  logger.info(
                    "Webhook",
                    `Auto-generated cleaning task ${task.id} for new reservation ${newReservation.id} via webhook`,
                  );
                }
              } catch (autoGenError) {
                logger.error(
                  "Webhook",
                  "Error auto-generating cleaning task for new reservation:",
                  autoGenError,
                );
              }
            }
          } else {
            logger.info(
              "Webhook",
              `Skipped reservation webhook - listing not found for property: ${propertyId || listingPlatformId}`,
            );
          }

          await storage.createWebhookLog({
            source: "hospitable",
            eventType: event,
            status: "success",
            statusCode: 200,
            payload: req.body,
            reservationId: logReservationId,
            listingId: logListingId,
            workspaceId: logWorkspaceId,
            processingTimeMs: Date.now() - startTime,
          });
          return res
            .status(200)
            .json({ message: `Reservation ${event.split(".")[1]} processed` });
        }

        // ========== PROPERTY EVENTS ==========
        case "property.created":
        case "property.changed":
        case "property.deleted":
        case "property.merged": {
          const parseResult = hospitablePropertyWebhookSchema.safeParse(
            req.body,
          );
          if (!parseResult.success) {
            logger.error(
              "Webhook",
              "Invalid property webhook payload:",
              parseResult.error,
            );
            await storage.createWebhookLog({
              source: "hospitable",
              eventType: event,
              status: "error",
              statusCode: 400,
              payload: req.body,
              errorMessage: `Invalid payload: ${parseResult.error.message}`,
              processingTimeMs: Date.now() - startTime,
            });
            return res
              .status(400)
              .json({ message: "Invalid property webhook payload" });
          }

          const { property, merged_into } = parseResult.data.data;
          const propertyId = property?.id;

          const existingListing = propertyId
            ? await storage.findListingByExternalId(propertyId)
            : null;

          logListingId = existingListing?.id;
          logWorkspaceId = existingListing?.workspaceId || undefined;

          if (event === "property.created") {
            if (existingListing) {
              await storage.updateListing(existingListing.id, {
                webhookStatus: "pending_sync",
                webhookPendingData: req.body,
              });
              logger.info(
                "Webhook",
                `Property ${propertyId} marked for sync review (already exists)`,
              );
            } else if (property) {
              const userEmail = parseResult.data.data.user?.email;
              let targetWorkspaceId: string | undefined;
              let targetUserId: string | undefined;

              if (userEmail) {
                const user = await storage.getUserByEmail(userEmail);
                if (user) {
                  targetUserId = user.id;
                  const memberships = await storage.getWorkspaceMemberships(
                    user.id,
                  );
                  if (memberships.length > 0) {
                    const defaultMembership =
                      memberships.find((m) => m.isDefault) || memberships[0];
                    targetWorkspaceId = defaultMembership.workspaceId;
                  }
                }
              }

              if (targetWorkspaceId && targetUserId) {
                let addressStr = "";
                if (property.address) {
                  if (typeof property.address === "string") {
                    addressStr = property.address;
                  } else {
                    const parts = [
                      property.address.number,
                      property.address.street,
                      property.address.city,
                      property.address.state,
                      property.address.country,
                    ].filter(Boolean);
                    addressStr = property.address.display || parts.join(", ");
                  }
                }

                const airbnbListing = property.listings?.find(
                  (l) => l.platform === "airbnb",
                );

                const newListing = await storage.createListing({
                  userId: targetUserId,
                  workspaceId: targetWorkspaceId,
                  externalId: property.id,
                  name: property.name || "Unnamed Property",
                  publicName: property.public_name || property.name,
                  address: addressStr,
                  picture: property.picture,
                  propertyType: property.property_type,
                  bedrooms: property.bedrooms,
                  bathrooms: property.bathrooms,
                  maxGuests: property.capacity?.max_guests,
                  timezone: property.timezone,
                  currency: property.currency,
                  airbnbUrl: airbnbListing?.url,
                  webhookStatus: "pending_sync",
                  webhookPendingData: req.body,
                });

                logListingId = newListing.id;
                logWorkspaceId = targetWorkspaceId;
                logger.info(
                  "Webhook",
                  `New property ${propertyId} created with pending_sync status for user ${targetUserId}`,
                );
              } else {
                logger.info(
                  "Webhook",
                  `New property ${propertyId} received but no matching user found for email: ${userEmail}`,
                );
              }
            }
          } else if (event === "property.changed" && existingListing) {
            await storage.updateListing(existingListing.id, {
              webhookStatus: "pending_sync",
              webhookPendingData: req.body,
            });
            logger.info(
              "Webhook",
              `Property ${propertyId} has updates pending user review`,
            );
          } else if (event === "property.deleted" && existingListing) {
            await storage.updateListing(existingListing.id, {
              webhookStatus: "pending_delete",
              webhookPendingData: req.body,
            });
            logger.info(
              "Webhook",
              `Property ${propertyId} marked as pending deletion - user action required`,
            );
          } else if (event === "property.merged" && existingListing) {
            await storage.updateListing(existingListing.id, {
              webhookStatus: "pending_merge",
              webhookPendingData: { ...req.body, merged_into },
            });
            logger.info(
              "Webhook",
              `Property ${propertyId} marked as merged into ${merged_into} - user action required`,
            );
          }

          await storage.createWebhookLog({
            source: "hospitable",
            eventType: event,
            status: "success",
            statusCode: 200,
            payload: req.body,
            listingId: logListingId,
            workspaceId: logWorkspaceId,
            processingTimeMs: Date.now() - startTime,
          });
          return res
            .status(200)
            .json({ message: `Property ${event.split(".")[1]} processed` });
        }

        // ========== REVIEW EVENTS ==========
        case "review.created": {
          const parseResult = hospitableReviewWebhookSchema.safeParse(req.body);
          if (!parseResult.success) {
            logger.error(
              "Webhook",
              "Invalid review webhook payload:",
              parseResult.error,
            );
            await storage.createWebhookLog({
              source: "hospitable",
              eventType: event,
              status: "error",
              statusCode: 400,
              payload: req.body,
              errorMessage: `Invalid payload: ${parseResult.error.message}`,
              processingTimeMs: Date.now() - startTime,
            });
            return res
              .status(400)
              .json({ message: "Invalid review webhook payload" });
          }

          const { reservation_id, review } = parseResult.data.data;
          logReservationId = reservation_id;

          const reservation =
            await storage.findReservationByExternalId(reservation_id);
          if (!reservation) {
            logger.info(
              "Webhook",
              `Reservation not found for external ID: ${reservation_id}`,
            );
            await storage.createWebhookLog({
              source: "hospitable",
              eventType: event,
              status: "not_found",
              statusCode: 200,
              payload: req.body,
              errorMessage: `Reservation not found: ${reservation_id}`,
              reservationId: reservation_id,
              processingTimeMs: Date.now() - startTime,
            });
            return res.status(200).json({ message: "Reservation not found" });
          }

          logListingId = reservation.listingId;
          logWorkspaceId = reservation.workspaceId || undefined;

          const detailedRatings = review?.private?.detailed_ratings;
          const categoryRatingsData = detailedRatings
            ? Object.fromEntries(detailedRatings.map((r) => [r.type, r.rating]))
            : review?.category_ratings || reservation.categoryRatings;

          await storage.updateReservation(reservation.id, {
            publicReview:
              review?.public?.review ||
              review?.public_review ||
              reservation.publicReview,
            privateRemarks:
              review?.private?.feedback ||
              review?.private_remarks ||
              reservation.privateRemarks,
            guestRating:
              review?.public?.rating ??
              review?.rating ??
              reservation.guestRating,
            categoryRatings: categoryRatingsData as any,
            hostReply:
              review?.public?.response ||
              review?.host_reply ||
              reservation.hostReply,
            reviewPostedAt: review?.reviewed_at
              ? new Date(review.reviewed_at)
              : new Date(),
          });

          logger.info(
            "Webhook",
            `Review applied to reservation: ${reservation.id}`,
          );

          try {
            const listing = await storage.getListing(reservation.listingId);
            if (listing) {
              const updatedReservation = await storage.getReservation(
                reservation.id,
              );
              if (updatedReservation) {
                const conversationText =
                  updatedReservation.conversationHistory
                    ?.map((m) => `${m.sender}: ${m.message}`)
                    .join("\n") || "";

                const promptContent = `Analyze this guest stay and provide a comprehensive sentiment analysis.

Property: ${listing.name}
Guest: ${updatedReservation.guestName || "Guest"}
Platform: ${updatedReservation.platform}
Check-in: ${updatedReservation.checkInDate}
Check-out: ${updatedReservation.checkOutDate}

Public Review:
${updatedReservation.publicReview || "No public review provided"}

Private Remarks:
${updatedReservation.privateRemarks || "No private remarks"}

Guest Conversation:
${conversationText || "No conversation history"}

Please analyze and provide:
1. An overall AI Sentiment Score (0-5, with 0.1 increments) based on the entire stay experience
2. A Public Review Score (0-5) analyzing the tone and content of the public review
3. A Private Remarks Score (0-5) analyzing the private feedback
4. A Conversation Score (0-5) analyzing the guest communication quality
5. A brief AI Guest Summary (2-3 sentences) summarizing the overall guest experience

Respond in JSON format:
{
  "aiSentimentScore": number,
  "aiPublicReviewScore": number,
  "aiPrivateRemarksScore": number,
  "aiConversationScore": number,
  "aiGuestSummary": "string"
}`;

                const aiResponse = await openai.chat.completions.create({
                  model: "gpt-4.1-mini",
                  messages: [
                    {
                      role: "system",
                      content:
                        "You are an expert at analyzing guest reviews and sentiment for short-term rental properties. Always respond with valid JSON.",
                    },
                    { role: "user", content: promptContent },
                  ],
                  response_format: { type: "json_object" },
                  temperature: 0.3,
                });

                const analysisText =
                  aiResponse.choices[0]?.message?.content || "{}";
                const analysis = JSON.parse(analysisText);

                await storage.updateReservation(reservation.id, {
                  aiSentimentScore: analysis.aiSentimentScore,
                  aiPublicReviewScore: analysis.aiPublicReviewScore,
                  aiPrivateRemarksScore: analysis.aiPrivateRemarksScore,
                  aiConversationScore: analysis.aiConversationScore,
                  aiGuestSummary: analysis.aiGuestSummary,
                  reviewAnalyzedAt: new Date(),
                });

                await storage.createAiUsageLog({
                  userId: listing.userId,
                  label: "webhook_review_analysis",
                  model: "gpt-4.1-mini",
                  inputTokens: aiResponse.usage?.prompt_tokens || 0,
                  outputTokens: aiResponse.usage?.completion_tokens || 0,
                  estimatedCost:
                    ((aiResponse.usage?.prompt_tokens || 0) * 0.0004 +
                      (aiResponse.usage?.completion_tokens || 0) * 0.0016) /
                    1000,
                  listingId: listing.id,
                  listingName: listing.name,
                });

                logger.info(
                  "Webhook",
                  `AI Sentiment analysis completed for reservation: ${reservation.id}`,
                );
              }
            }
          } catch (aiError) {
            logger.error(
              "Webhook",
              `Failed to run AI analysis for reservation ${reservation.id}:`,
              aiError,
            );
          }

          await storage.createWebhookLog({
            source: "hospitable",
            eventType: event,
            status: "success",
            statusCode: 200,
            payload: req.body,
            reservationId: reservation.id,
            listingId: logListingId,
            workspaceId: logWorkspaceId,
            processingTimeMs: Date.now() - startTime,
          });
          return res.status(200).json({ message: "Review processed" });
        }

        // ========== MESSAGE EVENTS ==========
        case "message.created":
        case "message.updated":
        case "message.sent":
        case "message.received": {
          const parseResult = hospitableMessageWebhookSchema.safeParse(
            req.body,
          );
          if (!parseResult.success) {
            logger.error(
              "Webhook",
              "Invalid message webhook payload:",
              parseResult.error,
            );
            await storage.createWebhookLog({
              source: "hospitable",
              eventType: event,
              status: "error",
              statusCode: 400,
              payload: req.body,
              errorMessage: `Invalid payload: ${parseResult.error.message}`,
              processingTimeMs: Date.now() - startTime,
            });
            return res
              .status(400)
              .json({ message: "Invalid message webhook payload" });
          }

          const msgData = parseResult.data.data;
          logReservationId = msgData.reservation_id || undefined;

          const propertyId =
            msgData.property?.id != null ? String(msgData.property.id) : null;
          const listingPlatformId =
            msgData.listing?.platform_id != null
              ? String(msgData.listing.platform_id)
              : null;
          const platformMsgId =
            msgData.platform_id != null
              ? Number(msgData.platform_id)
              : undefined;

          let reservation = msgData.reservation_id
            ? await storage.findReservationByExternalId(msgData.reservation_id)
            : null;

          if (!reservation && msgData.conversation_id) {
            reservation = await storage.findReservationByExternalId(
              msgData.conversation_id,
            );
          }

          let matchedListing: any = null;
          if (!reservation && (propertyId || listingPlatformId)) {
            matchedListing = propertyId
              ? await storage.findListingByExternalId(propertyId)
              : listingPlatformId
                ? await storage.findListingByExternalId(listingPlatformId)
                : null;

            if (matchedListing) {
              logListingId = matchedListing.id;
              logWorkspaceId = matchedListing.workspaceId || undefined;

              const listingReservations =
                await storage.getReservationsByListing(matchedListing.id);
              if (listingReservations.length > 0) {
                const now = new Date();
                const sorted = listingReservations.sort((a, b) => {
                  const dateA = a.checkInDate
                    ? new Date(a.checkInDate).getTime()
                    : 0;
                  const dateB = b.checkInDate
                    ? new Date(b.checkInDate).getTime()
                    : 0;
                  return dateB - dateA;
                });
                reservation =
                  sorted.find((r) => {
                    if (!r.checkInDate || !r.checkOutDate) return false;
                    const checkIn = new Date(r.checkInDate);
                    const checkOut = new Date(r.checkOutDate);
                    return now >= checkIn && now <= checkOut;
                  }) || sorted[0];

                if (reservation) {
                  logger.info(
                    "Webhook",
                    `Message matched to reservation ${reservation.id} via listing ${matchedListing.id}`,
                  );
                }
              } else {
                logger.info(
                  "Webhook",
                  `Message linked to listing ${matchedListing.id} (no reservations found - inquiry message)`,
                );
              }
            }
          }

          if (reservation) {
            logListingId = reservation.listingId;
            logWorkspaceId = reservation.workspaceId || undefined;

            const existingHistory = (reservation.conversationHistory ||
              []) as Array<{
              id: string;
              sender: "guest" | "host";
              timestamp: string;
              message: string;
              platform_id?: number;
            }>;

            const normalizedSender: "guest" | "host" =
              msgData.sender_type === "guest" ? "guest" : "host";

            const existingMsgIndex = platformMsgId
              ? existingHistory.findIndex(
                  (m) => m.platform_id === platformMsgId,
                )
              : -1;

            if (event === "message.updated" && existingMsgIndex >= 0) {
              existingHistory[existingMsgIndex] = {
                ...existingHistory[existingMsgIndex],
                message:
                  msgData.body || existingHistory[existingMsgIndex].message,
                timestamp:
                  msgData.created_at ||
                  existingHistory[existingMsgIndex].timestamp,
              };

              await storage.updateReservation(reservation.id, {
                conversationHistory: existingHistory as any,
              });
              logger.info(
                "Webhook",
                `Message updated in reservation ${reservation.id} conversation history`,
              );
            } else if (
              platformMsgId &&
              existingHistory.some((m) => m.platform_id === platformMsgId)
            ) {
              logger.info(
                "Webhook",
                `Message ${platformMsgId} already exists in reservation ${reservation.id}, skipping duplicate`,
              );
            } else {
              const newMessage = {
                id: crypto.randomUUID(),
                sender: normalizedSender,
                timestamp: msgData.created_at || new Date().toISOString(),
                message: msgData.body || "",
                platform_id: platformMsgId,
              };

              const updatedHistory = [...existingHistory, newMessage];

              await storage.updateReservation(reservation.id, {
                conversationHistory: updatedHistory as any,
              });
              logger.info(
                "Webhook",
                `Message added to reservation ${reservation.id} conversation history (sender: ${normalizedSender})`,
              );
            }
          } else {
            logger.info(
              "Webhook",
              `Skipped message - no matching reservation. reservation_id: ${msgData.reservation_id || "null"}, conversation_id: ${msgData.conversation_id || "null"}, property: ${propertyId || "null"}`,
            );
          }

          await storage.createWebhookLog({
            source: "hospitable",
            eventType: event,
            status: "success",
            statusCode: 200,
            payload: req.body,
            reservationId: logReservationId,
            listingId: logListingId,
            workspaceId: logWorkspaceId,
            processingTimeMs: Date.now() - startTime,
          });
          return res.status(200).json({ message: "Message processed" });
        }

        // ========== UNKNOWN/UNSUPPORTED EVENTS ==========
        default: {
          logger.info("Webhook", `Unhandled webhook event: ${event}`);
          await storage.createWebhookLog({
            source: "hospitable",
            eventType: event,
            status: "ignored",
            statusCode: 200,
            payload: req.body,
            errorMessage: `Unsupported event type: ${event}`,
            processingTimeMs: Date.now() - startTime,
          });
          return res.status(200).json({ message: "Event not supported" });
        }
      }
    } catch (error) {
      logger.error("Webhook", "Error processing webhook:", error);
      await storage.createWebhookLog({
        source: "hospitable",
        eventType,
        status: "error",
        statusCode: 500,
        payload: req.body,
        errorMessage: error instanceof Error ? error.message : String(error),
        reservationId: logReservationId,
        listingId: logListingId,
        workspaceId: logWorkspaceId,
        processingTimeMs: Date.now() - startTime,
      });
      res.status(500).json({ message: "Failed to process webhook" });
    }
  });

  // =====================
  // Hospitable Connect Webhooks (Airbnb)
  // =====================

  app.post("/api/webhooks/hospitable-connect", async (req, res) => {
    const eventType = req.body?.action || "unknown";

    try {
      // const signature = req.headers["x-hospitable-signature"] as string;
      // const payload = JSON.stringify(req.body);

      // Verify webhook signature
      // if (!hospitable_connect.verifyWebhookSignature(payload, signature)) {
      //   logger.warn(
      //     "Webhook",
      //     `Invalid Hospitable Connect signature for event: ${eventType}`,
      //   );
      //   return res.status(401).json({ message: "Invalid signature" });
      // }

      // Only channel.activated is handled — all other events are ignored.
      if (eventType === "channel.activated") {
        await hospitable_connect.handleWebhook(req.body);
        logger.info(
          "Webhook",
          `Processed Hospitable Connect channel.activated event`,
        );
      } else {
        logger.debug(
          "Webhook",
          `Ignoring Hospitable Connect event type: ${eventType}`,
        );
      }

      res.json({ success: true });
    } catch (error) {
      logger.error(
        "Webhook",
        `Error processing Hospitable Connect webhook (${eventType}):`,
        error,
      );
      res.status(500).json({ message: "Failed to process webhook" });
    }
  });
}
