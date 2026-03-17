import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { sendVerificationEmail } from "./emailService";
import passport from "passport";
import bcrypt from "bcrypt";
import { z } from "zod";

const BCRYPT_SALT_ROUNDS = 12;
const RESEND_COOLDOWN_MS = 120 * 1000; // 2 minutes

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required").max(100),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({
        ...user,
        // Impersonation state lives in session, not the database user record.
        isImpersonating: Boolean(req.user?.isImpersonating),
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Email/password signup
  app.post("/api/auth/signup", async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.errors[0].message,
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { email, password, name } = parsed.data;
    const [firstName, ...rest] = name.trim().split(" ");
    const lastName = rest.join(" ") || undefined;

    try {
      const existing = await authStorage.findUserByEmail(email);
      if (existing) {
        return res
          .status(409)
          .json({ message: "An account with this email already exists." });
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
      const newUser = await authStorage.createEmailUser(
        email,
        passwordHash,
        firstName,
        lastName,
      );

      // Issue verification token and send email (non-fatal if email fails)
      const verifyToken = await authStorage.createEmailVerificationToken(
        newUser.id,
      );
      await sendVerificationEmail(email, name, verifyToken);

      // Auto-login after signup (user is logged in but unverified)
      req.login({ id: newUser.id, email: newUser.email }, (err) => {
        if (err) {
          console.error("[Auth] Login after signup failed:", err);
          return res.status(500).json({
            message:
              "Signup succeeded but auto-login failed. Please log in manually.",
          });
        }
        return res
          .status(201)
          .json({
            user: newUser,
            isNewUser: true,
            emailVerificationSent: true,
          });
      });
    } catch (error) {
      console.error("[Auth] Signup error:", error);
      res.status(500).json({ message: "Signup failed. Please try again." });
    }
  });

  // Email/password login
  app.post("/api/auth/login", (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.errors[0].message,
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    passport.authenticate(
      "local",
      (
        err: Error | null,
        user: Express.User | false,
        info: { message: string } | undefined,
      ) => {
        if (err) {
          console.error("[Auth] Login error:", err);
          return res
            .status(500)
            .json({ message: "Login failed. Please try again." });
        }
        if (!user) {
          return res
            .status(401)
            .json({ message: info?.message ?? "Invalid email or password" });
        }
        req.login(user, async (loginErr) => {
          if (loginErr) {
            return res
              .status(500)
              .json({ message: "Login failed. Please try again." });
          }
          try {
            const dbUser = await authStorage.getUser((user as any).id);
            return res.json({ user: dbUser });
          } catch {
            return res.json({ user });
          }
        });
      },
    )(req, res, next);
  });

  // Verify email via token link — no auth required
  app.get("/api/auth/verify-email", async (req, res) => {
    const token = req.query.token as string | undefined;
    if (!token) return res.redirect("/?verified=invalid");

    try {
      const result = await authStorage.verifyEmailToken(token);

      if (!result.success) {
        return res.redirect(`/?verified=${result.reason}`);
      }

      // If the user has an active session for this user, refresh emailVerified in session
      if (req.isAuthenticated() && (req.user as any)?.id === result.userId) {
        (req.user as any).emailVerified = true;
        await new Promise<void>((resolve) => req.session.save(() => resolve()));
      }

      return res.redirect("/?verified=success");
    } catch (error) {
      console.error("[Auth] verify-email error:", error);
      return res.redirect("/?verified=invalid");
    }
  });

  // Resend verification email — requires login
  app.post(
    "/api/auth/resend-verification",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.id;
        const user = await authStorage.getUser(userId);

        if (!user) return res.status(404).json({ message: "User not found" });
        if (user.emailVerified) {
          return res.status(400).json({ message: "Email already verified" });
        }

        // Rate-limit: 120s between resend requests
        const lastCreatedAt = await authStorage.getTokenCreatedAt(userId);
        if (lastCreatedAt) {
          const elapsed = Date.now() - lastCreatedAt.getTime();
          if (elapsed < RESEND_COOLDOWN_MS) {
            const retryAfterSeconds = Math.ceil(
              (RESEND_COOLDOWN_MS - elapsed) / 1000,
            );
            return res.status(429).json({
              message: `Please wait before requesting another email`,
              retryAfterSeconds,
            });
          }
        }

        const token = await authStorage.createEmailVerificationToken(userId);
        const displayName =
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          user.email ||
          "there";
        await sendVerificationEmail(user.email!, displayName, token);

        return res.json({ sent: true });
      } catch (error) {
        console.error("[Auth] resend-verification error:", error);
        return res
          .status(500)
          .json({ message: "Failed to resend verification email." });
      }
    },
  );
}
