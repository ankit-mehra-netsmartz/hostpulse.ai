import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, ArrowLeft, CheckCircle2, Circle, Camera, MapPin,
  AlertTriangle, ChevronDown, ChevronUp, Mic, FileText, Square,
  Upload, X, Languages, Send, Navigation, ImagePlus, MessageSquare
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { ProcedureStep, ProcedureStepIssue, GpsLocation } from "@shared/schema";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface ProcedureData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  steps: ProcedureStep[];
}

interface ModuleGroup {
  title: string | null;
  steps: ProcedureStep[];
}

interface StepVerificationState {
  gpsLocation?: GpsLocation;
  gpsAccuracy?: number;
  gpsWatching?: boolean;
  gpsConfirmed?: boolean;
  photoUrl?: string;
  comment?: string;
  commentTranslation?: string;
  voiceNoteTranscript?: string;
  voiceNoteTranslation?: string;
  showGps?: boolean;
  showPhoto?: boolean;
  showComment?: boolean;
}

function groupStepsByModule(steps: ProcedureStep[]): ModuleGroup[] {
  const groups: ModuleGroup[] = [];
  let currentModule: string | null = null;
  let currentGroup: ProcedureStep[] = [];

  const sorted = [...steps].sort((a, b) => {
    if (a.moduleOrder !== null && b.moduleOrder !== null && a.moduleOrder !== b.moduleOrder) {
      return a.moduleOrder - b.moduleOrder;
    }
    return a.stepOrder - b.stepOrder;
  });

  for (const step of sorted) {
    const mod = step.moduleTitle || null;
    if (mod !== currentModule) {
      if (currentGroup.length > 0) {
        groups.push({ title: currentModule, steps: currentGroup });
      }
      currentModule = mod;
      currentGroup = [step];
    } else {
      currentGroup.push(step);
    }
  }
  if (currentGroup.length > 0) {
    groups.push({ title: currentModule, steps: currentGroup });
  }
  return groups;
}

