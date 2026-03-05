import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { PhotoAnalysis } from "@shared/schema";
import { Sparkles, Loader2, Camera, Wand2, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PhotoEnhanceSheet } from "./photo-enhance-sheet";

interface PhotoAnalysisSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  photoIndex: number;
  photoUrl: string;
  totalPhotos: number;
}

export function PhotoAnalysisSheet({
  open,
  onOpenChange,
  listingId,
  photoIndex,
  photoUrl,
  totalPhotos,
}: PhotoAnalysisSheetProps) {
  const { toast } = useToast();
  const isFullAnalysis = true; // All photos get full AI Vision analysis
  
  const [enhanceSheetOpen, setEnhanceSheetOpen] = useState(false);

  const { data: analyses = [], isLoading: analysisLoading } = useQuery<PhotoAnalysis[]>({
    queryKey: ["/api/listings", listingId, "photo-analyses"],
    enabled: open && !!listingId,
  });

  const analysis = analyses.find(a => a.photoIndex === photoIndex) || null;

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/listings/${listingId}/photos/${photoIndex}/analyze`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings", listingId, "photo-analyses"] });
    },
  });

  const hasAnalysis = !!analysis;
  const isPending = !hasAnalysis && !analyzeMutation.data;

  const currentAnalysis = analyzeMutation.data || analysis;

  const getTechnicalBadgeColor = (value: string | undefined) => {
    if (!value) return "bg-muted text-muted-foreground";
    const lower = value.toLowerCase();
    if (lower.includes("excellent") || lower.includes("high") || lower.includes("professional") || lower.includes("well balanced")) {
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    }
    if (lower.includes("good") || lower.includes("minor")) {
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30";
    }
    if (lower.includes("adequate") || lower.includes("standard") || lower.includes("some")) {
      return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30";
    }
    return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl flex flex-col min-h-screen overflow-hidden">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-purple-500" />
            Photo Analysis
          </SheetTitle>
          <SheetDescription>
            AI-powered image analysis and enhancement
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4 space-y-4 pr-1 pb-4">
          <div className="relative rounded-lg overflow-hidden bg-muted">
            <img 
              src={photoUrl} 
              alt={`Photo ${photoIndex + 1}`}
              className="w-full h-auto object-contain"
              data-testid="photo-analysis-image"
            />
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
              <Badge variant="secondary" className="bg-black/70 text-white border-0">
                Photo {photoIndex + 1}
              </Badge>
              <Badge 
                variant="secondary" 
                className={`border-0 ${
                  currentAnalysis 
                    ? "bg-emerald-500/90 text-white" 
                    : analyzeMutation.isPending 
                      ? "bg-purple-500/90 text-white"
                      : "bg-black/70 text-white"
                }`}
              >
                {currentAnalysis 
                  ? currentAnalysis.analysisType === "full" ? "Analyzed" : "Resolution Checked"
                  : analyzeMutation.isPending 
                    ? "Analyzing..."
                    : "Analysis pending"
                }
              </Badge>
            </div>
          </div>

          {isFullAnalysis ? (
            <>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Technical Details</h3>
                <div className="grid grid-cols-4 gap-2">
                  <div className="p-2 rounded-lg bg-muted/50 border" data-testid="tech-resolution">
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Resolution</p>
                    {analyzeMutation.isPending ? (
                      <Skeleton className="h-5 w-24" />
                    ) : currentAnalysis?.technicalDetails?.resolution ? (
                      <Badge variant="outline" className={getTechnicalBadgeColor(currentAnalysis.technicalDetails.resolution)}>
                        {currentAnalysis.technicalDetails.resolution}
                      </Badge>
                    ) : (
                      <p className="text-sm text-muted-foreground">Not analyzed</p>
                    )}
                  </div>
                  <div className="p-2 rounded-lg bg-muted/50 border" data-testid="tech-lighting">
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Lighting</p>
                    {analyzeMutation.isPending ? (
                      <Skeleton className="h-5 w-24" />
                    ) : currentAnalysis?.technicalDetails?.lighting ? (
                      <Badge variant="outline" className={getTechnicalBadgeColor(currentAnalysis.technicalDetails.lighting)}>
                        {currentAnalysis.technicalDetails.lighting}
                      </Badge>
                    ) : (
                      <p className="text-sm text-muted-foreground">Not analyzed</p>
                    )}
                  </div>
                  <div className="p-2 rounded-lg bg-muted/50 border" data-testid="tech-perspective">
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Perspective</p>
                    {analyzeMutation.isPending ? (
                      <Skeleton className="h-5 w-24" />
                    ) : currentAnalysis?.technicalDetails?.perspective ? (
                      <Badge variant="outline" className={getTechnicalBadgeColor(currentAnalysis.technicalDetails.perspective)}>
                        {currentAnalysis.technicalDetails.perspective}
                      </Badge>
                    ) : (
                      <p className="text-sm text-muted-foreground">Not analyzed</p>
                    )}
                  </div>
                  <div className="p-2 rounded-lg bg-muted/50 border" data-testid="tech-shadows">
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Shadows</p>
                    {analyzeMutation.isPending ? (
                      <Skeleton className="h-5 w-24" />
                    ) : currentAnalysis?.technicalDetails?.shadows ? (
                      <Badge variant="outline" className={getTechnicalBadgeColor(currentAnalysis.technicalDetails.shadows)}>
                        {currentAnalysis.technicalDetails.shadows}
                      </Badge>
                    ) : (
                      <p className="text-sm text-muted-foreground">Not analyzed</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Objects Detected</h3>
                {analyzeMutation.isPending ? (
                  <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-6 w-14" />
                  </div>
                ) : currentAnalysis?.objectsDetected && currentAnalysis.objectsDetected.length > 0 ? (
                  <div className="flex flex-wrap gap-2" data-testid="objects-detected">
                    {currentAnalysis.objectsDetected.map((obj: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {obj}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {currentAnalysis ? "No objects detected" : "Run AI analysis to detect objects"}
                  </p>
                )}
              </div>

              <div className="p-3 rounded-lg border border-purple-500/30 bg-purple-500/5">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  <h3 className="text-sm font-semibold">AI Recommendation</h3>
                </div>
                {analyzeMutation.isPending ? (
                  <Skeleton className="h-16 w-full" />
                ) : currentAnalysis?.recommendation ? (
                  <p className="text-sm text-muted-foreground" data-testid="ai-recommendation">
                    {currentAnalysis.recommendation}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Run AI analysis to get personalized recommendations for this photo.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="p-4 rounded-lg bg-muted/50 border">
              <p className="text-sm text-muted-foreground mb-3">
                Full AI analysis is available for the first 10 photos. Photos beyond the first 10 only get resolution checks to save AI credits.
              </p>
              {currentAnalysis?.isLowResolution !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Resolution:</span>
                  <Badge variant={currentAnalysis.isLowResolution ? "destructive" : "default"}>
                    {currentAnalysis.isLowResolution ? "Low Resolution" : "Good Resolution"}
                  </Badge>
                </div>
              )}
            </div>
          )}

          {!currentAnalysis && !analyzeMutation.isPending && (
            <Button 
              onClick={() => analyzeMutation.mutate()}
              className="w-full"
              data-testid="button-run-photo-analysis"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {isFullAnalysis ? "Run AI Analysis" : "Check Resolution"}
            </Button>
          )}

          {analyzeMutation.isPending && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
              <span className="text-sm text-muted-foreground">Analyzing photo...</span>
            </div>
          )}
        </div>

        {/* Sticky Footer - Enhance with AI */}
        {isFullAnalysis && (
          <div className="sticky bottom-0 z-50 border-t bg-background pt-4 pb-2 mt-auto">
            <Button 
              onClick={() => setEnhanceSheetOpen(true)}
              disabled={!currentAnalysis}
              className="w-full bg-purple-600 border-purple-600"
              data-testid="button-open-enhance"
            >
              <Wand2 className="w-4 h-4 mr-2" />
              Enhance with AI
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Generate an enhanced version using Nano Banana Pro
            </p>
          </div>
        )}

        <PhotoEnhanceSheet
          open={enhanceSheetOpen}
          onOpenChange={setEnhanceSheetOpen}
          listingId={listingId}
          photoIndex={photoIndex}
          photoUrl={photoUrl}
          recommendation={currentAnalysis?.recommendation}
        />
      </SheetContent>
    </Sheet>
  );
}
