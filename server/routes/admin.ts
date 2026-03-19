import type { Express, Request, Response } from "express";
import type { IStorage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { z } from "zod";
import { db } from "../db";
import { isNotNull } from "drizzle-orm";
import {
  USER_ROLES,
  AI_MODELS,
  type AIModelId,
  type DataSource,
  procedures,
  cleaners,
  workspaces,
} from "@shared/schema";
import { logger } from "../logger";
import { getUserId, getParamId } from "./helpers";
import { openai, openrouter } from "./ai-helpers";

const isAppAdmin = async (
  userId: string,
  storage: IStorage,
): Promise<boolean> => {
  const user = await storage.getUser(userId);
  return user?.role === USER_ROLES.APP_ADMIN;
};

const hasAdminAccess = async (
  userId: string,
  storage: IStorage,
): Promise<boolean> => {
  const user = await storage.getUser(userId);
  return (
    user?.role === USER_ROLES.APP_ADMIN || user?.role === USER_ROLES.ADMIN_USER
  );
};

async function generateChangelogSuggestions(
  storage: IStorage,
  userId?: string,
): Promise<{ suggestions: any[]; message: string; latestCommit?: string }> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  const settings = await storage.getChangelogSettings();
  const lastProcessedCommit = settings?.lastProcessedCommit;

  let commits: {
    hash: string;
    fullHash: string;
    message: string;
    date: string;
  }[] = [];

  try {
    let gitCommand: string;
    if (lastProcessedCommit) {
      gitCommand = `git log ${lastProcessedCommit}..HEAD --pretty=format:"%H|||%s|||%ai" --no-merges 2>/dev/null || echo ""`;
    } else {
      gitCommand =
        'git log --since="7 days ago" --pretty=format:"%H|||%s|||%ai" --no-merges 2>/dev/null || echo ""';
    }

    const { stdout } = await execAsync(gitCommand);

    if (stdout.trim()) {
      commits = stdout
        .trim()
        .split("\n")
        .map((line) => {
          const [fullHash, message, date] = line.split("|||");
          return { hash: fullHash.substring(0, 7), fullHash, message, date };
        })
        .filter((c) => c.message);
    }
  } catch (gitError) {
    logger.info(
      "Changelog Suggest",
      "Git command failed, may not be in a git repository:",
      gitError,
    );
  }

  if (commits.length === 0) {
    return {
      suggestions: [],
      message: lastProcessedCommit
        ? "No new commits since last analysis"
        : "No recent commits found",
    };
  }

  const existingEntries = await storage.getChangelogEntries();
  const existingHashes = new Set(
    existingEntries.map((e) => e.commitHash).filter(Boolean),
  );

  const newCommits = commits.filter((c) => !existingHashes.has(c.hash));

  if (newCommits.length === 0) {
    if (commits.length > 0) {
      await storage.createOrUpdateChangelogSettings({
        lastProcessedCommit: commits[0].fullHash,
        lastSuggestRunAt: new Date(),
      });
    }
    return {
      suggestions: [],
      message: "All recent commits have already been processed",
    };
  }

  const prompt = `You are a product changelog writer for HostPulse, an AI-powered platform for short-term rental hosts. 
Analyze these git commits and generate user-friendly changelog entries. Focus on features that matter to hosts - skip technical/internal changes.

Git commits:
${newCommits.map((c) => `- ${c.message}`).join("\n")}

For each meaningful change (skip internal/technical ones), generate a changelog entry with:
- title: A catchy, user-friendly title (e.g., "Reviews Page Got a Fresh Look")
- description: A fun, conversational description of the change (1-2 sentences)
- location: Where in the product this change is (e.g., "Reviews Page", "Home Dashboard")
- hostBenefit: How this helps hosts (1 sentence)
- commitHash: The associated commit hash (first 7 characters)

Respond in JSON format:
{
  "entries": [
    {
      "title": "string",
      "description": "string",
      "location": "string",
      "hostBenefit": "string",
      "commitHash": "string"
    }
  ]
}

If there are no user-facing changes worth mentioning, return: { "entries": [] }`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a product changelog writer who creates fun, host-friendly update notes. Always respond with valid JSON.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const aiOutput = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(aiOutput);

  const createdEntries = [];
  for (const entry of parsed.entries || []) {
    if (entry.title && entry.description) {
      const created = await storage.createChangelogEntry({
        title: entry.title,
        description: entry.description,
        location: entry.location || null,
        hostBenefit: entry.hostBenefit || null,
        commitHash: entry.commitHash || null,
        status: "suggested",
      });
      createdEntries.push(created);
    }
  }

  if (userId) {
    await storage.createAiUsageLog({
      userId,
      label: "changelog_suggestion",
      model: "gpt-4.1-mini",
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      estimatedCost:
        ((response.usage?.prompt_tokens || 0) * 0.0004 +
          (response.usage?.completion_tokens || 0) * 0.0016) /
        1000,
    });
  }

  const latestCommit = commits[0]?.fullHash;
  if (latestCommit) {
    await storage.createOrUpdateChangelogSettings({
      lastProcessedCommit: latestCommit,
      lastSuggestRunAt: new Date(),
    });
  }

  return {
    suggestions: createdEntries,
    message: `Generated ${createdEntries.length} changelog suggestions from ${newCommits.length} commits`,
    latestCommit,
  };
}

let changelogSuggestScheduled = false;

