import type { Express, Request } from "express";
import crypto from "crypto";
import { IStorage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { config } from "../config";
import { logger } from "../logger";
import { insertDataSourceSchema } from "@shared/schema";
import { fetchHospitableProperties } from "../services/hospitable";
import { hospitable_connect } from "../services/hospitable-connect";
import {
  getUserId,
  getWorkspaceId,
  validateWorkspaceMembership,
  getParamId,
} from "./helpers";
import { z } from "zod";

const isDevelopment = config.isDevelopment;

/** Strip sensitive OAuth tokens before sending to the client. */
function sanitizeDataSource<T extends Record<string, unknown>>(
  ds: T,
): Omit<T, "accessToken" | "refreshToken"> {
  const { accessToken, refreshToken, ...safe } = ds;
  return safe as Omit<T, "accessToken" | "refreshToken">;
}

/** Escape HTML special characters to prevent XSS. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Allowed postMessage target origin for OAuth popups. */
const POSTMESSAGE_ORIGIN = config.appUrl || "https://hostpulse.ai";

const HOSPITABLE_CLIENT_ID =
  isDevelopment && config.hospitable.clientIdDev
    ? config.hospitable.clientIdDev
    : config.hospitable.clientId;

const HOSPITABLE_CLIENT_SECRET =
  isDevelopment && config.hospitable.clientSecretDev
    ? config.hospitable.clientSecretDev
    : config.hospitable.clientSecret;

const getHospitableRedirectUri = () => {
  if (isDevelopment && config.hospitable.redirectUriDev) {
    return config.hospitable.redirectUriDev;
  }
  return "https://hostpulse.ai/api/oauth/hospitable/callback";
};

const HOSPITABLE_REDIRECT_URI = getHospitableRedirectUri();

const NOTION_CLIENT_ID = isDevelopment
  ? config.notion.clientIdDev || config.notion.clientId
  : config.notion.clientId;
const NOTION_CLIENT_SECRET = isDevelopment
  ? config.notion.clientSecretDev || config.notion.clientSecret
  : config.notion.clientSecret;

const getNotionRedirectUri = (req?: Request) => {
  if (isDevelopment && req) {
    const host = req.get("host") || "";
    const protocol = req.get("x-forwarded-proto") || req.protocol || "https";
    return `${protocol}://${host}/api/oauth/notion/callback`;
  }
  if (config.notion.redirectUriDev && isDevelopment) {
    return config.notion.redirectUriDev;
  }
  return "https://hostpulse.ai/api/oauth/notion/callback";
};

export function registerDataSourceRoutes(
  app: Express,
  storage: IStorage,
): void {
  // =====================
  // Data Sources
  // =====================

  app.get("/api/data-sources", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      let workspaceId = getWorkspaceId(req);

      if (
        workspaceId &&
        !(await validateWorkspaceMembership(userId, workspaceId))
      ) {
        logger.info(
          "DataSources",
          `Falling back to user-scoped for /api/data-sources - invalid workspace ${workspaceId} for user ${userId}`,
        );
        workspaceId = null;
      }

      let dataSources;
      if (workspaceId) {
        dataSources = await storage.getDataSourcesByWorkspace(workspaceId);
      } else {
        dataSources = await storage.getDataSourcesByUser(userId);
      }
      res.json(dataSources.map(sanitizeDataSource));
    } catch (error) {
      logger.error("DataSources", "Error fetching data sources:", error);
      res.status(500).json({ message: "Failed to fetch data sources" });
    }
  });

  app.get("/api/data-sources/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const dataSource = await storage.getDataSource(getParamId(req.params.id));

      if (!dataSource || dataSource.userId !== userId) {
        return res.status(404).json({ message: "Data source not found" });
      }

      res.json(sanitizeDataSource(dataSource));
    } catch (error) {
      logger.error("DataSources", "Error fetching data source:", error);
      res.status(500).json({ message: "Failed to fetch data source" });
    }
  });

  app.post("/api/data-sources", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const validatedData = insertDataSourceSchema.parse({
        ...req.body,
        userId,
      });

      const dataSource = await storage.createDataSource(validatedData);
      res.status(201).json(dataSource);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Invalid data", errors: error.errors });
      }
      logger.error("DataSources", "Error creating data source:", error);
      res.status(500).json({ message: "Failed to create data source" });
    }
  });

  app.patch("/api/data-sources/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const dataSource = await storage.getDataSource(getParamId(req.params.id));

      if (!dataSource || dataSource.userId !== userId) {
        return res.status(404).json({ message: "Data source not found" });
      }

      // Only allow updating safe fields (prevent mass assignment)
      const allowedFields = ["name"] as const;
      const safeUpdate: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          safeUpdate[field] = req.body[field];
        }
      }

      const updated = await storage.updateDataSource(
        getParamId(req.params.id),
        safeUpdate,
      );
      if (!updated) {
        return res.status(404).json({ message: "Data source not found" });
      }
      res.json(sanitizeDataSource(updated));
    } catch (error) {
      logger.error("DataSources", "Error updating data source:", error);
      res.status(500).json({ message: "Failed to update data source" });
    }
  });

  app.delete("/api/data-sources/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const dataSource = await storage.getDataSource(getParamId(req.params.id));

      if (!dataSource || dataSource.userId !== userId) {
        return res.status(404).json({ message: "Data source not found" });
      }

      await storage.deleteDataSource(getParamId(req.params.id));
      res.status(204).send();
    } catch (error) {
      logger.error("DataSources", "Error deleting data source:", error);
      res.status(500).json({ message: "Failed to delete data source" });
    }
  });

  // =====================
  // Hospitable OAuth
  // =====================

  app.get(
    "/api/oauth/hospitable/authorize",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        const workspaceId =
          (req.query.workspaceId as string) || getWorkspaceId(req);

        const existingSources = await storage.getDataSourcesByUser(userId);
        const existingHospitable = existingSources.find(
          (ds) => ds.provider === "hospitable" && ds.isConnected,
        );

        if (existingHospitable) {
          return res.redirect("/?already_connected=true");
        }

        if (!HOSPITABLE_CLIENT_ID || !HOSPITABLE_CLIENT_SECRET) {
          logger.error("OAuth", "Hospitable OAuth credentials not configured");
          return res.redirect("/data-sources?error=oauth_not_configured");
        }

        (req.session as any).oauthUserId = userId;

        const nonce = crypto.randomBytes(32).toString("hex");
        (req.session as any).oauthNonce = nonce;

        const originHost = req.get("host") || "";
        const originProtocol =
          req.get("x-forwarded-proto") || req.protocol || "https";
        const originUrl = `${originProtocol}://${originHost}`;
        const stateData = { userId, workspaceId, originUrl, nonce };
        const state = Buffer.from(JSON.stringify(stateData)).toString("base64");
        logger.info(
          "OAuth",
          `Origin URL: ${originUrl}, WorkspaceId: ${workspaceId}, State: ${state}`,
        );

        const authUrl = new URL("https://auth.hospitable.com/oauth/authorize");
        authUrl.searchParams.set("client_id", HOSPITABLE_CLIENT_ID);
        authUrl.searchParams.set("redirect_uri", HOSPITABLE_REDIRECT_URI);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("state", state);

        logger.info(
          "OAuth",
          `Authorizing with redirect_uri: ${HOSPITABLE_REDIRECT_URI}`,
        );
        res.redirect(authUrl.toString());
      } catch (error) {
        logger.error("OAuth", "Error in OAuth authorization:", error);
        res.redirect("/data-sources?error=oauth_failed");
      }
    },
  );

  app.get("/api/oauth/hospitable/callback", async (req, res) => {
    const { code, error, state } = req.query;

    let stateData: {
      userId?: string;
      workspaceId?: string;
      originUrl?: string;
      nonce?: string;
    } = {};
    if (state) {
      try {
        stateData = JSON.parse(
          Buffer.from(state as string, "base64").toString(),
        );
        logger.info(
          "OAuth",
          `Callback parsed state: userId=${stateData.userId}, workspaceId=${stateData.workspaceId}, originUrl=${stateData.originUrl}`,
        );
      } catch (e) {
        logger.error("OAuth", "Failed to parse OAuth state:", e);
      }
    }

    // Verify CSRF nonce
    const sessionNonce = (req.session as any)?.oauthNonce;
    if (!stateData.nonce || !sessionNonce || stateData.nonce !== sessionNonce) {
      logger.error("OAuth", "CSRF nonce mismatch in Hospitable OAuth callback");
      return res.status(403).send("OAuth state verification failed");
    }
    delete (req.session as any).oauthNonce;

    try {
      const userId = stateData.userId || (req.session as any)?.oauthUserId;
      const workspaceId = stateData.workspaceId;

      const sendErrorHtml = (errorCode: string, message: string) => {
        const safeMessage = escapeHtml(message);
        const safeCode = escapeHtml(errorCode);
        res.send(`
          <!DOCTYPE html>
          <html>
            <head><title>Connection Failed</title></head>
            <body>
              <h2>Connection failed</h2>
              <p>${safeMessage}</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'oauth_error', error: '${safeCode}' }, '${POSTMESSAGE_ORIGIN}');
                }
                setTimeout(() => window.close(), 3000);
              </script>
            </body>
          </html>
        `);
      };

      if (error) {
        logger.error("OAuth", "OAuth error from Hospitable:", error);
        return sendErrorHtml(
          "oauth_denied",
          "You denied access to your Hospitable account.",
        );
      }

      if (!code || !userId) {
        logger.error("OAuth", "Missing code or userId:", {
          hasCode: !!code,
          hasUserId: !!userId,
          state: !!state,
        });
        return sendErrorHtml(
          "oauth_failed",
          "Missing authorization code or user information.",
        );
      }

      if (!HOSPITABLE_CLIENT_ID || !HOSPITABLE_CLIENT_SECRET) {
        logger.error("OAuth", "Client credentials not configured");
        return sendErrorHtml(
          "oauth_not_configured",
          "Hospitable integration is not configured.",
        );
      }

      const tokenResponse = await fetch(
        "https://auth.hospitable.com/oauth/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: HOSPITABLE_CLIENT_ID,
            client_secret: HOSPITABLE_CLIENT_SECRET,
            redirect_uri: HOSPITABLE_REDIRECT_URI,
            grant_type: "authorization_code",
            code,
          }),
        },
      );

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        logger.error(
          "OAuth",
          "Failed to exchange OAuth code:",
          tokenResponse.status,
          errorText,
        );
        return res.send(`
          <!DOCTYPE html>
          <html>
            <head><title>Connection Failed</title></head>
            <body style="font-family: system-ui, sans-serif; padding: 20px;">
              <h2>Connection failed</h2>
              <p>Token exchange failed (HTTP ${tokenResponse.status})</p>
              <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow: auto; max-width: 400px;">${escapeHtml(errorText)}</pre>
              <p style="color: #666; font-size: 12px; margin-top: 20px;">Please ensure the redirect URL in your Hospitable app is set to:<br><code>https://hostpulse.ai/api/oauth/hospitable/callback</code></p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'oauth_error', error: 'token_exchange_failed' }, '${POSTMESSAGE_ORIGIN}');
                }
              </script>
            </body>
          </html>
        `);
      }

      const tokenData = await tokenResponse.json();

      let validWorkspaceId = workspaceId;
      if (validWorkspaceId) {
        const existingWorkspace = await storage.getWorkspace(validWorkspaceId);
        if (!existingWorkspace) {
          logger.info(
            "OAuth",
            `Workspace ${validWorkspaceId} does not exist, creating new workspace`,
          );
          const { db } = await import("../db");
          const { workspaces } = await import("@shared/schema");
          await db.insert(workspaces).values({
            id: validWorkspaceId,
            name: "My Properties",
            propertyManagementSoftware: "hospitable",
            createdBy: userId,
          });
        }

        const membership = await storage.getWorkspaceMember(
          validWorkspaceId,
          userId,
        );
        if (!membership) {
          logger.info(
            "OAuth",
            `User ${userId} is not a member of workspace ${validWorkspaceId}, adding membership`,
          );
          await storage.createWorkspaceMember({
            workspaceId: validWorkspaceId,
            userId,
            role: "admin_user",
            status: "active",
          });
        }
      }

      logger.info(
        "OAuth",
        `Creating data source for userId=${userId}, workspaceId=${validWorkspaceId || "none"}`,
      );

      const newDataSource = await storage.createDataSource({
        userId,
        workspaceId: validWorkspaceId || undefined,
        provider: "hospitable",
        name: "Hospitable Account",
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : undefined,
        isConnected: true,
        lastSyncAt: new Date(),
      });

      logger.info(
        "OAuth",
        `Data source created with ID: ${newDataSource?.id}, isConnected: ${newDataSource?.isConnected}`,
      );

      delete (req.session as any).oauthUserId;

      logger.info(
        "OAuth",
        `Success! Data source created for user ${userId} in workspace ${validWorkspaceId}`,
      );

      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Connected!</title></head>
          <body>
            <h2>Successfully connected to Hospitable!</h2>
            <p>This window will close automatically...</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'oauth_success', provider: 'hospitable' }, '${POSTMESSAGE_ORIGIN}');
              }
              setTimeout(() => window.close(), 1500);
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      logger.error("OAuth", "Hospitable callback error:", error);
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Connection Failed</title></head>
          <body>
            <h2>Connection failed</h2>
            <p>Please close this window and try again.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'oauth_error', error: 'oauth_failed' }, '${POSTMESSAGE_ORIGIN}');
              }
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
        </html>
      `);
    }
  });

  // ========== Notion OAuth Routes ==========

  app.get("/api/oauth/notion/authorize", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId =
        (req.query.workspaceId as string) || getWorkspaceId(req);

      if (!workspaceId) {
        return res.redirect("/data-sources?error=no_workspace");
      }

      const existingConnection =
        await storage.getNotionConnectionByWorkspace(workspaceId);
      if (existingConnection) {
        return res.redirect("/data-sources?already_connected=notion");
      }

      if (!NOTION_CLIENT_ID || !NOTION_CLIENT_SECRET) {
        logger.error("OAuth", "Notion OAuth credentials not configured");
        return res.redirect("/data-sources?error=oauth_not_configured");
      }

      (req.session as any).notionOauthUserId = userId;

      const notionNonce = crypto.randomBytes(32).toString("hex");
      (req.session as any).notionOauthNonce = notionNonce;

      const originHost = req.get("host") || "";
      const originProtocol =
        req.get("x-forwarded-proto") || req.protocol || "https";
      const originUrl = `${originProtocol}://${originHost}`;
      const stateData = { userId, workspaceId, originUrl, nonce: notionNonce };
      const state = Buffer.from(JSON.stringify(stateData)).toString("base64");
      logger.info(
        "OAuth",
        `Notion Origin URL: ${originUrl}, WorkspaceId: ${workspaceId}, State: ${state}`,
      );

      const redirectUri = getNotionRedirectUri(req);
      const authUrl = new URL("https://api.notion.com/v1/oauth/authorize");
      authUrl.searchParams.set("client_id", NOTION_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("owner", "user");
      authUrl.searchParams.set("state", state);

      logger.info(
        "OAuth",
        `Notion authorizing with redirect_uri: ${redirectUri}`,
      );
      res.redirect(authUrl.toString());
    } catch (error) {
      logger.error("OAuth", "Error in Notion OAuth authorization:", error);
      res.redirect("/data-sources?error=oauth_failed");
    }
  });

  app.get("/api/oauth/notion/callback", async (req, res) => {
    const { code, error, state } = req.query;

    let stateData: {
      userId?: string;
      workspaceId?: string;
      originUrl?: string;
      nonce?: string;
    } = {};
    if (state) {
      try {
        stateData = JSON.parse(
          Buffer.from(state as string, "base64").toString(),
        );
        logger.info(
          "OAuth",
          `Notion callback parsed state: userId=${stateData.userId}, workspaceId=${stateData.workspaceId}, originUrl=${stateData.originUrl}`,
        );
      } catch (e) {
        logger.error(
          "OAuth",
          "Notion callback failed to parse OAuth state:",
          e,
        );
      }
    }

    // Verify CSRF nonce
    const notionSessionNonce = (req.session as any)?.notionOauthNonce;
    if (
      !stateData.nonce ||
      !notionSessionNonce ||
      stateData.nonce !== notionSessionNonce
    ) {
      logger.error("OAuth", "CSRF nonce mismatch in Notion OAuth callback");
      return res.status(403).send("OAuth state verification failed");
    }
    delete (req.session as any).notionOauthNonce;

    const sendErrorHtml = (errorCode: string, message: string) => {
      const safeMessage = escapeHtml(message);
      const safeCode = escapeHtml(errorCode);
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Connection Failed</title></head>
          <body style="font-family: system-ui, sans-serif; padding: 20px;">
            <h2>Connection failed</h2>
            <p>${safeMessage}</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'oauth_error', error: '${safeCode}', provider: 'notion' }, '${POSTMESSAGE_ORIGIN}');
              }
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
        </html>
      `);
    };

    try {
      const userId =
        stateData.userId || (req.session as any)?.notionOauthUserId;
      const workspaceId = stateData.workspaceId;

      if (error) {
        logger.error("OAuth", "Notion OAuth error from Notion:", error);
        return sendErrorHtml(
          "oauth_denied",
          "You denied access to your Notion account.",
        );
      }

      if (!code || !userId || !workspaceId) {
        logger.error(
          "OAuth",
          "Notion callback missing code, userId, or workspaceId:",
          {
            hasCode: !!code,
            hasUserId: !!userId,
            hasWorkspaceId: !!workspaceId,
          },
        );
        return sendErrorHtml(
          "oauth_failed",
          "Missing authorization code or user information.",
        );
      }

      if (!NOTION_CLIENT_ID || !NOTION_CLIENT_SECRET) {
        logger.error("OAuth", "Notion client credentials not configured");
        return sendErrorHtml(
          "oauth_not_configured",
          "Notion integration is not configured.",
        );
      }

      const callbackRedirectUri = stateData.originUrl
        ? `${stateData.originUrl}/api/oauth/notion/callback`
        : getNotionRedirectUri(req);

      const credentials = Buffer.from(
        `${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`,
      ).toString("base64");
      const tokenResponse = await fetch(
        "https://api.notion.com/v1/oauth/token",
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            grant_type: "authorization_code",
            code,
            redirect_uri: callbackRedirectUri,
          }),
        },
      );

      logger.info(
        "OAuth",
        `Notion token exchange with redirect_uri: ${callbackRedirectUri}`,
      );

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        logger.error(
          "OAuth",
          "Notion failed to exchange OAuth code:",
          tokenResponse.status,
          errorText,
        );
        return res.send(`
          <!DOCTYPE html>
          <html>
            <head><title>Connection Failed</title></head>
            <body style="font-family: system-ui, sans-serif; padding: 20px;">
              <h2>Connection failed</h2>
              <p>Token exchange failed (HTTP ${tokenResponse.status})</p>
              <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow: auto; max-width: 400px;">${escapeHtml(errorText)}</pre>
              <p style="color: #666; font-size: 12px; margin-top: 20px;">Please ensure the redirect URL in your Notion integration is set to:<br><code>${escapeHtml(callbackRedirectUri)}</code></p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'oauth_error', error: 'token_exchange_failed', provider: 'notion' }, '${POSTMESSAGE_ORIGIN}');
                }
              </script>
            </body>
          </html>
        `);
      }

      const tokenData = (await tokenResponse.json()) as {
        access_token: string;
        bot_id: string;
        workspace_id: string;
        workspace_name?: string;
        workspace_icon?: string;
        owner?: { type: string; user?: any };
      };

      const existingByBotId = await storage.getNotionConnectionByBotId(
        tokenData.bot_id,
      );
      if (existingByBotId && existingByBotId.workspaceId !== workspaceId) {
        return sendErrorHtml(
          "already_connected",
          "This Notion workspace is already connected to a different HostPulse workspace.",
        );
      }

      if (existingByBotId) {
        await storage.updateNotionConnection(existingByBotId.id, {
          accessToken: tokenData.access_token,
          notionWorkspaceName: tokenData.workspace_name,
          notionWorkspaceIcon: tokenData.workspace_icon,
          connectedBy: userId,
        });
      } else {
        await storage.createNotionConnection({
          workspaceId,
          notionWorkspaceId: tokenData.workspace_id,
          notionWorkspaceName: tokenData.workspace_name || undefined,
          notionWorkspaceIcon: tokenData.workspace_icon || undefined,
          accessToken: tokenData.access_token,
          botId: tokenData.bot_id,
          connectedBy: userId,
          autoSyncEnabled: false,
        });
      }

      delete (req.session as any).notionOauthUserId;

      logger.info(
        "OAuth",
        `Notion connection created for workspace ${workspaceId}.`,
      );

      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Connected!</title></head>
          <body style="font-family: system-ui, sans-serif; padding: 20px;">
            <h2>Successfully connected to Notion!</h2>
            <p>Workspace: ${escapeHtml(tokenData.workspace_name || "Unknown")}</p>
            <p>This window will close automatically...</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'oauth_success', provider: 'notion' }, '${POSTMESSAGE_ORIGIN}');
              }
              setTimeout(() => window.close(), 1500);
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      logger.error("OAuth", "Notion callback error:", error);
      sendErrorHtml("oauth_failed", "Please close this window and try again.");
    }
  });

  // =====================
  // Hospitable Connect (Airbnb via platform token)
  // =====================

  app.post(
    "/api/hospitable-connect/customers",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        const workspaceId = getWorkspaceId(req) || undefined;
        const { email, name } = req.body;

        if (!email) {
          return res.status(400).json({ message: "Email is required" });
        }

        const originHost = req.get("host") || "";
        const originProtocol =
          req.get("x-forwarded-proto") || req.protocol || "https";
        const originUrl = `${originProtocol}://${originHost}`;

        const customerId = await hospitable_connect.createCustomerForWorkspace(
          email,
          userId,
          name,
          workspaceId,
          originUrl,
        );

        res.json({ customerId });
      } catch (error) {
        logger.error("Connect", "Error creating customer:", error);
        res.status(500).json({ message: "Failed to create customer" });
      }
    },
  );

  app.post(
    "/api/hospitable-connect/auth-codes",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        const workspaceId = getWorkspaceId(req) || undefined;
        const { customerId: providedCustomerId, returnUrl } = req.body;

        const originHost = req.get("host") || "";
        const originProtocol =
          req.get("x-forwarded-proto") || req.protocol || "https";
        const defaultReturnUrl = `${originProtocol}://${originHost}/data-sources`;
        const finalReturnUrl = returnUrl || defaultReturnUrl;
        const customerId = providedCustomerId || userId;

        const {
          authCode,
          expiresAt,
          returnUrl: connectReturnUrl,
        } = await hospitable_connect.generateAuthCodeForCustomer(
          customerId,
          finalReturnUrl,
        );

        // Idempotent: only create a data source if one doesn't already exist
        // for this user + customerId combination.
        // isConnected stays false until the channel.activated webhook fires.
        const existingAirbnbSources = await storage.getDataSourcesByUser(userId);
        const existingAirbnb = existingAirbnbSources.find(
          (ds) => ds.provider === "airbnb" && ds.externalCustomerId === customerId,
        );
        if (!existingAirbnb) {
          await storage.createDataSource({
            userId,
            workspaceId,
            provider: "airbnb",
            name: "Airbnb Account",
            externalCustomerId: customerId,
            isConnected: false,
          });
          logger.info(
            "Connect",
            `Created Airbnb Connect data source for customer ${customerId}, user ${userId}`,
          );
        } else {
          logger.info(
            "Connect",
            `Airbnb Connect data source already exists (${existingAirbnb.id}) for customer ${customerId} — skipping creation`,
          );
        }

        const computedReturnUrl =
          connectReturnUrl ||
          `https://connect.hospitable.com/authorize?auth_code=${encodeURIComponent(authCode)}`;

        res.json({
          authCode,
          expiresAt,
          data: {
            return_url: computedReturnUrl,
          },
        });
      } catch (error) {
        logger.error("Connect", "Error generating auth code:", error);
        res.status(500).json({ message: "Failed to generate auth code" });
      }
    },
  );

  // Called by the frontend after the user completes the Airbnb OAuth flow to
  // mark the data source as connected and trigger an initial listing sync.
  app.post(
    "/api/hospitable-connect/activate",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        const customerId = req.body.customerId || userId;

        const allSources = await storage.getDataSourcesByUser(userId);
        const airbnbSource = allSources.find(
          (ds) =>
            ds.provider === "airbnb" &&
            ds.externalCustomerId === customerId,
        );

        if (!airbnbSource) {
          return res
            .status(404)
            .json({ message: "Airbnb data source not found" });
        }

        // Mark as connected immediately so the frontend can proceed.
        await storage.updateDataSource(airbnbSource.id, {
          isConnected: true,
        });
        logger.info(
          "Connect",
          `Activated Airbnb data source ${airbnbSource.id} for user ${userId}`,
        );

        // Properties are NOT auto-imported here — the user selects and imports
        // them manually from the Properties page, same as the Hospitable Public
        // API flow (toggle to import).
        res.json({ success: true, dataSourceId: airbnbSource.id });
      } catch (error) {
        logger.error(
          "Connect",
          "Error activating Airbnb data source:",
          error,
        );
        res
          .status(500)
          .json({ message: "Failed to activate Airbnb connection" });
      }
    },
  );

  // Refresh owner/account metadata for all existing listings under a data source
  app.post(
    "/api/data-sources/:id/refresh-owner-metadata",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        const dataSourceId = getParamId(req.params.id);
        const dataSource = await storage.getDataSource(dataSourceId);

        if (!dataSource || dataSource.userId !== userId) {
          return res.status(404).json({ message: "Data source not found" });
        }

        let properties: any[] = [];

        if (dataSource.provider === "airbnb") {
          if (!dataSource.externalCustomerId) {
            return res.status(400).json({
              message:
                "Missing external customer ID for Airbnb Connect data source",
            });
          }

          const connectListings = await hospitable_connect.getCustomerListings(
            dataSource.externalCustomerId,
          );

          properties = connectListings.map((listing: any) => ({
            id: listing.id,
            name: listing.public_name || listing.private_name || listing.name || "Unnamed Listing",
            public_name: listing.public_name || listing.private_name || listing.name || "Unnamed Listing",
            picture: listing.picture,
            owner: {
              name: listing.channel?.name || listing.channels?.[0]?.name || undefined,
              email: listing.channel?.email || listing.channels?.[0]?.email || undefined,
            },
            listings: [{ platform: listing.platform || "airbnb", platform_id: listing.platform_id }],
          }));
        } else {
          const { data, error } = await fetchHospitableProperties(dataSourceId);

          if (error || !data) {
            return res.status(500).json({
              message: error || "Failed to fetch properties from Hospitable",
            });
          }

          properties = (data as any)?.data || [];
        }

        const existingListings =
          await storage.getListingsByDataSource(dataSourceId);

        let updatedCount = 0;

        for (const property of properties) {
          const existing = existingListings.find(
            (l) => l.externalId === property.id,
          );
          if (!existing) continue;

          const airbnbListing = Array.isArray(property.listings)
            ? property.listings.find((l: any) => l.platform === "airbnb")
            : null;

          const resolvedOwnerName =
            property.owner?.name ||
            property.user?.name ||
            (property.user?.first_name && property.user?.last_name
              ? `${property.user.first_name} ${property.user.last_name}`.trim()
              : property.user?.first_name ||
                property.user?.last_name ||
                null) ||
            airbnbListing?.platform_name ||
            null;

          const resolvedAccountEmail =
            property.owner?.email ||
            property.user?.email ||
            airbnbListing?.platform_email ||
            null;

          if (resolvedOwnerName !== null || resolvedAccountEmail !== null) {
            await storage.updateListing(existing.id, {
              ownerName: resolvedOwnerName ?? existing.ownerName,
              accountEmail: resolvedAccountEmail ?? existing.accountEmail,
            });
            updatedCount++;
          }
        }

        logger.info(
          "DataSources",
          `Refreshed owner metadata for ${updatedCount} listings under data source ${dataSourceId}`,
        );
        res.json({ updated: updatedCount });
      } catch (error) {
        logger.error("DataSources", "Error refreshing owner metadata:", error);
        res.status(500).json({ message: "Failed to refresh owner metadata" });
      }
    },
  );

  // Fetch properties from Hospitable API
  app.get(
    "/api/data-sources/:id/properties",
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        const dataSourceId = getParamId(req.params.id);
        const dataSource = await storage.getDataSource(dataSourceId);

        if (!dataSource || dataSource.userId !== userId) {
          return res.status(404).json({ message: "Data source not found" });
        }

        if (dataSource.provider === "airbnb") {
          if (!dataSource.externalCustomerId) {
            return res.status(400).json({
              message:
                "Missing external customer ID for Airbnb Connect data source",
            });
          }

          const connectListings = await hospitable_connect.getCustomerListings(
            dataSource.externalCustomerId,
          );

          const mappedResponse = {
            data: connectListings.map((listing: any) => ({
              id: listing.id,
              name: listing.public_name || listing.private_name || "Unnamed Listing",
              public_name: listing.public_name || listing.private_name || "Unnamed Listing",
              picture: listing.picture,
              listings: [{ platform: listing.platform || "airbnb", platform_id: listing.platform_id }],
            })),
          };

          return res.json(mappedResponse);
        }

        const { data, error, statusCode } =
          await fetchHospitableProperties(dataSourceId);

        if (error) {
          logger.error(
            "DataSources",
            `Error fetching properties for data source ${dataSourceId}:`,
            error,
          );
          return res.status(statusCode || 500).json({
            message: error,
            details:
              "Please try again or reconnect your Hospitable account in Data Sources.",
          });
        }

        res.json(data);
      } catch (error) {
        logger.error("DataSources", "Error fetching properties:", error);
        res.status(500).json({ message: "Failed to fetch properties" });
      }
    },
  );

  // Fetch properties from ALL connected data sources for the current user/workspace
  app.get("/api/properties/all", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);

      let allDataSources;
      if (workspaceId && (await validateWorkspaceMembership(userId, workspaceId))) {
        allDataSources = await storage.getDataSourcesByWorkspace(workspaceId);
      } else {
        allDataSources = await storage.getDataSourcesByUser(userId);
      }

      const connectedSources = allDataSources.filter((ds) => ds.isConnected);

      if (connectedSources.length === 0) {
        return res.json({ data: [] });
      }

      const allProperties: any[] = [];

      for (const dataSource of connectedSources) {
        try {
          if (dataSource.provider === "airbnb") {
            if (!dataSource.externalCustomerId) continue;
            const connectListings = await hospitable_connect.getCustomerListings(
              dataSource.externalCustomerId,
            );
            const mapped = connectListings.map((listing: any) => ({
              id: listing.id,
              name: listing.public_name || listing.private_name || "Unnamed Listing",
              public_name: listing.public_name || listing.private_name || "Unnamed Listing",
              picture: listing.picture,
              property_type: listing.property_type,
              address: listing.address,
              capacity: listing.capacity,
              bedrooms: listing.bedrooms,
              bathrooms: listing.bathrooms,
              amenities: listing.amenities,
              description: listing.description,
              summary: listing.summary,
              owner: {
                name: listing.channel?.name || listing.channels?.[0]?.name || undefined,
                email: listing.channel?.email || listing.channels?.[0]?.email || undefined,
              },
              listings: [{ platform: listing.platform || "airbnb", platform_id: listing.platform_id }],
              // Attach source metadata so client knows which data source to import through
              _dataSourceId: dataSource.id,
              _provider: dataSource.provider,
            }));
            allProperties.push(...mapped);
          } else if (dataSource.provider === "hospitable") {
            const { data, error } = await fetchHospitableProperties(dataSource.id);
            if (error || !data) {
              logger.error(
                "DataSources",
                `Error fetching properties for data source ${dataSource.id}:`,
                error,
              );
              continue;
            }
            const props: any[] = (data as any)?.data || [];
            const mapped = props.map((p: any) => ({
              ...p,
              _dataSourceId: dataSource.id,
              _provider: dataSource.provider,
            }));
            allProperties.push(...mapped);
          }
        } catch (err) {
          logger.error(
            "DataSources",
            `Error fetching properties for data source ${dataSource.id}:`,
            err,
          );
        }
      }

      res.json({ data: allProperties });
    } catch (error) {
      logger.error("DataSources", "Error fetching all properties:", error);
      res.status(500).json({ message: "Failed to fetch properties" });
    }
  });

  // Sync listings from data source
  app.post("/api/data-sources/:id/sync", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const dataSource = await storage.getDataSource(getParamId(req.params.id));

      if (!dataSource || dataSource.userId !== userId) {
        return res.status(404).json({ message: "Data source not found" });
      }

      if (dataSource.provider === "airbnb") {
        // Airbnb Connect data sources are synced via Hospitable Connect, not Public API
        if (!dataSource.externalCustomerId) {
          return res.status(400).json({
            message: "Missing external customer ID for Airbnb Connect data source",
          });
        }
        if (!dataSource.isConnected) {
          return res.status(400).json({
            message: "Airbnb Connect data source is not connected. Please re-authorize via Hospitable Connect.",
          });
        }
        logger.info(
          "DataSources",
          `Triggering Connect sync for data source ${dataSource.id}, customer ${dataSource.externalCustomerId}`,
        );
        await hospitable_connect.syncConnectListings(
          dataSource.id,
          dataSource.externalCustomerId,
        );
      } else {
        // For Hospitable Public API sources, just record the sync timestamp.
        // Actual re-import is triggered by the user via /api/listings/import.
        await storage.updateDataSource(dataSource.id, { lastSyncAt: new Date() });
        logger.info(
          "DataSources",
          `Recorded sync timestamp for Hospitable data source ${dataSource.id}`,
        );
      }

      const currentListings = await storage.getListingsByDataSource(dataSource.id);
      res.json({ synced: currentListings.length, listings: currentListings });
    } catch (error) {
      logger.error("DataSources", "Error syncing data source:", error);
      res.status(500).json({ message: "Failed to sync data source" });
    }
  });
}
