import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { 
  Download,
  Database,
  Layers,
  Check,
  Loader2,
  Sparkles,
  Lightbulb,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  RefreshCw,
  X
} from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export type SyncStage = "data_sync" | "confirmation" | "ai_analysis" | "themes" | "complete" | "error";

const AI_INSIGHTS = [
  "Guests who mention cleanliness in reviews are 40% more likely to rebook the same property.",
  "Properties that respond to messages within 1 hour see 35% higher booking rates.",
  "Listings with 5+ high-quality photos get 2x more inquiries than those with fewer.",
  "Adding local recommendations to your guidebook can increase your review scores by 0.3 stars.",
  "Guests appreciate when hosts proactively share check-in instructions 24 hours before arrival.",
  "Properties with flexible cancellation policies receive 20% more bookings on average.",
  "Mentioning pet-friendly amenities in your listing attracts 30% more family travelers.",
  "Quick responses to negative reviews can improve future guest perception by up to 45%.",
  "Seasonal pricing adjustments can increase annual revenue by 15-25% without losing bookings.",
  "Guests who receive a personalized welcome message rate their stay 0.5 stars higher on average."
];

interface SyncProgressModalProps {
  isOpen: boolean;
  listingNames: string[];
  currentStage?: SyncStage;
  stats?: {
    reservationsSynced?: number;
    reviewsSynced?: number;
    conversationsSynced?: number;
    totalReservationsToAnalyze?: number;
    reservationsAnalyzed?: number;
    tagsCreated?: number;
    tasksCreated?: number;
    themesCreated?: number;
  };
  onComplete?: () => void;
  isViewOnly?: boolean;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onRetry?: () => void;
  onDismissError?: () => void;
}

const stages: SyncStage[] = ["data_sync", "confirmation", "ai_analysis", "themes"];

