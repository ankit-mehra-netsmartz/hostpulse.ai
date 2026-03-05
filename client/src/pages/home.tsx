import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { GradeBadge, GradeLegend } from "@/components/grade-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, subDays, subMonths } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/contexts/notifications-context";
import { 
  Activity,
  BarChart3, 
  Building2, 
  Plus, 
  ArrowRight, 
  Loader2, 
  AlertCircle, 
  RefreshCw,
  Calendar,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  TrendingUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Sparkles,
  GitMerge,
  Trash2,
  Check,
  X
} from "lucide-react";
import type { DataSource, Listing, ListingAnalysis } from "@shared/schema";
import { useSearch, useLocation } from "wouter";
import { PropertySelectorSheet } from "@/components/property-selector-sheet";
import { HomeTagChart } from "@/components/home-tag-chart";

interface HospitableProperty {
  id: string;
  name: string;
  public_name: string;
  picture: string;
  address: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  capacity: {
    max?: number;
    bedrooms?: number;
    bathrooms?: number;
  };
  property_type: string;
  listings?: Array<{
    platform: string;
    platform_id: string;
  }>;
}

interface ListingWithAnalysis extends Listing {
  analysis?: ListingAnalysis;
}

const gradeCategories = [
  { key: "pet", label: "Pet" },
  { key: "superhost", label: "SuperHost" },
  { key: "photos", label: "Photos" },
  { key: "reviews", label: "Reviews" },
  { key: "guestFav", label: "Guest Fav" },
  { key: "title", label: "Title" },
  { key: "sleep", label: "Sleep" },
  { key: "superhostStatus", label: "Superhost" },
  { key: "description", label: "Description" },
  { key: "ideal", label: "Ideal" },
];

