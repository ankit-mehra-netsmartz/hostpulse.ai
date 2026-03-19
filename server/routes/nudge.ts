// Nudge Routes - AI-powered SMS conversations for guest feedback
import { Express } from "express";
import { IStorage } from "../storage";
import { sendSMS } from "../services/twilio";
import {
  getUserId,
  getWorkspaceId,
  validateWorkspaceMembership,
} from "./helpers";
import OpenAI from "openai";
import { config } from "../config";
import { logger } from "../logger";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  nudgeCampaigns,
  nudgeConversations,
  nudgeMessages,
  insertNudgeCampaignSchema,
  insertNudgeConversationSchema,
} from "@shared/schema";
import { db } from "../db";
import crypto from "crypto";

function getOpenAIClient(): OpenAI | null {
  try {
    return new OpenAI();
  } catch (error) {
    logger.error("Nudge", "OpenAI client not available:", error);
    return null;
  }
}

function validateTwilioSignature(req: any, authToken: string): boolean {
  const twilioSignature = req.headers["x-twilio-signature"];
  if (!twilioSignature) return false;

  const url = `https://${req.headers.host}${req.originalUrl}`;
  const params = req.body;

  let data = url;
  Object.keys(params)
    .sort()
    .forEach((key) => {
      data += key + params[key];
    });

  const expectedSignature = crypto
    .createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");

  return crypto.timingSafeEqual(
    Buffer.from(twilioSignature),
    Buffer.from(expectedSignature),
  );
}

async function generateAIResponse(
  conversation: any,
  campaign: any,
  guestMessage: string,
): Promise<string> {
  const openai = getOpenAIClient();
  if (!openai) {
    return "Thank you for sharing that feedback! We really appreciate you taking the time to let us know.";
  }

  try {
    const messages = conversation.messages || [];

    const systemPrompt =
      campaign.aiInstructions ||
      "You are a friendly host assistant collecting feedback from a recent guest. Be warm, empathetic, and conversational.";

    const conversationHistory = messages.map((m: any) => ({
      role: m.direction === "outbound" ? "assistant" : "user",
      content: m.content,
    }));

    conversationHistory.push({ role: "user", content: guestMessage });

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    return (
      response.choices[0]?.message?.content || "Thank you for your feedback!"
    );
  } catch (error) {
    logger.error("Nudge", "Error generating AI response:", error);
    return "Thank you for sharing that! We appreciate your feedback.";
  }
}

async function analyzeFeedback(
  messages: any[],
): Promise<{ summary: string; sentiment: string }> {
  const guestMessages = messages
    .filter((m: any) => m.direction === "inbound")
    .map((m: any) => m.content)
    .join("\n");

  if (!guestMessages) {
    return { summary: "", sentiment: "neutral" };
  }

  const openai = getOpenAIClient();
  if (!openai) {
    return { summary: "Feedback collected from guest.", sentiment: "neutral" };
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `Analyze the following guest feedback messages and provide:
1. A brief summary (2-3 sentences) of their feedback
2. The overall sentiment: "positive", "neutral", or "negative"

Respond in JSON format: {"summary": "...", "sentiment": "..."}
`,
        },
        { role: "user", content: guestMessages },
      ],
      response_format: { type: "json_object" },
      max_tokens: 200,
    });

    const result = JSON.parse(response.choices[0]?.message?.content || "{}");
    return {
      summary: result.summary || "",
      sentiment: result.sentiment || "neutral",
    };
  } catch (error) {
    logger.error("Nudge", "Error analyzing feedback:", error);
    return { summary: "Feedback collected from guest.", sentiment: "neutral" };
  }
}

