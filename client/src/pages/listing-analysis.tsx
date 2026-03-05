import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { GradeBadge, GradeLegend } from "@/components/grade-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { useNotifications } from "@/contexts/notifications-context";
import { 
  BarChart3, 
  Calendar, 
  Lightbulb, 
  Plus, 
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Image,
  MessageSquare,
  Tag,
  Building2,
  Shield,
  Users,
  FileText,
  Target,
  Clock,
  AlertCircle,
  RefreshCw,
  Loader2,
  TrendingUp
} from "lucide-react";
import { AnalysisHistorySheet } from "@/components/analysis-history-sheet";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { Listing, ListingAnalysis } from "@shared/schema";

interface ListingWithAnalysis extends Listing {
  analysis?: ListingAnalysis;
}

const categoryIcons: Record<string, typeof BarChart3> = {
  pet: Users,
  superhost: Shield,
  photos: Image,
  reviews: MessageSquare,
  guestFav: Sparkles,
  title: Tag,
  sleep: Clock,
  superhostStatus: Shield,
  description: FileText,
  ideal: Target,
};

export default function ListingAnalysisPage() {
  const [showHistorySheet, setShowHistorySheet] = useState(false);
  const [historyListingId, setHistoryListingId] = useState<string | null>(null);
  const [historyListingName, setHistoryListingName] = useState<string>("");
  const { toast } = useToast();
  const { isListingAnalyzing } = useNotifications();

  const { data: listings, isLoading: listingsLoading, error: listingsError, refetch: refetchListings } = useQuery<ListingWithAnalysis[]>({
    queryKey: ["/api/listings"],
  });

  const { data: overallStats, error: statsError, refetch: refetchStats } = useQuery<{
    overallScore: number;
    totalListings: number;
    analyzedListings: number;
    autoAnalysisEnabled: number;
  }>({
    queryKey: ["/api/listings/stats"],
  });

  interface ListingSuggestion {
    listingId: string;
    listingName: string;
    listingImage: string | null;
    suggestions: string[];
  }

  const { data: suggestions, error: suggestionsError, refetch: refetchSuggestions } = useQuery<ListingSuggestion[]>({
    queryKey: ["/api/listings/suggestions"],
  });

  const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0);

  // Reset suggestion index when suggestions change to prevent out-of-bounds access
  useEffect(() => {
    if (suggestions && suggestions.length > 0) {
      setCurrentSuggestionIndex(prev => 
        prev >= suggestions.length ? 0 : prev
      );
    } else {
      setCurrentSuggestionIndex(0);
    }
  }, [suggestions]);

  const [, navigate] = useLocation();

  const toggleAutoAnalysisMutation = useMutation({
    mutationFn: async ({ listingId, enabled }: { listingId: string; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/listings/${listingId}`, { autoAnalysisEnabled: enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/listings/stats"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update auto-analysis setting",
        variant: "destructive",
      });
    },
  });

  const handleToggleAutoAnalysis = (listing: ListingWithAnalysis, enabled: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleAutoAnalysisMutation.mutate({ listingId: listing.id, enabled });
  };

  const handleAnalyze = (listing: ListingWithAnalysis, e: React.MouseEvent) => {
    e.stopPropagation();
    // Option A: Navigate to listing detail and run staged stream there so user sees real progress
    toast({
      title: "Opening listing",
      description: "Taking you to the listing to show live analysis progress.",
    });
    navigate(`/listings/${listing.id}?analyze=1&tab=analysis&from=analysis`);
  };

  const hasError = listingsError || statsError || suggestionsError;

  const handleRetry = () => {
    refetchListings();
    refetchStats();
    refetchSuggestions();
  };

  if (hasError) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>
              We couldn't load your listing data. Please try again.
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

  const categories = [
    { key: "photos", label: "Photos" },
    { key: "title", label: "Title" },
    { key: "reviews", label: "Reviews" },
    { key: "pet", label: "Pet" },
    { key: "description", label: "Description" },
    { key: "sleep", label: "Sleep" },
    { key: "superhost", label: "Host" },
    { key: "guestFav", label: "Guest Fav" },
    { key: "superhostStatus", label: "Superhost" },
    { key: "ideal", label: "Ideal" },
  ];

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

  const hasListings = listings && listings.length > 0;

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
          <Button data-testid="button-add-listings">
            <Plus className="w-4 h-4 mr-2" />
            Add Listings to Analyze
          </Button>
        </div>

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
              {suggestions && suggestions.length > 1 && (
                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6" 
                    data-testid="button-suggestions-prev"
                    onClick={() => setCurrentSuggestionIndex(prev => 
                      prev === 0 ? (suggestions?.length || 1) - 1 : prev - 1
                    )}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground min-w-[40px] text-center">
                    {currentSuggestionIndex + 1} / {suggestions?.length || 0}
                  </span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6" 
                    data-testid="button-suggestions-next"
                    onClick={() => setCurrentSuggestionIndex(prev => 
                      prev === (suggestions?.length || 1) - 1 ? 0 : prev + 1
                    )}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {listingsLoading ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Skeleton className="w-8 h-8 rounded-md" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              ) : suggestions && suggestions.length > 0 && suggestions[currentSuggestionIndex] ? (
                <div className="space-y-3">
                  <div 
                    className="flex items-center gap-2 cursor-pointer hover-elevate rounded-md p-1 -m-1"
                    onClick={() => navigate(`/listings/${suggestions[currentSuggestionIndex].listingId}?tab=analysis&from=analysis`)}
                    data-testid={`link-suggestion-listing-${suggestions[currentSuggestionIndex].listingId}`}
                  >
                    <Avatar className="w-8 h-8 rounded-md">
                      <AvatarImage src={suggestions[currentSuggestionIndex].listingImage || undefined} />
                      <AvatarFallback className="rounded-md bg-muted">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm truncate">
                      {suggestions[currentSuggestionIndex].listingName}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {suggestions[currentSuggestionIndex].suggestions.map((suggestion, i) => (
                      <li 
                        key={i} 
                        className="flex items-start gap-2 text-sm"
                        data-testid={`text-suggestion-${currentSuggestionIndex}-${i}`}
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
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No suggestions yet. Run AI Analysis on your listings to get recommendations.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0">
            <CardTitle>Listing Performance Overview</CardTitle>
            <GradeLegend />
          </CardHeader>
          <CardContent>
            <ScrollArea className="w-full">
              <div className="min-w-[1200px]">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm w-[280px]">
                        Listing
                      </th>
                      <th className="text-center py-3 px-2 font-medium text-muted-foreground w-[80px]">
                        <div className="flex flex-col items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span className="text-xs">Monthly</span>
                        </div>
                      </th>
                      <th className="text-center py-3 px-2 font-medium text-muted-foreground w-[80px]">
                        <div className="flex flex-col items-center gap-1">
                          <TrendingUp className="w-4 h-4" />
                          <span className="text-xs">History</span>
                        </div>
                      </th>
                      <th className="text-center py-3 px-2 font-medium text-muted-foreground">
                        <div className="flex flex-col items-center gap-1">
                          <Sparkles className="w-4 h-4 text-purple-500" />
                          <span className="text-xs">Analyze</span>
                        </div>
                      </th>
                      {categories.map((cat) => {
                        const Icon = categoryIcons[cat.key] || BarChart3;
                        return (
                          <th 
                            key={cat.key} 
                            className="text-center py-3 px-2 font-medium text-muted-foreground"
                            title={cat.label}
                          >
                            <div className="flex flex-col items-center gap-1">
                              <Icon className="w-4 h-4" />
                              <span className="text-xs">{cat.label}</span>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {listingsLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b last:border-b-0">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <Skeleton className="w-10 h-10 rounded-md" />
                              <Skeleton className="h-4 w-48" />
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex justify-center">
                              <Skeleton className="w-9 h-5 rounded-full" />
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex justify-center">
                              <Skeleton className="w-8 h-8 rounded-md" />
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex justify-center">
                              <Skeleton className="w-8 h-8 rounded-md" />
                            </div>
                          </td>
                          {categories.map((cat) => (
                            <td key={cat.key} className="text-center py-3 px-2">
                              <div className="flex justify-center">
                                <Skeleton className="w-9 h-9 rounded-md" />
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : !hasListings ? (
                      <tr>
                        <td colSpan={categories.length + 4} className="py-12 text-center">
                          <div className="inline-flex flex-col items-center justify-center text-center space-y-4">
                            <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
                              <Plus className="w-8 h-8 text-primary" />
                            </div>
                            <div className="space-y-1">
                              <h3 className="font-semibold text-lg">Connect Listings</h3>
                              <p className="text-sm text-muted-foreground max-w-sm">
                                Import your properties from Hospitable to start analyzing performance and get AI-powered recommendations.
                              </p>
                            </div>
                            <Button asChild data-testid="button-connect-listings-table">
                              <a href="/data-sources">
                                <Plus className="w-4 h-4 mr-2" />
                                Connect Your First Listing
                              </a>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      (listings || []).map((listing) => (
                        <tr 
                          key={listing.id} 
                          className="border-b last:border-b-0 hover-elevate cursor-pointer"
                          data-testid={`row-listing-${listing.id}`}
                          onClick={() => navigate(`/listings/${listing.id}?tab=analysis&from=analysis`)}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <Avatar className="w-10 h-10 rounded-md">
                                <AvatarImage src={listing.imageUrl || undefined} alt={listing.name} />
                                <AvatarFallback className="rounded-md bg-muted">
                                  <Building2 className="w-5 h-5 text-muted-foreground" />
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium truncate max-w-[200px]" title={listing.name}>
                                    {listing.name}
                                  </span>
                                  {listing.publicUrl && (
                                    <a 
                                      href={listing.publicUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-muted-foreground hover:text-primary"
                                      data-testid={`link-listing-${listing.id}`}
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                                {listing.lastAnalyzedAt && (
                                  <p className="text-xs text-muted-foreground">
                                    Analyzed: {new Date(listing.lastAnalyzedAt).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="text-center py-3 px-2">
                            <div className="flex justify-center">
                              <Switch
                                checked={listing.autoAnalysisEnabled || false}
                                onCheckedChange={(checked) => handleToggleAutoAnalysis(listing, checked, { stopPropagation: () => {} } as React.MouseEvent)}
                                onClick={(e) => e.stopPropagation()}
                                data-testid={`switch-auto-analysis-${listing.id}`}
                              />
                            </div>
                          </td>
                          <td className="text-center py-3 px-2">
                            <div className="flex justify-center">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHistoryListingId(listing.id);
                                  setHistoryListingName(listing.name);
                                  setShowHistorySheet(true);
                                }}
                                data-testid={`button-history-${listing.id}`}
                              >
                                <TrendingUp className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                          <td className="text-center py-3 px-2">
                            <div className="flex justify-center">
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={(e) => handleAnalyze(listing, e)}
                                disabled={isListingAnalyzing(listing.id)}
                                data-testid={`button-analyze-${listing.id}`}
                                className="border-purple-500/50 hover:border-purple-500 hover:bg-purple-500/10"
                              >
                                {isListingAnalyzing(listing.id) ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Sparkles className="w-4 h-4 text-purple-500" />
                                )}
                              </Button>
                            </div>
                          </td>
                          {categories.map((cat) => (
                            <td key={cat.key} className="text-center py-3 px-2">
                              <div className="flex justify-center">
                                <GradeBadge 
                                  grade={getGradeForCategory(listing.analysis, cat.key) as any}
                                  size="md"
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
            {listings && listings.length > 0 && (
              <div className="flex justify-end pt-4 text-sm text-muted-foreground">
                Scroll right to see all categories
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AnalysisHistorySheet
        isOpen={showHistorySheet}
        onClose={() => {
          setShowHistorySheet(false);
          setHistoryListingId(null);
        }}
        listingId={historyListingId}
        listingName={historyListingName}
      />
    </div>
  );
}
