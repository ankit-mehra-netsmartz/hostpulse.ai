import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useSearch, useLocation } from "wouter";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { GradeBadge } from "@/components/grade-badge";
import { ReservationDetailSheet } from "@/components/reservation-detail-sheet";
import { PhotoAnalysisSheet } from "@/components/photo-analysis-sheet";
import { PetPhotoEnhanceSheet } from "@/components/pet-photo-enhance-sheet";
import { PinnedPhotoViewer } from "@/components/pinned-photo-viewer";
import { DescriptionCompareDialog } from "@/components/description-compare-dialog";
import { IGPSpiderChart } from "@/components/igp-spider-chart";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/contexts/notifications-context";
import type { Reservation, Tag, ConversationMessage } from "@shared/schema";

const GRADE_TO_NUMERIC: Record<string, number> = {
  A: 10,
  B: 8,
  C: 6,
  D: 4,
  F: 2,
};
const DEFAULT_CATEGORY_WEIGHTS: Record<string, number> = {
  title: 10,
  description: 15,
  pet: 5,
  reviews: 20,
  photos: 15,
  sleep: 10,
  host_profile: 5,
  guest_favorites: 5,
  superhost_status: 5,
  ideal_guest_profile: 10,
};
const CATEGORY_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  pet: "Pet policy",
  reviews: "Reviews",
  photos: "Photos",
  sleep: "Where you'll sleep",
  host_profile: "Host profile",
  guest_favorites: "Guest Favorites",
  superhost_status: "Superhost status",
  ideal_guest_profile: "Ideal Guest Profile",
};
function getOverallGradeBreakdown(a: ListingAnalysis | null | undefined) {
  if (!a) return null;
  const grades: Record<string, string | null> = {
    title: a.titleGrade ?? null,
    description: a.descriptionGrade ?? null,
    pet: a.petGrade ?? null,
    reviews: a.reviewsGrade ?? null,
    photos: a.photosGrade ?? null,
    sleep: a.sleepGrade ?? null,
    host_profile: a.superhostGrade ?? null,
    guest_favorites: a.guestFavGrade ?? null,
    superhost_status: a.superhostStatusGrade ?? null,
    ideal_guest_profile: a.idealGrade ?? null,
  };
  let weightedSum = 0,
    totalWeight = 0;
  const rows: {
    category: string;
    label: string;
    grade: string | null;
    weight: number;
    numeric: number | null;
    contribution: number;
  }[] = [];
  for (const [cat, weight] of Object.entries(DEFAULT_CATEGORY_WEIGHTS)) {
    const grade = grades[cat] ?? null;
    const numeric =
      grade && grade !== "N/A"
        ? (GRADE_TO_NUMERIC[grade.toUpperCase().trim()] ?? null)
        : null;
    const contribution = numeric != null && weight > 0 ? numeric * weight : 0;
    if (numeric != null && weight > 0) {
      weightedSum += contribution;
      totalWeight += weight;
    }
    rows.push({
      category: cat,
      label: CATEGORY_LABELS[cat] ?? cat,
      grade,
      weight,
      numeric: numeric ?? null,
      contribution: Math.round(contribution * 10) / 10,
    });
  }
  const weightedAvg = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const score = Math.round(weightedAvg * 10) / 10;
  const letter =
    score >= 9
      ? "A"
      : score >= 7
        ? "B"
        : score >= 5
          ? "C"
          : score >= 3
            ? "D"
            : "F";
  return { rows, totalWeight, weightedSum, weightedAvg, score, letter };
}
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  Sparkles,
  Loader2,
  AlertCircle,
  RefreshCw,
  PawPrint,
  Star,
  Image,
  MessageSquare,
  Heart,
  Type,
  Moon,
  Award,
  FileText,
  Target,
  Users,
  Calendar,
  MapPin,
  Plane,
  Lightbulb,
  Dog,
  PartyPopper,
  Briefcase,
  Baby,
  Trophy,
  Tent,
  Home,
  GraduationCap,
  Bike,
  Camera,
  Search,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  Info,
  Check,
  CheckCircle,
  Pin,
  PinOff,
  ArrowRight,
  Layout,
  Key,
  BookOpen,
  ClipboardList,
  Navigation,
  Wifi,
  Crown,
  Bed,
  UserCircle,
  Download,
  ScanLine,
} from "lucide-react";

interface ReservationWithTags extends Reservation {
  tags?: Tag[];
}
import type {
  Listing,
  ListingAnalysis,
  IdealGuestProfile,
  CategoryAnalysis,
  GuestType,
  AirbnbScan,
} from "@shared/schema";

interface ListingWithAnalysis extends Listing {
  analysis?: ListingAnalysis;
}

// Helper function to get an icon for a guest type based on keywords in the name
function getGuestTypeIcon(name: string) {
  const lowerName = name.toLowerCase();

  if (
    lowerName.includes("family") ||
    lowerName.includes("families") ||
    lowerName.includes("kid") ||
    lowerName.includes("children")
  ) {
    return <Home className="w-5 h-5 text-primary" />;
  }
  if (
    lowerName.includes("pet") ||
    lowerName.includes("dog") ||
    lowerName.includes("cat")
  ) {
    return <Dog className="w-5 h-5 text-primary" />;
  }
  if (
    lowerName.includes("wedding") ||
    lowerName.includes("party") ||
    lowerName.includes("celebration") ||
    lowerName.includes("reunion")
  ) {
    return <PartyPopper className="w-5 h-5 text-primary" />;
  }
  if (
    lowerName.includes("business") ||
    lowerName.includes("work") ||
    lowerName.includes("corporate") ||
    lowerName.includes("conference")
  ) {
    return <Briefcase className="w-5 h-5 text-primary" />;
  }
  if (
    lowerName.includes("couple") ||
    lowerName.includes("romantic") ||
    lowerName.includes("anniversary") ||
    lowerName.includes("honeymoon")
  ) {
    return <Heart className="w-5 h-5 text-primary" />;
  }
  if (
    lowerName.includes("sport") ||
    lowerName.includes("team") ||
    lowerName.includes("athlete") ||
    lowerName.includes("tournament") ||
    lowerName.includes("lacrosse") ||
    lowerName.includes("soccer") ||
    lowerName.includes("basketball")
  ) {
    return <Trophy className="w-5 h-5 text-primary" />;
  }
  if (
    lowerName.includes("adventure") ||
    lowerName.includes("outdoor") ||
    lowerName.includes("hik") ||
    lowerName.includes("camp")
  ) {
    return <Tent className="w-5 h-5 text-primary" />;
  }
  if (
    lowerName.includes("student") ||
    lowerName.includes("college") ||
    lowerName.includes("university") ||
    lowerName.includes("graduate")
  ) {
    return <GraduationCap className="w-5 h-5 text-primary" />;
  }
  if (
    lowerName.includes("remote") ||
    lowerName.includes("digital nomad") ||
    lowerName.includes("workation")
  ) {
    return <Briefcase className="w-5 h-5 text-primary" />;
  }
  if (
    lowerName.includes("vacation") ||
    lowerName.includes("leisure") ||
    lowerName.includes("getaway") ||
    lowerName.includes("retreat")
  ) {
    return <Plane className="w-5 h-5 text-primary" />;
  }
  if (lowerName.includes("group") || lowerName.includes("large")) {
    return <Users className="w-5 h-5 text-primary" />;
  }
  if (
    lowerName.includes("photo") ||
    lowerName.includes("content creator") ||
    lowerName.includes("influencer")
  ) {
    return <Camera className="w-5 h-5 text-primary" />;
  }

  // Default icon
  return <Users className="w-5 h-5 text-primary" />;
}

const categoryConfig = [
  {
    key: "photos",
    label: "Photos",
    icon: Image,
    gradeField: "photosGrade",
    analysisField: "photosAnalysis",
  },
  {
    key: "title",
    label: "Listing Title",
    icon: Type,
    gradeField: "titleGrade",
    analysisField: "titleAnalysis",
  },
  {
    key: "reviews",
    label: "Reviews",
    icon: MessageSquare,
    gradeField: "reviewsGrade",
    analysisField: "reviewsAnalysis",
  },
  {
    key: "pet",
    label: "Pet Friendly",
    icon: PawPrint,
    gradeField: "petGrade",
    analysisField: "petAnalysis",
  },
  {
    key: "description",
    label: "Listing Description",
    icon: FileText,
    gradeField: "descriptionGrade",
    analysisField: "descriptionAnalysis",
  },
  {
    key: "sleep",
    label: "Where You'll Sleep",
    icon: Moon,
    gradeField: "sleepGrade",
    analysisField: "sleepAnalysis",
  },
  {
    key: "superhost",
    label: "Host Profile",
    icon: Star,
    gradeField: "superhostGrade",
    analysisField: "superhostAnalysis",
  },
  {
    key: "guestFav",
    label: "Guest Favorites",
    icon: Heart,
    gradeField: "guestFavGrade",
    analysisField: "guestFavAnalysis",
  },
  {
    key: "superhostStatus",
    label: "Superhost",
    icon: Award,
    gradeField: "superhostStatusGrade",
    analysisField: "superhostStatusAnalysis",
  },
  {
    key: "ideal",
    label: "Ideal Guest Profile Aligned",
    icon: Target,
    gradeField: "idealGrade",
    analysisField: "idealAnalysis",
  },
];

const gradeFieldToSseCategory: Record<string, string> = {
  guestFavGrade: "guest_favorites",
  guestFavAnalysis: "guest_favorites",
  superhostStatusGrade: "superhost_status",
  superhostStatusAnalysis: "superhost_status",
  superhostGrade: "host_profile",
  superhostAnalysis: "host_profile",
  sleepGrade: "sleep",
  sleepAnalysis: "sleep",
  titleGrade: "title",
  titleAnalysis: "title",
  descriptionGrade: "description",
  descriptionAnalysis: "description",
  petGrade: "pet",
  petAnalysis: "pet",
  reviewsGrade: "reviews",
  reviewsAnalysis: "reviews",
  idealGrade: "ideal",
  idealAnalysis: "ideal",
};

