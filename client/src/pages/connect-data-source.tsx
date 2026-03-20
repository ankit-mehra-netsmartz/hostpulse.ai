import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Building2,
  ArrowRight,
  CheckCircle2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Unplug,
  Database,
  Settings,
  Calendar,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Filter,
  Lightbulb,
  Send,
  Tag,
  MessageSquare,
  Save,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { SiNotion } from "react-icons/si";
import { SiAirbnb } from "react-icons/si";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { connectHospitableService } from "@/lib/connect-hospitable-service";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/contexts/workspace-context";
import { NotionDatabaseSelector } from "@/components/notion-database-selector";
import type { DataSource } from "@shared/schema";

interface NotionConnectionStatus {
  connected: boolean;
  id?: string;
  notionWorkspaceName?: string;
  notionWorkspaceIcon?: string;
  selectedDatabaseId?: string;
  selectedDatabaseName?: string;
  autoSyncEnabled?: boolean;
  lastSyncAt?: string;
  createdAt?: string;
  // Enhanced sync settings
  syncReservations?: boolean;
  syncConfirmedTasks?: boolean;
  syncTags?: boolean;
  reservationsDatabaseId?: string;
  reservationsDatabaseName?: string;
  tasksDatabaseId?: string;
  tasksDatabaseName?: string;
  tagsDatabaseId?: string;
  tagsDatabaseName?: string;
  propertyFilter?: string[];
}

