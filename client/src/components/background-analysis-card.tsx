import { useNotifications, BackgroundAnalysis } from "@/contexts/notifications-context";
import { Card, CardContent } from "@/components/ui/card";
import { Brain, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLocation } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface ListingWithAnalysis {
  id: string;
  lastAnalyzedAt?: string;
  analysis?: {
    analyzedAt?: string;
  };
}

export function BackgroundAnalysisCard() {
  const { backgroundAnalyses, completeBackgroundAnalysis } = useNotifications();
  const [, setLocation] = useLocation();
  const [progress, setProgress] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const completedIdsRef = useRef<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const currentAnalysis = backgroundAnalyses[0];

  const checkAnalysisCompletion = useCallback(async (analysis: BackgroundAnalysis) => {
    if (completedIdsRef.current.has(analysis.id)) return;

    try {
      const response = await fetch(`/api/listings/${analysis.listingId}`);
      if (!response.ok) return;
      
      const listing: ListingWithAnalysis = await response.json();
      const analysisStartedAt = new Date(analysis.startedAt).getTime();
      
      let lastAnalyzedTime = 0;
      if (listing.lastAnalyzedAt) {
        lastAnalyzedTime = new Date(listing.lastAnalyzedAt).getTime();
      } else if (listing.analysis?.analyzedAt) {
        lastAnalyzedTime = new Date(listing.analysis.analyzedAt).getTime();
      }

      if (lastAnalyzedTime > analysisStartedAt) {
        completedIdsRef.current.add(analysis.id);
        completeBackgroundAnalysis(analysis.id);
        queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/listings", analysis.listingId] });
      }
    } catch (e) {
      console.error("Failed to check analysis completion:", e);
    }
  }, [completeBackgroundAnalysis, queryClient]);

  useEffect(() => {
    if (backgroundAnalyses.length === 0) return;

    const interval = setInterval(() => {
      backgroundAnalyses.forEach(analysis => {
        checkAnalysisCompletion(analysis);
      });
    }, 3000);

    backgroundAnalyses.forEach(analysis => {
      checkAnalysisCompletion(analysis);
    });

    return () => clearInterval(interval);
  }, [backgroundAnalyses, checkAnalysisCompletion]);

  useEffect(() => {
    if (backgroundAnalyses.length === 0) {
      setProgress(0);
      return;
    }

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) return 95;
        return prev + (95 - prev) * 0.02;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [backgroundAnalyses.length]);

  if (backgroundAnalyses.length === 0) {
    return null;
  }

  if (isMinimized) {
    return (
      <div 
        className="fixed bottom-4 right-4 z-50"
        data-testid="card-background-analysis-minimized"
      >
        <Button
          size="icon"
          className="rounded-full shadow-lg animate-pulse"
          onClick={() => setIsMinimized(false)}
          data-testid="button-expand-analysis"
        >
          <Brain className="w-5 h-5" />
        </Button>
      </div>
    );
  }

  return (
    <div 
      className="fixed bottom-4 right-4 z-50 w-80"
      data-testid="card-background-analysis"
    >
      <Card className="shadow-xl border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Brain className="w-4 h-4 text-primary animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-medium">AI Analysis Running</p>
                <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                  {currentAnalysis.listingName}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMinimized(true)}
              data-testid="button-minimize-analysis"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          <Progress value={progress} className="h-1.5 mb-2" />
          
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Processing...</span>
            </div>
            <span>{Math.round(progress)}%</span>
          </div>

          {(currentAnalysis.reviewCount || currentAnalysis.conversationCount) && (
            <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
              {currentAnalysis.reviewCount && (
                <span>{currentAnalysis.reviewCount} reviews</span>
              )}
              {currentAnalysis.reviewCount && currentAnalysis.conversationCount && (
                <span> &bull; </span>
              )}
              {currentAnalysis.conversationCount && (
                <span>{currentAnalysis.conversationCount} conversations</span>
              )}
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="w-full mt-3"
            onClick={() => setLocation(`/listings/${currentAnalysis.listingId}`)}
            data-testid="button-view-analysis"
          >
            View Progress
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
