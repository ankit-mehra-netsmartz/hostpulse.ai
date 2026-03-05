import type { Express } from "express";
import { IStorage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { config } from "../config";
import { logger } from "../logger";
import { openai, getConfiguredAIModel } from "./ai-helpers";
import { getUserId, getWorkspaceId, validateWorkspaceMembership, getParamId } from "./helpers";
import {
  insertTagSchema, insertThemeSchema, insertTaskSchema,
} from "@shared/schema";

export function registerTagsThemesTasksRoutes(app: Express, storage: IStorage) {
  // =====================
  // Tags
  // =====================

  app.get("/api/tags", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      
      const returnAll = req.query.all === "true";
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const datesParam = req.query.dates as string | undefined;
      const filterDates = datesParam ? datesParam.split(",").filter(Boolean) : [];
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      let allTags = workspaceId 
        ? await storage.getTagsByWorkspace(workspaceId)
        : await storage.getTagsByUser(userId);
      
      const listingIds = Array.from(new Set(allTags.map(t => t.listingId).filter(Boolean))) as string[];
      const themeIds = Array.from(new Set(allTags.map(t => t.themeId).filter(Boolean))) as string[];
      const reservationIds = Array.from(new Set(allTags.map(t => t.reservationId).filter(Boolean))) as string[];
      
      const [listingsArr, themesArr, reservationsArr] = await Promise.all([
        listingIds.length > 0 ? storage.getListingsByIds(listingIds) : [],
        themeIds.length > 0 ? storage.getThemesByIds(themeIds) : [],
        reservationIds.length > 0 ? storage.getReservationsByIds(reservationIds) : [],
      ]);
      
      const listingsMap = new Map(listingsArr.map(l => [l.id, l]));
      const themesMap = new Map(themesArr.map(t => [t.id, t]));
      const reservationsMap = new Map(reservationsArr.map(r => [r.id, r]));
      
      if (filterDates.length > 0) {
        allTags = allTags.filter(tag => {
          const reservation = tag.reservationId ? reservationsMap.get(tag.reservationId) : null;
          if (!reservation?.checkInDate) return false;
          const checkInDateStr = new Date(reservation.checkInDate).toISOString().split('T')[0];
          return filterDates.includes(checkInDateStr);
        });
      }
      
      allTags.sort((a, b) => {
        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bDate - aDate;
      });
      
      const enrichTag = (tag: typeof allTags[0]) => ({
        ...tag,
        listing: tag.listingId ? listingsMap.get(tag.listingId) : undefined,
        theme: tag.themeId ? themesMap.get(tag.themeId) : undefined,
        reservation: tag.reservationId ? reservationsMap.get(tag.reservationId) : undefined,
      });
      
      if (returnAll) {
        return res.json(allTags.map(enrichTag));
      }
      
      const paginatedTags = allTags.slice(offset, offset + limit);
      
      res.json({
        items: paginatedTags.map(enrichTag),
        total: allTags.length,
        hasMore: offset + limit < allTags.length,
        nextOffset: offset + limit,
      });
    } catch (error) {
      logger.error("Tags", "Error fetching tags:", error);
      res.status(500).json({ message: "Failed to fetch tags" });
    }
  });

  app.get("/api/tags/chart-data", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const { listingId, sentiment, days = "90", themeId } = req.query;
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const allTags = workspaceId 
        ? await storage.getTagsByWorkspace(workspaceId)
        : await storage.getTagsByUser(userId);
      
      const reservationIds = Array.from(new Set(allTags.map(t => t.reservationId).filter(Boolean))) as string[];
      const listingIds = Array.from(new Set(allTags.map(t => t.listingId).filter(Boolean))) as string[];
      
      const [reservations, listingsData] = await Promise.all([
        reservationIds.length > 0 ? storage.getReservationsByIds(reservationIds) : [],
        listingIds.length > 0 ? storage.getListingsByIds(listingIds) : [],
      ]);
      
      const reservationMap = new Map(reservations.map(r => [r.id, r]));
      const listingMap = new Map(listingsData.map(l => [l.id, l]));
      
      const tagsWithDates = allTags.map(tag => {
        const reservation = tag.reservationId ? reservationMap.get(tag.reservationId) : null;
        const listing = tag.listingId ? listingMap.get(tag.listingId) : null;
        return {
          ...tag,
          interactionDate: reservation?.checkInDate || reservation?.checkOutDate || tag.createdAt,
          listingName: listing?.name,
        };
      });
      
      let filteredTags = tagsWithDates;
      if (listingId && listingId !== "all") {
        filteredTags = filteredTags.filter(tag => tag.listingId === listingId);
      }
      
      if (themeId && themeId !== "all") {
        filteredTags = filteredTags.filter(tag => tag.themeId === themeId);
      }
      
      if (sentiment && sentiment !== "all") {
        filteredTags = filteredTags.filter(tag => tag.sentiment === sentiment);
      }
      
      const daysNum = parseInt(days as string, 10) || 90;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysNum);
      
      filteredTags = filteredTags.filter(tag => {
        const dateToCheck = tag.interactionDate || tag.createdAt;
        if (!dateToCheck) return false;
        const tagDate = new Date(dateToCheck);
        return tagDate >= cutoffDate;
      });
      
      if (filteredTags.length === 0 && tagsWithDates.length > 0) {
        filteredTags = tagsWithDates.filter(tag => {
          if (listingId && listingId !== "all" && tag.listingId !== listingId) return false;
          if (themeId && themeId !== "all" && tag.themeId !== themeId) return false;
          if (sentiment && sentiment !== "all" && tag.sentiment !== sentiment) return false;
          return true;
        });
      }
      
      const dateMap: Record<string, { positive: number; neutral: number; negative: number; question: number }> = {};
      
      for (const tag of filteredTags) {
        const dateToUse = tag.interactionDate || tag.createdAt;
        if (!dateToUse) continue;
        const dateKey = new Date(dateToUse).toISOString().split('T')[0];
        
        if (!dateMap[dateKey]) {
          dateMap[dateKey] = { positive: 0, neutral: 0, negative: 0, question: 0 };
        }
        
        const sentiment = tag.sentiment || "neutral";
        if (sentiment in dateMap[dateKey]) {
          dateMap[dateKey][sentiment as keyof typeof dateMap[typeof dateKey]]++;
        }
      }
      
      const chartData = Object.entries(dateMap)
        .map(([date, counts]) => ({ date, ...counts }))
        .sort((a, b) => a.date.localeCompare(b.date));
      
      const listings = workspaceId 
        ? await storage.getListingsByWorkspace(workspaceId)
        : await storage.getListingsByUser(userId);
      const listingOptions = listings.map(l => ({ id: l.id, name: l.name }));
      
      res.json({ chartData, listings: listingOptions });
    } catch (error) {
      logger.error("Tags", "Error fetching tag chart data:", error);
      res.status(500).json({ message: "Failed to fetch chart data" });
    }
  });

  app.get("/api/tags/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const tag = await storage.getTag(getParamId(req.params.id));
      
      if (!tag) {
        return res.status(404).json({ message: "Tag not found" });
      }
      
      const hasAccess = tag.userId === userId || 
        (workspaceId && tag.workspaceId === workspaceId && await validateWorkspaceMembership(userId, workspaceId));
      
      if (!hasAccess) {
        return res.status(404).json({ message: "Tag not found" });
      }
      
      const listing = tag.listingId ? await storage.getListing(tag.listingId) : null;
      const theme = tag.themeId ? await storage.getTheme(tag.themeId) : null;
      const reservation = tag.reservationId ? await storage.getReservation(tag.reservationId) : null;
      
      res.json({
        ...tag,
        listing: listing || undefined,
        theme: theme || undefined,
        reservation: reservation || undefined,
      });
    } catch (error) {
      logger.error("Tags", "Error fetching tag:", error);
      res.status(500).json({ message: "Failed to fetch tag" });
    }
  });

  app.post("/api/tags", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const parseResult = insertTagSchema.safeParse({ ...req.body, userId, workspaceId: workspaceId || undefined });
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid data", errors: parseResult.error.flatten() });
      }
      
      if (req.body.listingId) {
        const listing = await storage.getListing(req.body.listingId);
        if (!listing) {
          return res.status(403).json({ message: "Invalid listing reference" });
        }
        const hasListingAccess = listing.userId === userId || 
          (workspaceId && listing.workspaceId === workspaceId);
        if (!hasListingAccess) {
          return res.status(403).json({ message: "Invalid listing reference" });
        }
      }
      
      if (req.body.themeId) {
        const theme = await storage.getTheme(req.body.themeId);
        if (!theme) {
          return res.status(403).json({ message: "Invalid theme reference" });
        }
        const hasThemeAccess = theme.userId === userId || 
          (workspaceId && theme.workspaceId === workspaceId);
        if (!hasThemeAccess) {
          return res.status(403).json({ message: "Invalid theme reference" });
        }
      }
      
      if (req.body.reservationId) {
        const reservation = await storage.getReservation(req.body.reservationId);
        if (!reservation) {
          return res.status(403).json({ message: "Invalid reservation reference" });
        }
        const hasReservationAccess = reservation.userId === userId || 
          (workspaceId && reservation.workspaceId === workspaceId);
        if (!hasReservationAccess) {
          return res.status(403).json({ message: "Invalid reservation reference" });
        }
        if (reservation.listingId !== req.body.listingId) {
          return res.status(400).json({ message: "Reservation does not belong to the specified listing" });
        }
      }
      
      const tag = await storage.createTag(parseResult.data);
      res.status(201).json(tag);
    } catch (error) {
      logger.error("Tags", "Error creating tag:", error);
      res.status(500).json({ message: "Failed to create tag" });
    }
  });

  app.patch("/api/tags/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const tag = await storage.getTag(getParamId(req.params.id));
      
      if (!tag) {
        return res.status(404).json({ message: "Tag not found" });
      }
      
      const hasAccess = tag.userId === userId || 
        (workspaceId && tag.workspaceId === workspaceId && await validateWorkspaceMembership(userId, workspaceId));
      
      if (!hasAccess) {
        return res.status(404).json({ message: "Tag not found" });
      }
      
      const updateSchema = insertTagSchema.partial().omit({ userId: true, listingId: true, reservationId: true });
      const parseResult = updateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid data", errors: parseResult.error.flatten() });
      }
      
      if (req.body.themeId) {
        const theme = await storage.getTheme(req.body.themeId);
        if (!theme) {
          return res.status(403).json({ message: "Invalid theme reference" });
        }
        const hasThemeAccess = theme.userId === userId || 
          (workspaceId && theme.workspaceId === workspaceId);
        if (!hasThemeAccess) {
          return res.status(403).json({ message: "Invalid theme reference" });
        }
      }
      
      const safeUpdate = { ...req.body };
      delete safeUpdate.listingId;
      delete safeUpdate.reservationId;
      delete safeUpdate.userId;
      delete safeUpdate.workspaceId;
      
      const updated = await storage.updateTag(getParamId(req.params.id), safeUpdate);
      res.json(updated);
    } catch (error) {
      logger.error("Tags", "Error updating tag:", error);
      res.status(500).json({ message: "Failed to update tag" });
    }
  });

  app.delete("/api/tags/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const tag = await storage.getTag(getParamId(req.params.id));
      
      if (!tag) {
        return res.status(404).json({ message: "Tag not found" });
      }
      
      const hasAccess = tag.userId === userId || 
        (workspaceId && tag.workspaceId === workspaceId && await validateWorkspaceMembership(userId, workspaceId));
      
      if (!hasAccess) {
        return res.status(404).json({ message: "Tag not found" });
      }
      
      await storage.deleteTag(getParamId(req.params.id));
      res.status(204).send();
    } catch (error) {
      logger.error("Tags", "Error deleting tag:", error);
      res.status(500).json({ message: "Failed to delete tag" });
    }
  });

  // =====================
  // Themes
  // =====================

  app.get("/api/themes", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const allThemes = workspaceId 
        ? await storage.getThemesByWorkspace(workspaceId)
        : await storage.getThemesByUser(userId);
      res.json(allThemes);
    } catch (error) {
      logger.error("Themes", "Error fetching themes:", error);
      res.status(500).json({ message: "Failed to fetch themes" });
    }
  });

  app.get("/api/themes/stats", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const allThemes = workspaceId 
        ? await storage.getThemesByWorkspace(workspaceId)
        : await storage.getThemesByUser(userId);
      
      const themesWithStats = await Promise.all(allThemes.map(async (theme) => {
        const themeTags = await storage.getTagsByTheme(theme.id);
        const positiveCount = themeTags.filter(t => t.sentiment === 'positive').length;
        const negativeCount = themeTags.filter(t => t.sentiment === 'negative').length;
        const neutralCount = themeTags.filter(t => t.sentiment === 'neutral').length;
        const questionCount = themeTags.filter(t => t.sentiment === 'question').length;
        
        const sampleTags = themeTags.slice(0, 2);
        
        const latestTag = themeTags.length > 0 
          ? themeTags.reduce((latest, tag) => 
              new Date(tag.createdAt || 0) > new Date(latest.createdAt || 0) ? tag : latest
            )
          : null;
        
        return {
          ...theme,
          tags: sampleTags,
          tagCount: themeTags.length,
          positiveCount,
          negativeCount,
          neutralCount,
          questionCount,
          trend: 0,
          lastUpdated: latestTag?.createdAt || null,
        };
      }));
      
      res.json(themesWithStats);
    } catch (error) {
      logger.error("Themes", "Error fetching themes with stats:", error);
      res.status(500).json({ message: "Failed to fetch themes" });
    }
  });

  app.get("/api/themes/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const theme = await storage.getTheme(getParamId(req.params.id));
      
      if (!theme) {
        return res.status(404).json({ message: "Theme not found" });
      }
      
      const hasAccess = theme.userId === userId || 
        (workspaceId && theme.workspaceId === workspaceId && await validateWorkspaceMembership(userId, workspaceId));
      
      if (!hasAccess) {
        return res.status(404).json({ message: "Theme not found" });
      }
      
      const tags = await storage.getTagsByTheme(theme.id);
      
      const enrichedTags = await Promise.all(tags.map(async (tag) => {
        const listing = tag.listingId ? await storage.getListing(tag.listingId) : null;
        return {
          ...tag,
          listing: listing || undefined,
        };
      }));
      
      const positiveCount = tags.filter(t => t.sentiment === "positive").length;
      const negativeCount = tags.filter(t => t.sentiment === "negative").length;
      const neutralCount = tags.filter(t => t.sentiment === "neutral").length;
      const questionCount = tags.filter(t => t.sentiment === "question").length;
      
      res.json({
        ...theme,
        tags: enrichedTags,
        tagCount: tags.length,
        positiveCount,
        negativeCount,
        neutralCount,
        questionCount,
      });
    } catch (error) {
      logger.error("Themes", "Error fetching theme:", error);
      res.status(500).json({ message: "Failed to fetch theme" });
    }
  });

  app.post("/api/themes", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const parseResult = insertThemeSchema.safeParse({ ...req.body, userId, workspaceId: workspaceId || undefined });
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid data", errors: parseResult.error.flatten() });
      }
      
      const theme = await storage.createTheme(parseResult.data);
      res.status(201).json(theme);
    } catch (error) {
      logger.error("Themes", "Error creating theme:", error);
      res.status(500).json({ message: "Failed to create theme" });
    }
  });

  app.patch("/api/themes/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const theme = await storage.getTheme(getParamId(req.params.id));
      
      if (!theme) {
        return res.status(404).json({ message: "Theme not found" });
      }
      
      const hasAccess = theme.userId === userId || 
        (workspaceId && theme.workspaceId === workspaceId && await validateWorkspaceMembership(userId, workspaceId));
      
      if (!hasAccess) {
        return res.status(404).json({ message: "Theme not found" });
      }
      
      const updateSchema = insertThemeSchema.partial().omit({ userId: true });
      const parseResult = updateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid data", errors: parseResult.error.flatten() });
      }
      
      const safeUpdate = { ...req.body };
      delete safeUpdate.userId;
      delete safeUpdate.workspaceId;
      
      const updated = await storage.updateTheme(getParamId(req.params.id), safeUpdate);
      res.json(updated);
    } catch (error) {
      logger.error("Themes", "Error updating theme:", error);
      res.status(500).json({ message: "Failed to update theme" });
    }
  });

  app.delete("/api/themes/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const theme = await storage.getTheme(getParamId(req.params.id));
      
      if (!theme) {
        return res.status(404).json({ message: "Theme not found" });
      }
      
      const hasAccess = theme.userId === userId || 
        (workspaceId && theme.workspaceId === workspaceId && await validateWorkspaceMembership(userId, workspaceId));
      
      if (!hasAccess) {
        return res.status(404).json({ message: "Theme not found" });
      }
      
      await storage.deleteTheme(getParamId(req.params.id));
      res.status(204).send();
    } catch (error) {
      logger.error("Themes", "Error deleting theme:", error);
      res.status(500).json({ message: "Failed to delete theme" });
    }
  });

  app.post("/api/themes/promote", isAuthenticated, async (req, res) => {
    res.json({ 
      message: "Theme promotion is no longer needed. Themes are now pre-seeded and tags are automatically assigned.",
      themesPromoted: 0,
      tagsProcessed: 0
    });
  });

  app.post("/api/themes/suggest-from-unassigned", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const unassignedTheme = await storage.getUnassignedTheme(workspaceId);
      if (!unassignedTheme) {
        return res.status(404).json({ message: "Unassigned theme not found. Run theme backfill first." });
      }
      
      const unassignedTags = await storage.getTagsByTheme(unassignedTheme.id);
      
      if (unassignedTags.length < 5) {
        return res.json({ 
          suggestions: [],
          message: "Need at least 5 unassigned tags to suggest new themes"
        });
      }
      
      const existingThemes = await storage.getThemesByWorkspace(workspaceId);
      const existingThemeNames = existingThemes.filter(t => t.name !== "Unassigned").map(t => t.name);
      
      const tagData = unassignedTags.map(tag => ({
        id: tag.id,
        name: tag.name,
        sentiment: tag.sentiment,
        summary: tag.summary,
        verbatim: tag.verbatimEvidence,
      }));
      
      const analysisPrompt = `You are an expert at categorizing short-term rental guest feedback. Analyze these unassigned tags and suggest new themes that would help group similar feedback together.

EXISTING THEMES (do NOT suggest these):
${existingThemeNames.join(', ')}

UNASSIGNED TAGS TO ANALYZE:
${tagData.map(t => `- "${t.name}" (${t.sentiment}): ${t.summary || t.verbatim || 'No details'}`).join('\n')}

Suggest new theme categories that would group 5 or more similar tags together. Only suggest themes with strong patterns - don't force groupings.

Respond in JSON format:
{
  "suggestions": [
    {
      "themeName": "<proposed theme name>",
      "icon": "<single emoji that represents this theme>",
      "description": "<brief description of what this theme covers>",
      "matchingTagIds": ["<id1>", "<id2>", ...],
      "confidence": "high|medium|low",
      "reasoning": "<why these tags belong together>"
    }
  ]
}

RULES:
- Only suggest themes with at least 5 matching tags
- Don't suggest themes that overlap with existing themes
- Theme names should be broad categories, not specific issues
- Sort suggestions by confidence (high first) and tag count`;

      const { modelId } = await getConfiguredAIModel();
      
      const completion = await openai.chat.completions.create({
        model: modelId,
        messages: [{ role: "user", content: analysisPrompt }],
        response_format: { type: "json_object" },
        max_tokens: 2000,
      });

      const responseText = completion.choices[0]?.message?.content || '{"suggestions":[]}';
      const aiResult = JSON.parse(responseText);
      
      await storage.createAiUsageLog({
        userId,
        label: "theme_suggestion",
        model: modelId,
        inputTokens: completion.usage?.prompt_tokens || 0,
        outputTokens: completion.usage?.completion_tokens || 0,
        estimatedCost: ((completion.usage?.prompt_tokens || 0) * 0.00015 + (completion.usage?.completion_tokens || 0) * 0.0006) / 1000,
      });

      res.json({
        suggestions: aiResult.suggestions || [],
        unassignedTagCount: unassignedTags.length,
      });
    } catch (error) {
      logger.error("Themes", "Error suggesting themes:", error);
      res.status(500).json({ message: "Failed to analyze unassigned tags" });
    }
  });

  app.post("/api/themes/create-from-suggestion", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const { themeName, icon, description, tagIds } = req.body;
      
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      if (!themeName || !Array.isArray(tagIds) || tagIds.length < 5) {
        return res.status(400).json({ message: "Theme name and at least 5 tag IDs required" });
      }
      
      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const existingTheme = await storage.getThemeByNameInWorkspace(workspaceId, themeName);
      if (existingTheme) {
        return res.status(400).json({ message: "Theme with this name already exists" });
      }
      
      const newTheme = await storage.createTheme({
        userId,
        workspaceId,
        name: themeName,
        icon: icon || "📋",
        description: description || `Created from ${tagIds.length} unassigned tags`,
        isSystemTheme: false,
      });
      
      let tagsReassigned = 0;
      for (const tagId of tagIds) {
        const tag = await storage.getTag(tagId);
        if (tag && tag.workspaceId === workspaceId) {
          await storage.updateTag(tagId, { 
            themeId: newTheme.id,
            addedToThemeAt: new Date()
          });
          tagsReassigned++;
          
          const tasks = await storage.getTasksByTag(tagId);
          for (const task of tasks) {
            if (!task.themeId) {
              await storage.updateTask(task.id, { themeId: newTheme.id });
            }
          }
        }
      }
      
      logger.info("Themes", `Created new theme "${themeName}" with ${tagsReassigned} tags reassigned`);
      
      res.json({
        theme: newTheme,
        tagsReassigned,
      });
    } catch (error) {
      logger.error("Themes", "Error creating theme from suggestion:", error);
      res.status(500).json({ message: "Failed to create theme" });
    }
  });

  app.post("/api/themes/:id/generate-summary", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const themeId = getParamId(req.params.id);
      const theme = await storage.getTheme(themeId);
      
      if (!theme || theme.userId !== userId) {
        return res.status(404).json({ message: "Theme not found" });
      }
      
      const themeTags = await storage.getTagsByTheme(themeId);
      
      if (themeTags.length < 5) {
        return res.status(400).json({ message: "Need at least 5 tags to generate summary" });
      }
      
      const themeSummaryPrompt = await storage.getPromptByName("theme_summary");
      
      const tagSummaries = themeTags.map(tag => ({
        name: tag.name,
        sentiment: tag.sentiment,
        summary: tag.summary,
        verbatim: tag.verbatimEvidence,
      }));
      
      const sentimentCounts = {
        positive: themeTags.filter(t => t.sentiment === 'positive').length,
        negative: themeTags.filter(t => t.sentiment === 'negative').length,
        neutral: themeTags.filter(t => t.sentiment === 'neutral').length,
        question: themeTags.filter(t => t.sentiment === 'question').length,
      };
      
      const tagContext = tagSummaries.map(t => 
        `- ${t.name} (${t.sentiment}): ${t.summary || 'No summary'}`
      ).join('\n');
      
      let promptTemplate = themeSummaryPrompt?.promptTemplate || `You are an expert short-term rental consultant. Generate a natural language summary (2-3 sentences) that explains the breadth and nature of guest feedback for this theme.

Theme: {{themeName}}
Total Tags: {{totalTags}}
Sentiment Breakdown: {{sentimentCounts}}

Tags in this theme:
{{tagContext}}

Write a concise summary that:
1. Captures the main topics guests mention related to this theme
2. Highlights whether feedback is mostly positive, negative, or mixed
3. Gives the host a quick understanding of what guests commonly say

Response should be 2-3 sentences only, written in third person perspective about "guests".`;
      
      const analysisPrompt = promptTemplate
        .replace('{{themeName}}', theme.name)
        .replace('{{totalTags}}', String(themeTags.length))
        .replace('{{sentimentCounts}}', JSON.stringify(sentimentCounts))
        .replace('{{tagContext}}', tagContext);
      
      const model = themeSummaryPrompt?.modelId || "gpt-4.1-mini";
      
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: "You are an expert short-term rental consultant. Respond only with the summary text, no additional formatting." },
          { role: "user", content: analysisPrompt }
        ],
        max_tokens: 300,
        temperature: 0.7,
      });
      
      const summary = response.choices[0]?.message?.content?.trim() || '';
      
      const updated = await storage.updateTheme(themeId, {
        summary,
        summaryTagCount: themeTags.length,
        summaryGeneratedAt: new Date(),
      });
      
      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;
      await storage.createAiUsageLog({
        userId,
        label: "theme_summary",
        model,
        inputTokens,
        outputTokens,
        estimatedCost: (inputTokens * 0.00015 + outputTokens * 0.0006) / 1000,
      });
      
      res.json({ 
        summary, 
        tagCount: themeTags.length,
        theme: updated 
      });
    } catch (error) {
      logger.error("Themes", "Error generating theme summary:", error);
      res.status(500).json({ message: "Failed to generate theme summary" });
    }
  });

  // =====================
  // Tasks
  // =====================

  app.get("/api/tasks", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const tagId = req.query.tagId as string | undefined;
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      let allTasks = workspaceId 
        ? await storage.getTasksByWorkspace(workspaceId)
        : await storage.getTasksByUser(userId);
      
      if (tagId) {
        allTasks = allTasks.filter(task => task.tagId === tagId);
      }
      
      res.json(allTasks);
    } catch (error) {
      logger.error("Tasks", "Error fetching tasks:", error);
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  app.get("/api/tasks/chart-data", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const days = parseInt(req.query.days as string) || 90;
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const allTasks = workspaceId 
        ? await storage.getTasksByWorkspace(workspaceId)
        : await storage.getTasksByUser(userId);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const allListings = workspaceId 
        ? await storage.getListingsByWorkspace(workspaceId)
        : await storage.getListingsByUser(userId);
      const syncedListingIds = new Set(allListings.filter(l => l.lastSyncedAt).map(l => l.id));
      
      const allTags = workspaceId 
        ? await storage.getTagsByWorkspace(workspaceId)
        : await storage.getTagsByUser(userId);
      
      const getWeekKey = (date: Date): string => {
        const d = new Date(date);
        const dayOfWeek = d.getDay();
        const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        return monday.toISOString().split('T')[0];
      };
      
      const weeklyData: { [key: string]: { aiSuggested: number; userCreated: number; completed: number } } = {};
      
      const ensureWeek = (weekKey: string) => {
        if (!weeklyData[weekKey]) {
          weeklyData[weekKey] = { aiSuggested: 0, userCreated: 0, completed: 0 };
        }
      };
      
      allTags.forEach(tag => {
        if (tag.listingId && !syncedListingIds.has(tag.listingId)) return;
        
        if (tag.suggestedTaskTitle && tag.createdAt) {
          const tagDate = new Date(tag.createdAt);
          if (tagDate >= cutoffDate) {
            const weekKey = getWeekKey(tagDate);
            ensureWeek(weekKey);
            weeklyData[weekKey].aiSuggested++;
          }
        }
      });
      
      allTasks.forEach(task => {
        if (task.listingId && !syncedListingIds.has(task.listingId)) return;
        
        if (!task.tagId && task.createdAt) {
          const taskDate = new Date(task.createdAt);
          if (taskDate >= cutoffDate) {
            const weekKey = getWeekKey(taskDate);
            ensureWeek(weekKey);
            weeklyData[weekKey].userCreated++;
          }
        }
        
        if (task.status === 'done') {
          const completedDate = task.completedAt ? new Date(task.completedAt) : 
                                task.updatedAt ? new Date(task.updatedAt) : null;
          if (completedDate && completedDate >= cutoffDate) {
            const weekKey = getWeekKey(completedDate);
            ensureWeek(weekKey);
            weeklyData[weekKey].completed++;
          }
        }
      });
      
      const chartData = Object.entries(weeklyData)
        .map(([date, counts]) => ({ date, ...counts }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      res.json(chartData);
    } catch (error) {
      logger.error("Tasks", "Error fetching task chart data:", error);
      res.status(500).json({ message: "Failed to fetch task chart data" });
    }
  });

  app.get("/api/reviews/chart-data", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const days = parseInt(req.query.days as string) || 90;
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const allListings = workspaceId 
        ? await storage.getListingsByWorkspace(workspaceId)
        : await storage.getListingsByUser(userId);
      const syncedListingIds = new Set(allListings.filter(l => l.lastSyncedAt).map(l => l.id));
      
      const allReservations = workspaceId 
        ? await storage.getReservationsByWorkspace(workspaceId)
        : await storage.getReservationsByUser(userId);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const reviewReservations = allReservations.filter(r => {
        if (!r.publicReview && !r.privateRemarks) return false;
        if (!syncedListingIds.has(r.listingId)) return false;
        const reviewDate = r.reviewPostedAt || r.checkOutDate || r.createdAt;
        if (!reviewDate) return false;
        return new Date(reviewDate) >= cutoffDate;
      });
      
      const weeklyData: { [key: string]: { fiveStars: number; fourStars: number; lowStars: number } } = {};
      
      reviewReservations.forEach(reservation => {
        const reviewDate = reservation.reviewPostedAt || reservation.checkOutDate || reservation.createdAt;
        if (!reviewDate) return;
        
        const date = new Date(reviewDate);
        const dayOfWeek = date.getDay();
        const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const monday = new Date(date.setDate(diff));
        const weekKey = monday.toISOString().split('T')[0];
        
        if (!weeklyData[weekKey]) {
          weeklyData[weekKey] = { fiveStars: 0, fourStars: 0, lowStars: 0 };
        }
        
        const rating = reservation.guestRating || 5;
        if (rating >= 5) {
          weeklyData[weekKey].fiveStars++;
        } else if (rating >= 4) {
          weeklyData[weekKey].fourStars++;
        } else {
          weeklyData[weekKey].lowStars++;
        }
      });
      
      const chartData = Object.entries(weeklyData)
        .map(([date, counts]) => ({ date, ...counts }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      res.json(chartData);
    } catch (error) {
      logger.error("Tasks", "Error fetching reviews chart data:", error);
      res.status(500).json({ message: "Failed to fetch reviews chart data" });
    }
  });

  app.get("/api/dashboard/themes", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const allListings = workspaceId 
        ? await storage.getListingsByWorkspace(workspaceId)
        : await storage.getListingsByUser(userId);
      const syncedListingIds = new Set(allListings.filter(l => l.lastSyncedAt).map(l => l.id));
      
      const allThemes = workspaceId 
        ? await storage.getThemesByWorkspace(workspaceId)
        : await storage.getThemesByUser(userId);
      
      const themesWithCounts = await Promise.all(allThemes.map(async (theme) => {
        const themeTags = await storage.getTagsByTheme(theme.id);
        const syncedTags = themeTags.filter(tag => {
          if (!tag.listingId) return true;
          return syncedListingIds.has(tag.listingId);
        });
        return {
          id: theme.id,
          name: theme.name,
          icon: theme.icon,
          tagCount: syncedTags.length,
        };
      }));
      
      const sortedThemes = themesWithCounts
        .filter(t => t.tagCount > 0)
        .sort((a, b) => b.tagCount - a.tagCount);
      
      res.json(sortedThemes);
    } catch (error) {
      logger.error("Dashboard", "Error fetching dashboard themes:", error);
      res.status(500).json({ message: "Failed to fetch dashboard themes" });
    }
  });

  app.get("/api/dashboard/sentiment-heatmap", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const allListings = workspaceId 
        ? await storage.getListingsByWorkspace(workspaceId)
        : await storage.getListingsByUser(userId);
      const syncedListingIds = allListings.filter(l => l.lastSyncedAt).map(l => l.id);
      
      if (syncedListingIds.length === 0) {
        return res.json({ heatmapData: {} });
      }
      
      const allReservations = await Promise.all(
        syncedListingIds.map(listingId => storage.getReservationsByListing(listingId))
      );
      const reservations = allReservations.flat();
      
      const heatmapData: { [key: string]: number } = {};
      
      for (const reservation of reservations) {
        const aiScore = reservation.aiSentimentScore !== null && reservation.aiSentimentScore !== undefined
          ? Math.round(reservation.aiSentimentScore)
          : null;
        
        const guestRating = reservation.guestRating !== null && reservation.guestRating !== undefined
          ? Math.round(reservation.guestRating)
          : 0;
        
        if (aiScore !== null && aiScore >= 0 && aiScore <= 5) {
          const key = `${aiScore}-${guestRating}`;
          heatmapData[key] = (heatmapData[key] || 0) + 1;
        }
      }
      
      res.json({ heatmapData });
    } catch (error) {
      logger.error("Dashboard", "Error fetching sentiment heatmap:", error);
      res.status(500).json({ message: "Failed to fetch sentiment heatmap" });
    }
  });

  app.get("/api/dashboard/sentiment-reservations/:sentiment/:review", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const sentimentScore = parseInt(req.params.sentiment as string) || 0;
      const reviewRating = parseInt(req.params.review as string) || 0;
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const allListings = workspaceId 
        ? await storage.getListingsByWorkspace(workspaceId)
        : await storage.getListingsByUser(userId);
      const syncedListingIds = allListings.filter(l => l.lastSyncedAt).map(l => l.id);
      
      if (syncedListingIds.length === 0) {
        return res.json([]);
      }
      
      const allReservations = await Promise.all(
        syncedListingIds.map(listingId => storage.getReservationsByListing(listingId))
      );
      const reservations = allReservations.flat();
      
      const matchingReservations = reservations.filter(reservation => {
        const aiScore = reservation.aiSentimentScore !== null && reservation.aiSentimentScore !== undefined
          ? Math.round(Number(reservation.aiSentimentScore))
          : null;
        
        const guestRating = reservation.guestRating !== null && reservation.guestRating !== undefined
          ? Math.round(Number(reservation.guestRating))
          : 0;
        
        if (aiScore === null || aiScore < 0 || aiScore > 5) {
          return false;
        }
        
        const sentimentMatches = aiScore === sentimentScore;
        const reviewMatches = guestRating === reviewRating;
        
        return sentimentMatches && reviewMatches;
      });
      
      res.json(matchingReservations);
    } catch (error) {
      logger.error("Dashboard", "Error fetching sentiment reservations:", error);
      res.status(500).json({ message: "Failed to fetch sentiment reservations" });
    }
  });

  app.get("/api/tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const task = await storage.getTask(getParamId(req.params.id));
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      const hasAccess = task.userId === userId || 
        (workspaceId && task.workspaceId === workspaceId && await validateWorkspaceMembership(userId, workspaceId));
      
      if (!hasAccess) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      res.json(task);
    } catch (error) {
      logger.error("Tasks", "Error fetching task:", error);
      res.status(500).json({ message: "Failed to fetch task" });
    }
  });

  app.post("/api/tasks", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      let listingId = req.body.listingId;
      if (req.body.tagId) {
        const tag = await storage.getTag(req.body.tagId);
        if (!tag) {
          return res.status(403).json({ message: "Invalid tag reference" });
        }
        const hasTagAccess = tag.userId === userId || 
          (workspaceId && tag.workspaceId === workspaceId);
        if (!hasTagAccess) {
          return res.status(403).json({ message: "Invalid tag reference" });
        }
        if (!listingId) {
          listingId = tag.listingId;
        }
      }
      
      if (listingId) {
        const listing = await storage.getListing(listingId);
        if (!listing) {
          return res.status(403).json({ message: "Invalid listing reference" });
        }
        const hasListingAccess = listing.userId === userId || 
          (workspaceId && listing.workspaceId === workspaceId);
        if (!hasListingAccess) {
          return res.status(403).json({ message: "Invalid listing reference" });
        }
      }
      
      const taskData = { ...req.body, userId, listingId, workspaceId: workspaceId || undefined };
      if (taskData.dueDate && typeof taskData.dueDate === 'string') {
        taskData.dueDate = new Date(taskData.dueDate);
      }
      
      const parseResult = insertTaskSchema.safeParse(taskData);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid data", errors: parseResult.error.flatten() });
      }
      
      const task = await storage.createTask(parseResult.data);
      res.status(201).json(task);
    } catch (error) {
      logger.error("Tasks", "Error creating task:", error);
      res.status(500).json({ message: "Failed to create task" });
    }
  });

  app.patch("/api/tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const task = await storage.getTask(getParamId(req.params.id));
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      const hasAccess = task.userId === userId || 
        (workspaceId && task.workspaceId === workspaceId && await validateWorkspaceMembership(userId, workspaceId));
      
      if (!hasAccess) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      const updateSchema = insertTaskSchema.partial().omit({ userId: true, listingId: true, tagId: true });
      const parseResult = updateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid data", errors: parseResult.error.flatten() });
      }
      
      const safeUpdate = { ...req.body };
      delete safeUpdate.listingId;
      delete safeUpdate.tagId;
      delete safeUpdate.userId;
      delete safeUpdate.workspaceId;
      
      const updated = await storage.updateTask(getParamId(req.params.id), safeUpdate);
      res.json(updated);
    } catch (error) {
      logger.error("Tasks", "Error updating task:", error);
      res.status(500).json({ message: "Failed to update task" });
    }
  });

  app.delete("/api/tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const task = await storage.getTask(getParamId(req.params.id));
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      const hasAccess = task.userId === userId || 
        (workspaceId && task.workspaceId === workspaceId && await validateWorkspaceMembership(userId, workspaceId));
      
      if (!hasAccess) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      await storage.deleteTask(getParamId(req.params.id));
      res.status(204).send();
    } catch (error) {
      logger.error("Tasks", "Error deleting task:", error);
      res.status(500).json({ message: "Failed to delete task" });
    }
  });
}