export function SyncProgressModal({ 
  isOpen, 
  listingNames,
  currentStage = "data_sync",
  stats = {},
  onComplete,
  isViewOnly = false,
  isMinimized = false,
  onMinimize,
  onMaximize,
  onRetry,
  onDismissError
}: SyncProgressModalProps) {
  const [stage, setStage] = useState<SyncStage>(currentStage);
  const [hasCalledComplete, setHasCalledComplete] = useState(false);
  const [currentInsightIndex, setCurrentInsightIndex] = useState(0);
  const [insightVisible, setInsightVisible] = useState(true);

  const isAIStage = stage === "ai_analysis" || stage === "themes";

  useEffect(() => {
    if (!isOpen || !isAIStage) {
      setCurrentInsightIndex(0);
      return;
    }

    const rotateInsight = () => {
      setInsightVisible(false);
      setTimeout(() => {
        setCurrentInsightIndex(prev => (prev + 1) % AI_INSIGHTS.length);
        setInsightVisible(true);
      }, 300);
    };

    const interval = setInterval(rotateInsight, 5000);
    return () => clearInterval(interval);
  }, [isOpen, isAIStage]);

  useEffect(() => {
    setStage(currentStage);
  }, [currentStage]);

  // Trigger onComplete when stage becomes "complete" (one-time guard)
  useEffect(() => {
    if (stage === "complete" && isOpen && onComplete && !hasCalledComplete) {
      setHasCalledComplete(true);
      const timer = setTimeout(() => {
        onComplete();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [stage, isOpen, onComplete, hasCalledComplete]);

  // Reset the guard when modal closes
  useEffect(() => {
    if (!isOpen) {
      setHasCalledComplete(false);
    }
  }, [isOpen]);

  // Calculate actual progress based on stages and real data
  const calculateProgress = (): number => {
    if (stage === "complete") return 100;
    if (stage === "error") return 0; // Error state shows 0% progress
    
    const stageIndex = stages.indexOf(stage);
    if (stageIndex === -1) return 0; // Safety check for unknown stages
    
    const stageWeight = 100 / stages.length; // Each stage is 25%
    const baseProgress = stageIndex * stageWeight;
    
    // For AI analysis, calculate progress based on reservations analyzed
    if (stage === "ai_analysis") {
      // If we have total count and reservations analyzed, use actual progress
      if (stats.totalReservationsToAnalyze && stats.totalReservationsToAnalyze > 0) {
        const analysisProgress = (stats.reservationsAnalyzed || 0) / stats.totalReservationsToAnalyze;
        return baseProgress + (stageWeight * analysisProgress);
      }
      // If waiting for init data, show small initial progress (10%)
      return baseProgress + (stageWeight * 0.1);
    }
    
    // For data_sync, show incremental progress
    if (stage === "data_sync") {
      const hasAnyData = (stats.reservationsSynced || 0) > 0 || 
                          (stats.reviewsSynced || 0) > 0 || 
                          (stats.conversationsSynced || 0) > 0;
      // Show 30% at start, 80% when we have data
      return baseProgress + (stageWeight * (hasAnyData ? 0.8 : 0.3));
    }
    
    if (stage === "confirmation") {
      // Show 70% through confirmation stage
      return baseProgress + (stageWeight * 0.7);
    }
    
    if (stage === "themes") {
      // Show 80% through themes stage (almost done)
      return baseProgress + (stageWeight * 0.8);
    }
    
    return baseProgress;
  };

  const progress = calculateProgress();

  const getStageIcon = (s: SyncStage, isActive: boolean) => {
    const baseClass = "w-3.5 h-3.5";
    const animClass = isActive ? "animate-pulse" : "";
    
    switch (s) {
      case "data_sync":
        return <Download className={`${baseClass} text-primary ${animClass}`} />;
      case "confirmation":
        return <Database className={`${baseClass} text-primary ${animClass}`} />;
      case "ai_analysis":
        return <Sparkles className={`${baseClass} text-violet-500 ${animClass}`} />;
      case "themes":
        return <Layers className={`${baseClass} text-violet-500 ${animClass}`} />;
      case "complete":
        return <Check className={`${baseClass} text-emerald-500`} />;
      case "error":
        return <AlertCircle className={`${baseClass} text-destructive`} />;
    }
  };

  const getStageLabel = (s: SyncStage, isComplete: boolean, isActive: boolean) => {
    switch (s) {
      case "data_sync":
        if (isComplete) {
          const total = stats.reservationsSynced || 0;
          return `Found ${total} reservations`;
        }
        return "Finding reservations";
      case "confirmation":
        if (isComplete) {
          return "Stored reservations, reviews, conversations";
        }
        return "Storing reservations, reviews, conversations";
      case "ai_analysis":
        if (isComplete && stats.tagsCreated !== undefined) {
          return `Created ${stats.tagsCreated} tags, ${stats.tasksCreated || 0} tasks`;
        }
        if (stats.totalReservationsToAnalyze && stats.totalReservationsToAnalyze > 0) {
          const analyzed = stats.reservationsAnalyzed || 0;
          return `AI Analysis: ${analyzed} of ${stats.totalReservationsToAnalyze} complete`;
        }
        return "AI Analysis starting...";
      case "themes":
        if (isComplete && stats.themesCreated !== undefined) {
          return `Assigned ${stats.themesCreated} themes`;
        }
        return "Assigning themes";
      case "complete":
        return "Sync Complete!";
      case "error":
        return "Sync Error";
    }
  };

  const getStageDescription = (s: SyncStage, isActive: boolean) => {
    if (!isActive) return null;
    switch (s) {
      case "data_sync":
        return "Pulling reservations from Hospitable...";
      case "confirmation":
        return "Storing reservations, reviews, and conversations...";
      case "ai_analysis":
        return "Reading guest feedback to identify patterns and create actionable insights...";
      case "themes":
        return "Matching tags to themes for organized feedback...";
      default:
        return null;
    }
  };

  const displayName = listingNames.length > 1 
    ? `${listingNames.length} Properties` 
    : listingNames[0] || "Properties";

  // Get a friendly stage description for minimized view
  const getMinimizedStatus = () => {
    if (stage === "complete") return "Done!";
    if (stage === "error") return "Error - Click for options";
    if (stage === "data_sync") return "Finding reservations...";
    if (stage === "confirmation") return "Storing data...";
    if (stage === "ai_analysis") {
      if (stats.totalReservationsToAnalyze && stats.totalReservationsToAnalyze > 0) {
        const analyzed = stats.reservationsAnalyzed || 0;
        return `AI: ${analyzed}/${stats.totalReservationsToAnalyze} complete`;
      }
      return "AI Analysis starting...";
    }
    if (stage === "themes") return "Assigning themes...";
    return `${Math.round(progress)}%`;
  };

  // If minimized, show compact bar in bottom-right corner (same width as expanded modal)
  if (isMinimized) {
    return (
      <div 
        className="bg-card border rounded-lg shadow-lg p-4 cursor-pointer hover-elevate w-[380px]"
        style={{
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          zIndex: 9999,
          left: 'auto',
          top: 'auto',
          transform: 'none'
        }}
        onClick={onMaximize}
        data-testid="card-sync-minimized"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {stage === "complete" ? (
              <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            ) : stage === "error" ? (
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
            ) : (
              <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate">
                {stage === "ai_analysis" || stage === "themes" 
                  ? "Listing Analysis in Progress" 
                  : stage === "complete" 
                    ? "Analysis Complete"
                    : displayName}
              </span>
              <span className={`text-xs ${stage === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                {stage === "ai_analysis" || stage === "themes" 
                  ? displayName 
                  : getMinimizedStatus()}
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onMaximize?.();
            }}
            data-testid="button-view-progress"
          >
            View Progress
            <ChevronUp className="w-3 h-3 ml-1" />
          </Button>
        </div>
        {/* Progress bar */}
        <div className="mt-3">
          <Progress value={progress} className="h-1.5" />
        </div>
      </div>
    );
  }

  return (
    <Dialog open={isOpen} modal={false}>
      <DialogContent 
        className="sm:max-w-md sm:w-[380px] [&>button]:hidden flex flex-col fixed bottom-4 right-4 top-auto left-auto translate-x-0 translate-y-0 data-[state=open]:slide-in-from-bottom-4 p-4"
        hideOverlay
        data-testid="modal-sync-progress"
      >
        <VisuallyHidden>
          <DialogTitle>Syncing {displayName}</DialogTitle>
          <DialogDescription>Please wait while we sync and analyze your property data</DialogDescription>
        </VisuallyHidden>
        
        {/* Minimize button - uses div wrapper to avoid [&>button]:hidden */}
        {onMinimize && stage !== "complete" && (
          <div className="absolute top-2 right-2 z-10">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={onMinimize}
              data-testid="button-minimize-sync"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        <div className="flex flex-col">
          <div className="text-center space-y-1 flex-shrink-0">
            <div className={`w-10 h-10 mx-auto rounded-xl flex items-center justify-center ${
              stage === "error" ? "bg-destructive/10" : "bg-primary/10"
            }`}>
              {stage === "complete" ? (
                <Check className="w-5 h-5 text-emerald-500" />
              ) : stage === "error" ? (
                <AlertCircle className="w-5 h-5 text-destructive" />
              ) : (
                <Sparkles className="w-5 h-5 text-primary animate-pulse" />
              )}
            </div>
            <h2 className="text-sm font-semibold leading-tight" data-testid="text-syncing-properties">
              {stage === "complete" ? "Sync Complete!" : stage === "error" ? "Sync Error" : `Syncing ${displayName}`}
            </h2>
            <p className="text-xs text-muted-foreground">
              {stage === "complete" 
                ? "Your properties have been analyzed"
                : stage === "error"
                  ? "The sync encountered an error"
                  : "Please wait while we sync and analyze"
              }
            </p>
          </div>

          {/* Error action buttons */}
          {stage === "error" && (onRetry || onDismissError) && (
            <div className="flex gap-2 mt-3 flex-shrink-0">
              {onDismissError && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={onDismissError}
                  data-testid="button-dismiss-error"
                >
                  <X className="w-4 h-4 mr-1" />
                  Dismiss
                </Button>
              )}
              {onRetry && (
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1"
                  onClick={onRetry}
                  data-testid="button-retry-sync"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Retry
                </Button>
              )}
            </div>
          )}

          <div className="space-y-1 mt-3 flex-shrink-0">
            <Progress value={progress} className="h-1.5" data-testid="progress-sync" />
            <p className="text-xs text-muted-foreground text-center" data-testid="text-progress-percent">
              {Math.round(progress)}% complete
            </p>
          </div>

          {isAIStage && (
            <div 
              className={`mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 transition-opacity duration-300 ${
                insightVisible ? "opacity-100" : "opacity-0"
              }`}
              data-testid="insight-container"
            >
              <div className="flex gap-2">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400 mb-0.5">Did you know?</p>
                  <p className="text-[11px] text-muted-foreground leading-snug" data-testid="text-insight">
                    {AI_INSIGHTS[currentInsightIndex]}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2 mt-3 flex-shrink-0">
            {stages.map((s, index) => {
              const currentIndex = stages.indexOf(stage);
              const stageIndex = stages.indexOf(s);
              const isActive = s === stage && stage !== "complete";
              const isComplete = stageIndex < currentIndex || stage === "complete";
              const isAIRelated = s === "ai_analysis" || s === "themes";

              return (
                <div 
                  key={s}
                  data-testid={`stage-${s}`}
                  className={`px-2.5 py-1.5 rounded-md transition-all duration-300 ${
                    isActive 
                      ? isAIRelated 
                        ? "bg-gradient-to-br from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 border border-violet-500/30" 
                        : "bg-primary/10 border border-primary/20"
                      : isComplete 
                        ? "bg-muted/50" 
                        : "opacity-40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                      isComplete && !isActive ? "bg-emerald-500/20" : 
                      isActive ? (isAIRelated ? "bg-violet-500/20" : "bg-primary/20") : 
                      "bg-muted"
                    }`}>
                      {isComplete && !isActive ? (
                        <Check className="w-2.5 h-2.5 text-emerald-500" />
                      ) : isActive ? (
                        <Loader2 className={`w-2.5 h-2.5 animate-spin ${isAIRelated ? "text-violet-500" : "text-primary"}`} />
                      ) : (
                        <span className="text-[9px] text-muted-foreground">{index + 1}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {getStageIcon(s, isActive)}
                        <p className={`text-xs font-medium leading-tight ${
                          isActive 
                            ? isAIRelated ? "text-violet-600 dark:text-violet-400" : "text-foreground" 
                            : "text-muted-foreground"
                        }`}>
                          {getStageLabel(s, isComplete && !isActive, isActive)}
                        </p>
                      </div>
                                          </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
