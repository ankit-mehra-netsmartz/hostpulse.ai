import { Express } from "express";
import { IStorage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import {
  getUserId,
  getWorkspaceId,
  validateWorkspaceMembership,
} from "./helpers";
import { openai } from "./ai-helpers";
import { logger } from "../logger";
import type { ReviewRemovalCase } from "@shared/schema";

function generateCaseNumber(): string {
  const prefix = "RR";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

function stripMarkdown(text: string): string {
  if (!text) return text;
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "- ")
    .replace(/`([^`]+)`/g, "$1");
}

function stripMarkdownFromAnalysis(analysis: any): any {
  if (!analysis || typeof analysis !== "object") return analysis;
  const result = { ...analysis };
  for (const key of Object.keys(result)) {
    if (typeof result[key] === "string") {
      result[key] = stripMarkdown(result[key]);
    } else if (Array.isArray(result[key])) {
      result[key] = result[key].map((item: any) => {
        if (typeof item === "string") return stripMarkdown(item);
        if (item && typeof item === "object")
          return stripMarkdownFromAnalysis(item);
        return item;
      });
    }
  }
  return result;
}

async function runCaseAnalysis(
  storage: IStorage,
  caseData: ReviewRemovalCase,
  userId: string,
  additionalContext?: string,
): Promise<{ updatedCase: ReviewRemovalCase | undefined; analysis: any }> {
  const prompt = await storage.getPromptByCategory("review_removal");
  if (!prompt) throw new Error("Review removal prompt not configured");

  const challengeHistory = (caseData.challengeHistory as any[]) || [];

  let template = prompt.promptTemplate || "";
  template = template.replace("{{stage}}", caseData.stage);
  template = template.replace("{{case_number}}", caseData.caseNumber);
  template = template.replace(
    "{{property_name}}",
    caseData.propertyName || "Unknown",
  );
  template = template.replace(
    "{{guest_name}}",
    caseData.guestName || "Unknown",
  );
  template = template.replace(
    "{{guest_rating}}",
    String(caseData.guestRating || "N/A"),
  );
  template = template.replace(
    "{{review_text}}",
    caseData.reviewText || "No review text provided",
  );
  template = template.replace(
    "{{category_ratings}}",
    JSON.stringify(caseData.categoryRatings || {}),
  );
  template = template.replace(
    "{{house_rules}}",
    caseData.houseRules || "Not provided",
  );
  template = template.replace(
    "{{guest_messages}}",
    caseData.guestMessages || "Not provided",
  );
  template = template.replace(
    "{{resolution_messages}}",
    caseData.resolutionMessages || "Not provided",
  );
  template = template.replace(
    "{{challenge_history}}",
    JSON.stringify(challengeHistory),
  );

  if (additionalContext) {
    template += `\n\nADDITIONAL CONTEXT FROM HOST:\n${additionalContext}`;
  }

  const modelId = prompt.modelId || "gpt-4.1-mini";

  const completion = await openai.chat.completions.create({
    model: modelId,
    messages: [
      { role: "system", content: prompt.systemPrompt || "" },
      { role: "user", content: template },
    ],
    response_format: { type: "json_object" },
    max_tokens: 4000,
  });

  const responseText = completion.choices[0]?.message?.content || "{}";
  const analysis = stripMarkdownFromAnalysis(JSON.parse(responseText));

  const inputTokens = completion.usage?.prompt_tokens || 0;
  const outputTokens = completion.usage?.completion_tokens || 0;
  await storage.createAiUsageLog({
    userId,
    label: `Review Removal - ${caseData.stage}`,
    model: modelId,
    inputTokens,
    outputTokens,
    estimatedCost: (inputTokens * 0.003 + outputTokens * 0.012) / 1000,
    listingId: caseData.listingId || null,
    listingName: caseData.propertyName || null,
  });

  const existingAnalysis = (caseData.aiAnalysis as any) || {};
  const updatedAnalysis = {
    ...existingAnalysis,
    [caseData.stage]: {
      ...analysis,
      analyzedAt: new Date().toISOString(),
    },
  };

  const updates: any = { aiAnalysis: updatedAnalysis };

  if (caseData.stage === "analysis" && analysis.likelihood) {
    updates.likelihood = analysis.likelihood;
    updates.likelihoodScore = analysis.likelihoodScore || null;
  }

  if (caseData.stage === "challenge_1" || caseData.stage === "challenge_2") {
    const newEntry = {
      stage: caseData.stage,
      message: analysis.challengeMessage || "",
      generatedAt: new Date().toISOString(),
      type: "draft",
    };
    updates.challengeHistory = [...challengeHistory, newEntry];
  }

  if (caseData.stage === "arbitration" && analysis.arbitrationLetter) {
    const newEntry = {
      stage: "arbitration",
      letter: analysis.arbitrationLetter,
      generatedAt: new Date().toISOString(),
      type: "draft",
    };
    updates.challengeHistory = [...challengeHistory, newEntry];
  }

  const updatedCase = await storage.updateReviewRemovalCase(
    caseData.id,
    updates,
  );
  return { updatedCase, analysis };
}

export function registerReviewRemovalRoutes(app: Express, storage: IStorage) {
  app.get(
    "/api/review-removal/bad-reviews",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        const workspaceId = getWorkspaceId(req);
        if (!workspaceId)
          return res.status(400).json({ message: "Workspace required" });
        if (!(await validateWorkspaceMembership(userId, workspaceId))) {
          return res
            .status(403)
            .json({ message: "Not a member of this workspace" });
        }

        const allReservations =
          await storage.getReservationsByWorkspace(workspaceId);
        const badReviews = allReservations.filter(
          (r) => r.guestRating != null && r.guestRating < 5 && r.publicReview,
        );

        const existingCases =
          await storage.getReviewRemovalCasesByWorkspace(workspaceId);
        const caseReservationIds = new Set(
          existingCases.map((c) => c.reservationId),
        );

        const reviewsWithCaseStatus = badReviews.map((r) => ({
          ...r,
          hasCase: caseReservationIds.has(r.id),
          existingCase:
            existingCases.find((c) => c.reservationId === r.id) || null,
        }));

        reviewsWithCaseStatus.sort((a, b) => {
          const dateA = a.reviewPostedAt
            ? new Date(a.reviewPostedAt).getTime()
            : 0;
          const dateB = b.reviewPostedAt
            ? new Date(b.reviewPostedAt).getTime()
            : 0;
          return dateB - dateA;
        });

        res.json(reviewsWithCaseStatus);
      } catch (error) {
        logger.error("ReviewRemoval", "Error fetching bad reviews:", error);
        res.status(500).json({ message: "Failed to fetch bad reviews" });
      }
    },
  );

  app.get("/api/review-removal/cases", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId)
        return res.status(400).json({ message: "Workspace required" });
      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res
          .status(403)
          .json({ message: "Not a member of this workspace" });
      }

      const cases = await storage.getReviewRemovalCasesByWorkspace(workspaceId);
      res.json(cases);
    } catch (error) {
      logger.error("ReviewRemoval", "Error fetching cases:", error);
      res.status(500).json({ message: "Failed to fetch cases" });
    }
  });

  app.get(
    "/api/review-removal/cases/:id",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        const caseData = await storage.getReviewRemovalCase(req.params.id);
        if (!caseData)
          return res.status(404).json({ message: "Case not found" });

        if (
          !(await validateWorkspaceMembership(userId, caseData.workspaceId))
        ) {
          return res
            .status(403)
            .json({ message: "Not a member of this workspace" });
        }

        let reservationDetails = null;
        if (caseData.reservationId) {
          const reservation = await storage.getReservation(
            caseData.reservationId,
          );
          if (reservation) {
            reservationDetails = {
              confirmationCode: reservation.confirmationCode,
              externalId: reservation.externalId,
              checkInDate: reservation.checkInDate,
              checkOutDate: reservation.checkOutDate,
              status: reservation.status,
              platform: reservation.platform,
              guestEmail: reservation.guestEmail,
              guestLocation: reservation.guestLocation,
              guestProfilePicture: reservation.guestProfilePicture,
              privateRemarks: reservation.privateRemarks,
              hostReply: reservation.hostReply,
            };
          }
        }

        res.json({ ...caseData, reservationDetails });
      } catch (error) {
        logger.error("ReviewRemoval", "Error fetching case:", error);
        res.status(500).json({ message: "Failed to fetch case" });
      }
    },
  );

  app.post("/api/review-removal/cases", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId)
        return res.status(400).json({ message: "Workspace required" });
      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res
          .status(403)
          .json({ message: "Not a member of this workspace" });
      }

      const { reservationId } = req.body;
      if (!reservationId)
        return res.status(400).json({ message: "Reservation ID required" });

      const existing =
        await storage.getReviewRemovalCaseByReservation(reservationId);
      if (existing)
        return res
          .status(400)
          .json({
            message: "Case already exists for this reservation",
            case: existing,
          });

      const reservation = await storage.getReservation(reservationId);
      if (!reservation)
        return res.status(404).json({ message: "Reservation not found" });

      let propertyName = "";
      let houseRulesText = "";
      if (reservation.listingId) {
        const listing = await storage.getListing(reservation.listingId);
        propertyName = listing?.name || "";
        if (listing) {
          const ruleParts: string[] = [];
          if (listing.houseRules) {
            const rules = listing.houseRules as Record<string, boolean>;
            const ruleLabels: Record<string, string> = {
              pets_allowed: "Pets allowed",
              smoking_allowed: "Smoking allowed",
              events_allowed: "Events allowed",
              children_allowed: "Children allowed",
            };
            for (const [key, label] of Object.entries(ruleLabels)) {
              if (rules[key] !== undefined) {
                ruleParts.push(`${label}: ${rules[key] ? "Yes" : "No"}`);
              }
            }
          }
          if (listing.additionalRules) {
            ruleParts.push(`Additional rules: ${listing.additionalRules}`);
          }
          if (listing.houseManual) {
            ruleParts.push(`House manual: ${listing.houseManual}`);
          }
          houseRulesText = ruleParts.join("\n");
        }
      }

      let guestMessagesText = "";
      if (
        reservation.conversationHistory &&
        Array.isArray(reservation.conversationHistory)
      ) {
        guestMessagesText = reservation.conversationHistory
          .map((msg: any) => {
            const sender = msg.sender || msg.role || "Unknown";
            const timestamp = msg.sentAt || msg.timestamp || "";
            const body = msg.body || msg.message || msg.content || "";
            return `[${sender}${timestamp ? ` - ${timestamp}` : ""}]: ${body}`;
          })
          .join("\n\n");
      }

      const newCase = await storage.createReviewRemovalCase({
        workspaceId,
        reservationId,
        listingId: reservation.listingId || null,
        userId,
        caseNumber: generateCaseNumber(),
        guestName: reservation.guestName || null,
        propertyName: propertyName || null,
        reviewText: reservation.publicReview || null,
        guestRating: reservation.guestRating || null,
        categoryRatings: reservation.categoryRatings || null,
        houseRules: houseRulesText || null,
        guestMessages: guestMessagesText || null,
        stage: "analysis",
        status: "open",
      });

      try {
        const { updatedCase, analysis } = await runCaseAnalysis(
          storage,
          newCase,
          userId,
        );
        res.json({ case: updatedCase, analysis, autoAnalyzed: true });
      } catch (analysisError) {
        logger.error(
          "ReviewRemoval",
          "Auto-analysis failed, returning case without analysis:",
          analysisError,
        );
        res.json({ case: newCase, autoAnalyzed: false });
      }
    } catch (error) {
      logger.error("ReviewRemoval", "Error creating case:", error);
      res.status(500).json({ message: "Failed to create case" });
    }
  });

  app.patch(
    "/api/review-removal/cases/:id",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        const caseData = await storage.getReviewRemovalCase(req.params.id);
        if (!caseData)
          return res.status(404).json({ message: "Case not found" });

        if (
          !(await validateWorkspaceMembership(userId, caseData.workspaceId))
        ) {
          return res
            .status(403)
            .json({ message: "Not a member of this workspace" });
        }

        const allowedFields = [
          "houseRules",
          "guestMessages",
          "resolutionMessages",
          "status",
          "stage",
          "challengeHistory",
        ];
        const updates: any = {};
        for (const field of allowedFields) {
          if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
          }
        }

        if (
          updates.status === "won" ||
          updates.status === "lost" ||
          updates.status === "abandoned"
        ) {
          updates.stage = "resolved";
        }

        const updated = await storage.updateReviewRemovalCase(
          req.params.id,
          updates,
        );
        res.json(updated);
      } catch (error) {
        logger.error("ReviewRemoval", "Error updating case:", error);
        res.status(500).json({ message: "Failed to update case" });
      }
    },
  );

  app.delete(
    "/api/review-removal/cases/:id",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        const caseData = await storage.getReviewRemovalCase(req.params.id);
        if (!caseData)
          return res.status(404).json({ message: "Case not found" });

        if (
          !(await validateWorkspaceMembership(userId, caseData.workspaceId))
        ) {
          return res
            .status(403)
            .json({ message: "Not a member of this workspace" });
        }

        const deleted = await storage.deleteReviewRemovalCase(req.params.id);
        if (!deleted)
          return res.status(500).json({ message: "Failed to delete case" });

        res.json({ success: true });
      } catch (error) {
        logger.error("ReviewRemoval", "Error deleting case:", error);
        res.status(500).json({ message: "Failed to delete case" });
      }
    },
  );

  app.post(
    "/api/review-removal/cases/:id/save-draft",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        const caseData = await storage.getReviewRemovalCase(req.params.id);
        if (!caseData)
          return res.status(404).json({ message: "Case not found" });

        if (
          !(await validateWorkspaceMembership(userId, caseData.workspaceId))
        ) {
          return res
            .status(403)
            .json({ message: "Not a member of this workspace" });
        }

        const { text, stage: entryStage } = req.body;
        if (!text || typeof text !== "string" || !text.trim()) {
          return res.status(400).json({ message: "Text is required" });
        }

        const stageKey = entryStage || caseData.stage;
        const validStages = ["challenge_1", "challenge_2", "arbitration"];
        if (!validStages.includes(stageKey)) {
          return res
            .status(400)
            .json({
              message:
                "Can only save submissions for challenge or arbitration stages",
            });
        }

        const challengeHistory = (caseData.challengeHistory as any[]) || [];
        const isArbitration = stageKey === "arbitration";

        const newEntry: any = {
          stage: stageKey,
          savedAt: new Date().toISOString(),
          type: "submitted",
        };
        if (isArbitration) {
          newEntry.letter = text;
        } else {
          newEntry.message = text;
        }

        const updated = await storage.updateReviewRemovalCase(caseData.id, {
          challengeHistory: [...challengeHistory, newEntry],
        });
        res.json(updated);
      } catch (error) {
        logger.error("ReviewRemoval", "Error saving draft:", error);
        res.status(500).json({ message: "Failed to save draft" });
      }
    },
  );

  app.post(
    "/api/review-removal/cases/:id/analyze",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        const caseData = await storage.getReviewRemovalCase(req.params.id);
        if (!caseData)
          return res.status(404).json({ message: "Case not found" });

        if (
          !(await validateWorkspaceMembership(userId, caseData.workspaceId))
        ) {
          return res
            .status(403)
            .json({ message: "Not a member of this workspace" });
        }

        const { additionalContext } = req.body || {};
        const { updatedCase, analysis } = await runCaseAnalysis(
          storage,
          caseData,
          userId,
          additionalContext,
        );
        res.json({ case: updatedCase, analysis });
      } catch (error) {
        logger.error("ReviewRemoval", "Error analyzing case:", error);
        res.status(500).json({ message: "Failed to analyze case" });
      }
    },
  );

  app.post(
    "/api/review-removal/cases/:id/revise",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        const caseData = await storage.getReviewRemovalCase(req.params.id);
        if (!caseData)
          return res.status(404).json({ message: "Case not found" });

        if (
          !(await validateWorkspaceMembership(userId, caseData.workspaceId))
        ) {
          return res
            .status(403)
            .json({ message: "Not a member of this workspace" });
        }

        const { currentText, userFeedback } = req.body;
        if (!currentText || !userFeedback) {
          return res
            .status(400)
            .json({ message: "Current text and feedback are required" });
        }

        const prompt = await storage.getPromptByCategory("review_removal");
        const modelId = prompt?.modelId || "gpt-4.1-mini";

        const completion = await openai.chat.completions.create({
          model: modelId,
          messages: [
            {
              role: "system",
              content:
                'You are an expert at writing Airbnb review challenge messages. The user will give you a draft challenge message and their feedback on what to change. Revise the message according to their feedback while maintaining a professional tone and keeping any policy citations and factual arguments intact.\n\nCRITICAL FORMATTING RULE: NEVER use markdown formatting in your output. No **, no ##, no *, no bold, no italics, no headers. Write in plain professional prose with numbered lists where needed. The text will be copy-pasted directly into Airbnb\'s dispute form and must read as if a human host wrote it — not an AI.\n\nCHARACTER LIMIT: The revised text MUST be under 2,500 characters total (including spaces and line breaks). This is Airbnb\'s form character limit.\n\nReturn JSON with a single field: { "revisedText": "..." }',
            },
            {
              role: "user",
              content: `Here is the current challenge message:\n\n${currentText}\n\nHere is my feedback on what to change:\n\n${userFeedback}\n\nPlease revise the message based on my feedback.`,
            },
          ],
          response_format: { type: "json_object" },
          max_tokens: 4000,
        });

        const responseText = completion.choices[0]?.message?.content || "{}";
        const result = JSON.parse(responseText);

        const inputTokens = completion.usage?.prompt_tokens || 0;
        const outputTokens = completion.usage?.completion_tokens || 0;
        await storage.createAiUsageLog({
          userId,
          label: `Review Removal - Revise ${caseData.stage}`,
          model: modelId,
          inputTokens,
          outputTokens,
          estimatedCost: (inputTokens * 0.003 + outputTokens * 0.012) / 1000,
          listingId: caseData.listingId || null,
          listingName: caseData.propertyName || null,
        });

        res.json({
          revisedText: stripMarkdown(result.revisedText || currentText),
        });
      } catch (error) {
        logger.error("ReviewRemoval", "Error revising challenge:", error);
        res.status(500).json({ message: "Failed to revise challenge" });
      }
    },
  );

  app.post(
    "/api/review-removal/cases/:id/advance",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        const caseData = await storage.getReviewRemovalCase(req.params.id);
        if (!caseData)
          return res.status(404).json({ message: "Case not found" });

        if (
          !(await validateWorkspaceMembership(userId, caseData.workspaceId))
        ) {
          return res
            .status(403)
            .json({ message: "Not a member of this workspace" });
        }

        const stageOrder = [
          "analysis",
          "challenge_1",
          "challenge_2",
          "arbitration",
          "resolved",
        ];
        const currentIndex = stageOrder.indexOf(caseData.stage);
        if (currentIndex === -1 || currentIndex >= stageOrder.length - 1) {
          return res
            .status(400)
            .json({ message: "Cannot advance from current stage" });
        }

        const nextStage = stageOrder[currentIndex + 1];
        const updates: any = { stage: nextStage };

        if (nextStage === "resolved" || req.body.outcome) {
          updates.status = req.body.outcome || "won";
          updates.stage = "resolved";
        }

        const updated = await storage.updateReviewRemovalCase(
          req.params.id,
          updates,
        );
        res.json(updated);
      } catch (error) {
        logger.error("ReviewRemoval", "Error advancing case:", error);
        res.status(500).json({ message: "Failed to advance case" });
      }
    },
  );
}
