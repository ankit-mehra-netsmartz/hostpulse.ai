import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { sendMagicLinkEmail } from "./emailService";
import { z } from "zod";

const MAGIC_LINK_COOLDOWN_MS = 60 * 1000;

const requestMagicLinkSchema = z.object({
  email: z.string().email("Invalid email address"),
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

  // Request magic link for sign-in or sign-up
  app.post("/api/auth/magic-link", async (req, res) => {
    const parsed = requestMagicLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.errors[0].message,
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const normalizedEmail = parsed.data.email.trim().toLowerCase();

    try {
      const result = await authStorage.upsertMagicUser(normalizedEmail);

      if (result.isGoogleAccount) {
        return res.status(200).json({
          sent: false,
          reason: "google_account",
          message:
            "This email is registered with Google. Please sign in with Google.",
        });
      }

      const user = result.user;
      const lastCreatedAt = await authStorage.getMagicLinkTokenCreatedAt(
        user.id,
      );
      if (lastCreatedAt) {
        const elapsed = Date.now() - lastCreatedAt.getTime();
        if (elapsed < MAGIC_LINK_COOLDOWN_MS) {
          const retryAfterSeconds = Math.ceil(
            (MAGIC_LINK_COOLDOWN_MS - elapsed) / 1000,
          );
          return res.status(429).json({
            message: "Please wait before requesting another link",
            retryAfterSeconds,
          });
        }
      }

      const token = await authStorage.createMagicLinkToken(user.id);
      await sendMagicLinkEmail(
        normalizedEmail,
        user.firstName || "there",
        token,
        Boolean(result.isNewUser),
      );

      return res.status(200).json({ sent: true });
    } catch (error) {
      console.error("[Auth] magic-link request error:", error);
      return res.status(500).json({ message: "Failed to send sign-in link." });
    }
  });

  // Magic link click handler
  app.get("/api/auth/magic", async (req, res) => {
    const token = req.query.token as string | undefined;
    if (!token) return res.redirect("/?magic=invalid");

    try {
      const result = await authStorage.verifyMagicLinkToken(token);

      if (!result.success) {
        return res.redirect(`/?magic=${result.reason}`);
      }

      const user = await authStorage.findUserById(result.userId);
      if (!user) {
        return res.redirect("/?magic=invalid");
      }

      req.login(user as any, (loginErr) => {
        if (loginErr) {
          console.error("[Auth] magic-link login error:", loginErr);
          return res.redirect("/?magic=error");
        }

        req.session.save((sessionErr) => {
          if (sessionErr) {
            console.error("[Auth] magic-link session save error:", sessionErr);
            return res.redirect("/?magic=error");
          }
          return res.redirect("/");
        });
      });
    } catch (error) {
      console.error("[Auth] magic-link verify error:", error);
      return res.redirect("/?magic=error");
    }
  });
}
