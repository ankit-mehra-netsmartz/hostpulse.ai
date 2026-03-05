import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Loader2, Users, Building2, CheckCircle, AlertCircle, UserPlus } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface InvitationDetails {
  invitedEmail: string;
  teamName: string;
  workspaceName: string;
  role: string;
  workspaceId: string;
  teamId: string;
}

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const { data: invitation, isLoading, error } = useQuery<InvitationDetails>({
    queryKey: ["/api/invitations", token],
    queryFn: async () => {
      const response = await fetch(`/api/invitations/${token}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to fetch invitation");
      }
      return response.json();
    },
    enabled: !!token,
    retry: false, // Don't retry - invitation not found is not a transient error
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/invitations/${token}/accept`);
      return response.json();
    },
    onSuccess: async (data) => {
      // Invalidate workspaces query so the new workspace shows up
      await queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      
      toast({
        title: "Welcome to the team!",
        description: `You've successfully joined ${invitation?.teamName}.`,
      });
      navigate("/teams/" + data.teamId);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to accept invitation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLogin = () => {
    const returnUrl = encodeURIComponent(`/invite/${token}`);
    window.location.href = `/api/login?returnTo=${returnUrl}`;
  };

  const handleAccept = () => {
    acceptMutation.mutate();
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading invitation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 h-16">
            <div className="flex items-center gap-2">
              <a href="/" className="flex items-center gap-2">
                <img 
                  src="/logo-light.png" 
                  alt="HostPulse" 
                  className="h-7 dark:hidden" 
                />
                <img 
                  src="/favicon.png" 
                  alt="HostPulse" 
                  className="h-7 hidden dark:block" 
                />
                <span className="text-xl font-semibold dark:block hidden">HostPulse</span>
              </a>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <main className="pt-24 pb-12 px-4">
        <div className="max-w-md mx-auto">
          {error ? (
            <Card>
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                  <AlertCircle className="w-6 h-6 text-destructive" />
                </div>
                <CardTitle>Invitation Not Found</CardTitle>
                <CardDescription>
                  {(error as Error).message || "This invitation link is invalid or has expired."}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <Button variant="outline" asChild data-testid="button-go-home">
                  <a href="/">Go to Homepage</a>
                </Button>
              </CardContent>
            </Card>
          ) : invitation ? (
            <Card>
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <UserPlus className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>You're Invited!</CardTitle>
                <CardDescription>
                  You've been invited to join a team on HostPulse
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium" data-testid="text-team-name">{invitation.teamName}</p>
                      <p className="text-sm text-muted-foreground">Team</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium" data-testid="text-workspace-name">{invitation.workspaceName}</p>
                      <p className="text-sm text-muted-foreground">Workspace</p>
                    </div>
                  </div>

                  <div className="text-center py-2">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                      {invitation.role === "manager" ? "Team Manager" : "Team Member"}
                    </span>
                  </div>
                </div>

                {user ? (
                  <div className="space-y-4">
                    {user.email?.toLowerCase() === invitation.invitedEmail?.toLowerCase() ? (
                      <Button
                        className="w-full"
                        size="lg"
                        onClick={handleAccept}
                        disabled={acceptMutation.isPending}
                        data-testid="button-accept-invitation"
                      >
                        {acceptMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Joining...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Accept Invitation
                          </>
                        )}
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm text-center">
                          This invitation was sent to <strong>{invitation.invitedEmail}</strong>, but you're logged in as <strong>{user.email}</strong>.
                        </div>
                        <p className="text-sm text-muted-foreground text-center">
                          Please log out and sign in with the correct account to accept this invitation.
                        </p>
                        <Button
                          variant="outline"
                          className="w-full"
                          asChild
                          data-testid="button-logout"
                        >
                          <a href="/api/logout">Log Out</a>
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground text-center">
                      Sign in or create an account to accept this invitation.
                    </p>
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handleLogin}
                      data-testid="button-login-to-accept"
                    >
                      Sign In to Accept
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Don't have an account? You'll be able to create one after clicking the button above.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </main>
    </div>
  );
}
