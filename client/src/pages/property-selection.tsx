import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader2,
  Search,
  ChevronRight,
  Building2,
  Home,
  Check,
  HelpCircle,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  useNotifications,
  type BackgroundSyncStage,
} from "@/contexts/notifications-context";
import type { SyncStage } from "@/components/sync-progress-modal";
import type { DataSource, Listing } from "@shared/schema";

interface HospitableProperty {
  id: string;
  name: string;
  public_name?: string;
  picture?: string;
  property_type?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  listings?: Array<{
    platform?: string;
    platform_id?: string;
    platform_name?: string;
    platform_email?: string;
  }>;
  capacity?: {
    bedrooms?: number;
    bathrooms?: number;
  };
  description?: string;
  headline?: string;
  amenities?: string[];
  photos?: string[];
  owner?: {
    name?: string;
    email?: string;
  };
  user?: {
    name?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
  };
}

interface PropertyWithSelection extends HospitableProperty {
  isSelected: boolean;
}

export default function PropertySelection() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const {
    addNotification,
    backgroundSyncs,
    startBackgroundSync,
    updateBackgroundSync,
    updateBackgroundSyncListingId,
    completeBackgroundSync,
    startMultiListingSyncSSE,
    stopSyncSSEListener,
  } = useNotifications();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [syncDays, setSyncDays] = useState("90");
  const [selectedProperties, setSelectedProperties] = useState<Set<string>>(
    new Set(),
  );
  const [isInitialSetup, setIsInitialSetup] = useState(true);

  const [showSyncProgress, setShowSyncProgress] = useState(false);
  const [syncStage, setSyncStage] = useState<SyncStage>("data_sync");
  const [syncStats, setSyncStats] = useState({
    reservationsSynced: 0,
    reviewsSynced: 0,
    conversationsSynced: 0,
    totalReservationsToAnalyze: 0,
    reservationsAnalyzed: 0,
    tagsCreated: 0,
    tasksCreated: 0,
    themesCreated: 0,
  });
  const [importedListingId, setImportedListingId] = useState<string | null>(
    null,
  );
  const [syncingPropertyNames, setSyncingPropertyNames] = useState<string[]>(
    [],
  );
  const [syncingListingIds, setSyncingListingIds] = useState<string[]>([]);
  const [syncingExternalIds, setSyncingExternalIds] = useState<string[]>([]);
  const backgroundSyncInProgress = useRef(false);
  const isMountedRef = useRef(true);
  const activeSyncIdRef = useRef<string | null>(null);
  const isBackgroundModeRef = useRef(false);

  // References for unmount handler
  const syncingPropertyNamesRef = useRef<string[]>([]);
  const syncingListingIdsRef = useRef<string[]>([]);
  const syncingExternalIdsRef = useRef<string[]>([]);
  const syncStageRef = useRef<BackgroundSyncStage>("data_sync");
  const syncStatsRef = useRef<any>(null);
  const showSyncProgressRef = useRef<boolean>(false);
  const startBackgroundSyncRef = useRef(startBackgroundSync);
  const updateBackgroundSyncRef = useRef(updateBackgroundSync);
  const updateBackgroundSyncListingIdRef = useRef(
    updateBackgroundSyncListingId,
  );
  const startMultiListingSyncSSERef = useRef(startMultiListingSyncSSE);
  const stopSyncSSEListenerRef = useRef(stopSyncSSEListener);

  // Keep refs up to date
  useEffect(() => {
    syncingPropertyNamesRef.current = syncingPropertyNames;
    syncingListingIdsRef.current = syncingListingIds;
    syncingExternalIdsRef.current = syncingExternalIds;
    syncStageRef.current = syncStage;
    syncStatsRef.current = syncStats;
    showSyncProgressRef.current = showSyncProgress;
    startBackgroundSyncRef.current = startBackgroundSync;
    updateBackgroundSyncRef.current = updateBackgroundSync;
    updateBackgroundSyncListingIdRef.current = updateBackgroundSyncListingId;
    startMultiListingSyncSSERef.current = startMultiListingSyncSSE;
    stopSyncSSEListenerRef.current = stopSyncSSEListener;
  }, [
    syncingPropertyNames,
    syncingListingIds,
    syncingExternalIds,
    syncStage,
    syncStats,
    showSyncProgress,
    startBackgroundSync,
    updateBackgroundSync,
    updateBackgroundSyncListingId,
    startMultiListingSyncSSE,
    stopSyncSSEListener,
  ]);

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Background sync is already created in onMutate, so just log
      if (showSyncProgressRef.current && activeSyncIdRef.current) {
        console.log(
          "Component unmounting with active sync, BackgroundSyncCard will continue showing progress",
        );
      }
    };
  }, []);

  const { data: dataSources, isLoading: isLoadingDataSources } = useQuery<
    DataSource[]
  >({
    queryKey: ["/api/data-sources"],
  });

  // Prefer the Hospitable Public API source — it has richer data (details, images).
  // Fall back to Airbnb Connect if no Hospitable source is connected.
  const connectedSource =
    dataSources?.find((ds) => ds.isConnected && ds.provider === "hospitable") ??
    dataSources?.find((ds) => ds.isConnected && ds.provider === "airbnb");

  const { data: existingListings, isLoading: isLoadingListings } = useQuery<
    Listing[]
  >({
    queryKey: ["/api/listings"],
  });

  const [showNewPropertiesCheck, setShowNewPropertiesCheck] = useState(false);

  // Fetch from ALL connected data sources at once
  const {
    data: propertiesResponse,
    isLoading: isLoadingProperties,
    error: propertiesError,
    refetch: refetchProperties,
  } = useQuery<{ data: Array<HospitableProperty & { _dataSourceId?: string; _provider?: string }> }>({
    queryKey: ["/api/properties/all"],
    enabled: showNewPropertiesCheck,
  });

  const apiProperties = propertiesResponse?.data || [];

  const existingExternalIds = new Set(
    existingListings?.map((l) => l.externalId) || [],
  );
  const newApiProperties = apiProperties.filter(
    (p) => !existingExternalIds.has(p.id),
  );

  const combinedProperties: Array<HospitableProperty & { _isFromDatabase?: boolean; _dataSourceId?: string; _provider?: string }> = [
    ...(existingListings || []).map(
      (listing) =>
        ({
          id: listing.externalId || listing.id,
          name: listing.name,
          public_name: listing.name,
          picture: listing.imageUrl || undefined,
          property_type: listing.propertyType || undefined,
          address: listing.address ? { street: listing.address } : undefined,
          capacity: {
            bedrooms: listing.bedrooms || undefined,
            bathrooms: listing.bathrooms || undefined,
          },
          owner: {
            name: listing.ownerName || undefined,
            email: listing.accountEmail || undefined,
          },
          _isFromDatabase: true,
        }) as HospitableProperty & { _isFromDatabase?: boolean },
    ),
    ...newApiProperties.map(
      (p) =>
        ({ ...p, _isFromDatabase: false }) as HospitableProperty & {
          _isFromDatabase?: boolean;
          _dataSourceId?: string;
          _provider?: string;
        },
    ),
  ];

  const properties = combinedProperties;

  useEffect(() => {
    if (existingListings && existingListings.length > 0) {
      setIsInitialSetup(false);
      const existingExternalIds = new Set(
        existingListings.filter((l) => l.isActive).map((l) => l.externalId),
      );

      // Also include properties that are currently being synced in background
      // Use stored externalPropertyIds from active syncs directly
      backgroundSyncs
        .filter((sync) => sync.currentStage !== "complete")
        .forEach((sync) => {
          // Use stored external property IDs if available
          if (sync.externalPropertyIds) {
            sync.externalPropertyIds.forEach((id) =>
              existingExternalIds.add(id),
            );
          } else {
            // Fallback: try to map listing IDs to external IDs through existingListings
            existingListings.forEach((listing) => {
              if (sync.listingIds.includes(listing.id) && listing.externalId) {
                existingExternalIds.add(listing.externalId);
              }
            });
          }
        });

      setSelectedProperties(existingExternalIds as Set<string>);
    }
  }, [existingListings, backgroundSyncs]);

  useEffect(() => {
    if (!isLoadingDataSources && !connectedSource) {
      navigate("/data-sources");
    }
  }, [isLoadingDataSources, connectedSource, navigate]);

  // Silently refresh owner/account metadata for existing listings that are missing it
  useEffect(() => {
    if (!connectedSource?.id || !existingListings) return;
    const hasMissingOwnerData = existingListings.some(
      (l) => !l.ownerName && !l.accountEmail,
    );
    if (!hasMissingOwnerData) return;
    apiRequest(
      "POST",
      `/api/data-sources/${connectedSource.id}/refresh-owner-metadata`,
    )
      .then((res) => {
        if (res.ok)
          queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      })
      .catch(() => {
        /* non-critical, ignore */
      });
  }, [connectedSource?.id, existingListings]);

  useEffect(() => {
    if (activeSyncIdRef.current && isBackgroundModeRef.current) {
      updateBackgroundSync(activeSyncIdRef.current, syncStage, syncStats);
    }
  }, [syncStage, syncStats, updateBackgroundSync]);

  // Helper to update both local state and background sync context
  // This ensures updates work even when component is unmounted
  const updateSyncProgress = useCallback(
    (newStage: BackgroundSyncStage, newStats: any) => {
      // Update local state (only works if mounted)
      setSyncStage(newStage as SyncStage);
      setSyncStats(newStats);

      // Directly update background sync if in background mode
      // This works even when component is unmounted
      if (activeSyncIdRef.current && isBackgroundModeRef.current) {
        updateBackgroundSyncRef.current(
          activeSyncIdRef.current,
          newStage,
          newStats,
        );
      }
    },
    [],
  );

  // Helper function to sync a single listing (data sync only, no AI analysis)
  // AI analysis is handled by the SSE endpoint after all syncs complete
  // Returns { success: boolean, ... } to accurately track results
  const syncAndAnalyzeListing = async (listing: {
    id: string;
    name?: string;
  }) => {
    if (!listing?.id)
      return { success: false, listingName: listing?.name || "Property" };

    const listingName = listing.name || "Property";

    try {
      const syncResponse = await apiRequest(
        "POST",
        `/api/listings/${listing.id}/sync-reservations`,
      );
      if (!syncResponse.ok) {
        console.error(`Sync failed for ${listing.id}: ${syncResponse.status}`);
        return { success: false, listingName };
      }

      const syncData = await syncResponse.json();

      // NOTE: Do NOT call analyze-reservations here!
      // AI analysis is handled by the multi-listing SSE endpoint after all syncs complete.
      // This ensures the SSE can track progress correctly (it checks for unprocessed reservations).
      // If we analyzed here, reservations would already be processed when SSE starts,
      // causing progress bar to show 0% even though analysis succeeded.

      return {
        success: true,
        listingName,
        reservationsSynced: (syncData.synced || 0) + (syncData.updated || 0),
        reviewsSynced: syncData.totalReviews || 0,
        conversationsSynced: syncData.totalReservations || 0,
        // Tags/tasks/themes will be populated by SSE progress tracking
        tagsCreated: 0,
        tasksCreated: 0,
        themesCreated: 0,
        pendingAnalysis: syncData.pendingAnalysis || 0,
      };
    } catch (err) {
      console.error(`Error syncing listing ${listing.id}:`, err);
      return { success: false, listingName };
    }
  };

  // Background sync for remaining properties after first one completes
  const runBackgroundSync = async (
    remainingListings: Array<{ id: string; name?: string }>,
  ) => {
    // Single-flight guard - prevent overlapping background syncs
    if (backgroundSyncInProgress.current) {
      console.log("Background sync already in progress, skipping");
      return;
    }

    backgroundSyncInProgress.current = true;
    const isInBackgroundMode = isBackgroundModeRef.current;

    let successCount = 0;
    let failureCount = 0;
    const successfulPropertyNames: string[] = [];

    try {
      for (const listing of remainingListings) {
        // Only check mount status if NOT in background mode
        // When in background mode, we continue syncing even after unmount
        if (!isInBackgroundMode && !isMountedRef.current) {
          console.log("Component unmounted, stopping background sync");
          break;
        }

        try {
          const result = await syncAndAnalyzeListing(listing);
          if (result.success) {
            successCount++;
            successfulPropertyNames.push(result.listingName);
          } else {
            failureCount++;
          }
        } catch (err) {
          console.error(`Background sync error for ${listing.id}:`, err);
          failureCount++;
        }
      }

      // For background mode, update the sync stage to complete so BackgroundSyncCard can detect it
      if (isInBackgroundMode && activeSyncIdRef.current) {
        updateBackgroundSync(activeSyncIdRef.current, "complete", syncStats);
      }

      // For normal mode, send notifications if still mounted
      if (!isInBackgroundMode && isMountedRef.current) {
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
        queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });

        // Send notification when background sync completes
        if (successCount > 0 && failureCount === 0) {
          // Get the first successful property's photo if available
          const firstSuccessfulProperty = properties.find((p) =>
            successfulPropertyNames.includes(p.name),
          );
          const listingPhoto =
            firstSuccessfulProperty?.picture ||
            firstSuccessfulProperty?.photos?.[0];

          addNotification({
            type: "background_sync_complete",
            title: "Sync & Analysis Complete",
            message:
              successCount === 1
                ? `"${successfulPropertyNames[0]}" has finished syncing and is ready to view.`
                : `${successCount} additional properties have finished syncing and are ready to view.`,
            count: successCount,
            listingPhoto,
          });
        } else if (successCount > 0 && failureCount > 0) {
          addNotification({
            type: "background_sync_complete",
            title: "Sync & Analysis Partially Complete",
            message: `${successCount} ${successCount === 1 ? "property" : "properties"} synced successfully, but ${failureCount} failed.`,
            count: successCount,
          });
        } else if (failureCount > 0) {
          addNotification({
            type: "info",
            title: "Sync Failed",
            message: `Failed to sync ${failureCount} ${failureCount === 1 ? "property" : "properties"}. Please try again.`,
          });
        }
      }
    } finally {
      backgroundSyncInProgress.current = false;
    }
  };

  const importMutation = useMutation({
    mutationFn: async ({
      dataSourceId,
      properties,
      syncDays,
    }: {
      dataSourceId: string;
      properties: HospitableProperty[];
      syncDays: number;
    }) => {
      // Track current stats in a mutable object for background updates
      const currentStats = {
        reservationsSynced: 0,
        reviewsSynced: 0,
        conversationsSynced: 0,
        totalReservationsToAnalyze: 0,
        reservationsAnalyzed: 0,
        tagsCreated: 0,
        tasksCreated: 0,
        themesCreated: 0,
      };

      // Helper to update background sync (only updates context, skips local state for performance)
      const updateProgress = (
        stage: BackgroundSyncStage,
        statsUpdate: Partial<typeof currentStats>,
      ) => {
        Object.assign(currentStats, statsUpdate);
        syncStageRef.current = stage;
        // Only update background sync context - BackgroundSyncCard handles display
        if (activeSyncIdRef.current) {
          updateBackgroundSyncRef.current(activeSyncIdRef.current, stage, {
            ...currentStats,
          });
        }
      };

      // Reset to initial state
      updateProgress("data_sync", currentStats);

      // Stage 1: Import all properties (Data Sync)
      const importResponse = await apiRequest("POST", "/api/listings/import", {
        dataSourceId,
        properties,
        syncDays,
      });

      if (!importResponse.ok) {
        const errorData = await importResponse.json().catch(() => ({}));
        const errorMessage =
          errorData.message ||
          `Import failed with status ${importResponse.status}`;
        throw new Error(errorMessage);
      }

      const importData = await importResponse.json();

      const allListings = [...(importData.listings || [])];
      const firstListing = allListings[0];
      const remainingListings = allListings.slice(1);
      const allListingIds = allListings.map((l: { id: string }) => l.id);

      setSyncingListingIds(allListingIds);

      if (!firstListing?.id) {
        return { ...importData, firstListingId: null };
      }

      let firstListingStats = {
        reservationsSynced: 0,
        reviewsSynced: 0,
        conversationsSynced: 0,
        totalReservationsToAnalyze: 0,
        reservationsAnalyzed: 0,
        tagsCreated: 0,
        tasksCreated: 0,
        themesCreated: 0,
      };

      // Stage 1: Sync data from Hospitable for ALL listings in parallel
      // This ensures we have all reservations before showing the total count
      const syncPromises = allListings.map(async (listing: { id: string }) => {
        const response = await apiRequest(
          "POST",
          `/api/listings/${listing.id}/sync-reservations`,
        );
        if (response.ok) {
          return response.json();
        }
        return null;
      });

      const syncResults = await Promise.all(syncPromises);

      // Aggregate sync stats from all listings
      let totalReservationsSynced = 0;
      let totalReviewsSynced = 0;
      let totalConversationsSynced = 0;

      syncResults.forEach((syncData) => {
        if (syncData) {
          totalReservationsSynced +=
            (syncData.synced || 0) + (syncData.updated || 0);
          totalReviewsSynced += syncData.reviewsSynced || 0;
          totalConversationsSynced += syncData.conversationsSynced || 0;
        }
      });

      firstListingStats.reservationsSynced = totalReservationsSynced;
      firstListingStats.reviewsSynced = totalReviewsSynced;
      firstListingStats.conversationsSynced = totalConversationsSynced;

      // Get total unprocessed reservation count across ALL listings
      const countResponse = await apiRequest(
        "POST",
        "/api/listings/unprocessed-count",
        { listingIds: allListingIds },
      );
      let totalUnprocessed = 0;
      if (countResponse.ok) {
        const countData = await countResponse.json();
        totalUnprocessed = countData.totalUnprocessed || 0;
      }
      firstListingStats.totalReservationsToAnalyze = totalUnprocessed;

      // Update progress with aggregated stats
      updateProgress("data_sync", {
        reservationsSynced: firstListingStats.reservationsSynced,
        reviewsSynced: firstListingStats.reviewsSynced,
        conversationsSynced: firstListingStats.conversationsSynced,
        totalReservationsToAnalyze: totalUnprocessed,
      });

      // All syncs completed, proceed with AI analysis if at least one succeeded
      const syncSucceeded = syncResults.some((r) => r !== null);

      // Collect ALL successfully synced listing IDs by matching sync results with original listings
      // syncResults[i] corresponds to allListings[i], so we filter by successful syncs
      const allSyncedListingIds = allListings
        .filter(
          (_listing: { id: string }, index: number) =>
            syncResults[index] !== null,
        )
        .map((listing: { id: string }) => listing.id);

      if (syncSucceeded && allSyncedListingIds.length > 0) {
        // Stage 2: Confirmation - transition to show we're preparing AI analysis
        updateProgress("confirmation", {});
        await new Promise((r) => setTimeout(r, 500));

        const currentSyncId = activeSyncIdRef.current;

        // Stage 3: AI Analysis with real-time progress via SSE for ALL listings
        updateProgress("ai_analysis", {});

        // Store listing IDs in background sync for reconnection after page reload
        if (currentSyncId) {
          updateBackgroundSyncRef.current(
            currentSyncId,
            "ai_analysis",
            undefined,
            allSyncedListingIds,
          );
        }

        // Use new multi-listing SSE that processes ALL listings in one stream
        // This ensures progress bar only completes when ALL reservations from ALL listings are analyzed
        if (currentSyncId) {
          console.log(
            "[Sync] Starting multi-listing SSE for",
            allSyncedListingIds.length,
            "listings",
          );
          startMultiListingSyncSSERef.current(
            currentSyncId,
            allSyncedListingIds,
          );
        }

        // The multi-listing SSE will:
        // 1. Track aggregate progress across ALL listings
        // 2. Send progress updates as each batch completes
        // 3. Only send "complete" when ALL reservations from ALL listings are processed
        // 4. Update context state which BackgroundSyncCard displays
      }

      // Don't call updateProgress("complete") here - SSE context handles completion

      return {
        ...importData,
        firstListingId: allSyncedListingIds[0] || firstListing.id,
        firstListingName: firstListing.name,
        allListingIds: allSyncedListingIds,
        ...firstListingStats,
      };
    },
    onMutate: (variables) => {
      setShowSyncProgress(true);

      // Create background sync immediately with property names
      // This ensures progress is always tracked even if user navigates away
      const propertyNames = variables.properties.map((p) => p.name);
      setSyncingPropertyNames(propertyNames);

      const syncId = startBackgroundSync(
        [], // Listing IDs not available yet
        propertyNames,
        "data_sync",
        {
          reservationsSynced: 0,
          reviewsSynced: 0,
          conversationsSynced: 0,
          totalReservationsToAnalyze: 0,
          reservationsAnalyzed: 0,
          tagsCreated: 0,
          tasksCreated: 0,
          themesCreated: 0,
        },
        variables.properties.map((p) => p.id),
      );
      activeSyncIdRef.current = syncId;
      // Always update background sync - not just in "background mode"
      isBackgroundModeRef.current = true;
    },
    onSuccess: (data) => {
      // Don't mark as complete here - the multi-listing SSE listener in the context will handle that
      // Just invalidate queries to refresh data that was imported
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/data-sources"] });

      setImportedListingId(data.firstListingId);

      // All listings are now processed in the single multi-listing SSE stream
      // No need for separate background sync - the SSE handles aggregate progress across ALL listings
    },
    onError: async (error: any) => {
      setShowSyncProgress(false);

      // If sync was in background mode, clean it up
      if (activeSyncIdRef.current && isBackgroundModeRef.current) {
        completeBackgroundSync(activeSyncIdRef.current);
        activeSyncIdRef.current = null;
        isBackgroundModeRef.current = false;
      }

      // Try to extract a meaningful error message
      let errorMessage = "Failed to sync properties. Please try again.";
      try {
        if (error?.message) {
          errorMessage = error.message;
        }
      } catch {
        // Use default message
      }

      toast({
        title: "Sync Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const toggleProperty = (propertyId: string) => {
    setSelectedProperties((prev) => {
      const next = new Set(prev);
      if (next.has(propertyId)) {
        next.delete(propertyId);
      } else {
        next.add(propertyId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedProperties(new Set(properties.map((p) => p.id)));
  };

  const deselectAll = () => {
    setSelectedProperties(new Set());
  };

  const handleSync = () => {
    if (!dataSources) return;

    // Get IDs of already-synced listings
    const alreadySyncedExternalIds = new Set(
      existingListings?.filter((l) => l.externalId).map((l) => l.externalId) ||
        [],
    );

    // Only sync properties that are newly selected (not already synced)
    const newPropertiesToSync = properties.filter(
      (p) =>
        selectedProperties.has(p.id) && !alreadySyncedExternalIds.has(p.id),
    ) as Array<HospitableProperty & { _dataSourceId?: string; _provider?: string }>;

    if (newPropertiesToSync.length === 0) {
      // All selected properties are already synced
      return;
    }

    // Group properties by their data source.
    // Properties fetched from /api/properties/all carry _dataSourceId.
    // Properties from existing DB listings carry no _dataSourceId — fall back
    // to the preferred connected source for backward-compat.
    const preferredSource =
      dataSources.find((ds) => ds.isConnected && ds.provider === "hospitable") ??
      dataSources.find((ds) => ds.isConnected && ds.provider === "airbnb");

    const byDataSource = new Map<string, typeof newPropertiesToSync>();
    for (const p of newPropertiesToSync) {
      const dsId = p._dataSourceId || preferredSource?.id;
      if (!dsId) continue;
      if (!byDataSource.has(dsId)) byDataSource.set(dsId, []);
      byDataSource.get(dsId)!.push(p);
    }

    if (byDataSource.size === 0) return;

    setSyncingPropertyNames(
      newPropertiesToSync.map((p) => p.public_name || p.name || "Property"),
    );
    setSyncingExternalIds(newPropertiesToSync.map((p) => p.id));

    // If all properties belong to one data source (common case), mutate once.
    // For multiple sources, use the first batch — subsequent batches import in background.
    const [[firstDataSourceId, firstBatch], ...remainingEntries] = [...byDataSource.entries()];
    importMutation.mutate({
      dataSourceId: firstDataSourceId,
      properties: firstBatch,
      syncDays: parseInt(syncDays),
    });

    // Fire-and-forget imports for additional data sources
    for (const [dsId, batch] of remainingEntries) {
      apiRequest("POST", "/api/listings/import", {
        dataSourceId: dsId,
        properties: batch,
        syncDays: parseInt(syncDays),
      }).catch((err) => {
        console.error(`Background import for data source ${dsId} failed:`, err);
      });
    }
  };

  const filteredProperties = properties.filter((property) => {
    const name = property.public_name || property.name || "";
    const address = [
      property.address?.street,
      property.address?.city,
      property.address?.state,
    ]
      .filter(Boolean)
      .join(", ");

    const matchesSearch =
      searchQuery === "" ||
      name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      address.toLowerCase().includes(searchQuery.toLowerCase());

    if (statusFilter === "selected") {
      return matchesSearch && selectedProperties.has(property.id);
    } else if (statusFilter === "unselected") {
      return matchesSearch && !selectedProperties.has(property.id);
    }

    return matchesSearch;
  });

  const formatAddress = (address?: HospitableProperty["address"]) => {
    if (!address) return "—";
    return (
      [address.street, address.city, address.state, address.country]
        .filter(Boolean)
        .join(", ") || "—"
    );
  };

  const getPropertyTypeIcon = (type?: string) => {
    switch (type?.toLowerCase()) {
      case "house":
        return <Home className="w-4 h-4" />;
      case "apartment":
        return <Building2 className="w-4 h-4" />;
      default:
        return <Building2 className="w-4 h-4" />;
    }
  };

  if (isLoadingDataSources) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!connectedSource) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="sticky top-0 z-50 bg-background border-b p-4">
        <div className="w-full space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold">Properties</h1>
              <p className="text-sm text-muted-foreground">
                {isInitialSetup
                  ? "Select properties to sync and analyze"
                  : "Manage your synced properties"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowNewPropertiesCheck(true);
                  refetchProperties();
                }}
                disabled={isLoadingProperties}
                data-testid="button-check-new-properties"
              >
                {isLoadingProperties ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Checking...
                  </>
                ) : (
                  "Check for New Properties"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/data-sources")}
                data-testid="button-back-to-connect"
              >
                Back to Data Sources
              </Button>
            </div>
          </div>
          <Card className="p-3 bg-primary/5 border-primary/20">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Sync Prior Reservations:
                </span>
                <Select value={syncDays} onValueChange={setSyncDays}>
                  <SelectTrigger
                    className="w-28"
                    data-testid="select-sync-days"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="180">180 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                  </SelectContent>
                </Select>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      data-testid="button-sync-help"
                    >
                      <HelpCircle className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p>
                      Syncs reservations with checkout dates within the selected
                      period, plus any currently active reservations. Reviews,
                      private remarks, and conversation history will be analyzed
                      by AI to create Tags, Themes, and Tasks.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center gap-3">
                {(() => {
                  const alreadySyncedExternalIds = new Set(
                    existingListings
                      ?.filter((l) => l.externalId)
                      .map((l) => l.externalId) || [],
                  );
                  const selectedArray = Array.from(selectedProperties);
                  const newToSync = selectedArray.filter(
                    (id) => !alreadySyncedExternalIds.has(id),
                  ).length;
                  const alreadySynced = selectedArray.filter((id) =>
                    alreadySyncedExternalIds.has(id),
                  ).length;

                  return (
                    <>
                      <span className="text-sm text-muted-foreground">
                        {newToSync > 0 ? (
                          <>
                            {newToSync} new to sync
                            {alreadySynced > 0 && (
                              <span className="text-muted-foreground/60">
                                {" "}
                                ({alreadySynced} already synced)
                              </span>
                            )}
                          </>
                        ) : alreadySynced > 0 ? (
                          <>{alreadySynced} already synced</>
                        ) : (
                          <>Select properties to sync</>
                        )}
                      </span>
                      <Button
                        onClick={handleSync}
                        disabled={newToSync === 0 || importMutation.isPending}
                        data-testid="button-sync-properties"
                      >
                        {importMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Syncing...
                          </>
                        ) : newToSync > 0 ? (
                          <>
                            <Check className="w-4 h-4 mr-2" />
                            Sync {newToSync} New Properties
                          </>
                        ) : selectedArray.length === 0 ? (
                          <>Select Properties</>
                        ) : (
                          <>
                            <Check className="w-4 h-4 mr-2" />
                            Already Synced
                          </>
                        )}
                      </Button>
                    </>
                  );
                })()}
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="w-full space-y-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Active</span>
              <span className="text-sm text-muted-foreground">Property</span>
            </div>
            <div className="flex-1 max-w-sm relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search properties..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-properties"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger
                className="w-36"
                data-testid="select-status-filter"
              >
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="selected">Selected</SelectItem>
                <SelectItem value="unselected">Unselected</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={selectAll}
                data-testid="button-select-all"
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={deselectAll}
                data-testid="button-deselect-all"
              >
                Deselect All
              </Button>
            </div>
          </div>

          {isLoadingListings ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">
                Loading properties...
              </span>
            </div>
          ) : properties.length === 0 && !showNewPropertiesCheck ? (
            <Card className="p-6">
              <div className="text-center space-y-4">
                <p className="text-muted-foreground">
                  No properties synced yet.
                </p>
                <Button
                  onClick={() => {
                    setShowNewPropertiesCheck(true);
                    refetchProperties();
                  }}
                  disabled={isLoadingProperties}
                  data-testid="button-load-from-hospitable"
                >
                  {isLoadingProperties ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading from Hospitable...
                    </>
                  ) : (
                    "Load Properties from Hospitable"
                  )}
                </Button>
              </div>
            </Card>
          ) : propertiesError && showNewPropertiesCheck ? (
            <Card className="p-6">
              <p className="text-destructive">
                Failed to load new properties from Hospitable. Your existing
                properties are shown below.
              </p>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 w-16 font-medium text-sm text-muted-foreground">
                        Active
                      </th>
                      <th className="text-left p-3 font-medium text-sm text-muted-foreground">
                        Listing Name
                      </th>
                      <th className="text-left p-3 font-medium text-sm text-muted-foreground">
                        Internal Name
                      </th>
                      <th className="text-left p-3 font-medium text-sm text-muted-foreground">
                        Account
                      </th>
                      <th className="text-left p-3 font-medium text-sm text-muted-foreground">
                        Address
                      </th>
                      <th className="text-left p-3 font-medium text-sm text-muted-foreground">
                        Type
                      </th>
                      <th className="text-left p-3 font-medium text-sm text-muted-foreground">
                        Owner
                      </th>
                      <th className="text-left p-3 font-medium text-sm text-muted-foreground">
                        Synced
                      </th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProperties.map((property) => {
                      const extProp = property as HospitableProperty & {
                        _isFromDatabase?: boolean;
                      };
                      const existingListing = existingListings?.find(
                        (l) => l.externalId === property.id,
                      );
                      const isSelected = selectedProperties.has(property.id);
                      const isNewFromApi = !extProp._isFromDatabase;

                      return (
                        <tr
                          key={property.id}
                          className={`border-b hover-elevate cursor-pointer ${isNewFromApi ? "bg-primary/5" : ""}`}
                          onClick={() =>
                            existingListing &&
                            navigate(`/listings/${existingListing.id}`)
                          }
                          data-testid={`row-property-${property.id}`}
                        >
                          <td
                            className="p-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Switch
                              checked={isSelected}
                              onCheckedChange={() =>
                                toggleProperty(property.id)
                              }
                              className={
                                existingListing
                                  ? "data-[state=checked]:bg-green-600"
                                  : ""
                              }
                              data-testid={`switch-property-${property.id}`}
                            />
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-8 rounded overflow-hidden bg-muted flex-shrink-0">
                                {property.picture ? (
                                  <img
                                    src={property.picture}
                                    alt={property.public_name || property.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Building2 className="w-4 h-4 text-muted-foreground" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p
                                    className="font-medium"
                                    title={
                                      property.public_name || property.name
                                    }
                                  >
                                    {property.public_name || property.name}
                                  </p>
                                  {isNewFromApi && (
                                    <Badge
                                      variant="default"
                                      className="text-xs"
                                    >
                                      New
                                    </Badge>
                                  )}
                                </div>
                                {property.headline && (
                                  <p className="text-xs text-muted-foreground truncate max-w-xs">
                                    {property.headline}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <span
                              className="text-sm text-muted-foreground"
                              title={property.name}
                            >
                              {property.name || "—"}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="text-sm text-muted-foreground">
                              {property.owner?.email ||
                                property.user?.email ||
                                property.listings?.find(
                                  (l) => l.platform === "airbnb",
                                )?.platform_email ||
                                "—"}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="text-sm text-muted-foreground truncate max-w-xs block">
                              {formatAddress(property.address)}
                            </span>
                          </td>
                          <td className="p-3">
                            <Badge variant="secondary" className="capitalize">
                              {property.property_type || "Unknown"}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <span className="text-sm">
                              {property.owner?.name ||
                                property.user?.name ||
                                (property.user?.first_name
                                  ? `${property.user.first_name} ${property.user.last_name || ""}`.trim()
                                  : null) ||
                                property.listings?.find(
                                  (l) => l.platform === "airbnb",
                                )?.platform_name ||
                                "—"}
                            </span>
                          </td>
                          <td className="p-3">
                            {existingListing?.lastSyncedAt ? (
                              <div className="flex items-center gap-1.5">
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="text-sm text-muted-foreground">
                                  {new Date(
                                    existingListing.lastSyncedAt,
                                  ).toLocaleDateString()}
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {existingListing && (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredProperties.length === 0 && (
                <div className="p-12 text-center text-muted-foreground">
                  {searchQuery
                    ? "No properties match your search."
                    : "No properties found."}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
