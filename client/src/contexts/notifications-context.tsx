import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { queryClient } from "@/lib/queryClient";

export interface Notification {
  id: string;
  type: "analysis_complete" | "analysis_in_progress" | "sync_complete" | "background_sync_complete" | "phase1_complete" | "phase2_complete" | "info";
  title: string;
  message: string;
  listingId?: string;
  listingName?: string;
  listingPhoto?: string; // Thumbnail photo for the listing
  count?: number; // For batch notifications (e.g., "3 properties synced")
  createdAt: Date;
  read: boolean;
}

export interface BackgroundAnalysis {
  id: string;
  listingId: string;
  listingName: string;
  startedAt: Date;
  reviewCount?: number;
  conversationCount?: number;
}

export interface ForegroundAnalysis {
  id: string;
  listingId: string;
  listingName: string;
  startedAt: Date;
}

export type BackgroundSyncStage = "data_sync" | "confirmation" | "ai_analysis" | "themes" | "complete" | "error";

export interface BackgroundSync {
  id: string;
  listingIds: string[];
  listingNames: string[];
  externalPropertyIds?: string[]; // Hospitable property IDs for toggle state restoration
  startedAt: Date;
  currentStage: BackgroundSyncStage;
  activeListingId?: string; // The listing ID currently being analyzed (for SSE reconnection)
  stats: {
    reservationsSynced: number;
    reviewsSynced: number;
    conversationsSynced: number;
    totalReservationsToAnalyze?: number;
    reservationsAnalyzed?: number;
    tagsCreated: number;
    tasksCreated: number;
    themesCreated: number;
  };
}

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  backgroundAnalyses: BackgroundAnalysis[];
  backgroundSyncs: BackgroundSync[];
  foregroundAnalyses: ForegroundAnalysis[];
  backgroundSentimentInProgress: boolean;
  addNotification: (notification: Omit<Notification, "id" | "createdAt" | "read">) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  startBackgroundAnalysis: (listingId: string, listingName: string, reviewCount?: number, conversationCount?: number) => string;
  completeBackgroundAnalysis: (analysisId: string) => void;
  getBackgroundAnalysis: (listingId: string) => BackgroundAnalysis | undefined;
  startForegroundAnalysis: (listingId: string, listingName: string) => string;
  completeForegroundAnalysis: (analysisId: string) => void;
  getForegroundAnalysis: (listingId: string) => ForegroundAnalysis | undefined;
  isListingAnalyzing: (listingId: string) => boolean;
  startBackgroundSync: (listingIds: string[], listingNames: string[], stage: BackgroundSync["currentStage"], stats: BackgroundSync["stats"], externalPropertyIds?: string[], activeListingId?: string) => string;
  updateBackgroundSync: (syncId: string, stage: BackgroundSync["currentStage"], stats: BackgroundSync["stats"]) => void;
  updateBackgroundSyncListingId: (syncId: string, listingId: string) => void;
  completeBackgroundSync: (syncId: string) => void;
  cancelBackgroundSync: (syncId: string) => void;
  getBackgroundSync: (syncId: string) => BackgroundSync | undefined;
  playNotificationSound: () => void;
  startSyncSSEListener: (syncId: string, listingId: string) => void;
  startMultiListingSyncSSE: (syncId: string, listingIds: string[]) => void;
  stopSyncSSEListener: () => void;
  clearBackgroundSentiment: () => void;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

