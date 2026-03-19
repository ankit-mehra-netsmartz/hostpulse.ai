import express, { type Request, Response, NextFunction } from "express";
import {
  registerRoutes,
  scheduleReviewCheck,
  scheduleChangelogSend,
  scheduleChangelogSuggest,
} from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupLumiWebSocket } from "./lumi/websocket";
import cookie from "cookie";
import cookieSignature from "cookie-signature";
import session from "express-session";
import connectPg from "connect-pg-simple";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import { logger } from "./logger";
import { startProactiveTokenRefresh } from "./services/hospitable";
import { storage } from "./storage";

const app = express();
const httpServer = createServer(app);

// Session store for WebSocket authentication
const pgStore = connectPg(session);
const sessionStore = new pgStore({
  conString: config.database.url,
  createTableIfMissing: false,
  ttl: 7 * 24 * 60 * 60 * 1000,
  tableName: "sessions",
});

// Set up WebSocket server on /ws path (separate from Vite's HMR)
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

// Authenticate WebSocket connections using session cookie
wss.on("connection", async (ws: WebSocket, req) => {
  logger.info("WebSocket", "New connection attempt");
  try {
    const cookies = cookie.parse(req.headers.cookie || "");
    const sessionCookie = cookies["connect.sid"];

    logger.info("WebSocket", "Session cookie present:", !!sessionCookie);

    if (!sessionCookie) {
      logger.info("WebSocket", "No session cookie, closing connection");
      ws.close(4001, "Unauthorized: No session");
      return;
    }

    // Properly unsign the cookie using the session secret
    // Cookie format is "s:sessionId.signature" where the encoded part is URL-encoded
    let sessionId: string | false = false;
    const sessionSecret = config.session.secret;

    if (sessionCookie.startsWith("s:")) {
      // Decode URL-encoded parts
      const decodedCookie = decodeURIComponent(sessionCookie.slice(2));
      // Unsign using cookie-signature
      sessionId = cookieSignature.unsign(decodedCookie, sessionSecret);
    }

    if (!sessionId) {
      logger.info("WebSocket", "Failed to unsign session cookie");
      ws.close(4001, "Unauthorized: Invalid session signature");
      return;
    }

    logger.info(
      "WebSocket",
      "Session ID extracted:",
      sessionId.substring(0, 8) + "...",
    );

    // Get session from store
    sessionStore.get(sessionId, (err, sessionData) => {
      if (err) {
        logger.error("WebSocket", "Session lookup error:", err);
        ws.close(4001, "Unauthorized: Invalid session");
        return;
      }
      if (!sessionData) {
        logger.info("WebSocket", "No session data found");
        ws.close(4001, "Unauthorized: Invalid session");
        return;
      }

      const user = (sessionData as any).passport?.user;
      logger.info("WebSocket", "Session user found:", !!user);

      if (!user?.claims?.sub) {
        logger.info("WebSocket", "No user claims in session");
        ws.close(4001, "Unauthorized: No user in session");
        return;
      }

      logger.info("WebSocket", "Authenticated user:", user.claims.sub);
      // Pass authenticated user ID to WebSocket handler
      setupLumiWebSocket(ws, user.claims.sub);
    });
  } catch (error) {
    logger.error("WebSocket", "Auth error:", error);
    ws.close(4001, "Unauthorized");
  }
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// CORS: restrict origins in production
const allowedOrigins = config.isProduction
  ? [config.appUrl || "https://hostpulse.ai"]
  : undefined; // allow all in development
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

// Rate limiting: apply to auth and expensive endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});
app.use("/api/auth/magic-link", authLimiter);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});
app.use("/api/", apiLimiter);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  logger.info(source, message);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        // Redact sensitive fields before logging
        const SENSITIVE_KEYS = new Set([
          "accessToken",
          "refreshToken",
          "token",
          "password",
          "secret",
        ]);
        const redact = (obj: any): any => {
          if (Array.isArray(obj)) return obj.map(redact);
          if (obj && typeof obj === "object") {
            const out: Record<string, any> = {};
            for (const [k, v] of Object.entries(obj)) {
              out[k] = SENSITIVE_KEYS.has(k) ? "[REDACTED]" : redact(v);
            }
            return out;
          }
          return obj;
        };
        const safeBody = JSON.stringify(redact(capturedJsonResponse));
        logLine += ` :: ${safeBody.substring(0, 500)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    logger.error("Server", "Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: process.env.NODE_ENV === "production",
    },
    async () => {
      log(`serving on port ${port}`);

      try {
        await storage.seedDefaultPrompts();
        logger.info("Server", "Default AI prompts seeded/verified");
      } catch (err) {
        logger.error("Server", "Failed to seed default prompts:", err);
      }

      scheduleReviewCheck();
      scheduleChangelogSend();
      scheduleChangelogSuggest();
      startProactiveTokenRefresh();
    },
  );
})();