export function scheduleChangelogSuggest(storage: IStorage) {
  if (changelogSuggestScheduled) {
    logger.info(
      "Changelog Suggest",
      "Already scheduled, skipping duplicate registration",
    );
    return;
  }
  changelogSuggestScheduled = true;

  const CHECK_INTERVAL_MS = 60 * 1000;

  const runCheck = async () => {
    try {
      const settings = await storage.getChangelogSettings();
      if (!settings || !settings.suggestEnabled) {
        return;
      }

      const now = new Date();
      const easternTime = new Date(
        now.toLocaleString("en-US", { timeZone: "America/New_York" }),
      );
      const currentHour = easternTime.getHours().toString().padStart(2, "0");
      const currentMinute = easternTime
        .getMinutes()
        .toString()
        .padStart(2, "0");

      const [configHour] = settings.suggestTime.split(":");
      if (currentHour !== configHour || currentMinute !== "00") {
        return;
      }

      if (settings.lastSuggestRunAt) {
        const lastRun = new Date(settings.lastSuggestRunAt);
        const daysSinceLastRun = Math.floor(
          (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (daysSinceLastRun < settings.suggestIntervalDays) {
          return;
        }
      }

      logger.info(
        "Changelog Suggest",
        `Running scheduled suggestion generation at ${currentHour}:${currentMinute} ET`,
      );

      try {
        const result = await generateChangelogSuggestions(storage);
        logger.info("Changelog Suggest", result.message);
      } catch (err) {
        logger.error(
          "Changelog Suggest",
          "Failed to generate suggestions:",
          err,
        );
      }
    } catch (error) {
      logger.error("Changelog Suggest", "Check failed:", error);
    }
  };

  setInterval(runCheck, CHECK_INTERVAL_MS);

  logger.info(
    "Changelog Suggest",
    "Scheduled to check every minute for configured suggest time",
  );
}

let changelogSendScheduled = false;

export function scheduleChangelogSend(storage: IStorage) {
  if (changelogSendScheduled) {
    logger.info(
      "Changelog Scheduler",
      "Already scheduled, skipping duplicate registration",
    );
    return;
  }
  changelogSendScheduled = true;

  const CHECK_INTERVAL_MS = 60 * 1000;

  const runCheck = async () => {
    try {
      const settings = await storage.getChangelogSettings();
      if (!settings || !settings.isEnabled) {
        return;
      }

      const now = new Date();
      const easternTime = new Date(
        now.toLocaleString("en-US", { timeZone: "America/New_York" }),
      );
      const currentHour = easternTime.getHours().toString().padStart(2, "0");
      const currentMinute = easternTime
        .getMinutes()
        .toString()
        .padStart(2, "0");
      const currentTime = `${currentHour}:${currentMinute}`;

      const [configHour] = settings.sendTime.split(":");
      if (currentHour !== configHour || currentMinute !== "00") {
        return;
      }

      if (settings.lastSentAt) {
        const lastSent = new Date(settings.lastSentAt);
        const lastSentEastern = new Date(
          lastSent.toLocaleString("en-US", { timeZone: "America/New_York" }),
        );
        if (lastSentEastern.toDateString() === easternTime.toDateString()) {
          return;
        }
      }

      logger.info(
        "Changelog Scheduler",
        "Running scheduled send at",
        currentTime,
        "ET",
      );

      const approvedEntries =
        await storage.getChangelogEntriesByStatus("approved");

      if (approvedEntries.length === 0) {
        logger.info("Changelog Scheduler", "No approved entries to send");
        return;
      }

      const users = await storage.getAllUsers();
      const notificationType = settings.notificationType;

      if (notificationType === "email" || notificationType === "both") {
        const { sendChangelogEmail } = await import("../services/email");

        for (const user of users) {
          if (user.email) {
            try {
              await sendChangelogEmail({
                toEmail: user.email,
                entries: approvedEntries.map((e) => ({
                  title: e.title,
                  description: e.description,
                  location: e.location,
                  hostBenefit: e.hostBenefit,
                })),
              });
            } catch (err) {
              logger.error(
                "Changelog Scheduler",
                `Failed to send email to ${user.email}:`,
                err,
              );
            }
          }
        }
      }

      if (notificationType === "in_app" || notificationType === "both") {
        logger.info(
          "Changelog Scheduler",
          "In-app notifications would be sent here",
        );
      }

      const sentAt = new Date();
      for (const entry of approvedEntries) {
        await storage.updateChangelogEntry(entry.id, {
          status: "sent",
          sentAt,
        });
      }

      await storage.createOrUpdateChangelogSettings({
        ...settings,
        lastSentAt: sentAt,
      });

      logger.info(
        "Changelog Scheduler",
        `Sent ${approvedEntries.length} changelog entries`,
      );
    } catch (error) {
      logger.error("Changelog Scheduler", "Send failed:", error);
    }
  };

  setInterval(runCheck, CHECK_INTERVAL_MS);

  runCheck();

  logger.info(
    "Changelog Scheduler",
    "Scheduled to check every minute for configured send time",
  );
}

const ALL_NAV_ITEMS = [
  { id: "home", title: "Home", parent: null },
  { id: "inbox", title: "Inbox", parent: null },
  { id: "ask-lumi", title: "Ask Lumi", parent: null },
  { id: "insights", title: "Insights", parent: null },
  { id: "tags", title: "Tags", parent: "insights" },
  { id: "themes", title: "Themes", parent: "insights" },
  { id: "reservations", title: "Reservations", parent: "insights" },
  { id: "reviews", title: "Reviews", parent: "insights" },
  { id: "operations", title: "Operations", parent: null },
  { id: "tasks", title: "Tasks", parent: "operations" },
  { id: "procedures", title: "Procedures", parent: "operations" },
  { id: "modules", title: "Modules", parent: "operations" },
  { id: "cleaners", title: "Cleaners", parent: "operations" },
  { id: "assets", title: "Assets", parent: "operations" },
  { id: "reports", title: "Reports", parent: null },
  { id: "teams", title: "Teams", parent: null },
  { id: "data-sources", title: "Data Sources", parent: null },
  { id: "data-sources-main", title: "Data Sources", parent: "data-sources" },
  { id: "properties", title: "Properties", parent: "data-sources" },
  { id: "ai-agents", title: "AI Agents", parent: null },
  { id: "listing-analysis", title: "Listing Analysis", parent: "ai-agents" },
  { id: "appeal", title: "Resolution Appeal", parent: "ai-agents" },
  { id: "review-removal", title: "Review Removal", parent: "ai-agents" },
  { id: "nudge", title: "Nudge", parent: "ai-agents" },
];

export function registerAdminRoutes(app: Express, storage: IStorage): void {
  // =====================
  // Admin: Procedure Template Management
  // =====================

  app.get(
    "/api/admin/procedure-template",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        if (!(await isAppAdmin(userId, storage))) {
          return res
            .status(403)
            .json({ message: "Access denied. Application Admin required." });
        }
        const template = await storage.getProcedureTemplate();
        res.json(template);
      } catch (error) {
        logger.error("Admin", "Error fetching procedure template:", error);
        res.status(500).json({ message: "Failed to fetch procedure template" });
      }
    },
  );

  app.put(
    "/api/admin/procedure-template",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        if (!(await isAppAdmin(userId, storage))) {
          return res
            .status(403)
            .json({ message: "Access denied. Application Admin required." });
        }
        const { title, description, steps } = req.body;
        if (!title || !Array.isArray(steps)) {
          return res
            .status(400)
            .json({ message: "Title and steps array are required" });
        }
        const template = await storage.saveProcedureTemplate({
          title,
          description,
          updatedByUserId: userId,
          steps,
        });
        res.json(template);
      } catch (error) {
        logger.error("Admin", "Error saving procedure template:", error);
        res.status(500).json({ message: "Failed to save procedure template" });
      }
    },
  );

  app.post(
    "/api/admin/procedure-template/import/:procedureId",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        if (!(await isAppAdmin(userId, storage))) {
          return res
            .status(403)
            .json({ message: "Access denied. Application Admin required." });
        }
        const procedureId = getParamId(req.params.procedureId);
        const procedure = await storage.getProcedure(procedureId);
        if (!procedure) {
          return res.status(404).json({ message: "Procedure not found" });
        }
        const steps = await storage.getProcedureSteps(procedureId);
        const template = await storage.saveProcedureTemplate({
          title: procedure.title,
          description: procedure.description || undefined,
          updatedByUserId: userId,
          steps: steps.map((s) => ({
            stepOrder: s.stepOrder,
            label: s.label,
            description: s.description || undefined,
            moduleTitle: s.moduleTitle || undefined,
            moduleOrder: s.moduleOrder || undefined,
            requiresPhotoVerification: s.requiresPhotoVerification,
            photoVerificationMode: s.photoVerificationMode,
            requiresGpsVerification: s.requiresGpsVerification,
            gpsRadiusMeters: s.gpsRadiusMeters || undefined,
          })),
        });
        res.json(template);
      } catch (error) {
        logger.error("Admin", "Error importing procedure as template:", error);
        res
          .status(500)
          .json({ message: "Failed to import procedure as template" });
      }
    },
  );

  app.get("/api/admin/all-procedures", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }
      const allProcs = await db
        .select({
          id: procedures.id,
          title: procedures.title,
          status: procedures.status,
          workspaceId: procedures.workspaceId,
        })
        .from(procedures)
        .orderBy(procedures.title);

      const result = await Promise.all(
        allProcs.map(async (p) => {
          const steps = await storage.getProcedureSteps(p.id);
          return { ...p, stepCount: steps.length };
        }),
      );

      res.json(result);
    } catch (error) {
      logger.error("Admin", "Error fetching all procedures:", error);
      res.status(500).json({ message: "Failed to fetch procedures" });
    }
  });

  // =====================
  // Admin: AI Prompts Management
  // =====================

  app.get("/api/admin/prompts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const category = req.query.category as string | undefined;
      const prompts = category
        ? await storage.getPromptsByCategory(category)
        : await storage.getAllPrompts();
      res.json(prompts);
    } catch (error) {
      logger.error("Admin", "Error fetching prompts:", error);
      res.status(500).json({ message: "Failed to fetch prompts" });
    }
  });

  app.get(
    "/api/admin/prompts/category/:category",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        if (!(await isAppAdmin(userId, storage))) {
          return res
            .status(403)
            .json({ message: "Access denied. Application Admin required." });
        }

        const prompt = await storage.getPromptByCategory(
          getParamId(req.params.category),
        );
        if (!prompt) {
          return res
            .status(404)
            .json({ message: "Prompt not found for category" });
        }
        res.json(prompt);
      } catch (error) {
        logger.error("Admin", "Error fetching prompt by category:", error);
        res.status(500).json({ message: "Failed to fetch prompt" });
      }
    },
  );

  app.post("/api/admin/themes/backfill", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const allWorkspaces = await db.select().from(workspaces);
      let seededCount = 0;
      let skippedCount = 0;

      for (const workspace of allWorkspaces) {
        const existingThemes = await storage.getThemesByWorkspace(workspace.id);
        if (existingThemes.length === 0) {
          await storage.seedDefaultThemes(workspace.id, workspace.createdBy);
          seededCount++;
        } else {
          skippedCount++;
        }
      }

      res.json({
        message: "Theme backfill complete",
        workspacesSeeded: seededCount,
        workspacesSkipped: skippedCount,
      });
    } catch (error) {
      logger.error("Admin", "Error backfilling themes:", error);
      res.status(500).json({ message: "Failed to backfill themes" });
    }
  });

  app.get("/api/admin/themes", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const { DEFAULT_THEMES } = await import("@shared/schema");
      res.json(DEFAULT_THEMES);
    } catch (error) {
      logger.error("Admin", "Error fetching admin themes:", error);
      res.status(500).json({ message: "Failed to fetch themes" });
    }
  });

  app.post("/api/admin/prompts/seed", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      await storage.seedDefaultPrompts();
      const prompts = await storage.getAllPrompts();
      res.json({
        message: "Default prompts seeded successfully",
        count: prompts.length,
      });
    } catch (error) {
      logger.error("Admin", "Error seeding prompts:", error);
      res.status(500).json({ message: "Failed to seed prompts" });
    }
  });

  app.get("/api/admin/prompts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const prompt = await storage.getPrompt(getParamId(req.params.id));
      if (!prompt) {
        return res.status(404).json({ message: "Prompt not found" });
      }
      res.json(prompt);
    } catch (error) {
      logger.error("Admin", "Error fetching prompt:", error);
      res.status(500).json({ message: "Failed to fetch prompt" });
    }
  });

  app.post("/api/admin/prompts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const promptSchema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        promptTemplate: z.string().optional(),
        modelId: z.string().optional(),
        isActive: z.string().optional().default("true"),
        category: z.string().optional(),
        systemPrompt: z.string().optional(),
      });

      const parseResult = promptSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res
          .status(400)
          .json({
            message: "Invalid data",
            errors: parseResult.error.flatten(),
          });
      }

      const prompt = await storage.createPrompt({
        ...parseResult.data,
        createdBy: userId,
      });
      res.status(201).json(prompt);
    } catch (error) {
      logger.error("Admin", "Error creating prompt:", error);
      res.status(500).json({ message: "Failed to create prompt" });
    }
  });

  app.patch("/api/admin/prompts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const prompt = await storage.getPrompt(getParamId(req.params.id));
      if (!prompt) {
        return res.status(404).json({ message: "Prompt not found" });
      }

      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        promptTemplate: z.string().optional(),
        modelId: z.string().nullable().optional(),
        isActive: z.string().optional(),
        category: z.string().optional(),
        systemPrompt: z.string().optional(),
      });

      const parseResult = updateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res
          .status(400)
          .json({
            message: "Invalid data",
            errors: parseResult.error.flatten(),
          });
      }

      const updated = await storage.updatePrompt(getParamId(req.params.id), {
        ...parseResult.data,
        updatedBy: userId,
      });
      res.json(updated);
    } catch (error) {
      logger.error("Admin", "Error updating prompt:", error);
      res.status(500).json({ message: "Failed to update prompt" });
    }
  });

  app.delete("/api/admin/prompts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const prompt = await storage.getPrompt(getParamId(req.params.id));
      if (!prompt) {
        return res.status(404).json({ message: "Prompt not found" });
      }

      await storage.deletePrompt(getParamId(req.params.id));
      res.status(204).send();
    } catch (error) {
      logger.error("Admin", "Error deleting prompt:", error);
      res.status(500).json({ message: "Failed to delete prompt" });
    }
  });

  // =====================
  // Admin: AI Model Settings
  // =====================

  app.get("/api/admin/ai-model", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const setting = await storage.getSystemSetting("ai_model");
      const currentModel = setting?.value || "gpt-4.1-mini";
      res.json({
        model: currentModel,
        updatedAt: setting?.updatedAt,
        updatedBy: setting?.updatedBy,
      });
    } catch (error) {
      logger.error("Admin", "Error fetching AI model setting:", error);
      res.status(500).json({ message: "Failed to fetch AI model setting" });
    }
  });

  app.post("/api/admin/ai-model", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const { AI_MODELS } = await import("@shared/schema");
      const validModels = Object.keys(AI_MODELS);

      const modelSchema = z.object({
        model: z.enum(validModels as [string, ...string[]]),
        updatePrompts: z
          .enum(["using-default", "using-old-default", "none"])
          .optional(),
        oldModel: z.string().optional(),
      });

      const parseResult = modelSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res
          .status(400)
          .json({
            message: "Invalid model",
            errors: parseResult.error.flatten(),
          });
      }

      const { model, updatePrompts, oldModel } = parseResult.data;
      let promptsUpdated = 0;

      if (updatePrompts && updatePrompts !== "none") {
        const allPrompts = await storage.getAllPrompts();

        if (updatePrompts === "using-default") {
          const promptsToUpdate = allPrompts.filter((p) => !p.modelId);
          for (const prompt of promptsToUpdate) {
            await storage.updatePrompt(prompt.id, { modelId: model });
            promptsUpdated++;
          }
        } else if (updatePrompts === "using-old-default" && oldModel) {
          const promptsToUpdate = allPrompts.filter(
            (p) => p.modelId === oldModel,
          );
          for (const prompt of promptsToUpdate) {
            await storage.updatePrompt(prompt.id, { modelId: model });
            promptsUpdated++;
          }
        }
      }

      const setting = await storage.setSystemSetting("ai_model", model, userId);
      res.json({
        model: setting.value,
        updatedAt: setting.updatedAt,
        updatedBy: setting.updatedBy,
        promptsUpdated,
      });
    } catch (error) {
      logger.error("Admin", "Error setting AI model:", error);
      res.status(500).json({ message: "Failed to set AI model" });
    }
  });

  // =====================
  // Admin: Category Weights for Overall Grade
  // =====================

  const DEFAULT_CATEGORY_WEIGHTS: Record<string, number> = {
    title: 10,
    description: 15,
    pet: 5,
    reviews: 20,
    photos: 15,
    sleep: 10,
    host_profile: 5,
    guest_favorites: 5,
    superhost_status: 5,
    ideal_guest_profile: 10,
  };

  app.get("/api/admin/category-weights", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }
      const setting = await storage.getSystemSetting("category_weights");
      let weights = DEFAULT_CATEGORY_WEIGHTS;
      if (setting?.value) {
        try {
          weights = JSON.parse(setting.value);
        } catch {}
      }
      res.json({
        weights,
        updatedAt: setting?.updatedAt,
        updatedBy: setting?.updatedBy,
      });
    } catch (error) {
      logger.error("Admin", "Error fetching category weights:", error);
      res.status(500).json({ message: "Failed to fetch category weights" });
    }
  });

  app.post("/api/admin/category-weights", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }
      const weightsSchema = z.object({
        weights: z.record(z.string(), z.number().min(0).max(100)),
      });
      const parseResult = weightsSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res
          .status(400)
          .json({
            message: "Invalid weights",
            errors: parseResult.error.flatten(),
          });
      }
      const { weights } = parseResult.data;
      const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
      if (totalWeight === 0) {
        return res.status(400).json({ message: "Total weight cannot be zero" });
      }
      const setting = await storage.setSystemSetting(
        "category_weights",
        JSON.stringify(weights),
        userId,
      );
      res.json({
        weights,
        updatedAt: setting.updatedAt,
        updatedBy: setting.updatedBy,
      });
    } catch (error) {
      logger.error("Admin", "Error saving category weights:", error);
      res.status(500).json({ message: "Failed to save category weights" });
    }
  });

  // =====================
  // Admin: Sync AI Model Setting
  // =====================

  app.get("/api/admin/sync-ai-model", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const setting = await storage.getSystemSetting("sync_ai_model");
      if (!setting?.value) {
        const generalSetting = await storage.getSystemSetting("ai_model");
        const fallbackModel = generalSetting?.value || "gpt-4.1-mini";
        return res.json({
          model: fallbackModel,
          updatedAt: null,
          updatedBy: null,
          isDefault: true,
        });
      }
      res.json({
        model: setting.value,
        updatedAt: setting.updatedAt,
        updatedBy: setting.updatedBy,
        isDefault: false,
      });
    } catch (error) {
      logger.error("Admin", "Error fetching sync AI model setting:", error);
      res
        .status(500)
        .json({ message: "Failed to fetch sync AI model setting" });
    }
  });

  app.post("/api/admin/sync-ai-model", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const { AI_MODELS } = await import("@shared/schema");
      const validModels = Object.keys(AI_MODELS);

      const modelSchema = z.object({
        model: z.enum(validModels as [string, ...string[]]),
      });

      const parseResult = modelSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res
          .status(400)
          .json({
            message: "Invalid model",
            errors: parseResult.error.flatten(),
          });
      }

      const { model } = parseResult.data;
      const setting = await storage.setSystemSetting(
        "sync_ai_model",
        model,
        userId,
      );
      res.json({
        model: setting.value,
        updatedAt: setting.updatedAt,
        updatedBy: setting.updatedBy,
      });
    } catch (error) {
      logger.error("Admin", "Error setting sync AI model:", error);
      res.status(500).json({ message: "Failed to set sync AI model" });
    }
  });

  // =====================
  // Admin: Sentiment AI Model Setting
  // =====================

  app.get(
    "/api/admin/sentiment-ai-model",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        if (!(await isAppAdmin(userId, storage))) {
          return res
            .status(403)
            .json({ message: "Access denied. Application Admin required." });
        }

        const setting = await storage.getSystemSetting("sentiment_ai_model");
        if (!setting?.value) {
          const generalSetting = await storage.getSystemSetting("ai_model");
          const fallbackModel = generalSetting?.value || "gpt-4.1-mini";
          return res.json({
            model: fallbackModel,
            updatedAt: null,
            updatedBy: null,
            isDefault: true,
          });
        }
        res.json({
          model: setting.value,
          updatedAt: setting.updatedAt,
          updatedBy: setting.updatedBy,
          isDefault: false,
        });
      } catch (error) {
        logger.error(
          "Admin",
          "Error fetching sentiment AI model setting:",
          error,
        );
        res
          .status(500)
          .json({ message: "Failed to fetch sentiment AI model setting" });
      }
    },
  );

  app.post(
    "/api/admin/sentiment-ai-model",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        if (!(await isAppAdmin(userId, storage))) {
          return res
            .status(403)
            .json({ message: "Access denied. Application Admin required." });
        }

        const { AI_MODELS } = await import("@shared/schema");
        const validModels = Object.keys(AI_MODELS);

        const modelSchema = z.object({
          model: z.enum(validModels as [string, ...string[]]),
        });

        const parseResult = modelSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res
            .status(400)
            .json({
              message: "Invalid model",
              errors: parseResult.error.flatten(),
            });
        }

        const { model } = parseResult.data;
        const setting = await storage.setSystemSetting(
          "sentiment_ai_model",
          model,
          userId,
        );
        res.json({
          model: setting.value,
          updatedAt: setting.updatedAt,
          updatedBy: setting.updatedBy,
        });
      } catch (error) {
        logger.error("Admin", "Error setting sentiment AI model:", error);
        res.status(500).json({ message: "Failed to set sentiment AI model" });
      }
    },
  );

  // =====================
  // Admin: User Management
  // =====================

  app.get("/api/admin/users", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await hasAdminAccess(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Admin access required." });
      }

      const allUsers = await storage.getAllUsers();

      const allCleanerProfiles = await db
        .select()
        .from(cleaners)
        .where(isNotNull(cleaners.userId));

      const cleanersByUserId = new Map<string, typeof allCleanerProfiles>();
      for (const c of allCleanerProfiles) {
        if (!c.userId) continue;
        const list = cleanersByUserId.get(c.userId) || [];
        list.push(c);
        cleanersByUserId.set(c.userId, list);
      }

      const usersWithWorkspaces = await Promise.all(
        allUsers.map(async (user) => {
          const userWorkspaces = await storage.getWorkspacesByUser(user.id);
          const cleanerProfiles = cleanersByUserId.get(user.id) || [];
          return {
            ...user,
            workspaces: userWorkspaces.map((w) => ({ id: w.id, name: w.name })),
            cleanerProfiles: cleanerProfiles.map((c) => ({
              id: c.id,
              name: c.name,
              type: c.type,
              workspaceId: c.workspaceId,
              parentId: c.parentId,
            })),
          };
        }),
      );

      res.json(usersWithWorkspaces);
    } catch (error) {
      logger.error("Admin", "Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.patch("/api/admin/users/:id/role", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const roleSchema = z.object({
        role: z.enum([
          USER_ROLES.APP_ADMIN,
          USER_ROLES.ADMIN_USER,
          USER_ROLES.USER_MANAGER,
          USER_ROLES.USER_STAFF,
        ]),
      });

      const parseResult = roleSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res
          .status(400)
          .json({
            message: "Invalid role",
            errors: parseResult.error.flatten(),
          });
      }

      const updated = await storage.updateUserRole(
        getParamId(req.params.id),
        parseResult.data.role,
      );
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(updated);
    } catch (error) {
      logger.error("Admin", "Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  app.delete("/api/admin/users/:id", isAuthenticated, async (req, res) => {
    try {
      const currentUserId = getUserId(req);
      if (!(await isAppAdmin(currentUserId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const targetUserId = getParamId(req.params.id);

      if (targetUserId === currentUserId) {
        return res
          .status(400)
          .json({ message: "Cannot delete your own account" });
      }

      await storage.deleteUser(targetUserId);
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      logger.error("Admin", "Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // =====================
  // Admin: Role Permissions Management
  // =====================

  app.get("/api/admin/permissions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const navItemIds = ALL_NAV_ITEMS.map((item) => item.id);
      await storage.initializeDefaultPermissions(navItemIds);

      const permissions = await storage.getRolePermissions();
      res.json({
        navItems: ALL_NAV_ITEMS,
        permissions: permissions.map((p) => ({
          id: p.id,
          role: p.role,
          navItemId: p.navItemId,
          enabled: p.enabled === "true",
        })),
      });
    } catch (error) {
      logger.error("Admin", "Error fetching role permissions:", error);
      res.status(500).json({ message: "Failed to fetch role permissions" });
    }
  });

  app.patch("/api/admin/permissions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const schema = z.object({
        role: z.enum(["user_manager", "user_staff"]),
        navItemId: z.string(),
        enabled: z.boolean(),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res
          .status(400)
          .json({
            message: "Invalid request",
            errors: parseResult.error.flatten(),
          });
      }

      const { role, navItemId, enabled } = parseResult.data;
      const permission = await storage.upsertRolePermission(
        role,
        navItemId,
        enabled,
      );

      res.json({
        id: permission.id,
        role: permission.role,
        navItemId: permission.navItemId,
        enabled: permission.enabled === "true",
      });
    } catch (error) {
      logger.error("Admin", "Error updating role permission:", error);
      res.status(500).json({ message: "Failed to update role permission" });
    }
  });

  app.get("/api/user/permissions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (
        user.role === USER_ROLES.APP_ADMIN ||
        user.role === USER_ROLES.ADMIN_USER
      ) {
        return res.json({
          fullAccess: true,
          disabledNavItems: [],
        });
      }

      const permissions = await storage.getRolePermissionsByRole(user.role);
      const disabledNavItems = permissions
        .filter((p) => p.enabled === "false")
        .map((p) => p.navItemId);

      res.json({
        fullAccess: false,
        disabledNavItems,
      });
    } catch (error) {
      logger.error("Admin", "Error fetching user permissions:", error);
      res.status(500).json({ message: "Failed to fetch user permissions" });
    }
  });

  // =====================
  // Admin: Changelog Management
  // =====================

  app.get(
    "/api/admin/changelog/settings",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        if (!(await isAppAdmin(userId, storage))) {
          return res
            .status(403)
            .json({ message: "Access denied. Application Admin required." });
        }

        const settings = await storage.getChangelogSettings();
        res.json(
          settings || {
            sendTime: "09:00",
            notificationType: "both",
            isEnabled: true,
          },
        );
      } catch (error) {
        logger.error("Admin", "Error fetching changelog settings:", error);
        res.status(500).json({ message: "Failed to fetch changelog settings" });
      }
    },
  );

  app.post(
    "/api/admin/changelog/settings",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        if (!(await isAppAdmin(userId, storage))) {
          return res
            .status(403)
            .json({ message: "Access denied. Application Admin required." });
        }

        const settingsSchema = z.object({
          sendTime: z
            .string()
            .regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format"),
          notificationType: z.enum(["email", "in_app", "both"]),
          isEnabled: z.boolean().optional(),
        });

        const parseResult = settingsSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res
            .status(400)
            .json({
              message: "Invalid settings",
              errors: parseResult.error.flatten(),
            });
        }

        const settings = await storage.createOrUpdateChangelogSettings(
          parseResult.data,
        );
        res.json(settings);
      } catch (error) {
        logger.error("Admin", "Error updating changelog settings:", error);
        res
          .status(500)
          .json({ message: "Failed to update changelog settings" });
      }
    },
  );

  app.get("/api/admin/changelog/entries", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const entries = await storage.getChangelogEntries();
      res.json(entries);
    } catch (error) {
      logger.error("Admin", "Error fetching changelog entries:", error);
      res.status(500).json({ message: "Failed to fetch changelog entries" });
    }
  });

  app.post(
    "/api/admin/changelog/entries",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        if (!(await isAppAdmin(userId, storage))) {
          return res
            .status(403)
            .json({ message: "Access denied. Application Admin required." });
        }

        const entrySchema = z.object({
          title: z.string().min(1).max(255),
          description: z.string().min(1),
          location: z.string().optional(),
          hostBenefit: z.string().optional(),
          status: z
            .enum(["suggested", "approved", "sent", "dismissed"])
            .optional(),
        });

        const parseResult = entrySchema.safeParse(req.body);
        if (!parseResult.success) {
          return res
            .status(400)
            .json({
              message: "Invalid entry data",
              errors: parseResult.error.flatten(),
            });
        }

        const entry = await storage.createChangelogEntry({
          ...parseResult.data,
          status: parseResult.data.status || "suggested",
        });
        res.json(entry);
      } catch (error) {
        logger.error("Admin", "Error creating changelog entry:", error);
        res.status(500).json({ message: "Failed to create changelog entry" });
      }
    },
  );

  app.patch(
    "/api/admin/changelog/entries/:id",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        if (!(await isAppAdmin(userId, storage))) {
          return res
            .status(403)
            .json({ message: "Access denied. Application Admin required." });
        }

        const entrySchema = z.object({
          title: z.string().min(1).max(255).optional(),
          description: z.string().min(1).optional(),
          location: z.string().optional(),
          hostBenefit: z.string().optional(),
          status: z
            .enum(["suggested", "approved", "sent", "dismissed"])
            .optional(),
          approvedAt: z.string().datetime().optional().nullable(),
          sentAt: z.string().datetime().optional().nullable(),
        });

        const parseResult = entrySchema.safeParse(req.body);
        if (!parseResult.success) {
          return res
            .status(400)
            .json({
              message: "Invalid entry data",
              errors: parseResult.error.flatten(),
            });
        }

        const updateData: any = { ...parseResult.data };
        if (parseResult.data.approvedAt !== undefined) {
          updateData.approvedAt = parseResult.data.approvedAt
            ? new Date(parseResult.data.approvedAt)
            : null;
        }
        if (parseResult.data.sentAt !== undefined) {
          updateData.sentAt = parseResult.data.sentAt
            ? new Date(parseResult.data.sentAt)
            : null;
        }

        if (parseResult.data.status === "approved" && !updateData.approvedAt) {
          updateData.approvedAt = new Date();
        }

        const entry = await storage.updateChangelogEntry(
          req.params.id,
          updateData,
        );
        if (!entry) {
          return res.status(404).json({ message: "Changelog entry not found" });
        }
        res.json(entry);
      } catch (error) {
        logger.error("Admin", "Error updating changelog entry:", error);
        res.status(500).json({ message: "Failed to update changelog entry" });
      }
    },
  );

  app.delete(
    "/api/admin/changelog/entries/:id",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        if (!(await isAppAdmin(userId, storage))) {
          return res
            .status(403)
            .json({ message: "Access denied. Application Admin required." });
        }

        await storage.deleteChangelogEntry(req.params.id);
        res.json({ message: "Changelog entry deleted successfully" });
      } catch (error) {
        logger.error("Admin", "Error deleting changelog entry:", error);
        res.status(500).json({ message: "Failed to delete changelog entry" });
      }
    },
  );

  app.post(
    "/api/admin/changelog/generate-suggestions",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        if (!(await isAppAdmin(userId, storage))) {
          return res
            .status(403)
            .json({ message: "Access denied. Application Admin required." });
        }

        const result = await generateChangelogSuggestions(storage, userId);
        res.json(result);
      } catch (error) {
        logger.error("Admin", "Error generating changelog suggestions:", error);
        res
          .status(500)
          .json({ message: "Failed to generate changelog suggestions" });
      }
    },
  );

  app.get("/api/changelog", async (_req, res) => {
    try {
      const entries = await storage.getSentChangelogEntries();
      res.json(entries);
    } catch (error) {
      logger.error("Admin", "Error fetching public changelog:", error);
      res.status(500).json({ message: "Failed to fetch changelog" });
    }
  });

  // =====================
  // Admin: User Impersonation
  // =====================

  app.post("/api/admin/impersonate/:id", isAuthenticated, async (req, res) => {
    try {
      const adminUserId = getUserId(req);
      if (!(await isAppAdmin(adminUserId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const targetUserId = getParamId(req.params.id);
      const targetUser = await storage.getUser(targetUserId);

      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      if (targetUserId === adminUserId) {
        return res.status(400).json({ message: "Cannot impersonate yourself" });
      }

      const user = req.user as any;
      user.originalAdminId = adminUserId;
      user.originalAdminClaims = { ...user.claims };
      user.isImpersonating = true;
      user.impersonatedUserId = targetUserId;

      user.claims = {
        ...user.claims,
        sub: targetUserId,
        email: targetUser.email,
        first_name: targetUser.firstName,
        last_name: targetUser.lastName,
        profile_image_url: targetUser.profileImageUrl,
      };

      // Persist impersonation state to session
      req.session.save((err) => {
        if (err) {
          logger.error(
            "Admin",
            "Failed to save session during impersonation:",
            err,
          );
        }
      });

      res.json({
        success: true,
        impersonating: {
          id: targetUser.id,
          email: targetUser.email,
          firstName: targetUser.firstName,
          lastName: targetUser.lastName,
        },
      });
    } catch (error) {
      logger.error("Admin", "Error starting impersonation:", error);
      res.status(500).json({ message: "Failed to start impersonation" });
    }
  });

  app.post(
    "/api/admin/stop-impersonation",
    isAuthenticated,
    async (req, res) => {
      try {
        const user = req.user as any;

        if (!user.isImpersonating) {
          return res
            .status(400)
            .json({ message: "Not currently impersonating" });
        }

        user.claims = user.originalAdminClaims;
        user.isImpersonating = false;
        delete user.originalAdminId;
        delete user.originalAdminClaims;
        delete user.impersonatedUserId;

        // Persist session after clearing impersonation
        req.session.save((err) => {
          if (err) {
            logger.error(
              "Admin",
              "Failed to save session after stop-impersonation:",
              err,
            );
          }
        });

        res.json({ success: true });
      } catch (error) {
        logger.error("Admin", "Error stopping impersonation:", error);
        res.status(500).json({ message: "Failed to stop impersonation" });
      }
    },
  );

  app.get(
    "/api/admin/impersonation-status",
    isAuthenticated,
    async (req, res) => {
      try {
        const user = req.user as any;

        if (user.role !== "app_admin" && !user.isImpersonating) {
          res.json({ isImpersonating: false });
          return;
        }

        if (user.isImpersonating) {
          const impersonatedUser = await storage.getUser(
            user.impersonatedUserId,
          );
          res.json({
            isImpersonating: true,
            impersonatedUser: impersonatedUser
              ? {
                  id: impersonatedUser.id,
                  email: impersonatedUser.email,
                  firstName: impersonatedUser.firstName,
                  lastName: impersonatedUser.lastName,
                }
              : null,
          });
        } else {
          res.json({ isImpersonating: false });
        }
      } catch (error) {
        logger.error("Admin", "Error checking impersonation status:", error);
        res
          .status(500)
          .json({ message: "Failed to check impersonation status" });
      }
    },
  );

  // =====================
  // Admin: AI Usage Logs
  // =====================

  app.get("/api/admin/ai-usage", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const logs = await storage.getAllAiUsageLogs();
      res.json(logs);
    } catch (error) {
      logger.error("Admin", "Error fetching AI usage logs:", error);
      res.status(500).json({ message: "Failed to fetch AI usage logs" });
    }
  });

  // =====================
  // Admin: AI Speed Test
  // =====================

  const speedTestSchema = z.object({
    prompt: z
      .string()
      .min(1, "Prompt is required")
      .max(5000, "Prompt too long"),
    openaiModel: z.string().optional(),
    grokModel: z.string().optional(),
  });

  app.post("/api/admin/ai-speed-test", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const parseResult = speedTestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          message: "Invalid request",
          errors: parseResult.error.errors,
        });
      }

      const { prompt, openaiModel, grokModel } = parseResult.data;

      const testPrompt =
        prompt ||
        "Analyze this short-term rental description and provide 3 improvement suggestions: 'Cozy 2BR apartment near downtown. Clean and quiet. Free parking. Great views.'";
      const openaiModelId = openaiModel || "gpt-4.1-mini";
      const grokModelId = grokModel || "x-ai/grok-3-mini";

      const openaiModelInfo = AI_MODELS[openaiModelId as AIModelId];
      const grokModelInfo = AI_MODELS[grokModelId as AIModelId];

      if (openaiModelInfo && openaiModelInfo.provider !== "openai") {
        return res
          .status(400)
          .json({ message: `Model ${openaiModelId} is not an OpenAI model` });
      }
      if (grokModelInfo && grokModelInfo.provider !== "openrouter") {
        return res
          .status(400)
          .json({
            message: `Model ${grokModelId} is not an OpenRouter/Grok model`,
          });
      }

      const results: {
        openai: {
          model: string;
          responseTime: number;
          tokens: { input: number; output: number };
          response: string;
          error?: string;
        };
        grok: {
          model: string;
          responseTime: number;
          tokens: { input: number; output: number };
          response: string;
          error?: string;
        };
      } = {
        openai: {
          model: openaiModelId,
          responseTime: 0,
          tokens: { input: 0, output: 0 },
          response: "",
        },
        grok: {
          model: grokModelId,
          responseTime: 0,
          tokens: { input: 0, output: 0 },
          response: "",
        },
      };

      const openaiStart = Date.now();
      try {
        const openaiResponse = await openai.chat.completions.create({
          model: openaiModelId,
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant that provides concise responses.",
            },
            { role: "user", content: testPrompt },
          ],
          max_tokens: 500,
        });
        results.openai.responseTime = Date.now() - openaiStart;
        results.openai.tokens = {
          input: openaiResponse.usage?.prompt_tokens || 0,
          output: openaiResponse.usage?.completion_tokens || 0,
        };
        results.openai.response =
          openaiResponse.choices[0]?.message?.content || "";
      } catch (error: any) {
        results.openai.responseTime = Date.now() - openaiStart;
        results.openai.error = error.message || "OpenAI request failed";
      }

      const grokStart = Date.now();
      try {
        const grokResponse = await openrouter.chat.completions.create({
          model: grokModelId,
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant that provides concise responses.",
            },
            { role: "user", content: testPrompt },
          ],
          max_tokens: 500,
        });
        results.grok.responseTime = Date.now() - grokStart;
        results.grok.tokens = {
          input: grokResponse.usage?.prompt_tokens || 0,
          output: grokResponse.usage?.completion_tokens || 0,
        };
        results.grok.response = grokResponse.choices[0]?.message?.content || "";
      } catch (error: any) {
        results.grok.responseTime = Date.now() - grokStart;
        results.grok.error = error.message || "Grok request failed";
      }

      const bothSucceeded = !results.openai.error && !results.grok.error;
      const speedComparison = bothSucceeded
        ? {
            fasterModel:
              results.openai.responseTime < results.grok.responseTime
                ? "openai"
                : "grok",
            timeDifference: Math.abs(
              results.openai.responseTime - results.grok.responseTime,
            ),
            percentageFaster:
              results.openai.responseTime < results.grok.responseTime
                ? (
                    ((results.grok.responseTime - results.openai.responseTime) /
                      results.grok.responseTime) *
                    100
                  ).toFixed(1)
                : (
                    ((results.openai.responseTime - results.grok.responseTime) /
                      results.openai.responseTime) *
                    100
                  ).toFixed(1),
            comparisonAvailable: true,
          }
        : {
            fasterModel: "unknown",
            timeDifference: 0,
            percentageFaster: "0",
            comparisonAvailable: false,
            reason: results.openai.error ? "OpenAI failed" : "Grok failed",
          };

      res.json({
        prompt: testPrompt,
        results,
        speedComparison,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Admin", "Error running AI speed test:", error);
      res.status(500).json({ message: "Failed to run AI speed test" });
    }
  });

  // =====================
  // Admin: AI Quality Comparison Test
  // =====================

  const comparisonTestSchema = z.object({
    workspaceId: z.string().uuid(),
    listingId: z.string().uuid(),
    startDate: z.string(),
    endDate: z.string(),
    openaiModel: z.string().optional(),
    grokModel: z.string().optional(),
  });

  app.post(
    "/api/admin/ai-comparison-test",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        if (!(await isAppAdmin(userId, storage))) {
          return res
            .status(403)
            .json({ message: "Access denied. Application Admin required." });
        }

        const parseResult = comparisonTestSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            message: "Invalid request",
            errors: parseResult.error.errors,
          });
        }

        const {
          workspaceId,
          listingId,
          startDate,
          endDate,
          openaiModel,
          grokModel,
        } = parseResult.data;
        const openaiModelId = openaiModel || "gpt-4.1-mini";
        const grokModelId = grokModel || "x-ai/grok-3-mini";

        const startDateParsed = new Date(startDate);
        const endDateParsed = new Date(endDate);
        const daysBack = Math.ceil(
          (endDateParsed.getTime() - startDateParsed.getTime()) /
            (1000 * 60 * 60 * 24),
        );

        const listing = await storage.getListing(listingId);
        if (!listing || listing.workspaceId !== workspaceId) {
          return res
            .status(404)
            .json({ message: "Listing not found in workspace" });
        }

        const allReservations =
          await storage.getReservationsByListing(listingId);

        const filteredReservations = allReservations.filter((r) => {
          const checkIn = r.checkInDate ? new Date(r.checkInDate) : null;
          const checkOut = r.checkOutDate ? new Date(r.checkOutDate) : null;
          if (!checkIn) return false;
          const overlapsEnd = checkIn <= endDateParsed;
          const overlapsStart = !checkOut || checkOut >= startDateParsed;
          return overlapsEnd && overlapsStart;
        });

        if (filteredReservations.length === 0) {
          return res
            .status(400)
            .json({
              message: "No reservations found in the selected date range",
            });
        }

        const testReservations = filteredReservations.slice(0, 8);

        const existingThemes = await storage.getThemesByWorkspace(workspaceId);

        const reservationsContext = testReservations.map((r) => {
          const guestMessages = Array.isArray(r.conversationHistory)
            ? r.conversationHistory
                .filter((m: any) => m.sender === "guest")
                .map((m: any) => m.message)
            : [];

          return {
            id: r.id,
            guestName: r.guestName,
            checkIn: r.checkInDate,
            checkOut: r.checkOutDate,
            publicReview: r.publicReview,
            privateRemarks: r.privateRemarks,
            guestMessages,
          };
        });

        const reservationAnalysisPrompt = await storage.getPromptByName(
          "reservation_analysis",
        );

        const existingThemesFormatted =
          existingThemes
            .map((t) => `- ${t.name}: ${t.description || "No description"}`)
            .join("\n") || "No existing themes";
        const reservationsFormatted = reservationsContext
          .map(
            (r, idx) => `
--- Reservation ${idx + 1} (ID: ${r.id}) ---
Guest: ${r.guestName}
Stay: ${r.checkIn ? new Date(r.checkIn).toLocaleDateString() : "Unknown"} - ${r.checkOut ? new Date(r.checkOut).toLocaleDateString() : "Unknown"}
Public Review: ${r.publicReview || "No review"}
Private Remarks: ${r.privateRemarks || "None"}
Guest Messages: ${r.guestMessages.length > 0 ? r.guestMessages.join(" | ") : "No messages"}
`,
          )
          .join("\n");

        const sentimentInjection = `

SENTIMENT SCORING (REQUIRED for each reservation):
Include a "sentimentScores" object with: overall (0-5), publicReview (0-5 or null), privateRemarks (0-5 or null), conversation (0-5), summary (1-2 sentences).
`;

        let analysisPrompt: string;
        if (reservationAnalysisPrompt?.promptTemplate) {
          let customPrompt = reservationAnalysisPrompt.promptTemplate
            .replace("{{existingThemes}}", existingThemesFormatted)
            .replace("{{reservationsContext}}", reservationsFormatted);

          if (!customPrompt.toLowerCase().includes("sentimentscores")) {
            customPrompt = customPrompt + sentimentInjection;
          }
          analysisPrompt = customPrompt;
        } else {
          analysisPrompt = `You are an expert short-term rental consultant. Analyze these guest reservations and extract ACTIONABLE insights as Tags.

PURPOSE: Tags capture key feedback, complaints, confusion, or questions from guests that a host can learn from or act upon. Each NEGATIVE tag will generate an AI Task suggesting what the host should do to improve.

For each reservation, identify Tags (typically 2-4, but not limited to 4 if more unique insights exist) that represent:
- Actionable feedback that hosts can improve upon
- Complaints or issues that need addressing
- Questions or confusion that indicate unclear information
- Notable praise that highlights what's working well

ABSOLUTELY DO NOT CREATE TAGS FOR (these are NOT actionable):
- Trip purposes/reasons: "Wedding Trip", "Business Travel", "Family Reunion", "Vacation", "Anniversary", "New Home Transition", "Moving", "Relocation"
- Guest demographics: "Mature Group", "Young Couple", "Large Family", "Solo Traveler"
- Arrival/departure logistics: "Late Arrival", "Early Check-in", "Early Checkout", "Flight Delay", "No Early Check-in Needed"
- Booking/stay confirmations: "Reservation Confirmed", "Booking Acknowledged", "Stay Confirmed", "House Rules Acknowledged"
- Guest info updates: "Guest Count Correction", "Guest Contact Information", "Updated Guest Details"
- General greetings, routine "thank you" messages, or small talk without specific feedback

EXCEPTION - ALWAYS CREATE TAGS FOR QUESTIONS:
Questions from guests should ALWAYS be tagged with sentiment "question" (blue) because they reveal what isn't clear to guests from your listing, messages, or in-unit marketing. Questions are valuable even if not directly "actionable" - they show confusion points that could be clarified.

ASK YOURSELF: "Is this a question from the guest OR actionable feedback the host can improve upon?" If YES to either, create a tag. If NO to both, skip it.

EXISTING THEMES (you MUST use these whenever applicable):
${existingThemesFormatted}

RESERVATIONS TO ANALYZE:
${reservationsFormatted}

Provide a JSON response with this structure:
{
  "reservations": [
    {
      "reservationId": "<reservation id>",
      "sentimentScores": {
        "overall": <0-5 with 0.1 increments>,
        "publicReview": <0-5 or null if no review>,
        "privateRemarks": <0-5 or null if no remarks>,
        "conversation": <0-5 based on guest communication quality>,
        "summary": "<1-2 sentence summary of overall guest experience>"
      },
      "tags": [
        {
          "name": "<short descriptive tag name, 2-4 words>",
          "sentiment": "positive|negative|neutral|question",
          "summary": "<1-2 sentence explanation of this insight>",
          "verbatimEvidence": "<exact quote from review or message that supports this>",
          "suggestedTheme": "<existing theme name OR NEW: Emoji Theme Name if truly distinct>",
          "suggestedThemeIcon": "<single emoji that represents the theme>",
          "suggestedTaskTitle": "<actionable task title if applicable, or null>",
          "suggestedTaskDescription": "<task description if applicable, or null>"
        }
      ]
    }
  ]
}

CRITICAL RULES:
- YOU MUST INCLUDE EVERY RESERVATION ID IN YOUR RESPONSE - do not skip any reservation
- If a reservation has no meaningful/actionable content, include it with an empty tags array []
- For NEGATIVE tags: Always include suggestedTaskTitle and suggestedTaskDescription`;
        }

        const parseAIResponse = (
          responseText: string,
        ): { reservations: any[] } | null => {
          try {
            const jsonMatch = responseText.match(
              /```(?:json)?\s*([\s\S]*?)```/,
            );
            const jsonStr = jsonMatch
              ? jsonMatch[1].trim()
              : responseText.trim();
            return JSON.parse(jsonStr);
          } catch (e) {
            logger.error("Admin", "Failed to parse AI response:", e);
            return null;
          }
        };

        const { AI_MODELS } = await import("@shared/schema");
        const openaiMInfo = (AI_MODELS as any)[openaiModelId] || {
          inputCost: 0.0004,
          outputCost: 0.0016,
        };
        const grokMInfo = (AI_MODELS as any)[grokModelId] || {
          inputCost: 0.0003,
          outputCost: 0.0005,
        };

        const results: {
          openai: {
            model: string;
            responseTime: number;
            tokens: { input: number; output: number };
            estimatedCost: number;
            rawResponse: string;
            parsedResults: { reservations: any[] } | null;
            error?: string;
          };
          grok: {
            model: string;
            responseTime: number;
            tokens: { input: number; output: number };
            estimatedCost: number;
            rawResponse: string;
            parsedResults: { reservations: any[] } | null;
            error?: string;
          };
        } = {
          openai: {
            model: openaiModelId,
            responseTime: 0,
            tokens: { input: 0, output: 0 },
            estimatedCost: 0,
            rawResponse: "",
            parsedResults: null,
          },
          grok: {
            model: grokModelId,
            responseTime: 0,
            tokens: { input: 0, output: 0 },
            estimatedCost: 0,
            rawResponse: "",
            parsedResults: null,
          },
        };

        logger.info(
          "Comparison Test",
          `Running OpenAI (${openaiModelId}) with ${testReservations.length} reservations...`,
        );
        const openaiStart = Date.now();
        try {
          const openaiResponse = await openai.chat.completions.create({
            model: openaiModelId,
            messages: [
              {
                role: "system",
                content:
                  "You are an expert short-term rental consultant providing detailed analysis in JSON format.",
              },
              { role: "user", content: analysisPrompt },
            ],
            max_tokens: 4000,
            response_format: { type: "json_object" },
          });
          results.openai.responseTime = Date.now() - openaiStart;
          results.openai.tokens = {
            input: openaiResponse.usage?.prompt_tokens || 0,
            output: openaiResponse.usage?.completion_tokens || 0,
          };
          results.openai.estimatedCost =
            (results.openai.tokens.input * openaiMInfo.inputCost) / 1000 +
            (results.openai.tokens.output * openaiMInfo.outputCost) / 1000;
          results.openai.rawResponse =
            openaiResponse.choices[0]?.message?.content || "";
          results.openai.parsedResults = parseAIResponse(
            results.openai.rawResponse,
          );
        } catch (error: any) {
          results.openai.responseTime = Date.now() - openaiStart;
          results.openai.error = error.message || "OpenAI request failed";
        }

        logger.info(
          "Comparison Test",
          `Running Grok (${grokModelId}) with ${testReservations.length} reservations...`,
        );
        const grokStart = Date.now();
        try {
          const grokResponse = await openrouter.chat.completions.create({
            model: grokModelId,
            messages: [
              {
                role: "system",
                content:
                  "You are an expert short-term rental consultant providing detailed analysis in JSON format.",
              },
              { role: "user", content: analysisPrompt },
            ],
            max_tokens: 4000,
          });
          results.grok.responseTime = Date.now() - grokStart;
          results.grok.tokens = {
            input: grokResponse.usage?.prompt_tokens || 0,
            output: grokResponse.usage?.completion_tokens || 0,
          };
          results.grok.estimatedCost =
            (results.grok.tokens.input * grokMInfo.inputCost) / 1000 +
            (results.grok.tokens.output * grokMInfo.outputCost) / 1000;
          results.grok.rawResponse =
            grokResponse.choices[0]?.message?.content || "";
          results.grok.parsedResults = parseAIResponse(
            results.grok.rawResponse,
          );
        } catch (error: any) {
          results.grok.responseTime = Date.now() - grokStart;
          results.grok.error = error.message || "Grok request failed";
        }

        // === STAGE 2: TASKS ===
        logger.info("Comparison Test", "Running Stage 2: Tasks generation...");

        const tasksPrompt = (
          tags: any[],
        ) => `Based on these Tags extracted from guest reservation data, generate actionable Tasks for the host.

TAGS:
${tags.map((t) => `- ${t.name} (${t.sentiment}): ${t.summary || "No summary"}`).join("\n")}

Generate tasks for NEGATIVE tags that require host action. Each task should:
- Have a clear, actionable title
- Include a detailed description of what the host should do
- Have a priority (high/medium/low)
- Specify an estimated effort (quick/moderate/significant)

Respond in JSON format:
{
  "tasks": [
    {
      "title": "<actionable task title>",
      "description": "<detailed description of what to do>",
      "priority": "high|medium|low",
      "effort": "quick|moderate|significant",
      "relatedTagName": "<name of tag this task addresses>"
    }
  ]
}`;

        const stageResults = {
          tags: {
            openai: {
              responseTime: results.openai.responseTime,
              tokens: results.openai.tokens,
              estimatedCost: results.openai.estimatedCost,
              error: results.openai.error,
            },
            grok: {
              responseTime: results.grok.responseTime,
              tokens: results.grok.tokens,
              estimatedCost: results.grok.estimatedCost,
              error: results.grok.error,
            },
            winner: (results.openai.responseTime < results.grok.responseTime
              ? "openai"
              : results.openai.responseTime > results.grok.responseTime
                ? "grok"
                : "tie") as "openai" | "grok" | "tie",
          },
          tasks: {
            openai: {
              responseTime: 0,
              tokens: { input: 0, output: 0 },
              estimatedCost: 0,
              error: undefined as string | undefined,
            },
            grok: {
              responseTime: 0,
              tokens: { input: 0, output: 0 },
              estimatedCost: 0,
              error: undefined as string | undefined,
            },
            winner: "tie" as "openai" | "grok" | "tie",
          },
          themes: {
            openai: {
              responseTime: 0,
              tokens: { input: 0, output: 0 },
              estimatedCost: 0,
              error: undefined as string | undefined,
            },
            grok: {
              responseTime: 0,
              tokens: { input: 0, output: 0 },
              estimatedCost: 0,
              error: undefined as string | undefined,
            },
            winner: "tie" as "openai" | "grok" | "tie",
          },
        };

        const openaiTags =
          results.openai.parsedResults?.reservations?.flatMap(
            (r: any) => r.tags || [],
          ) || [];
        const grokTags =
          results.grok.parsedResults?.reservations?.flatMap(
            (r: any) => r.tags || [],
          ) || [];

        let openaiTasksResult: any = { tasks: [] };
        let grokTasksResult: any = { tasks: [] };
        let openaiThemesResult: any = { themes: [] };
        let grokThemesResult: any = { themes: [] };

        if (openaiTags.length > 0) {
          const openaiTasksStart = Date.now();
          try {
            const openaiTasksResponse = await openai.chat.completions.create({
              model: openaiModelId,
              messages: [
                {
                  role: "system",
                  content: "You are an expert short-term rental consultant.",
                },
                { role: "user", content: tasksPrompt(openaiTags) },
              ],
              max_tokens: 2000,
              response_format: { type: "json_object" },
            });
            stageResults.tasks.openai.responseTime =
              Date.now() - openaiTasksStart;
            stageResults.tasks.openai.tokens = {
              input: openaiTasksResponse.usage?.prompt_tokens || 0,
              output: openaiTasksResponse.usage?.completion_tokens || 0,
            };
            stageResults.tasks.openai.estimatedCost =
              (stageResults.tasks.openai.tokens.input * openaiMInfo.inputCost) /
                1000 +
              (stageResults.tasks.openai.tokens.output *
                openaiMInfo.outputCost) /
                1000;
            openaiTasksResult = parseAIResponse(
              openaiTasksResponse.choices[0]?.message?.content || "",
            ) || { tasks: [] };
          } catch (error: any) {
            stageResults.tasks.openai.responseTime =
              Date.now() - openaiTasksStart;
            stageResults.tasks.openai.error =
              error.message || "OpenAI tasks request failed";
          }
        }

        if (grokTags.length > 0) {
          const grokTasksStart = Date.now();
          try {
            const grokTasksResponse = await openrouter.chat.completions.create({
              model: grokModelId,
              messages: [
                {
                  role: "system",
                  content: "You are an expert short-term rental consultant.",
                },
                { role: "user", content: tasksPrompt(grokTags) },
              ],
              max_tokens: 2000,
            });
            stageResults.tasks.grok.responseTime = Date.now() - grokTasksStart;
            stageResults.tasks.grok.tokens = {
              input: grokTasksResponse.usage?.prompt_tokens || 0,
              output: grokTasksResponse.usage?.completion_tokens || 0,
            };
            stageResults.tasks.grok.estimatedCost =
              (stageResults.tasks.grok.tokens.input * grokMInfo.inputCost) /
                1000 +
              (stageResults.tasks.grok.tokens.output * grokMInfo.outputCost) /
                1000;
            grokTasksResult = parseAIResponse(
              grokTasksResponse.choices[0]?.message?.content || "",
            ) || { tasks: [] };
          } catch (error: any) {
            stageResults.tasks.grok.responseTime = Date.now() - grokTasksStart;
            stageResults.tasks.grok.error =
              error.message || "Grok tasks request failed";
          }
        }

        if (
          !stageResults.tasks.openai.error &&
          !stageResults.tasks.grok.error
        ) {
          stageResults.tasks.winner =
            stageResults.tasks.openai.responseTime <
            stageResults.tasks.grok.responseTime
              ? "openai"
              : stageResults.tasks.openai.responseTime >
                  stageResults.tasks.grok.responseTime
                ? "grok"
                : "tie";
        }

        // === STAGE 3: THEMES ===
        logger.info("Comparison Test", "Running Stage 3: Themes generation...");

        const themesPrompt = (
          tags: any[],
        ) => `Analyze these Tags extracted from guest reservation data and suggest Themes to organize them.

TAGS:
${tags.map((t) => `- ${t.name} (${t.sentiment}): ${t.summary || "No summary"}`).join("\n")}

EXISTING THEMES:
${existingThemes.map((t) => `- ${t.icon} ${t.name}: ${t.description || "No description"}`).join("\n") || "No existing themes"}

Group related tags into themes. You can:
1. Assign tags to existing themes if they fit
2. Suggest NEW themes for tags that don't fit existing ones

Respond in JSON format:
{
  "themes": [
    {
      "name": "<theme name>",
      "icon": "<single emoji>",
      "description": "<brief description>",
      "isNew": true|false,
      "tagNames": ["<tag name 1>", "<tag name 2>"]
    }
  ]
}`;

        if (openaiTags.length > 0) {
          const openaiThemesStart = Date.now();
          try {
            const openaiThemesResponse = await openai.chat.completions.create({
              model: openaiModelId,
              messages: [
                {
                  role: "system",
                  content:
                    "You are an expert at categorizing and organizing feedback.",
                },
                { role: "user", content: themesPrompt(openaiTags) },
              ],
              max_tokens: 2000,
              response_format: { type: "json_object" },
            });
            stageResults.themes.openai.responseTime =
              Date.now() - openaiThemesStart;
            stageResults.themes.openai.tokens = {
              input: openaiThemesResponse.usage?.prompt_tokens || 0,
              output: openaiThemesResponse.usage?.completion_tokens || 0,
            };
            stageResults.themes.openai.estimatedCost =
              (stageResults.themes.openai.tokens.input *
                openaiMInfo.inputCost) /
                1000 +
              (stageResults.themes.openai.tokens.output *
                openaiMInfo.outputCost) /
                1000;
            openaiThemesResult = parseAIResponse(
              openaiThemesResponse.choices[0]?.message?.content || "",
            ) || { themes: [] };
          } catch (error: any) {
            stageResults.themes.openai.responseTime =
              Date.now() - openaiThemesStart;
            stageResults.themes.openai.error =
              error.message || "OpenAI themes request failed";
          }
        }

        if (grokTags.length > 0) {
          const grokThemesStart = Date.now();
          try {
            const grokThemesResponse = await openrouter.chat.completions.create(
              {
                model: grokModelId,
                messages: [
                  {
                    role: "system",
                    content:
                      "You are an expert at categorizing and organizing feedback.",
                  },
                  { role: "user", content: themesPrompt(grokTags) },
                ],
                max_tokens: 2000,
              },
            );
            stageResults.themes.grok.responseTime =
              Date.now() - grokThemesStart;
            stageResults.themes.grok.tokens = {
              input: grokThemesResponse.usage?.prompt_tokens || 0,
              output: grokThemesResponse.usage?.completion_tokens || 0,
            };
            stageResults.themes.grok.estimatedCost =
              (stageResults.themes.grok.tokens.input * grokMInfo.inputCost) /
                1000 +
              (stageResults.themes.grok.tokens.output * grokMInfo.outputCost) /
                1000;
            grokThemesResult = parseAIResponse(
              grokThemesResponse.choices[0]?.message?.content || "",
            ) || { themes: [] };
          } catch (error: any) {
            stageResults.themes.grok.responseTime =
              Date.now() - grokThemesStart;
            stageResults.themes.grok.error =
              error.message || "Grok themes request failed";
          }
        }

        if (
          !stageResults.themes.openai.error &&
          !stageResults.themes.grok.error
        ) {
          stageResults.themes.winner =
            stageResults.themes.openai.responseTime <
            stageResults.themes.grok.responseTime
              ? "openai"
              : stageResults.themes.openai.responseTime >
                  stageResults.themes.grok.responseTime
                ? "grok"
                : "tie";
        }

        const totals = {
          openai: {
            responseTime:
              stageResults.tags.openai.responseTime +
              stageResults.tasks.openai.responseTime +
              stageResults.themes.openai.responseTime,
            tokens: {
              input:
                stageResults.tags.openai.tokens.input +
                stageResults.tasks.openai.tokens.input +
                stageResults.themes.openai.tokens.input,
              output:
                stageResults.tags.openai.tokens.output +
                stageResults.tasks.openai.tokens.output +
                stageResults.themes.openai.tokens.output,
            },
            estimatedCost:
              stageResults.tags.openai.estimatedCost +
              stageResults.tasks.openai.estimatedCost +
              stageResults.themes.openai.estimatedCost,
          },
          grok: {
            responseTime:
              stageResults.tags.grok.responseTime +
              stageResults.tasks.grok.responseTime +
              stageResults.themes.grok.responseTime,
            tokens: {
              input:
                stageResults.tags.grok.tokens.input +
                stageResults.tasks.grok.tokens.input +
                stageResults.themes.grok.tokens.input,
              output:
                stageResults.tags.grok.tokens.output +
                stageResults.tasks.grok.tokens.output +
                stageResults.themes.grok.tokens.output,
            },
            estimatedCost:
              stageResults.tags.grok.estimatedCost +
              stageResults.tasks.grok.estimatedCost +
              stageResults.themes.grok.estimatedCost,
          },
        };

        const overallWinner =
          totals.openai.responseTime < totals.grok.responseTime
            ? "openai"
            : totals.openai.responseTime > totals.grok.responseTime
              ? "grok"
              : "tie";

        const reservationComparisons = testReservations.map((r) => {
          const openaiResult = results.openai.parsedResults?.reservations?.find(
            (x: any) => x.reservationId === r.id,
          );
          const grokResult = results.grok.parsedResults?.reservations?.find(
            (x: any) => x.reservationId === r.id,
          );

          return {
            reservationId: r.id,
            guestName: r.guestName,
            checkIn: r.checkInDate,
            checkOut: r.checkOutDate,
            hasReview: !!r.publicReview,
            hasPrivateRemarks: !!r.privateRemarks,
            openai: openaiResult || { tags: [], sentimentScores: null },
            grok: grokResult || { tags: [], sentimentScores: null },
          };
        });

        const fullResults = {
          stages: stageResults,
          totals,
          overallWinner,
          reservationComparisons,
          tasksComparison: {
            openai: openaiTasksResult.tasks || [],
            grok: grokTasksResult.tasks || [],
          },
          themesComparison: {
            openai: openaiThemesResult.themes || [],
            grok: grokThemesResult.themes || [],
          },
        };

        const savedRun = await storage.createSpeedTestRun({
          workspaceId,
          listingId,
          listingName: listing.name,
          openaiModel: openaiModelId,
          grokModel: grokModelId,
          daysBack,
          reservationCount: testReservations.length,
          results: fullResults as any,
          overallWinner,
          totalOpenaiTime: totals.openai.responseTime,
          totalGrokTime: totals.grok.responseTime,
          totalOpenaiCost: totals.openai.estimatedCost,
          totalGrokCost: totals.grok.estimatedCost,
        });

        res.json({
          id: savedRun.id,
          testConfig: {
            workspaceId,
            listingId,
            listingName: listing.name,
            dateRange: { startDate, endDate },
            reservationCount: testReservations.length,
            openaiModel: openaiModelId,
            grokModel: grokModelId,
          },
          stages: stageResults,
          totals,
          overallWinner,
          reservationComparisons,
          tasksComparison: fullResults.tasksComparison,
          themesComparison: fullResults.themesComparison,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error("Admin", "Error running AI comparison test:", error);
        res.status(500).json({ message: "Failed to run AI comparison test" });
      }
    },
  );

  // Get speed test history
  app.get(
    "/api/admin/speed-test-history",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        if (!(await isAppAdmin(userId, storage))) {
          return res
            .status(403)
            .json({ message: "Access denied. Application Admin required." });
        }

        const limit = parseInt(req.query.limit as string) || 20;
        const runs = await storage.getSpeedTestRuns(limit);
        res.json(runs);
      } catch (error) {
        logger.error("Admin", "Error fetching speed test history:", error);
        res.status(500).json({ message: "Failed to fetch speed test history" });
      }
    },
  );

  app.get(
    "/api/admin/speed-test-history/:id",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        if (!(await isAppAdmin(userId, storage))) {
          return res
            .status(403)
            .json({ message: "Access denied. Application Admin required." });
        }

        const run = await storage.getSpeedTestRun(req.params.id);
        if (!run) {
          return res.status(404).json({ message: "Speed test run not found" });
        }
        res.json(run);
      } catch (error) {
        logger.error("Admin", "Error fetching speed test run:", error);
        res.status(500).json({ message: "Failed to fetch speed test run" });
      }
    },
  );

  app.get("/api/admin/ai-models", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const models = Object.entries(AI_MODELS).map(([id, info]) => ({
        id,
        name: info.name,
        provider: info.provider,
        inputCost: info.inputCost,
        outputCost: info.outputCost,
      }));

      res.json({
        openai: models.filter((m) => m.provider === "openai"),
        openrouter: models.filter((m) => m.provider === "openrouter"),
      });
    } catch (error) {
      logger.error("Admin", "Error fetching AI models:", error);
      res.status(500).json({ message: "Failed to fetch AI models" });
    }
  });

  // =====================
  // Admin: Sync Speed Test
  // =====================

  const syncSpeedTestSchema = z.object({
    workspaceId: z.string().uuid(),
    listingId: z.string().uuid(),
    startDate: z.string(),
    endDate: z.string(),
    modelA: z.string(),
    modelB: z.string(),
  });

  app.post("/api/admin/sync-speed-test", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const parseResult = syncSpeedTestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res
          .status(400)
          .json({
            message: "Invalid request",
            errors: parseResult.error.errors,
          });
      }

      const { workspaceId, listingId, startDate, endDate, modelA, modelB } =
        parseResult.data;

      const listing = await storage.getListing(listingId);
      if (!listing || listing.workspaceId !== workspaceId) {
        return res
          .status(404)
          .json({ message: "Listing not found in workspace" });
      }

      const allReservations = await storage.getReservationsByListing(listingId);
      const startDateParsed = new Date(startDate);
      const endDateParsed = new Date(endDate);

      const filteredReservations = allReservations.filter((r) => {
        const checkIn = r.checkInDate ? new Date(r.checkInDate) : null;
        const checkOut = r.checkOutDate ? new Date(r.checkOutDate) : null;
        if (!checkIn) return false;
        return (
          checkIn <= endDateParsed && (!checkOut || checkOut >= startDateParsed)
        );
      });

      if (filteredReservations.length === 0) {
        return res
          .status(400)
          .json({
            message: "No reservations found in the selected date range",
          });
      }

      const testReservations = filteredReservations.slice(0, 15);
      const existingThemes = await storage.getThemesByWorkspace(workspaceId);

      const reservationsContext = testReservations.map((r) => {
        const guestMessages = Array.isArray(r.conversationHistory)
          ? r.conversationHistory
              .filter((m: any) => m.sender === "guest")
              .map((m: any) => m.message)
          : [];
        return {
          id: r.id,
          guestName: r.guestName,
          checkIn: r.checkInDate,
          checkOut: r.checkOutDate,
          publicReview: r.publicReview,
          privateRemarks: r.privateRemarks,
          guestMessages,
        };
      });

      const existingThemesFormatted =
        existingThemes
          .map((t) => `- ${t.name}: ${t.description || "No description"}`)
          .join("\n") || "No existing themes";
      const reservationsFormatted = reservationsContext
        .map(
          (r, idx) => `
--- Reservation ${idx + 1} (ID: ${r.id}) ---
Guest: ${r.guestName}
Stay: ${r.checkIn ? new Date(r.checkIn).toLocaleDateString() : "Unknown"} - ${r.checkOut ? new Date(r.checkOut).toLocaleDateString() : "Unknown"}
Public Review: ${r.publicReview || "No review"}
Private Remarks: ${r.privateRemarks || "None"}
Guest Messages: ${r.guestMessages.length > 0 ? r.guestMessages.join(" | ") : "No messages"}
`,
        )
        .join("\n");

      const syncAnalysisPrompt = `You are an expert short-term rental consultant. Analyze these guest reservations and extract ACTIONABLE insights as Tags.

EXISTING THEMES (use whenever applicable):
${existingThemesFormatted}

RESERVATIONS TO ANALYZE:
${reservationsFormatted}

IMPORTANT: You MUST respond with ONLY valid JSON in this exact format (no markdown, no explanations):
{
  "reservations": [
    {
      "id": "<reservation_id>",
      "tags": [
        {"name": "<tag_name>", "sentiment": "positive|negative|neutral", "summary": "<brief summary>", "theme": "<theme_name or null>"}
      ]
    }
  ]
}

Each reservation MUST have at least 1 tag. Extract insights from reviews, messages, and remarks.`;

      const { AI_MODELS } = await import("@shared/schema");
      const modelAInfo = (AI_MODELS as any)[modelA] || {
        inputCost: 0.0004,
        outputCost: 0.0016,
        provider: "openai",
      };
      const modelBInfo = (AI_MODELS as any)[modelB] || {
        inputCost: 0.0003,
        outputCost: 0.0005,
        provider: "openrouter",
      };

      const syncResults = {
        modelA: {
          model: modelA,
          responseTime: 0,
          tokens: { input: 0, output: 0 },
          estimatedCost: 0,
          tagCount: 0,
          error: undefined as string | undefined,
        },
        modelB: {
          model: modelB,
          responseTime: 0,
          tokens: { input: 0, output: 0 },
          estimatedCost: 0,
          tagCount: 0,
          error: undefined as string | undefined,
        },
      };

      const runModel = async (modelId: string, modelInfo: any) => {
        const isOpenRouter = modelInfo.provider === "openrouter";
        const client = isOpenRouter ? openrouter : openai;
        const start = Date.now();
        try {
          const response = await client.chat.completions.create({
            model: modelId,
            messages: [
              {
                role: "system",
                content:
                  "You are an expert short-term rental consultant providing detailed analysis in JSON format.",
              },
              { role: "user", content: syncAnalysisPrompt },
            ],
            max_tokens: 4000,
            ...(isOpenRouter
              ? {}
              : { response_format: { type: "json_object" } }),
          });
          const responseTime = Date.now() - start;
          const tokens = {
            input: response.usage?.prompt_tokens || 0,
            output: response.usage?.completion_tokens || 0,
          };
          const estimatedCost =
            (tokens.input * modelInfo.inputCost) / 1000 +
            (tokens.output * modelInfo.outputCost) / 1000;
          const rawResponse = response.choices[0]?.message?.content || "";
          let tagCount = 0;
          let parseError: string | undefined;
          let parsedReservations: any[] = [];
          try {
            const cleaned = rawResponse
              .replace(/```json\s*|\s*```/g, "")
              .trim();
            const parsed = JSON.parse(cleaned);
            parsedReservations = parsed?.reservations || [];
            tagCount =
              parsedReservations.reduce(
                (sum: number, r: any) => sum + (r.tags?.length || 0),
                0,
              ) || 0;
            if (tagCount === 0) {
              parseError =
                "Response parsed but contained 0 tags - invalid test result";
            }
          } catch (e: any) {
            parseError = `JSON parse error: ${e.message}`;
          }
          return {
            responseTime,
            tokens,
            estimatedCost,
            tagCount,
            error: parseError,
            reservations: parsedReservations,
          };
        } catch (error: any) {
          return {
            responseTime: Date.now() - start,
            tokens: { input: 0, output: 0 },
            estimatedCost: 0,
            tagCount: 0,
            error: error.message,
            reservations: [],
          };
        }
      };

      logger.info(
        "Speed Test",
        `Starting parallel test: ${modelA} vs ${modelB}`,
      );
      const startTime = Date.now();
      const [resultA, resultB] = await Promise.all([
        runModel(modelA, modelAInfo),
        runModel(modelB, modelBInfo),
      ]);
      logger.info(
        "Speed Test",
        `Both tests completed in ${Date.now() - startTime}ms`,
      );

      syncResults.modelA = { model: modelA, ...resultA };
      syncResults.modelB = { model: modelB, ...resultB };

      const modelAValid =
        !syncResults.modelA.error && syncResults.modelA.tagCount > 0;
      const modelBValid =
        !syncResults.modelB.error && syncResults.modelB.tagCount > 0;
      const hasErrors = !modelAValid || !modelBValid;

      let winner: string;
      if (!modelAValid && !modelBValid) {
        winner = "inconclusive";
      } else if (!modelAValid) {
        winner = "modelB";
      } else if (!modelBValid) {
        winner = "modelA";
      } else {
        winner =
          syncResults.modelA.responseTime < syncResults.modelB.responseTime
            ? "modelA"
            : syncResults.modelA.responseTime > syncResults.modelB.responseTime
              ? "modelB"
              : "tie";
      }

      const timeDiff = Math.abs(
        syncResults.modelA.responseTime - syncResults.modelB.responseTime,
      );
      const fasterTime = Math.min(
        syncResults.modelA.responseTime,
        syncResults.modelB.responseTime,
      );
      const percentageFaster =
        fasterTime > 0
          ? (
              (timeDiff /
                Math.max(
                  syncResults.modelA.responseTime,
                  syncResults.modelB.responseTime,
                )) *
              100
            ).toFixed(1)
          : "0";

      res.json({
        testType: "sync",
        testConfig: {
          workspaceId,
          listingId,
          listingName: listing.name,
          dateRange: { startDate, endDate },
          reservationCount: testReservations.length,
        },
        results: syncResults,
        comparison: {
          winner,
          timeDifference: timeDiff,
          percentageFaster,
          hasErrors,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Admin", "Error running sync speed test:", error);
      res.status(500).json({ message: "Failed to run sync speed test" });
    }
  });

  // =====================
  // Admin: Sentiment Speed Test
  // =====================

  const sentimentSpeedTestSchema = z.object({
    workspaceId: z.string().uuid(),
    listingId: z.string().uuid(),
    startDate: z.string(),
    endDate: z.string(),
    modelA: z.string(),
    modelB: z.string(),
  });

  app.post(
    "/api/admin/sentiment-speed-test",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        if (!(await isAppAdmin(userId, storage))) {
          return res
            .status(403)
            .json({ message: "Access denied. Application Admin required." });
        }

        const parseResult = sentimentSpeedTestSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res
            .status(400)
            .json({
              message: "Invalid request",
              errors: parseResult.error.errors,
            });
        }

        const { workspaceId, listingId, startDate, endDate, modelA, modelB } =
          parseResult.data;

        const listing = await storage.getListing(listingId);
        if (!listing || listing.workspaceId !== workspaceId) {
          return res
            .status(404)
            .json({ message: "Listing not found in workspace" });
        }

        const allReservations =
          await storage.getReservationsByListing(listingId);
        const startDateParsed = new Date(startDate);
        const endDateParsed = new Date(endDate);

        const filteredReservations = allReservations.filter((r) => {
          const checkIn = r.checkInDate ? new Date(r.checkInDate) : null;
          const checkOut = r.checkOutDate ? new Date(r.checkOutDate) : null;
          if (!checkIn) return false;
          return (
            checkIn <= endDateParsed &&
            (!checkOut || checkOut >= startDateParsed)
          );
        });

        if (filteredReservations.length === 0) {
          return res
            .status(400)
            .json({
              message: "No reservations found in the selected date range",
            });
        }

        const testReservations = filteredReservations.slice(0, 10);

        const reservationsContext = testReservations.map((r) => {
          const guestMessages = Array.isArray(r.conversationHistory)
            ? r.conversationHistory
                .filter((m: any) => m.sender === "guest")
                .map((m: any) => m.message)
            : [];
          return {
            id: r.id,
            guestName: r.guestName,
            checkIn: r.checkInDate,
            checkOut: r.checkOutDate,
            publicReview: r.publicReview,
            privateRemarks: r.privateRemarks,
            guestRating: r.guestRating,
            guestMessages,
          };
        });

        const sentimentAnalysisPrompt = `You are an expert short-term rental consultant. Analyze these guest reservations and provide sentiment scores based on all available data.

SCORING GUIDELINES (0-5 scale with 0.1 increments):
- 5.0: Exceptional experience, glowing praise
- 4.5: Very positive, minor suggestions at most
- 4.0: Good experience, some room for improvement (DEFAULT if no data)
- 3.5: Mixed experience, notable concerns
- 3.0: Below average, significant issues
- 2.5: Poor experience, multiple problems
- 2.0 or below: Very negative experience

RESERVATIONS TO ANALYZE:
${reservationsContext
  .map(
    (r, i) => `
