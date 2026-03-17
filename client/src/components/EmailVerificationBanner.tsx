import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useResendVerification } from "@/hooks/use-auth";
import type { AuthUser } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Loader2, MailCheck, RefreshCw } from "lucide-react";

const DEFAULT_COOLDOWN = 120;

interface Props {
  user: AuthUser;
}

export function EmailVerificationBanner({ user }: Props) {
  const queryClient = useQueryClient();
  const resendMutation = useResendVerification();

  const [cooldown, setCooldown] = useState(0);
  const [justSent, setJustSent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [isRefetching, setIsRefetching] = useState(false);

  // Tick the countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleResend() {
    setResendError(null);
    setJustSent(false);
    try {
      await resendMutation.mutateAsync();
      setJustSent(true);
      setCooldown(DEFAULT_COOLDOWN);
    } catch (err: any) {
      if (err?.status === 429 && err?.retryAfterSeconds) {
        setCooldown(err.retryAfterSeconds);
        setResendError(
          err.message ?? "Please wait before requesting another email.",
        );
      } else {
        setResendError(err?.message ?? "Failed to resend. Please try again.");
      }
    }
  }

  async function handleCheckAgain() {
    setIsRefetching(true);
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    // Give the query a moment to settle before clearing the spinner
    setTimeout(() => setIsRefetching(false), 1200);
  }

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email ||
    "there";
  const firstName = displayName.split(" ")[0];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-8 text-center">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <MailCheck className="w-10 h-10 text-primary" />
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-3">
          <h1 className="text-2xl font-bold">Check your inbox, {firstName}!</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            We sent a verification link to
          </p>
          <p className="text-base font-semibold text-primary break-all">
            {user.email}
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Click the link in the email to verify your address before
            continuing. It may take a few minutes — check your spam folder if
            you don&apos;t see it.
          </p>
        </div>

        {/* Success feedback */}
        {justSent && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            Email sent! Check your inbox (and spam folder).
          </div>
        )}

        {/* Error feedback */}
        {resendError && !justSent && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {resendError}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <Button
            className="w-full"
            onClick={handleResend}
            disabled={resendMutation.isPending || cooldown > 0}
          >
            {resendMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : cooldown > 0 ? (
              `Resend in ${cooldown}s`
            ) : (
              "Resend verification email"
            )}
          </Button>

          <Button
            variant="outline"
            className="w-full"
            onClick={handleCheckAgain}
            disabled={isRefetching}
          >
            {isRefetching ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking…
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                I&apos;ve verified my email — check again
              </>
            )}
          </Button>

          <button
            type="button"
            onClick={() => {
              window.location.href = "/api/logout";
            }}
            className="block w-full pt-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
