import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { logger } from "./logger";

import { registerDataSourceRoutes } from "./routes/data-sources";
import { registerListingRoutes } from "./routes/listings";
import { registerListingAnalysisRoutes } from "./routes/listing-analyses";
import { registerAdminRoutes } from "./routes/admin";
import { registerUserRoutes } from "./routes/user";
import { registerWorkspaceRoutes } from "./routes/workspaces";
import { registerTagsThemesTasksRoutes } from "./routes/tags-themes-tasks";
import { registerProcedureRoutes } from "./routes/procedures";
import { registerCleanerRoutes } from "./routes/cleaners";
import { registerFolderRoutes } from "./routes/folders";
import { registerReviewRoutes } from "./routes/reviews";
import { registerWebhookRoutes } from "./routes/webhooks";
import { registerLumiRoutes } from "./routes/lumi";
import { registerMobileRoutes } from "./routes/mobile";
import { registerAirbnbScanRoutes } from "./routes/airbnb-scans";
import { registerNotionRoutes } from "./routes/notion";
import { registerReportsRoutes } from "./routes/reports";
import { registerNudgeRoutes } from "./routes/nudge";
import { registerReviewRemovalRoutes } from "./routes/review-removal";

import { scheduleReviewCheck as _scheduleReviewCheck } from "./routes/reviews";
import { scheduleChangelogSuggest as _scheduleChangelogSuggest, scheduleChangelogSend as _scheduleChangelogSend } from "./routes/admin";

export function scheduleReviewCheck() { _scheduleReviewCheck(storage); }
export function scheduleChangelogSuggest() { _scheduleChangelogSuggest(storage); }
export function scheduleChangelogSend() { _scheduleChangelogSend(storage); }

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  registerDataSourceRoutes(app, storage);
  registerListingRoutes(app, storage);
  registerListingAnalysisRoutes(app, storage);
  registerAdminRoutes(app, storage);
  registerUserRoutes(app, storage);
  registerWorkspaceRoutes(app, storage);
  registerTagsThemesTasksRoutes(app, storage);
  registerProcedureRoutes(app, storage);
  registerCleanerRoutes(app, storage);
  registerFolderRoutes(app, storage);
  registerReviewRoutes(app, storage);
  registerWebhookRoutes(app, storage);
  registerLumiRoutes(app, storage);
  registerMobileRoutes(app, storage);
  registerAirbnbScanRoutes(app, storage);
  registerNotionRoutes(app, storage);
  registerReportsRoutes(app, storage);
  registerNudgeRoutes(app, storage);
  registerReviewRemovalRoutes(app, storage);

  logger.info("Routes", "All route modules registered successfully");
  return httpServer;
}