--- Reservation ${i + 1} (ID: ${r.id}) ---
Guest: ${r.guestName}
Rating: ${r.guestRating || "N/A"}
Review: ${r.publicReview || "No review"}
Private Remarks: ${r.privateRemarks || "None"}
Messages: ${r.guestMessages.length > 0 ? r.guestMessages.slice(0, 3).join(" | ") : "No messages"}
`,
  )
  .join("\n")}

IMPORTANT: You MUST respond with ONLY valid JSON in this exact format (no markdown, no explanations):
{
  "reservations": [
    {"id": "<reservation_id>", "score": 4.2, "summary": "<brief summary of sentiment>"}
  ]
}

Each reservation MUST have a score between 0 and 5 (use 0.1 increments). Score EVERY reservation.`;

        const { AI_MODELS } = await import("@shared/schema");
        const modelAInfo = (AI_MODELS as any)[modelA] || {
          inputCost: 0.0004,
          outputCost: 0.0016,
          provider: "openai",
        };
        const modelBInfo = (AI_MODELS as any)[modelB] || {
          inputCost: 0.0003,
          outputCost: 0.0005,
          provider: "openrouter",
        };

        const sentimentResults = {
          modelA: {
            model: modelA,
            responseTime: 0,
            tokens: { input: 0, output: 0 },
            estimatedCost: 0,
            scoresReturned: 0,
            error: undefined as string | undefined,
          },
          modelB: {
            model: modelB,
            responseTime: 0,
            tokens: { input: 0, output: 0 },
            estimatedCost: 0,
            scoresReturned: 0,
            error: undefined as string | undefined,
          },
        };

        const runModel = async (modelId: string, modelInfo: any) => {
          const isOpenRouter = modelInfo.provider === "openrouter";
          const client = isOpenRouter ? openrouter : openai;
          const start = Date.now();
          try {
            const response = await client.chat.completions.create({
              model: modelId,
              messages: [
                {
                  role: "system",
                  content:
                    "You are an expert short-term rental consultant providing detailed analysis in JSON format.",
                },
                { role: "user", content: sentimentAnalysisPrompt },
              ],
              max_tokens: 2000,
              ...(isOpenRouter
                ? {}
                : { response_format: { type: "json_object" } }),
            });
            const responseTime = Date.now() - start;
            const tokens = {
              input: response.usage?.prompt_tokens || 0,
              output: response.usage?.completion_tokens || 0,
            };
            const estimatedCost =
              (tokens.input * modelInfo.inputCost) / 1000 +
              (tokens.output * modelInfo.outputCost) / 1000;
            const rawResponse = response.choices[0]?.message?.content || "";
            let scoresReturned = 0;
            let parseError: string | undefined;
            let parsedReservations: any[] = [];
            try {
              const cleaned = rawResponse
                .replace(/```json\s*|\s*```/g, "")
                .trim();
              const parsed = JSON.parse(cleaned);
              parsedReservations = parsed?.reservations || [];
              scoresReturned =
                parsedReservations.filter((r: any) => r.score !== undefined)
                  .length || 0;
              if (scoresReturned === 0) {
                parseError =
                  "Response parsed but contained 0 scores - invalid test result";
              }
            } catch (e: any) {
              parseError = `JSON parse error: ${e.message}`;
            }
            return {
              responseTime,
              tokens,
              estimatedCost,
              scoresReturned,
              error: parseError,
              reservations: parsedReservations,
            };
          } catch (error: any) {
            return {
              responseTime: Date.now() - start,
              tokens: { input: 0, output: 0 },
              estimatedCost: 0,
              scoresReturned: 0,
              error: error.message,
              reservations: [],
            };
          }
        };

        logger.info(
          "Sentiment Speed Test",
          `Starting parallel test: ${modelA} vs ${modelB}`,
        );
        const startTime = Date.now();
        const [resultA, resultB] = await Promise.all([
          runModel(modelA, modelAInfo),
          runModel(modelB, modelBInfo),
        ]);
        logger.info(
          "Sentiment Speed Test",
          `Both tests completed in ${Date.now() - startTime}ms`,
        );

        sentimentResults.modelA = { model: modelA, ...resultA };
        sentimentResults.modelB = { model: modelB, ...resultB };

        const modelAValid =
          !sentimentResults.modelA.error &&
          sentimentResults.modelA.scoresReturned > 0;
        const modelBValid =
          !sentimentResults.modelB.error &&
          sentimentResults.modelB.scoresReturned > 0;
        const hasErrors = !modelAValid || !modelBValid;

        let winner: string;
        if (!modelAValid && !modelBValid) {
          winner = "inconclusive";
        } else if (!modelAValid) {
          winner = "modelB";
        } else if (!modelBValid) {
          winner = "modelA";
        } else {
          winner =
            sentimentResults.modelA.responseTime <
            sentimentResults.modelB.responseTime
              ? "modelA"
              : sentimentResults.modelA.responseTime >
                  sentimentResults.modelB.responseTime
                ? "modelB"
                : "tie";
        }

        const timeDiff = Math.abs(
          sentimentResults.modelA.responseTime -
            sentimentResults.modelB.responseTime,
        );
        const fasterTime = Math.min(
          sentimentResults.modelA.responseTime,
          sentimentResults.modelB.responseTime,
        );
        const percentageFaster =
          fasterTime > 0
            ? (
                (timeDiff /
                  Math.max(
                    sentimentResults.modelA.responseTime,
                    sentimentResults.modelB.responseTime,
                  )) *
                100
              ).toFixed(1)
            : "0";

        res.json({
          testType: "sentiment",
          testConfig: {
            workspaceId,
            listingId,
            listingName: listing.name,
            dateRange: { startDate, endDate },
            reservationCount: testReservations.length,
          },
          results: sentimentResults,
          comparison: {
            winner,
            timeDifference: timeDiff,
            percentageFaster,
            hasErrors,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error("Admin", "Error running sentiment speed test:", error);
        res.status(500).json({ message: "Failed to run sentiment speed test" });
      }
    },
  );

  // =====================
  // Admin: Webhook Logs
  // =====================

  app.get("/api/admin/webhook-logs", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const logs = await storage.getAllWebhookLogs();
      res.json(logs);
    } catch (error) {
      logger.error("Admin", "Error fetching webhook logs:", error);
      res.status(500).json({ message: "Failed to fetch webhook logs" });
    }
  });

  // =====================
  // Admin Dev Tools - Data Source Import/Export
  // =====================

  app.get("/api/admin/data-sources", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAppAdmin(userId, storage))) {
        return res
          .status(403)
          .json({ message: "Access denied. Application Admin required." });
      }

      const allDataSources = await storage.getAllDataSources();

      const maskedSources = allDataSources.map((ds: DataSource) => ({
        ...ds,
        accessToken: ds.accessToken ? `***${ds.accessToken.slice(-8)}` : null,
        refreshToken: ds.refreshToken
          ? `***${ds.refreshToken.slice(-8)}`
          : null,
      }));

      res.json(maskedSources);
    } catch (error) {
      logger.error("Admin", "Error fetching admin data sources:", error);
      res.status(500).json({ message: "Failed to fetch data sources" });
    }
  });

  app.get(
    "/api/admin/data-sources/:id/export",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        if (!(await isAppAdmin(userId, storage))) {
          return res
            .status(403)
            .json({ message: "Access denied. Application Admin required." });
        }

        const id = req.params.id as string;
        const dataSource = await storage.getDataSource(id);

        if (!dataSource) {
          return res.status(404).json({ message: "Data source not found" });
        }

        res.json({
          provider: dataSource.provider,
          name: dataSource.name,
          accessToken: dataSource.accessToken,
          refreshToken: dataSource.refreshToken,
          tokenExpiresAt: dataSource.tokenExpiresAt,
          isConnected: dataSource.isConnected,
        });
      } catch (error) {
        logger.error("Admin", "Error exporting data source:", error);
        res.status(500).json({ message: "Failed to export data source" });
      }
    },
  );

  const importDataSourceSchema = z.object({
    provider: z.enum(["hospitable"]).default("hospitable"),
    name: z.string().min(1, "Name is required"),
    accessToken: z.string().min(1, "Access token is required"),
    refreshToken: z.string().optional().nullable(),
    tokenExpiresAt: z.string().optional().nullable(),
    workspaceId: z.string().optional().nullable(),
  });

  app.post(
    "/api/admin/data-sources/import",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        if (!(await isAppAdmin(userId, storage))) {
          return res
            .status(403)
            .json({ message: "Access denied. Application Admin required." });
        }

        const parseResult = importDataSourceSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            message: "Invalid request data",
            errors: parseResult.error.flatten().fieldErrors,
          });
        }

        const {
          provider,
          name,
          accessToken,
          refreshToken,
          tokenExpiresAt,
          workspaceId,
        } = parseResult.data;

        const newDataSource = await storage.createDataSource({
          userId,
          workspaceId: workspaceId || null,
          provider,
          name,
          accessToken,
          refreshToken: refreshToken || null,
          tokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt) : null,
          isConnected: true,
        });

        logger.info(
          "Admin",
          `Data source imported: ${newDataSource.id} by user ${userId}`,
        );
        res.json(newDataSource);
      } catch (error) {
        logger.error("Admin", "Error importing data source:", error);
        res.status(500).json({ message: "Failed to import data source" });
      }
    },
  );
}
