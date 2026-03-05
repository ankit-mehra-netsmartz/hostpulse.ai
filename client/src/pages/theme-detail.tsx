import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TagDetailSheet } from "@/components/tag-detail-sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/contexts/workspace-context";
import { 
  ArrowLeft, 
  HelpCircle, 
  Maximize2,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BarChart3,
  Building2,
  User,
  Home,
  Calendar,
  Star,
  RefreshCw,
  ExternalLink,
  Wand2,
  Loader2,
  Lightbulb,
  Check,
  X,
  Users,
  CalendarIcon,
  BookOpen,
  Sparkles,
  Send
} from "lucide-react";
import { SiNotion } from "react-icons/si";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useNotionSync } from "@/hooks/use-notion-sync";
import type { Theme, Tag, Listing, Task, Reservation, ConversationMessage, Team, Procedure } from "@shared/schema";

interface ThemeSuggestion {
  themeName: string;
  icon: string;
  description: string;
  matchingTagIds: string[];
  confidence: "high" | "medium" | "low";
  reasoning: string;
}
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface TagWithListing extends Tag {
  listing?: Listing;
  reservation?: Reservation;
}

interface ThemeWithTags extends Theme {
  tags: TagWithListing[];
  tagCount: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  questionCount: number;
}

const sentimentConfig = {
  positive: { label: "Positive", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", barColor: "bg-green-400" },
  negative: { label: "Negative", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", barColor: "bg-red-400" },
  neutral: { label: "Neutral", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", barColor: "bg-amber-400" },
  question: { label: "Question", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", barColor: "bg-blue-400" },
};

interface ChartDataPoint {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
  question: number;
}

interface ChartResponse {
  chartData: ChartDataPoint[];
  listings: { id: string; name: string }[];
}

interface WorkspaceMemberWithUser {
  id: string;
  userId: string | null;
  workspaceId: string;
  role: string;
  status: string;
  invitedEmail: string | null;
  user?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    profileImageUrl?: string;
  };
}

export default function ThemeDetail() {
  const [, params] = useRoute("/themes/:id");
  const [, navigate] = useLocation();
  const themeId = params?.id;
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();

  const [searchQuery, setSearchQuery] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("90");
  const [visibleSentiments, setVisibleSentiments] = useState<Set<string>>(new Set(["positive", "negative", "neutral", "question"]));
  const [chartPropertyFilter, setChartPropertyFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [selectedTag, setSelectedTag] = useState<TagWithListing | null>(null);
  const [tagSheetOpen, setTagSheetOpen] = useState(false);
  const [showAllProperties, setShowAllProperties] = useState(false);
  const [themeSuggestions, setThemeSuggestions] = useState<ThemeSuggestion[]>([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [noSuggestionsMessage, setNoSuggestionsMessage] = useState<string | null>(null);
  const { toast } = useToast();
  const { canSync, syncToNotion, isSyncing } = useNotionSync();
  
  // Ad-hoc task dialog state
  const [adHocDialogOpen, setAdHocDialogOpen] = useState(false);
  const [adHocTaskTitle, setAdHocTaskTitle] = useState("");
  const [adHocTaskDescription, setAdHocTaskDescription] = useState("");
  const [adHocAssignmentType, setAdHocAssignmentType] = useState<"team" | "member">("member");
  const [adHocSelectedAssigneeId, setAdHocSelectedAssigneeId] = useState<string>("");
  const [adHocPriority, setAdHocPriority] = useState("medium");
  const [adHocDueDate, setAdHocDueDate] = useState<Date | undefined>(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const [adHocSelectedProcedureId, setAdHocSelectedProcedureId] = useState<string>("");
  
  // Reset ad-hoc dialog state when it closes
  useEffect(() => {
    if (!adHocDialogOpen) {
      setAdHocTaskTitle("");
      setAdHocTaskDescription("");
      setAdHocAssignmentType("member");
      setAdHocSelectedAssigneeId("");
      setAdHocPriority("medium");
      setAdHocDueDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      setAdHocSelectedProcedureId("");
    }
  }, [adHocDialogOpen]);

  const { data: theme, isLoading } = useQuery<ThemeWithTags>({
    queryKey: ["/api/themes", themeId],
    enabled: !!themeId,
  });

  const { data: listings = [] } = useQuery<Listing[]>({
    queryKey: ["/api/listings"],
  });
  
  // Fetch workspace members for ad-hoc task
  const { data: workspaceMembers = [] } = useQuery<WorkspaceMemberWithUser[]>({
    queryKey: ["/api/workspaces", activeWorkspace?.id, "members"],
    enabled: !!activeWorkspace?.id && adHocDialogOpen,
  });
  
  // Fetch teams for ad-hoc task
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/workspaces", activeWorkspace?.id, "teams"],
    enabled: !!activeWorkspace?.id && adHocDialogOpen,
  });
  
  // Fetch procedures for ad-hoc task
  const { data: procedures = [] } = useQuery<Procedure[]>({
    queryKey: ["/api/procedures"],
    enabled: !!activeWorkspace?.id && adHocDialogOpen,
  });
  
  // Filter to only active procedures
  const activeProcedures = procedures.filter(p => p.status === "active");

  const { data: chartResponse, isLoading: chartLoading } = useQuery<ChartResponse>({
    queryKey: ["/api/tags/chart-data", themeId, chartPropertyFilter, dateFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (themeId) params.set("themeId", themeId);
      if (chartPropertyFilter !== "all") params.set("listingId", chartPropertyFilter);
      params.set("days", dateFilter);
      const response = await fetch(`/api/tags/chart-data?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch chart data");
      return response.json();
    },
    enabled: !!themeId,
  });

  const createTaskMutation = useMutation({
    mutationFn: async (taskData: { title: string; description?: string; themeId: string }) => {
      return apiRequest("POST", "/api/tasks", taskData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes", themeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const generateSummaryMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/themes/${themeId}/generate-summary`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes", themeId] });
    },
  });

  // AI-powered theme suggestion from Unassigned tags
  const suggestThemesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/themes/suggest-from-unassigned");
      return res.json();
    },
    onSuccess: (data) => {
      setHasAnalyzed(true);
      setThemeSuggestions(data.suggestions || []);
      if (data.suggestions?.length > 0) {
        setNoSuggestionsMessage(null);
        toast({
          title: "Theme Suggestions Ready",
          description: `Found ${data.suggestions.length} potential theme(s) from ${data.unassignedTagCount} unassigned tags.`,
        });
      } else {
        const message = data.message || "No clear patterns found. Tags may be too diverse or there aren't enough similar tags to form new themes.";
        setNoSuggestionsMessage(message);
        toast({
          title: "No Suggestions",
          description: message,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Create theme from suggestion
  const createThemeFromSuggestionMutation = useMutation({
    mutationFn: async (suggestion: ThemeSuggestion) => {
      const res = await apiRequest("POST", "/api/themes/create-from-suggestion", {
        themeName: suggestion.themeName,
        icon: suggestion.icon,
        description: suggestion.description,
        tagIds: suggestion.matchingTagIds,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/themes", themeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/themes/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      toast({
        title: "Theme Created",
        description: `Created "${data.theme.name}" with ${data.tagsReassigned} tags reassigned.`,
      });
      // Remove this suggestion from the list
      setThemeSuggestions(prev => prev.filter(s => s.themeName !== data.theme.name));
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Create Theme",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Helper function to get member display name
  const getMemberDisplayName = (member: WorkspaceMemberWithUser) => {
    if (member.user?.firstName || member.user?.lastName) {
      return `${member.user.firstName || ""} ${member.user.lastName || ""}`.trim();
    }
    return member.user?.email || member.invitedEmail || "Unknown";
  };
  
  // Helper function to get assignee name for ad-hoc task
  const getAdHocAssigneeName = () => {
    if (adHocAssignmentType === "member" && adHocSelectedAssigneeId) {
      const member = workspaceMembers.find(m => m.id === adHocSelectedAssigneeId);
      return member ? getMemberDisplayName(member) : null;
    } else if (adHocAssignmentType === "team" && adHocSelectedAssigneeId) {
      const team = teams.find(t => t.id === adHocSelectedAssigneeId);
      return team?.name || null;
    }
    return null;
  };
  
  // Ad-hoc task creation mutation
  const createAdHocTaskMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/tasks", {
        title: adHocTaskTitle,
        description: adHocTaskDescription,
        priority: adHocPriority,
        status: "pending",
        themeId: themeId,
        dueDate: adHocDueDate?.toISOString(),
        assigneeType: adHocAssignmentType,
        assigneeId: adHocSelectedAssigneeId || null,
        assigneeName: getAdHocAssigneeName() || null,
      });
      
      const createdTask = await response.json();
      
      // If a procedure was selected, assign it to the task
      if (adHocSelectedProcedureId && createdTask?.id) {
        try {
          await apiRequest("POST", `/api/tasks/${createdTask.id}/procedure`, {
            procedureId: adHocSelectedProcedureId,
          });
        } catch (error) {
          console.error("Failed to assign procedure:", error);
        }
      }
      
      return createdTask;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes", themeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task Created",
        description: adHocSelectedProcedureId 
          ? "The task has been added with the attached procedure." 
          : "The task has been added to your pending tasks.",
      });
      // Reset and close dialog
      setAdHocDialogOpen(false);
      setAdHocTaskTitle("");
      setAdHocTaskDescription("");
      setAdHocSelectedProcedureId("");
      setAdHocPriority("medium");
      setAdHocDueDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create task.",
        variant: "destructive",
      });
    },
  });

  const isUnassignedTheme = theme?.name === "Unassigned";
  const activeSuggestions = themeSuggestions.filter(s => !dismissedSuggestions.has(s.themeName));

  // Query for selected tag's full data including reservation
  const { data: tagWithReservation } = useQuery<TagWithListing & { reservation?: Reservation }>({
    queryKey: ["/api/tags", selectedTag?.id],
    enabled: !!selectedTag?.id && tagSheetOpen,
  });

  if (isLoading || !theme) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalSentiment = theme.positiveCount + theme.negativeCount + theme.neutralCount + (theme.questionCount || 0);
  const positivePercent = totalSentiment > 0 ? (theme.positiveCount / totalSentiment) * 100 : 0;
  const negativePercent = totalSentiment > 0 ? (theme.negativeCount / totalSentiment) * 100 : 0;
  const neutralPercent = totalSentiment > 0 ? (theme.neutralCount / totalSentiment) * 100 : 0;
  const questionPercent = totalSentiment > 0 ? ((theme.questionCount || 0) / totalSentiment) * 100 : 0;

  const dominantSentiment = ((): keyof typeof sentimentConfig => {
    const counts = [
      { type: "negative" as const, count: theme.negativeCount },
      { type: "positive" as const, count: theme.positiveCount },
      { type: "neutral" as const, count: theme.neutralCount },
      { type: "question" as const, count: theme.questionCount || 0 },
    ];
    return counts.reduce((a, b) => b.count > a.count ? b : a).type;
  })();

  // Get unique task recommendations from tags
  const taskRecommendations = theme.tags
    .filter(tag => tag.suggestedTaskTitle && !tag.suggestedTaskTitle.includes("null"))
    .reduce((acc, tag) => {
      if (!acc.find(t => t.title === tag.suggestedTaskTitle)) {
        acc.push({
          title: tag.suggestedTaskTitle!,
          description: tag.suggestedTaskDescription || undefined,
          tagId: tag.id,
        });
      }
      return acc;
    }, [] as { title: string; description?: string; tagId: string }[])
    .slice(0, 5);

  // Get unique reservations count
  const uniqueReservations = new Set(theme.tags.map(t => t.reservationId).filter(Boolean)).size;

  // Get unique properties affected with their listings
  const affectedPropertyIds = Array.from(new Set(theme.tags.map(t => t.listingId).filter(Boolean)));
  const affectedProperties = affectedPropertyIds
    .map(id => listings.find(l => l.id === id))
    .filter((l): l is Listing => !!l);
  const displayedProperties = showAllProperties ? affectedProperties : affectedProperties.slice(0, 4);

  // Handle tag click
  const handleTagClick = (tag: TagWithListing) => {
    setSelectedTag(tag);
    setTagSheetOpen(true);
  };

  // Filter tags
  const filteredTags = theme.tags.filter(tag => {
    const matchesSearch = searchQuery === "" || 
      tag.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tag.summary?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesProperty = propertyFilter === "all" || tag.listingId === propertyFilter;
    const matchesSentiment = sentimentFilter === "all" || tag.sentiment === sentimentFilter;
    
    // Date filter
    const tagDate = tag.createdAt ? new Date(tag.createdAt) : null;
    const daysAgo = parseInt(dateFilter);
    const cutoffDate = subDays(new Date(), daysAgo);
    const matchesDate = !tagDate || tagDate >= cutoffDate;
    
    return matchesSearch && matchesProperty && matchesSentiment && matchesDate;
  });

  // Pagination
  const totalPages = Math.ceil(filteredTags.length / pageSize);
  const paginatedTags = filteredTags.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleCreateTask = (title: string, description?: string) => {
    createTaskMutation.mutate({
      title,
      description,
      themeId: theme.id,
    });
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="w-full space-y-6">
        {/* Header */}
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate("/themes")}
              data-testid="button-back-themes"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {theme.icon && <span className="text-xl">{theme.icon}</span>}
                <h1 className="text-xl font-bold">{theme.name}</h1>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {theme.summary || (theme.tagCount >= 5 
                  ? `AI summary pending - click Generate to create insights`
                  : `Collecting insights... ${5 - theme.tagCount} more tags needed for AI summary`)}
              </p>
              {theme.tagCount >= 5 && (
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => generateSummaryMutation.mutate()}
                    disabled={generateSummaryMutation.isPending}
                    data-testid="button-regenerate-summary"
                  >
                    <Sparkles className={`w-3 h-3 mr-1 ${generateSummaryMutation.isPending ? 'animate-pulse' : ''}`} />
                    {generateSummaryMutation.isPending ? 'Generating...' : (theme.summary ? 'Regenerate AI Insights' : 'Generate AI Insights')}
                  </Button>
                  {theme.summaryGeneratedAt && (
                    <span className="text-xs text-muted-foreground" data-testid="text-summary-date">
                      Last generated: {format(new Date(theme.summaryGeneratedAt), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* AI Theme Suggestions for Unassigned Theme */}
        {isUnassignedTheme && theme.tagCount >= 5 && (
          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10" data-testid="card-ai-suggestions">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-base">AI Theme Suggestions</CardTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => suggestThemesMutation.mutate()}
                  disabled={suggestThemesMutation.isPending}
                  data-testid="button-analyze-tags"
                >
                  {suggestThemesMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 mr-2" />
                      Analyze Tags
                    </>
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                AI can analyze your unassigned tags and suggest new themes based on common patterns.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {hasAnalyzed && activeSuggestions.length === 0 && noSuggestionsMessage && (
                <div className="p-4 bg-muted/50 rounded-lg text-center" data-testid="no-suggestions-message">
                  <p className="text-sm text-muted-foreground">{noSuggestionsMessage}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Try again later when more tags have accumulated, or manually review tags to identify patterns.
                  </p>
                </div>
              )}
              {activeSuggestions.map((suggestion, index) => (
                  <div 
                    key={suggestion.themeName} 
                    className="p-4 bg-background rounded-lg border space-y-2"
                    data-testid={`suggestion-${index}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{suggestion.icon}</span>
                        <div>
                          <h4 className="font-medium">{suggestion.themeName}</h4>
                          <p className="text-sm text-muted-foreground">{suggestion.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge 
                          variant="secondary" 
                          className={
                            suggestion.confidence === "high" 
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : suggestion.confidence === "medium"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
                          }
                        >
                          {suggestion.confidence}
                        </Badge>
                        <Badge variant="outline">{suggestion.matchingTagIds.length} tags</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{suggestion.reasoning}</p>
                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={() => createThemeFromSuggestionMutation.mutate(suggestion)}
                        disabled={createThemeFromSuggestionMutation.isPending}
                        data-testid={`button-create-theme-${index}`}
                      >
                        {createThemeFromSuggestionMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4 mr-1" />
                        )}
                        Create Theme
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDismissedSuggestions(prev => new Set([...Array.from(prev), suggestion.themeName]))}
                        data-testid={`button-dismiss-${index}`}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        )}

        {/* Theme Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Theme overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Overall tag sentiment:</span>
              <Badge className={sentimentConfig[dominantSentiment].color}>
                {sentimentConfig[dominantSentiment].label}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Reservations</p>
                <p className="text-2xl font-bold">{uniqueReservations}</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Tags</p>
                <p className="text-2xl font-bold">{theme.tagCount}</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Properties Affected</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex -space-x-2">
                    {displayedProperties.map((listing) => (
                      <div 
                        key={listing.id} 
                        className="w-8 h-8 rounded-full border-2 border-background overflow-hidden bg-muted"
                        title={listing.name}
                      >
                        {listing.imageUrl ? (
                          <img 
                            src={listing.imageUrl} 
                            alt={listing.name} 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Home className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <span className="text-lg font-bold">{affectedProperties.length}</span>
                  {affectedProperties.length > 4 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 text-primary"
                      onClick={() => setShowAllProperties(!showAllProperties)}
                      data-testid="button-toggle-properties"
                    >
                      {showAllProperties ? "Show less" : `+${affectedProperties.length - 4} more`}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Sentiment Bar */}
            <div className="space-y-2">
              <div className="flex h-3 rounded-full overflow-hidden">
                <div 
                  className="bg-green-400" 
                  style={{ width: `${positivePercent}%` }}
                />
                <div 
                  className="bg-red-400" 
                  style={{ width: `${negativePercent}%` }}
                />
                <div 
                  className="bg-amber-400" 
                  style={{ width: `${neutralPercent}%` }}
                />
                <div 
                  className="bg-blue-400" 
                  style={{ width: `${questionPercent}%` }}
                />
              </div>
              <div className="flex items-center gap-4 text-xs flex-wrap">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span>Positive ({theme.positiveCount})</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <span>Negative ({theme.negativeCount})</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Neutral ({theme.neutralCount})</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                  <span>Question ({theme.questionCount || 0})</span>
                </div>
              </div>
            </div>

          </CardContent>
        </Card>

        {/* Task Recommendations */}
        {taskRecommendations.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs">?</span>
                Task Recommendations
              </CardTitle>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setAdHocDialogOpen(true)}
                data-testid="button-create-adhoc-task"
              >
                <Plus className="w-3 h-3 mr-1" />
                Create Ad-Hoc Task
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {taskRecommendations.map((task, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b last:border-0">
                    <p className="text-sm">{task.title}</p>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-primary h-auto"
                      onClick={() => handleCreateTask(task.title, task.description)}
                      disabled={createTaskMutation.isPending}
                      data-testid={`button-create-task-${idx}`}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Create task
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* History Chart */}
        <Card data-testid="card-tag-history-chart">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                History of Tags
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-32" data-testid="select-history-range">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="60">Last 60 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                    <SelectItem value="180">Last 180 days</SelectItem>
                    <SelectItem value="365">Last year</SelectItem>
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-36 justify-between" data-testid="button-chart-sentiment-filter">
                      <span className="truncate">
                        {visibleSentiments.size === 4 ? "All Sentiments" : `${visibleSentiments.size} Selected`}
                      </span>
                      <ChevronDown className="w-4 h-4 ml-1 shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuCheckboxItem
                      checked={visibleSentiments.has("positive")}
                      onCheckedChange={(checked) => {
                        const newSet = new Set(visibleSentiments);
                        if (checked) newSet.add("positive");
                        else newSet.delete("positive");
                        setVisibleSentiments(newSet);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                        Positive
                      </div>
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={visibleSentiments.has("negative")}
                      onCheckedChange={(checked) => {
                        const newSet = new Set(visibleSentiments);
                        if (checked) newSet.add("negative");
                        else newSet.delete("negative");
                        setVisibleSentiments(newSet);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        Negative
                      </div>
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={visibleSentiments.has("neutral")}
                      onCheckedChange={(checked) => {
                        const newSet = new Set(visibleSentiments);
                        if (checked) newSet.add("neutral");
                        else newSet.delete("neutral");
                        setVisibleSentiments(newSet);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                        Neutral
                      </div>
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={visibleSentiments.has("question")}
                      onCheckedChange={(checked) => {
                        const newSet = new Set(visibleSentiments);
                        if (checked) newSet.add("question");
                        else newSet.delete("question");
                        setVisibleSentiments(newSet);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        Question
                      </div>
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Select value={chartPropertyFilter} onValueChange={setChartPropertyFilter}>
                  <SelectTrigger className="w-44" data-testid="select-chart-property">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      <SelectValue placeholder="All Properties" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Properties</SelectItem>
                    {chartResponse?.listings.map((listing) => (
                      <SelectItem key={listing.id} value={listing.id}>
                        {listing.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Tags grouped by guest check-in date (for this theme)
            </p>
          </CardHeader>
          <CardContent>
            {chartLoading ? (
              <div className="h-[300px] flex items-center justify-center">
                <Skeleton className="w-full h-full" />
              </div>
            ) : !chartResponse?.chartData.length ? (
              <div className="h-[300px] flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No tag data available for this theme</p>
                </div>
              </div>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartResponse.chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(value) => format(new Date(value), "MMM d")}
                      tick={{ fontSize: 12 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip 
                      labelFormatter={(value) => format(new Date(value), "MMMM d, yyyy")}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Legend 
                      onClick={(e) => {
                        const sentiment = e.dataKey as string;
                        const newSet = new Set(visibleSentiments);
                        if (newSet.has(sentiment)) {
                          newSet.delete(sentiment);
                        } else {
                          newSet.add(sentiment);
                        }
                        setVisibleSentiments(newSet);
                      }}
                      wrapperStyle={{ cursor: "pointer" }}
                      formatter={(value, entry) => {
                        const isActive = visibleSentiments.has(entry.dataKey as string);
                        return <span style={{ color: isActive ? undefined : "#9ca3af", opacity: isActive ? 1 : 0.5 }}>{value}</span>;
                      }}
                    />
                    <Bar 
                      dataKey="positive" 
                      name="Positive" 
                      stackId="a" 
                      fill="#22c55e"
                      hide={!visibleSentiments.has("positive")}
                    />
                    <Bar 
                      dataKey="neutral" 
                      name="Neutral" 
                      stackId="a" 
                      fill="#eab308"
                      hide={!visibleSentiments.has("neutral")}
                    />
                    <Bar 
                      dataKey="negative" 
                      name="Negative" 
                      stackId="a" 
                      fill="#ef4444"
                      hide={!visibleSentiments.has("negative")}
                    />
                    <Bar 
                      dataKey="question" 
                      name="Question" 
                      stackId="a" 
                      fill="#3b82f6"
                      hide={!visibleSentiments.has("question")}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tags in this theme */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tags in this theme</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 max-w-xs relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-tags"
                />
              </div>
              <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                <SelectTrigger className="w-40" data-testid="select-property-filter">
                  <SelectValue placeholder="All Properties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Properties</SelectItem>
                  {listings.map(listing => (
                    <SelectItem key={listing.id} value={listing.id}>
                      {listing.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
                <SelectTrigger className="w-32" data-testid="select-sentiment-filter">
                  <SelectValue placeholder="Sentiment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="positive">Positive</SelectItem>
                  <SelectItem value="negative">Negative</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="question">Question</SelectItem>
                </SelectContent>
              </Select>
              {canSync && filteredTags.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const tagIds = filteredTags.map(t => t.id);
                    syncToNotion(tagIds);
                  }}
                  disabled={isSyncing}
                  data-testid="button-sync-all-to-notion"
                >
                  {isSyncing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <SiNotion className="w-4 h-4 mr-2" />
                  )}
                  Sync {filteredTags.length} to Notion
                </Button>
              )}
            </div>

            {/* Tags Table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Tag name</TableHead>
                    <TableHead>Sentiment</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Task</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTags.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No tags found matching your filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedTags.map((tag) => {
                      const listing = listings.find(l => l.id === tag.listingId);
                      return (
                        <TableRow 
                          key={tag.id} 
                          className="cursor-pointer hover-elevate"
                          onClick={() => handleTagClick(tag)}
                          data-testid={`row-tag-${tag.id}`}
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium text-primary">{tag.name}</p>
                              {tag.summary && (
                                <p className="text-xs text-muted-foreground line-clamp-1">{tag.summary}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={sentimentConfig[tag.sentiment as keyof typeof sentimentConfig]?.color || sentimentConfig.neutral.color}>
                              {tag.sentiment || "neutral"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {tag.createdAt ? format(new Date(tag.createdAt), "MMM d, yyyy") : "-"}
                          </TableCell>
                          <TableCell className="text-sm">Airbnb</TableCell>
                          <TableCell className="text-sm">
                            {listing?.name || "-"}
                          </TableCell>
                          <TableCell>
                            {tag.suggestedTaskTitle && (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="text-primary h-auto p-0"
                                onClick={() => handleCreateTask(tag.suggestedTaskTitle!, tag.suggestedTaskDescription || undefined)}
                                data-testid={`button-create-task-tag-${tag.id}`}
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Create task
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Show</span>
                <Select value={String(pageSize)} onValueChange={() => {}}>
                  <SelectTrigger className="w-16" data-testid="select-page-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
                <span>of {filteredTags.length} tags</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm">
                  Page {currentPage} of {totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tag Investigation Side Sheet */}
      <TagDetailSheet
        open={tagSheetOpen}
        onOpenChange={setTagSheetOpen}
        tag={tagWithReservation || selectedTag}
        listing={selectedTag?.listing}
        reservation={tagWithReservation?.reservation}
        relatedTags={theme?.tags.filter(t => t.reservationId === selectedTag?.reservationId)}
      />
      
      {/* Ad-Hoc Task Creation Dialog */}
      <Dialog open={adHocDialogOpen} onOpenChange={setAdHocDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Create Ad-Hoc Task
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {/* Title */}
            <div>
              <Label className="text-sm text-muted-foreground mb-1.5 block">Task Title</Label>
              <Input
                value={adHocTaskTitle}
                onChange={(e) => setAdHocTaskTitle(e.target.value)}
                placeholder="Enter task title..."
                data-testid="input-adhoc-task-title"
              />
            </div>
            
            {/* Assignment Type */}
            <div>
              <Label className="text-sm text-muted-foreground mb-1.5 block">Assign to</Label>
              <RadioGroup
                value={adHocAssignmentType}
                onValueChange={(value) => {
                  setAdHocAssignmentType(value as "team" | "member");
                  setAdHocSelectedAssigneeId("");
                }}
                className="flex gap-4 mb-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="member" id="adhoc-member" />
                  <Label htmlFor="adhoc-member" className="flex items-center gap-1 text-sm">
                    <User className="w-4 h-4" />
                    Member
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="team" id="adhoc-team" />
                  <Label htmlFor="adhoc-team" className="flex items-center gap-1 text-sm">
                    <Users className="w-4 h-4" />
                    Team
                  </Label>
                </div>
              </RadioGroup>
              
              <Select 
                value={adHocSelectedAssigneeId} 
                onValueChange={setAdHocSelectedAssigneeId}
              >
                <SelectTrigger data-testid="select-adhoc-assignee">
                  <SelectValue placeholder={adHocAssignmentType === "team" ? "Select team" : "Select member"} />
                </SelectTrigger>
                <SelectContent>
                  {adHocAssignmentType === "member" ? (
                    workspaceMembers.length > 0 ? (
                      workspaceMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {getMemberDisplayName(member)}
                          {member.userId === user?.id && " (You)"}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="loading" disabled>Loading members...</SelectItem>
                    )
                  ) : (
                    teams.length > 0 ? (
                      teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-teams" disabled>No teams available</SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            
            {/* Priority and Due Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm text-muted-foreground mb-1.5 block">Priority</Label>
                <Select value={adHocPriority} onValueChange={setAdHocPriority}>
                  <SelectTrigger data-testid="select-adhoc-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground mb-1.5 block">Due date</Label>
                <Popover modal={true}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      data-testid="button-adhoc-due-date"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {adHocDueDate ? format(adHocDueDate, "MMM d, yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[100]" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={adHocDueDate}
                      onSelect={setAdHocDueDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            
            {/* Description */}
            <div>
              <Label className="text-sm text-muted-foreground mb-1.5 block">Description</Label>
              <Textarea
                value={adHocTaskDescription}
                onChange={(e) => setAdHocTaskDescription(e.target.value)}
                placeholder="Input task instructions..."
                className="resize-none"
                rows={3}
                maxLength={250}
                data-testid="textarea-adhoc-task-description"
              />
              <p className="text-xs text-muted-foreground text-right mt-1">
                {adHocTaskDescription.length}/250
              </p>
            </div>
            
            {/* Optional Procedure Assignment */}
            {activeProcedures.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                  <Label className="text-sm text-muted-foreground">Attach Procedure</Label>
                  <span className="text-xs text-muted-foreground/70">(optional)</span>
                </div>
                <Select 
                  value={adHocSelectedProcedureId} 
                  onValueChange={(value) => setAdHocSelectedProcedureId(value === "none" ? "" : value)}
                >
                  <SelectTrigger 
                    className="text-sm"
                    data-testid="select-adhoc-procedure"
                  >
                    <SelectValue placeholder="No procedure" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No procedure</SelectItem>
                    {activeProcedures.map((procedure) => (
                      <SelectItem key={procedure.id} value={procedure.id}>
                        {procedure.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {/* Create Button */}
            <Button
              className="w-full"
              onClick={() => createAdHocTaskMutation.mutate()}
              disabled={!adHocTaskTitle || createAdHocTaskMutation.isPending}
              data-testid="button-submit-adhoc-task"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {createAdHocTaskMutation.isPending ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