export default function Home() {
  const { user } = useAuth();
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const searchParams = new URLSearchParams(searchString);
  const showPropertiesParam = searchParams.get("showProperties") === "true";
  
  const [showPropertySheet, setShowPropertySheet] = useState(false);
  const [hospProperties, setHospProperties] = useState<HospitableProperty[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [sortField, setSortField] = useState<"score" | "last" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  // Date range filter state
  type DateRangeOption = "30" | "60" | "90" | "180" | "365" | "custom";
  const [dateRangeOption, setDateRangeOption] = useState<DateRangeOption>("30");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
  const [isCustomDateOpen, setIsCustomDateOpen] = useState(false);
  
  // Calculate date range based on selection
  const getDateRange = useMemo(() => {
    const endDate = new Date();
    let startDate: Date;
    
    if (dateRangeOption === "custom" && customStartDate && customEndDate) {
      return { startDate: customStartDate, endDate: customEndDate };
    }
    
    switch (dateRangeOption) {
      case "30":
        startDate = subDays(endDate, 30);
        break;
      case "60":
        startDate = subDays(endDate, 60);
        break;
      case "90":
        startDate = subDays(endDate, 90);
        break;
      case "180":
        startDate = subMonths(endDate, 6);
        break;
      case "365":
        startDate = subMonths(endDate, 12);
        break;
      default:
        startDate = subDays(endDate, 30);
    }
    
    return { startDate, endDate };
  }, [dateRangeOption, customStartDate, customEndDate]);
  const { toast } = useToast();
  const { notifications, isListingAnalyzing } = useNotifications();
  
  // Track the last notification ID to detect new sync completions
  const lastNotificationRef = useRef<string | null>(null);

  const { data: dataSources, isLoading: dataSourcesLoading, error: dataSourcesError, refetch: refetchDataSources } = useQuery<DataSource[]>({
    queryKey: ["/api/data-sources"],
    refetchOnMount: "always",
    staleTime: 0,
    gcTime: 0,
  });

  const { data: listings, isLoading: listingsLoading, error: listingsError, refetch: refetchListings } = useQuery<ListingWithAnalysis[]>({
    queryKey: ["/api/listings"],
    refetchOnMount: "always",
    staleTime: 0,
    gcTime: 0,
  });

  // Check if date range is valid for querying
  const hasValidDateRange = useMemo((): boolean => {
    if (dateRangeOption === "custom") {
      return !!(customStartDate && customEndDate);
    }
    return true;
  }, [dateRangeOption, customStartDate, customEndDate]);

  const { data: overallStats, error: statsError, refetch: refetchStats } = useQuery<{
    overallScore: number;
    totalListings: number;
    analyzedListings: number;
    autoAnalysisEnabled: number;
    dateRangeStats?: {
      reservationsInRange: number;
      tagsInRange: number;
      positiveTags: number;
      negativeTags: number;
      neutralTags: number;
    };
  }>({
    queryKey: ["/api/listings/stats", hasValidDateRange ? getDateRange.startDate.toISOString() : null, hasValidDateRange ? getDateRange.endDate.toISOString() : null],
    queryFn: async () => {
      if (!hasValidDateRange) {
        // Return basic stats without date range when custom dates not set
        const res = await fetch(`/api/listings/stats`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch stats");
        return res.json();
      }
      const params = new URLSearchParams({
        startDate: getDateRange.startDate.toISOString(),
        endDate: getDateRange.endDate.toISOString(),
      });
      const res = await fetch(`/api/listings/stats?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: true,
  });

  const { data: suggestions, error: suggestionsError, refetch: refetchSuggestions } = useQuery<string[]>({
    queryKey: ["/api/listings/suggestions"],
  });

  interface ChartDataPoint {
    date: string;
    positive: number;
    neutral: number;
    negative: number;
    question: number;
  }

  const { data: chartResponse, isLoading: chartLoading } = useQuery<{
    chartData: ChartDataPoint[];
    listings: { id: string; name: string }[];
  }>({
    queryKey: ["/api/tags/chart-data", hasValidDateRange ? dateRangeOption : null],
    queryFn: async () => {
      const days = dateRangeOption === "custom" ? "365" : dateRangeOption;
      const res = await fetch(`/api/tags/chart-data?days=${days}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch chart data");
      return res.json();
    },
  });

  const { data: pendingListings, refetch: refetchPending } = useQuery<Listing[]>({
    queryKey: ["/api/listings/pending-actions"],
  });

  const approveSyncMutation = useMutation({
    mutationFn: async (listingId: string) => {
      const res = await apiRequest("POST", `/api/listings/${listingId}/approve-sync`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/listings/pending-actions"] });
      toast({ title: "Property Synced", description: "Property updates have been applied." });
    },
    onError: (error: Error) => {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  const dismissSyncMutation = useMutation({
    mutationFn: async (listingId: string) => {
      const res = await apiRequest("POST", `/api/listings/${listingId}/dismiss-sync`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings/pending-actions"] });
      toast({ title: "Sync Dismissed", description: "Changes have been ignored." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  const confirmDeleteMutation = useMutation({
    mutationFn: async (listingId: string) => {
      const res = await apiRequest("POST", `/api/listings/${listingId}/confirm-delete`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/listings/pending-actions"] });
      toast({ title: "Property Deleted", description: "Property has been removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
    },
  });

  const keepPropertyMutation = useMutation({
    mutationFn: async (listingId: string) => {
      const res = await apiRequest("POST", `/api/listings/${listingId}/keep-property`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings/pending-actions"] });
      toast({ title: "Property Kept", description: "Property will remain in your account." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  const confirmMergeMutation = useMutation({
    mutationFn: async (listingId: string) => {
      const res = await apiRequest("POST", `/api/listings/${listingId}/confirm-merge`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/listings/pending-actions"] });
      toast({ title: "Merge Confirmed", description: "Property has been merged." });
    },
    onError: (error: Error) => {
      toast({ title: "Merge Failed", description: error.message, variant: "destructive" });
    },
  });

  const toggleAutoAnalysisMutation = useMutation({
    mutationFn: async ({ listingId, enabled }: { listingId: string; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/listings/${listingId}`, {
        autoAnalysisEnabled: enabled,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/listings/stats"] });
      toast({
        title: data.autoAnalysisEnabled ? "Auto-Analysis Enabled" : "Auto-Analysis Disabled",
        description: data.autoAnalysisEnabled 
          ? "This listing will be automatically analyzed on the 1st of each month."
          : "Automatic monthly analysis has been turned off for this listing.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update auto-analysis setting",
        variant: "destructive",
      });
    },
  });

  const handleAnalyze = (listing: ListingWithAnalysis) => {
    // Option A: Navigate to listing detail and run staged stream there so user sees real progress
    toast({
      title: "Opening listing",
      description: "Taking you to the listing to show live analysis progress.",
    });
    navigate(`/listings/${listing.id}?analyze=1&tab=analysis`);
  };

  const connectedDataSource = dataSources?.find(ds => ds.isConnected);
  const hasConnectedSource = !!connectedDataSource;
  const isLoading = dataSourcesLoading || listingsLoading;
  const hasError = dataSourcesError || listingsError || statsError || suggestionsError;
  const hasListings = listings && listings.length > 0;

  const sortedListings = useMemo(() => {
    if (!listings || !sortField) return listings;
    
    return [...listings].sort((a, b) => {
      let aVal: number | null = null;
      let bVal: number | null = null;
      
      if (sortField === "score") {
        aVal = a.analysis?.score ?? null;
        bVal = b.analysis?.score ?? null;
      } else if (sortField === "last") {
        aVal = a.lastAnalyzedAt ? new Date(a.lastAnalyzedAt).getTime() : null;
        bVal = b.lastAnalyzedAt ? new Date(b.lastAnalyzedAt).getTime() : null;
      }
      
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [listings, sortField, sortDirection]);

  const handleSort = (field: "score" | "last") => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const getSortIcon = (field: "score" | "last") => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1" />;
    return sortDirection === "asc" 
      ? <ArrowUp className="w-3 h-3 ml-1" />
      : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  // Fetch properties when coming back from OAuth
  useEffect(() => {
    if (showPropertiesParam && connectedDataSource) {
      fetchProperties(connectedDataSource.id);
      // Clear the URL param
      window.history.replaceState({}, "", "/");
    }
  }, [showPropertiesParam, connectedDataSource]);

  // Listen for sync completion notifications and refetch data
  useEffect(() => {
    const latestNotification = notifications[0];
    if (!latestNotification) return;
    
    // Only react to new notifications (different from last seen)
    if (lastNotificationRef.current === latestNotification.id) return;
    lastNotificationRef.current = latestNotification.id;
    
    // If sync completed, refetch all data
    if (latestNotification.type === "sync_complete" || latestNotification.type === "background_sync_complete") {
      console.log("[Home] Sync completed, refetching dashboard data");
      refetchListings();
      refetchStats();
      refetchSuggestions();
      refetchPending();
    }
  }, [notifications, refetchListings, refetchStats, refetchSuggestions, refetchPending]);

  const fetchProperties = async (dataSourceId: string) => {
    setPropertiesLoading(true);
    try {
      const response = await fetch(`/api/data-sources/${dataSourceId}/properties`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setHospProperties(data.data || []);
        setShowPropertySheet(true);
      }
    } catch (error) {
      console.error("Error fetching properties:", error);
    } finally {
      setPropertiesLoading(false);
    }
  };

  const handleAddListings = () => {
    if (connectedDataSource) {
      fetchProperties(connectedDataSource.id);
    }
  };

  const getUserName = () => {
    if (user?.firstName) {
      return user.firstName;
    }
    return user?.email?.split("@")[0] || "there";
  };

  const handleRetry = () => {
    refetchDataSources();
    refetchListings();
    refetchStats();
    refetchSuggestions();
  };

  const getGradeForCategory = (analysis: ListingAnalysis | undefined, category: string): string | null => {
    if (!analysis) return null;
    type AnalysisKey = keyof ListingAnalysis;
    const gradeMap: Record<string, AnalysisKey> = {
      pet: "petGrade",
      superhost: "superhostGrade",
      photos: "photosGrade",
      reviews: "reviewsGrade",
      guestFav: "guestFavGrade",
      title: "titleGrade",
      sleep: "sleepGrade",
      superhostStatus: "superhostStatusGrade",
      description: "descriptionGrade",
      ideal: "idealGrade",
    };
    const key = gradeMap[category];
    if (!key) return null;
    const value = analysis[key];
    return typeof value === "string" ? value : null;
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>
              We couldn't load your data. Please try again.
            </AlertDescription>
          </Alert>
          <Button onClick={handleRetry} data-testid="button-retry">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (!hasConnectedSource) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto animate-heartbeat">
            <Activity className="w-10 h-10 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Welcome to HostPulse, {getUserName()}!</h1>
            <p className="text-muted-foreground">
              Connect your property management platform to get started with AI-powered listing analysis.
            </p>
          </div>
          <Button size="lg" asChild data-testid="button-connect-source">
            <a href="/data-sources">
              Connect Data Source
              <ArrowRight className="w-4 h-4 ml-2" />
            </a>
          </Button>
        </div>
      </div>
    );
  }

  if (hasConnectedSource && !hasListings) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto animate-heartbeat">
            <Activity className="w-10 h-10 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Ready to Sync, {getUserName()}!</h1>
            <p className="text-muted-foreground">
              Your Hospitable account is connected. Select the properties you want to analyze and sync their data.
            </p>
          </div>
          <Button size="lg" onClick={handleAddListings} data-testid="button-sync-listings">
            Sync Your Listings
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Listing Analysis</h1>
            <p className="text-muted-foreground">
              AI-powered analysis of your listing based on guest reviews and best practices
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Date Range Filter */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select 
                value={dateRangeOption} 
                onValueChange={(value: DateRangeOption) => {
                  setDateRangeOption(value);
                  if (value === "custom") {
                    setIsCustomDateOpen(true);
                  }
                }}
              >
                <SelectTrigger className="w-[160px]" data-testid="select-date-range">
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="60">Last 60 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="180">Last 6 months</SelectItem>
                  <SelectItem value="365">Last 12 months</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
              
              {dateRangeOption === "custom" && (
                <Popover open={isCustomDateOpen} onOpenChange={setIsCustomDateOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1" data-testid="button-custom-date">
                      {customStartDate && customEndDate ? (
                        <>
                          {format(customStartDate, "MMM d")} - {format(customEndDate, "MMM d, yyyy")}
                        </>
                      ) : (
                        "Pick dates"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-4" align="end">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Start Date</p>
                        <CalendarComponent
                          mode="single"
                          selected={customStartDate}
                          onSelect={setCustomStartDate}
                          disabled={(date) => date > new Date()}
                        />
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium">End Date</p>
                        <CalendarComponent
                          mode="single"
                          selected={customEndDate}
                          onSelect={setCustomEndDate}
                          disabled={(date) => date > new Date() || (customStartDate ? date < customStartDate : false)}
                        />
                      </div>
                      <Button 
                        className="w-full" 
                        size="sm"
                        onClick={() => setIsCustomDateOpen(false)}
                        disabled={!customStartDate || !customEndDate}
                      >
                        Apply
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            
            <Button onClick={handleAddListings} data-testid="button-add-listings">
              <Plus className="w-4 h-4 mr-2" />
              Add Listings to Analyze
            </Button>
          </div>
        </div>

        {pendingListings && pendingListings.length > 0 && (
          <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-200">
              Property Changes Pending
            </AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              <div className="mt-3 space-y-3">
                {pendingListings.map((listing) => (
                  <div 
                    key={listing.id} 
                    className="flex items-center justify-between gap-4 p-3 bg-background rounded-lg border"
                    data-testid={`pending-action-${listing.id}`}
                  >
                    <div className="flex items-center gap-3">
                      {listing.imageUrl ? (
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={listing.imageUrl} alt={listing.name} />
                          <AvatarFallback>{listing.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-foreground">{listing.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {listing.webhookStatus === "pending_sync" && "Updates available from Hospitable"}
                          {listing.webhookStatus === "pending_delete" && "Deleted in Hospitable"}
                          {listing.webhookStatus === "pending_merge" && "Merged with another property in Hospitable"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {listing.webhookStatus === "pending_sync" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => approveSyncMutation.mutate(listing.id)}
                            disabled={approveSyncMutation.isPending}
                            data-testid={`button-approve-sync-${listing.id}`}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Apply
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => dismissSyncMutation.mutate(listing.id)}
                            disabled={dismissSyncMutation.isPending}
                            data-testid={`button-dismiss-sync-${listing.id}`}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Ignore
                          </Button>
                        </>
                      )}
                      {listing.webhookStatus === "pending_delete" && (
                        <>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => confirmDeleteMutation.mutate(listing.id)}
                            disabled={confirmDeleteMutation.isPending}
                            data-testid={`button-confirm-delete-${listing.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Remove
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => keepPropertyMutation.mutate(listing.id)}
                            disabled={keepPropertyMutation.isPending}
                            data-testid={`button-keep-property-${listing.id}`}
                          >
                            Keep Property
                          </Button>
                        </>
                      )}
                      {listing.webhookStatus === "pending_merge" && (
                        <Button
                          size="sm"
                          onClick={() => confirmMergeMutation.mutate(listing.id)}
                          disabled={confirmMergeMutation.isPending}
                          data-testid={`button-confirm-merge-${listing.id}`}
                        >
                          <GitMerge className="h-4 w-4 mr-1" />
                          Confirm Merge
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Overall Listing Quality
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {listingsLoading ? (
                <Skeleton className="h-12 w-24" />
              ) : (
                <>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold" data-testid="text-overall-score">
                      {overallStats?.overallScore?.toFixed(1) || "0.0"}
                    </span>
                    <span className="text-xl text-muted-foreground">/10</span>
                  </div>
                  <Progress 
                    value={(overallStats?.overallScore || 0) * 10} 
                    className="h-2"
                  />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Monthly Auto-Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {listingsLoading ? (
                <Skeleton className="h-12 w-32" />
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold" data-testid="text-auto-analysis-count">
                      {overallStats?.autoAnalysisEnabled || 0}
                    </span>
                    <span className="text-muted-foreground">
                      / {overallStats?.totalListings || 0} enabled
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Auto re-analysis on 1st of each month
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Top Suggestions
                </CardTitle>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-6 w-6" data-testid="button-suggestions-prev">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" data-testid="button-suggestions-next">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {listingsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              ) : suggestions && suggestions.length > 0 ? (
                <ul className="space-y-2">
                  {suggestions.slice(0, 4).map((suggestion, i) => (
                    <li 
                      key={i} 
                      className="flex items-start gap-2 text-sm"
                      data-testid={`text-suggestion-${i}`}
                    >
                      <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${
                        i === 0 ? "bg-emerald-500/20 text-emerald-500" : "bg-amber-500/20 text-amber-500"
                      }`}>
                        {i + 1}
                      </span>
                      <span className="text-muted-foreground">{suggestion}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No suggestions yet. Add listings to get AI-powered recommendations.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <HomeTagChart
          data={chartResponse?.chartData || []}
          isLoading={chartLoading}
        />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0">
            <CardTitle>Listing Performance Overview</CardTitle>
            <GradeLegend />
          </CardHeader>
          <CardContent>
            <ScrollArea className="w-full">
              <div className="min-w-[1400px]">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm w-[220px]">
                        Listing
                      </th>
                      <th className="text-center py-3 px-2 font-medium text-muted-foreground text-xs w-[60px]">
                        Auto
                      </th>
                      <th className="text-center py-3 px-2 font-medium text-muted-foreground text-xs w-[60px]">
                        History
                      </th>
                      <th className="text-center py-3 px-2 w-[70px]">
                        <button 
                          onClick={() => handleSort("score")}
                          className="flex items-center justify-center w-full font-medium text-muted-foreground text-xs hover:text-foreground"
                          data-testid="button-sort-score"
                        >
                          Score
                          {getSortIcon("score")}
                        </button>
                      </th>
                      <th className="text-center py-3 px-2 w-[80px]">
                        <button 
                          onClick={() => handleSort("last")}
                          className="flex items-center justify-center w-full font-medium text-muted-foreground text-xs hover:text-foreground"
                          data-testid="button-sort-last"
                        >
                          Last
                          {getSortIcon("last")}
                        </button>
                      </th>
                      {gradeCategories.map((cat) => (
                        <th 
                          key={cat.key} 
                          className="text-center py-3 px-2 font-medium text-muted-foreground text-xs"
                          title={cat.label}
                        >
                          {cat.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listingsLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b last:border-b-0">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <Skeleton className="w-10 h-10 rounded-md" />
                              <Skeleton className="h-4 w-32" />
                            </div>
                          </td>
                          <td className="text-center py-3 px-2">
                            <div className="flex justify-center">
                              <Skeleton className="w-8 h-5 rounded-full" />
                            </div>
                          </td>
                          <td className="text-center py-3 px-2">
                            <div className="flex justify-center">
                              <Skeleton className="w-6 h-6 rounded-md" />
                            </div>
                          </td>
                          <td className="text-center py-3 px-2">
                            <Skeleton className="h-4 w-8 mx-auto" />
                          </td>
                          <td className="text-center py-3 px-2">
                            <Skeleton className="h-4 w-16 mx-auto" />
                          </td>
                          {gradeCategories.map((cat) => (
                            <td key={cat.key} className="text-center py-3 px-2">
                              <div className="flex justify-center">
                                <Skeleton className="w-8 h-8 rounded-md" />
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : !hasListings ? (
                      <tr>
                        <td colSpan={gradeCategories.length + 5} className="py-12">
                          <div className="flex flex-col items-center justify-center text-center space-y-4">
                            <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
                              <Plus className="w-8 h-8 text-primary" />
                            </div>
                            <div className="space-y-1">
                              <h3 className="font-semibold text-lg">Connect Listings</h3>
                              <p className="text-sm text-muted-foreground max-w-sm">
                                Select properties from the panel to start analyzing performance and get AI-powered recommendations.
                              </p>
                            </div>
                            <Button onClick={handleAddListings} data-testid="button-connect-listings-table">
                              <Plus className="w-4 h-4 mr-2" />
                              Select Properties to Import
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      (sortedListings || []).map((listing) => (
                        <tr 
                          key={listing.id} 
                          className="border-b last:border-b-0 hover-elevate cursor-pointer"
                          onClick={() => navigate(`/listings/${listing.id}`)}
                          data-testid={`row-listing-${listing.id}`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <Avatar className="w-10 h-10 rounded-md">
                                <AvatarImage src={listing.imageUrl || undefined} alt={listing.name} />
                                <AvatarFallback className="rounded-md bg-muted">
                                  <Building2 className="w-5 h-5 text-muted-foreground" />
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium truncate max-w-[100px]" title={listing.name}>
                                    {listing.name}
                                  </span>
                                  {listing.publicUrl && (
                                    <a 
                                      href={listing.publicUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-muted-foreground hover:text-primary"
                                      onClick={(e) => e.stopPropagation()}
                                      data-testid={`link-listing-${listing.id}`}
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              </div>
                              <Tooltip delayDuration={0}>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant={listing.lastAnalyzedAt ? "outline" : "default"}
                                    onClick={(e) => { e.stopPropagation(); handleAnalyze(listing); }}
                                    disabled={isListingAnalyzing(listing.id)}
                                    className="flex-shrink-0"
                                    data-testid={`button-analyze-${listing.id}`}
                                  >
                                    {isListingAnalyzing(listing.id) ? (
                                      <>
                                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                        In Progress
                                      </>
                                    ) : (
                                      <>
                                        <Sparkles className="w-3 h-3 mr-1" />
                                        {listing.lastAnalyzedAt ? "Re-Run" : "Analyze"}
                                      </>
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{isListingAnalyzing(listing.id) ? "Analysis in progress..." : "Analyze this listing using AI"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                          <td className="text-center py-3 px-2">
                            <div className="flex justify-center">
                              <Switch
                                checked={listing.autoAnalysisEnabled || false}
                                onCheckedChange={(checked) => {
                                  toggleAutoAnalysisMutation.mutate({ listingId: listing.id, enabled: checked });
                                }}
                                onClick={(e) => e.stopPropagation()}
                                disabled={toggleAutoAnalysisMutation.isPending}
                                data-testid={`toggle-auto-${listing.id}`}
                              />
                            </div>
                          </td>
                          <td className="text-center py-3 px-2">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7"
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`button-history-${listing.id}`}
                            >
                              <TrendingUp className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </td>
                          <td className="text-center py-3 px-2">
                            <span className="font-semibold text-sm" data-testid={`text-score-${listing.id}`}>
                              {listing.analysis?.score?.toFixed(1) || "—"}
                            </span>
                          </td>
                          <td className="text-center py-3 px-2">
                            <span className="text-xs text-muted-foreground" data-testid={`text-last-${listing.id}`}>
                              {listing.lastAnalyzedAt 
                                ? new Date(listing.lastAnalyzedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                : "—"
                              }
                            </span>
                          </td>
                          {gradeCategories.map((cat) => (
                            <td key={cat.key} className="text-center py-3 px-2">
                              <div className="flex justify-center">
                                <GradeBadge 
                                  grade={getGradeForCategory(listing.analysis, cat.key) as any}
                                  size="sm"
                                />
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
            {hasListings && (
              <div className="flex justify-end pt-4 text-sm text-muted-foreground">
                Scroll right to see all categories
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {connectedDataSource && (
        <PropertySelectorSheet
          open={showPropertySheet}
          onOpenChange={setShowPropertySheet}
          properties={hospProperties}
          dataSourceId={connectedDataSource.id}
          isLoading={propertiesLoading}
          existingListings={listings?.map(l => ({ id: l.id, externalId: l.externalId, name: l.name })) || []}
        />
      )}

    </div>
  );
}