export default function ListingDetailPage() {
  const params = useParams();
  const listingId = params.id;
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const shouldShowIdp = searchParams.get("showIdp") === "true";
  const shouldOpenPhotos = searchParams.get("openPhotos") === "true";
  const tabFromUrl = searchParams.get("tab");
  const validTabValues = [
    "overview",
    "analysis",
    "reservations",
    "tags",
    "tasks",
    "reviews",
  ] as const;
  const activeTab =
    tabFromUrl && validTabValues.includes(tabFromUrl as any)
      ? tabFromUrl
      : "overview";
  const [, setLocation] = useLocation();

  const [showIdpSheet, setShowIdpSheet] = useState(false);
  const [showScoreBreakdownSheet, setShowScoreBreakdownSheet] = useState(false);
  const [showReservationBreakdown, setShowReservationBreakdown] =
    useState(false);
  const [analysisStats, setAnalysisStats] = useState<{
    reviewCount?: number;
    conversationCount?: number;
  }>({});

  // Staged analysis state
  const [stagedAnalysisProgress, setStagedAnalysisProgress] = useState<{
    isActive: boolean;
    currentStage: string;
    stageMessage: string;
    igpResult: any | null;
    categoryResults: Record<string, any>;
    completed: boolean;
    scraperStatus: "idle" | "started" | "completed" | "failed";
    scrapedCategoriesAnalyzing: string[];
    parallelCategoriesAnalyzing: string[];
    reviewCount?: number;
    reservationCount?: number;
  }>({
    isActive: false,
    currentStage: "",
    stageMessage: "",
    igpResult: null,
    categoryResults: {},
    completed: false,
    scraperStatus: "idle",
    scrapedCategoriesAnalyzing: [],
    parallelCategoriesAnalyzing: [],
  });
  const stagedAnalysisEventSourceRef = useRef<EventSource | null>(null);
  const [isBackgroundMode, setIsBackgroundMode] = useState(false);
  const backgroundAnalysisIdRef = useRef<string | null>(null);
  const foregroundAnalysisIdRef = useRef<string | null>(null);
  const isBackgroundModeRef = useRef(false);
  // Track when an in-progress analysis is restored from localStorage after navigation
  const [isRestoredFromStorage, setIsRestoredFromStorage] = useState(false);
  const restoredStartedAtRef = useRef<number | null>(null);
  const { toast } = useToast();
  const {
    startBackgroundAnalysis,
    completeBackgroundAnalysis,
    addNotification,
    isListingAnalyzing,
    startForegroundAnalysis,
    completeForegroundAnalysis,
  } = useNotifications();

  const [selectedReservation, setSelectedReservation] =
    useState<ReservationWithTags | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const categoryDetailRef = useRef<HTMLDivElement>(null);

  // State for AI generated content
  const [generatedTitles, setGeneratedTitles] = useState<
    Array<{
      title: string;
      reasoning: string;
      charCount: number;
      pinned?: boolean;
    }>
  >([]);
  const [generatedDescription, setGeneratedDescription] = useState<{
    aboutThisSpace?: { content: string; charCount: number };
    theSpace?: { content: string; charCount: number };
    keySellingPoints?: string[];
  } | null>(null);
  const [showDescriptionCompare, setShowDescriptionCompare] = useState(false);

  // State for photo analysis sheet
  const [showPhotoAnalysis, setShowPhotoAnalysis] = useState(false);
  const [showPetPhotoEnhance, setShowPetPhotoEnhance] = useState(false);
  const [showPinnedPhotoViewer, setShowPinnedPhotoViewer] = useState(false);
  const [selectedPinnedPhoto, setSelectedPinnedPhoto] = useState<{
    photoIndex: number;
    originalUrl: string;
    enhancedUrl: string;
    prompt?: string;
  } | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(
    null,
  );
  const [isAnalyzingPhotos, setIsAnalyzingPhotos] = useState(false);
  const [photoAnalysisProgress, setPhotoAnalysisProgress] = useState(0);
  const [hasTriggeredPhotoAnalysis, setHasTriggeredPhotoAnalysis] =
    useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [overviewCategoriesExpanded, setOverviewCategoriesExpanded] =
    useState(true);

  const handleTabChange = (value: string) => {
    setLocation(`/listings/${listingId}?tab=${value}`, { replace: true });
  };
  const [reservationSearch, setReservationSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scoresClearedForRerun, setScoresClearedForRerun] = useState(false);

  // Reset photo analysis state when listingId changes
  useEffect(() => {
    setHasTriggeredPhotoAnalysis(false);
    setIsAnalyzingPhotos(false);
    setPhotoAnalysisProgress(0);
  }, [listingId]);

  // Restore analysis progress bar from localStorage when the user navigates back
  // to this listing while an analysis is still running on the server.
  useEffect(() => {
    if (!listingId) return;
    const key = `hostpulse-analysis-${listingId}`;
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return;
      const parsed = JSON.parse(stored) as { startedAt: number; previousAnalysisId: string | null };
      const AGE_LIMIT_MS = 10 * 60 * 1000; // discard entries older than 10 minutes
      if (Date.now() - parsed.startedAt > AGE_LIMIT_MS) {
        localStorage.removeItem(key);
        return;
      }
      // Only restore if an SSE-driven analysis is not already active
      setStagedAnalysisProgress((prev) => {
        if (prev.isActive) return prev;
        return {
          isActive: true,
          currentStage: "in_progress",
          stageMessage: "Analysis in progress...",
          igpResult: null,
          categoryResults: {},
          completed: false,
          scraperStatus: "idle",
          scrapedCategoriesAnalyzing: [],
          parallelCategoriesAnalyzing: [],
        };
      });
      setIsRestoredFromStorage(true);
      restoredStartedAtRef.current = parsed.startedAt;
    } catch {
      // Ignore storage errors
    }
  }, [listingId]);

  // Keep isBackgroundMode in sync with ref for use in mutation callbacks
  useEffect(() => {
    isBackgroundModeRef.current = isBackgroundMode;
  }, [isBackgroundMode]);

  // Auto-open IDP sheet if showIdp param is true
  useEffect(() => {
    if (shouldShowIdp) {
      setShowIdpSheet(true);
    }
  }, [shouldShowIdp]);

  // Auto-open Photos section if openPhotos param is true (after analysis completes)
  useEffect(() => {
    if (shouldOpenPhotos && activeTab === "analysis") {
      setSelectedCategory("photos");
    }
  }, [shouldOpenPhotos, activeTab]);

  // Track if user has closed the IDP sheet this run so we don't auto-reopen it
  const idpSheetClosedByUserRef = useRef(false);

  // Scroll to category detail when selected
  useEffect(() => {
    if (selectedCategory && categoryDetailRef.current) {
      setTimeout(() => {
        categoryDetailRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  }, [selectedCategory]);

  const {
    data: listing,
    isLoading,
    error,
    refetch,
  } = useQuery<ListingWithAnalysis>({
    queryKey: ["/api/listings", listingId],
    enabled: !!listingId,
    // Poll when we've restored an in-progress analysis from localStorage so we
    // can detect completion even without a live SSE connection.
    refetchInterval: isRestoredFromStorage ? 3000 : false,
  });

  const { data: reservations = [], isLoading: reservationsLoading } = useQuery<
    ReservationWithTags[]
  >({
    queryKey: ["/api/listings", listingId, "reservations"],
    enabled: !!listingId,
  });

  // Photo analyses query - polls every 2 seconds during batch analysis
  const { data: photoAnalyses = [] } = useQuery<any[]>({
    queryKey: ["/api/listings", listingId, "photo-analyses"],
    enabled: !!listingId,
    refetchInterval: isAnalyzingPhotos ? 2000 : false,
  });

  // Airbnb scan data query — poll every 5s while scanning
  const { data: airbnbScan } = useQuery<AirbnbScan>({
    queryKey: ["/api/listings", listingId, "airbnb-scan"],
    enabled: !!listingId,
    refetchInterval: (query) =>
      query.state.data?.status === "scanning" ? 5000 : false,
  });

  // Single-category re-run (maps UI key to API category name)
  const categoryToApiName: Record<string, string> = {
    title: "title",
    description: "description",
    pet: "pet",
    reviews: "reviews",
    sleep: "sleep",
    superhost: "host_profile",
    guestFav: "guest_favorites",
    superhostStatus: "superhost_status",
  };
  const analyzeCategoryMutation = useMutation({
    mutationFn: async (apiCategory: string) => {
      const res = await apiRequest(
        "POST",
        `/api/listings/${listingId}/analyze-category`,
        { category: apiCategory },
      );
      return res.json();
    },
    onSuccess: (_data, apiCategory) => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings", listingId] });
      toast({
        title: "Category updated",
        description: `Re-ran analysis for ${apiCategory.replace(/_/g, " ")}.`,
      });
    },
    onError: (err: Error) => {
      // apiRequest throws "STATUS: bodyText" — extract just the message from JSON body if present
      let description = err.message;
      const match = err.message.match(/^\d+:\s*(\{[\s\S]*\})$/);
      if (match) {
        try {
          description = JSON.parse(match[1])?.message || description;
        } catch {}
      }
      toast({
        title: "Could not re-run category",
        description,
        variant: "destructive",
      });
    },
  });

  const markCategoryCompleteMutation = useMutation({
    mutationFn: async (category: string) => {
      if (!analysis?.id) throw new Error("No analysis found");
      const current: string[] = analysis.completedCategories ?? [];
      const updated = current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category];
      const res = await apiRequest("PATCH", `/api/analyses/${analysis.id}`, {
        completedCategories: updated,
      });
      return res.json();
    },
    onSuccess: (_data, category) => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings", listingId] });
      const current: string[] = analysis?.completedCategories ?? [];
      if (current.includes(category)) {
        toast({
          title: "Marked incomplete",
          description: "Category has been unmarked.",
        });
      } else {
        toast({
          title: "Marked as complete",
          description: "Category has been marked as complete.",
        });
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Could not update status",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Re-trigger Airbnb scan (e.g. after a failed scan)
  const rescanAirbnbMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/listings/${listingId}/airbnb-scan`,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/listings", listingId, "airbnb-scan"],
      });
      toast({
        title: "Airbnb scan started",
        description: "Re-scanning your Airbnb listing. This may take a minute.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Scan failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Phase 2 photo analysis mutation - runs after main analysis completes
  const phase2PhotoAnalysisMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/listings/${listingId}/analyze-photos`,
      );
      return res.json();
    },
    onMutate: () => {
      setIsAnalyzingPhotos(true);
      setPhotoAnalysisProgress(0);
    },
    onSuccess: async (data) => {
      setPhotoAnalysisProgress(100);
      queryClient.invalidateQueries({
        queryKey: ["/api/listings", listingId, "photo-analyses"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/listings", listingId] });

      setIsAnalyzingPhotos(false);
      toast({
        title: "Photo Analysis Complete",
        description: `Analyzed ${data.analyzed} photos with AI vision. Grade calculated.`,
      });

      // Add Phase 2 notification
      const listingPhoto = listing?.images?.[0];
      addNotification({
        type: "phase2_complete",
        title: "Photo Analysis Complete!",
        message: `"${listing?.headline || listing?.name || "Your listing"}" - Analyzed ${data.analyzed} photos with AI vision.`,
        listingId: listingId,
        listingName: listing?.headline || listing?.name,
        listingPhoto,
      });
    },
    onError: (error) => {
      setIsAnalyzingPhotos(false);
      toast({
        title: "Photo Analysis Failed",
        description: "Failed to analyze photos. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Legacy batch photo analysis mutation (kept for manual triggering)
  const batchPhotoAnalysisMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/listings/${listingId}/photos/analyze-batch`,
      );
      return res.json();
    },
    onMutate: () => {
      setIsAnalyzingPhotos(true);
      setPhotoAnalysisProgress(0);
    },
    onSuccess: async (data) => {
      setPhotoAnalysisProgress(100);
      queryClient.invalidateQueries({
        queryKey: ["/api/listings", listingId, "photo-analyses"],
      });

      const totalAnalyzed = data.analyzed + photoAnalyses.length;

      // Run Hero/Top5 selection analysis if we have 3+ photos analyzed
      if (totalAnalyzed >= 3) {
        try {
          await apiRequest(
            "POST",
            `/api/listings/${listingId}/photos/analyze-selection`,
          );
        } catch (e) {
          console.log("Selection analysis skipped or failed");
        }
      }

      // Always generate Photos grade if we have any photo analyses
      if (totalAnalyzed > 0) {
        try {
          await apiRequest(
            "POST",
            `/api/listings/${listingId}/photos/analyze-grade`,
          );
          queryClient.invalidateQueries({
            queryKey: ["/api/listings", listingId],
          });
        } catch (e) {
          console.log("Photo grade analysis skipped or failed");
        }
      }

      setIsAnalyzingPhotos(false);
      toast({
        title: "Photo Analysis Complete",
        description: `Analyzed ${data.analyzed} photos and generated grade.`,
      });
    },
    onError: (error) => {
      setIsAnalyzingPhotos(false);
      toast({
        title: "Analysis Failed",
        description: "Failed to analyze photos. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Auto-trigger Phase 2 photo analysis when landing on page with pending status
  // Also resume polling if analysis is in progress
  useEffect(() => {
    const photoAnalysisStatus = listing?.analysis?.photoAnalysisStatus;
    const totalPhotos = listing?.analysis?.photoAnalysisTotalPhotos || 0;

    // Auto-trigger Phase 2 if status is pending and there are photos to analyze
    if (
      photoAnalysisStatus === "pending" &&
      totalPhotos > 0 &&
      !isAnalyzingPhotos &&
      !hasTriggeredPhotoAnalysis &&
      !phase2PhotoAnalysisMutation.isPending
    ) {
      setHasTriggeredPhotoAnalysis(true);
      setSelectedCategory("photos");
      phase2PhotoAnalysisMutation.mutate();
    }

    // Resume polling if in progress
    if (photoAnalysisStatus === "in_progress" && !isAnalyzingPhotos) {
      setIsAnalyzingPhotos(true);
      setSelectedCategory("photos");
    }

    // Mark complete when status changes to complete
    if (photoAnalysisStatus === "complete" && isAnalyzingPhotos) {
      setIsAnalyzingPhotos(false);
    }
  }, [
    listing?.analysis?.photoAnalysisStatus,
    listing?.analysis?.photoAnalysisTotalPhotos,
    isAnalyzingPhotos,
    hasTriggeredPhotoAnalysis,
    phase2PhotoAnalysisMutation.isPending,
  ]);

  // When the analysis was restored from localStorage (no live SSE), poll the
  // listing data and update the progress bar with real grades as they arrive,
  // then close the bar when the analysis is complete.
  useEffect(() => {
    if (!isRestoredFromStorage || !listing?.analysis) return;
    const key = `hostpulse-analysis-${listingId}`;
    let stored: { startedAt: number; previousAnalysisId: string | null } | null = null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        // Entry was already cleared (e.g. by another tab); just stop showing bar
        setIsRestoredFromStorage(false);
        setStagedAnalysisProgress((prev) => ({
          ...prev,
          isActive: false,
          completed: true,
          currentStage: "complete",
          stageMessage: "Analysis complete",
        }));
        return;
      }
      stored = JSON.parse(raw);
    } catch {
      return;
    }
    const { previousAnalysisId } = stored!;
    // A new analysis record means the server created it after we started
    const isNewAnalysis = listing.analysis.id !== previousAnalysisId;
    // Still waiting for the server to create the new analysis record
    if (!isNewAnalysis) return;

    // Build a categoryResults map from the DB grades so the progress steps
    // show checkmarks and the percentage reflects real server-side completion.
    const a = listing.analysis;
    const synthesized: Record<string, any> = {};
    if (a.titleGrade) synthesized.title = { grade: a.titleGrade };
    if (a.descriptionGrade) synthesized.description = { grade: a.descriptionGrade };
    if (a.reviewsGrade) synthesized.reviews = { grade: a.reviewsGrade };
    if (a.petGrade) synthesized.pet = { grade: a.petGrade };
    if (a.sleepGrade) synthesized.sleep = { grade: a.sleepGrade };
    if (a.superhostGrade) synthesized.host_profile = { grade: a.superhostGrade };
    if (a.guestFavGrade) synthesized.guest_favorites = { grade: a.guestFavGrade };
    if (a.superhostStatusGrade) synthesized.superhost_status = { grade: a.superhostStatusGrade };

    // Core parallel-category grades indicate the main analysis phase is done
    const coreGradesDone =
      a.titleGrade != null &&
      a.reviewsGrade != null;

    if (coreGradesDone) {
      // Analysis complete — clear bar and notify
      localStorage.removeItem(key);
      setIsRestoredFromStorage(false);
      restoredStartedAtRef.current = null;
      setStagedAnalysisProgress((prev) => ({
        ...prev,
        isActive: false,
        completed: true,
        currentStage: "complete",
        stageMessage: "Analysis complete",
        igpResult: a.idealGuestProfile ?? prev.igpResult,
        categoryResults: synthesized,
      }));
      setScoresClearedForRerun(false);
      queryClient.invalidateQueries({ queryKey: ["/api/listings", listingId] });
      toast({
        title: "Analysis Complete",
        description: "Listing analysis completed successfully.",
      });
    } else {
      // Still running — update categoryResults and advance currentStage so
      // completed steps show checkmarks instead of empty circles.
      const hasIgp = a.idealGuestProfile != null;
      setStagedAnalysisProgress((prev) => ({
        ...prev,
        categoryResults: synthesized,
        igpResult: a.idealGuestProfile ?? prev.igpResult,
        currentStage: hasIgp ? "scraped" : "parallel",
        stageMessage: "Analysis in progress...",
      }));
    }
  }, [
    isRestoredFromStorage,
    listing?.analysis?.id,
    listing?.analysis?.titleGrade,
    listing?.analysis?.descriptionGrade,
    listing?.analysis?.reviewsGrade,
    listing?.analysis?.petGrade,
    listing?.analysis?.sleepGrade,
    listing?.analysis?.superhostGrade,
    listing?.analysis?.guestFavGrade,
    listing?.analysis?.superhostStatusGrade,
    listing?.analysis?.idealGrade,
    listingId,
    toast,
  ]);

  const filteredReservations = reservations.filter((reservation) => {
    const guestName = reservation.guestName || "";
    const reservationId =
      reservation.confirmationCode || reservation.externalId || "";
    const matchesSearch =
      reservationSearch === "" ||
      guestName.toLowerCase().includes(reservationSearch.toLowerCase()) ||
      reservationId.toLowerCase().includes(reservationSearch.toLowerCase());

    const matchesChannel =
      channelFilter === "all" || reservation.platform === channelFilter;
    const matchesStatus =
      statusFilter === "all" || reservation.status === statusFilter;

    return matchesSearch && matchesChannel && matchesStatus;
  });

  const uniqueChannels = Array.from(
    new Set(reservations.map((r) => r.platform)),
  );
  const uniqueStatuses = Array.from(new Set(reservations.map((r) => r.status)));

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "—";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "2-digit",
    });
  };

  const getTagColor = (sentiment?: string) => {
    switch (sentiment) {
      case "positive":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "negative":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default:
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    }
  };

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/listings/${listingId}/analyze`,
      );
      return res.json();
    },
    onMutate: () => {
      // Use existing counts from the current analysis as initial estimates
      // Access listing directly here to get latest values
      const reviewCount = listing?.analysis?.reviewCount;
      const conversationCount = listing?.analysis?.conversationCount;
      setAnalysisStats({
        reviewCount: reviewCount || undefined,
        conversationCount: conversationCount || undefined,
      });
      // Track foreground analysis in notifications context for cross-page visibility
      if (listing && listingId) {
        const analysisId = startForegroundAnalysis(
          listingId,
          listing.headline || listing.name,
        );
        foregroundAnalysisIdRef.current = analysisId;
      }
    },
    onSuccess: (data) => {
      // Update stats for the modal display
      setAnalysisStats({
        reviewCount: data.reviewsCount || 0,
        conversationCount: data.conversationCount || 0,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/listings", listingId] });
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });

      // If Airbnb scan was triggered in parallel, invalidate that query so the tab refreshes
      if (data.airbnbScanTriggered) {
        queryClient.invalidateQueries({
          queryKey: ["/api/listings", listingId, "airbnb-scan"],
        });
      }

      // If in background mode, complete the background analysis (triggers notification)
      // Use ref to get latest isBackgroundMode value since this callback may run after navigation
      if (isBackgroundModeRef.current && backgroundAnalysisIdRef.current) {
        completeBackgroundAnalysis(backgroundAnalysisIdRef.current);
        backgroundAnalysisIdRef.current = null;
        isBackgroundModeRef.current = false;
        setIsBackgroundMode(false);
      } else {
        // Phase 1 complete - notify user and auto-start Phase 2 photo analysis
        // Guard: Only trigger if not already analyzing photos
        const alreadyAnalyzing =
          isAnalyzingPhotos || phase2PhotoAnalysisMutation.isPending;

        // Get listing photo for notification
        const listingPhoto = listing?.images?.[0];

        // Add Phase 1 notification
        addNotification({
          type: "phase1_complete",
          title: "Listing Analysis - Phase 1 Complete!",
          message: `"${listing?.headline || listing?.name || "Your listing"}" analysis ready. ${data.photoAnalysisPending && data.photoAnalysisTotalPhotos > 0 ? "Starting photo analysis..." : ""}`,
          listingId: listingId,
          listingName: listing?.headline || listing?.name,
          listingPhoto,
        });

        // Auto-start Phase 2 photo analysis if there are photos to analyze and not already running
        if (
          data.photoAnalysisPending &&
          data.photoAnalysisTotalPhotos > 0 &&
          !alreadyAnalyzing
        ) {
          toast({
            title: "Phase 1 Complete",
            description: `Starting photo analysis...`,
          });
          // Open photos section to show progress
          setSelectedCategory("photos");
          // Trigger photo analysis
          setTimeout(() => {
            phase2PhotoAnalysisMutation.mutate();
          }, 500);
        }
      }

      // Legacy toast for non-background mode without photos
      if (
        !isBackgroundModeRef.current &&
        (!data.photoAnalysisPending || data.photoAnalysisTotalPhotos === 0)
      ) {
        toast({
          title: "Analysis Complete",
          description: `Analyzed ${data.reviewsCount || 0} reviews and ${data.conversationCount || 0} conversations.`,
        });
      }
    },
    onError: (error: Error) => {
      if (isBackgroundMode && backgroundAnalysisIdRef.current) {
        // Clear background analysis on error
        backgroundAnalysisIdRef.current = null;
        setIsBackgroundMode(false);
      }
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze listing",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Complete foreground analysis tracking
      if (foregroundAnalysisIdRef.current) {
        completeForegroundAnalysis(foregroundAnalysisIdRef.current);
        foregroundAnalysisIdRef.current = null;
      }
    },
  });

  // Staged analysis function using SSE for real-time progress
  const startStagedAnalysis = useCallback(() => {
    // Close existing connection if any
    if (stagedAnalysisEventSourceRef.current) {
      stagedAnalysisEventSourceRef.current.close();
    }

    // Check if listing has Airbnb URL - if so, scraper starts immediately
    const hasAirbnbUrl = !!listing?.platformIds?.airbnb;

    // Clear any previously-restored state so the fresh SSE-driven progress
    // takes over and the completion-detection effect doesn't fire prematurely.
    setIsRestoredFromStorage(false);
    restoredStartedAtRef.current = null;

    // Persist analysis start to localStorage so the progress bar can be
    // restored if the user navigates away and returns before it finishes.
    try {
      localStorage.setItem(
        `hostpulse-analysis-${listingId}`,
        JSON.stringify({
          startedAt: Date.now(),
          previousAnalysisId: listing?.analysis?.id ?? null,
        }),
      );
    } catch {
      // Ignore storage errors
    }

    idpSheetClosedByUserRef.current = false;
    setScoresClearedForRerun(true);
    queryClient.invalidateQueries({ queryKey: ["/api/listings", listingId] });
    setStagedAnalysisProgress({
      isActive: true,
      currentStage: "init",
      stageMessage: hasAirbnbUrl
        ? "Starting Airbnb data capture..."
        : "Starting staged analysis...",
      igpResult: null,
      categoryResults: {},
      completed: false,
      // Set scraper to "started" immediately if listing has Airbnb URL (optimistic update)
      scraperStatus: hasAirbnbUrl ? "started" : "idle",
      scrapedCategoriesAnalyzing: [],
      parallelCategoriesAnalyzing: [],
    });

    const eventSource = new EventSource(
      `/api/listings/${listingId}/analyze-staged-stream`,
    );
    stagedAnalysisEventSourceRef.current = eventSource;

    eventSource.addEventListener("stage", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data ?? "{}");
        if (data.stage === "scraper") {
          setStagedAnalysisProgress((prev) => ({
            ...prev,
            scraperStatus: data.status as "started" | "completed" | "failed",
            stageMessage: data.message || prev.stageMessage,
          }));
          queryClient.invalidateQueries({
            queryKey: ["/api/listings", listingId, "airbnb-scan"],
          });
          return;
        }
        const scrapedCategories = [
          "sleep",
          "host_profile",
          "guest_favorites",
          "superhost_status",
        ];
        if (
          scrapedCategories.includes(data.stage) &&
          data.status === "started"
        ) {
          setStagedAnalysisProgress((prev) => ({
            ...prev,
            scrapedCategoriesAnalyzing: [
              ...prev.scrapedCategoriesAnalyzing.filter(
                (c) => c !== data.stage,
              ),
              data.stage,
            ],
            stageMessage: data.message || `Analyzing ${data.stage}...`,
          }));
          return;
        }
        setStagedAnalysisProgress((prev) => {
          const next = {
            ...prev,
            currentStage: data.stage ?? prev.currentStage,
            stageMessage: data.message || `Running ${data.stage}...`,
            igpResult:
              (data.stage === "igp" || data.stage === "igp_final") &&
              data.status === "completed"
                ? data.data
                : prev.igpResult,
            scrapedCategoriesAnalyzing:
              scrapedCategories.includes(data.stage) &&
              data.status === "completed"
                ? prev.scrapedCategoriesAnalyzing.filter(
                    (c) => c !== data.stage,
                  )
                : prev.scrapedCategoriesAnalyzing,
          };
          if (
            data.stage === "data_fetch" &&
            data.status === "completed" &&
            data.data
          ) {
            if (typeof data.data.reviewCount === "number")
              next.reviewCount = data.data.reviewCount;
            if (typeof data.data.reservationCount === "number")
              next.reservationCount = data.data.reservationCount;
          }
          if (
            (data.stage === "igp" || data.stage === "igp_final") &&
            data.status === "completed" &&
            data.data
          ) {
            if (typeof data.data.reviewCount === "number")
              next.reviewCount = data.data.reviewCount;
            if (typeof data.data.reservationCount === "number")
              next.reservationCount = data.data.reservationCount;
          }
          return next;
        });
        if (data.stage === "igp" && data.status === "completed") {
          if (!idpSheetClosedByUserRef.current) setShowIdpSheet(true);
          toast({
            title: "Ideal Guest Profile Ready",
            description:
              "Your guest profile has been generated. View the full analysis.",
          });
        }
        if (data.stage === "igp_final" && data.status === "completed") {
          toast({
            title: "Guest Appeal Scores Updated",
            description: "Final analysis complete with all listing data.",
          });
        }
        if (data.stage === "alignment") {
          if (data.status === "started") {
            setStagedAnalysisProgress((prev) => ({
              ...prev,
              stageMessage: "Calculating alignment scores...",
            }));
          } else if (
            data.status === "completed" &&
            data.data?.alignmentScores
          ) {
            setStagedAnalysisProgress((prev) => ({
              ...prev,
              igpResult: prev.igpResult
                ? {
                    ...prev.igpResult,
                    alignmentScores: data.data.alignmentScores,
                  }
                : prev.igpResult,
            }));
            toast({
              title: "Alignment Analysis Complete",
              description: "Suitability scores calculated for each guest type.",
            });
          }
        }
      } catch (err) {
        console.error("[SSE stage]", err);
      }
    });

    eventSource.addEventListener("category", (event) => {
      let data: { category?: string; status?: string; data?: unknown };
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      const category = typeof data.category === "string" ? data.category : "";
      if (!category) return;
      const scrapedCategoryNames = [
        "sleep",
        "host_profile",
        "guest_favorites",
        "superhost_status",
      ];
      const parallelCategoryNames = ["title", "description", "pet", "reviews"];
      setStagedAnalysisProgress((prev) => {
        const prevResults =
          prev.categoryResults && typeof prev.categoryResults === "object"
            ? prev.categoryResults
            : {};
        const updated: any = {
          ...prev,
          // Only set categoryResults when we have result data (completed/skipped with data)
          ...(data.status === "completed" ||
          (data.status === "skipped" && data.data)
            ? { categoryResults: { ...prevResults, [category]: data.data } }
            : {}),
        };
        if (
          scrapedCategoryNames.includes(category) &&
          data.status === "started"
        ) {
          updated.scrapedCategoriesAnalyzing = [
            ...prev.scrapedCategoriesAnalyzing.filter((c) => c !== category),
            category,
          ];
        }
        if (
          scrapedCategoryNames.includes(category) &&
          (data.status === "completed" ||
            data.status === "skipped" ||
            data.status === "failed")
        ) {
          updated.scrapedCategoriesAnalyzing =
            prev.scrapedCategoriesAnalyzing.filter((c) => c !== category);
        }
        if (
          parallelCategoryNames.includes(category) &&
          data.status === "started"
        ) {
          updated.parallelCategoriesAnalyzing = [
            ...prev.parallelCategoriesAnalyzing.filter((c) => c !== category),
            category,
          ];
        }
        if (
          parallelCategoryNames.includes(category) &&
          (data.status === "completed" || data.status === "failed")
        ) {
          updated.parallelCategoriesAnalyzing =
            prev.parallelCategoriesAnalyzing.filter((c) => c !== category);
        }
        return updated;
      });
      // Do not invalidate listing on every category event - UI reads from categoryResults in real time; we invalidate once on "complete"
    });

    eventSource.addEventListener("complete", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data ?? "{}");
        setStagedAnalysisProgress((prev) => ({
          ...prev,
          isActive: false,
          completed: true,
          currentStage: "complete",
          stageMessage: "Analysis complete",
        }));
        eventSource.close();
        stagedAnalysisEventSourceRef.current = null;
        setScoresClearedForRerun(false);
        // Clear localStorage entry — analysis completed normally via SSE
        try { localStorage.removeItem(`hostpulse-analysis-${listingId}`); } catch {}
        setIsRestoredFromStorage(false);
        queryClient.invalidateQueries({
          queryKey: ["/api/listings", listingId],
        });
        if (data.photosPending) {
          setTimeout(() => phase2PhotoAnalysisMutation.mutate(), 500);
        }
        toast({
          title: "Analysis Complete",
          description: "Listing analysis completed successfully.",
        });
      } catch (err) {
        console.error("[SSE complete]", err);
        setStagedAnalysisProgress((prev) => ({
          ...prev,
          isActive: false,
          completed: true,
          currentStage: "complete",
          stageMessage: "Analysis complete",
        }));
        eventSource.close();
        stagedAnalysisEventSourceRef.current = null;
        try { localStorage.removeItem(`hostpulse-analysis-${listingId}`); } catch {}
        setIsRestoredFromStorage(false);
      }
    });

    eventSource.addEventListener("error", (event) => {
      let errorMessage = "Connection lost during analysis";
      let needsReconnect = false;
      try {
        const data = JSON.parse((event as MessageEvent).data);
        errorMessage = data.message || "Analysis failed";
        needsReconnect = data.needsReconnect === true;
      } catch {}

      toast({
        title: needsReconnect
          ? "Hospitable Connection Required"
          : "Analysis Error",
        description: errorMessage,
        variant: "destructive",
      });

      setStagedAnalysisProgress((prev) => ({
        ...prev,
        isActive: false,
        currentStage: "error",
        stageMessage: needsReconnect
          ? "Hospitable connection expired"
          : "Analysis failed",
      }));

      // Clear localStorage entry — analysis ended (even with error)
      try { localStorage.removeItem(`hostpulse-analysis-${listingId}`); } catch {}
      setIsRestoredFromStorage(false);
      eventSource.close();
      stagedAnalysisEventSourceRef.current = null;
    });
  }, [
    listingId,
    toast,
    phase2PhotoAnalysisMutation,
    listing?.platformIds?.airbnb,
    listing?.analysis?.id,
  ]);

  // Auto-start staged analysis when navigating from Home/Listing Analysis with ?analyze=1
  const hasAutoStartedAnalyzeRef = useRef(false);
  useEffect(() => {
    const shouldAnalyze =
      searchParams.get("analyze") === "1" &&
      listingId &&
      listing &&
      !stagedAnalysisProgress.isActive;
    if (!shouldAnalyze || hasAutoStartedAnalyzeRef.current) return;
    hasAutoStartedAnalyzeRef.current = true;
    startStagedAnalysis();
    // Defer URL update so we don't replace URL in same tick as state update (can cause blank screen)
    const nextParams = new URLSearchParams(searchString);
    nextParams.delete("analyze");
    const nextSearch = nextParams.toString();
    const path = `/listings/${listingId}${nextSearch ? `?${nextSearch}` : ""}`;
    const id = setTimeout(() => setLocation(path, { replace: true }), 100);
    return () => clearTimeout(id);
  }, [
    listingId,
    listing,
    searchString,
    searchParams,
    stagedAnalysisProgress.isActive,
    startStagedAnalysis,
    setLocation,
  ]);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (stagedAnalysisEventSourceRef.current) {
        stagedAnalysisEventSourceRef.current.close();
      }
    };
  }, []);

  // Title generation mutation
  const generateTitlesMutation = useMutation({
    mutationFn: async () => {
      const pinnedTitles = generatedTitles.filter((t) => t.pinned);
      const res = await apiRequest(
        "POST",
        `/api/listings/${listingId}/generate-titles`,
        {
          pinnedTitles: pinnedTitles.map((t) => ({
            title: t.title,
            reasoning: t.reasoning,
            charCount: t.charCount,
          })),
        },
      );
      return res.json();
    },
    onSuccess: (data) => {
      const pinnedTitles = generatedTitles.filter((t) => t.pinned);
      const newTitles = (data.titles || []).map(
        (t: { title: string; reasoning: string; charCount: number }) => ({
          ...t,
          pinned: false,
        }),
      );
      setGeneratedTitles([...pinnedTitles, ...newTitles].slice(0, 10));
      toast({
        title: "Titles Generated",
        description: `Generated ${newTitles.length} new title suggestions. ${pinnedTitles.length} pinned titles preserved.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate title suggestions",
        variant: "destructive",
      });
    },
  });

  // Description generation mutation
  const generateDescriptionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/listings/${listingId}/generate-description`,
      );
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedDescription({
        aboutThisSpace: data.aboutThisSpace,
        theSpace: data.theSpace,
        keySellingPoints: data.keySellingPoints,
      });
      toast({
        title: "Content Generated",
        description: "Generated About and The Space sections.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate description content",
        variant: "destructive",
      });
    },
  });

  const handleLeaveAndNotify = () => {
    if (listing) {
      // Start background analysis tracking
      // Use fresh counts from the current listing/analysis
      const reviewCount = listing.analysis?.reviewCount ?? undefined;
      const conversationCount =
        listing.analysis?.conversationCount ?? undefined;
      const analysisId = startBackgroundAnalysis(
        listing.id,
        listing.headline || listing.name,
        reviewCount,
        conversationCount,
      );
      backgroundAnalysisIdRef.current = analysisId;
      isBackgroundModeRef.current = true;
      setIsBackgroundMode(true);

      // Navigate to listing analysis page
      setLocation("/listing-analysis");
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="w-full space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="w-10 h-10 rounded-md" />
            <Skeleton className="h-8 w-48" />
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>
              We couldn't load this listing. It may have been deleted.
            </AlertDescription>
          </Alert>
          <div className="flex gap-4 justify-center">
            <Button variant="outline" asChild>
              <Link href="/listing-analysis">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Listings
              </Link>
            </Button>
            <Button onClick={() => refetch()} data-testid="button-retry">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const analysis = listing?.analysis;
  // Prefer live IGP from SSE so the sheet and ideal category show as soon as "igp" stage completes (before listing refetch)
  const idp = (stagedAnalysisProgress.igpResult ??
    analysis?.idealGuestProfile) as IdealGuestProfile | undefined;

  const getAnalysis = (field: string): CategoryAnalysis | undefined => {
    if (scoresClearedForRerun) return undefined;
    const sseCategory = gradeFieldToSseCategory[field];
    const cr = stagedAnalysisProgress.categoryResults;
    if (
      (field === "idealAnalysis" || sseCategory === "ideal") &&
      stagedAnalysisProgress.igpResult
    ) {
      return stagedAnalysisProgress.igpResult as unknown as CategoryAnalysis;
    }
    if (sseCategory && cr && typeof cr === "object" && cr[sseCategory]) {
      return cr[sseCategory] as CategoryAnalysis;
    }
    if (!analysis) return undefined;
    return (analysis as any)[field] as CategoryAnalysis | undefined;
  };

  const getGrade = (field: string): string | undefined => {
    if (scoresClearedForRerun) return undefined;
    const sseCategory = gradeFieldToSseCategory[field];
    if (
      (field === "idealGrade" || sseCategory === "ideal") &&
      stagedAnalysisProgress.igpResult?.grade
    ) {
      return stagedAnalysisProgress.igpResult.grade as string;
    }
    const cr = stagedAnalysisProgress.categoryResults;
    if (
      sseCategory &&
      cr &&
      typeof cr === "object" &&
      (cr[sseCategory] as { grade?: string } | undefined)?.grade != null
    ) {
      return (cr[sseCategory] as { grade: string }).grade;
    }
    if (!analysis) return undefined;
    return (analysis as any)[field] as string | undefined;
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 w-full space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              asChild
              data-testid="button-back"
            >
              <Link href="/listing-analysis">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            <Avatar className="w-14 h-14 rounded-lg">
              <AvatarImage
                src={listing.imageUrl || undefined}
                alt={listing.name}
              />
              <AvatarFallback className="rounded-lg bg-muted">
                <Building2 className="w-7 h-7 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <h1
                  className="text-2xl font-bold"
                  data-testid="text-listing-name"
                >
                  {listing.headline || listing.name}
                </h1>
                {listing.platformIds?.airbnb ? (
                  <a
                    href={`https://www.airbnb.com/rooms/${listing.platformIds.airbnb}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="View on Airbnb"
                    data-testid="link-listing-airbnb"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                ) : (
                  listing.publicUrl && (
                    <a
                      href={listing.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="View listing"
                      data-testid="link-listing-public"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )
                )}
              </div>
              {listing.address && (
                <p className="text-muted-foreground text-sm">
                  {listing.address}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {analysis && !scoresClearedForRerun && (
              <>
                <button
                  type="button"
                  onClick={() => setShowScoreBreakdownSheet(true)}
                  className="text-right flex items-center gap-3 rounded-lg p-2 -m-2 hover:bg-muted/50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
                  data-testid="overall-grade-score-trigger"
                >
                  {(analysis as any).overallGrade && (
                    <div className="flex flex-col items-end">
                      <span
                        className={`text-3xl font-bold ${
                          (analysis as any).overallGrade === "A"
                            ? "text-green-600 dark:text-green-400"
                            : (analysis as any).overallGrade === "B"
                              ? "text-blue-600 dark:text-blue-400"
                              : (analysis as any).overallGrade === "C"
                                ? "text-yellow-600 dark:text-yellow-400"
                                : (analysis as any).overallGrade === "D"
                                  ? "text-orange-600 dark:text-orange-400"
                                  : "text-red-600 dark:text-red-400"
                        }`}
                        data-testid="text-overall-grade"
                      >
                        {(analysis as any).overallGrade}
                      </span>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        Overall Grade <Info className="h-3 w-3" />
                      </p>
                    </div>
                  )}
                  <div className="flex flex-col items-end">
                    <div className="flex items-baseline gap-1">
                      <span
                        className="text-3xl font-bold"
                        data-testid="text-overall-score"
                      >
                        {typeof analysis.score === "number"
                          ? analysis.score.toFixed(1)
                          : (analysis.score ?? "—")}
                      </span>
                      <span className="text-lg text-muted-foreground">/10</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Score</p>
                  </div>
                </button>
                <Sheet
                  open={showScoreBreakdownSheet}
                  onOpenChange={setShowScoreBreakdownSheet}
                >
                  <SheetContent
                    side="right"
                    className="w-full sm:max-w-xl overflow-y-auto"
                  >
                    <SheetHeader>
                      <SheetTitle>Overall Grade & Score</SheetTitle>
                      <SheetDescription>
                        How your overall grade and numerical score are
                        calculated from category grades.
                      </SheetDescription>
                    </SheetHeader>
                    <div className="mt-6 space-y-4">
                      {(() => {
                        const breakdown = getOverallGradeBreakdown(analysis);
                        if (!breakdown)
                          return (
                            <p className="text-sm text-muted-foreground">
                              No breakdown available.
                            </p>
                          );
                        return (
                          <>
                            <p className="text-sm text-muted-foreground">
                              Each category has a weight. Your grade (A=10, B=8,
                              C=6, D=4, F=2) is multiplied by that weight. The
                              overall score is the weighted average, then
                              converted to a letter grade.
                            </p>
                            <div className="border rounded-md overflow-hidden">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">
                                      Category
                                    </TableHead>
                                    <TableHead className="text-xs w-12">
                                      Grade
                                    </TableHead>
                                    <TableHead className="text-xs w-12">
                                      Weight
                                    </TableHead>
                                    <TableHead className="text-xs w-16 text-right">
                                      Contribution
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {breakdown.rows.map((row) => (
                                    <TableRow key={row.category}>
                                      <TableCell className="text-xs py-1">
                                        {row.label}
                                      </TableCell>
                                      <TableCell className="text-xs py-1">
                                        {row.grade ?? "—"}
                                      </TableCell>
                                      <TableCell className="text-xs py-1">
                                        {row.weight}
                                      </TableCell>
                                      <TableCell className="text-xs py-1 text-right">
                                        {row.numeric != null
                                          ? row.contribution.toFixed(1)
                                          : "—"}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                            <div className="text-sm border-t pt-4 space-y-1">
                              <p>
                                Weighted sum: {breakdown.weightedSum.toFixed(1)}{" "}
                                ÷ Total weight: {breakdown.totalWeight} ={" "}
                                <strong>
                                  {breakdown.weightedAvg.toFixed(2)}
                                </strong>
                              </p>
                              <p>
                                Letter grade:{" "}
                                <strong>{breakdown.letter}</strong> · Score:{" "}
                                <strong>{breakdown.score}/10</strong>
                              </p>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </SheetContent>
                </Sheet>
              </>
            )}
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="w-full"
        >
          <TabsList className="mb-4">
            <TabsTrigger value="overview" data-testid="tab-overview">
              Listing Details
            </TabsTrigger>
            <TabsTrigger value="analysis" data-testid="tab-analysis">
              Listing Analysis
            </TabsTrigger>
            <TabsTrigger value="reservations" data-testid="tab-reservations">
              Reservations
              {reservations.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {reservations.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="tags" data-testid="tab-tags">
              Tags
            </TabsTrigger>
            <TabsTrigger value="tasks" data-testid="tab-tasks">
              Tasks
            </TabsTrigger>
            <TabsTrigger value="reviews" data-testid="tab-reviews">
              Reviews
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {(listing.images || listing.description || listing.amenities) && (
              <Card data-testid="card-property-info">
                <CardContent className="pt-6 space-y-6">
                  {/* Expand/Collapse All Button */}
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setOverviewCategoriesExpanded(
                          !overviewCategoriesExpanded,
                        )
                      }
                      data-testid="button-toggle-all-categories"
                      className="gap-2"
                    >
                      {overviewCategoriesExpanded ? (
                        <>
                          <ChevronUp className="w-4 h-4" />
                          Collapse All
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          Expand All
                        </>
                      )}
                    </Button>
                  </div>
                  {listing.images &&
                    listing.images.length > 0 &&
                    (() => {
                      const photosAnalysis = analysis?.photosAnalysis as any;
                      const heroRecommendation =
                        photosAnalysis?.heroRecommendation;
                      const top5Recommendations =
                        photosAnalysis?.top5Recommendations || [];
                      const top5Indices = new Set(
                        top5Recommendations.map((r: any) => r.photoIndex),
                      );

                      return (
                        <details
                          className="group border rounded-lg overflow-hidden"
                          open={overviewCategoriesExpanded}
                          data-testid="details-property-photos"
                        >
                          <summary className="flex items-center justify-between cursor-pointer text-sm font-medium p-3">
                            <span className="flex items-center gap-2">
                              <Image className="w-4 h-4 text-muted-foreground" />
                              Property Photos ({listing.images.length})
                              {isAnalyzingPhotos && (
                                <Badge
                                  variant="secondary"
                                  className="bg-purple-500/10 text-purple-600 border-purple-500/30"
                                >
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  Analyzing{" "}
                                  {
                                    photoAnalyses.filter(
                                      (a: any) => a.analysisType === "full",
                                    ).length
                                  }
                                  /{listing.images.length}
                                </Badge>
                              )}
                              {!isAnalyzingPhotos && heroRecommendation && (
                                <Badge
                                  variant="secondary"
                                  className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                >
                                  <Sparkles className="w-3 h-3 mr-1" />
                                  AI Ready
                                </Badge>
                              )}
                            </span>
                            <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                          </summary>
                          <div className="p-3 bg-muted/50">
                            {isAnalyzingPhotos &&
                              (() => {
                                const photosToAnalyze = listing.images.length;
                                const analyzedCount = photoAnalyses.filter(
                                  (a: any) => a.analysisType === "full",
                                ).length;
                                const progressPercent =
                                  photosToAnalyze > 0
                                    ? (analyzedCount / photosToAnalyze) * 100
                                    : 0;
                                return (
                                  <Progress
                                    value={progressPercent}
                                    className="h-1 mb-3"
                                  />
                                );
                              })()}

                            {/* Hero/Top5 Recommendations Card */}
                            {heroRecommendation && (
                              <Card className="mb-4 border-purple-500/30 bg-purple-500/5">
                                <CardContent className="pt-4">
                                  <div className="flex items-start gap-3">
                                    <Sparkles className="w-5 h-5 text-purple-500 mt-0.5" />
                                    <div className="space-y-3 flex-1">
                                      <h4 className="text-sm font-medium">
                                        AI Photo Recommendations
                                      </h4>

                                      {/* Hero Photo Recommendation */}
                                      <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                        <div className="flex items-center gap-2 mb-1">
                                          <Badge className="bg-emerald-500 text-white text-[10px] px-1.5 py-0">
                                            Hero
                                          </Badge>
                                          <span className="text-xs font-medium">
                                            Photo{" "}
                                            {heroRecommendation.photoIndex + 1}
                                          </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                          {heroRecommendation.reason}
                                        </p>
                                      </div>

                                      {/* Top 5 Recommendations */}
                                      {top5Recommendations.length > 0 && (
                                        <div className="space-y-2">
                                          <p className="text-xs font-medium text-muted-foreground">
                                            Recommended Top 5 Photos:
                                          </p>
                                          <div className="grid gap-2">
                                            {top5Recommendations
                                              .filter(
                                                (r: any) =>
                                                  r.photoIndex !==
                                                  heroRecommendation?.photoIndex,
                                              )
                                              .slice(0, 5)
                                              .map((rec: any, idx: number) => (
                                                <div
                                                  key={rec.photoIndex}
                                                  className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20"
                                                >
                                                  <div className="flex items-center gap-2 mb-0.5">
                                                    <Badge className="bg-blue-500 text-white text-[10px] px-1.5 py-0">
                                                      #{idx + 1}
                                                    </Badge>
                                                    <span className="text-xs font-medium">
                                                      Photo {rec.photoIndex + 1}
                                                    </span>
                                                  </div>
                                                  <p className="text-xs text-muted-foreground">
                                                    {rec.reason}
                                                  </p>
                                                </div>
                                              ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Overall Assessment */}
                                      {photosAnalysis?.overallAssessment && (
                                        <p className="text-xs text-muted-foreground italic border-t pt-2 border-purple-500/20">
                                          {photosAnalysis.overallAssessment}
                                        </p>
                                      )}

                                      {photosAnalysis?.duplicateWarnings
                                        ?.length > 0 && (
                                        <p className="text-xs text-amber-600 dark:text-amber-400">
                                          <strong>Warning:</strong>{" "}
                                          {photosAnalysis.duplicateWarnings.join(
                                            ", ",
                                          )}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            )}

                            {/* AI Edited Photos Section - Overview */}
                            {(() => {
                              const aiEditedPhotos = photoAnalyses.filter(
                                (a: any) => a.aiEditedUrl,
                              );
                              if (aiEditedPhotos.length === 0) return null;

                              return (
                                <Card className="mb-4 border-purple-500/30 bg-purple-500/5">
                                  <CardContent className="pt-4">
                                    <div className="flex items-center justify-between mb-3">
                                      <div className="flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-purple-500" />
                                        <h4 className="text-sm font-medium">
                                          AI Edited Photos
                                        </h4>
                                        <Badge
                                          variant="secondary"
                                          className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30"
                                        >
                                          {aiEditedPhotos.length} saved
                                        </Badge>
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-purple-500/50 text-purple-400"
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          try {
                                            const response = await fetch(
                                              `/api/listings/${listingId}/download-pinned-photos`,
                                              {
                                                method: "POST",
                                                credentials: "include",
                                              },
                                            );
                                            if (!response.ok)
                                              throw new Error(
                                                "Download failed",
                                              );
                                            const blob = await response.blob();
                                            const url =
                                              window.URL.createObjectURL(blob);
                                            const link =
                                              document.createElement("a");
                                            link.href = url;
                                            link.download = `pinned-photos-${(listingId || "photos").slice(0, 8)}.zip`;
                                            document.body.appendChild(link);
                                            link.click();
                                            document.body.removeChild(link);
                                            window.URL.revokeObjectURL(url);
                                            toast({
                                              title: "Downloaded!",
                                              description: `${aiEditedPhotos.length} photos saved to your downloads.`,
                                            });
                                          } catch {
                                            toast({
                                              title: "Download Failed",
                                              description:
                                                "Could not download photos. Please try again.",
                                              variant: "destructive",
                                            });
                                          }
                                        }}
                                        data-testid="button-download-all-overview"
                                      >
                                        <Download className="w-3 h-3 mr-1" />
                                        Download All
                                      </Button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {aiEditedPhotos.map((analysis: any) => (
                                        <div
                                          key={analysis.id}
                                          className="relative w-20 h-20 rounded-md overflow-visible border-2 border-purple-500/50 hover-elevate cursor-pointer group"
                                          data-testid={`button-overview-ai-edited-${analysis.photoIndex}`}
                                        >
                                          <img
                                            src={analysis.aiEditedUrl}
                                            alt={`AI Edited ${analysis.photoIndex + 1}`}
                                            className="w-full h-full object-cover rounded-md"
                                            onClick={() => {
                                              setSelectedPhotoIndex(
                                                analysis.photoIndex,
                                              );
                                              setShowPhotoAnalysis(true);
                                            }}
                                          />
                                          <div className="absolute -top-1 -right-1 bg-purple-500 rounded-full p-0.5">
                                            <Sparkles className="w-3 h-3 text-white" />
                                          </div>
                                          <button
                                            className="absolute bottom-1 right-1 w-6 h-6 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const link =
                                                document.createElement("a");
                                              link.href = analysis.aiEditedUrl;
                                              link.download = `ai-edited-photo-${analysis.photoIndex + 1}.png`;
                                              document.body.appendChild(link);
                                              link.click();
                                              document.body.removeChild(link);
                                              toast({
                                                title: "Downloaded!",
                                                description:
                                                  "Photo saved to your downloads.",
                                              });
                                            }}
                                            data-testid={`button-download-overview-${analysis.photoIndex}`}
                                          >
                                            <Download className="w-3 h-3 text-white" />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">
                                      Photos enhanced with AI. Click to view
                                      original or hover to download.
                                    </p>
                                  </CardContent>
                                </Card>
                              );
                            })()}

                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                              {(showAllPhotos
                                ? listing.images
                                : listing.images.slice(0, 12)
                              ).map((img, i) => {
                                const isHero =
                                  heroRecommendation?.photoIndex === i;
                                const isTop5 = top5Indices.has(i);
                                const photoAnalysis = photoAnalyses.find(
                                  (a: any) => a.photoIndex === i,
                                );
                                const isAnalyzed = !!photoAnalysis;
                                const hasAiEdit = !!photoAnalysis?.aiEditedUrl;

                                return (
                                  <button
                                    key={i}
                                    onClick={() => {
                                      setSelectedPhotoIndex(i);
                                      setShowPhotoAnalysis(true);
                                    }}
                                    className={`aspect-video rounded-lg overflow-hidden bg-muted hover-elevate cursor-pointer relative group ${isHero ? "ring-2 ring-emerald-500" : isTop5 ? "ring-2 ring-blue-500" : hasAiEdit ? "ring-2 ring-purple-500" : ""}`}
                                    data-testid={`img-property-${i}`}
                                  >
                                    <img
                                      src={img}
                                      alt={`${listing.name} photo ${i + 1}`}
                                      className="w-full h-full object-cover"
                                    />

                                    {/* Badge indicators */}
                                    <div className="absolute top-1 left-1 flex gap-1">
                                      {hasAiEdit && (
                                        <Badge className="bg-purple-500 text-white text-[10px] px-1 py-0">
                                          <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                                          Edited
                                        </Badge>
                                      )}
                                      {isHero && (
                                        <Badge className="bg-emerald-500 text-white text-[10px] px-1 py-0">
                                          Hero
                                        </Badge>
                                      )}
                                      {isTop5 && !isHero && (
                                        <Badge className="bg-blue-500 text-white text-[10px] px-1 py-0">
                                          Top 5
                                        </Badge>
                                      )}
                                    </div>

                                    {/* Analysis status indicator */}
                                    <div className="absolute top-1 right-1">
                                      {isAnalyzed ? (
                                        <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                                          <Check className="w-2.5 h-2.5 text-white" />
                                        </div>
                                      ) : isAnalyzingPhotos ? (
                                        <div className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center">
                                          <Loader2 className="w-2.5 h-2.5 text-white animate-spin" />
                                        </div>
                                      ) : null}
                                    </div>

                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                      <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                        {isAnalyzed
                                          ? "View Analysis"
                                          : "View Photo"}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            {listing.images.length > 12 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full mt-2 text-muted-foreground"
                                onClick={() => setShowAllPhotos(!showAllPhotos)}
                                data-testid="button-toggle-photos"
                              >
                                {showAllPhotos ? (
                                  <>
                                    <ChevronUp className="w-4 h-4 mr-1" />
                                    Show Less
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="w-4 h-4 mr-1" />
                                    Show All {listing.images.length} Photos
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </details>
                      );
                    })()}

                  {/* 1. Headline */}
                  {listing.headline && (
                    <details
                      className="group border rounded-lg overflow-hidden"
                      open={overviewCategoriesExpanded}
                      data-testid="details-headline"
                    >
                      <summary className="flex items-center justify-between cursor-pointer text-sm font-medium p-3">
                        <span className="flex items-center gap-2">
                          <Type className="w-4 h-4 text-muted-foreground" />
                          Headline
                        </span>
                        <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                      </summary>
                      <div className="p-3 bg-muted/50">
                        <p className="text-sm" data-testid="text-headline">
                          {listing.headline}
                        </p>
                      </div>
                    </details>
                  )}

                  {/* 2. Summary */}
                  {listing.summary && (
                    <details
                      className="group border rounded-lg overflow-hidden"
                      open={overviewCategoriesExpanded}
                      data-testid="details-summary"
                    >
                      <summary className="flex items-center justify-between cursor-pointer text-sm font-medium p-3">
                        <span className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          Summary
                        </span>
                        <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                      </summary>
                      <div className="p-3 bg-muted/50">
                        <p
                          className="text-sm text-muted-foreground whitespace-pre-wrap"
                          data-testid="text-summary"
                        >
                          {listing.summary}
                        </p>
                      </div>
                    </details>
                  )}

                  {/* 3. Description */}
                  {listing.description && (
                    <details
                      className="group border rounded-lg overflow-hidden"
                      open={overviewCategoriesExpanded}
                      data-testid="details-description"
                    >
                      <summary className="flex items-center justify-between cursor-pointer text-sm font-medium p-3">
                        <span className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          Description
                        </span>
                        <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                      </summary>
                      <div className="p-3 bg-muted/50">
                        <p
                          className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed"
                          data-testid="text-description"
                        >
                          {listing.description}
                        </p>
                      </div>
                    </details>
                  )}

                  {/* 4. Amenities */}
                  {listing.amenities && listing.amenities.length > 0 && (
                    <details
                      className="group border rounded-lg overflow-hidden"
                      open={overviewCategoriesExpanded}
                      data-testid="details-amenities"
                    >
                      <summary className="flex items-center justify-between cursor-pointer text-sm font-medium p-3">
                        <span className="flex items-center gap-2">
                          <Heart className="w-4 h-4 text-muted-foreground" />
                          Amenities ({listing.amenities.length})
                        </span>
                        <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                      </summary>
                      <div className="p-3 bg-muted/50">
                        <div className="flex flex-wrap gap-2">
                          {listing.amenities.map((amenity, i) => (
                            <Badge
                              key={i}
                              variant="secondary"
                              data-testid={`badge-amenity-${i}`}
                            >
                              {amenity}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </details>
                  )}

                  {/* 5. Space Overview */}
                  <details
                    className="group border rounded-lg overflow-hidden"
                    open={overviewCategoriesExpanded}
                    data-testid="details-space-overview"
                  >
                    <summary className="flex items-center justify-between cursor-pointer text-sm font-medium p-3">
                      <span className="flex items-center gap-2">
                        <Layout className="w-4 h-4 text-muted-foreground" />
                        Space Overview
                        {!listing.spaceOverview && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-amber-500 border-amber-500/30"
                          >
                            Not Set
                          </Badge>
                        )}
                      </span>
                      <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                    </summary>
                    <div className="p-3 bg-muted/50">
                      {listing.spaceOverview ? (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {listing.spaceOverview}
                        </p>
                      ) : (
                        <p className="text-sm text-amber-500 italic">
                          This field is not set in your property profile. Adding
                          a space overview helps guests understand your property
                          layout.
                        </p>
                      )}
                    </div>
                  </details>

                  {/* 6. Guest Access */}
                  <details
                    className="group border rounded-lg overflow-hidden"
                    open={overviewCategoriesExpanded}
                    data-testid="details-guest-access"
                  >
                    <summary className="flex items-center justify-between cursor-pointer text-sm font-medium p-3">
                      <span className="flex items-center gap-2">
                        <Key className="w-4 h-4 text-muted-foreground" />
                        Guest Access
                        {!listing.guestAccess && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-amber-500 border-amber-500/30"
                          >
                            Not Set
                          </Badge>
                        )}
                      </span>
                      <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                    </summary>
                    <div className="p-3 bg-muted/50">
                      {listing.guestAccess ? (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {listing.guestAccess}
                        </p>
                      ) : (
                        <p className="text-sm text-amber-500 italic">
                          This field is not set in your property profile.
                          Describing guest access helps set expectations for
                          arrival.
                        </p>
                      )}
                    </div>
                  </details>

                  {/* 7. House Manual */}
                  <details
                    className="group border rounded-lg overflow-hidden"
                    open={overviewCategoriesExpanded}
                    data-testid="details-house-manual"
                  >
                    <summary className="flex items-center justify-between cursor-pointer text-sm font-medium p-3">
                      <span className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-muted-foreground" />
                        House Manual
                        {!listing.houseManual && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-amber-500 border-amber-500/30"
                          >
                            Not Set
                          </Badge>
                        )}
                      </span>
                      <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                    </summary>
                    <div className="p-3 bg-muted/50">
                      {listing.houseManual ? (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {listing.houseManual}
                        </p>
                      ) : (
                        <p className="text-sm text-amber-500 italic">
                          This field is not set in your property profile. A
                          house manual reduces guest questions and improves
                          their experience.
                        </p>
                      )}
                    </div>
                  </details>

                  {/* 8. Other Details */}
                  <details
                    className="group border rounded-lg overflow-hidden"
                    open={overviewCategoriesExpanded}
                    data-testid="details-other-details"
                  >
                    <summary className="flex items-center justify-between cursor-pointer text-sm font-medium p-3">
                      <span className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-muted-foreground" />
                        Other Details
                        {!listing.otherDetails && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-amber-500 border-amber-500/30"
                          >
                            Not Set
                          </Badge>
                        )}
                      </span>
                      <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                    </summary>
                    <div className="p-3 bg-muted/50">
                      {listing.otherDetails ? (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {listing.otherDetails}
                        </p>
                      ) : (
                        <p className="text-sm text-amber-500 italic">
                          This field is not set in your property profile.
                          Include any additional details guests should know.
                        </p>
                      )}
                    </div>
                  </details>

                  {/* 9. Additional Rules */}
                  <details
                    className="group border rounded-lg overflow-hidden"
                    open={overviewCategoriesExpanded}
                    data-testid="details-additional-rules"
                  >
                    <summary className="flex items-center justify-between cursor-pointer text-sm font-medium p-3">
                      <span className="flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-muted-foreground" />
                        Additional Rules
                        {!listing.additionalRules && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-amber-500 border-amber-500/30"
                          >
                            Not Set
                          </Badge>
                        )}
                      </span>
                      <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                    </summary>
                    <div className="p-3 bg-muted/50">
                      {listing.additionalRules ? (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {listing.additionalRules}
                        </p>
                      ) : (
                        <p className="text-sm text-amber-500 italic">
                          This field is not set in your property profile. Clear
                          rules help guests understand expectations.
                        </p>
                      )}
                    </div>
                  </details>

                  {/* 10. Neighborhood Description */}
                  <details
                    className="group border rounded-lg overflow-hidden"
                    open={overviewCategoriesExpanded}
                    data-testid="details-neighborhood"
                  >
                    <summary className="flex items-center justify-between cursor-pointer text-sm font-medium p-3">
                      <span className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        Neighborhood Description
                        {!listing.neighborhoodDescription && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-amber-500 border-amber-500/30"
                          >
                            Not Set
                          </Badge>
                        )}
                      </span>
                      <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                    </summary>
                    <div className="p-3 bg-muted/50">
                      {listing.neighborhoodDescription ? (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {listing.neighborhoodDescription}
                        </p>
                      ) : (
                        <p className="text-sm text-amber-500 italic">
                          This field is not set in your property profile.
                          Describe your neighborhood to attract the right
                          guests.
                        </p>
                      )}
                    </div>
                  </details>

                  {/* 11. Getting Around */}
                  <details
                    className="group border rounded-lg overflow-hidden"
                    open={overviewCategoriesExpanded}
                    data-testid="details-getting-around"
                  >
                    <summary className="flex items-center justify-between cursor-pointer text-sm font-medium p-3">
                      <span className="flex items-center gap-2">
                        <Navigation className="w-4 h-4 text-muted-foreground" />
                        Getting Around
                        {!listing.gettingAround && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-amber-500 border-amber-500/30"
                          >
                            Not Set
                          </Badge>
                        )}
                      </span>
                      <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                    </summary>
                    <div className="p-3 bg-muted/50">
                      {listing.gettingAround ? (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {listing.gettingAround}
                        </p>
                      ) : (
                        <p className="text-sm text-amber-500 italic">
                          This field is not set in your property profile. Help
                          guests understand transportation options nearby.
                        </p>
                      )}
                    </div>
                  </details>

                  {/* 12. WiFi Name */}
                  <details
                    className="group border rounded-lg overflow-hidden"
                    open={overviewCategoriesExpanded}
                    data-testid="details-wifi-name"
                  >
                    <summary className="flex items-center justify-between cursor-pointer text-sm font-medium p-3">
                      <span className="flex items-center gap-2">
                        <Wifi className="w-4 h-4 text-muted-foreground" />
                        WiFi Name
                        {!listing.wifiName && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-amber-500 border-amber-500/30"
                          >
                            Not Set
                          </Badge>
                        )}
                      </span>
                      <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                    </summary>
                    <div className="p-3 bg-muted/50">
                      {listing.wifiName ? (
                        <p className="text-sm text-muted-foreground">
                          {listing.wifiName}
                        </p>
                      ) : (
                        <p className="text-sm text-amber-500 italic">
                          This field is not set in your property profile. Adding
                          WiFi details improves guest convenience.
                        </p>
                      )}
                    </div>
                  </details>

                  {/* Airbnb Scraped Categories Section - Always show */}
                  <>
                    {/* Divider */}
                    <div className="flex items-center gap-3 pt-4">
                      <div className="flex-1 border-t" />
                      <span className="text-xs font-medium text-muted-foreground">
                        Airbnb Listing Data - Crawl Required
                      </span>
                      {!airbnbScan && !stagedAnalysisProgress.isActive && (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-muted-foreground"
                        >
                          Not Scanned
                        </Badge>
                      )}
                      {(airbnbScan?.status === "scanning" ||
                        (stagedAnalysisProgress.isActive &&
                          stagedAnalysisProgress.scraperStatus ===
                            "started")) && (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-purple-500 border-purple-500/30"
                        >
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Scanning...
                        </Badge>
                      )}
                      {airbnbScan?.status === "failed" && (
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className="text-[10px] text-red-500 border-red-500/30 cursor-help"
                              >
                                Scan Failed
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-sm">
                              {airbnbScan.errorMessage ||
                                "The Airbnb listing crawl failed. Check server logs for details."}
                            </TooltipContent>
                          </Tooltip>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 text-[10px] text-red-400 hover:text-red-300"
                            onClick={() => rescanAirbnbMutation.mutate()}
                            disabled={rescanAirbnbMutation.isPending}
                          >
                            {rescanAirbnbMutation.isPending ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <RefreshCw className="w-2.5 h-2.5" />
                            )}
                            <span className="ml-1">Re-scan</span>
                          </Button>
                        </div>
                      )}
                      <div className="flex-1 border-t" />
                    </div>

                    {/* 13. Where You'll Sleep */}
                    <details
                      className="group border rounded-lg overflow-hidden"
                      open={overviewCategoriesExpanded}
                      data-testid="details-where-youll-sleep"
                    >
                      <summary className="flex items-center justify-between cursor-pointer text-sm font-medium p-3">
                        <span className="flex items-center gap-2">
                          <Bed className="w-4 h-4 text-muted-foreground" />
                          Where You'll Sleep
                          {airbnbScan?.status === "completed" &&
                            airbnbScan.whereYoullSleep?.rooms && (
                              <Badge
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {airbnbScan.whereYoullSleep.rooms.length}{" "}
                                {airbnbScan.whereYoullSleep.rooms.length === 1
                                  ? "room"
                                  : "rooms"}
                              </Badge>
                            )}
                          {airbnbScan?.status === "completed" &&
                            !airbnbScan.hasWhereYoullSleep && (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-amber-500 border-amber-500/30"
                              >
                                Not Found
                              </Badge>
                            )}
                          {(airbnbScan?.status === "scanning" ||
                            (stagedAnalysisProgress.isActive &&
                              stagedAnalysisProgress.scraperStatus ===
                                "started" &&
                              !airbnbScan)) && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-purple-500 border-purple-500/30"
                            >
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Scanning...
                            </Badge>
                          )}
                          {!airbnbScan && !stagedAnalysisProgress.isActive && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-muted-foreground"
                            >
                              Pending Scan
                            </Badge>
                          )}
                        </span>
                        <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                      </summary>
                      <div className="p-3 bg-muted/50">
                        {airbnbScan?.status === "completed" &&
                        airbnbScan.whereYoullSleep?.rooms &&
                        airbnbScan.whereYoullSleep.rooms.length > 0 ? (
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {airbnbScan.whereYoullSleep.rooms.map(
                              (room, idx) => (
                                <div
                                  key={idx}
                                  className="border rounded-lg p-3 bg-background"
                                  data-testid={`card-sleeping-room-${idx}`}
                                >
                                  {room.photoUrl && (
                                    <img
                                      src={room.photoUrl}
                                      alt={room.name}
                                      className="w-full h-24 object-cover rounded-md mb-2"
                                    />
                                  )}
                                  <p className="text-sm font-medium">
                                    {room.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {room.bedConfiguration}
                                  </p>
                                </div>
                              ),
                            )}
                          </div>
                        ) : airbnbScan?.status === "scanning" ||
                          (stagedAnalysisProgress.isActive &&
                            stagedAnalysisProgress.scraperStatus ===
                              "started") ? (
                          <p className="text-sm text-muted-foreground italic flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                            Scanning Airbnb listing...
                          </p>
                        ) : airbnbScan?.status === "completed" ? (
                          <p className="text-sm text-muted-foreground italic">
                            No sleeping arrangement data found on the Airbnb
                            listing.
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            Run an analysis to scan Airbnb listing data.
                          </p>
                        )}
                      </div>
                    </details>

                    {/* 14. Host Profile */}
                    <details
                      className="group border rounded-lg overflow-hidden"
                      open={overviewCategoriesExpanded}
                      data-testid="details-host-profile"
                    >
                      <summary className="flex items-center justify-between cursor-pointer text-sm font-medium p-3">
                        <span className="flex items-center gap-2">
                          <UserCircle className="w-4 h-4 text-muted-foreground" />
                          Host Profile
                          {airbnbScan?.status === "completed" &&
                            airbnbScan.hostProfile && (
                              <Badge
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {airbnbScan.hostProfile.name}
                              </Badge>
                            )}
                          {airbnbScan?.status === "completed" &&
                            !airbnbScan.hostProfile && (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-amber-500 border-amber-500/30"
                              >
                                Not Found
                              </Badge>
                            )}
                          {(airbnbScan?.status === "scanning" ||
                            (stagedAnalysisProgress.isActive &&
                              stagedAnalysisProgress.scraperStatus ===
                                "started" &&
                              !airbnbScan)) && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-purple-500 border-purple-500/30"
                            >
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Scanning...
                            </Badge>
                          )}
                          {!airbnbScan && !stagedAnalysisProgress.isActive && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-muted-foreground"
                            >
                              Pending Scan
                            </Badge>
                          )}
                        </span>
                        <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                      </summary>
                      <div className="p-3 bg-muted/50">
                        {airbnbScan?.status === "completed" &&
                        airbnbScan.hostProfile ? (
                          <div className="flex gap-4">
                            {airbnbScan.hostProfile.photoUrl && (
                              <Avatar className="w-16 h-16">
                                <AvatarImage
                                  src={airbnbScan.hostProfile.photoUrl}
                                  alt={airbnbScan.hostProfile.name}
                                />
                                <AvatarFallback>
                                  {airbnbScan.hostProfile.name?.charAt(0) ||
                                    "H"}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {airbnbScan.hostProfile.name}
                                </span>
                                {airbnbScan.hostProfile.isSuperhost && (
                                  <Badge className="bg-amber-500 text-white text-[10px]">
                                    <Crown className="w-3 h-3 mr-1" />
                                    Superhost
                                  </Badge>
                                )}
                                {airbnbScan.hostProfile.verified && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] text-emerald-600 border-emerald-500/30"
                                  >
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Verified
                                  </Badge>
                                )}
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                {airbnbScan.hostProfile.yearsHosting !==
                                  undefined && (
                                  <div className="text-muted-foreground">
                                    <span className="font-medium text-foreground">
                                      {airbnbScan.hostProfile.yearsHosting}
                                    </span>{" "}
                                    years hosting
                                  </div>
                                )}
                                {airbnbScan.hostProfile.reviewCount !==
                                  undefined && (
                                  <div className="text-muted-foreground">
                                    <span className="font-medium text-foreground">
                                      {airbnbScan.hostProfile.reviewCount}
                                    </span>{" "}
                                    reviews
                                  </div>
                                )}
                                {airbnbScan.hostProfile.responseRate && (
                                  <div className="text-muted-foreground">
                                    <span className="font-medium text-foreground">
                                      {airbnbScan.hostProfile.responseRate}
                                    </span>{" "}
                                    response rate
                                  </div>
                                )}
                                {airbnbScan.hostProfile.responseTime && (
                                  <div className="text-muted-foreground">
                                    Responds{" "}
                                    {airbnbScan.hostProfile.responseTime}
                                  </div>
                                )}
                              </div>
                              {airbnbScan.hostProfile.attributes &&
                                airbnbScan.hostProfile.attributes.length >
                                  0 && (
                                  <div className="flex flex-wrap gap-1 pt-1">
                                    {airbnbScan.hostProfile.attributes.map(
                                      (attr, idx) => (
                                        <Badge
                                          key={idx}
                                          variant="outline"
                                          className="text-[10px]"
                                        >
                                          {attr}
                                        </Badge>
                                      ),
                                    )}
                                  </div>
                                )}
                              {airbnbScan.hostProfile.aboutText && (
                                <p className="text-sm text-muted-foreground pt-2 line-clamp-3">
                                  {airbnbScan.hostProfile.aboutText}
                                </p>
                              )}
                            </div>
                          </div>
                        ) : airbnbScan?.status === "scanning" ||
                          (stagedAnalysisProgress.isActive &&
                            stagedAnalysisProgress.scraperStatus ===
                              "started") ? (
                          <p className="text-sm text-muted-foreground italic flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                            Scanning Airbnb listing...
                          </p>
                        ) : airbnbScan?.status === "completed" ? (
                          <p className="text-sm text-muted-foreground italic">
                            No host profile data found on the Airbnb listing.
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            Run an analysis to scan Airbnb listing data.
                          </p>
                        )}
                      </div>
                    </details>

                    {/* 15. Guest Favorite */}
                    <details
                      className="group border rounded-lg overflow-hidden"
                      open={overviewCategoriesExpanded}
                      data-testid="details-guest-favorite"
                    >
                      <summary className="flex items-center justify-between cursor-pointer text-sm font-medium p-3">
                        <span className="flex items-center gap-2">
                          <Trophy className="w-4 h-4 text-muted-foreground" />
                          Guest Favorite
                          {airbnbScan?.status === "completed" &&
                          airbnbScan.guestFavoriteTier ? (
                            <Badge
                              className={`text-[10px] ${
                                airbnbScan.guestFavoriteTier === "gold"
                                  ? "bg-amber-500 text-white"
                                  : airbnbScan.guestFavoriteTier === "black"
                                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                                    : "bg-zinc-500 text-white"
                              }`}
                            >
                              {airbnbScan.guestFavoriteTier === "gold"
                                ? "Top 1%"
                                : airbnbScan.guestFavoriteTier === "black"
                                  ? "Top 5%"
                                  : "Top 10%"}
                            </Badge>
                          ) : airbnbScan?.status === "completed" ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-muted-foreground"
                            >
                              Not a Guest Favorite
                            </Badge>
                          ) : airbnbScan?.status === "scanning" ||
                            (stagedAnalysisProgress.isActive &&
                              stagedAnalysisProgress.scraperStatus ===
                                "started" &&
                              !airbnbScan) ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-purple-500 border-purple-500/30"
                            >
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Scanning...
                            </Badge>
                          ) : !airbnbScan ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-muted-foreground"
                            >
                              Pending Scan
                            </Badge>
                          ) : null}
                        </span>
                        <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                      </summary>
                      <div className="p-3 bg-muted/50">
                        {airbnbScan?.status === "completed" &&
                        airbnbScan.guestFavoriteTier ? (
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                                airbnbScan.guestFavoriteTier === "gold"
                                  ? "bg-amber-500/20 text-amber-600"
                                  : airbnbScan.guestFavoriteTier === "black"
                                    ? "bg-zinc-500/20 text-zinc-600 dark:text-zinc-300"
                                    : "bg-zinc-400/20 text-zinc-500"
                              }`}
                            >
                              <Trophy className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">
                                {airbnbScan.guestFavoriteTier === "gold"
                                  ? "Gold Guest Favorite - Top 1% of homes"
                                  : airbnbScan.guestFavoriteTier === "black"
                                    ? "Guest Favorite - Top 5% of homes"
                                    : "Guest Favorite - Top 10% of homes"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                This listing has earned Airbnb's Guest Favorite
                                badge based on ratings, reviews, and
                                reliability.
                              </p>
                            </div>
                          </div>
                        ) : airbnbScan?.status === "scanning" ||
                          (stagedAnalysisProgress.isActive &&
                            stagedAnalysisProgress.scraperStatus ===
                              "started") ? (
                          <p className="text-sm text-muted-foreground italic flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                            Scanning Airbnb listing...
                          </p>
                        ) : airbnbScan?.status === "completed" ? (
                          <p className="text-sm text-muted-foreground italic">
                            This listing has not earned the Guest Favorite badge
                            yet. Focus on improving ratings and reviews to
                            achieve this status.
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            Run an analysis to scan Airbnb listing data.
                          </p>
                        )}
                      </div>
                    </details>

                    {/* 16. Superhost Status */}
                    <details
                      className="group border rounded-lg overflow-hidden"
                      open={overviewCategoriesExpanded}
                      data-testid="details-superhost"
                    >
                      <summary className="flex items-center justify-between cursor-pointer text-sm font-medium p-3">
                        <span className="flex items-center gap-2">
                          <Crown className="w-4 h-4 text-muted-foreground" />
                          Superhost Status
                          {airbnbScan?.status === "completed" &&
                          airbnbScan.isSuperhost ? (
                            <Badge className="bg-amber-500 text-white text-[10px]">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Superhost
                            </Badge>
                          ) : airbnbScan?.status === "completed" ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-muted-foreground"
                            >
                              Not a Superhost
                            </Badge>
                          ) : airbnbScan?.status === "scanning" ||
                            (stagedAnalysisProgress.isActive &&
                              stagedAnalysisProgress.scraperStatus ===
                                "started" &&
                              !airbnbScan) ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-purple-500 border-purple-500/30"
                            >
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Scanning...
                            </Badge>
                          ) : !airbnbScan ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-muted-foreground"
                            >
                              Pending Scan
                            </Badge>
                          ) : null}
                        </span>
                        <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                      </summary>
                      <div className="p-3 bg-muted/50">
                        {airbnbScan?.status === "completed" &&
                        airbnbScan.isSuperhost ? (
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-600">
                              <Crown className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">
                                Superhost Status Achieved
                              </p>
                              <p className="text-xs text-muted-foreground">
                                This host has earned Superhost status by
                                providing outstanding hospitality, maintaining
                                high ratings, and responding promptly.
                              </p>
                            </div>
                          </div>
                        ) : airbnbScan?.status === "scanning" ||
                          (stagedAnalysisProgress.isActive &&
                            stagedAnalysisProgress.scraperStatus ===
                              "started") ? (
                          <p className="text-sm text-muted-foreground italic flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                            Scanning Airbnb listing...
                          </p>
                        ) : airbnbScan?.status === "completed" ? (
                          <p className="text-sm text-muted-foreground italic">
                            This host has not achieved Superhost status.
                            Requirements include a 4.8+ rating, 90%+ response
                            rate, and at least 10 stays per year.
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            Run an analysis to scan Airbnb listing data.
                          </p>
                        )}
                      </div>
                    </details>
                  </>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="analysis" className="space-y-6">
            {/* Show in-progress alert when analysis is running for this listing (from any page) */}
            {listingId && isListingAnalyzing(listingId) && (
              <Alert className="border-primary/50 bg-primary/5">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <AlertTitle className="text-primary">
                  Analysis In Progress
                </AlertTitle>
                <AlertDescription className="text-muted-foreground">
                  AI analysis is currently running for this listing. Results
                  will appear once complete.
                </AlertDescription>
              </Alert>
            )}
            {/* Always show the full layout - with empty states if no analysis */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="text-lg">
                      Listing Performance Scores
                    </CardTitle>
                    <CardDescription className="text-sm">
                      {analysis && !scoresClearedForRerun
                        ? "Click any category to see detailed analysis"
                        : "Run AI Analysis to get performance scores"}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    {(() => {
                      const isPhotoAnalysisInProgress =
                        analysis?.photoAnalysisStatus === "pending" ||
                        analysis?.photoAnalysisStatus === "in_progress";
                      const isStagedAnalysisRunning =
                        stagedAnalysisProgress.isActive &&
                        !stagedAnalysisProgress.completed;
                      const isAnalysisInProgress =
                        isPhotoAnalysisInProgress ||
                        isAnalyzingPhotos ||
                        isStagedAnalysisRunning;

                      if (
                        !scoresClearedForRerun &&
                        analysis?.score !== undefined &&
                        analysis?.score !== null
                      ) {
                        return (
                          <div className="text-right">
                            <div className="flex items-center gap-2 justify-end">
                              {isAnalysisInProgress && (
                                <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
                              )}
                              <div
                                className={`text-2xl font-bold ${isAnalysisInProgress ? "text-purple-500" : "text-primary"}`}
                              >
                                {typeof analysis.score === "number"
                                  ? analysis.score.toFixed(1)
                                  : analysis.score}
                                /10
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {isAnalysisInProgress
                                ? "Score updating..."
                                : "Overall Score"}
                            </div>
                          </div>
                        );
                      }
                      if (scoresClearedForRerun || !analysis) {
                        return (
                          <div className="text-right">
                            <div className="text-2xl font-bold text-muted-foreground">
                              -/10
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Overall Score
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {idp && (
                      <Button
                        variant="outline"
                        onClick={() => setShowIdpSheet(true)}
                        data-testid="button-view-idp"
                        className="gap-2"
                      >
                        <Users className="w-4 h-4" />
                        Ideal Guest Profile
                      </Button>
                    )}
                    <Button
                      variant="default"
                      onClick={() => startStagedAnalysis()}
                      disabled={
                        stagedAnalysisProgress.isActive ||
                        analyzeMutation.isPending
                      }
                      data-testid="button-rerun-analysis"
                      className="gap-2"
                    >
                      {stagedAnalysisProgress.isActive ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {stagedAnalysisProgress.stageMessage ||
                            "Analyzing..."}
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          Re-run analysis
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {/* Staged analysis step list - show when analysis is in progress */}
                {stagedAnalysisProgress.isActive &&
                  !stagedAnalysisProgress.completed &&
                  (() => {
                    try {
                      const cr =
                        stagedAnalysisProgress.categoryResults &&
                        typeof stagedAnalysisProgress.categoryResults ===
                          "object"
                          ? stagedAnalysisProgress.categoryResults
                          : {};
                      const stageOrder = [
                        "init",
                        "data_fetch",
                        "igp",
                        "scraper",
                        "parallel",
                        "scraped",
                        "igp_final",
                        "alignment",
                        "complete",
                      ];
                      const stepLabels: Record<string, string> = {
                        init: "Starting...",
                        data_fetch: "Fetching data",
                        igp: "Ideal Guest Profile",
                        scraper: "Airbnb capture",
                        parallel: "Title, description, pet, reviews",
                        scraped: "Airbnb categories",
                        igp_final: "Final scores",
                        alignment: "Alignment scores",
                        complete: "Complete",
                      };
                      const parallelCats = [
                        "reviews",
                        "pet",
                        "title",
                        "description",
                      ];
                      const scrapedCats = [
                        "guest_favorites",
                        "superhost_status",
                        "host_profile",
                        "sleep",
                      ];
                      const hasAirbnbUrl = !!(
                        listing?.platformIds as
                          | Record<string, unknown>
                          | undefined
                      )?.airbnb;
                      const currentIdx = stageOrder.indexOf(
                        stagedAnalysisProgress.currentStage ?? "",
                      );
                      const steps = stageOrder.filter(
                        (s) =>
                          s !== "init" &&
                          (s !== "scraper" && s !== "scraped"
                            ? true
                            : hasAirbnbUrl),
                      );
                      const isStepDone = (stageId: string) => {
                        const idx = stageOrder.indexOf(stageId);
                        const isPast = currentIdx > idx;
                        const parallelDone =
                          stageId === "parallel" &&
                          parallelCats.every(
                            (c) =>
                              (cr[c] as { grade?: string } | undefined)
                                ?.grade != null,
                          );
                        const scrapedDone =
                          stageId === "scraped" &&
                          scrapedCats.every(
                            (c) =>
                              (cr[c] as { grade?: string } | undefined)
                                ?.grade != null || cr[c] === null,
                          );
                        return (
                          isPast ||
                          (stageId === "parallel" && parallelDone) ||
                          (stageId === "scraped" && scrapedDone) ||
                          (stageId === "complete" &&
                            stagedAnalysisProgress.completed)
                        );
                      };
                      const doneCount = steps.filter(isStepDone).length;
                      const progressPct = steps.length
                        ? Math.round((doneCount / steps.length) * 100)
                        : 0;
                      return (
                        <div
                          className="mb-6 p-4 rounded-lg border border-primary/20 bg-primary/5 space-y-3"
                          data-testid="staged-analysis-step-list"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-primary">
                              Analysis in progress
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {progressPct}%
                            </span>
                          </div>
                          <Progress value={progressPct} className="h-1.5" />
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                            {steps.map((stageId) => {
                              const idx = stageOrder.indexOf(stageId);
                              const isPast = currentIdx > idx;
                              const isCurrent = currentIdx === idx;
                              const parallelDone =
                                stageId === "parallel" &&
                                parallelCats.every(
                                  (c) =>
                                    (cr[c] as { grade?: string } | undefined)
                                      ?.grade != null,
                                );
                              const scrapedDone =
                                stageId === "scraped" &&
                                scrapedCats.every(
                                  (c) =>
                                    (cr[c] as { grade?: string } | undefined)
                                      ?.grade != null || cr[c] === null,
                                );
                              const done =
                                isPast ||
                                (stageId === "parallel" && parallelDone) ||
                                (stageId === "scraped" && scrapedDone) ||
                                (stageId === "complete" &&
                                  stagedAnalysisProgress.completed);
                              const inProgress =
                                isCurrent &&
                                stageId !== "complete" &&
                                !(stageId === "parallel" && parallelDone) &&
                                !(stageId === "scraped" && scrapedDone);
                              const label = stepLabels[stageId] ?? stageId;
                              return (
                                <div
                                  key={stageId}
                                  className={`flex items-center gap-1.5 ${done ? "text-muted-foreground" : inProgress ? "text-primary font-medium" : "text-muted-foreground/70"}`}
                                >
                                  {done ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                  ) : inProgress ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                                  ) : (
                                    <span className="w-3.5 h-3.5 rounded-full border border-current flex-shrink-0" />
                                  )}
                                  <span>{label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    } catch (err) {
                      console.error("[Staged analysis step list]", err);
                      return (
                        <div
                          className="mb-6 p-4 rounded-lg border border-primary/20 bg-primary/5"
                          data-testid="staged-analysis-step-list"
                        >
                          <p className="text-sm text-primary">
                            Analysis in progress...
                          </p>
                        </div>
                      );
                    }
                  })()}
                {/* Category Grade Cards Grid - Always visible */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {categoryConfig.slice(0, 10).map((cat) => {
                    const grade = getGrade(cat.gradeField);
                    const Icon = cat.icon;
                    const isAnalyzed = !!grade;

                    // Determine if this category is in Phase 2 and currently being analyzed
                    const isPhotoCategory = cat.key === "photos";
                    // Map category keys to server-side stage names (includes parallel + scraped)
                    const categoryToStage: Record<string, string> = {
                      sleep: "sleep",
                      superhost: "host_profile",
                      guestFav: "guest_favorites",
                      superhostStatus: "superhost_status",
                      title: "title",
                      description: "description",
                      pet: "pet",
                      reviews: "reviews",
                    };
                    const isAirbnbScrapingCategory = [
                      "sleep",
                      "superhost",
                      "guestFav",
                      "superhostStatus",
                    ].includes(cat.key);
                    const hasAirbnbUrl = !!listing?.platformIds?.airbnb;

                    // Photos: in progress if status is pending/in_progress or isAnalyzingPhotos flag is set
                    const isPhotoAnalysisInProgress =
                      isPhotoCategory &&
                      (analysis?.photoAnalysisStatus === "pending" ||
                        analysis?.photoAnalysisStatus === "in_progress" ||
                        isAnalyzingPhotos);

                    const stageName = categoryToStage[cat.key];
                    const isScraperRunning =
                      stagedAnalysisProgress.scraperStatus === "started";
                    const isCategoryAnalyzing =
                      stageName &&
                      (stagedAnalysisProgress.scrapedCategoriesAnalyzing.includes(
                        stageName,
                      ) ||
                        stagedAnalysisProgress.parallelCategoriesAnalyzing.includes(
                          stageName,
                        ));
                    const hasSseResult =
                      stageName &&
                      !!stagedAnalysisProgress.categoryResults[stageName]
                        ?.grade;

                    const isDataCapture =
                      isAirbnbScrapingCategory &&
                      hasAirbnbUrl &&
                      stagedAnalysisProgress.isActive &&
                      isScraperRunning &&
                      !isCategoryAnalyzing &&
                      !hasSseResult;

                    const isAirbnbCategoryAnalyzing =
                      isAirbnbScrapingCategory &&
                      hasAirbnbUrl &&
                      stagedAnalysisProgress.isActive &&
                      isCategoryAnalyzing &&
                      !hasSseResult;

                    const isCategoryInProgress = !!(
                      isPhotoAnalysisInProgress || isAirbnbCategoryAnalyzing
                    );

                    const normalizeGradeDisplay = (
                      g: string | null | undefined,
                    ): string | null => {
                      if (!g || g === "N/A") return g || null;
                      const upper = g.toUpperCase().trim();
                      if (["A", "B", "C", "D", "F"].includes(upper))
                        return upper;
                      const base = upper.charAt(0);
                      if (["A", "B", "C", "D", "F"].includes(base)) {
                        if (upper.includes("+")) {
                          const upgraded: Record<string, string> = {
                            B: "A",
                            C: "B",
                            D: "C",
                            F: "D",
                          };
                          return upgraded[base] || base;
                        }
                        if (upper.includes("-")) {
                          const downgraded: Record<string, string> = {
                            A: "B",
                            B: "C",
                            C: "D",
                            D: "F",
                          };
                          return downgraded[base] || base;
                        }
                        return base;
                      }
                      return null;
                    };
                    const getGradeColor = (
                      g: string | null | undefined,
                      inProgress: boolean,
                      dataCapture: boolean,
                    ) => {
                      if (dataCapture || inProgress)
                        return "bg-purple-500/20 border-purple-500/30";
                      const norm = normalizeGradeDisplay(g);
                      if (!norm) return "bg-muted";
                      switch (norm) {
                        case "A":
                          return "bg-emerald-500/20 border-emerald-500/30";
                        case "B":
                          return "bg-blue-500/20 border-blue-500/30";
                        case "C":
                          return "bg-amber-500/20 border-amber-500/30";
                        case "D":
                          return "bg-orange-500/20 border-orange-500/30";
                        case "F":
                          return "bg-red-500/20 border-red-500/30";
                        default:
                          return "bg-muted";
                      }
                    };

                    const getGradeTextColor = (
                      g: string | null | undefined,
                    ) => {
                      const norm = normalizeGradeDisplay(g);
                      if (!norm) return "text-muted-foreground";
                      switch (norm) {
                        case "A":
                          return "text-emerald-500";
                        case "B":
                          return "text-blue-500";
                        case "C":
                          return "text-amber-500";
                        case "D":
                          return "text-orange-500";
                        case "F":
                          return "text-red-500";
                        default:
                          return "text-muted-foreground";
                      }
                    };

                    const isScanning = isDataCapture || isCategoryInProgress;
                    const showScanAnimation = isDataCapture;
                    const showAiAnimation =
                      isCategoryInProgress && !isDataCapture;

                    return (
                      <div
                        key={cat.key}
                        className={`rounded-lg border p-4 text-center hover-elevate cursor-pointer ${getGradeColor(grade, isCategoryInProgress, isDataCapture)} ${
                          selectedCategory === cat.key
                            ? "ring-2 ring-purple-500"
                            : ""
                        }`}
                        onClick={() =>
                          setSelectedCategory(
                            selectedCategory === cat.key ? null : cat.key,
                          )
                        }
                        data-testid={`grade-card-${cat.key}`}
                      >
                        <div className="flex flex-col items-center gap-2">
                          {showScanAnimation ? (
                            <ScanLine className="w-4 h-4 text-amber-500 animate-pulse" />
                          ) : showAiAnimation ? (
                            <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                          ) : (
                            <Icon className="w-4 h-4 text-muted-foreground" />
                          )}
                          <div
                            className={`text-3xl font-bold ${isScanning ? "text-purple-500" : getGradeTextColor(grade)}`}
                          >
                            {showScanAnimation ? (
                              <ScanLine className="w-6 h-6 text-amber-500 animate-pulse" />
                            ) : showAiAnimation ? (
                              <Sparkles className="w-6 h-6 animate-pulse text-purple-500" />
                            ) : isAnalyzed ? (
                              normalizeGradeDisplay(grade) || grade
                            ) : (
                              "-"
                            )}
                          </div>
                          <div
                            className={`text-xs line-clamp-1 ${isScanning ? "text-purple-400" : "text-muted-foreground"}`}
                          >
                            {cat.label}
                          </div>
                          {isScanning && (
                            <div className="text-[10px] -mt-1 text-purple-400">
                              {isDataCapture ? "Scanning..." : "Analyzing..."}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Category List with Details */}
                <div className="space-y-2 mt-6">
                  {categoryConfig.map((cat) => {
                    const grade = getGrade(cat.gradeField);
                    const catAnalysis = getAnalysis(cat.analysisField);
                    const Icon = cat.icon;
                    const isAnalyzed = grade || catAnalysis;

                    // Count items analyzed - category-specific logic
                    const itemsCount = (() => {
                      if (cat.key === "reviews") {
                        return (
                          (analysis as any)?.reviewCount ||
                          catAnalysis?.suggestions?.length ||
                          0
                        );
                      }
                      if (cat.key === "photos") {
                        return (
                          (analysis as any)?.photoAnalysisTotalPhotos ||
                          catAnalysis?.suggestions?.length ||
                          0
                        );
                      }
                      if (cat.key === "sleep" && catAnalysis) {
                        return (
                          (catAnalysis as any)?.roomCount ||
                          catAnalysis?.suggestions?.length ||
                          (isAnalyzed ? 1 : 0)
                        );
                      }
                      // For all other categories: prefer suggestions count, but show at least 1 if grade exists (grade present means analysis was run even if JSONB data is legacy/null)
                      return (
                        catAnalysis?.suggestions?.length || (isAnalyzed ? 1 : 0)
                      );
                    })();

                    // Determine if this category is in Phase 2 and currently being analyzed
                    const isPhotoCategory = cat.key === "photos";
                    // Map category keys to server-side stage names (same as grid view)
                    const categoryToStageList: Record<string, string> = {
                      sleep: "sleep",
                      superhost: "host_profile",
                      guestFav: "guest_favorites",
                      superhostStatus: "superhost_status",
                      title: "title",
                      description: "description",
                      pet: "pet",
                      reviews: "reviews",
                    };
                    const isAirbnbScrapingCategory = [
                      "sleep",
                      "superhost",
                      "guestFav",
                      "superhostStatus",
                    ].includes(cat.key);
                    const hasAirbnbUrl = !!listing?.platformIds?.airbnb;

                    // Photos: in progress if status is pending/in_progress or isAnalyzingPhotos flag is set
                    const isPhotosAnalyzing =
                      isPhotoCategory &&
                      (analysis?.photoAnalysisStatus === "pending" ||
                        analysis?.photoAnalysisStatus === "in_progress" ||
                        isAnalyzingPhotos);

                    const stageNameList = categoryToStageList[cat.key];
                    const isScraperRunningList =
                      stagedAnalysisProgress.scraperStatus === "started";
                    const isCategoryAnalyzingList =
                      stageNameList &&
                      (stagedAnalysisProgress.scrapedCategoriesAnalyzing.includes(
                        stageNameList,
                      ) ||
                        stagedAnalysisProgress.parallelCategoriesAnalyzing.includes(
                          stageNameList,
                        ));
                    const hasSseResultList =
                      stageNameList &&
                      !!stagedAnalysisProgress.categoryResults[stageNameList]
                        ?.grade;

                    const isDataCaptureList =
                      isAirbnbScrapingCategory &&
                      hasAirbnbUrl &&
                      stagedAnalysisProgress.isActive &&
                      isScraperRunningList &&
                      !isCategoryAnalyzingList &&
                      !hasSseResultList;

                    const isAirbnbCategoryAnalyzingList =
                      isAirbnbScrapingCategory &&
                      hasAirbnbUrl &&
                      stagedAnalysisProgress.isActive &&
                      isCategoryAnalyzingList &&
                      !hasSseResultList;

                    const isCategoryInProgress = !!(
                      isPhotosAnalyzing || isAirbnbCategoryAnalyzingList
                    );

                    return (
                      <div
                        key={cat.key}
                        className={`flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer ${
                          selectedCategory === cat.key
                            ? "border-purple-500 bg-purple-500/10"
                            : ""
                        } ${isDataCaptureList || isCategoryInProgress ? "border-purple-500/50 bg-purple-500/10" : ""}`}
                        onClick={() =>
                          setSelectedCategory(
                            selectedCategory === cat.key ? null : cat.key,
                          )
                        }
                        data-testid={`list-category-${cat.key}`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-md flex items-center justify-center ${
                              isDataCaptureList || isCategoryInProgress
                                ? "bg-purple-500/20"
                                : "bg-muted"
                            }`}
                          >
                            {isDataCaptureList ? (
                              <ScanLine className="w-4 h-4 animate-pulse text-amber-500" />
                            ) : isCategoryInProgress ? (
                              <Sparkles className="w-4 h-4 animate-pulse text-purple-500" />
                            ) : (
                              <Icon className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-sm">
                              {cat.label}
                            </div>
                            <div
                              className={`text-xs ${isDataCaptureList || isCategoryInProgress ? "text-purple-400" : "text-muted-foreground"}`}
                            >
                              {isPhotosAnalyzing
                                ? `AI analyzing ${photoAnalyses.filter((a: any) => a.analysisType === "full").length}/${listing?.images?.length || 0} photos...`
                                : isDataCaptureList
                                  ? "Scanning..."
                                  : isCategoryInProgress
                                    ? "AI analysis in progress..."
                                    : isAnalyzed
                                      ? `${itemsCount} items analyzed`
                                      : "Not analyzed"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isDataCaptureList ? (
                            <ScanLine className="w-4 h-4 animate-pulse text-amber-500" />
                          ) : isCategoryInProgress ? (
                            <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                          ) : (
                            <GradeBadge grade={grade as any} size="sm" />
                          )}
                          {analysis?.completedCategories?.includes(cat.key) && (
                            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/30">
                              <Check className="w-2.5 h-2.5 mr-0.5" />
                              Done
                            </span>
                          )}
                          <ChevronRight
                            className={`w-4 h-4 text-muted-foreground transition-transform ${
                              selectedCategory === cat.key ? "rotate-90" : ""
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Category Detail View - rendered below tiles when a category is selected */}
                {selectedCategory && (
                  <div ref={categoryDetailRef} className="mt-6">
                    {(() => {
                      const selectedConfig = categoryConfig.find(
                        (c) => c.key === selectedCategory,
                      );
                      const selectedAnalysis = selectedConfig
                        ? getAnalysis(selectedConfig.analysisField)
                        : null;
                      const selectedGrade = selectedConfig
                        ? getGrade(selectedConfig.gradeField)
                        : null;
                      const images = (listing?.images as string[]) || [];
                      const photos =
                        images.length > 0
                          ? images
                          : listing?.imageUrl
                            ? [listing.imageUrl]
                            : [];

                      const renderPhotoPreviewLink = (
                        photoIndex: number,
                        label?: string,
                      ) => {
                        const photoUrl = photos[photoIndex];
                        if (!photoUrl)
                          return (
                            <span className="font-semibold">
                              Photo {photoIndex + 1}
                            </span>
                          );
                        return (
                          <HoverCard openDelay={200} closeDelay={100}>
                            <HoverCardTrigger asChild>
                              <span
                                className="inline-flex items-center gap-1 cursor-pointer text-[10px]"
                                onClick={() => {
                                  setSelectedPhotoIndex(photoIndex);
                                  setShowPhotoAnalysis(true);
                                }}
                                data-testid={`photo-preview-link-${photoIndex}`}
                              >
                                <img
                                  src={photoUrl}
                                  alt={`Photo ${photoIndex + 1}`}
                                  className="w-5 h-5 rounded object-cover border border-blue-500/40 inline-block"
                                />
                                <span className="underline decoration-dotted underline-offset-2 font-semibold hover:text-blue-300 transition-colors">
                                  {label || `Photo ${photoIndex + 1}`}
                                </span>
                              </span>
                            </HoverCardTrigger>
                            <HoverCardContent
                              side="top"
                              className="w-52 p-1.5"
                              align="start"
                            >
                              <img
                                src={photoUrl}
                                alt={`Photo ${photoIndex + 1}`}
                                className="w-full rounded object-cover aspect-[4/3]"
                              />
                              <p className="text-[10px] text-muted-foreground text-center mt-1">
                                Photo {photoIndex + 1}
                              </p>
                            </HoverCardContent>
                          </HoverCard>
                        );
                      };

                      if (selectedCategory === "photos") {
                        return (
                          <Card className="border-purple-500/30">
                            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-3">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setSelectedCategory(null)}
                                  data-testid="button-back-photos"
                                >
                                  <ArrowLeft className="w-4 h-4" />
                                </Button>
                                <div>
                                  <CardTitle className="flex items-center gap-2">
                                    <Image className="w-5 h-5 text-purple-500" />
                                    Photos
                                  </CardTitle>
                                  <CardDescription>
                                    {photos.length} photos including exterior,
                                    bedrooms, kitchen, and deck views
                                  </CardDescription>
                                </div>
                              </div>
                              <GradeBadge
                                grade={selectedGrade as any}
                                size="lg"
                              />
                            </CardHeader>
                            <CardContent className="space-y-6">
                              {/* Photo Analysis Progress - Detailed per-photo display */}
                              {isAnalyzingPhotos && (
                                <div className="py-6 px-6 rounded-xl bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-fuchsia-500/10 border border-purple-500/30">
                                  <div className="flex flex-col space-y-4">
                                    {/* Header */}
                                    <div className="flex items-center gap-3">
                                      <div className="relative">
                                        <div className="absolute inset-0 bg-purple-500/30 rounded-full blur-lg animate-pulse" />
                                        <div className="relative w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                                          <Sparkles
                                            className="w-6 h-6 text-purple-500 animate-bounce"
                                            style={{
                                              animationDuration: "1.5s",
                                            }}
                                          />
                                        </div>
                                      </div>
                                      <div>
                                        <p className="text-base font-semibold text-purple-600 dark:text-purple-400">
                                          AI Vision Analysis in Progress
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                          {
                                            photoAnalyses.filter(
                                              (a: any) =>
                                                a.analysisType === "full",
                                            ).length
                                          }{" "}
                                          of {photos.length} photos analyzed
                                        </p>
                                      </div>
                                    </div>

                                    {/* Progress bar */}
                                    <div className="w-full">
                                      <Progress
                                        value={
                                          (photoAnalyses.filter(
                                            (a: any) =>
                                              a.analysisType === "full",
                                          ).length /
                                            photos.length) *
                                          100
                                        }
                                        className="h-2"
                                      />
                                    </div>

                                    {/* Per-photo status grid with thumbnails */}
                                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                                      {photos.map((photo, index) => {
                                        const isAnalyzed = photoAnalyses.some(
                                          (a: any) =>
                                            a.photoIndex === index &&
                                            a.analysisType === "full",
                                        );
                                        const isCurrentlyAnalyzing =
                                          !isAnalyzed &&
                                          photoAnalyses.filter(
                                            (a: any) =>
                                              a.analysisType === "full",
                                          ).length === index;
                                        return (
                                          <div
                                            key={index}
                                            className={`relative aspect-square rounded-lg overflow-hidden border-2 ${
                                              isAnalyzed
                                                ? "border-emerald-500"
                                                : isCurrentlyAnalyzing
                                                  ? "border-purple-500 animate-pulse"
                                                  : "border-muted opacity-50"
                                            }`}
                                            data-testid={`photo-progress-${index}`}
                                          >
                                            <img
                                              src={photo}
                                              alt={`Photo ${index + 1}`}
                                              className="w-full h-full object-cover"
                                            />
                                            {isAnalyzed && (
                                              <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                                                <CheckCircle className="w-5 h-5 text-emerald-500" />
                                              </div>
                                            )}
                                            {isCurrentlyAnalyzing && (
                                              <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center">
                                                <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* AI Photo Recommendations (Hero/Top5) */}
                              {(() => {
                                const photosAnalysis = listing?.analysis
                                  ?.photosAnalysis as any;
                                const heroRecommendation =
                                  photosAnalysis?.heroRecommendation;
                                const top5Recommendations =
                                  photosAnalysis?.top5Recommendations || [];

                                if (!isAnalyzingPhotos && heroRecommendation) {
                                  return (
                                    <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/30">
                                      <div className="flex items-start gap-3">
                                        <Sparkles className="w-5 h-5 text-purple-500 mt-0.5" />
                                        <div className="space-y-3 flex-1">
                                          <h4 className="text-sm font-medium text-purple-600 dark:text-purple-400">
                                            AI Photo Recommendations
                                          </h4>

                                          {/* Hero Photo Recommendation */}
                                          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                            <div className="flex items-center gap-2 mb-1">
                                              <Badge className="bg-emerald-500 text-white text-[10px] px-1.5 py-0">
                                                Hero
                                              </Badge>
                                              <span className="text-xs font-medium">
                                                Photo{" "}
                                                {heroRecommendation.photoIndex +
                                                  1}
                                              </span>
                                              {heroRecommendation.confidenceScore !=
                                                null && (
                                                <Badge
                                                  variant="secondary"
                                                  className={`text-[10px] px-1.5 py-0 ${
                                                    heroRecommendation.confidenceScore >=
                                                    80
                                                      ? "bg-emerald-500/20 text-emerald-400"
                                                      : heroRecommendation.confidenceScore >=
                                                          50
                                                        ? "bg-amber-500/20 text-amber-400"
                                                        : "bg-red-500/20 text-red-400"
                                                  }`}
                                                  data-testid="badge-hero-confidence-rec"
                                                >
                                                  {
                                                    heroRecommendation.confidenceScore
                                                  }
                                                  % confidence
                                                </Badge>
                                              )}
                                            </div>
                                            <p className="text-xs text-muted-foreground mb-1.5">
                                              {heroRecommendation.reason}
                                            </p>
                                            {(heroRecommendation.strengths
                                              ?.length > 0 ||
                                              heroRecommendation.weaknesses
                                                ?.length > 0) && (
                                              <div className="grid grid-cols-2 gap-1.5">
                                                {heroRecommendation.strengths
                                                  ?.length > 0 && (
                                                  <div className="space-y-0.5">
                                                    {heroRecommendation.strengths.map(
                                                      (
                                                        s: string,
                                                        i: number,
                                                      ) => (
                                                        <p
                                                          key={i}
                                                          className="text-[11px] text-emerald-400 flex items-start gap-1"
                                                        >
                                                          <span className="w-1 h-1 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                                                          {s}
                                                        </p>
                                                      ),
                                                    )}
                                                  </div>
                                                )}
                                                {heroRecommendation.weaknesses
                                                  ?.length > 0 && (
                                                  <div className="space-y-0.5">
                                                    {heroRecommendation.weaknesses.map(
                                                      (
                                                        w: string,
                                                        i: number,
                                                      ) => (
                                                        <p
                                                          key={i}
                                                          className="text-[11px] text-amber-400 flex items-start gap-1"
                                                        >
                                                          <span className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                                                          {w}
                                                        </p>
                                                      ),
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                            {heroRecommendation.alternativePhotoIndex !=
                                              null &&
                                              heroRecommendation.alternativeReason && (
                                                <div className="mt-1.5 p-1.5 rounded bg-blue-500/10 border border-blue-500/20">
                                                  <p className="text-[10px] text-blue-400 flex items-center gap-1 flex-wrap">
                                                    <strong>
                                                      Better option:
                                                    </strong>{" "}
                                                    {renderPhotoPreviewLink(
                                                      heroRecommendation.alternativePhotoIndex,
                                                    )}{" "}
                                                    <span>
                                                      —{" "}
                                                      {
                                                        heroRecommendation.alternativeReason
                                                      }
                                                    </span>
                                                  </p>
                                                </div>
                                              )}
                                          </div>

                                          {/* Top 5 Recommendations */}
                                          {top5Recommendations.length > 0 && (
                                            <div className="space-y-2">
                                              <p className="text-xs font-medium text-muted-foreground">
                                                Recommended Top 5 Photos:
                                              </p>
                                              <div className="grid gap-2">
                                                {top5Recommendations
                                                  .filter(
                                                    (r: any) =>
                                                      r.photoIndex !==
                                                      heroRecommendation?.photoIndex,
                                                  )
                                                  .slice(0, 5)
                                                  .map(
                                                    (rec: any, idx: number) => (
                                                      <div
                                                        key={rec.photoIndex}
                                                        className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20"
                                                      >
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                          <Badge className="bg-blue-500 text-white text-[10px] px-1.5 py-0">
                                                            #{idx + 1}
                                                          </Badge>
                                                          <span className="text-xs font-medium">
                                                            Photo{" "}
                                                            {rec.photoIndex + 1}
                                                          </span>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">
                                                          {rec.reason}
                                                        </p>
                                                        {(rec.strengths
                                                          ?.length > 0 ||
                                                          rec.weaknesses
                                                            ?.length > 0) && (
                                                          <div className="grid grid-cols-2 gap-1.5 mt-1">
                                                            {rec.strengths
                                                              ?.length > 0 && (
                                                              <div className="space-y-0.5">
                                                                {rec.strengths.map(
                                                                  (
                                                                    s: string,
                                                                    i: number,
                                                                  ) => (
                                                                    <p
                                                                      key={i}
                                                                      className="text-[11px] text-emerald-400 flex items-start gap-1"
                                                                    >
                                                                      <span className="w-1 h-1 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                                                                      {s}
                                                                    </p>
                                                                  ),
                                                                )}
                                                              </div>
                                                            )}
                                                            {rec.weaknesses
                                                              ?.length > 0 && (
                                                              <div className="space-y-0.5">
                                                                {rec.weaknesses.map(
                                                                  (
                                                                    w: string,
                                                                    i: number,
                                                                  ) => (
                                                                    <p
                                                                      key={i}
                                                                      className="text-[11px] text-amber-400 flex items-start gap-1"
                                                                    >
                                                                      <span className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                                                                      {w}
                                                                    </p>
                                                                  ),
                                                                )}
                                                              </div>
                                                            )}
                                                          </div>
                                                        )}
                                                        {rec.alternativePhotoIndex !=
                                                          null &&
                                                          rec.alternativeReason && (
                                                            <div className="mt-1 p-1.5 rounded bg-purple-500/10 border border-purple-500/20">
                                                              <p className="text-[10px] text-purple-400 flex items-center gap-1 flex-wrap">
                                                                <strong>
                                                                  Better pick:
                                                                </strong>{" "}
                                                                {renderPhotoPreviewLink(
                                                                  rec.alternativePhotoIndex,
                                                                )}{" "}
                                                                <span>
                                                                  —{" "}
                                                                  {
                                                                    rec.alternativeReason
                                                                  }
                                                                </span>
                                                              </p>
                                                            </div>
                                                          )}
                                                      </div>
                                                    ),
                                                  )}
                                              </div>
                                            </div>
                                          )}

                                          {/* Overall Assessment */}
                                          {photosAnalysis?.overallAssessment && (
                                            <p className="text-xs text-muted-foreground italic border-t pt-2 border-purple-500/20">
                                              {photosAnalysis.overallAssessment}
                                            </p>
                                          )}

                                          {photosAnalysis?.duplicateWarnings
                                            ?.length > 0 && (
                                            <p className="text-xs text-amber-600 dark:text-amber-400">
                                              <strong>Warning:</strong>{" "}
                                              {photosAnalysis.duplicateWarnings.join(
                                                ", ",
                                              )}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              })()}

                              {/* Content Summary */}
                              <div>
                                <h4 className="text-sm font-medium mb-2">
                                  Content
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  {photos.length} photos including exterior,
                                  bedrooms, kitchen, and deck views
                                </p>
                              </div>

                              {/* Pinned AI Edited Photos */}
                              {photoAnalyses.filter((p: any) => p.aiEditedUrl)
                                .length > 0 && (
                                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <Check className="w-4 h-4 text-emerald-500" />
                                      <h4 className="text-sm font-medium text-emerald-400">
                                        Pinned AI Edited Photos
                                      </h4>
                                      <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">
                                        {
                                          photoAnalyses.filter(
                                            (p: any) => p.aiEditedUrl,
                                          ).length
                                        }{" "}
                                        saved
                                      </Badge>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-emerald-500/50 text-emerald-400"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        const pinnedPhotos =
                                          photoAnalyses.filter(
                                            (p: any) => p.aiEditedUrl,
                                          );
                                        if (pinnedPhotos.length === 0) return;

                                        try {
                                          const response = await fetch(
                                            `/api/listings/${listingId}/download-pinned-photos`,
                                            {
                                              method: "POST",
                                              credentials: "include",
                                            },
                                          );
                                          if (!response.ok)
                                            throw new Error("Download failed");
                                          const blob = await response.blob();
                                          const url =
                                            window.URL.createObjectURL(blob);
                                          const link =
                                            document.createElement("a");
                                          link.href = url;
                                          link.download = `pinned-photos-${(listingId || "photos").slice(0, 8)}.zip`;
                                          document.body.appendChild(link);
                                          link.click();
                                          document.body.removeChild(link);
                                          window.URL.revokeObjectURL(url);
                                          toast({
                                            title: "Downloaded!",
                                            description: `${pinnedPhotos.length} pinned photos saved to your downloads.`,
                                          });
                                        } catch {
                                          toast({
                                            title: "Download Failed",
                                            description:
                                              "Could not download photos. Please try again.",
                                            variant: "destructive",
                                          });
                                        }
                                      }}
                                      data-testid="button-download-all-photos-tab"
                                    >
                                      <Download className="w-3 h-3 mr-1" />
                                      Download All
                                    </Button>
                                  </div>
                                  <p className="text-xs text-muted-foreground mb-3">
                                    Photos that have been enhanced with AI.
                                    Hover to download individually.
                                  </p>
                                  <div className="flex flex-wrap gap-3">
                                    {photoAnalyses
                                      .filter((p: any) => p.aiEditedUrl)
                                      .map((photo: any) => (
                                        <div
                                          key={photo.id}
                                          className="relative group cursor-pointer"
                                          data-testid={`pinned-photo-${photo.photoIndex}`}
                                        >
                                          <img
                                            src={photo.aiEditedUrl}
                                            alt={`AI enhanced photo ${photo.photoIndex + 1}`}
                                            className="w-20 h-20 object-cover rounded-md border-2 border-emerald-500"
                                            onClick={() => {
                                              setSelectedPinnedPhoto({
                                                photoIndex: photo.photoIndex,
                                                originalUrl:
                                                  photos[photo.photoIndex] ||
                                                  "",
                                                enhancedUrl: photo.aiEditedUrl,
                                                prompt: photo.aiEditedPrompt,
                                              });
                                              setShowPinnedPhotoViewer(true);
                                            }}
                                          />
                                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                                            <Sparkles className="w-3 h-3 text-white" />
                                          </div>
                                          <button
                                            className="absolute bottom-1 right-1 w-6 h-6 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const link =
                                                document.createElement("a");
                                              link.href = photo.aiEditedUrl;
                                              link.download = `ai-edited-photo-${photo.photoIndex + 1}.png`;
                                              document.body.appendChild(link);
                                              link.click();
                                              document.body.removeChild(link);
                                              toast({
                                                title: "Downloaded!",
                                                description:
                                                  "Photo saved to your downloads.",
                                              });
                                            }}
                                            data-testid={`button-download-photo-tab-${photo.photoIndex}`}
                                          >
                                            <Download className="w-3 h-3 text-white" />
                                          </button>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              )}

                              {/* Why This Matters */}
                              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                <div className="flex items-center gap-2 mb-2">
                                  <Info className="w-4 h-4 text-blue-500" />
                                  <span className="text-sm font-medium text-blue-400">
                                    Why This Matters
                                  </span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  Photos are the most influential factor in
                                  booking decisions. Listings with high-quality,
                                  comprehensive photos receive 40% more
                                  bookings.
                                </p>
                              </div>

                              {/* Helper function to render clickable photo thumbnail */}
                              {(() => {
                                const renderPhotoThumbnail = (
                                  photo: string,
                                  index: number,
                                  borderClass?: string,
                                ) => {
                                  const photoAnalysisData = (
                                    selectedAnalysis as any
                                  )?.photoAnalysis?.find(
                                    (p: any) => p.photoIndex === index,
                                  );
                                  const hasAiEditedVersion = photoAnalyses.some(
                                    (a: any) =>
                                      a.photoIndex === index && a.aiEditedUrl,
                                  );
                                  return (
                                    <div
                                      key={index}
                                      className="relative cursor-pointer group"
                                      onClick={() => {
                                        setSelectedPhotoIndex(index);
                                        setShowPhotoAnalysis(true);
                                      }}
                                      data-testid={`photo-${index}`}
                                    >
                                      <img
                                        src={photo}
                                        alt={`Photo ${index + 1}`}
                                        className={`w-12 h-12 object-cover rounded-lg border group-hover:border-purple-500 transition-colors ${hasAiEditedVersion ? "border-purple-500" : ""} ${borderClass || ""}`}
                                      />
                                      {hasAiEditedVersion && (
                                        <div className="absolute -top-1 -right-1 bg-purple-500 rounded-full p-0.5">
                                          <Sparkles className="w-2.5 h-2.5 text-white" />
                                        </div>
                                      )}
                                      {photoAnalysisData &&
                                        !hasAiEditedVersion && (
                                          <div className="absolute bottom-0.5 right-0.5">
                                            <Badge className="text-[8px] px-0.5 py-0 bg-purple-500/90">
                                              AI
                                            </Badge>
                                          </div>
                                        )}
                                    </div>
                                  );
                                };

                                const heroPhoto = photos[0];
                                const top5Photos = photos.slice(0, 5);
                                const remainingPhotos = photos.slice(5);

                                // Get AI-generated reasons from listing.analysis.photosAnalysis
                                const photosAnalysisData =
                                  listing?.analysis?.photosAnalysis;
                                const heroReasonText =
                                  photosAnalysisData?.heroReason;
                                const top5ReasonText =
                                  photosAnalysisData?.top5Reason;

                                return (
                                  <>
                                    {/* 1. Hero Photo */}
                                    {heroPhoto && (
                                      <div>
                                        <div className="flex items-center gap-2 mb-3">
                                          <h4 className="text-sm font-medium">
                                            Hero Photo
                                          </h4>
                                          {!isAnalyzingPhotos &&
                                            photosAnalysisData?.heroConfidenceScore !=
                                              null && (
                                              <Badge
                                                variant="secondary"
                                                className={`text-xs ${
                                                  photosAnalysisData.heroConfidenceScore >=
                                                  80
                                                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                                    : photosAnalysisData.heroConfidenceScore >=
                                                        50
                                                      ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                                      : "bg-red-500/20 text-red-400 border-red-500/30"
                                                }`}
                                                data-testid="badge-hero-confidence"
                                              >
                                                Confidence:{" "}
                                                {
                                                  photosAnalysisData.heroConfidenceScore
                                                }
                                                %
                                              </Badge>
                                            )}
                                          {isAnalyzingPhotos && (
                                            <Badge
                                              variant="secondary"
                                              className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30 animate-pulse"
                                            >
                                              <Sparkles className="w-3 h-3 mr-1" />
                                              AI analyzing next...
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="flex gap-4 items-start">
                                          {renderPhotoThumbnail(heroPhoto, 0)}
                                          <div className="flex-1 space-y-2">
                                            <p className="text-sm text-muted-foreground">
                                              {isAnalyzingPhotos ? (
                                                <span className="text-purple-400/80 italic">
                                                  AI recommendations will appear
                                                  after photo analysis
                                                  completes...
                                                </span>
                                              ) : (
                                                heroReasonText ||
                                                "The cover photo creates the first impression for potential guests."
                                              )}
                                            </p>
                                            {!isAnalyzingPhotos &&
                                              ((photosAnalysisData
                                                ?.heroStrengths?.length ?? 0) >
                                                0 ||
                                                (photosAnalysisData
                                                  ?.heroWeaknesses?.length ??
                                                  0) > 0) && (
                                                <div className="grid grid-cols-2 gap-2 mt-2">
                                                  {(photosAnalysisData
                                                    ?.heroStrengths?.length ??
                                                    0) > 0 && (
                                                    <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                                                      <p className="text-[10px] font-medium text-emerald-400 mb-1">
                                                        Strengths
                                                      </p>
                                                      <ul className="space-y-0.5">
                                                        {photosAnalysisData!.heroStrengths!.map(
                                                          (
                                                            s: string,
                                                            i: number,
                                                          ) => (
                                                            <li
                                                              key={i}
                                                              className="text-xs text-muted-foreground flex items-start gap-1.5"
                                                            >
                                                              <span className="w-1 h-1 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                                                              {s}
                                                            </li>
                                                          ),
                                                        )}
                                                      </ul>
                                                    </div>
                                                  )}
                                                  {(photosAnalysisData
                                                    ?.heroWeaknesses?.length ??
                                                    0) > 0 && (
                                                    <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20">
                                                      <p className="text-[10px] font-medium text-amber-400 mb-1">
                                                        Weaknesses
                                                      </p>
                                                      <ul className="space-y-0.5">
                                                        {photosAnalysisData!.heroWeaknesses!.map(
                                                          (
                                                            w: string,
                                                            i: number,
                                                          ) => (
                                                            <li
                                                              key={i}
                                                              className="text-xs text-muted-foreground flex items-start gap-1.5"
                                                            >
                                                              <span className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                                                              {w}
                                                            </li>
                                                          ),
                                                        )}
                                                      </ul>
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                            {!isAnalyzingPhotos &&
                                              photosAnalysisData?.alternativeHero && (
                                                <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 mt-2">
                                                  <div className="flex items-center gap-1.5 mb-1">
                                                    <span className="text-[10px] font-medium text-blue-400">
                                                      Suggested Alternative
                                                      Hero:
                                                    </span>
                                                    {renderPhotoPreviewLink(
                                                      photosAnalysisData
                                                        .alternativeHero
                                                        .photoIndex,
                                                    )}
                                                  </div>
                                                  <p className="text-xs text-muted-foreground">
                                                    {
                                                      photosAnalysisData
                                                        .alternativeHero.reason
                                                    }
                                                  </p>
                                                </div>
                                              )}
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {/* 2. Top 5 Photos */}
                                    {top5Photos.length > 0 && (
                                      <div>
                                        <div className="flex items-center gap-2 mb-3">
                                          <h4 className="text-sm font-medium">
                                            Top 5 Photos
                                          </h4>
                                          {isAnalyzingPhotos && (
                                            <Badge
                                              variant="secondary"
                                              className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30 animate-pulse"
                                            >
                                              <Sparkles className="w-3 h-3 mr-1" />
                                              AI analyzing next...
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="flex flex-wrap gap-2 mb-2">
                                          {top5Photos.map((photo, i) =>
                                            renderPhotoThumbnail(photo, i),
                                          )}
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                          {isAnalyzingPhotos ? (
                                            <span className="text-purple-400/80 italic">
                                              AI recommendations will appear
                                              after photo analysis completes...
                                            </span>
                                          ) : (
                                            top5ReasonText ||
                                            "These photos appear first in your listing and are crucial for capturing guest attention."
                                          )}
                                        </p>
                                        {!isAnalyzingPhotos &&
                                          ((photosAnalysisData?.top5Strengths
                                            ?.length ?? 0) > 0 ||
                                            (photosAnalysisData?.top5Weaknesses
                                              ?.length ?? 0) > 0) && (
                                            <div className="grid grid-cols-2 gap-2 mt-2">
                                              {(photosAnalysisData
                                                ?.top5Strengths?.length ?? 0) >
                                                0 && (
                                                <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                                                  <p className="text-[10px] font-medium text-emerald-400 mb-1">
                                                    Strengths
                                                  </p>
                                                  <ul className="space-y-0.5">
                                                    {photosAnalysisData!.top5Strengths!.map(
                                                      (
                                                        s: string,
                                                        i: number,
                                                      ) => (
                                                        <li
                                                          key={i}
                                                          className="text-xs text-muted-foreground flex items-start gap-1.5"
                                                        >
                                                          <span className="w-1 h-1 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                                                          {s}
                                                        </li>
                                                      ),
                                                    )}
                                                  </ul>
                                                </div>
                                              )}
                                              {(photosAnalysisData
                                                ?.top5Weaknesses?.length ?? 0) >
                                                0 && (
                                                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20">
                                                  <p className="text-[10px] font-medium text-amber-400 mb-1">
                                                    Weaknesses
                                                  </p>
                                                  <ul className="space-y-0.5">
                                                    {photosAnalysisData!.top5Weaknesses!.map(
                                                      (
                                                        w: string,
                                                        i: number,
                                                      ) => (
                                                        <li
                                                          key={i}
                                                          className="text-xs text-muted-foreground flex items-start gap-1.5"
                                                        >
                                                          <span className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                                                          {w}
                                                        </li>
                                                      ),
                                                    )}
                                                  </ul>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        {!isAnalyzingPhotos &&
                                          (photosAnalysisData?.top5Alternatives
                                            ?.length ?? 0) > 0 && (
                                            <div className="mt-2 space-y-1.5">
                                              {photosAnalysisData!.top5Alternatives!.map(
                                                (alt: any, i: number) => (
                                                  <div
                                                    key={i}
                                                    className="p-2 rounded bg-blue-500/10 border border-blue-500/20"
                                                  >
                                                    <div className="flex items-center gap-1 flex-wrap text-[10px] font-medium text-blue-400 mb-0.5">
                                                      <span>Swap</span>
                                                      {renderPhotoPreviewLink(
                                                        alt.currentIndex,
                                                      )}
                                                      <span>→</span>
                                                      {renderPhotoPreviewLink(
                                                        alt.suggestedIndex,
                                                      )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                      {alt.reason}
                                                    </p>
                                                  </div>
                                                ),
                                              )}
                                            </div>
                                          )}
                                      </div>
                                    )}

                                    {/* 3. Low Resolution Photos - AI detected */}
                                    {(() => {
                                      // Get actual AI-detected low resolution photos, deduplicated by photoIndex so each photo appears once
                                      const lowResRaw = photoAnalyses.filter(
                                        (a: any) => a.isLowResolution === true,
                                      );
                                      const seenIndex = new Set<number>();
                                      const actualLowResAnalyses =
                                        lowResRaw.filter((a: any) => {
                                          const idx =
                                            typeof a.photoIndex === "number"
                                              ? a.photoIndex
                                              : parseInt(
                                                  String(a.photoIndex),
                                                  10,
                                                );
                                          if (seenIndex.has(idx)) return false;
                                          seenIndex.add(idx);
                                          return true;
                                        });
                                      const photoAnalysisComplete =
                                        listing?.analysis
                                          ?.photoAnalysisStatus === "complete";

                                      // During analysis - show placeholder
                                      if (isAnalyzingPhotos) {
                                        return (
                                          <div>
                                            <div className="flex items-center gap-2 mb-3">
                                              <h4 className="text-sm font-medium">
                                                Low Resolution Photos
                                              </h4>
                                              <Badge
                                                variant="secondary"
                                                className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30 animate-pulse"
                                              >
                                                <Sparkles className="w-3 h-3 mr-1" />
                                                AI detecting...
                                              </Badge>
                                            </div>
                                            <div className="flex flex-wrap gap-2 mb-2">
                                              {[1, 2, 3].map((i) => (
                                                <div
                                                  key={i}
                                                  className="w-16 h-16 rounded-md border-2 border-dashed border-amber-500/30 bg-amber-500/5 flex items-center justify-center"
                                                >
                                                  <Camera className="w-5 h-5 text-amber-400/50" />
                                                </div>
                                              ))}
                                            </div>
                                            <p className="text-sm text-muted-foreground italic text-purple-400/80">
                                              AI will identify low resolution
                                              photos when analysis completes...
                                            </p>
                                          </div>
                                        );
                                      }

                                      // After analysis - show actual AI-detected low-res photos
                                      if (
                                        photoAnalysisComplete &&
                                        actualLowResAnalyses.length > 0
                                      ) {
                                        return (
                                          <div>
                                            <div className="flex items-center gap-2 mb-3">
                                              <h4 className="text-sm font-medium">
                                                Resolution Quality Issues
                                              </h4>
                                              <Badge
                                                variant="secondary"
                                                className="text-xs bg-amber-500/20 text-amber-400 border-amber-500/30"
                                              >
                                                {actualLowResAnalyses.length}{" "}
                                                photos need attention
                                              </Badge>
                                            </div>
                                            <div className="flex flex-wrap gap-2 mb-2">
                                              {actualLowResAnalyses.map(
                                                (analysis: any) => {
                                                  const photo =
                                                    photos[analysis.photoIndex];
                                                  if (!photo) return null;
                                                  return renderPhotoThumbnail(
                                                    photo,
                                                    analysis.photoIndex,
                                                    "border-amber-500/50",
                                                  );
                                                },
                                              )}
                                            </div>
                                            <p className="text-sm text-muted-foreground">
                                              These photos have Good or lower
                                              resolution ratings. Consider
                                              replacing with higher quality
                                              images for better visual appeal.
                                            </p>
                                          </div>
                                        );
                                      }

                                      // After analysis with no low-res photos - show success message
                                      if (
                                        photoAnalysisComplete &&
                                        actualLowResAnalyses.length === 0
                                      ) {
                                        return (
                                          <div>
                                            <div className="flex items-center gap-2 mb-3">
                                              <h4 className="text-sm font-medium">
                                                Resolution Quality
                                              </h4>
                                              <Badge
                                                variant="secondary"
                                                className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                              >
                                                <CheckCircle className="w-3 h-3 mr-1" />
                                                All high resolution
                                              </Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground">
                                              All photos are rated High
                                              Resolution. Great work on photo
                                              quality!
                                            </p>
                                          </div>
                                        );
                                      }

                                      // No analysis yet - don't show anything
                                      return null;
                                    })()}

                                    {/* 4. AI Edited Photos - User-saved AI edits */}
                                    {(() => {
                                      const aiEditedPhotos =
                                        photoAnalyses.filter(
                                          (a: any) => a.aiEditedUrl,
                                        );

                                      if (aiEditedPhotos.length === 0)
                                        return null;

                                      return (
                                        <div>
                                          <div className="flex items-center gap-2 mb-3">
                                            <Sparkles className="w-4 h-4 text-purple-500" />
                                            <h4 className="text-sm font-medium">
                                              AI Edited Photos
                                            </h4>
                                            <Badge
                                              variant="secondary"
                                              className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30"
                                            >
                                              {aiEditedPhotos.length} saved
                                            </Badge>
                                          </div>
                                          <div className="flex flex-wrap gap-2 mb-2">
                                            {aiEditedPhotos.map(
                                              (analysis: any) => (
                                                <button
                                                  key={analysis.id}
                                                  onClick={() => {
                                                    setSelectedPhotoIndex(
                                                      analysis.photoIndex,
                                                    );
                                                    setShowPhotoAnalysis(true);
                                                  }}
                                                  className="relative group w-16 h-16 rounded-md overflow-visible border-2 border-purple-500/50 hover-elevate cursor-pointer"
                                                  data-testid={`button-ai-edited-${analysis.photoIndex}`}
                                                >
                                                  <img
                                                    src={analysis.aiEditedUrl}
                                                    alt={`AI Edited ${analysis.photoIndex + 1}`}
                                                    className="w-full h-full object-cover rounded-md"
                                                  />
                                                  <div className="absolute -top-1 -right-1 bg-purple-500 rounded-full p-0.5">
                                                    <Sparkles className="w-2.5 h-2.5 text-white" />
                                                  </div>
                                                </button>
                                              ),
                                            )}
                                          </div>
                                          <p className="text-sm text-muted-foreground">
                                            Photos you've enhanced with AI.
                                            Click to view or download.
                                          </p>
                                        </div>
                                      );
                                    })()}

                                    {/* 5. Remaining Photos */}
                                    {remainingPhotos.length > 0 && (
                                      <div>
                                        <h4 className="text-sm font-medium mb-3">
                                          Additional Photos (
                                          {remainingPhotos.length})
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                          {remainingPhotos.map((photo, i) =>
                                            renderPhotoThumbnail(photo, i + 5),
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}

                              {/* Positive / Needs Action - AI Generated */}
                              {(() => {
                                const photosAnalysisData =
                                  listing?.analysis?.photosAnalysis;
                                const photoPositives =
                                  photosAnalysisData?.photoPositives || [];
                                const photoNeedsAction =
                                  photosAnalysisData?.photoNeedsAction || [];

                                // Default bullets when AI hasn't analyzed yet
                                const defaultPositives = [
                                  "Photos are being analyzed for strengths",
                                  "AI insights will appear here",
                                  "Check back after analysis completes",
                                ];
                                const defaultNeedsAction = [
                                  "Photos are being analyzed for improvements",
                                  "AI insights will appear here",
                                  "Check back after analysis completes",
                                ];

                                const displayPositives =
                                  photoPositives.length > 0
                                    ? photoPositives
                                    : isAnalyzingPhotos
                                      ? defaultPositives
                                      : [
                                          "Run photo analysis to see AI insights",
                                        ];
                                const displayNeedsAction =
                                  photoNeedsAction.length > 0
                                    ? photoNeedsAction
                                    : isAnalyzingPhotos
                                      ? defaultNeedsAction
                                      : [
                                          "Run photo analysis to see AI insights",
                                        ];

                                return (
                                  <div className="grid md:grid-cols-2 gap-4">
                                    <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                      <div className="flex items-center gap-2 mb-2">
                                        <h4 className="text-sm font-medium text-emerald-400">
                                          Positive
                                        </h4>
                                        {isAnalyzingPhotos &&
                                          photoPositives.length === 0 && (
                                            <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                                          )}
                                      </div>
                                      <ul className="space-y-1 text-sm text-muted-foreground">
                                        {displayPositives
                                          .slice(0, 3)
                                          .map((item: string, i: number) => (
                                            <li
                                              key={i}
                                              className="flex items-start gap-2"
                                            >
                                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0"></span>
                                              <span
                                                className={
                                                  isAnalyzingPhotos &&
                                                  photoPositives.length === 0
                                                    ? "italic text-emerald-400/60"
                                                    : ""
                                                }
                                              >
                                                {item}
                                              </span>
                                            </li>
                                          ))}
                                      </ul>
                                    </div>
                                    <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                      <div className="flex items-center gap-2 mb-2">
                                        <h4 className="text-sm font-medium text-amber-400">
                                          Needs Action
                                        </h4>
                                        {isAnalyzingPhotos &&
                                          photoNeedsAction.length === 0 && (
                                            <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                                          )}
                                      </div>
                                      <ul className="space-y-1 text-sm text-muted-foreground">
                                        {displayNeedsAction
                                          .slice(0, 3)
                                          .map((item: string, i: number) => (
                                            <li
                                              key={i}
                                              className="flex items-start gap-2"
                                            >
                                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0"></span>
                                              <span
                                                className={
                                                  isAnalyzingPhotos &&
                                                  photoNeedsAction.length === 0
                                                    ? "italic text-amber-400/60"
                                                    : ""
                                                }
                                              >
                                                {item}
                                              </span>
                                            </li>
                                          ))}
                                      </ul>
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Mark as Complete Button */}
                              <div className="flex justify-end">
                                <Button
                                  variant={
                                    analysis?.completedCategories?.includes(
                                      "photos",
                                    )
                                      ? "default"
                                      : "outline"
                                  }
                                  onClick={() =>
                                    markCategoryCompleteMutation.mutate(
                                      "photos",
                                    )
                                  }
                                  disabled={
                                    markCategoryCompleteMutation.isPending
                                  }
                                  data-testid="button-mark-photos-complete"
                                >
                                  <Check className="w-4 h-4 mr-2" />
                                  {analysis?.completedCategories?.includes(
                                    "photos",
                                  )
                                    ? "Completed"
                                    : "Mark as Complete"}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      }

                      // Title Analysis View
                      if (selectedCategory === "title") {
                        return (
                          <Card className="border-purple-500/30">
                            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-3">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setSelectedCategory(null)}
                                  data-testid="button-back-title"
                                >
                                  <ArrowLeft className="w-4 h-4" />
                                </Button>
                                <div>
                                  <CardTitle className="flex items-center gap-2">
                                    <Type className="w-5 h-5 text-purple-500" />
                                    Listing Title
                                  </CardTitle>
                                  <CardDescription>
                                    Analysis of your current listing title
                                    effectiveness
                                  </CardDescription>
                                </div>
                              </div>
                              <GradeBadge
                                grade={selectedGrade as any}
                                size="lg"
                              />
                            </CardHeader>
                            <CardContent className="space-y-6">
                              {/* Current Title */}
                              <div>
                                <h4 className="text-sm font-medium mb-2">
                                  Current Title
                                </h4>
                                <p className="text-lg font-medium p-3 rounded-lg bg-muted">
                                  {listing?.headline ||
                                    listing?.name ||
                                    "No title set"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {
                                    (listing?.headline || listing?.name || "")
                                      .length
                                  }{" "}
                                  / 50 characters
                                </p>
                              </div>

                              {/* Analysis */}
                              {selectedAnalysis?.feedback && (
                                <div>
                                  <h4 className="text-sm font-medium mb-2">
                                    Analysis
                                  </h4>
                                  <p className="text-sm text-muted-foreground">
                                    {selectedAnalysis.feedback}
                                  </p>
                                </div>
                              )}

                              {/* Generate Title Button */}
                              <div className="p-4 rounded-lg border border-dashed bg-muted/30">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <div>
                                    <h4 className="text-sm font-medium">
                                      Generate AI Titles
                                    </h4>
                                    <p className="text-xs text-muted-foreground">
                                      Get 10 optimized title suggestions based
                                      on your Ideal Guest Profile
                                    </p>
                                  </div>
                                  <Button
                                    className="bg-purple-600"
                                    data-testid="button-generate-titles"
                                    onClick={() =>
                                      generateTitlesMutation.mutate()
                                    }
                                    disabled={generateTitlesMutation.isPending}
                                  >
                                    {generateTitlesMutation.isPending ? (
                                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                      <Sparkles className="w-4 h-4 mr-2" />
                                    )}
                                    {generateTitlesMutation.isPending
                                      ? "Generating..."
                                      : generatedTitles.length > 0
                                        ? `Regenerate Titles${generatedTitles.some((t) => t.pinned) ? ` (keep ${generatedTitles.filter((t) => t.pinned).length} pinned)` : ""}`
                                        : "Generate Listing Titles"}
                                  </Button>
                                </div>
                              </div>

                              {/* Generated Titles */}
                              {generatedTitles.length > 0 && (
                                <div>
                                  <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-sm font-medium">
                                      AI-Generated Titles
                                    </h4>
                                    {generatedTitles.some((t) => t.pinned) && (
                                      <Badge
                                        variant="outline"
                                        className="text-xs"
                                      >
                                        <Pin className="w-3 h-3 mr-1" />
                                        {
                                          generatedTitles.filter(
                                            (t) => t.pinned,
                                          ).length
                                        }{" "}
                                        pinned
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    {generatedTitles.map((item, i) => (
                                      <div
                                        key={i}
                                        className={`p-3 rounded-lg border ${item.pinned ? "border-purple-500/50 bg-purple-500/10" : "bg-muted/30"}`}
                                      >
                                        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                                          <div className="flex items-center gap-2">
                                            {item.pinned && (
                                              <Pin className="w-3 h-3 text-purple-500" />
                                            )}
                                            <p className="font-medium text-sm">
                                              {item.title}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <Badge
                                              variant="secondary"
                                              className="text-xs"
                                            >
                                              {item.charCount ||
                                                item.title.length}{" "}
                                              chars
                                            </Badge>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => {
                                                setGeneratedTitles((prev) =>
                                                  prev.map((t, idx) =>
                                                    idx === i
                                                      ? {
                                                          ...t,
                                                          pinned: !t.pinned,
                                                        }
                                                      : t,
                                                  ),
                                                );
                                                toast({
                                                  title: item.pinned
                                                    ? "Unpinned"
                                                    : "Pinned",
                                                  description: item.pinned
                                                    ? "Title will be replaced on regeneration."
                                                    : "Title will be preserved on regeneration.",
                                                });
                                              }}
                                              data-testid={`button-pin-title-${i}`}
                                            >
                                              {item.pinned ? (
                                                <PinOff className="w-4 h-4 text-purple-500" />
                                              ) : (
                                                <Pin className="w-4 h-4" />
                                              )}
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => {
                                                navigator.clipboard.writeText(
                                                  item.title,
                                                );
                                                toast({
                                                  title: "Copied!",
                                                  description:
                                                    "Title copied to clipboard.",
                                                });
                                              }}
                                              data-testid={`button-copy-title-${i}`}
                                            >
                                              <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                              >
                                                <rect
                                                  width="14"
                                                  height="14"
                                                  x="8"
                                                  y="8"
                                                  rx="2"
                                                  ry="2"
                                                />
                                                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                                              </svg>
                                            </Button>
                                          </div>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                          {item.reasoning}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Suggestions */}
                              {selectedAnalysis?.suggestions &&
                                selectedAnalysis.suggestions.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-medium mb-2">
                                      Suggestions
                                    </h4>
                                    <ul className="space-y-2">
                                      {selectedAnalysis.suggestions.map(
                                        (suggestion, i) => (
                                          <li
                                            key={i}
                                            className="flex items-start gap-2 text-sm text-muted-foreground"
                                          >
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 flex-shrink-0"></span>
                                            {suggestion}
                                          </li>
                                        ),
                                      )}
                                    </ul>
                                  </div>
                                )}

                              <div className="flex justify-end">
                                <Button
                                  variant={
                                    analysis?.completedCategories?.includes(
                                      "title",
                                    )
                                      ? "default"
                                      : "outline"
                                  }
                                  onClick={() =>
                                    markCategoryCompleteMutation.mutate("title")
                                  }
                                  disabled={
                                    markCategoryCompleteMutation.isPending
                                  }
                                  data-testid="button-mark-title-complete"
                                >
                                  <Check className="w-4 h-4 mr-2" />
                                  {analysis?.completedCategories?.includes(
                                    "title",
                                  )
                                    ? "Completed"
                                    : "Mark as Complete"}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      }

                      // Pet Friendly View
                      if (selectedCategory === "pet") {
                        const houseRules = listing?.houseRules as {
                          pets_allowed?: boolean;
                        } | null;
                        const hasPets = houseRules?.pets_allowed === true;

                        return (
                          <Card className="border-purple-500/30">
                            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-3">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setSelectedCategory(null)}
                                  data-testid="button-back-pet"
                                >
                                  <ArrowLeft className="w-4 h-4" />
                                </Button>
                                <div>
                                  <CardTitle className="flex items-center gap-2">
                                    <PawPrint className="w-5 h-5 text-purple-500" />
                                    Pet Friendly
                                  </CardTitle>
                                  <CardDescription>
                                    Evaluate your listing's appeal to pet owners
                                  </CardDescription>
                                </div>
                              </div>
                              <GradeBadge
                                grade={selectedGrade as any}
                                size="lg"
                              />
                            </CardHeader>
                            <CardContent className="space-y-6">
                              {/* Pet Status */}
                              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted">
                                <div
                                  className={`w-12 h-12 rounded-full flex items-center justify-center ${
                                    hasPets
                                      ? "bg-emerald-500/20"
                                      : "bg-red-500/20"
                                  }`}
                                >
                                  <PawPrint
                                    className={`w-6 h-6 ${hasPets ? "text-emerald-500" : "text-red-500"}`}
                                  />
                                </div>
                                <div>
                                  <p className="font-medium">
                                    {hasPets
                                      ? "Pets Allowed"
                                      : "Pets Not Allowed"}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {hasPets
                                      ? "Your listing welcomes pets. See how to improve your pet-friendly appeal."
                                      : "Consider allowing pets to attract more bookings."}
                                  </p>
                                </div>
                              </div>

                              {/* Why This Matters */}
                              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                <div className="flex items-center gap-2 mb-2">
                                  <Info className="w-4 h-4 text-blue-500" />
                                  <span className="text-sm font-medium text-blue-400">
                                    Why This Matters
                                  </span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  Pet-friendly listings receive 20-30% more
                                  bookings. Guests traveling with pets are often
                                  willing to pay premium rates and tend to leave
                                  positive reviews when their furry companions
                                  are accommodated.
                                </p>
                              </div>

                              {/* Analysis */}
                              {selectedAnalysis?.feedback && (
                                <div>
                                  <h4 className="text-sm font-medium mb-2">
                                    Analysis
                                  </h4>
                                  <p className="text-sm text-muted-foreground">
                                    {selectedAnalysis.feedback}
                                  </p>
                                </div>
                              )}

                              {/* Pinned Pet Photos - Show AI edited photos with pets added */}
                              {photoAnalyses.filter((p: any) => p.aiEditedUrl)
                                .length > 0 && (
                                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <Check className="w-4 h-4 text-emerald-500" />
                                      <h4 className="text-sm font-medium text-emerald-400">
                                        Pinned Pet Photos
                                      </h4>
                                      <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">
                                        {
                                          photoAnalyses.filter(
                                            (p: any) => p.aiEditedUrl,
                                          ).length
                                        }{" "}
                                        saved
                                      </Badge>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-emerald-500/50 text-emerald-400"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        const pinnedPhotos =
                                          photoAnalyses.filter(
                                            (p: any) => p.aiEditedUrl,
                                          );
                                        if (pinnedPhotos.length === 0) return;

                                        try {
                                          const response = await fetch(
                                            `/api/listings/${listingId}/download-pinned-photos`,
                                            {
                                              method: "POST",
                                              credentials: "include",
                                            },
                                          );
                                          if (!response.ok)
                                            throw new Error("Download failed");
                                          const blob = await response.blob();
                                          const url =
                                            window.URL.createObjectURL(blob);
                                          const link =
                                            document.createElement("a");
                                          link.href = url;
                                          link.download = `pinned-photos-${(listingId || "photos").slice(0, 8)}.zip`;
                                          document.body.appendChild(link);
                                          link.click();
                                          document.body.removeChild(link);
                                          window.URL.revokeObjectURL(url);
                                          toast({
                                            title: "Downloaded!",
                                            description: `${pinnedPhotos.length} pinned photos saved to your downloads.`,
                                          });
                                        } catch {
                                          toast({
                                            title: "Download Failed",
                                            description:
                                              "Could not download photos. Please try again.",
                                            variant: "destructive",
                                          });
                                        }
                                      }}
                                      data-testid="button-download-all-pinned"
                                    >
                                      <Download className="w-3 h-3 mr-1" />
                                      Download All
                                    </Button>
                                  </div>
                                  <p className="text-xs text-muted-foreground mb-3">
                                    These photos have been enhanced with
                                    friendly pets. Download them to update your
                                    listing.
                                  </p>
                                  <div className="flex flex-wrap gap-3">
                                    {photoAnalyses
                                      .filter((p: any) => p.aiEditedUrl)
                                      .map((photo: any) => (
                                        <div
                                          key={photo.id}
                                          className="relative group cursor-pointer"
                                          data-testid={`pinned-pet-photo-${photo.photoIndex}`}
                                        >
                                          <img
                                            src={photo.aiEditedUrl}
                                            alt={`Pet enhanced photo ${photo.photoIndex + 1}`}
                                            className="w-20 h-20 object-cover rounded-md border-2 border-emerald-500"
                                            onClick={() => {
                                              setSelectedPinnedPhoto({
                                                photoIndex: photo.photoIndex,
                                                originalUrl:
                                                  photos[photo.photoIndex] ||
                                                  "",
                                                enhancedUrl: photo.aiEditedUrl,
                                                prompt: photo.aiEditedPrompt,
                                              });
                                              setShowPinnedPhotoViewer(true);
                                            }}
                                          />
                                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                                            <PawPrint className="w-3 h-3 text-white" />
                                          </div>
                                          <button
                                            className="absolute bottom-1 right-1 w-6 h-6 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const link =
                                                document.createElement("a");
                                              link.href = photo.aiEditedUrl;
                                              link.download = `pet-photo-${photo.photoIndex + 1}.png`;
                                              document.body.appendChild(link);
                                              link.click();
                                              document.body.removeChild(link);
                                              toast({
                                                title: "Downloaded!",
                                                description:
                                                  "Photo saved to your downloads.",
                                              });
                                            }}
                                            data-testid={`button-download-pinned-${photo.photoIndex}`}
                                          >
                                            <Download className="w-3 h-3 text-white" />
                                          </button>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              )}

                              {/* Photo Gallery - Add pets to your photos */}
                              {photos.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-2 mb-3">
                                    <Camera className="w-4 h-4 text-purple-500" />
                                    <h4 className="text-sm font-medium">
                                      Your Photos
                                    </h4>
                                    <Badge
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      Click to add pet themes
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground mb-3">
                                    Click any photo to add a friendly dog and
                                    show guests your property is pet-welcoming.
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {photos.map((photo, index) => {
                                      const hasAiEdit = photoAnalyses.some(
                                        (p: any) =>
                                          p.photoIndex === index &&
                                          p.aiEditedUrl,
                                      );
                                      return (
                                        <button
                                          key={index}
                                          onClick={() => {
                                            setSelectedPhotoIndex(index);
                                            setShowPetPhotoEnhance(true);
                                          }}
                                          className={`relative group w-16 h-16 rounded-md overflow-visible border hover-elevate cursor-pointer ${hasAiEdit ? "border-emerald-500 border-2" : ""}`}
                                          data-testid={`button-pet-photo-${index}`}
                                        >
                                          <img
                                            src={photo}
                                            alt={`Photo ${index + 1}`}
                                            className="w-full h-full object-cover rounded-md"
                                          />
                                          {hasAiEdit && (
                                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                                              <Check className="w-2.5 h-2.5 text-white" />
                                            </div>
                                          )}
                                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center">
                                            <PawPrint className="w-5 h-5 text-white" />
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Grading Note */}
                              <div className="p-4 rounded-lg border">
                                <h4 className="text-sm font-medium mb-2">
                                  Grading Criteria
                                </h4>
                                <ul className="space-y-2 text-sm text-muted-foreground">
                                  <li className="flex items-center gap-2">
                                    <span className="font-medium text-red-400">
                                      F
                                    </span>
                                    <span>Pets not allowed</span>
                                  </li>
                                  <li className="flex items-center gap-2">
                                    <span className="font-medium text-amber-400">
                                      C
                                    </span>
                                    <span>
                                      Pets allowed, but no pet-specific
                                      marketing
                                    </span>
                                  </li>
                                  <li className="flex items-center gap-2">
                                    <span className="font-medium text-emerald-400">
                                      A-B
                                    </span>
                                    <span>
                                      Actively markets pet amenities and
                                      highlights pet-friendly features
                                    </span>
                                  </li>
                                </ul>
                              </div>

                              <div className="flex justify-end">
                                <Button
                                  variant={
                                    analysis?.completedCategories?.includes(
                                      "pet",
                                    )
                                      ? "default"
                                      : "outline"
                                  }
                                  onClick={() =>
                                    markCategoryCompleteMutation.mutate("pet")
                                  }
                                  disabled={
                                    markCategoryCompleteMutation.isPending
                                  }
                                  data-testid="button-mark-pet-complete"
                                >
                                  <Check className="w-4 h-4 mr-2" />
                                  {analysis?.completedCategories?.includes(
                                    "pet",
                                  )
                                    ? "Completed"
                                    : "Mark as Complete"}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      }

                      // Description View
                      if (selectedCategory === "description") {
                        return (
                          <Card className="border-purple-500/30">
                            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-3">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setSelectedCategory(null)}
                                  data-testid="button-back-description"
                                >
                                  <ArrowLeft className="w-4 h-4" />
                                </Button>
                                <div>
                                  <CardTitle className="flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-purple-500" />
                                    Listing Description
                                  </CardTitle>
                                  <CardDescription>
                                    Analysis of your listing description and
                                    content
                                  </CardDescription>
                                </div>
                              </div>
                              <GradeBadge
                                grade={selectedGrade as any}
                                size="lg"
                              />
                            </CardHeader>
                            <CardContent className="space-y-6">
                              {/* Summary (About This Space) - Collapsible */}
                              {listing?.summary && (
                                <details
                                  className="group border rounded-lg"
                                  open
                                  data-testid="details-summary-section"
                                >
                                  <summary
                                    className="flex items-center justify-between cursor-pointer text-sm font-medium p-3 hover-elevate rounded-lg"
                                    data-testid="summary-summary-toggle"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span>Summary (About This Space)</span>
                                      <span className="text-xs text-muted-foreground">
                                        ({listing.summary.length} chars)
                                      </span>
                                    </div>
                                    <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                                  </summary>
                                  <div className="p-4 border-t bg-muted/50 max-h-48 overflow-y-auto">
                                    <p
                                      className="text-sm whitespace-pre-wrap"
                                      data-testid="text-summary-content"
                                    >
                                      {listing.summary}
                                    </p>
                                  </div>
                                </details>
                              )}

                              {/* Current Description (The Space) - Collapsible */}
                              {listing?.description && (
                                <details
                                  className="group border rounded-lg"
                                  open
                                  data-testid="details-description-section"
                                >
                                  <summary
                                    className="flex items-center justify-between cursor-pointer text-sm font-medium p-3 hover-elevate rounded-lg"
                                    data-testid="summary-description-toggle"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span>Description (The Space)</span>
                                      <span className="text-xs text-muted-foreground">
                                        ({listing.description.length} chars)
                                      </span>
                                    </div>
                                    <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                                  </summary>
                                  <div className="p-4 border-t bg-muted/50 max-h-48 overflow-y-auto">
                                    <p
                                      className="text-sm whitespace-pre-wrap"
                                      data-testid="text-description-content"
                                    >
                                      {listing.description}
                                    </p>
                                  </div>
                                </details>
                              )}

                              {/* Show placeholder if neither exists */}
                              {!listing?.summary && !listing?.description && (
                                <div
                                  className="p-4 rounded-lg border border-dashed bg-muted/30 text-center text-muted-foreground"
                                  data-testid="placeholder-no-description"
                                >
                                  <p className="text-sm">
                                    No description or summary content available
                                    yet.
                                  </p>
                                  <p className="text-xs mt-1">
                                    Sync your listing to pull content from
                                    Hospitable.
                                  </p>
                                </div>
                              )}

                              {/* Generate Content Button */}
                              <div className="p-4 rounded-lg border border-dashed bg-muted/30">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <div>
                                    <h4 className="text-sm font-medium">
                                      Generate AI Content
                                    </h4>
                                    <p className="text-xs text-muted-foreground">
                                      Create optimized About (500 chars) and The
                                      Space (1500 chars) sections
                                    </p>
                                  </div>
                                  <Button
                                    className="bg-purple-600"
                                    data-testid="button-generate-content"
                                    onClick={() =>
                                      generateDescriptionMutation.mutate()
                                    }
                                    disabled={
                                      generateDescriptionMutation.isPending
                                    }
                                  >
                                    {generateDescriptionMutation.isPending ? (
                                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                      <Sparkles className="w-4 h-4 mr-2" />
                                    )}
                                    {generateDescriptionMutation.isPending
                                      ? "Generating..."
                                      : "Generate Content"}
                                  </Button>
                                </div>
                              </div>

                              {/* Generated Content */}
                              {generatedDescription && (
                                <div className="space-y-4">
                                  {generatedDescription.aboutThisSpace && (
                                    <div className="p-4 rounded-lg border bg-muted/30">
                                      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                                        <h4 className="text-sm font-medium">
                                          About This Space
                                        </h4>
                                        <div className="flex items-center gap-2">
                                          <Badge
                                            variant="secondary"
                                            className="text-xs"
                                          >
                                            {generatedDescription.aboutThisSpace
                                              .charCount ||
                                              generatedDescription
                                                .aboutThisSpace.content
                                                .length}{" "}
                                            chars
                                          </Badge>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                              navigator.clipboard.writeText(
                                                generatedDescription
                                                  .aboutThisSpace?.content ||
                                                  "",
                                              );
                                              toast({
                                                title: "Copied!",
                                                description:
                                                  "About section copied to clipboard.",
                                              });
                                            }}
                                            data-testid="button-copy-about"
                                          >
                                            <svg
                                              xmlns="http://www.w3.org/2000/svg"
                                              width="14"
                                              height="14"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="2"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                            >
                                              <rect
                                                width="14"
                                                height="14"
                                                x="8"
                                                y="8"
                                                rx="2"
                                                ry="2"
                                              />
                                              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                                            </svg>
                                          </Button>
                                        </div>
                                      </div>
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                        {
                                          generatedDescription.aboutThisSpace
                                            .content
                                        }
                                      </p>
                                    </div>
                                  )}

                                  {generatedDescription.theSpace && (
                                    <div className="p-4 rounded-lg border bg-muted/30">
                                      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                                        <h4 className="text-sm font-medium">
                                          The Space
                                        </h4>
                                        <div className="flex items-center gap-2">
                                          <Badge
                                            variant="secondary"
                                            className="text-xs"
                                          >
                                            {generatedDescription.theSpace
                                              .charCount ||
                                              generatedDescription.theSpace
                                                .content.length}{" "}
                                            chars
                                          </Badge>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                              navigator.clipboard.writeText(
                                                generatedDescription.theSpace
                                                  ?.content || "",
                                              );
                                              toast({
                                                title: "Copied!",
                                                description:
                                                  "The Space section copied to clipboard.",
                                              });
                                            }}
                                            data-testid="button-copy-space"
                                          >
                                            <svg
                                              xmlns="http://www.w3.org/2000/svg"
                                              width="14"
                                              height="14"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="2"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                            >
                                              <rect
                                                width="14"
                                                height="14"
                                                x="8"
                                                y="8"
                                                rx="2"
                                                ry="2"
                                              />
                                              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                                            </svg>
                                          </Button>
                                        </div>
                                      </div>
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                        {generatedDescription.theSpace.content}
                                      </p>
                                    </div>
                                  )}

                                  {generatedDescription.keySellingPoints &&
                                    generatedDescription.keySellingPoints
                                      .length > 0 && (
                                      <div>
                                        <h4 className="text-sm font-medium mb-2">
                                          Key Selling Points
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                          {generatedDescription.keySellingPoints.map(
                                            (point, i) => (
                                              <Badge key={i} variant="outline">
                                                {point}
                                              </Badge>
                                            ),
                                          )}
                                        </div>
                                      </div>
                                    )}

                                  {/* Compare Button */}
                                  <div className="flex justify-end pt-2">
                                    <Button
                                      variant="outline"
                                      onClick={() =>
                                        setShowDescriptionCompare(true)
                                      }
                                      data-testid="button-compare-description"
                                    >
                                      <ArrowLeft className="w-4 h-4 mr-1" />
                                      <ArrowRight className="w-4 h-4 mr-2" />
                                      Compare
                                    </Button>
                                  </div>
                                </div>
                              )}

                              {/* Suggestions */}
                              {selectedAnalysis?.suggestions &&
                                selectedAnalysis.suggestions.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-medium mb-2">
                                      Suggestions
                                    </h4>
                                    <ul className="space-y-2">
                                      {selectedAnalysis.suggestions.map(
                                        (suggestion, i) => (
                                          <li
                                            key={i}
                                            className="flex items-start gap-2 text-sm text-muted-foreground"
                                          >
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 flex-shrink-0"></span>
                                            {suggestion}
                                          </li>
                                        ),
                                      )}
                                    </ul>
                                  </div>
                                )}

                              <div className="flex justify-end">
                                <Button
                                  variant={
                                    analysis?.completedCategories?.includes(
                                      "description",
                                    )
                                      ? "default"
                                      : "outline"
                                  }
                                  onClick={() =>
                                    markCategoryCompleteMutation.mutate(
                                      "description",
                                    )
                                  }
                                  disabled={
                                    markCategoryCompleteMutation.isPending
                                  }
                                  data-testid="button-mark-description-complete"
                                >
                                  <Check className="w-4 h-4 mr-2" />
                                  {analysis?.completedCategories?.includes(
                                    "description",
                                  )
                                    ? "Completed"
                                    : "Mark as Complete"}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      }

                      // Ideal Guest Profile Aligned View - Spider Chart (idp already prefers igpResult when available)
                      if (selectedCategory === "ideal") {
                        const guestTypes = idp?.guestTypes || [];
                        // Get alignment scores from staged progress or from saved analysis
                        const alignmentScores =
                          stagedAnalysisProgress.igpResult?.alignmentScores ||
                          (idp as any)?.alignmentScores ||
                          [];
                        const isAlignmentPending =
                          stagedAnalysisProgress.isActive &&
                          guestTypes.length > 0 &&
                          alignmentScores.length === 0;

                        return (
                          <IGPSpiderChart
                            guestTypes={guestTypes}
                            analysis={selectedAnalysis}
                            grade={selectedGrade}
                            onBack={() => setSelectedCategory(null)}
                            alignmentScores={alignmentScores}
                            isAlignmentPending={isAlignmentPending}
                          />
                        );
                      }

                      // Reviews category with detailed review data
                      if (selectedCategory === "reviews") {
                        // Get reservations with reviews
                        const reviewsData = reservations
                          .filter((r) => r.publicReview || r.guestRating)
                          .sort((a, b) => {
                            const dateA = a.reviewPostedAt
                              ? new Date(a.reviewPostedAt).getTime()
                              : 0;
                            const dateB = b.reviewPostedAt
                              ? new Date(b.reviewPostedAt).getTime()
                              : 0;
                            return dateB - dateA;
                          });

                        // Calculate review stats
                        const totalReviews = reviewsData.length;
                        const avgRating =
                          totalReviews > 0
                            ? reviewsData.reduce(
                                (sum, r) => sum + (r.guestRating || 0),
                                0,
                              ) / totalReviews
                            : 0;
                        const fiveStarCount = reviewsData.filter(
                          (r) => r.guestRating === 5,
                        ).length;
                        const fiveStarPercent =
                          totalReviews > 0
                            ? Math.round((fiveStarCount / totalReviews) * 100)
                            : 0;

                        // Parse positives and needs action from AI analysis
                        const positives: string[] = [];
                        const needsAction: string[] = [];

                        if (selectedAnalysis?.feedback) {
                          // Extract positive feedback
                          positives.push(
                            avgRating >= 4.8
                              ? `Excellent ${avgRating.toFixed(1)} overall rating demonstrates consistent quality`
                              : avgRating >= 4.5
                                ? `Strong ${avgRating.toFixed(1)} overall rating shows good guest satisfaction`
                                : `${avgRating.toFixed(1)} rating indicates room for improvement`,
                          );
                          if (totalReviews > 50) {
                            positives.push(
                              `${totalReviews} reviews provides strong social proof`,
                            );
                          }
                          if (fiveStarPercent >= 90) {
                            positives.push(
                              `High volume of 5-star reviews builds trust`,
                            );
                          }
                        }

                        if (selectedAnalysis?.suggestions) {
                          needsAction.push(...selectedAnalysis.suggestions);
                        }

                        return (
                          <Card className="border-purple-500/30">
                            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-3">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setSelectedCategory(null)}
                                  data-testid="button-back-reviews"
                                >
                                  <ArrowLeft className="w-4 h-4" />
                                </Button>
                                <div>
                                  <CardTitle className="flex items-center gap-2">
                                    <MessageSquare className="w-5 h-5 text-purple-500" />
                                    Reviews
                                  </CardTitle>
                                  <CardDescription>
                                    {avgRating.toFixed(1)} rating,{" "}
                                    {totalReviews} reviews, {fiveStarPercent}%
                                    5-star
                                  </CardDescription>
                                </div>
                              </div>
                              <GradeBadge
                                grade={selectedGrade as any}
                                size="lg"
                              />
                            </CardHeader>
                            <CardContent className="space-y-6">
                              {/* Current Stats */}
                              <div>
                                <p className="text-sm font-medium text-muted-foreground mb-2">
                                  Current
                                </p>
                                <p className="text-lg font-semibold">
                                  {avgRating.toFixed(1)} rating, {totalReviews}{" "}
                                  reviews, {fiveStarPercent}% 5-star
                                </p>
                              </div>

                              {/* Why This Matters */}
                              <div className="p-3 rounded-lg bg-muted/50 border">
                                <div className="flex items-center gap-2 mb-1">
                                  <Info className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-sm font-medium">
                                    Why This Matters
                                  </span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  Reviews are social proof that influences
                                  booking decisions. A high rating combined with
                                  volume builds trust with potential guests.
                                </p>
                              </div>

                              {/* Rating Scale Legend */}
                              <div>
                                <p className="text-sm font-medium mb-3">
                                  Rating Scale
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  <Badge className="bg-emerald-500 text-white">
                                    A 4.8+
                                  </Badge>
                                  <Badge className="bg-blue-500 text-white">
                                    B 4.6 - 4.7
                                  </Badge>
                                  <Badge className="bg-yellow-500 text-black">
                                    C 4.3 - 4.5
                                  </Badge>
                                  <Badge className="bg-orange-500 text-white">
                                    D 4.0 - 4.2
                                  </Badge>
                                  <Badge className="bg-red-500 text-white">
                                    F &lt;4.0
                                  </Badge>
                                </div>
                              </div>

                              {/* Most Recent Reviews */}
                              <div>
                                <p className="text-sm font-medium mb-3">
                                  Most Recent Reviews
                                </p>
                                <div className="space-y-3">
                                  {reviewsData
                                    .slice(0, 6)
                                    .map((review, idx) => (
                                      <div
                                        key={review.id}
                                        className="flex items-start gap-3"
                                        data-testid={`review-item-${idx}`}
                                      >
                                        <div className="flex items-center flex-shrink-0">
                                          {[...Array(5)].map((_, i) => (
                                            <Star
                                              key={i}
                                              className={`w-3 h-3 ${i < (review.guestRating || 0) ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`}
                                            />
                                          ))}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium text-sm">
                                              {review.guestName || "Guest"}
                                            </span>
                                            {review.reviewPostedAt && (
                                              <span className="text-xs text-muted-foreground">
                                                {format(
                                                  new Date(
                                                    review.reviewPostedAt,
                                                  ),
                                                  "MMM d, yyyy",
                                                )}
                                              </span>
                                            )}
                                          </div>
                                          {review.publicReview && (
                                            <p className="text-sm text-muted-foreground line-clamp-2">
                                              {review.publicReview}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  {reviewsData.length === 0 && (
                                    <p className="text-sm text-muted-foreground">
                                      No reviews found. Sync reservations to
                                      import reviews.
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Positive / Needs Action Cards */}
                              <div className="grid gap-4 md:grid-cols-2">
                                {/* Positive */}
                                <div className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-3">
                                    Positive
                                  </p>
                                  <ul className="space-y-2">
                                    {positives.map((item, i) => (
                                      <li
                                        key={i}
                                        className="flex items-start gap-2 text-sm text-muted-foreground"
                                      >
                                        <span className="w-1 h-1 rounded-full bg-emerald-500 mt-2 flex-shrink-0"></span>
                                        {item}
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                {/* Needs Action */}
                                <div className="p-4 rounded-lg border border-orange-500/30 bg-orange-500/5">
                                  <p className="text-sm font-medium text-orange-600 dark:text-orange-400 mb-3">
                                    Needs Action
                                  </p>
                                  <ul className="space-y-2">
                                    {needsAction.length > 0 ? (
                                      needsAction.slice(0, 3).map((item, i) => (
                                        <li
                                          key={i}
                                          className="flex items-start gap-2 text-sm text-muted-foreground"
                                        >
                                          <span className="w-1 h-1 rounded-full bg-orange-500 mt-2 flex-shrink-0"></span>
                                          {item}
                                        </li>
                                      ))
                                    ) : (
                                      <li className="text-sm text-muted-foreground">
                                        No action items identified
                                      </li>
                                    )}
                                  </ul>
                                </div>
                              </div>

                              {/* Re-Run Analysis Button */}
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  onClick={startStagedAnalysis}
                                  disabled={
                                    stagedAnalysisProgress.isActive ||
                                    analyzeMutation.isPending
                                  }
                                  data-testid="button-rerun-analysis-staged"
                                >
                                  {stagedAnalysisProgress.isActive ? (
                                    <>
                                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                      {stagedAnalysisProgress.stageMessage ||
                                        "Analyzing..."}
                                    </>
                                  ) : (
                                    <>
                                      <RefreshCw className="w-4 h-4 mr-2" />
                                      Re-Run Analysis
                                    </>
                                  )}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      }

                      // Where You'll Sleep Analysis View with Vision Analysis
                      if (selectedCategory === "sleep") {
                        const sleepAnalysis = selectedAnalysis as any;
                        const roomAnalyses = sleepAnalysis?.roomAnalyses || [];
                        const sleepRooms =
                          airbnbScan?.whereYoullSleep?.rooms || [];

                        return (
                          <Card className="border-purple-500/30">
                            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-3">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setSelectedCategory(null)}
                                  data-testid="button-back-sleep"
                                >
                                  <ArrowLeft className="w-4 h-4" />
                                </Button>
                                <div>
                                  <CardTitle className="flex items-center gap-2">
                                    <Moon className="w-5 h-5 text-purple-500" />
                                    Where You'll Sleep
                                  </CardTitle>
                                  <CardDescription>
                                    {Math.max(
                                      sleepRooms.length,
                                      roomAnalyses.length,
                                    )}{" "}
                                    bedrooms analyzed with AI Vision
                                  </CardDescription>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <GradeBadge
                                  grade={selectedGrade as any}
                                  size="lg"
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    analyzeCategoryMutation.mutate("sleep")
                                  }
                                  disabled={
                                    analyzeCategoryMutation.isPending ||
                                    stagedAnalysisProgress.isActive
                                  }
                                  data-testid="button-rerun-category-sleep"
                                >
                                  {analyzeCategoryMutation.isPending ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <RefreshCw className="w-3 h-3" />
                                  )}
                                  <span className="ml-1">Re-run category</span>
                                </Button>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-6">
                              {sleepAnalysis?.feedback && (
                                <div className="p-4 rounded-lg bg-muted/50 border">
                                  <h4 className="text-sm font-medium mb-2">
                                    Overall Assessment
                                  </h4>
                                  <p className="text-sm text-muted-foreground">
                                    {sleepAnalysis.feedback}
                                  </p>
                                </div>
                              )}

                              {sleepAnalysis?.capacityMatch !== undefined && (
                                <div className="flex items-center gap-4">
                                  <div
                                    className={`px-3 py-1 rounded-full text-sm ${sleepAnalysis.capacityMatch ? "bg-emerald-500/20 text-emerald-500" : "bg-amber-500/20 text-amber-500"}`}
                                  >
                                    {sleepAnalysis.capacityMatch
                                      ? "Capacity Matches"
                                      : "Capacity Mismatch"}
                                  </div>
                                  {sleepAnalysis.totalSleepCapacity && (
                                    <span className="text-sm text-muted-foreground">
                                      Total capacity:{" "}
                                      {sleepAnalysis.totalSleepCapacity} guests
                                    </span>
                                  )}
                                </div>
                              )}

                              <div className="space-y-4">
                                <h4 className="text-sm font-medium">
                                  Bedroom Analysis
                                </h4>
                                <div className="grid gap-4 md:grid-cols-2">
                                  {(() => {
                                    // Merge data from sleepRooms (scraper: has photoUrl, name, bedConfiguration) and roomAnalyses (AI)
                                    const roomsToDisplay =
                                      roomAnalyses.length > 0
                                        ? roomAnalyses.map((r: any) => {
                                            const scanRoom = sleepRooms.find(
                                              (s: any) =>
                                                (s.name || "") ===
                                                (r.roomName || r.name || ""),
                                            );
                                            return {
                                              ...r,
                                              photoUrl:
                                                r.photoUrl ||
                                                scanRoom?.photoUrl,
                                              roomName: r.roomName || r.name,
                                            };
                                          })
                                        : sleepRooms.map((r: any) => ({
                                            ...r,
                                            roomName: r.name,
                                            photoUrl: r.photoUrl,
                                          }));

                                    if (roomsToDisplay.length === 0) {
                                      return (
                                        <div className="col-span-2 p-4 text-center text-muted-foreground text-sm">
                                          No bedroom data available yet.
                                        </div>
                                      );
                                    }

                                    return roomsToDisplay.map(
                                      (room: any, idx: number) => {
                                        // Get vision analysis - check both room.visionAnalysis and try to match by name
                                        const roomName =
                                          room.roomName ||
                                          room.name ||
                                          `Bedroom ${idx + 1}`;
                                        const vision =
                                          room.visionAnalysis ||
                                          roomAnalyses.find(
                                            (r: any) =>
                                              (r.roomName || r.name) ===
                                                roomName ||
                                              (r.roomName || r.name) ===
                                                room.name,
                                          )?.visionAnalysis;
                                        const photoUrl = room.photoUrl;
                                        const bedConfig =
                                          room.bedConfiguration || "";

                                        return (
                                          <div
                                            key={idx}
                                            className="border rounded-lg overflow-hidden"
                                            data-testid={`card-bedroom-analysis-${idx}`}
                                          >
                                            {photoUrl ? (
                                              <div className="relative h-32">
                                                <img
                                                  src={photoUrl}
                                                  alt={roomName}
                                                  className="w-full h-full object-cover"
                                                />
                                                {vision?.sellingScore && (
                                                  <div
                                                    className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium ${
                                                      vision.sellingScore >= 8
                                                        ? "bg-emerald-500 text-white"
                                                        : vision.sellingScore >=
                                                            6
                                                          ? "bg-blue-500 text-white"
                                                          : vision.sellingScore >=
                                                              4
                                                            ? "bg-amber-500 text-white"
                                                            : "bg-red-500 text-white"
                                                    }`}
                                                  >
                                                    {vision.sellingScore}/10
                                                  </div>
                                                )}
                                              </div>
                                            ) : (
                                              <div className="h-24 bg-muted/50 flex items-center justify-center">
                                                <Moon className="w-8 h-8 text-muted-foreground/30" />
                                              </div>
                                            )}
                                            <div className="p-3 space-y-2">
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="font-medium text-sm truncate">
                                                  {roomName}
                                                </span>
                                                {vision?.bedTypeMatch !==
                                                  undefined && (
                                                  <Badge
                                                    variant={
                                                      vision.bedTypeMatch
                                                        ? "default"
                                                        : "destructive"
                                                    }
                                                    className="text-[10px] flex-shrink-0"
                                                  >
                                                    {vision.bedTypeMatch
                                                      ? "Matches"
                                                      : "Mismatch"}
                                                  </Badge>
                                                )}
                                              </div>
                                              {bedConfig && (
                                                <p className="text-xs text-muted-foreground">
                                                  {bedConfig}
                                                </p>
                                              )}

                                              {vision ? (
                                                <div className="pt-2 border-t space-y-2">
                                                  <div className="flex flex-wrap gap-1.5">
                                                    {vision.photoQuality && (
                                                      <Badge
                                                        variant="outline"
                                                        className={`text-[10px] ${
                                                          vision.photoQuality ===
                                                          "excellent"
                                                            ? "border-emerald-500 text-emerald-500"
                                                            : vision.photoQuality ===
                                                                "good"
                                                              ? "border-blue-500 text-blue-500"
                                                              : "border-amber-500 text-amber-500"
                                                        }`}
                                                      >
                                                        {vision.photoQuality}
                                                      </Badge>
                                                    )}
                                                    {vision.bedMadeNicely && (
                                                      <Badge
                                                        variant="outline"
                                                        className="text-[10px] border-emerald-500 text-emerald-500"
                                                      >
                                                        Bed Made
                                                      </Badge>
                                                    )}
                                                    {vision.hasQualityLinens && (
                                                      <Badge
                                                        variant="outline"
                                                        className="text-[10px] border-emerald-500 text-emerald-500"
                                                      >
                                                        Quality Linens
                                                      </Badge>
                                                    )}
                                                  </div>
                                                  {vision.detectedBedType && (
                                                    <p className="text-xs text-muted-foreground">
                                                      Detected:{" "}
                                                      {vision.detectedBedType}
                                                    </p>
                                                  )}
                                                  {vision.suggestions &&
                                                    vision.suggestions.length >
                                                      0 && (
                                                      <div className="pt-1">
                                                        <p className="text-xs font-medium text-amber-500 mb-1">
                                                          Suggestions:
                                                        </p>
                                                        <ul className="text-xs text-muted-foreground space-y-0.5">
                                                          {vision.suggestions
                                                            .slice(0, 2)
                                                            .map(
                                                              (
                                                                s: string,
                                                                i: number,
                                                              ) => (
                                                                <li
                                                                  key={i}
                                                                  className="flex items-start gap-1"
                                                                >
                                                                  <span className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 flex-shrink-0"></span>
                                                                  {s}
                                                                </li>
                                                              ),
                                                            )}
                                                        </ul>
                                                      </div>
                                                    )}
                                                </div>
                                              ) : (
                                                !photoUrl && (
                                                  <p className="text-xs text-muted-foreground italic pt-2 border-t">
                                                    No photo available for
                                                    vision analysis
                                                  </p>
                                                )
                                              )}
                                            </div>
                                          </div>
                                        );
                                      },
                                    );
                                  })()}
                                </div>
                              </div>

                              {/* {sleepRooms.length === 0 && roomAnalyses.length === 0 && (
                            <div className="p-6 rounded-lg bg-muted/50 border border-dashed text-center" data-testid="sleep-analysis-pending">
                              <div className="flex flex-col items-center gap-3">
                                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                                <p className="text-sm text-muted-foreground">
                                  Scanning Airbnb listing for sleeping arrangements...
                                </p>
                              </div>
                            </div>
                          )} */}

                              {(sleepAnalysis?.strengths?.length > 0 ||
                                sleepAnalysis?.suggestions?.length > 0) && (
                                <div className="grid gap-4 md:grid-cols-2">
                                  {sleepAnalysis.strengths?.length > 0 && (
                                    <div className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                                      <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-2">
                                        Strengths
                                      </p>
                                      <ul className="space-y-1.5">
                                        {sleepAnalysis.strengths
                                          .slice(0, 3)
                                          .map((s: string, i: number) => (
                                            <li
                                              key={i}
                                              className="flex items-start gap-2 text-xs text-muted-foreground"
                                            >
                                              <span className="w-1 h-1 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0"></span>
                                              {s}
                                            </li>
                                          ))}
                                      </ul>
                                    </div>
                                  )}
                                  {sleepAnalysis.suggestions?.length > 0 && (
                                    <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
                                      <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">
                                        Improvements
                                      </p>
                                      <ul className="space-y-1.5">
                                        {sleepAnalysis.suggestions
                                          .slice(0, 3)
                                          .map((s: string, i: number) => (
                                            <li
                                              key={i}
                                              className="flex items-start gap-2 text-xs text-muted-foreground"
                                            >
                                              <span className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 flex-shrink-0"></span>
                                              {s}
                                            </li>
                                          ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      }

                      // Default category view for others
                      return (
                        <Card className="border-purple-500/30">
                          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-3">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setSelectedCategory(null)}
                                data-testid={`button-back-${selectedCategory}`}
                              >
                                <ArrowLeft className="w-4 h-4" />
                              </Button>
                              <div>
                                <CardTitle className="flex items-center gap-2">
                                  {selectedConfig?.icon && (
                                    <selectedConfig.icon className="w-5 h-5 text-purple-500" />
                                  )}
                                  {selectedConfig?.label}
                                </CardTitle>
                                <CardDescription>
                                  {selectedAnalysis?.feedback ||
                                    "Analysis details for this category"}
                                </CardDescription>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <GradeBadge
                                grade={selectedGrade as any}
                                size="lg"
                              />
                              {selectedCategory && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const apiCat =
                                      categoryToApiName[selectedCategory];
                                    if (
                                      selectedCategory === "sleep" ||
                                      selectedCategory === "superhost"
                                    ) {
                                      toast({
                                        title: "Use full analysis",
                                        description:
                                          "Where You'll Sleep and Host Profile require a full analysis to refresh (they need a fresh Airbnb scan).",
                                      });
                                    } else if (apiCat) {
                                      analyzeCategoryMutation.mutate(apiCat);
                                    } else if (
                                      selectedCategory === "ideal" ||
                                      selectedCategory === "photos"
                                    ) {
                                      toast({
                                        title: "Use full analysis",
                                        description:
                                          "Re-run the full analysis to refresh this category.",
                                      });
                                    }
                                  }}
                                  disabled={
                                    analyzeCategoryMutation.isPending ||
                                    stagedAnalysisProgress.isActive
                                  }
                                  data-testid={`button-rerun-category-${selectedCategory}`}
                                >
                                  {analyzeCategoryMutation.isPending ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <RefreshCw className="w-3 h-3" />
                                  )}
                                  <span className="ml-1">Re-run category</span>
                                </Button>
                              )}
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {selectedCategory === "superhost" &&
                              (airbnbScan?.hostProfile ||
                                (selectedAnalysis as any)?.photoUrl) &&
                              (() => {
                                const hp = airbnbScan?.hostProfile;
                                const ai = selectedAnalysis as any;
                                const photoUrl = ai?.photoUrl || hp?.photoUrl;
                                const name = ai?.hostName || hp?.name || "Host";
                                return (
                                  <div
                                    className="flex items-start gap-4 p-3 rounded-lg bg-muted/50"
                                    data-testid="host-profile-photo-analysis"
                                  >
                                    {photoUrl && (
                                      <Avatar className="w-16 h-16 border-2 border-muted">
                                        <AvatarImage
                                          src={photoUrl}
                                          alt={name}
                                        />
                                        <AvatarFallback>
                                          {name?.charAt(0) || "H"}
                                        </AvatarFallback>
                                      </Avatar>
                                    )}
                                    <div className="flex-1 space-y-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-medium">
                                          {name}
                                        </span>
                                        {hp?.isSuperhost && (
                                          <Badge className="bg-amber-500 text-white text-[10px]">
                                            <Crown className="w-3 h-3 mr-1" />
                                            Superhost
                                          </Badge>
                                        )}
                                        {hp?.verified && (
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] text-emerald-600 border-emerald-500/30"
                                          >
                                            <CheckCircle className="w-3 h-3 mr-1" />
                                            Verified
                                          </Badge>
                                        )}
                                        {ai?.isHeadshot !== undefined &&
                                          (ai.isHeadshot ? (
                                            <Badge
                                              variant="secondary"
                                              className="text-[10px]"
                                            >
                                              <CheckCircle className="w-3 h-3 mr-1" />
                                              Headshot Verified
                                            </Badge>
                                          ) : (
                                            <Badge
                                              variant="outline"
                                              className="text-[10px] text-amber-500 border-amber-500/30"
                                            >
                                              Not a Headshot
                                            </Badge>
                                          ))}
                                        {ai?.isWarmInviting && (
                                          <Badge
                                            variant="secondary"
                                            className="text-[10px]"
                                          >
                                            Warm & Inviting
                                          </Badge>
                                        )}
                                      </div>
                                      {hp && (
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground">
                                          {hp.yearsHosting !== undefined && (
                                            <span>
                                              <span className="font-medium text-foreground">
                                                {hp.yearsHosting}
                                              </span>{" "}
                                              years hosting
                                            </span>
                                          )}
                                          {hp.reviewCount !== undefined && (
                                            <span>
                                              <span className="font-medium text-foreground">
                                                {hp.reviewCount}
                                              </span>{" "}
                                              reviews
                                            </span>
                                          )}
                                          {hp.responseRate && (
                                            <span>
                                              <span className="font-medium text-foreground">
                                                {hp.responseRate}
                                              </span>{" "}
                                              response rate
                                            </span>
                                          )}
                                          {hp.responseTime && (
                                            <span>
                                              Responds {hp.responseTime}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      {ai?.photoAssessment && (
                                        <p className="text-xs text-muted-foreground">
                                          {ai.photoAssessment}
                                        </p>
                                      )}
                                      {hp?.aboutText && (
                                        <p className="text-sm text-muted-foreground pt-2 line-clamp-4">
                                          {hp.aboutText}
                                        </p>
                                      )}
                                      {ai && (
                                        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground pt-1">
                                          {ai.hasDetailedBio !== undefined && (
                                            <span
                                              className={
                                                ai.hasDetailedBio
                                                  ? "text-emerald-500"
                                                  : "text-muted-foreground"
                                              }
                                            >
                                              {ai.hasDetailedBio
                                                ? "Detailed Bio"
                                                : "No Detailed Bio"}
                                            </span>
                                          )}
                                          {ai.personalityAttributeCount !==
                                            undefined && (
                                            <span>
                                              {ai.personalityAttributeCount}{" "}
                                              Personality Sections
                                            </span>
                                          )}
                                          {ai.hasTrustBuildingContent !==
                                            undefined && (
                                            <span
                                              className={
                                                ai.hasTrustBuildingContent
                                                  ? "text-emerald-500"
                                                  : "text-muted-foreground"
                                              }
                                            >
                                              {ai.hasTrustBuildingContent
                                                ? "Trust-Building Content"
                                                : "No Trust-Building Content"}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}

                            {selectedCategory === "sleep" &&
                              (selectedAnalysis as any)?.roomAnalyses?.length >
                                0 &&
                              (() => {
                                const sleepData = selectedAnalysis as any;
                                return (
                                  <div
                                    className="space-y-3"
                                    data-testid="sleep-room-analyses"
                                  >
                                    <h4 className="text-sm font-medium">
                                      Room-by-Room Photo Analysis
                                    </h4>
                                    {sleepData.roomAnalyses.map(
                                      (room: any, i: number) => (
                                        <div
                                          key={i}
                                          className="p-3 rounded-lg bg-muted/50 space-y-1"
                                        >
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium">
                                              {room.roomName}
                                            </span>
                                            {room.bedsMatchDescription ? (
                                              <Badge
                                                variant="secondary"
                                                className="text-[10px]"
                                              >
                                                <CheckCircle className="w-3 h-3 mr-1" />
                                                Beds Match
                                              </Badge>
                                            ) : (
                                              <Badge
                                                variant="outline"
                                                className="text-[10px] text-amber-500 border-amber-500/30"
                                              >
                                                Mismatch
                                              </Badge>
                                            )}
                                          </div>
                                          {room.bedConfiguration && (
                                            <p className="text-xs text-muted-foreground">
                                              Listed: {room.bedConfiguration}
                                            </p>
                                          )}
                                          {room.discrepancyNotes &&
                                            room.discrepancyNotes !==
                                              "none" && (
                                              <p className="text-xs text-amber-500">
                                                {room.discrepancyNotes}
                                              </p>
                                            )}
                                          {room.assessment && (
                                            <p className="text-xs text-muted-foreground italic">
                                              {room.assessment}
                                            </p>
                                          )}
                                        </div>
                                      ),
                                    )}
                                  </div>
                                );
                              })()}

                            {selectedAnalysis?.feedback && (
                              <div>
                                <h4 className="text-sm font-medium mb-2">
                                  Analysis
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  {selectedAnalysis.feedback}
                                </p>
                              </div>
                            )}

                            {selectedAnalysis?.suggestions &&
                              selectedAnalysis.suggestions.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-medium mb-2">
                                    Suggestions
                                  </h4>
                                  <ul className="space-y-2">
                                    {selectedAnalysis.suggestions.map(
                                      (suggestion, i) => (
                                        <li
                                          key={i}
                                          className="flex items-start gap-2 text-sm text-muted-foreground"
                                        >
                                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 flex-shrink-0"></span>
                                          {suggestion}
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                </div>
                              )}

                            {[
                              "host_profile",
                              "guest_favorites",
                              "superhost",
                            ].includes(selectedCategory) &&
                              !selectedAnalysis?.feedback && (
                                <div
                                  className="p-6 rounded-lg bg-muted/50 border border-dashed text-center"
                                  data-testid="analysis-in-progress"
                                >
                                  <div className="flex flex-col items-center gap-3">
                                    <div className="relative">
                                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                                      </div>
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-foreground mb-1">
                                        Analysis In Progress
                                      </p>
                                      <p className="text-xs text-muted-foreground max-w-sm">
                                        This section will be available soon.
                                        We're working on gathering additional
                                        data.
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}
                          </CardContent>
                        </Card>
                      );
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>

            {!scoresClearedForRerun &&
              analysis?.suggestions &&
              (analysis.suggestions as string[]).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="w-5 h-5 text-amber-500" />
                      Top Suggestions
                    </CardTitle>
                    <CardDescription>
                      AI-generated recommendations to improve your listing
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {(analysis?.suggestions as string[])?.map(
                        (suggestion, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-3"
                            data-testid={`text-suggestion-${i}`}
                          >
                            <span
                              className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                                i === 0
                                  ? "bg-emerald-500/20 text-emerald-500"
                                  : "bg-amber-500/20 text-amber-500"
                              }`}
                            >
                              {i + 1}
                            </span>
                            <span className="text-sm">{suggestion}</span>
                          </li>
                        ),
                      )}
                    </ul>
                  </CardContent>
                </Card>
              )}
          </TabsContent>

          <TabsContent value="reservations" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by guest name..."
                  value={reservationSearch}
                  onChange={(e) => setReservationSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-reservation-search"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={channelFilter} onValueChange={setChannelFilter}>
                  <SelectTrigger
                    className="w-[140px]"
                    data-testid="select-channel"
                  >
                    <SelectValue placeholder="All channels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All channels</SelectItem>
                    {uniqueChannels.map((channel) => (
                      <SelectItem key={channel} value={channel}>
                        {channel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger
                    className="w-[140px]"
                    data-testid="select-status"
                  >
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {uniqueStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {reservationsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredReservations.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Calendar className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">
                    {reservations.length === 0
                      ? "No reservations synced yet. Sync your property to see reservation data."
                      : "No reservations match your filters."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Guest Name</TableHead>
                      <TableHead>Reservation ID</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Check In</TableHead>
                      <TableHead>Check Out</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReservations.map((reservation) => (
                      <TableRow
                        key={reservation.id}
                        className="cursor-pointer hover-elevate"
                        onClick={() => {
                          setSelectedReservation(reservation);
                        }}
                        data-testid={`row-reservation-${reservation.id}`}
                      >
                        <TableCell className="font-medium">
                          {reservation.guestName || "Guest"}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {reservation.confirmationCode ||
                            reservation.externalId ||
                            "-"}
                        </TableCell>
                        <TableCell>{reservation.platform}</TableCell>
                        <TableCell>
                          {formatDate(reservation.checkInDate)}
                        </TableCell>
                        <TableCell>
                          {formatDate(reservation.checkOutDate)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">
                            {reservation.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {reservation.tags?.slice(0, 3).map((tag) => (
                              <Badge
                                key={tag.id}
                                className={`text-xs ${getTagColor(tag.sentiment || undefined)}`}
                              >
                                {tag.name}
                              </Badge>
                            ))}
                            {reservation.tags &&
                              reservation.tags.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{reservation.tags.length - 3}
                                </Badge>
                              )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="tags">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Target className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  View all tags on the Tags page from the sidebar.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  View all tasks on the Tasks page from the sidebar.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reviews">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  Reviews from synced reservations will appear here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ReservationDetailSheet
        open={!!selectedReservation}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedReservation(null);
          }
        }}
        reservation={selectedReservation}
        listing={{
          name: listing.headline || listing.name,
          address: listing.address || "",
          imageUrl: listing.imageUrl || undefined,
        }}
      />

      <Sheet
        open={showIdpSheet}
        onOpenChange={(open) => {
          setShowIdpSheet(open);
          if (!open) idpSheetClosedByUserRef.current = true;
        }}
      >
        <SheetContent className="sm:max-w-xl md:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Ideal Guest Profile
            </SheetTitle>
            <SheetDescription>
              AI-generated profile of your ideal guest based on review analysis
            </SheetDescription>
          </SheetHeader>

          {idp && (
            <div className="mt-6 space-y-6">
              {/* Analysis Stats */}
              <div
                className="flex flex-wrap items-center gap-4 p-3 rounded-lg bg-primary/5 border border-primary/10"
                data-testid="idp-stats"
              >
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-primary" />
                  <span className="text-sm">
                    <span
                      className="font-medium"
                      data-testid="stat-reservations"
                    >
                      {stagedAnalysisProgress.reservationCount ??
                        listing?.analysis?.reservationCount ??
                        0}
                    </span>{" "}
                    reservations
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <span className="text-sm">
                    <span className="font-medium" data-testid="stat-reviews">
                      {stagedAnalysisProgress.reviewCount ??
                        listing?.analysis?.reviewCount ??
                        0}
                    </span>{" "}
                    reviews
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span
                    className="text-xs text-muted-foreground"
                    data-testid="stat-updated"
                  >
                    Updated{" "}
                    {listing?.analysis?.analyzedAt
                      ? new Date(
                          listing.analysis.analyzedAt,
                        ).toLocaleDateString()
                      : "N/A"}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-muted/50">
                <p
                  className="text-sm leading-relaxed"
                  data-testid="text-idp-summary"
                >
                  {typeof idp.summary === "string" ? idp.summary : ""}
                </p>
              </div>

              {Array.isArray(idp.guestTypes) && idp.guestTypes.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    Guest Types by Review Analysis
                  </h4>
                  <div className="space-y-4">
                    {idp.guestTypes.map((guestType, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-lg bg-muted/30 border border-border/50"
                        data-testid={`guest-type-${i}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            {getGuestTypeIcon(guestType.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-sm font-medium">
                                {guestType.name}
                              </span>
                              <Badge
                                variant="secondary"
                                data-testid={`badge-guest-type-percent-${i}`}
                              >
                                {guestType.percentage ?? 0}%
                              </Badge>
                            </div>
                            <Progress
                              value={guestType.percentage ?? 0}
                              className="h-1.5 mb-2"
                            />
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {guestType.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Array.isArray((idp as any).reservationBreakdown) &&
                (idp as any).reservationBreakdown.length > 0 && (
                  <div>
                    <button
                      onClick={() =>
                        setShowReservationBreakdown(!showReservationBreakdown)
                      }
                      className="w-full flex items-center justify-between gap-2 text-sm font-medium mb-3 hover-elevate p-2 rounded-md"
                      data-testid="button-toggle-reservation-breakdown"
                    >
                      <div className="flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-muted-foreground" />
                        Reservation Breakdown (
                        {(idp as any).reservationBreakdown.length})
                      </div>
                      {showReservationBreakdown ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                    {showReservationBreakdown && (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {(
                          (idp as any).reservationBreakdown as Array<{
                            guestName: string;
                            checkIn: string;
                            checkOut: string;
                            summary: string;
                            matchedProfile: string;
                          }>
                        ).map((res, i) => (
                          <div
                            key={i}
                            className="p-3 rounded-lg bg-muted/30 border border-border/50"
                            data-testid={`reservation-breakdown-${i}`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-medium truncate">
                                  {res.guestName}
                                </span>
                                <span className="text-xs text-muted-foreground flex-shrink-0">
                                  {res.checkIn
                                    ? new Date(res.checkIn).toLocaleDateString()
                                    : ""}{" "}
                                  -{" "}
                                  {res.checkOut
                                    ? new Date(
                                        res.checkOut,
                                      ).toLocaleDateString()
                                    : ""}
                                </span>
                              </div>
                              <Badge
                                variant="secondary"
                                className="flex-shrink-0"
                                data-testid={`badge-reservation-profile-${i}`}
                              >
                                {res.matchedProfile}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {res.summary}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              <div className="space-y-4">
                {Array.isArray(idp.demographics) &&
                  idp.demographics.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        Demographics
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {idp.demographics.map((item, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            data-testid={`badge-demographic-${i}`}
                          >
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                {Array.isArray(idp.travelPurposes) &&
                  idp.travelPurposes.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Plane className="w-4 h-4 text-muted-foreground" />
                        Travel Purposes
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {idp.travelPurposes.map((item, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            data-testid={`badge-travel-${i}`}
                          >
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    Seasonal Patterns
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {(Array.isArray(idp.seasonalPatterns) &&
                      idp.seasonalPatterns.map((item, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          data-testid={`badge-season-${i}`}
                        >
                          {item}
                        </Badge>
                      ))) || (
                      <span className="text-sm text-muted-foreground">
                        Not available
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Heart className="w-4 h-4 text-muted-foreground" />
                    Guest Preferences
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {(Array.isArray(idp.guestPreferences) &&
                      idp.guestPreferences.map((item, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          data-testid={`badge-preference-${i}`}
                        >
                          {item}
                        </Badge>
                      ))) || (
                      <span className="text-sm text-muted-foreground">
                        Not available
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Star className="w-4 h-4 text-muted-foreground" />
                    Unique Selling Points
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {(Array.isArray(idp.uniqueSellingPoints) &&
                      idp.uniqueSellingPoints.map((item, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          data-testid={`badge-usp-${i}`}
                        >
                          {item}
                        </Badge>
                      ))) || (
                      <span className="text-sm text-muted-foreground">
                        Not available
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <PhotoAnalysisSheet
        open={
          showPhotoAnalysis &&
          selectedPhotoIndex !== null &&
          !!(listing.images && listing.images.length > 0)
        }
        onOpenChange={setShowPhotoAnalysis}
        listingId={listing.id}
        photoIndex={selectedPhotoIndex ?? 0}
        photoUrl={
          (listing.images && selectedPhotoIndex !== null
            ? listing.images[selectedPhotoIndex]
            : "") || ""
        }
        totalPhotos={listing.images?.length ?? 0}
      />
      {listing.images &&
        listing.images.length > 0 &&
        selectedPhotoIndex !== null && (
          <PetPhotoEnhanceSheet
            open={showPetPhotoEnhance}
            onOpenChange={setShowPetPhotoEnhance}
            listingId={listing.id}
            photoIndex={selectedPhotoIndex}
            photoUrl={listing.images[selectedPhotoIndex] || ""}
            existingEnhancedUrl={
              photoAnalyses.find(
                (a: any) => a.photoIndex === selectedPhotoIndex,
              )?.aiEditedUrl
            }
            existingPrompt={
              photoAnalyses.find(
                (a: any) => a.photoIndex === selectedPhotoIndex,
              )?.aiEditedPrompt
            }
          />
        )}

      {selectedPinnedPhoto && (
        <PinnedPhotoViewer
          open={showPinnedPhotoViewer}
          onOpenChange={setShowPinnedPhotoViewer}
          listingId={listing.id}
          photoIndex={selectedPinnedPhoto.photoIndex}
          originalUrl={selectedPinnedPhoto.originalUrl}
          enhancedUrl={selectedPinnedPhoto.enhancedUrl}
          prompt={selectedPinnedPhoto.prompt}
        />
      )}

      {generatedDescription && (
        <DescriptionCompareDialog
          open={showDescriptionCompare}
          onOpenChange={setShowDescriptionCompare}
          currentDescription={listing.description || ""}
          generatedDescription={generatedDescription}
          listingId={listing.id}
        />
      )}
    </div>
  );
}
