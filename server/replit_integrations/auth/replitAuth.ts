import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { ACCOUNT_TYPES } from "@shared/models/auth";

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

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  // Register Google OAuth strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        console.log("[Auth] Google OAuth verify callback triggered");
        try {
          const email =
            profile.emails?.[0]?.value ?? `${profile.id}@google.oauth`;
          const user = await authStorage.upsertUser(
            {
              id: profile.id,
              email,
              firstName: profile.name?.givenName,
              lastName: profile.name?.familyName,
              profileImageUrl: profile.photos?.[0]?.value,
            },
            ACCOUNT_TYPES.GOOGLE,
          );
          console.log(`[Auth] User upserted: ${user.id} (${user.email})`);
          done(null, { id: user.id, email: user.email });
        } catch (error) {
          console.error("[Auth] Error in Google verify callback:", error);
          done(error as Error, undefined);
        }
      },
    ),
  );

  // Register Local (email/password) strategy
  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          const user = await authStorage.findUserByEmail(email);
          if (!user) {
            return done(null, false, { message: "Invalid email or password" });
          }
          if (user.accountType === ACCOUNT_TYPES.GOOGLE) {
            return done(null, false, {
              message:
                "This email is registered via Google. Please sign in with Google.",
            });
          }
          if (!user.passwordHash) {
            return done(null, false, { message: "Invalid email or password" });
          }
          const isValid = await bcrypt.compare(password, user.passwordHash);
          if (!isValid) {
            return done(null, false, { message: "Invalid email or password" });
          }
          return done(null, { id: user.id, email: user.email });
        } catch (error) {
          return done(error);
        }
      },
    ),
  );

  // Redirect legacy /api/login links to the Google flow
  app.get("/api/login", (_req, res) => {
    res.redirect("/auth/google");
  });

  // Initiate Google OAuth flow
  app.get(
    "/auth/google",
    (req, res, next) => {
      // Persist a safe returnTo path across the OAuth redirect
      const returnTo = req.query.returnTo as string | undefined;
      if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
        (req.session as any).returnTo = returnTo;
      }
      next();
    },
    passport.authenticate("google", { scope: ["openid", "email", "profile"] }),
  );

  // Google OAuth callback
  app.get("/auth/google/callback", (req, res, next) => {
    console.log("[Auth] Google OAuth callback hit");
    const returnTo = (req.session as any)?.returnTo || "/";
    if (req.session) {
      delete (req.session as any).returnTo;
    }
    passport.authenticate("google", {
      successRedirect: returnTo,
      failureRedirect: "/auth/google",
    })(req, res, next);
  });

  // Logout
  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect("/");
    });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated() && req.user) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};
