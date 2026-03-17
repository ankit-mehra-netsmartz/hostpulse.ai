import { useEffect, useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import { Loader2, Mail } from "lucide-react";
import { useRequestMagicLink } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type FormState = "idle" | "sent" | "google_account" | "rate_limited";

const emailSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

interface MagicLinkFormProps {
  onGoogleLogin: () => void;
}

export function MagicLinkForm({ onGoogleLogin }: MagicLinkFormProps) {
  const requestMagicLink = useRequestMagicLink();
  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const isLoading = requestMagicLink.isPending;

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const emailError = useMemo(() => {
    const result = emailSchema.safeParse({ email });
    if (!email) return null;
    return result.success ? null : result.error.errors[0].message;
  }, [email]);

  async function submitMagicLink(targetEmail: string) {
    setErrorMessage(null);
    try {
      const normalized = targetEmail.trim().toLowerCase();
      const result = await requestMagicLink.mutateAsync(normalized);

      if (result?.sent === false && result?.reason === "google_account") {
        setSubmittedEmail(normalized);
        setState("google_account");
        return;
      }

      setSubmittedEmail(normalized);
      setState("sent");
      setCooldown(60);
    } catch (err: any) {
      if (err?.status === 429 && err?.retryAfterSeconds) {
        setSubmittedEmail(targetEmail.trim().toLowerCase());
        setErrorMessage(
          err.message ?? "Please wait before requesting another link",
        );
        setCooldown(err.retryAfterSeconds);
        setState("rate_limited");
        return;
      }

      setErrorMessage(
        err?.message ?? "Something went wrong. Please try again.",
      );
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse({ email: email.trim().toLowerCase() });
    if (!parsed.success) {
      setErrorMessage(parsed.error.errors[0].message);
      return;
    }

    submitMagicLink(parsed.data.email);
  }

  async function handleResend() {
    if (cooldown > 0 || !submittedEmail) return;
    await submitMagicLink(submittedEmail);
  }

  function resetToIdle() {
    setState("idle");
    setErrorMessage(null);
    setCooldown(0);
    setSubmittedEmail("");
    setEmail("");
  }

  if (state === "sent") {
    return (
      <div className="space-y-5 text-center py-2">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="w-8 h-8 text-primary" />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Check your inbox</h3>
          <p className="text-sm text-muted-foreground">
            We sent a sign-in link to{" "}
            <span className="font-semibold text-foreground">
              {submittedEmail}
            </span>
            . It expires in 15 minutes.
          </p>
          <p className="text-xs text-muted-foreground">
            Check your spam folder if you do not see it.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleResend}
          disabled={isLoading || cooldown > 0}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : cooldown > 0 ? (
            `Resend in ${cooldown}s`
          ) : (
            "Resend link"
          )}
        </Button>

        <button
          type="button"
          className="text-sm text-primary hover:underline"
          onClick={resetToIdle}
        >
          Use a different email
        </button>
      </div>
    );
  }

  if (state === "google_account") {
    return (
      <div className="space-y-4 py-2 text-center">
        <p className="text-sm rounded-md border border-blue-200 bg-blue-50 text-blue-700 px-3 py-2">
          This email is linked to a Google account.
        </p>
        <Button type="button" className="w-full" onClick={onGoogleLogin}>
          Sign in with Google
        </Button>
        <button
          type="button"
          className="text-sm text-primary hover:underline"
          onClick={resetToIdle}
        >
          Use a different email
        </button>
      </div>
    );
  }

  if (state === "rate_limited") {
    return (
      <div className="space-y-4 py-2 text-center">
        <p className="text-sm rounded-md border border-amber-300 bg-amber-50 text-amber-800 px-3 py-2">
          {errorMessage ?? "Please wait before requesting another link"}
        </p>
        <p className="text-sm text-muted-foreground">
          Try again in {cooldown}s.
        </p>
        <button
          type="button"
          className="text-sm text-primary hover:underline"
          onClick={resetToIdle}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Sign in or create an account</h3>
        <p className="text-sm text-muted-foreground">
          Enter your email and we will send you a sign-in link. No password
          needed.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="magic-email">Email</Label>
          <Input
            id="magic-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
          />
          {emailError && (
            <p className="text-sm text-destructive">{emailError}</p>
          )}
        </div>

        {errorMessage && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
            {errorMessage}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            "Send me a link"
          )}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Separator className="flex-1" />
        OR
        <Separator className="flex-1" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onGoogleLogin}
      >
        <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Continue with Google
      </Button>
    </div>
  );
}