export default function ConnectDataSource() {
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const oauthError = searchParams.get("error");
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnectingAirbnb, setIsConnectingAirbnb] = useState(false);
  const [isConnectingNotion, setIsConnectingNotion] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);
  const [localPropertyFilter, setLocalPropertyFilter] = useState<string[]>([]);
  const propertyFilterTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [integrationName, setIntegrationName] = useState("");
  const [integrationDescription, setIntegrationDescription] = useState("");
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const { user } = useAuth();
  const { activeWorkspace, isLoading: isWorkspaceLoading } = useWorkspace();
  const [, setLocation] = useLocation();

  const {
    data: dataSources,
    isLoading,
    error,
    refetch,
  } = useQuery<DataSource[]>({
    queryKey: ["/api/data-sources"],
  });

  const {
    data: notionConnection,
    isLoading: isLoadingNotion,
    refetch: refetchNotion,
  } = useQuery<NotionConnectionStatus>({
    queryKey: ["/api/notion/connection", activeWorkspace?.id],
    enabled: !!activeWorkspace,
  });

  // After the user returns from the Airbnb OAuth redirect, notify the backend
  // and then POLL /api/data-sources until isConnected becomes true.
  // isConnected is set exclusively by the "channel.activated" webhook from
  // Hospitable — not by this client call.
  useEffect(() => {
    const pendingUserId = localStorage.getItem("airbnb_oauth_pending_user");
    if (!pendingUserId) return;
    localStorage.removeItem("airbnb_oauth_pending_user");

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let pollCount = 0;
    const MAX_POLLS = 60; // 60 × 3 s = 3 minutes max

    const startPolling = (dataSourceId: string) => {
      toast({
        title: "Waiting for Airbnb confirmation…",
        description:
          "Hospitable is verifying your connection. This may take a few seconds.",
      });

      pollInterval = setInterval(async () => {
        pollCount += 1;
        try {
          const res = await fetch("/api/data-sources", { credentials: "include" });
          if (!res.ok) return;
          const sources: any[] = await res.json();
          const source = sources.find(
            (ds: any) => ds.id === dataSourceId,
          );
          if (source?.isConnected) {
            clearInterval(pollInterval!);
            await Promise.all([
              refetch(),
              queryClient.invalidateQueries({ queryKey: ["/api/data-sources"] }),
              queryClient.invalidateQueries({ queryKey: ["/api/properties/all"] }),
              queryClient.invalidateQueries({ queryKey: ["/api/listings"] }),
            ]);
            toast({
              title: "Airbnb Connected!",
              description:
                "Your Airbnb account is now connected. Navigating to properties…",
            });
            setTimeout(() => setLocation("/properties"), 1500);
          } else if (pollCount >= MAX_POLLS) {
            clearInterval(pollInterval!);
            toast({
              title: "Connection Pending",
              description:
                "We haven't received confirmation from Airbnb yet. Please check back in a moment.",
              variant: "destructive",
            });
          }
        } catch {
          // network error — keep polling
        }
      }, 3000);
    };

    connectHospitableService
      .activate(pendingUserId)
      .then(async (res) => {
        if (!res.ok) return;
        const body = await res.json();
        if (body.isConnected) {
          // Webhook already fired before we returned — proceed immediately.
          await Promise.all([
            refetch(),
            queryClient.invalidateQueries({ queryKey: ["/api/data-sources"] }),
            queryClient.invalidateQueries({ queryKey: ["/api/properties/all"] }),
            queryClient.invalidateQueries({ queryKey: ["/api/listings"] }),
          ]);
          toast({
            title: "Airbnb Connected!",
            description:
              "Your Airbnb account is now connected. Navigating to properties…",
          });
          setTimeout(() => setLocation("/properties"), 1500);
        } else {
          // Webhook hasn't fired yet — start polling.
          startPolling(body.dataSourceId);
        }
      })
      .catch(() => {
        // Non-fatal — ignore
      });

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for OAuth success/error messages from popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "oauth_success") {
        if (event.data.provider === "notion") {
          setIsConnectingNotion(false);
          refetchNotion();
          toast({
            title: "Connected!",
            description:
              "Successfully connected to Notion. You can now select a database for tag sync.",
          });
        } else {
          setIsConnecting(false);
          refetch();
          queryClient.invalidateQueries({ queryKey: ["/api/data-sources"] });
          toast({
            title: "Connected!",
            description:
              "Successfully connected to Hospitable. You can now import your properties.",
          });
          setLocation("/properties");
        }
      } else if (event.data?.type === "oauth_error") {
        if (event.data.provider === "notion") {
          setIsConnectingNotion(false);
          toast({
            title: "Connection Failed",
            description: "Failed to connect to Notion. Please try again.",
            variant: "destructive",
          });
        } else {
          setIsConnecting(false);
          toast({
            title: "Connection Failed",
            description: "Failed to connect to Hospitable. Please try again.",
            variant: "destructive",
          });
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [refetch, refetchNotion, toast, setLocation]);

  const hasConnectedHospitableSource =
    dataSources &&
    dataSources.length > 0 &&
    dataSources.some((ds) => ds.provider === "hospitable" && ds.isConnected);
  const connectedHospitableSource = dataSources?.find(
    (ds) => ds.provider === "hospitable" && ds.isConnected,
  );

  const hasConnectedAirbnbSource =
    dataSources &&
    dataSources.length > 0 &&
    dataSources.some((ds) => ds.provider === "airbnb" && ds.isConnected);
  const connectedAirbnbSource = dataSources?.find(
    (ds) => ds.provider === "airbnb" && ds.isConnected,
  );

  const disconnectHospitableMutation = useMutation({
    mutationFn: async (dataSourceId: string) => {
      await apiRequest("DELETE", `/api/data-sources/${dataSourceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/listings/stats"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/listings/suggestions"],
      });
      toast({
        title: "Disconnected",
        description: "Successfully disconnected from Hospitable.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to disconnect. Please try again.",
        variant: "destructive",
      });
    },
  });

  const disconnectAirbnbMutation = useMutation({
    mutationFn: async (dataSourceId: string) => {
      await apiRequest("DELETE", `/api/data-sources/${dataSourceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/listings/stats"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/listings/suggestions"],
      });
      toast({
        title: "Disconnected",
        description: "Successfully disconnected from Airbnb.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to disconnect. Please try again.",
        variant: "destructive",
      });
    },
  });

  const disconnectNotionMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/notion/connection");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notion/connection"] });
      toast({
        title: "Disconnected",
        description: "Successfully disconnected from Notion.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to disconnect from Notion. Please try again.",
        variant: "destructive",
      });
    },
  });

  const toggleAutoSyncMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await apiRequest("PATCH", "/api/notion/settings", {
        autoSyncEnabled: enabled,
      });
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notion/connection"] });
      toast({
        title: enabled ? "Auto-sync Enabled" : "Auto-sync Disabled",
        description: enabled
          ? "New tags will be automatically synced to Notion."
          : "Tags will only sync when you click the sync button.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update auto-sync setting.",
        variant: "destructive",
      });
    },
  });

  // Fetch listings for property filter
  const { data: listings } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/listings", activeWorkspace?.id],
    enabled: !!activeWorkspace && !!notionConnection?.connected,
  });

  // Update Notion sync settings
  const updateSyncSettingsMutation = useMutation({
    mutationFn: async (
      settings: Partial<{
        syncReservations: boolean;
        syncConfirmedTasks: boolean;
        syncTags: boolean;
        reservationsDatabaseId: string;
        reservationsDatabaseName: string;
        tasksDatabaseId: string;
        tasksDatabaseName: string;
        tagsDatabaseId: string;
        tagsDatabaseName: string;
        propertyFilter: string[];
      }>,
    ) => {
      await apiRequest("PATCH", "/api/notion/settings", settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notion/connection"] });
      toast({
        title: "Settings Updated",
        description: "Your Notion sync settings have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update sync settings.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (activeWorkspace) {
      setSlackWebhookUrl((activeWorkspace as any).slackWebhookUrl || "");
    }
  }, [activeWorkspace]);

  const saveSlackWebhookMutation = useMutation({
    mutationFn: async (webhookUrl: string) => {
      if (!activeWorkspace) return;
      await apiRequest("PATCH", `/api/workspaces/${activeWorkspace.id}`, {
        slackWebhookUrl: webhookUrl || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      toast({
        title: "Saved",
        description: "Slack webhook URL has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save Slack webhook URL.",
        variant: "destructive",
      });
    },
  });

  // Sync localPropertyFilter with notionConnection
  useEffect(() => {
    if (notionConnection?.propertyFilter) {
      setLocalPropertyFilter(notionConnection.propertyFilter);
    } else {
      setLocalPropertyFilter([]);
    }
  }, [notionConnection?.propertyFilter]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (propertyFilterTimeoutRef.current) {
        clearTimeout(propertyFilterTimeoutRef.current);
      }
    };
  }, []);

  // Debounced property filter update
  const debouncedUpdatePropertyFilter = useCallback(
    (newFilter: string[]) => {
      if (propertyFilterTimeoutRef.current) {
        clearTimeout(propertyFilterTimeoutRef.current);
      }
      propertyFilterTimeoutRef.current = setTimeout(() => {
        updateSyncSettingsMutation.mutate({ propertyFilter: newFilter });
      }, 500);
    },
    [updateSyncSettingsMutation],
  );

  // Handle property filter checkbox change
  const handlePropertyFilterChange = useCallback(
    (listingId: string, checked: boolean) => {
      const newFilter = checked
        ? [...localPropertyFilter, listingId]
        : localPropertyFilter.filter((id) => id !== listingId);
      setLocalPropertyFilter(newFilter);
      debouncedUpdatePropertyFilter(newFilter);
    },
    [localPropertyFilter, debouncedUpdatePropertyFilter],
  );

  // Integration suggestion mutation
  const submitIntegrationSuggestion = useMutation({
    mutationFn: async (data: {
      integrationName: string;
      integrationDescription: string;
    }) => {
      await apiRequest("POST", "/api/integration-suggestion", {
        ...data,
        workspaceId: activeWorkspace?.id,
      });
    },
    onSuccess: () => {
      toast({
        title: "Suggestion Submitted",
        description: "Thank you! We'll review your integration request.",
      });
      setIntegrationName("");
      setIntegrationDescription("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit suggestion. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmitSuggestion = () => {
    if (!integrationName.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter the integration name.",
        variant: "destructive",
      });
      return;
    }
    if (
      !integrationDescription.trim() ||
      integrationDescription.trim().length < 10
    ) {
      toast({
        title: "Missing Information",
        description: "Please describe what you want the integration to do.",
        variant: "destructive",
      });
      return;
    }
    submitIntegrationSuggestion.mutate({
      integrationName: integrationName.trim(),
      integrationDescription: integrationDescription.trim(),
    });
  };

  const handleConnectHospitable = () => {
    // Pass workspaceId as query param since headers don't work with direct browser navigation
    const oauthUrl = activeWorkspace
      ? `/api/oauth/hospitable/authorize?workspaceId=${activeWorkspace.id}`
      : "/api/oauth/hospitable/authorize";

    setIsConnecting(true);

    // Open OAuth in a popup window so it feels like it's happening within the app
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      oauthUrl,
      "hospitable-oauth",
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`,
    );

    // Poll for popup closure and check for success
    const checkPopup = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkPopup);
        setIsConnecting(false);
        // Refetch data sources to see if connection was successful
        refetch();
        queryClient.invalidateQueries({ queryKey: ["/api/data-sources"] });
      }
    }, 500);
  };

  const handleConnectAirbnb = async () => {
    if (!user) {
      toast({
        title: "Missing User",
        description:
          "User information is missing. Please try logging in again.",
        variant: "destructive",
      });
      return;
    }

    setIsConnectingAirbnb(true);
    try {
      if (!user.email) {
        toast({
          title: "Missing Email",
          description:
            "We could not find your account email. Please re-login and try again.",
          variant: "destructive",
        });
        setIsConnectingAirbnb(false);
        return;
      }

      // Step 1: Create customer
      const customerRes = await connectHospitableService.createCustomer({
        id: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`.trim() || user.email,
      });
      if (!customerRes.ok) {
        throw new Error("Failed to create customer");
      }

      // Step 2: Generate auth code with return URL
      const authCodeRes = await connectHospitableService.generateAuthCode(
        {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`.trim() || user.email,
        },
        `${window.location.origin}/data-sources`,
      );
      if (!authCodeRes.ok) {
        throw new Error("Failed to get auth code");
      }

      // Step 3: Redirect to Hospitable Connect authorization.
      // Set a flag so the page can auto-activate when the user returns.
      const authCodeData = await authCodeRes.json();
      const returnUrl = authCodeData?.data?.return_url;

      if (returnUrl) {
        localStorage.setItem("airbnb_oauth_pending_user", user.id);
        window.location.href = returnUrl;
      } else {
        throw new Error("No return_url received from server");
      }
    } catch (error) {
      setIsConnectingAirbnb(false);
      toast({
        title: "Connection Failed",
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsConnectingAirbnb(false);
    }
  };

  const handleDisconnectHospitable = () => {
    if (connectedHospitableSource) {
      disconnectHospitableMutation.mutate(connectedHospitableSource.id);
    }
  };

  const handleDisconnectAirbnb = () => {
    if (connectedAirbnbSource) {
      disconnectAirbnbMutation.mutate(connectedAirbnbSource.id);
    }
  };

  const handleConnectNotion = () => {
    if (!activeWorkspace) {
      toast({
        title: "No Workspace",
        description: "Please select a workspace first.",
        variant: "destructive",
      });
      return;
    }

    const oauthUrl = `/api/oauth/notion/authorize?workspaceId=${activeWorkspace.id}`;
    setIsConnectingNotion(true);

    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      oauthUrl,
      "notion-oauth",
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`,
    );

    const checkPopup = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkPopup);
        setIsConnectingNotion(false);
        refetchNotion();
      }
    }, 500);
  };

  const handleDisconnectNotion = () => {
    disconnectNotionMutation.mutate();
  };

  const getErrorMessage = (errorCode: string | null) => {
    switch (errorCode) {
      case "oauth_not_configured":
        return "Hospitable integration is not configured yet. Please contact support.";
      case "oauth_denied":
        return "You denied access to your Hospitable account. Please try again.";
      case "token_exchange_failed":
        return "Failed to complete authorization. Please try again.";
      case "oauth_failed":
        return "Something went wrong during authorization. Please try again.";
      default:
        return null;
    }
  };

  const errorMessage = getErrorMessage(oauthError);

  // Avoid rendering workspace-dependent UI until workspace is ready (prevents first-load error boundary)
  if (isWorkspaceLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Data Sources</h1>
          <p className="text-muted-foreground">
            Connect your property management platforms to sync listings and
            enable AI-powered analysis.
          </p>
        </div>

        {errorMessage && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Connection Error</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle>Hospitable</CardTitle>
                      {hasConnectedHospitableSource && (
                        <Badge
                          variant="default"
                          className="bg-emerald-500 hover:bg-emerald-600"
                        >
                          Connected
                        </Badge>
                      )}
                    </div>
                    <CardDescription>
                      Sync your Hospitable listings, reviews, and guest
                      conversations
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading connection status...</span>
                </div>
              ) : error ? (
                <div className="space-y-3">
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                      Failed to load data sources. Please try again.
                    </AlertDescription>
                  </Alert>
                  <Button
                    onClick={() => refetch()}
                    variant="outline"
                    data-testid="button-retry"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry
                  </Button>
                </div>
              ) : hasConnectedHospitableSource ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <div className="flex-1">
                      <p className="font-medium text-emerald-600 dark:text-emerald-400">
                        Connected to Hospitable
                      </p>
                      {connectedHospitableSource?.lastSyncAt && (
                        <p className="text-sm text-muted-foreground">
                          Last synced:{" "}
                          {new Date(
                            connectedHospitableSource.lastSyncAt,
                          ).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        queryClient.invalidateQueries({
                          queryKey: ["/api/listings"],
                        });
                        setLocation("/properties");
                      }}
                      data-testid="button-go-to-properties"
                    >
                      Manage Properties
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={handleDisconnectHospitable}
                      disabled={disconnectHospitableMutation.isPending}
                      data-testid="button-disconnect"
                    >
                      {disconnectHospitableMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Unplug className="w-4 h-4 mr-2" />
                      )}
                      Disconnect
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Connect your Hospitable account to automatically sync your
                    property listings, guest reviews, and conversation history
                    for AI-powered analysis.
                  </p>
                  <Button
                    onClick={handleConnectHospitable}
                    data-testid="button-connect-hospitable"
                  >
                    Connect Hospitable
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 to-rose-700 flex items-center justify-center flex-shrink-0">
                    <SiAirbnb className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle>Airbnb</CardTitle>
                      {hasConnectedAirbnbSource && (
                        <Badge
                          variant="default"
                          className="bg-emerald-500 hover:bg-emerald-600"
                        >
                          Connected
                        </Badge>
                      )}
                    </div>
                    <CardDescription>
                      Connect Airbnb through Hospitable Connect to authorize
                      your account
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading connection status...</span>
                </div>
              ) : error ? (
                <div className="space-y-3">
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                      Failed to load data sources. Please try again.
                    </AlertDescription>
                  </Alert>
                  <Button
                    onClick={() => refetch()}
                    variant="outline"
                    data-testid="button-retry-airbnb"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry
                  </Button>
                </div>
              ) : hasConnectedAirbnbSource ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <div className="flex-1">
                      <p className="font-medium text-emerald-600 dark:text-emerald-400">
                        Connected to Airbnb
                      </p>
                      {connectedAirbnbSource?.lastSyncAt && (
                        <p className="text-sm text-muted-foreground">
                          Last synced:{" "}
                          {new Date(
                            connectedAirbnbSource.lastSyncAt,
                          ).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        queryClient.invalidateQueries({
                          queryKey: ["/api/listings"],
                        });
                        setLocation("/properties");
                      }}
                      data-testid="button-go-to-properties-airbnb"
                    >
                      Manage Properties
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={handleDisconnectAirbnb}
                      disabled={disconnectAirbnbMutation.isPending}
                      data-testid="button-disconnect-airbnb"
                    >
                      {disconnectAirbnbMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Unplug className="w-4 h-4 mr-2" />
                      )}
                      Disconnect
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Start Airbnb authorization to link your account and continue
                    setup in Hospitable Connect.
                  </p>
                  <Button
                    onClick={handleConnectAirbnb}
                    disabled={isConnectingAirbnb}
                    data-testid="button-connect-airbnb"
                  >
                    {isConnectingAirbnb ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <SiAirbnb className="w-4 h-4 mr-2" />
                        Connect Airbnb
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-950 flex items-center justify-center flex-shrink-0">
                    <SiNotion className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle>Notion</CardTitle>
                      {notionConnection?.connected && (
                        <Badge
                          variant="default"
                          className="bg-emerald-500 hover:bg-emerald-600"
                        >
                          Connected
                        </Badge>
                      )}
                    </div>
                    <CardDescription>
                      Sync reservations, tasks, and guest feedback to Notion
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingNotion ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading connection status...</span>
                </div>
              ) : notionConnection?.connected ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-emerald-600 dark:text-emerald-400">
                        Connected to{" "}
                        {notionConnection.notionWorkspaceName || "Notion"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Connected on{" "}
                        {notionConnection.createdAt
                          ? new Date(
                              notionConnection.createdAt,
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "Unknown date"}
                      </p>
                      {notionConnection.selectedDatabaseName ? (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <Database className="w-3 h-3" />
                          Syncing to: {notionConnection.selectedDatabaseName}
                        </p>
                      ) : (
                        <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                          No database selected for sync
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <NotionDatabaseSelector
                      currentDatabaseId={notionConnection.selectedDatabaseId}
                      currentDatabaseName={
                        notionConnection.selectedDatabaseName
                      }
                      title="Select Tags Database"
                      description="Choose a Notion database to sync guest feedback tags to."
                      trigger={
                        <Button
                          variant="outline"
                          data-testid="button-select-notion-database"
                        >
                          <Database className="w-4 h-4 mr-2" />
                          {notionConnection.selectedDatabaseId
                            ? "Change Database"
                            : "Select Database"}
                        </Button>
                      }
                    />
                    <Button
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={handleDisconnectNotion}
                      disabled={disconnectNotionMutation.isPending}
                      data-testid="button-disconnect-notion"
                    >
                      {disconnectNotionMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Unplug className="w-4 h-4 mr-2" />
                      )}
                      Disconnect
                    </Button>
                  </div>
                  {/* Sync Configuration Section */}
                  <Collapsible
                    open={isSettingsOpen}
                    onOpenChange={setIsSettingsOpen}
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                        data-testid="button-toggle-sync-settings"
                      >
                        <span className="flex items-center gap-2">
                          <Settings className="w-4 h-4" />
                          Sync Settings
                        </span>
                        {isSettingsOpen ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-4 space-y-4">
                      {/* What to sync section */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium flex items-center gap-2">
                          <Database className="w-4 h-4" />
                          What to Sync
                        </h4>

                        {/* Reservations toggle */}
                        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                          <div className="flex items-center gap-3">
                            <Switch
                              id="sync-reservations"
                              checked={
                                notionConnection.syncReservations ?? true
                              }
                              onCheckedChange={(checked) =>
                                updateSyncSettingsMutation.mutate({
                                  syncReservations: checked,
                                })
                              }
                              disabled={updateSyncSettingsMutation.isPending}
                              data-testid="switch-sync-reservations"
                            />
                            <Label
                              htmlFor="sync-reservations"
                              className="cursor-pointer"
                            >
                              <span className="font-medium flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                Reservations
                              </span>
                              <p className="text-xs text-muted-foreground">
                                Guest name, property, dates, sentiment score,
                                public review
                              </p>
                            </Label>
                          </div>
                        </div>

                        {/* Database selector for reservations */}
                        {notionConnection.syncReservations !== false && (
                          <div className="ml-6 flex items-center gap-2">
                            <NotionDatabaseSelector
                              currentDatabaseId={
                                notionConnection.reservationsDatabaseId
                              }
                              currentDatabaseName={
                                notionConnection.reservationsDatabaseName
                              }
                              onSelect={(dbId, dbName) =>
                                updateSyncSettingsMutation.mutate({
                                  reservationsDatabaseId: dbId,
                                  reservationsDatabaseName: dbName,
                                })
                              }
                              title="Select Reservations Database"
                              description="Choose a Notion database to sync reservation data to."
                              trigger={
                                <Button
                                  variant="outline"
                                  size="sm"
                                  data-testid="button-select-reservations-database"
                                >
                                  <Database className="w-3 h-3 mr-2" />
                                  {notionConnection.reservationsDatabaseId
                                    ? notionConnection.reservationsDatabaseName ||
                                      "Change Database"
                                    : "Select Database"}
                                </Button>
                              }
                            />
                            {!notionConnection.reservationsDatabaseId && (
                              <span className="text-xs text-amber-600">
                                Required
                              </span>
                            )}
                          </div>
                        )}

                        {/* Confirmed Tasks toggle */}
                        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                          <div className="flex items-center gap-3">
                            <Switch
                              id="sync-tasks"
                              checked={
                                notionConnection.syncConfirmedTasks ?? true
                              }
                              onCheckedChange={(checked) =>
                                updateSyncSettingsMutation.mutate({
                                  syncConfirmedTasks: checked,
                                })
                              }
                              disabled={updateSyncSettingsMutation.isPending}
                              data-testid="switch-sync-tasks"
                            />
                            <Label
                              htmlFor="sync-tasks"
                              className="cursor-pointer"
                            >
                              <span className="font-medium flex items-center gap-2">
                                <ClipboardList className="w-4 h-4 text-muted-foreground" />
                                Confirmed Tasks
                              </span>
                              <p className="text-xs text-muted-foreground">
                                AI-suggested tasks that you accept
                              </p>
                            </Label>
                          </div>
                        </div>

                        {/* Database selector for tasks */}
                        {notionConnection.syncConfirmedTasks !== false && (
                          <div className="ml-6 flex items-center gap-2">
                            <NotionDatabaseSelector
                              currentDatabaseId={
                                notionConnection.tasksDatabaseId
                              }
                              currentDatabaseName={
                                notionConnection.tasksDatabaseName
                              }
                              onSelect={(dbId, dbName) =>
                                updateSyncSettingsMutation.mutate({
                                  tasksDatabaseId: dbId,
                                  tasksDatabaseName: dbName,
                                })
                              }
                              title="Select Tasks Database"
                              description="Choose a Notion database to sync confirmed AI tasks to."
                              trigger={
                                <Button
                                  variant="outline"
                                  size="sm"
                                  data-testid="button-select-tasks-database"
                                >
                                  <Database className="w-3 h-3 mr-2" />
                                  {notionConnection.tasksDatabaseId
                                    ? notionConnection.tasksDatabaseName ||
                                      "Change Database"
                                    : "Select Database"}
                                </Button>
                              }
                            />
                            {!notionConnection.tasksDatabaseId && (
                              <span className="text-xs text-amber-600">
                                Required
                              </span>
                            )}
                          </div>
                        )}

                        {/* Tags toggle */}
                        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                          <div className="flex items-center gap-3">
                            <Switch
                              id="sync-tags"
                              checked={notionConnection.syncTags ?? true}
                              onCheckedChange={(checked) =>
                                updateSyncSettingsMutation.mutate({
                                  syncTags: checked,
                                })
                              }
                              disabled={updateSyncSettingsMutation.isPending}
                              data-testid="switch-sync-tags"
                            />
                            <Label
                              htmlFor="sync-tags"
                              className="cursor-pointer"
                            >
                              <span className="font-medium flex items-center gap-2">
                                <Tag className="w-4 h-4 text-muted-foreground" />
                                Guest Feedback Tags
                              </span>
                              <p className="text-xs text-muted-foreground">
                                Tag name, sentiment, theme, verbatim, and AI
                                suggested task
                              </p>
                            </Label>
                          </div>
                        </div>

                        {/* Database selector for tags */}
                        {notionConnection.syncTags !== false && (
                          <div className="ml-6 flex items-center gap-2">
                            <NotionDatabaseSelector
                              currentDatabaseId={
                                notionConnection.tagsDatabaseId
                              }
                              currentDatabaseName={
                                notionConnection.tagsDatabaseName
                              }
                              onSelect={(dbId, dbName) =>
                                updateSyncSettingsMutation.mutate({
                                  tagsDatabaseId: dbId,
                                  tagsDatabaseName: dbName,
                                })
                              }
                              title="Select Tags Database"
                              description="Choose a Notion database to sync guest feedback tags to."
                              trigger={
                                <Button
                                  variant="outline"
                                  size="sm"
                                  data-testid="button-select-tags-database"
                                >
                                  <Database className="w-3 h-3 mr-2" />
                                  {notionConnection.tagsDatabaseId
                                    ? notionConnection.tagsDatabaseName ||
                                      "Change Database"
                                    : "Select Database"}
                                </Button>
                              }
                            />
                            {!notionConnection.tagsDatabaseId && (
                              <span className="text-xs text-amber-600">
                                Required
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Property Filter section */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium flex items-center gap-2">
                          <Filter className="w-4 h-4" />
                          Property Filter
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          Select which properties to sync. Leave empty to sync
                          all properties.
                        </p>
                        <div className="max-h-48 overflow-y-auto space-y-2 p-3 rounded-lg border bg-muted/30">
                          {listings && listings.length > 0 ? (
                            listings.map((listing) => (
                              <div
                                key={listing.id}
                                className="flex items-center gap-2"
                              >
                                <Checkbox
                                  id={`property-${listing.id}`}
                                  checked={localPropertyFilter.includes(
                                    listing.id,
                                  )}
                                  onCheckedChange={(checked) =>
                                    handlePropertyFilterChange(
                                      listing.id,
                                      !!checked,
                                    )
                                  }
                                  data-testid={`checkbox-property-${listing.id}`}
                                />
                                <Label
                                  htmlFor={`property-${listing.id}`}
                                  className="text-sm cursor-pointer"
                                >
                                  {listing.name}
                                </Label>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              No properties available. Import properties first.
                            </p>
                          )}
                        </div>
                        {localPropertyFilter.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {localPropertyFilter.length}{" "}
                            {localPropertyFilter.length === 1
                              ? "property"
                              : "properties"}{" "}
                            selected
                          </p>
                        )}
                      </div>

                      {/* Auto-sync toggle */}
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-3">
                          <Switch
                            id="auto-sync"
                            checked={notionConnection.autoSyncEnabled || false}
                            onCheckedChange={(checked) =>
                              toggleAutoSyncMutation.mutate(checked)
                            }
                            disabled={toggleAutoSyncMutation.isPending}
                            data-testid="switch-auto-sync"
                          />
                          <Label htmlFor="auto-sync" className="cursor-pointer">
                            <span className="font-medium">
                              Auto-sync enabled
                            </span>
                            <p className="text-xs text-muted-foreground">
                              Automatically sync new data to Notion as it's
                              created
                            </p>
                          </Label>
                        </div>
                        {toggleAutoSyncMutation.isPending && (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Connect your Notion workspace to sync reservations,
                    confirmed tasks, and guest feedback to Notion databases.
                    Choose what data to sync and which properties to include.
                  </p>
                  <Button
                    onClick={handleConnectNotion}
                    disabled={isConnectingNotion || !activeWorkspace}
                    data-testid="button-connect-notion"
                  >
                    {isConnectingNotion ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        Connect Notion
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                  {!activeWorkspace && (
                    <p className="text-xs text-amber-600">
                      Please select a workspace first to connect Notion.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle>Slack</CardTitle>
                      {(activeWorkspace as any)?.slackWebhookUrl && (
                        <Badge
                          variant="default"
                          className="bg-emerald-500 hover:bg-emerald-600"
                        >
                          Connected
                        </Badge>
                      )}
                    </div>
                    <CardDescription>
                      Receive alerts when new AI Sentiment Scores are generated
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(activeWorkspace as any)?.slackWebhookUrl ? (
                  <>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium text-emerald-600 dark:text-emerald-400">
                          Slack alerts enabled
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Notifications will be sent when new sentiment scores
                          are generated.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="slack-webhook-url">Webhook URL</Label>
                      <Input
                        id="slack-webhook-url"
                        type="url"
                        value={slackWebhookUrl}
                        onChange={(e) => setSlackWebhookUrl(e.target.value)}
                        placeholder="https://hooks.slack.com/services/..."
                        data-testid="input-slack-webhook-url"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        onClick={() =>
                          saveSlackWebhookMutation.mutate(slackWebhookUrl)
                        }
                        disabled={
                          saveSlackWebhookMutation.isPending ||
                          slackWebhookUrl ===
                            ((activeWorkspace as any)?.slackWebhookUrl || "")
                        }
                        variant="outline"
                        data-testid="button-save-slack-webhook"
                      >
                        {saveSlackWebhookMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4 mr-2" />
                        )}
                        Save Changes
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setSlackWebhookUrl("");
                          saveSlackWebhookMutation.mutate("");
                        }}
                        disabled={saveSlackWebhookMutation.isPending}
                        data-testid="button-disconnect-slack"
                      >
                        <Unplug className="w-4 h-4 mr-2" />
                        Disconnect
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Connect a Slack Incoming Webhook to receive automated
                      alerts when new AI Sentiment Scores are generated for your
                      reservations.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="slack-webhook-url">Webhook URL</Label>
                      <Input
                        id="slack-webhook-url"
                        type="url"
                        value={slackWebhookUrl}
                        onChange={(e) => setSlackWebhookUrl(e.target.value)}
                        placeholder="https://hooks.slack.com/services/..."
                        data-testid="input-slack-webhook-url"
                      />
                      <p className="text-xs text-muted-foreground">
                        Create an Incoming Webhook in your Slack workspace
                        settings to get the URL.
                      </p>
                    </div>
                    <Button
                      onClick={() =>
                        saveSlackWebhookMutation.mutate(slackWebhookUrl)
                      }
                      disabled={
                        saveSlackWebhookMutation.isPending ||
                        !slackWebhookUrl.trim()
                      }
                      data-testid="button-connect-slack"
                    >
                      {saveSlackWebhookMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          Connect Slack
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <Lightbulb className="w-6 h-6 text-amber-500" />
                </div>
                <div>
                  <CardTitle>Suggest an Integration</CardTitle>
                  <CardDescription>
                    Tell us what platform or service you'd like to connect
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="integration-name"
                    className="text-sm font-medium"
                  >
                    What integration do you want?
                  </Label>
                  <Input
                    id="integration-name"
                    placeholder="e.g., Guesty, Hostaway, Breezeway..."
                    value={integrationName}
                    onChange={(e) => setIntegrationName(e.target.value)}
                    data-testid="input-integration-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="integration-description"
                    className="text-sm font-medium"
                  >
                    What do you want it to do?
                  </Label>
                  <Textarea
                    id="integration-description"
                    placeholder="Describe what data you want to send or receive, and how the integration would work for you..."
                    value={integrationDescription}
                    onChange={(e) => setIntegrationDescription(e.target.value)}
                    rows={3}
                    className="resize-none"
                    data-testid="textarea-integration-description"
                  />
                </div>
                <Button
                  onClick={handleSubmitSuggestion}
                  disabled={
                    submitIntegrationSuggestion.isPending ||
                    !integrationName.trim()
                  }
                  className="w-full"
                  data-testid="button-submit-integration-suggestion"
                >
                  {submitIntegrationSuggestion.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Submit Suggestion
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
