import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, Building2, User, UserCog } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

export default function CleanerInvitePage() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  const { data: invite, isLoading, error } = useQuery<{
    cleanerName: string;
    workspaceName: string;
    type: string;
    alreadyLinked: boolean;
  }>({
    queryKey: ["/api/cleaner-invite", token],
    enabled: !!token,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/cleaner-invite/${token}/accept`);
      return res.json();
    },
    onSuccess: (data) => {
      setTimeout(() => {
        setLocation("/mobile");
      }, 2000);
    },
  });

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2" data-testid="text-invite-invalid">Invalid Invitation</h2>
            <p className="text-muted-foreground">
              This invitation link is invalid or has expired. Please contact your host for a new invitation.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invite.alreadyLinked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2" data-testid="text-invite-already-accepted">Already Accepted</h2>
            <p className="text-muted-foreground mb-6">
              This invitation has already been accepted.
            </p>
            <Button onClick={() => setLocation("/mobile")} data-testid="button-go-to-mobile">
              Go to Mobile App
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (acceptMutation.isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2" data-testid="text-invite-success">You're all set!</h2>
            <p className="text-muted-foreground mb-2">
              You've been added to <strong>{invite.workspaceName}</strong>.
            </p>
            <p className="text-sm text-muted-foreground">
              Redirecting to the mobile app...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const TypeIcon = invite.type === "company" ? Building2 : invite.type === "cleaning_manager" ? UserCog : User;
  const roleLabel = invite.type === "company" ? "Cleaning Company" : invite.type === "cleaning_manager" ? "Cleaning Manager" : "Cleaner";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6">
          <div className="text-center mb-6">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <TypeIcon className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2" data-testid="text-invite-title">
              Join {invite.workspaceName}
            </h2>
            <p className="text-muted-foreground" data-testid="text-invite-description">
              You've been invited as a <strong>{roleLabel}</strong> to manage cleaning tasks and procedures.
            </p>
          </div>

          {!user ? (
            <div className="space-y-4">
              <p className="text-sm text-center text-muted-foreground">
                Sign in to accept this invitation and access your cleaning tasks.
              </p>
              <Button
                className="w-full"
                onClick={() => {
                  window.location.href = `/api/login?returnTo=/cleaner-invite/${token}`;
                }}
                data-testid="button-sign-in"
              >
                Sign In to Accept
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-md p-4 text-sm">
                <p className="text-muted-foreground">
                  Signed in as <strong>{user.firstName} {user.lastName}</strong>
                </p>
              </div>
              <Button
                className="w-full"
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
                data-testid="button-accept-invite"
              >
                {acceptMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Accepting...
                  </>
                ) : (
                  "Accept Invitation"
                )}
              </Button>
              {acceptMutation.isError && (
                <p className="text-sm text-destructive text-center" data-testid="text-accept-error">
                  Failed to accept invitation. Please try again.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
