import { useNotifications, BackgroundSync } from "@/contexts/notifications-context";
import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { SyncProgressModal } from "./sync-progress-modal";
import { useToast } from "@/hooks/use-toast";

export function BackgroundSyncCard() {
  const { backgroundSyncs, completeBackgroundSync, cancelBackgroundSync, startSyncSSEListener } = useNotifications();
  const completedIdsRef = useRef<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isMinimized, setIsMinimized] = useState(false);

  const currentSync = backgroundSyncs[0];

  const handleRetry = useCallback((sync: BackgroundSync) => {
    // Try to retry SSE connection if we have a listing ID
    const listingId = sync.activeListingId || sync.listingIds[0];
    if (listingId) {
      toast({
        title: "Retrying sync...",
        description: "Attempting to resume the analysis.",
      });
      startSyncSSEListener(sync.id, listingId);
    } else {
      toast({
        title: "Cannot retry",
        description: "No listing available for retry. Please start a new sync.",
        variant: "destructive",
      });
      cancelBackgroundSync(sync.id);
    }
  }, [startSyncSSEListener, cancelBackgroundSync, toast]);

  const handleDismissError = useCallback((sync: BackgroundSync) => {
    cancelBackgroundSync(sync.id);
    toast({
      title: "Sync cancelled",
      description: "The sync has been cancelled. You can try again from the Properties page.",
    });
  }, [cancelBackgroundSync, toast]);

  const checkSyncCompletion = useCallback(async (sync: BackgroundSync) => {
    if (completedIdsRef.current.has(sync.id)) return;

    // Only complete when the SSE listener has set the stage to "complete"
    // The SSE listener in NotificationsContext handles the full flow including themes
    const isExplicitlyComplete = sync.currentStage === "complete";
    
    // Fallback: If sync is stuck in "themes" stage for more than 5 seconds, auto-complete
    // This handles cases where SSE "complete" event was missed
    const isStuckInThemes = sync.currentStage === "themes" && 
      (Date.now() - sync.startedAt.getTime() > 10000 || // 10 seconds since start, or
       sync.stats.tagsCreated > 0); // has tags (meaning analysis finished)
    
    if (isExplicitlyComplete || isStuckInThemes) {
      completedIdsRef.current.add(sync.id);
      
      // Expand when complete so user sees the result
      setIsMinimized(false);
      
      // Show success notification
      const listingCount = sync.listingNames.length;
      toast({
        title: "Sync Complete!",
        description: `Successfully synced ${listingCount} ${listingCount === 1 ? "property" : "properties"} with AI analysis.`,
      });
      
      completeBackgroundSync(sync.id);
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      // Navigate to Themes page after background sync completes
      navigate("/themes");
    }
  }, [completeBackgroundSync, queryClient, navigate, toast]);

  useEffect(() => {
    if (backgroundSyncs.length === 0) return;

    const interval = setInterval(() => {
      backgroundSyncs.forEach(sync => {
        checkSyncCompletion(sync);
      });
    }, 3000);

    backgroundSyncs.forEach(sync => {
      checkSyncCompletion(sync);
    });

    return () => clearInterval(interval);
  }, [backgroundSyncs, checkSyncCompletion]);

  if (backgroundSyncs.length === 0 || !currentSync) {
    return null;
  }

  return (
    <SyncProgressModal
      isOpen={true}
      listingNames={currentSync.listingNames}
      currentStage={currentSync.currentStage}
      stats={currentSync.stats}
      isViewOnly={true}
      isMinimized={isMinimized}
      onMinimize={() => setIsMinimized(true)}
      onMaximize={() => setIsMinimized(false)}
      onRetry={() => handleRetry(currentSync)}
      onDismissError={() => handleDismissError(currentSync)}
    />
  );
}
