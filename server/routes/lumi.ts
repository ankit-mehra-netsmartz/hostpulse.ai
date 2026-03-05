import type { Express } from "express";
import type { IStorage } from "../storage";
import crypto from "crypto";
import { isAuthenticated } from "../replit_integrations/auth";
import { logger } from "../logger";
import { getUserId, getWorkspaceId } from "./helpers";
import { openai } from "./ai-helpers";
import { runAgentQuery } from "../lumi/agent";
import type { ChartData, ClarificationRequest } from "../lumi/tools";
import { z } from "zod";
import { sendIntegrationSuggestionEmail } from "../services/resend";

export function registerLumiRoutes(app: Express, storage: IStorage) {
  // ========================================
  // Ask Lumi - AI Research Agent Routes
  // ========================================

  app.get("/api/lumi/views", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }

      const dbUser = await storage.getUser(userId);
      
      if (dbUser?.role !== "app_admin") {
        const membership = await storage.getWorkspaceMember(workspaceId, userId);
        if (!membership || membership.status !== 'active') {
          return res.status(403).json({ message: "Not authorized for this workspace" });
        }
      }

      const views = await storage.getLumiViews(workspaceId);
      res.json(views);
    } catch (error) {
      logger.error("Lumi", "Error fetching Lumi views:", error);
      res.status(500).json({ message: "Failed to fetch views" });
    }
  });

  app.post("/api/lumi/views", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = req.body.workspaceId || getWorkspaceId(req);
      
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }

      const dbUser = await storage.getUser(userId);
      
      if (dbUser?.role !== "app_admin") {
        const membership = await storage.getWorkspaceMember(workspaceId, userId);
        if (!membership || membership.status !== 'active') {
          return res.status(403).json({ message: "Not authorized for this workspace" });
        }
      }

      const view = await storage.createLumiView({
        ...req.body,
        userId,
        workspaceId,
      });
      res.status(201).json(view);
    } catch (error) {
      logger.error("Lumi", "Error creating Lumi view:", error);
      res.status(500).json({ message: "Failed to create view" });
    }
  });

  app.delete("/api/lumi/views/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const viewId = req.params.id as string;
      
      const view = await storage.getLumiView(viewId);
      if (!view) {
        return res.status(404).json({ message: "View not found" });
      }
      
      const dbUser = await storage.getUser(userId);
      
      if (dbUser?.role !== "app_admin") {
        const membership = await storage.getWorkspaceMember(view.workspaceId, userId);
        if (!membership || membership.status !== 'active') {
          return res.status(403).json({ message: "Not authorized to delete this view" });
        }
      }
      
      await storage.deleteLumiView(viewId);
      res.json({ message: "View deleted" });
    } catch (error) {
      logger.error("Lumi", "Error deleting Lumi view:", error);
      res.status(500).json({ message: "Failed to delete view" });
    }
  });

  app.get("/api/lumi/queries", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }

      const dbUser = await storage.getUser(userId);
      
      if (dbUser?.role !== "app_admin") {
        const membership = await storage.getWorkspaceMember(workspaceId, userId);
        if (!membership || membership.status !== 'active') {
          return res.status(403).json({ message: "Not authorized for this workspace" });
        }
      }

      const queries = await storage.getLumiQueries(workspaceId);
      res.json(queries);
    } catch (error) {
      logger.error("Lumi", "Error fetching Lumi queries:", error);
      res.status(500).json({ message: "Failed to fetch queries" });
    }
  });

  app.post("/api/lumi/query", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = req.body.workspaceId || getWorkspaceId(req);
      const { prompt, viewId, textMatchOnly } = req.body;

      const dbUser = await storage.getUser(userId);
      logger.info("Lumi", `[Lumi Query] User: ${userId}, Role: ${dbUser?.role}, Workspace: ${workspaceId}`);

      if (!workspaceId || !prompt) {
        return res.status(400).json({ message: "Workspace ID and prompt required" });
      }

      if (dbUser?.role !== "app_admin") {
        const membership = await storage.getWorkspaceMember(workspaceId, userId);
        logger.info("Lumi", "[Lumi Query] Membership check:", membership);
        if (!membership || membership.status !== 'active') {
          return res.status(403).json({ message: "Not authorized for this workspace" });
        }
      } else {
        logger.info("Lumi", "[Lumi Query] Bypassing membership check for app_admin");
      }

      let tags = await storage.getTagsByWorkspace(workspaceId);
      let themes = await storage.getThemesByWorkspace(workspaceId);
      let reservations = await storage.getReservationsByWorkspace(workspaceId);

      if (viewId) {
        const view = await storage.getLumiView(viewId);
        if (view && view.workspaceId === workspaceId && view.filters) {
          const filters = view.filters as {
            listingIds?: string[];
            sentiment?: string[];
            themes?: string[];
          };
          
          if (filters.sentiment && filters.sentiment.length > 0) {
            tags = tags.filter(t => filters.sentiment!.includes(t.sentiment || ""));
          }
          
          if (filters.listingIds && filters.listingIds.length > 0) {
            tags = tags.filter(t => filters.listingIds!.includes(t.listingId || ""));
            reservations = reservations.filter(r => filters.listingIds!.includes(r.listingId || ""));
          }
          
          if (filters.themes && filters.themes.length > 0) {
            tags = tags.filter(t => filters.themes!.includes(t.themeId || ""));
          }
        }
      }

      let matchedTags = tags;
      if (textMatchOnly) {
        const searchTerms = prompt.toLowerCase().split(/\s+/).filter((t: string) => t.length > 2);
        matchedTags = tags.filter(t => {
          const searchText = `${t.name || ""} ${t.summary || ""} ${t.verbatimEvidence || ""}`.toLowerCase();
          return searchTerms.some((term: string) => searchText.includes(term));
        });
      }

      const dataContext = {
        tagsCount: matchedTags.length,
        themesCount: themes.length,
        reservationsCount: reservations.length,
        sentimentBreakdown: {
          positive: matchedTags.filter(t => t.sentiment === "positive").length,
          negative: matchedTags.filter(t => t.sentiment === "negative").length,
          neutral: matchedTags.filter(t => t.sentiment === "neutral").length,
          question: matchedTags.filter(t => t.sentiment === "question").length,
        },
        topThemes: themes.slice(0, 10).map(t => ({ name: t.name, tagCount: t.summaryTagCount || 0 })),
        tagSamples: matchedTags.slice(0, 25).map(t => ({ 
          name: t.name, 
          sentiment: t.sentiment, 
          summary: t.summary,
          verbatim: t.verbatimEvidence?.slice(0, 200)
        })),
        appliedFilters: viewId ? "View filters applied" : "All data",
        textMatchMode: textMatchOnly ? "Text match search" : "Full semantic analysis",
      };

      const systemPrompt = `You are Lumi, an AI research assistant for HostPulse, a property management analytics platform. 
You help hosts analyze their guest feedback, reviews, and property performance data.

Analysis mode: ${dataContext.textMatchMode}
Data scope: ${dataContext.appliedFilters}

Current workspace data summary:
- ${dataContext.tagsCount} tags matching criteria
- ${dataContext.themesCount} themes identified
- ${dataContext.reservationsCount} reservations
- Sentiment breakdown: ${dataContext.sentimentBreakdown.positive} positive, ${dataContext.sentimentBreakdown.negative} negative, ${dataContext.sentimentBreakdown.neutral} neutral, ${dataContext.sentimentBreakdown.question} questions

Top themes by tag count:
${dataContext.topThemes.map(t => `- ${t.name} (${t.tagCount} tags)`).join("\n") || "None yet"}

Tag samples from data:
${dataContext.tagSamples.map(t => `- ${t.name} (${t.sentiment}): ${t.summary || ""} ${t.verbatim ? `"${t.verbatim}..."` : ""}`).join("\n") || "No tags found"}

Provide helpful, actionable insights based on this data. Be specific and reference actual data when possible. Quote guest feedback verbatim when relevant.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        max_tokens: 1000,
      });

      const aiResponse = response.choices[0]?.message?.content || "I couldn't generate a response. Please try again.";

      const savedQuery = await storage.createLumiQuery({
        userId,
        workspaceId,
        viewId,
        prompt,
        response: aiResponse,
        responseType: "text",
        textMatchOnly: textMatchOnly || false,
        sources: {
          reservations: dataContext.reservationsCount,
          tags: dataContext.tagsCount,
          themes: dataContext.themesCount,
        },
      });

      res.json({ 
        id: savedQuery.id,
        response: aiResponse,
        sources: savedQuery.sources,
      });
    } catch (error) {
      logger.error("Lumi", "Error processing Lumi query:", error);
      res.status(500).json({ message: "Failed to process query" });
    }
  });

  app.post("/api/lumi/query/stream", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = req.body.workspaceId || getWorkspaceId(req);
      const { prompt, viewId, textMatchOnly, conversationId } = req.body;

      const dbUser = await storage.getUser(userId);
      logger.info("Lumi", `[Lumi Stream] User: ${userId}, Role: ${dbUser?.role}, Workspace: ${workspaceId}`);

      if (!workspaceId || !prompt) {
        return res.status(400).json({ message: "Workspace ID and prompt required" });
      }

      if (dbUser?.role !== "app_admin") {
        const membership = await storage.getWorkspaceMember(workspaceId, userId);
        if (!membership || membership.status !== 'active') {
          return res.status(403).json({ message: "Not authorized for this workspace" });
        }
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const PADDING = " ".repeat(2048);
      
      const sendEvent = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n:${PADDING}\n\n`);
        if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
          (res as unknown as { flush: () => void }).flush();
        }
      };

      const activeConversationId = conversationId || crypto.randomUUID();
      sendEvent("conversation", { conversationId: activeConversationId });

      sendEvent("thinking", { step: "Searching workspace data...", status: "in_progress" });
      
      let tags = await storage.getTagsByWorkspace(workspaceId);
      let themes = await storage.getThemesByWorkspace(workspaceId);
      let reservations = await storage.getReservationsByWorkspace(workspaceId);

      sendEvent("thinking", { 
        step: "Searching workspace data...", 
        status: "complete",
        detail: `Found ${tags.length} tags, ${themes.length} themes, ${reservations.length} reservations`
      });

      sendEvent("thinking", { step: "Applying filters...", status: "in_progress" });
      
      if (viewId) {
        const view = await storage.getLumiView(viewId);
        if (view && view.workspaceId === workspaceId && view.filters) {
          const filters = view.filters as {
            listingIds?: string[];
            sentiment?: string[];
            themes?: string[];
          };
          
          if (filters.sentiment && filters.sentiment.length > 0) {
            tags = tags.filter(t => filters.sentiment!.includes(t.sentiment || ""));
          }
          if (filters.listingIds && filters.listingIds.length > 0) {
            tags = tags.filter(t => filters.listingIds!.includes(t.listingId || ""));
            reservations = reservations.filter(r => filters.listingIds!.includes(r.listingId || ""));
          }
          if (filters.themes && filters.themes.length > 0) {
            tags = tags.filter(t => filters.themes!.includes(t.themeId || ""));
          }
        }
      }

      let matchedTags = tags;
      if (textMatchOnly) {
        const searchTerms = prompt.toLowerCase().split(/\s+/).filter((t: string) => t.length > 2);
        matchedTags = tags.filter(t => {
          const searchText = `${t.name || ""} ${t.summary || ""} ${t.verbatimEvidence || ""}`.toLowerCase();
          return searchTerms.some((term: string) => searchText.includes(term));
        });
      }

      sendEvent("thinking", { 
        step: "Applying filters...", 
        status: "complete",
        detail: `${matchedTags.length} tags match criteria`
      });

      let conversationHistory: { role: "user" | "assistant"; content: string }[] = [];
      if (conversationId) {
        sendEvent("thinking", { step: "Loading conversation context...", status: "in_progress" });
        const previousQueries = await storage.getLumiQueriesByConversation(conversationId);
        conversationHistory = previousQueries.flatMap(q => [
          { role: "user" as const, content: q.prompt },
          { role: "assistant" as const, content: q.response || "" }
        ]);
        sendEvent("thinking", { 
          step: "Loading conversation context...", 
          status: "complete",
          detail: `${previousQueries.length} previous messages loaded`
        });
      }

      sendEvent("thinking", { step: "Analyzing with AI...", status: "in_progress" });

      const dataContext = {
        tagsCount: matchedTags.length,
        themesCount: themes.length,
        reservationsCount: reservations.length,
        sentimentBreakdown: {
          positive: matchedTags.filter(t => t.sentiment === "positive").length,
          negative: matchedTags.filter(t => t.sentiment === "negative").length,
          neutral: matchedTags.filter(t => t.sentiment === "neutral").length,
          question: matchedTags.filter(t => t.sentiment === "question").length,
        },
        topThemes: themes.slice(0, 10).map(t => ({ name: t.name, tagCount: t.summaryTagCount || 0 })),
        tagSamples: matchedTags.slice(0, 25).map(t => ({ 
          name: t.name, 
          sentiment: t.sentiment, 
          summary: t.summary,
          verbatim: t.verbatimEvidence?.slice(0, 200)
        })),
      };

      const systemPrompt = `You are Lumi, an AI research assistant for HostPulse, a property management analytics platform. 
You help hosts analyze their guest feedback, reviews, and property performance data.

Current workspace data summary:
- ${dataContext.tagsCount} tags matching criteria
- ${dataContext.themesCount} themes identified
- ${dataContext.reservationsCount} reservations
- Sentiment breakdown: ${dataContext.sentimentBreakdown.positive} positive, ${dataContext.sentimentBreakdown.negative} negative, ${dataContext.sentimentBreakdown.neutral} neutral, ${dataContext.sentimentBreakdown.question} questions

Top themes by tag count:
${dataContext.topThemes.map(t => `- ${t.name} (${t.tagCount} tags)`).join("\n") || "None yet"}

Tag samples from data:
${dataContext.tagSamples.map(t => `- ${t.name} (${t.sentiment}): ${t.summary || ""} ${t.verbatim ? `"${t.verbatim}..."` : ""}`).join("\n") || "No tags found"}

Provide helpful, actionable insights based on this data. Be specific and reference actual data when possible. Quote guest feedback verbatim when relevant.`;

      const stream = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
          { role: "user", content: prompt }
        ],
        max_tokens: 1500,
        stream: true,
      });

      sendEvent("thinking", { step: "Analyzing with AI...", status: "complete" });
      sendEvent("thinking", { step: "Generating response...", status: "in_progress" });

      let fullResponse = "";
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          sendEvent("content", { text: content });
        }
      }

      sendEvent("thinking", { step: "Generating response...", status: "complete" });

      const savedQuery = await storage.createLumiQuery({
        userId,
        workspaceId,
        conversationId: activeConversationId,
        viewId,
        prompt,
        response: fullResponse,
        responseType: "text",
        textMatchOnly: textMatchOnly || false,
        sources: {
          reservations: dataContext.reservationsCount,
          tags: dataContext.tagsCount,
          themes: dataContext.themesCount,
        },
        thinkingSteps: [
          { step: "Searching workspace data...", status: "complete" as const },
          { step: "Applying filters...", status: "complete" as const },
          { step: "Analyzing with AI...", status: "complete" as const },
          { step: "Generating response...", status: "complete" as const },
        ],
      });

      sendEvent("complete", { 
        id: savedQuery.id,
        conversationId: activeConversationId,
        sources: savedQuery.sources,
      });

      res.end();
    } catch (error) {
      logger.error("Lumi", "Error processing Lumi stream query:", error);
      res.write(`event: error\ndata: ${JSON.stringify({ message: "Failed to process query" })}\n\n`);
      res.end();
    }
  });

  app.post("/api/lumi/agent/stream", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = req.body.workspaceId || getWorkspaceId(req);
      const { prompt, conversationId } = req.body;

      const dbUser = await storage.getUser(userId);
      logger.info("Lumi", `[Lumi Agent] User: ${userId}, Workspace: ${workspaceId}`);

      if (!workspaceId || !prompt) {
        return res.status(400).json({ message: "Workspace ID and prompt required" });
      }

      if (dbUser?.role !== "app_admin") {
        const membership = await storage.getWorkspaceMember(workspaceId, userId);
        if (!membership || membership.status !== 'active') {
          return res.status(403).json({ message: "Not authorized for this workspace" });
        }
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const PADDING = " ".repeat(2048);
      
      const sendEvent = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n:${PADDING}\n\n`);
        if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
          (res as unknown as { flush: () => void }).flush();
        }
      };

      const activeConversationId = conversationId || crypto.randomUUID();
      sendEvent("conversation", { conversationId: activeConversationId });

      let conversationHistory: { role: "user" | "assistant"; content: string }[] = [];
      if (conversationId) {
        const previousQueries = await storage.getLumiQueriesByConversation(conversationId);
        conversationHistory = previousQueries.flatMap(q => [
          { role: "user" as const, content: q.prompt },
          { role: "assistant" as const, content: q.response || "" }
        ]);
      }

      const thinkingSteps: { step: string; status: "in_progress" | "complete"; detail?: string }[] = [];
      const charts: ChartData[] = [];
      let clarification: ClarificationRequest | null = null;
      const followUpQuestions: string[] = [];
      let finalSources: { tools: string[]; dataPoints: number; counts: { tags: number; themes: number; reservations: number; reviews: number; listings: number } } = { 
        tools: [], 
        dataPoints: 0, 
        counts: { tags: 0, themes: 0, reservations: 0, reviews: 0, listings: 0 } 
      };

      const fullResponse = await runAgentQuery(
        prompt,
        conversationHistory,
        { storage, workspaceId, userId },
        {
          onThinking: (step, status, detail) => {
            thinkingSteps.push({ step, status, detail });
            sendEvent("thinking", { step, status, detail });
          },
          onContent: (text) => {
            sendEvent("content", { text });
          },
          onChart: (chart) => {
            charts.push(chart);
            sendEvent("chart", chart);
          },
          onClarification: (request) => {
            clarification = request;
            sendEvent("clarification", request);
          },
          onFollowUp: (questions) => {
            followUpQuestions.push(...questions);
            sendEvent("followup", { questions });
          },
          onComplete: (sources) => {
            finalSources = sources;
            sendEvent("sources", sources);
          }
        }
      );

      const sources = {
        reservations: finalSources.counts.reservations,
        reviews: finalSources.counts.reviews,
        tags: finalSources.counts.tags,
        themes: finalSources.counts.themes,
        listings: finalSources.counts.listings,
      };

      const savedQuery = await storage.createLumiQuery({
        userId,
        workspaceId,
        conversationId: activeConversationId,
        prompt,
        response: fullResponse,
        responseType: clarification ? "clarification" : charts.length > 0 ? "chart" : "text",
        sources,
        thinkingSteps: thinkingSteps.map(t => ({ 
          step: t.step, 
          status: (t.status === "in_progress" ? "pending" : "complete") as "pending" | "complete",
          detail: t.detail
        })),
      });

      sendEvent("complete", { 
        id: savedQuery.id,
        conversationId: activeConversationId,
      });

      res.end();
    } catch (error) {
      logger.error("Lumi", "Error processing Lumi agent query:", error);
      res.write(`event: error\ndata: ${JSON.stringify({ message: "Failed to process query" })}\n\n`);
      res.end();
    }
  });

  app.delete("/api/lumi/conversations/:conversationId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const conversationId = req.params.conversationId as string;
      
      const conversationQueries = await storage.getLumiQueriesByConversation(conversationId);
      
      if (conversationQueries.length === 0) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      const dbUser = await storage.getUser(userId);
      const workspaceId = conversationQueries[0].workspaceId;
      
      if (dbUser?.role !== "app_admin") {
        const membership = await storage.getWorkspaceMember(workspaceId, userId);
        if (!membership || membership.status !== 'active') {
          return res.status(403).json({ message: "Not authorized to delete this conversation" });
        }
      }
      
      await Promise.all(
        conversationQueries.map((q) => storage.deleteLumiQuery(q.id))
      );
      
      res.json({ deleted: conversationQueries.length, conversationId });
    } catch (error) {
      logger.error("Lumi", "Error deleting conversation:", error);
      res.status(500).json({ message: "Failed to delete conversation" });
    }
  });

  app.patch("/api/lumi/conversations/:conversationId/save", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const conversationId = req.params.conversationId as string;
      
      const conversationQueries = await storage.getLumiQueriesByConversation(conversationId);
      
      if (conversationQueries.length === 0) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      const dbUser = await storage.getUser(userId);
      const workspaceId = conversationQueries[0].workspaceId;
      
      if (dbUser?.role !== "app_admin") {
        const membership = await storage.getWorkspaceMember(workspaceId, userId);
        if (!membership || membership.status !== 'active') {
          return res.status(403).json({ message: "Not authorized to save this conversation" });
        }
      }
      
      const updates = await Promise.all(
        conversationQueries.map((q) => storage.updateLumiQuery(q.id, { isSaved: true }))
      );
      
      res.json({ saved: updates.length, conversationId });
    } catch (error) {
      logger.error("Lumi", "Error saving conversation:", error);
      res.status(500).json({ message: "Failed to save conversation" });
    }
  });

  app.patch("/api/lumi/queries/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const queryId = req.params.id as string;
      
      const lumiQuery = await storage.getLumiQuery(queryId);
      if (!lumiQuery) {
        return res.status(404).json({ message: "Query not found" });
      }
      
      const dbUser = await storage.getUser(userId);
      
      if (dbUser?.role !== "app_admin") {
        const membership = await storage.getWorkspaceMember(lumiQuery.workspaceId, userId);
        if (!membership || membership.status !== 'active') {
          return res.status(403).json({ message: "Not authorized to update this query" });
        }
      }
      
      const updated = await storage.updateLumiQuery(queryId, req.body);
      res.json(updated);
    } catch (error) {
      logger.error("Lumi", "Error updating Lumi query:", error);
      res.status(500).json({ message: "Failed to update query" });
    }
  });

  const integrationSuggestionSchema = z.object({
    integrationName: z.string().min(1, "Integration name is required"),
    integrationDescription: z.string().min(10, "Please describe what you want the integration to do"),
    workspaceId: z.string().optional(),
  });

  app.post("/api/integration-suggestion", isAuthenticated, async (req, res) => {
    try {
      const parsed = integrationSuggestionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const user = req.user as any;
      if (!user) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const workspaceId = parsed.data.workspaceId || req.headers["x-workspace-id"] as string;
      let workspaceName = "Unknown Workspace";
      if (workspaceId) {
        const workspace = await storage.getWorkspace(workspaceId);
        if (workspace) {
          workspaceName = workspace.name;
        }
      }

      const { integrationName, integrationDescription } = parsed.data;

      await sendIntegrationSuggestionEmail({
        userName: user.firstName && user.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user.username || "Unknown User",
        userEmail: user.email || "No email provided",
        workspaceName,
        integrationName,
        integrationDescription,
      });

      res.json({ success: true, message: "Integration suggestion submitted successfully" });
    } catch (error) {
      logger.error("Lumi", "Error sending integration suggestion:", error);
      res.status(500).json({ message: "Failed to send integration suggestion. Please try again." });
    }
  });
}
