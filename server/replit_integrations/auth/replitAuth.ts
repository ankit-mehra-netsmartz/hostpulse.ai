import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { authStorage, detectAccountType } from "./storage";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  const isProduction = process.env.NODE_ENV === "production";
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  const accountType = detectAccountType(claims);
  await authStorage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  }, accountType);
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // If REPL_ID is not set we're running locally – skip Replit OIDC setup.
  // Session + passport are already mounted above so local sessions still work.
  if (!process.env.REPL_ID) {
    console.log("[Auth] REPL_ID not set – skipping Replit OIDC setup (local dev mode)");

    passport.serializeUser((user: Express.User, cb) => cb(null, user));
    passport.deserializeUser((user: Express.User, cb) => cb(null, user));

    // Dev-only login: POST /api/dev/login with { userId, email, firstName? }
    // Creates a session for local development without Replit OIDC.
    // Never exposed in production (REPL_ID must be absent).
    app.post("/api/dev/login", async (req, res) => {
      const { userId, email, firstName } = req.body || {};
      if (!userId || !email) {
        return res.status(400).json({ message: "userId and email are required" });
      }
      // Ensure user exists in the database
      try {
        await authStorage.upsertUser({ id: userId, email, firstName: firstName || email.split("@")[0] }, "email");
      } catch (err) {
        console.error("[Auth] Dev login – failed to upsert user:", err);
        return res.status(500).json({ message: "Failed to create dev user" });
      }
      const devUser = {
        claims: { sub: userId, email, first_name: firstName || email.split("@")[0] },
      };
      req.login(devUser, (err) => {
        if (err) {
          console.error("[Auth] Dev login error:", err);
          return res.status(500).json({ message: "Login failed" });
        }
        res.json({ ok: true, user: devUser.claims });
      });
    });

    app.get("/api/login", (_req, res) => {
      res.status(501).json({ message: "Replit OIDC login not available in local dev mode. POST /api/dev/login instead." });
    });
    app.get("/api/callback", (_req, res) => {
      res.status(501).json({ message: "Replit OIDC callback not available in local dev mode." });
    });
    app.get("/api/logout", (req, res) => {
      req.logout(() => {
        res.redirect("/");
      });
    });
    return;
  }

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    console.log("[Auth] Verify callback triggered");
    try {
      const claims = tokens.claims();
      console.log(`[Auth] Claims received for user: ${claims.sub} (${claims.email})`);
      const user = {};
      updateUserSession(user, tokens);
      await upsertUser(claims);
      console.log("[Auth] User session created successfully");
      verified(null, user);
    } catch (error) {
      console.error("[Auth] Error in verify callback:", error);
      verified(error as Error, undefined);
    }
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    // Store returnTo URL in session for post-login redirect
    // Only allow relative paths to prevent open redirect vulnerability
    const returnTo = req.query.returnTo as string;
    if (returnTo && req.session && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
      (req.session as any).returnTo = returnTo;
    }
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    console.log("[Auth] Callback endpoint hit");
    ensureStrategy(req.hostname);
    
    // Get returnTo from session
    const returnTo = (req.session as any)?.returnTo || "/";
    // Clear it from session
    if (req.session) {
      delete (req.session as any).returnTo;
    }
    
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: returnTo,
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // In local dev mode (no REPL_ID) there are no OIDC tokens – just trust the session.
  if (!process.env.REPL_ID) {
    return next();
  }

  if (!user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