export default function MobileProcedureChecklist({ params }: { params: { id: string } }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const searchParams = new URLSearchParams(window.location.search);
  const taskId = searchParams.get("taskId") || undefined;
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [stepStates, setStepStates] = useState<Record<string, StepVerificationState>>({});

  const { data: procedure, isLoading } = useQuery<ProcedureData>({
    queryKey: ["/api/procedures", params.id],
  });

  const autoExpandedRef = useRef(false);
  useEffect(() => {
    if (!procedure || !user?.id || autoExpandedRef.current) return;
    const steps = procedure.steps || [];
    const firstGpsStep = steps.find(
      (s) => s.requiresGpsVerification && !isStepCompleted(s, user.id)
    );
    if (firstGpsStep) {
      autoExpandedRef.current = true;
      setExpandedSteps((prev) => new Set(prev).add(firstGpsStep.id));
    }
  }, [procedure, user?.id]);

  const toggleCompleteMutation = useMutation({
    mutationFn: async ({ stepId, payload }: { stepId: string; payload: any }) => {
      await apiRequest("POST", `/api/mobile/procedure-steps/${stepId}/toggle-complete`, payload);
    },
    onSuccess: (_, { stepId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/procedures", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/my-tasks"] });
      setStepStates(prev => {
        const next = { ...prev };
        delete next[stepId];
        return next;
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateStepState = (stepId: string, updates: Partial<StepVerificationState>) => {
    setStepStates(prev => ({
      ...prev,
      [stepId]: { ...prev[stepId], ...updates },
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!procedure) {
    return (
      <div className="px-4 pt-6">
        <p className="text-muted-foreground">Procedure not found</p>
      </div>
    );
  }

  const steps = procedure.steps || [];
  const moduleGroups = groupStepsByModule(steps);
  const completedCount = steps.filter((s) => isStepCompleted(s, user?.id)).length;
  const totalSteps = steps.length;
  const progress = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  const toggleModule = (title: string) => {
    setCollapsedModules((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const toggleStepExpand = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const handleToggleComplete = (step: ProcedureStep) => {
    const completed = isStepCompleted(step, user?.id);
    const state = stepStates[step.id] || {};

    if (completed) {
      toggleCompleteMutation.mutate({ stepId: step.id, payload: { taskId } });
      return;
    }

    const photoMode = (step as any).photoVerificationMode || (step.requiresPhotoVerification ? 'required' : 'none');
    if (photoMode === 'required' && !state.photoUrl) {
      updateStepState(step.id, { showPhoto: true });
      if (!expandedSteps.has(step.id)) toggleStepExpand(step.id);
      toast({ title: "Photo required", description: "Please upload or take a photo to complete this step.", variant: "destructive" });
      return;
    }

    if (step.requiresGpsVerification && !state.gpsConfirmed) {
      updateStepState(step.id, { showGps: true });
      if (!expandedSteps.has(step.id)) toggleStepExpand(step.id);
      toast({ title: "GPS verification required", description: "Please confirm your location to complete this step.", variant: "destructive" });
      return;
    }

    toggleCompleteMutation.mutate({
      stepId: step.id,
      payload: {
        taskId,
        gpsLocation: state.gpsLocation,
        photoUrl: state.photoUrl,
        comment: state.comment,
        commentTranslation: state.commentTranslation,
        voiceNoteTranscript: state.voiceNoteTranscript,
        voiceNoteTranslation: state.voiceNoteTranslation,
      },
    });
  };

  return (
    <div className="px-4 pt-4 pb-4 space-y-4" data-testid="mobile-procedure-checklist">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => taskId ? navigate(`/mobile/tasks/${taskId}`) : navigate("/mobile/procedures")}
          data-testid="btn-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold line-clamp-1" data-testid="text-procedure-title">
            {procedure.title}
          </h1>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{completedCount} of {totalSteps} steps complete</span>
          <span className="font-medium">{progress}%</span>
        </div>
        <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              progress === 100 ? "bg-green-500" : "bg-primary"
            )}
            style={{ width: `${progress}%` }}
            data-testid="progress-bar"
          />
        </div>
      </div>

      {progress === 100 && (
        <Card className="p-3 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" data-testid="card-all-complete">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-medium">All steps completed!</span>
          </div>
        </Card>
      )}

      {procedure.description && (
        <p className="text-sm text-muted-foreground">{procedure.description}</p>
      )}

      <div className="space-y-3">
        {moduleGroups.map((group, gi) => {
          const moduleKey = group.title || `ungrouped-${gi}`;
          const isCollapsed = group.title ? collapsedModules.has(group.title) : false;
          const moduleCompleted = group.steps.filter((s) => isStepCompleted(s, user?.id)).length;

          return (
            <div key={moduleKey} data-testid={`module-group-${gi}`}>
              {group.title && (
                <button
                  className="flex items-center justify-between w-full px-2 py-2 text-sm font-semibold text-muted-foreground"
                  onClick={() => toggleModule(group.title!)}
                  data-testid={`btn-toggle-module-${gi}`}
                >
                  <span>{group.title} ({moduleCompleted}/{group.steps.length})</span>
                  {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </button>
              )}

              {!isCollapsed && (
                <div className="space-y-1.5">
                  {group.steps.map((step) => (
                    <StepItem
                      key={step.id}
                      step={step}
                      userId={user?.id}
                      isExpanded={expandedSteps.has(step.id)}
                      onToggleExpand={() => toggleStepExpand(step.id)}
                      onToggleComplete={() => handleToggleComplete(step)}
                      isPending={toggleCompleteMutation.isPending}
                      verificationState={stepStates[step.id] || {}}
                      onUpdateState={(updates) => updateStepState(step.id, updates)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function isStepCompleted(step: ProcedureStep, userId?: string): boolean {
  if (!step.completions || !userId) return false;
  return (step.completions as any[]).some((c: any) => c.userId === userId);
}

interface StepItemProps {
  step: ProcedureStep;
  userId?: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleComplete: () => void;
  isPending: boolean;
  verificationState: StepVerificationState;
  onUpdateState: (updates: Partial<StepVerificationState>) => void;
}

function StepItem({ step, userId, isExpanded, onToggleExpand, onToggleComplete, isPending, verificationState, onUpdateState }: StepItemProps) {
  const completed = isStepCompleted(step, userId);
  const photoMode = (step as any).photoVerificationMode || (step.requiresPhotoVerification ? 'required' : 'none');
  const needsGps = step.requiresGpsVerification && !completed;
  const hasPhoto = photoMode !== 'none' && !completed;
  const photoRequired = photoMode === 'required' && !completed;
  const hasDetails = step.description || step.voiceNoteUrl || step.voiceNoteTranscript ||
    photoMode !== 'none' || step.requiresGpsVerification ||
    (step.issues && (step.issues as ProcedureStepIssue[]).length > 0);
  const activeIssues = step.issues
    ? (step.issues as ProcedureStepIssue[]).filter((i) => !i.resolvedAt)
    : [];

  const gpsReady = !needsGps || !!verificationState.gpsConfirmed;
  const photoReady = !photoRequired || !!verificationState.photoUrl;
  const canComplete = gpsReady && photoReady;

  return (
    <Card
      className={cn(
        "overflow-visible transition-colors",
        completed && "bg-green-50/50 dark:bg-green-900/10 border-green-200/50 dark:border-green-800/30"
      )}
      data-testid={`step-item-${step.id}`}
    >
      <div className="flex items-start gap-3 p-3">
        <button
          className="mt-0.5 flex-shrink-0 transition-all active:scale-90"
          onClick={onToggleComplete}
          disabled={isPending || (!completed && !canComplete)}
          data-testid={`btn-toggle-step-${step.id}`}
        >
          {completed ? (
            <CheckCircle2 className="h-6 w-6 text-green-500" />
          ) : canComplete ? (
            <Circle className="h-6 w-6 text-muted-foreground/40" />
          ) : (
            <Circle className="h-6 w-6 text-muted-foreground/20" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2" onClick={onToggleExpand}>
            <span
              className={cn(
                "text-sm font-medium transition-colors",
                completed && "line-through text-muted-foreground"
              )}
              data-testid={`text-step-label-${step.id}`}
            >
              {step.label}
            </span>
            <div className="flex items-center gap-1 flex-shrink-0">
              {photoMode !== 'none' && (
                <Camera className={cn("h-3.5 w-3.5", verificationState.photoUrl ? "text-green-500" : photoMode === 'required' ? "text-blue-500" : "text-cyan-500")} />
              )}
              {step.requiresGpsVerification && (
                <MapPin className={cn("h-3.5 w-3.5", verificationState.gpsConfirmed ? "text-green-500" : "text-orange-500")} />
              )}
              {activeIssues.length > 0 && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
              {isExpanded
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />
              }
            </div>
          </div>

          {!completed && !isExpanded && (needsGps || hasPhoto) && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {needsGps && !verificationState.gpsConfirmed && (
                <Badge variant="outline" className="text-[10px] py-0 text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-700">
                  GPS needed
                </Badge>
              )}
              {hasPhoto && !verificationState.photoUrl && (
                <Badge variant="outline" className={cn("text-[10px] py-0", 
                  photoRequired 
                    ? "text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700"
                    : "text-cyan-600 dark:text-cyan-400 border-cyan-300 dark:border-cyan-700"
                )}>
                  {photoRequired ? "Photo required" : "Photo allowed"}
                </Badge>
              )}
            </div>
          )}

          {isExpanded && (
            <div className="mt-2 space-y-3 text-sm" onClick={(e) => e.stopPropagation()}>
              {step.description && (
                <p className="text-muted-foreground text-xs leading-relaxed" data-testid={`text-step-desc-${step.id}`}>
                  {step.description}
                </p>
              )}

              {step.voiceNoteTranscript && (
                <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-secondary/50 p-2 rounded-md">
                  <Mic className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <span className="line-clamp-3">{step.voiceNoteTranscript}</span>
                </div>
              )}

              {step.voiceNoteUrl && (
                <audio controls className="w-full h-8" src={step.voiceNoteUrl} data-testid={`audio-step-${step.id}`} />
              )}

              {activeIssues.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {activeIssues.length} open issue{activeIssues.length > 1 ? "s" : ""}
                  </div>
                  {activeIssues.map((issue, idx) => (
                    <div key={idx} className="text-xs text-muted-foreground bg-red-50 dark:bg-red-900/20 p-2 rounded-md">
                      {issue.description || "Issue reported"}
                    </div>
                  ))}
                </div>
              )}

              {step.media && (step.media as any[]).length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  {(step.media as any[]).length} attachment{(step.media as any[]).length > 1 ? "s" : ""}
                </div>
              )}

              {!completed && needsGps && (
                <GpsVerificationPanel
                  step={step}
                  state={verificationState}
                  onUpdateState={onUpdateState}
                />
              )}

              {!completed && hasPhoto && (
                <PhotoVerificationPanel
                  state={verificationState}
                  onUpdateState={onUpdateState}
                  isRequired={photoRequired}
                />
              )}

              {!completed && (
                <StepCommentPanel
                  state={verificationState}
                  onUpdateState={onUpdateState}
                />
              )}

              {completed && (() => {
                const completion = (step.completions as any[])?.find((c: any) => c.userId === userId);
                if (!completion) return null;
                const savedGps = completion.gpsLocation as GpsLocation | undefined;
                const savedPhoto = completion.photoUrl as string | undefined;
                const savedComment = completion.comment as string | undefined;
                if (!savedGps && !savedPhoto && !savedComment) return null;
                return (
                  <CompletedVerificationSummary
                    step={step}
                    gpsLocation={savedGps}
                    photoUrl={savedPhoto}
                    comment={savedComment}
                  />
                );
              })()}

              {!completed && canComplete && (needsGps || needsPhoto) && (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={onToggleComplete}
                  disabled={isPending}
                  data-testid={`btn-complete-verified-${step.id}`}
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                  Mark Complete
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function GpsVerificationPanel({ step, state, onUpdateState }: {
  step: ProcedureStep;
  state: StepVerificationState;
  onUpdateState: (updates: Partial<StepVerificationState>) => void;
}) {
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const expectedLocation = step.expectedGpsLocation as GpsLocation | null;
  const radiusMeters = step.gpsRadiusMeters || 100;

  const distanceToExpected = state.gpsLocation && expectedLocation
    ? haversineDistance(state.gpsLocation.latitude, state.gpsLocation.longitude, expectedLocation.latitude, expectedLocation.longitude)
    : null;

  const isWithinRadius = distanceToExpected !== null ? distanceToExpected <= radiusMeters : null;

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("GPS is not available on this device");
      return;
    }

    if (state.gpsConfirmed) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        onUpdateState({
          gpsLocation: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date().toISOString(),
          },
          gpsAccuracy: position.coords.accuracy,
        });
      },
      (err) => {
        setError(err.message || "Could not get GPS position");
        toast({ title: "GPS Error", description: err.message, variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [state.gpsConfirmed]);

  const confirmLocation = () => {
    if (!state.gpsLocation) return;
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    onUpdateState({ gpsConfirmed: true });
    toast({ title: "Location confirmed", description: `Accuracy: ${Math.round(state.gpsAccuracy || 0)}m` });
  };

  const resetLocation = () => {
    onUpdateState({ gpsLocation: undefined, gpsAccuracy: undefined, gpsConfirmed: false });
  };

  return (
    <div className="space-y-2 p-3 bg-orange-50 dark:bg-orange-900/10 rounded-md border border-orange-200 dark:border-orange-800" data-testid={`gps-panel-${step.id}`}>
      <div className="flex items-center gap-2 text-xs font-medium text-orange-700 dark:text-orange-300">
        <Navigation className="h-4 w-4" />
        <span>GPS Verification</span>
        {state.gpsConfirmed && (
          <Badge variant="outline" className={cn(
            "ml-auto text-[10px] py-0",
            isWithinRadius ? "text-green-600 border-green-300 dark:text-green-400 dark:border-green-700" : "text-red-600 border-red-300 dark:text-red-400 dark:border-red-700"
          )}>
            {isWithinRadius ? "In range" : "Out of range"}
          </Badge>
        )}
        {!state.gpsConfirmed && !state.gpsLocation && !error && (
          <div className="ml-auto flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin text-orange-500" />
            <span className="text-[10px] text-muted-foreground">Finding location...</span>
          </div>
        )}
      </div>

      {state.gpsLocation && (
        <div className="space-y-2">
          <GpsMapView
            userLocation={state.gpsLocation}
            expectedLocation={expectedLocation}
            accuracy={state.gpsAccuracy || 0}
            radiusMeters={radiusMeters}
          />

          <div className="flex items-center gap-2 text-xs">
            {distanceToExpected !== null && (
              <div className="flex items-center gap-1 bg-background/80 rounded-md px-2 py-1 flex-1">
                <span className="text-muted-foreground">Distance from location</span>
                <span className="font-semibold ml-auto">{Math.round(distanceToExpected)}m</span>
              </div>
            )}
            <div className="flex items-center gap-1 bg-background/80 rounded-md px-2 py-1">
              <span className="text-muted-foreground">Accuracy</span>
              <span className="font-semibold">{Math.round(state.gpsAccuracy || 0)}m</span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {state.gpsLocation && !state.gpsConfirmed && (
        <Button
          size="sm"
          onClick={confirmLocation}
          className="w-full text-xs"
          data-testid={`btn-confirm-gps-${step.id}`}
        >
          <MapPin className="h-3.5 w-3.5 mr-1" />
          Confirm Current Location
        </Button>
      )}

      {state.gpsConfirmed && (
        <Button
          size="sm"
          variant="outline"
          onClick={resetLocation}
          className="w-full text-xs"
          data-testid={`btn-reset-gps-${step.id}`}
        >
          <Navigation className="h-3.5 w-3.5 mr-1" />
          Update Location
        </Button>
      )}
    </div>
  );
}

function GpsMapView({ userLocation, expectedLocation, accuracy, radiusMeters }: {
  userLocation: GpsLocation;
  expectedLocation: GpsLocation | null;
  accuracy: number;
  radiusMeters: number;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const expectedMarkerRef = useRef<L.CircleMarker | null>(null);
  const expectedRadiusRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      L.control.attribution({ position: "bottomright", prefix: false })
        .addAttribution('<a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a>')
        .addTo(map);

      mapInstanceRef.current = map;
      setTimeout(() => map.invalidateSize(), 100);
    }

    const map = mapInstanceRef.current;
    const userLatLng = L.latLng(userLocation.latitude, userLocation.longitude);

    if (accuracyCircleRef.current) {
      accuracyCircleRef.current.setLatLng(userLatLng);
      accuracyCircleRef.current.setRadius(accuracy);
    } else {
      accuracyCircleRef.current = L.circle(userLatLng, {
        radius: accuracy,
        color: "#4285f4",
        fillColor: "#4285f4",
        fillOpacity: 0.15,
        weight: 1,
        opacity: 0.4,
      }).addTo(map);
    }

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng(userLatLng);
    } else {
      userMarkerRef.current = L.circleMarker(userLatLng, {
        radius: 8,
        color: "#ffffff",
        fillColor: "#4285f4",
        fillOpacity: 1,
        weight: 3,
      }).addTo(map);
    }

    if (expectedLocation) {
      const expectedLatLng = L.latLng(expectedLocation.latitude, expectedLocation.longitude);

      if (expectedRadiusRef.current) {
        expectedRadiusRef.current.setLatLng(expectedLatLng);
        expectedRadiusRef.current.setRadius(radiusMeters);
      } else {
        expectedRadiusRef.current = L.circle(expectedLatLng, {
          radius: radiusMeters,
          color: "#22c55e",
          fillColor: "#22c55e",
          fillOpacity: 0.08,
          weight: 1.5,
          dashArray: "6 4",
        }).addTo(map);
      }

      if (expectedMarkerRef.current) {
        expectedMarkerRef.current.setLatLng(expectedLatLng);
      } else {
        expectedMarkerRef.current = L.circleMarker(expectedLatLng, {
          radius: 5,
          color: "#22c55e",
          fillColor: "#22c55e",
          fillOpacity: 0.8,
          weight: 2,
        }).addTo(map);
      }

      const bounds = L.latLngBounds([userLatLng, expectedLatLng]);
      bounds.extend(accuracyCircleRef.current!.getBounds());
      bounds.extend(expectedRadiusRef.current!.getBounds());
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 17 });
    } else {
      map.setView(userLatLng, Math.min(17, Math.max(13, 17 - Math.log2(accuracy / 10))));
    }

    return () => {};
  }, [userLocation.latitude, userLocation.longitude, accuracy, expectedLocation, radiusMeters]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={mapRef}
      className="w-full h-[180px] rounded-md overflow-hidden border border-border"
      data-testid="gps-map-view"
    />
  );
}

function CompletedVerificationSummary({ step, gpsLocation, photoUrl, comment }: {
  step: ProcedureStep;
  gpsLocation?: GpsLocation;
  photoUrl?: string;
  comment?: string;
}) {
  const expectedLocation = step.expectedGpsLocation as GpsLocation | null;
  const radiusMeters = step.gpsRadiusMeters || 100;

  const distanceToExpected = gpsLocation && expectedLocation
    ? haversineDistance(gpsLocation.latitude, gpsLocation.longitude, expectedLocation.latitude, expectedLocation.longitude)
    : null;
  const isWithinRadius = distanceToExpected !== null ? distanceToExpected <= radiusMeters : null;

  return (
    <div className="space-y-2" data-testid={`completed-summary-${step.id}`}>
      {gpsLocation && (
        <div className="space-y-2 p-3 bg-green-50 dark:bg-green-900/10 rounded-md border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2 text-xs font-medium text-green-700 dark:text-green-300">
            <MapPin className="h-4 w-4" />
            <span>GPS Verified</span>
            {isWithinRadius !== null && (
              <Badge variant="outline" className={cn(
                "ml-auto text-[10px] py-0",
                isWithinRadius ? "text-green-600 border-green-300 dark:text-green-400 dark:border-green-700" : "text-red-600 border-red-300 dark:text-red-400 dark:border-red-700"
              )}>
                {isWithinRadius ? "In range" : "Out of range"}
              </Badge>
            )}
          </div>
          <GpsMapView
            userLocation={gpsLocation}
            expectedLocation={expectedLocation}
            accuracy={gpsLocation.accuracy || 0}
            radiusMeters={radiusMeters}
          />
          {distanceToExpected !== null && (
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1 bg-background/80 rounded-md px-2 py-1 flex-1">
                <span className="text-muted-foreground">Distance</span>
                <span className="font-semibold ml-auto">{Math.round(distanceToExpected)}m</span>
              </div>
              {gpsLocation.accuracy && (
                <div className="flex items-center gap-1 bg-background/80 rounded-md px-2 py-1">
                  <span className="text-muted-foreground">Accuracy</span>
                  <span className="font-semibold">{Math.round(gpsLocation.accuracy)}m</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {photoUrl && (
        <div className="space-y-2 p-3 bg-green-50 dark:bg-green-900/10 rounded-md border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2 text-xs font-medium text-green-700 dark:text-green-300">
            <Camera className="h-4 w-4" />
            <span>Photo Captured</span>
          </div>
          <img
            src={photoUrl}
            alt="Verification photo"
            className="w-full max-h-48 object-cover rounded-md"
            data-testid={`img-completed-photo-${step.id}`}
          />
        </div>
      )}

      {comment && (
        <div className="space-y-1 p-3 bg-green-50 dark:bg-green-900/10 rounded-md border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2 text-xs font-medium text-green-700 dark:text-green-300">
            <MessageSquare className="h-4 w-4" />
            <span>Comment</span>
          </div>
          <p className="text-xs text-muted-foreground">{comment}</p>
        </div>
      )}
    </div>
  );
}

function PhotoVerificationPanel({ state, onUpdateState, isRequired = true }: {
  state: StepVerificationState;
  onUpdateState: (updates: Partial<StepVerificationState>) => void;
  isRequired?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please select an image under 5MB", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      onUpdateState({ photoUrl: reader.result as string });
    };
    reader.readAsDataURL(file);

    e.target.value = "";
  }, [onUpdateState, toast]);

  return (
    <div className="space-y-2 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-md border border-blue-200 dark:border-blue-800" data-testid="photo-panel">
      <div className="flex items-center gap-2 text-xs font-medium text-blue-700 dark:text-blue-300">
        <Camera className="h-4 w-4" />
        <span>{isRequired ? 'Photo Required' : 'Photo (Optional)'}</span>
        {state.photoUrl && (
          <Badge variant="outline" className="ml-auto text-[10px] py-0 text-green-600 border-green-300 dark:text-green-400 dark:border-green-700">
            Captured
          </Badge>
        )}
      </div>

      {state.photoUrl && (
        <div className="relative">
          <img
            src={state.photoUrl}
            alt="Verification"
            className="w-full max-h-48 object-cover rounded-md"
            data-testid="img-verification-photo"
          />
          <Button
            size="icon"
            variant="destructive"
            className="absolute top-1 right-1 h-6 w-6"
            onClick={() => onUpdateState({ photoUrl: undefined })}
            data-testid="btn-remove-photo"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {!state.photoUrl && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 text-xs"
            data-testid="btn-take-photo"
          >
            <Camera className="h-3.5 w-3.5 mr-1" />
            Take Photo
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 text-xs"
            data-testid="btn-upload-photo"
          >
            <ImagePlus className="h-3.5 w-3.5 mr-1" />
            Upload
          </Button>
        </div>
      )}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
        data-testid="input-camera"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
        data-testid="input-file-upload"
      />
    </div>
  );
}

function StepCommentPanel({ state, onUpdateState }: {
  state: StepVerificationState;
  onUpdateState: (updates: Partial<StepVerificationState>) => void;
}) {
  const { toast } = useToast();
  const [showCommentBox, setShowCommentBox] = useState(!!state.comment || !!state.showComment);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [isTranslatingVoice, setIsTranslatingVoice] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const translateComment = async () => {
    if (!state.comment?.trim()) return;
    setIsTranslating(true);
    try {
      const res = await apiRequest("POST", "/api/translate-to-english", { text: state.comment });
      const data = await res.json();
      onUpdateState({ commentTranslation: data.translation });
    } catch {
      toast({ title: "Translation failed", variant: "destructive" });
    } finally {
      setIsTranslating(false);
    }
  };

  const translateVoiceNote = async () => {
    if (!state.voiceNoteTranscript?.trim()) return;
    setIsTranslatingVoice(true);
    try {
      const res = await apiRequest("POST", "/api/translate-to-english", { text: state.voiceNoteTranscript });
      const data = await res.json();
      onUpdateState({ voiceNoteTranslation: data.translation });
    } catch {
      toast({ title: "Translation failed", variant: "destructive" });
    } finally {
      setIsTranslatingVoice(false);
    }
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 256;
      source.connect(analyserNode);
      setAnalyser(analyserNode);

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setAnalyser(null);
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }

        if (chunksRef.current.length > 0) {
          setIsProcessing(true);
          try {
            const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
            const reader = new FileReader();
            reader.onloadend = async () => {
              const base64Audio = (reader.result as string).split(",")[1];
              try {
                const response = await apiRequest("POST", "/api/transcribe", { audioBase64: base64Audio, mimeType: "audio/webm" });
                const data = await response.json();
                onUpdateState({ voiceNoteTranscript: data.transcript || "" });
              } catch {
                toast({ title: "Transcription failed", description: "Could not transcribe audio.", variant: "destructive" });
              } finally {
                setIsProcessing(false);
              }
            };
            reader.readAsDataURL(audioBlob);
          } catch {
            setIsProcessing(false);
          }
        }
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => setRecordingDuration((prev) => prev + 1), 1000);
    } catch {
      toast({ title: "Microphone access denied", description: "Please allow microphone access.", variant: "destructive" });
    }
  }, [onUpdateState, toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!showCommentBox) {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setShowCommentBox(true)}
        className="text-xs text-muted-foreground w-full justify-start"
        data-testid="btn-add-comment"
      >
        <MessageSquare className="h-3.5 w-3.5 mr-1" />
        Add comment or voice note
      </Button>
    );
  }

  return (
    <div className="space-y-2 p-3 bg-secondary/30 rounded-md border border-border" data-testid="comment-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          <MessageSquare className="h-4 w-4" />
          <span>Comment</span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => {
            setShowCommentBox(false);
            onUpdateState({ showComment: false });
          }}
          data-testid="btn-close-comment"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      <Textarea
        value={state.comment || ""}
        onChange={(e) => onUpdateState({ comment: e.target.value, commentTranslation: undefined })}
        placeholder="Add a comment..."
        className="min-h-[60px] text-sm"
        data-testid="textarea-comment"
      />

      {state.comment?.trim() && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={translateComment}
            disabled={isTranslating}
            className="text-xs"
            data-testid="btn-translate-comment"
          >
            {isTranslating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Languages className="h-3.5 w-3.5 mr-1" />}
            Translate to English
          </Button>
        </div>
      )}

      {state.commentTranslation && (
        <div className="p-2 bg-background rounded-md border text-xs space-y-1" data-testid="text-comment-translation">
          <span className="text-muted-foreground font-medium">English translation:</span>
          <p>{state.commentTranslation}</p>
        </div>
      )}

      <div className="border-t border-border pt-2 space-y-2">
        <div className="flex items-center gap-2">
          {isRecording ? (
            <>
              <Button
                size="sm"
                variant="destructive"
                onClick={stopRecording}
                className="text-xs"
                data-testid="btn-stop-voice"
              >
                <Square className="h-3 w-3 fill-current mr-1" />
                Stop ({formatDuration(recordingDuration)})
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-[10px] text-muted-foreground">Recording...</span>
              </div>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={startRecording}
              disabled={isProcessing}
              className="text-xs"
              data-testid="btn-start-voice"
            >
              {isProcessing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Mic className="h-3.5 w-3.5 mr-1" />}
              {isProcessing ? "Transcribing..." : "Record voice note"}
            </Button>
          )}
        </div>

        {isRecording && analyser && (
          <AudioSynthDisplay analyser={analyser} />
        )}

        {state.voiceNoteTranscript && (
          <div className="space-y-2">
            <div className="p-2 bg-background rounded-md border text-xs" data-testid="text-voice-transcript">
              <span className="text-muted-foreground font-medium">Transcript: </span>
              <span>{state.voiceNoteTranscript}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={translateVoiceNote}
                disabled={isTranslatingVoice}
                className="text-xs"
                data-testid="btn-translate-voice"
              >
                {isTranslatingVoice ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Languages className="h-3.5 w-3.5 mr-1" />}
                Translate to English
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onUpdateState({ voiceNoteTranscript: undefined, voiceNoteTranslation: undefined })}
                className="text-xs"
                data-testid="btn-delete-voice"
              >
                <X className="h-3 w-3 mr-1" />
                Delete & Re-record
              </Button>
            </div>
          </div>
        )}

        {state.voiceNoteTranslation && (
          <div className="p-2 bg-background rounded-md border text-xs space-y-1" data-testid="text-voice-translation">
            <span className="text-muted-foreground font-medium">English translation:</span>
            <p>{state.voiceNoteTranslation}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AudioSynthDisplay({ analyser }: { analyser: AnalyserNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.roundRect(0, 0, width, height, 6);
      ctx.fill();

      const barCount = 40;
      const barWidth = (width - 16) / barCount;
      const gap = 1;

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * bufferLength);
        const value = dataArray[dataIndex] / 255;
        const barHeight = Math.max(2, value * (height - 8));

        const hue = 120 + (value * 120);
        const saturation = 70 + (value * 30);
        const lightness = 40 + (value * 20);
        ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

        const x = 8 + i * barWidth;
        const y = (height - barHeight) / 2;
        ctx.fillRect(x, y, barWidth - gap, barHeight);
      }
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [analyser]);

  return (
    <div className="flex items-center justify-center" data-testid="audio-synth-display">
      <canvas
        ref={canvasRef}
        width={280}
        height={48}
        className="rounded-md w-full"
        style={{ maxWidth: 280 }}
      />
    </div>
  );
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
