import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import passport from "passport";
import bcrypt from "bcrypt";
import { z } from "zod";

const BCRYPT_SALT_ROUNDS = 12;

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

      // Auto-login after signup
      req.login({ id: newUser.id, email: newUser.email }, (err) => {
        if (err) {
          console.error("[Auth] Login after signup failed:", err);
          return res
            .status(500)
            .json({
              message:
                "Signup succeeded but auto-login failed. Please log in manually.",
            });
        }
        return res.status(201).json({ user: newUser, isNewUser: true });
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
}