export function registerNudgeRoutes(app: Express, storage: IStorage) {
  // Get all campaigns for workspace
  app.get("/api/nudge/campaigns", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const userId = getUserId(req);
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace ID required" });
    }

    // Validate user has access to this workspace
    const hasAccess = await validateWorkspaceMembership(userId, workspaceId);
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied to this workspace" });
    }

    try {
      const campaigns = await db
        .select()
        .from(nudgeCampaigns)
        .where(eq(nudgeCampaigns.workspaceId, workspaceId))
        .orderBy(desc(nudgeCampaigns.createdAt));

      // Get stats for each campaign
      const campaignsWithStats = await Promise.all(
        campaigns.map(async (campaign) => {
          const conversations = await db
            .select()
            .from(nudgeConversations)
            .where(eq(nudgeConversations.campaignId, campaign.id));

          return {
            ...campaign,
            totalConversations: conversations.length,
            activeConversations: conversations.filter(
              (c) => c.status === "active",
            ).length,
            completedConversations: conversations.filter(
              (c) => c.status === "completed",
            ).length,
            positiveCount: conversations.filter(
              (c) => c.sentiment === "positive",
            ).length,
            neutralCount: conversations.filter((c) => c.sentiment === "neutral")
              .length,
            negativeCount: conversations.filter(
              (c) => c.sentiment === "negative",
            ).length,
          };
        }),
      );

      res.json(campaignsWithStats);
    } catch (error: any) {
      logger.error("Nudge", "Error fetching campaigns:", error);
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  });

  // Create a new campaign
  app.post("/api/nudge/campaigns", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const userId = getUserId(req);
      const workspaceId = req.body.workspaceId;

      // Validate user has access to this workspace
      const hasAccess = await validateWorkspaceMembership(userId, workspaceId);
      if (!hasAccess) {
        return res
          .status(403)
          .json({ error: "Access denied to this workspace" });
      }

      const data = {
        ...req.body,
        userId,
      };

      const parsed = insertNudgeCampaignSchema.parse(data);

      const [campaign] = await db
        .insert(nudgeCampaigns)
        .values(parsed)
        .returning();

      res.json(campaign);
    } catch (error: any) {
      logger.error("Nudge", "Error creating campaign:", error);
      res.status(500).json({ error: "Failed to create campaign" });
    }
  });

  // Update a campaign
  app.patch("/api/nudge/campaigns/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);

      // Verify campaign belongs to user's workspace
      const [existingCampaign] = await db
        .select()
        .from(nudgeCampaigns)
        .where(eq(nudgeCampaigns.id, req.params.id));

      if (!existingCampaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const hasAccess = await validateWorkspaceMembership(
        userId,
        existingCampaign.workspaceId,
      );
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Only allow updating safe fields (prevent mass assignment)
      const allowedFields = [
        "name",
        "description",
        "status",
        "aiInstructions",
        "maxMessages",
        "initialMessage",
      ] as const;
      const safeUpdate: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          safeUpdate[field] = req.body[field];
        }
      }

      const [campaign] = await db
        .update(nudgeCampaigns)
        .set({
          ...safeUpdate,
          updatedAt: new Date(),
        })
        .where(eq(nudgeCampaigns.id, req.params.id))
        .returning();

      res.json(campaign);
    } catch (error: any) {
      logger.error("Nudge", "Error updating campaign:", error);
      res.status(500).json({ error: "Failed to update campaign" });
    }
  });

  // Delete a campaign
  app.delete("/api/nudge/campaigns/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const userId = getUserId(req);

      // Verify campaign belongs to user's workspace
      const [existingCampaign] = await db
        .select()
        .from(nudgeCampaigns)
        .where(eq(nudgeCampaigns.id, req.params.id));

      if (!existingCampaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const hasAccess = await validateWorkspaceMembership(
        userId,
        existingCampaign.workspaceId,
      );
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Delete all messages first
      const conversations = await db
        .select({ id: nudgeConversations.id })
        .from(nudgeConversations)
        .where(eq(nudgeConversations.campaignId, req.params.id));

      for (const conv of conversations) {
        await db
          .delete(nudgeMessages)
          .where(eq(nudgeMessages.conversationId, conv.id));
      }

      // Delete all conversations
      await db
        .delete(nudgeConversations)
        .where(eq(nudgeConversations.campaignId, req.params.id));

      // Delete the campaign
      await db
        .delete(nudgeCampaigns)
        .where(eq(nudgeCampaigns.id, req.params.id));

      res.json({ success: true });
    } catch (error: any) {
      logger.error("Nudge", "Error deleting campaign:", error);
      res.status(500).json({ error: "Failed to delete campaign" });
    }
  });

  // Get conversations for a campaign
  app.get("/api/nudge/conversations", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const campaignId = req.query.campaignId as string;
    if (!campaignId) {
      return res.status(400).json({ error: "Campaign ID required" });
    }

    try {
      const userId = getUserId(req);

      // Verify campaign belongs to user's workspace
      const [campaign] = await db
        .select()
        .from(nudgeCampaigns)
        .where(eq(nudgeCampaigns.id, campaignId));

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const hasAccess = await validateWorkspaceMembership(
        userId,
        campaign.workspaceId,
      );
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const conversations = await db
        .select()
        .from(nudgeConversations)
        .where(eq(nudgeConversations.campaignId, campaignId))
        .orderBy(desc(nudgeConversations.createdAt));

      res.json(conversations);
    } catch (error: any) {
      logger.error("Nudge", "Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get a single conversation with messages
  app.get("/api/nudge/conversations/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const userId = getUserId(req);

      const [conversation] = await db
        .select()
        .from(nudgeConversations)
        .where(eq(nudgeConversations.id, req.params.id));

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Verify access to workspace
      const hasAccess = await validateWorkspaceMembership(
        userId,
        conversation.workspaceId,
      );
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const messages = await db
        .select()
        .from(nudgeMessages)
        .where(eq(nudgeMessages.conversationId, req.params.id))
        .orderBy(nudgeMessages.createdAt);

      res.json({ ...conversation, messages });
    } catch (error: any) {
      logger.error("Nudge", "Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // Delete a conversation
  app.delete("/api/nudge/conversations/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const userId = getUserId(req);

      // Get the conversation
      const [conversation] = await db
        .select()
        .from(nudgeConversations)
        .where(eq(nudgeConversations.id, req.params.id));

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Verify user has access to workspace
      const hasAccess = await validateWorkspaceMembership(
        userId,
        conversation.workspaceId,
      );
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Delete messages first
      await db
        .delete(nudgeMessages)
        .where(eq(nudgeMessages.conversationId, req.params.id));

      // Delete conversation
      await db
        .delete(nudgeConversations)
        .where(eq(nudgeConversations.id, req.params.id));

      res.json({ message: "Conversation deleted" });
    } catch (error: any) {
      logger.error("Nudge", "Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Start a new conversation (send initial message)
  app.post("/api/nudge/conversations", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const userId = getUserId(req);
      const {
        campaignId,
        guestName,
        guestPhone,
        listingId,
        listingName,
        workspaceId,
      } = req.body;

      // Verify user has access to workspace
      const hasAccess = await validateWorkspaceMembership(userId, workspaceId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get the campaign
      const [campaign] = await db
        .select()
        .from(nudgeCampaigns)
        .where(eq(nudgeCampaigns.id, campaignId));

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Verify campaign belongs to same workspace
      if (campaign.workspaceId !== workspaceId) {
        return res
          .status(403)
          .json({ error: "Campaign does not belong to this workspace" });
      }

      // Create the conversation
      const [conversation] = await db
        .insert(nudgeConversations)
        .values({
          campaignId,
          workspaceId,
          guestName,
          guestPhone,
          listingId,
          listingName,
          status: "active",
          startedAt: new Date(),
          messageCount: 1,
        })
        .returning();

      // Prepare initial message with placeholders replaced (support both old and new formats)
      let initialMessage = campaign.initialMessage
        // New shortcode format
        .replace(/%guest_name/g, guestName?.split(" ")[0] || "Guest")
        .replace(/%guest_full_name/g, guestName || "Guest")
        .replace(/%property_name/g, listingName || "our property")
        .replace(/%host_name/g, "Host")
        .replace(
          /%checkout_date/g,
          new Date().toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
        )
        .replace(/%nights_stayed/g, "3")
        // Legacy format for backwards compatibility
        .replace(/{guestName}/g, guestName || "Guest")
        .replace(/{propertyName}/g, listingName || "our property");

      // Send SMS via Twilio
      const smsResult = await sendSMS(guestPhone, initialMessage);

      // Record the message
      const [message] = await db
        .insert(nudgeMessages)
        .values({
          conversationId: conversation.id,
          direction: "outbound",
          content: initialMessage,
          twilioMessageId: smsResult.messageId,
          status: smsResult.success ? "sent" : "failed",
          errorMessage: smsResult.error,
        })
        .returning();

      res.json({ ...conversation, messages: [message] });
    } catch (error: any) {
      logger.error("Nudge", "Error starting conversation:", error);
      res.status(500).json({ error: "Failed to start conversation" });
    }
  });

  // Send a manual message in a conversation
  app.post("/api/nudge/conversations/:id/send", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const userId = getUserId(req);
      const { content } = req.body;
      const conversationId = req.params.id;

      // Get the conversation
      const [conversation] = await db
        .select()
        .from(nudgeConversations)
        .where(eq(nudgeConversations.id, conversationId));

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Verify access to workspace
      const hasAccess = await validateWorkspaceMembership(
        userId,
        conversation.workspaceId,
      );
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Send SMS
      const smsResult = await sendSMS(conversation.guestPhone, content);

      // Record the message
      const [message] = await db
        .insert(nudgeMessages)
        .values({
          conversationId,
          direction: "outbound",
          content,
          twilioMessageId: smsResult.messageId,
          status: smsResult.success ? "sent" : "failed",
          errorMessage: smsResult.error,
        })
        .returning();

      // Update message count
      await db
        .update(nudgeConversations)
        .set({
          messageCount: (conversation.messageCount || 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(nudgeConversations.id, conversationId));

      res.json(message);
    } catch (error: any) {
      logger.error("Nudge", "Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Twilio webhook for incoming SMS
  app.post("/api/webhooks/twilio/sms", async (req, res) => {
    try {
      // Validate Twilio webhook signature if auth token is available
      const twilioAuthToken = config.twilio.authToken;
      if (!twilioAuthToken) {
        logger.error(
          "Twilio Webhook",
          "TWILIO_AUTH_TOKEN not set - cannot verify webhook signature",
        );
        return res
          .status(500)
          .send("Webhook signature verification unavailable");
      }
      const isValid = validateTwilioSignature(req, twilioAuthToken);
      if (!isValid) {
        logger.error("Twilio Webhook", "Invalid signature - rejecting request");
        return res.status(403).send("Forbidden");
      }

      const { From, Body } = req.body;

      logger.info("Twilio Webhook", "Incoming SMS from:", From, "Body:", Body);

      // Find active conversation with this phone number
      const [conversation] = await db
        .select()
        .from(nudgeConversations)
        .where(
          and(
            eq(nudgeConversations.guestPhone, From),
            eq(nudgeConversations.status, "active"),
          ),
        )
        .orderBy(desc(nudgeConversations.updatedAt))
        .limit(1);

      if (!conversation) {
        logger.info(
          "Twilio Webhook",
          "No active conversation found for:",
          From,
        );
        // Still respond with 200 to acknowledge receipt
        return res
          .status(200)
          .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }

      // Record the incoming message
      await db.insert(nudgeMessages).values({
        conversationId: conversation.id,
        direction: "inbound",
        content: Body,
        status: "delivered",
      });

      // Update message count
      await db
        .update(nudgeConversations)
        .set({
          messageCount: (conversation.messageCount || 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(nudgeConversations.id, conversation.id));

      // Get the campaign for AI instructions
      const [campaign] = await db
        .select()
        .from(nudgeCampaigns)
        .where(eq(nudgeCampaigns.id, conversation.campaignId));

      if (!campaign) {
        return res
          .status(200)
          .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }

      // Get all messages for this conversation
      const messages = await db
        .select()
        .from(nudgeMessages)
        .where(eq(nudgeMessages.conversationId, conversation.id))
        .orderBy(nudgeMessages.createdAt);

      // Check if we should end the conversation
      const outboundCount = messages.filter(
        (m) => m.direction === "outbound",
      ).length;
      const maxMessages = campaign.maxMessages || 10;

      // Check for opt-out keywords
      const optOutKeywords = ["stop", "unsubscribe", "cancel", "quit", "end"];
      if (optOutKeywords.some((kw) => Body.toLowerCase().includes(kw))) {
        // Mark conversation as opted out
        await db
          .update(nudgeConversations)
          .set({
            status: "opted_out",
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(nudgeConversations.id, conversation.id));

        // Send confirmation
        await sendSMS(
          From,
          "You have been unsubscribed. Thank you for your feedback!",
        );

        return res
          .status(200)
          .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }

      if (outboundCount >= maxMessages) {
        // Analyze feedback and complete conversation
        const analysis = await analyzeFeedback(messages);

        await db
          .update(nudgeConversations)
          .set({
            status: "completed",
            completedAt: new Date(),
            feedbackSummary: analysis.summary,
            sentiment: analysis.sentiment,
            updatedAt: new Date(),
          })
          .where(eq(nudgeConversations.id, conversation.id));

        // Send closing message
        await sendSMS(
          From,
          "Thank you so much for sharing your feedback! We really appreciate it and will use it to improve your future stays.",
        );

        return res
          .status(200)
          .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }

      // Generate AI response
      const aiResponse = await generateAIResponse(
        { ...conversation, messages },
        campaign,
        Body,
      );

      // Send the AI response
      const smsResult = await sendSMS(From, aiResponse);

      // Record the outbound message
      await db.insert(nudgeMessages).values({
        conversationId: conversation.id,
        direction: "outbound",
        content: aiResponse,
        twilioMessageId: smsResult.messageId,
        status: smsResult.success ? "sent" : "failed",
        errorMessage: smsResult.error,
      });

      // Update message count again
      await db
        .update(nudgeConversations)
        .set({
          messageCount: (conversation.messageCount || 0) + 2, // +1 for inbound, +1 for outbound
          updatedAt: new Date(),
        })
        .where(eq(nudgeConversations.id, conversation.id));

      // Return empty TwiML response (we're sending via REST API)
      res
        .status(200)
        .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    } catch (error: any) {
      logger.error("Twilio Webhook", "Error processing SMS:", error);
      res.status(500).send("Error processing message");
    }
  });
}