const NOTIFICATIONS_STORAGE_KEY = "hostpulse-notifications";
const BACKGROUND_ANALYSES_STORAGE_KEY = "hostpulse-background-analyses";
const BACKGROUND_SYNCS_STORAGE_KEY = "hostpulse-background-syncs";

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Convert date strings back to Date objects
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => ({
          ...item,
          createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
          startedAt: item.startedAt ? new Date(item.startedAt) : undefined,
        })) as T;
      }
      return parsed;
    }
  } catch (e) {
    console.error("Failed to load from storage:", e);
  }
  return defaultValue;
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("Failed to save to storage:", e);
  }
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>(() => 
    loadFromStorage(NOTIFICATIONS_STORAGE_KEY, [])
  );
  const [backgroundAnalyses, setBackgroundAnalyses] = useState<BackgroundAnalysis[]>(() =>
    loadFromStorage(BACKGROUND_ANALYSES_STORAGE_KEY, [])
  );
  const [backgroundSyncs, setBackgroundSyncs] = useState<BackgroundSync[]>(() =>
    loadFromStorage(BACKGROUND_SYNCS_STORAGE_KEY, [])
  );
  const [backgroundSentimentInProgress, setBackgroundSentimentInProgress] = useState(false);
  const [foregroundAnalyses, setForegroundAnalyses] = useState<ForegroundAnalysis[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sseConnectionRef = useRef<EventSource | null>(null);
  const sseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeSseSyncIdRef = useRef<string | null>(null);
  const sentimentStartTimeRef = useRef<number | null>(null);
  const sentimentPollRef = useRef<NodeJS.Timeout | null>(null);

  // Global polling: auto-clear backgroundSentimentInProgress when pending count reaches 0
  // Also acts as a fallback: clears after 10 minutes if it never completes
  useEffect(() => {
    if (!backgroundSentimentInProgress) {
      if (sentimentPollRef.current) {
        clearInterval(sentimentPollRef.current);
        sentimentPollRef.current = null;
      }
      return;
    }

    const MAX_DURATION_MS = 10 * 60 * 1000; // 10 minute fallback

    const poll = async () => {
      try {
        const res = await fetch("/api/reviews/pending-analysis-count", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          // Only clear when tags have been processed AND all scored
          // pending===0 with total===0 means tags haven't been processed yet — don't clear
          if (data.pending === 0 && data.total > 0) {
            setBackgroundSentimentInProgress(false);
            sentimentStartTimeRef.current = null;
          }
        }
      } catch {
        // Ignore fetch errors during polling
      }

      // Fallback: auto-clear after max duration
      if (sentimentStartTimeRef.current && Date.now() - sentimentStartTimeRef.current > MAX_DURATION_MS) {
        setBackgroundSentimentInProgress(false);
        sentimentStartTimeRef.current = null;
      }
    };

    // Poll every 10 seconds
    sentimentPollRef.current = setInterval(poll, 10000);
    // Also run immediately
    poll();

    return () => {
      if (sentimentPollRef.current) {
        clearInterval(sentimentPollRef.current);
        sentimentPollRef.current = null;
      }
    };
  }, [backgroundSentimentInProgress]);

  // Persist notifications to localStorage
  useEffect(() => {
    saveToStorage(NOTIFICATIONS_STORAGE_KEY, notifications);
  }, [notifications]);

  // Persist background analyses to localStorage
  useEffect(() => {
    saveToStorage(BACKGROUND_ANALYSES_STORAGE_KEY, backgroundAnalyses);
  }, [backgroundAnalyses]);

  // Persist background syncs to localStorage (debounced to avoid performance issues)
  const debouncedSyncSaveRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    // Clear any pending save
    if (debouncedSyncSaveRef.current) {
      clearTimeout(debouncedSyncSaveRef.current);
    }
    // Debounce localStorage save to reduce overhead during rapid progress updates
    debouncedSyncSaveRef.current = setTimeout(() => {
      saveToStorage(BACKGROUND_SYNCS_STORAGE_KEY, backgroundSyncs);
    }, 500); // Save at most every 500ms
    
    return () => {
      if (debouncedSyncSaveRef.current) {
        clearTimeout(debouncedSyncSaveRef.current);
      }
    };
  }, [backgroundSyncs]);

  // Initialize audio with Web Audio API fallback for notification sound
  useEffect(() => {
    // Try to create audio element with a simple notification tone
    try {
      audioRef.current = new Audio("/notification.mp3");
      audioRef.current.volume = 0.5;
    } catch (e) {
      // Audio creation failed, will use Web Audio API fallback
    }
  }, []);

  const playNotificationSound = useCallback(() => {
    // Try mp3 first, fall back to Web Audio API beep
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // MP3 failed, try Web Audio API fallback
        playBeepFallback();
      });
      return;
    }
    playBeepFallback();
  }, []);

  // Web Audio API fallback for notification sound
  const playBeepFallback = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      
      oscillator.start();
      
      // Fade out
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      // Audio not supported
    }
  };

  const addNotification = useCallback((notification: Omit<Notification, "id" | "createdAt" | "read">) => {
    const newNotification: Notification = {
      ...notification,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      read: false,
    };
    setNotifications(prev => [newNotification, ...prev]);
    
    // Play sound for completion notifications
    if (notification.type === "analysis_complete" || notification.type === "sync_complete" || notification.type === "background_sync_complete" || notification.type === "phase1_complete" || notification.type === "phase2_complete") {
      playNotificationSound();
    }
  }, [playNotificationSound]);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const startBackgroundAnalysis = useCallback((
    listingId: string, 
    listingName: string,
    reviewCount?: number,
    conversationCount?: number
  ) => {
    const id = crypto.randomUUID();
    const analysis: BackgroundAnalysis = {
      id,
      listingId,
      listingName,
      startedAt: new Date(),
      reviewCount,
      conversationCount,
    };
    setBackgroundAnalyses(prev => [...prev, analysis]);
    return id;
  }, []);

  const completeBackgroundAnalysis = useCallback((analysisId: string) => {
    setBackgroundAnalyses(prev => {
      const analysis = prev.find(a => a.id === analysisId);
      if (analysis) {
        // Add notification using the found analysis data
        const newNotification: Notification = {
          id: crypto.randomUUID(),
          type: "analysis_complete",
          title: "Analysis Complete",
          message: `AI analysis for "${analysis.listingName}" is ready. Click to view the Ideal Guest Profile.`,
          listingId: analysis.listingId,
          listingName: analysis.listingName,
          createdAt: new Date(),
          read: false,
        };
        setNotifications(prevNotifications => [newNotification, ...prevNotifications]);
        playNotificationSound();
      }
      return prev.filter(a => a.id !== analysisId);
    });
  }, [playNotificationSound]);

  const getBackgroundAnalysis = useCallback((listingId: string) => {
    return backgroundAnalyses.find(a => a.listingId === listingId);
  }, [backgroundAnalyses]);

  const startForegroundAnalysis = useCallback((listingId: string, listingName: string) => {
    const id = crypto.randomUUID();
    const analysis: ForegroundAnalysis = {
      id,
      listingId,
      listingName,
      startedAt: new Date(),
    };
    setForegroundAnalyses(prev => [...prev, analysis]);
    return id;
  }, []);

  const completeForegroundAnalysis = useCallback((analysisId: string) => {
    setForegroundAnalyses(prev => prev.filter(a => a.id !== analysisId));
  }, []);

  const getForegroundAnalysis = useCallback((listingId: string) => {
    return foregroundAnalyses.find(a => a.listingId === listingId);
  }, [foregroundAnalyses]);

  const isListingAnalyzing = useCallback((listingId: string) => {
    const hasForeground = foregroundAnalyses.some(a => a.listingId === listingId);
    const hasBackground = backgroundAnalyses.some(a => a.listingId === listingId);
    return hasForeground || hasBackground;
  }, [foregroundAnalyses, backgroundAnalyses]);

  const startBackgroundSync = useCallback((
    listingIds: string[],
    listingNames: string[],
    stage: BackgroundSync["currentStage"],
    stats: BackgroundSync["stats"],
    externalPropertyIds?: string[],
    activeListingId?: string
  ) => {
    const id = crypto.randomUUID();
    const sync: BackgroundSync = {
      id,
      listingIds,
      listingNames,
      externalPropertyIds,
      startedAt: new Date(),
      currentStage: stage,
      activeListingId, // Store at creation for potential SSE reconnection
      stats,
    };
    setBackgroundSyncs(prev => [...prev, sync]);
    return id;
  }, []);

  const updateBackgroundSync = useCallback((
    syncId: string,
    stage: BackgroundSync["currentStage"],
    stats?: BackgroundSync["stats"],
    listingIds?: string[]
  ) => {
    setBackgroundSyncs(prev => 
      prev.map(s => {
        if (s.id !== syncId) return s;
        return {
          ...s,
          currentStage: stage,
          ...(stats && { stats }),
          ...(listingIds && { listingIds })
        };
      })
    );
  }, []);

  const updateBackgroundSyncListingId = useCallback((syncId: string, listingId: string) => {
    setBackgroundSyncs(prev =>
      prev.map(s => s.id === syncId ? { ...s, activeListingId: listingId } : s)
    );
  }, []);

  const completeBackgroundSync = useCallback((syncId: string) => {
    setBackgroundSyncs(prev => {
      const sync = prev.find(s => s.id === syncId);
      if (sync) {
        const displayName = sync.listingNames.length > 1
          ? `${sync.listingNames.length} properties`
          : sync.listingNames[0] || "Property";
        const newNotification: Notification = {
          id: crypto.randomUUID(),
          type: "sync_complete",
          title: "Sync Complete",
          message: `${displayName} synced successfully. Click to view Tags and Themes.`,
          listingId: sync.listingIds[0], // Include first listing ID for navigation
          createdAt: new Date(),
          read: false,
        };
        setNotifications(prevNotifications => [newNotification, ...prevNotifications]);
        playNotificationSound();
        
        // Start background sentiment analysis indicator
        // Global polling will auto-clear when pending count reaches 0
        setBackgroundSentimentInProgress(true);
        sentimentStartTimeRef.current = Date.now();
      }
      return prev.filter(s => s.id !== syncId);
    });
  }, [playNotificationSound]);
  
  const clearBackgroundSentiment = useCallback(() => {
    setBackgroundSentimentInProgress(false);
  }, []);

  const cancelBackgroundSync = useCallback((syncId: string) => {
    setBackgroundSyncs(prev => prev.filter(s => s.id !== syncId));
  }, []);

  const getBackgroundSync = useCallback((syncId: string) => {
    return backgroundSyncs.find(s => s.id === syncId);
  }, [backgroundSyncs]);

  // Ref to track active fetch abort controller for multi-listing SSE
  const multiSseAbortRef = useRef<AbortController | null>(null);
  const multiSseReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  // Stop any existing SSE connection (both EventSource and fetch-based)
  const stopSyncSSEListener = useCallback(() => {
    if (sseConnectionRef.current) {
      console.log("[SSE Context] Closing SSE connection");
      sseConnectionRef.current.close();
      sseConnectionRef.current = null;
    }
    if (sseTimeoutRef.current) {
      clearTimeout(sseTimeoutRef.current);
      sseTimeoutRef.current = null;
    }
    // Also stop multi-listing SSE if active
    if (multiSseAbortRef.current) {
      multiSseAbortRef.current.abort();
      multiSseAbortRef.current = null;
    }
    if (multiSseReaderRef.current) {
      try {
        multiSseReaderRef.current.cancel();
      } catch (e) {
        // Reader may already be closed
      }
      multiSseReaderRef.current = null;
    }
    activeSseSyncIdRef.current = null;
  }, []);

  // Stop multi-listing SSE connection
  const stopMultiListingSyncSSE = useCallback(() => {
    if (multiSseAbortRef.current) {
      console.log("[SSE Context Multi] Aborting fetch stream");
      multiSseAbortRef.current.abort();
      multiSseAbortRef.current = null;
    }
    if (multiSseReaderRef.current) {
      try {
        multiSseReaderRef.current.cancel();
      } catch (e) {
        // Reader may already be closed
      }
      multiSseReaderRef.current = null;
    }
  }, []);

  // Start multi-listing SSE using fetch (POST endpoint requires fetch, not EventSource)
  const startMultiListingSyncSSE = useCallback(async (syncId: string, listingIds: string[]) => {
    // Close any existing connections first
    stopSyncSSEListener();
    stopMultiListingSyncSSE();
    
    console.log("[SSE Context] Starting multi-listing SSE for sync:", syncId, "listings:", listingIds);
    activeSseSyncIdRef.current = syncId;
    
    const abortController = new AbortController();
    multiSseAbortRef.current = abortController;
    
    try {
      const response = await fetch('/api/listings/analyze-all-reservations-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingIds }),
        credentials: 'include',
        signal: abortController.signal,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available');
      }
      
      // Store reader ref for cleanup
      multiSseReaderRef.current = reader;
      
      const decoder = new TextDecoder();
      let buffer = '';
      
      // Parse SSE events properly - SSE events are separated by \n\n
      const parseSSEEvents = (text: string): { events: string[], remaining: string } => {
        const events: string[] = [];
        // Split by double newlines (SSE event boundary)
        const parts = text.split('\n\n');
        // Last part may be incomplete, keep as remaining
        const remaining = parts.pop() || '';
        
        for (const part of parts) {
          // Extract data from "data: <json>" lines
          const lines = part.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              events.push(line.slice(6));
            }
          }
        }
        return { events, remaining };
      };
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const { events, remaining } = parseSSEEvents(buffer);
        buffer = remaining;
        
        for (const eventData of events) {
          try {
            const data = JSON.parse(eventData);
            const currentSyncId = activeSseSyncIdRef.current;
            
            if (!currentSyncId) continue;
            
            if (data.type === 'init') {
              console.log("[SSE Context Multi] Init received:", data);
              const totalReservations = typeof data.totalReservations === 'number' ? data.totalReservations : 0;
              const reservationsAnalyzed = data.alreadyComplete && typeof data.reservationsAnalyzed === 'number' 
                ? data.reservationsAnalyzed 
                : 0;
              if (data.modelRouting) {
                console.log(`[SSE Context Multi] Model routing: ${data.modelRouting.rich} rich (gpt-4.1-mini), ${data.modelRouting.simple} simple (gpt-4o-mini)`);
              }
              if (data.alreadyComplete) {
                console.log(`[SSE Context Multi] All ${totalReservations} reservations already analyzed`);
              }
              setBackgroundSyncs(prev => prev.map(s => {
                if (s.id !== currentSyncId) return s;
                return {
                  ...s,
                  currentStage: "ai_analysis",
                  stats: {
                    ...s.stats,
                    totalReservationsToAnalyze: totalReservations,
                    reservationsAnalyzed
                  }
                };
              }));
            } else if (data.type === 'progress') {
              const totalReservations = typeof data.totalReservations === 'number' ? data.totalReservations : undefined;
              const reservationsAnalyzed = typeof data.reservationsAnalyzed === 'number' ? data.reservationsAnalyzed : undefined;
              const tagsCreated = typeof data.tagsCreated === 'number' ? data.tagsCreated : undefined;
              const tasksCreated = typeof data.tasksCreated === 'number' ? data.tasksCreated : undefined;
              
              console.log("[SSE Context Multi] Progress:", reservationsAnalyzed, "/", totalReservations);
              setBackgroundSyncs(prev => prev.map(s => {
                if (s.id !== currentSyncId) return s;
                return {
                  ...s,
                  currentStage: "ai_analysis",
                  stats: {
                    ...s.stats,
                    ...(totalReservations !== undefined && { totalReservationsToAnalyze: totalReservations }),
                    ...(reservationsAnalyzed !== undefined && { reservationsAnalyzed }),
                    ...(tagsCreated !== undefined && { tagsCreated }),
                    ...(tasksCreated !== undefined && { tasksCreated })
                  }
                };
              }));
            } else if (data.type === 'tag_created') {
              // STREAMING: Individual tag created in real-time
              // Use delta approach for reliable counting across parallel batches
              const delta = typeof data.tagsCreatedDelta === 'number' ? data.tagsCreatedDelta : 1;
              console.log("[SSE Context Multi] Tag created:", data.tag?.name, "via", data.model);
              setBackgroundSyncs(prev => prev.map(s => {
                if (s.id !== currentSyncId) return s;
                return {
                  ...s,
                  stats: {
                    ...s.stats,
                    tagsCreated: (s.stats.tagsCreated || 0) + delta
                  }
                };
              }));
            } else if (data.type === 'listing_started') {
              console.log("[SSE Context Multi] Listing started:", data.listingName, "-", data.reservationsInListing, "reservations");
            } else if (data.type === 'listing_complete') {
              console.log("[SSE Context Multi] Listing complete:", data.listingName, "-", data.tagsCreated, "tags");
            } else if (data.type === 'complete') {
              console.log("[SSE Context Multi] Complete received:", data);
              
              const reservationsAnalyzed = typeof data.reservationsAnalyzed === 'number' ? data.reservationsAnalyzed : 0;
              const tagsCreated = typeof data.tagsCreated === 'number' ? data.tagsCreated : 0;
              const tasksCreated = typeof data.tasksCreated === 'number' ? data.tasksCreated : 0;
              const themesPromoted = typeof data.themesPromoted === 'number' ? data.themesPromoted : 0;
              const alreadyComplete = data.alreadyComplete === true;
              
              if (alreadyComplete) {
                console.log("[SSE Context Multi] All reservations were already analyzed - showing historical stats");
              }
              
              // Delay slightly so user can see 100% before transitioning
              setTimeout(() => {
                setBackgroundSyncs(prev => prev.map(s => {
                  if (s.id !== currentSyncId) return s;
                  
                  // If this is a "reconnection" that immediately got 0 (sync already completed),
                  // AND we don't have alreadyComplete flag with proper stats,
                  // preserve existing stats rather than resetting to 0
                  const isLegacyReconnectionWithZero = !alreadyComplete && 
                    reservationsAnalyzed === 0 && tagsCreated === 0 && 
                    (s.stats.totalReservationsToAnalyze ?? 0) > 0;
                  
                  if (isLegacyReconnectionWithZero) {
                    console.log("[SSE Context Multi] Reconnection detected - sync already completed, preserving stats");
                    return {
                      ...s,
                      currentStage: "complete",
                      stats: {
                        ...s.stats,
                        // Mark as fully analyzed (use stored total as analyzed count)
                        reservationsAnalyzed: s.stats.totalReservationsToAnalyze
                      }
                    };
                  }
                  
                  return {
                    ...s,
                    currentStage: "complete",
                    stats: {
                      ...s.stats,
                      reservationsAnalyzed,
                      tagsCreated,
                      tasksCreated,
                      themesCreated: themesPromoted
                    }
                  };
                }));
                
                // Invalidate queries so data is fresh
                queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
                queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
                queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
                queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
                queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
              }, 500);
              
              activeSseSyncIdRef.current = null;
              multiSseAbortRef.current = null;
              multiSseReaderRef.current = null;
            } else if (data.type === 'error') {
              console.error("[SSE Context Multi] Error:", data);
              setBackgroundSyncs(prev => prev.map(s => {
                if (s.id !== currentSyncId) return s;
                return { ...s, currentStage: "error" };
              }));
              activeSseSyncIdRef.current = null;
              multiSseAbortRef.current = null;
              multiSseReaderRef.current = null;
            }
          } catch (parseErr) {
            console.error("[SSE Context Multi] Parse error:", parseErr);
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log("[SSE Context Multi] Request aborted");
        return;
      }
      console.error("[SSE Context Multi] Error:", err);
      const currentSyncId = activeSseSyncIdRef.current;
      if (currentSyncId) {
        setBackgroundSyncs(prev => prev.map(s => {
          if (s.id !== currentSyncId) return s;
          return { ...s, currentStage: "error" };
        }));
      }
      activeSseSyncIdRef.current = null;
      multiSseAbortRef.current = null;
    }
  }, [stopSyncSSEListener, stopMultiListingSyncSSE, queryClient]);

  // Start SSE listener for sync progress - this persists across page navigation
  const startSyncSSEListener = useCallback((syncId: string, listingId: string) => {
    // Close any existing connection first
    stopSyncSSEListener();
    
    console.log("[SSE Context] Starting SSE listener for sync:", syncId, "listing:", listingId);
    activeSseSyncIdRef.current = syncId;
    
    // Store the active listing ID in the sync for potential reconnection
    setBackgroundSyncs(prev => prev.map(s => 
      s.id === syncId ? { ...s, activeListingId: listingId } : s
    ));
    
    const eventSource = new EventSource(`/api/listings/${listingId}/analyze-reservations-stream`);
    sseConnectionRef.current = eventSource;
    
    // Set a timeout for fallback (2 minutes)
    sseTimeoutRef.current = setTimeout(async () => {
      console.log("[SSE Context] SSE timeout reached, attempting POST fallback");
      const currentSyncIdForFallback = activeSseSyncIdRef.current;
      stopSyncSSEListener();
      
      // Attempt POST fallback to complete the analysis
      if (currentSyncIdForFallback && listingId) {
        try {
          const response = await fetch(`/api/listings/${listingId}/analyze-reservations`, {
            method: 'POST',
            credentials: 'include',
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log("[SSE Context] POST fallback succeeded:", data);
            
            // Mark sync as complete
            setBackgroundSyncs(prev => prev.map(s => {
              if (s.id !== currentSyncIdForFallback) return s;
              return {
                ...s,
                currentStage: "complete",
                stats: {
                  ...s.stats,
                  reservationsAnalyzed: data.reservationsProcessed || 0,
                  tagsCreated: data.tagsCreated || 0,
                  tasksCreated: data.tasksCreated || 0,
                  themesCreated: data.themesPromoted || 0
                }
              };
            }));
            
            // Invalidate queries
            queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
            queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
            queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
            queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
            queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
          } else {
            console.error("[SSE Context] POST fallback failed with status:", response.status);
            // Mark sync as error state so user can retry
            setBackgroundSyncs(prev => prev.map(s => {
              if (s.id !== currentSyncIdForFallback) return s;
              return { ...s, currentStage: "error" };
            }));
          }
        } catch (err) {
          console.error("[SSE Context] POST fallback error:", err);
          // Mark sync as error state so user can retry
          setBackgroundSyncs(prev => prev.map(s => {
            if (s.id !== currentSyncIdForFallback) return s;
            return { ...s, currentStage: "error" };
          }));
        }
      }
    }, 120000);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const currentSyncId = activeSseSyncIdRef.current;
        
        if (!currentSyncId) return;
        
        // Ignore heartbeat messages
        if (data.type === 'heartbeat') return;
        
        if (data.type === 'init') {
          // Handle alreadyComplete case - reservations were pre-analyzed
          const alreadyComplete = data.alreadyComplete === true;
          const reservationsAnalyzed = alreadyComplete && typeof data.reservationsAnalyzed === 'number' 
            ? data.reservationsAnalyzed 
            : 0;
          
          if (alreadyComplete) {
            console.log(`[SSE Context] All ${data.totalReservations} reservations already analyzed`);
          }
          
          setBackgroundSyncs(prev => prev.map(s => {
            if (s.id !== currentSyncId) return s;
            return {
              ...s,
              currentStage: "ai_analysis",
              stats: {
                ...s.stats,
                // Only update total if not already set (preserve aggregated total from multi-property sync)
                totalReservationsToAnalyze: (s.stats.totalReservationsToAnalyze ?? 0) > 0 
                  ? s.stats.totalReservationsToAnalyze 
                  : data.totalReservations,
                reservationsAnalyzed
              }
            };
          }));
        } else if (data.type === 'progress') {
          setBackgroundSyncs(prev => prev.map(s => {
            if (s.id !== currentSyncId) return s;
            return {
              ...s,
              currentStage: "ai_analysis",
              stats: {
                ...s.stats,
                reservationsAnalyzed: data.reservationsAnalyzed,
                tagsCreated: data.tagsCreated,
                tasksCreated: data.tasksCreated
              }
            };
          }));
        } else if (data.type === 'complete') {
          console.log("[SSE Context] SSE complete received:", data);
          
          const alreadyComplete = data.alreadyComplete === true;
          if (alreadyComplete) {
            console.log("[SSE Context] All reservations were already analyzed - showing historical stats");
          }
          
          // Update to themes stage first
          setBackgroundSyncs(prev => prev.map(s => {
            if (s.id !== currentSyncId) return s;
            return {
              ...s,
              currentStage: "themes",
              stats: {
                ...s.stats,
                reservationsAnalyzed: data.reservationsAnalyzed,
                tagsCreated: data.tagsCreated,
                tasksCreated: data.tasksCreated,
                themesCreated: data.themesPromoted || 0
              }
            };
          }));
          
          // Then mark as complete after brief delay
          setTimeout(() => {
            console.log("[SSE Context] Setting stage to complete");
            setBackgroundSyncs(prev => prev.map(s => {
              if (s.id !== currentSyncId) return s;
              return {
                ...s,
                currentStage: "complete",
                stats: {
                  ...s.stats,
                  reservationsAnalyzed: data.reservationsAnalyzed,
                  tagsCreated: data.tagsCreated,
                  tasksCreated: data.tasksCreated,
                  themesCreated: data.themesPromoted || 0
                }
              };
            }));
            
            // Invalidate queries so data is fresh
            queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
            queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
            queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
            queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
            queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
          }, 500);
          
          stopSyncSSEListener();
        } else if (data.type === 'error') {
          console.error("[SSE Context] SSE error:", data);
          stopSyncSSEListener();
        }
      } catch (parseErr) {
        console.error("[SSE Context] Error parsing SSE data:", parseErr);
      }
    };
    
    eventSource.onerror = async (err) => {
      console.error("[SSE Context] SSE connection error:", err);
      const currentSyncIdForError = activeSseSyncIdRef.current;
      stopSyncSSEListener();
      
      // Attempt POST fallback on error
      if (currentSyncIdForError && listingId) {
        console.log("[SSE Context] Attempting POST fallback after SSE error");
        try {
          const response = await fetch(`/api/listings/${listingId}/analyze-reservations`, {
            method: 'POST',
            credentials: 'include',
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log("[SSE Context] POST fallback after error succeeded:", data);
            
            // Mark sync as complete
            setBackgroundSyncs(prev => prev.map(s => {
              if (s.id !== currentSyncIdForError) return s;
              return {
                ...s,
                currentStage: "complete",
                stats: {
                  ...s.stats,
                  reservationsAnalyzed: data.reservationsProcessed || 0,
                  tagsCreated: data.tagsCreated || 0,
                  tasksCreated: data.tasksCreated || 0,
                  themesCreated: data.themesPromoted || 0
                }
              };
            }));
            
            // Invalidate queries
            queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
            queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
            queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
            queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
            queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
          } else {
            console.error("[SSE Context] POST fallback after error failed:", response.status);
            // Mark sync as error state so user can retry
            setBackgroundSyncs(prev => prev.map(s => {
              if (s.id !== currentSyncIdForError) return s;
              return { ...s, currentStage: "error" };
            }));
          }
        } catch (fallbackErr) {
          console.error("[SSE Context] POST fallback after error failed:", fallbackErr);
          // Mark sync as error state so user can retry
          setBackgroundSyncs(prev => prev.map(s => {
            if (s.id !== currentSyncIdForError) return s;
            return { ...s, currentStage: "error" };
          }));
        }
      }
    };
  }, [stopSyncSSEListener]);

  // Clean up SSE connection on unmount
  useEffect(() => {
    return () => {
      stopSyncSSEListener();
    };
  }, [stopSyncSSEListener]);

  // Resume SSE for active syncs on mount or when backgroundSyncs changes
  // This handles page refreshes and navigation back to the app
  useEffect(() => {
    // Don't resume if there's already an active SSE connection
    if (sseConnectionRef.current || activeSseSyncIdRef.current || multiSseAbortRef.current) {
      return;
    }
    
    // Find any sync that's in AI analysis or themes stage (the stages that use SSE)
    // We only resume SSE for these stages because data_sync/confirmation don't use SSE
    const activeSync = backgroundSyncs.find(
      s => s.currentStage === "ai_analysis" || s.currentStage === "themes"
    );
    
    if (activeSync) {
      // Check if we have multiple listing IDs - if so, use multi-listing SSE
      const validListingIds = activeSync.listingIds.filter((id): id is string => !!id);
      
      if (validListingIds.length > 1) {
        // Multi-listing sync - use the POST-based SSE endpoint
        console.log("[SSE Context] Resuming multi-listing SSE for active sync:", activeSync.id, "with", validListingIds.length, "listings");
        startMultiListingSyncSSE(activeSync.id, validListingIds);
      } else if (validListingIds.length === 1) {
        // Single listing sync - use the GET-based EventSource
        console.log("[SSE Context] Resuming single-listing SSE for active sync:", activeSync.id, "stage:", activeSync.currentStage);
        startSyncSSEListener(activeSync.id, validListingIds[0]);
      } else {
        // Try activeListingId as fallback
        const listingId = activeSync.activeListingId;
        if (listingId) {
          console.log("[SSE Context] Resuming SSE with activeListingId for sync:", activeSync.id);
          startSyncSSEListener(activeSync.id, listingId);
        } else {
          console.log("[SSE Context] Cannot resume SSE - no listing IDs available for sync in", activeSync.currentStage, "stage");
          // For syncs without listing IDs but in SSE-dependent stages, mark as error
          setBackgroundSyncs(prev => prev.map(s => {
            if (s.id !== activeSync.id) return s;
            return { ...s, currentStage: "error" };
          }));
        }
      }
    }
  }, [backgroundSyncs, startSyncSSEListener, startMultiListingSyncSSE]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationsContext.Provider value={{
      notifications,
      unreadCount,
      backgroundAnalyses,
      backgroundSyncs,
      foregroundAnalyses,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearNotification,
      startBackgroundAnalysis,
      completeBackgroundAnalysis,
      getBackgroundAnalysis,
      startForegroundAnalysis,
      completeForegroundAnalysis,
      getForegroundAnalysis,
      isListingAnalyzing,
      startBackgroundSync,
      updateBackgroundSync,
      updateBackgroundSyncListingId,
      completeBackgroundSync,
      cancelBackgroundSync,
      getBackgroundSync,
      playNotificationSound,
      startSyncSSEListener,
      startMultiListingSyncSSE,
      stopSyncSSEListener,
      backgroundSentimentInProgress,
      clearBackgroundSentiment,
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
}
