import React, { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Sparkles,
  MoreVertical,
  Pencil,
  Trash2,
  GripVertical,
  Image,
  Video,
  Link,
  FileText,
  MapPin,
  Camera,
  Loader2,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Archive,
  Check,
  Mic,
  Building2,
  Type,
  Settings,
  AlertTriangle,
  Languages,
  Square,
  Send,
  X,
  ImagePlus,
  Play,
  Pause,
  Lock,
  Unlock,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Procedure, ProcedureWithSteps, ProcedureStep, ProcedureStepMedia, ProcedureStepIssue, Listing, TaskModule, TaskModuleWithItems } from "@shared/schema";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Package, Layers } from "lucide-react";
import { VoiceRecorder } from "@/components/voice-recorder";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  archived: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

interface StepFormData {
  label: string;
  description: string;
  requiresPhotoVerification: boolean;
  photoVerificationMode: string;
  requiresGpsVerification: boolean;
  media: ProcedureStepMedia[];
}

interface SortableStepProps {
  step: ProcedureStep;
  index: number;
  onEdit: (step: ProcedureStep) => void;
  onDelete: (stepId: string) => void;
  onSettings: (step: ProcedureStep) => void;
  onUpdateStep: (stepId: string, updates: Partial<ProcedureStep>) => void;
  readOnly?: boolean;
}

function StepVoiceRecorder({ 
  onComplete,
  onCancel,
}: { 
  onComplete: (data: { audioBase64: string; transcript: string }) => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (chunksRef.current.length > 0) {
          setIsProcessing(true);
          try {
            const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = async () => {
              const base64 = (reader.result as string).split(',')[1];
              setAudioBase64(base64);
              try {
                const response = await apiRequest("POST", "/api/transcribe", {
                  audioBase64: base64,
                  mimeType: 'audio/webm'
                });
                const data = await response.json();
                setTranscript(data.transcript || "");
              } catch {
                toast({ title: "Transcription failed", description: "Could not transcribe. Please type manually.", variant: "destructive" });
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
      timerRef.current = setInterval(() => setRecordingDuration(prev => prev + 1), 1000);
    } catch {
      toast({ title: "Microphone access denied", description: "Please allow microphone access.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {isRecording ? (
          <Button type="button" variant="destructive" size="sm" onClick={stopRecording} data-testid="button-stop-voice">
            <Square className="h-3 w-3 fill-current mr-1" />
            Stop ({formatDuration(recordingDuration)})
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={startRecording} disabled={isProcessing} data-testid="button-start-voice">
            {isProcessing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Mic className="h-3 w-3 mr-1" />}
            {isProcessing ? "Processing..." : "Record"}
          </Button>
        )}
        {isRecording && (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs text-muted-foreground">Listening...</span>
          </div>
        )}
      </div>
      {(transcript || audioBase64) && !isProcessing && (
        <div className="space-y-2">
          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Transcript will appear here..."
            className="min-h-[60px] text-sm"
            data-testid="textarea-voice-transcript"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} data-testid="button-cancel-voice-step">
              <X className="h-3 w-3 mr-1" /> Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => { if (audioBase64) onComplete({ audioBase64, transcript }); }}
              disabled={!audioBase64}
              data-testid="button-save-voice-step"
            >
              <Send className="h-3 w-3 mr-1" /> Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function IssueReporter({
  step,
  onSaveIssue,
}: {
  step: ProcedureStep;
  onSaveIssue: (issue: ProcedureStepIssue) => void;
}) {
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [voiceData, setVoiceData] = useState<{ audioBase64: string; transcript: string } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotos(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSave = () => {
    if (!description.trim() && !voiceData?.transcript && photos.length === 0) {
      toast({ title: "Please add details", description: "Add a description, voice note, or photo for the issue.", variant: "destructive" });
      return;
    }
    const issue: ProcedureStepIssue = {
      id: crypto.randomUUID(),
      description: description.trim() || undefined,
      voiceNoteUrl: voiceData?.audioBase64 ? `data:audio/webm;base64,${voiceData.audioBase64}` : undefined,
      voiceNoteTranscript: voiceData?.transcript || undefined,
      photos,
      createdAt: new Date().toISOString(),
    };
    onSaveIssue(issue);
  };

  return (
    <div className="space-y-3 p-3 border border-red-200 dark:border-red-900/50 rounded-md bg-red-50/50 dark:bg-red-950/20">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-500" />
        <span className="text-sm font-medium text-red-700 dark:text-red-400">Report Issue</span>
      </div>
      <Textarea
        placeholder="Describe the issue..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="min-h-[60px] text-sm"
        data-testid={`textarea-issue-desc-${step.id}`}
      />
      {showVoiceRecorder ? (
        <StepVoiceRecorder
          onComplete={(data) => { setVoiceData(data); setShowVoiceRecorder(false); }}
          onCancel={() => setShowVoiceRecorder(false)}
        />
      ) : voiceData ? (
        <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
          <Mic className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground flex-1 truncate">{voiceData.transcript || "Voice note recorded"}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setVoiceData(null); setShowVoiceRecorder(true); }}>
            Re-record
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowVoiceRecorder(true)} data-testid={`button-issue-voice-${step.id}`}>
          <Mic className="h-3 w-3 mr-1" /> Voice Note
        </Button>
      )}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {photos.map((photo, i) => (
            <div key={i} className="relative w-16 h-16 rounded-md overflow-hidden border">
              <img src={photo} alt={`Issue photo ${i + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                className="absolute top-0 right-0 bg-black/60 text-white p-0.5 rounded-bl"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-16 h-16 rounded-md border border-dashed flex items-center justify-center text-muted-foreground hover:bg-muted/50 transition-colors"
            data-testid={`button-issue-photo-${step.id}`}
          >
            <ImagePlus className="h-5 w-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handlePhotoUpload}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="destructive" onClick={handleSave} data-testid={`button-save-issue-${step.id}`}>
          <AlertTriangle className="h-3 w-3 mr-1" /> Save Issue
        </Button>
      </div>
    </div>
  );
}

function TextActionButtons({ 
  text, 
  onSummarized, 
  onTranslated,
  summaryLabel,
  translationLabel,
}: { 
  text: string; 
  onSummarized?: (summary: string) => void;
  onTranslated?: (translation: string) => void;
  summaryLabel?: string;
  translationLabel?: string;
}) {
  const { toast } = useToast();
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  const handleSummarize = async () => {
    if (!text.trim()) return;
    setIsSummarizing(true);
    try {
      const res = await apiRequest("POST", "/api/ai-summarize", { text });
      const data = await res.json();
      onSummarized?.(data.summary);
    } catch {
      toast({ title: "Failed to summarize", variant: "destructive" });
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleTranslate = async () => {
    if (!text.trim()) return;
    setIsTranslating(true);
    try {
      const res = await apiRequest("POST", "/api/translate-to-english", { text });
      const data = await res.json();
      onTranslated?.(data.translation);
    } catch {
      toast({ title: "Failed to translate", variant: "destructive" });
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {onSummarized && (
        <Button type="button" variant="ghost" size="sm" onClick={handleSummarize} disabled={isSummarizing || !text.trim()} data-testid="button-ai-summarize">
          {isSummarizing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
          {summaryLabel || "AI Summarize"}
        </Button>
      )}
      {onTranslated && (
        <Button type="button" variant="ghost" size="sm" onClick={handleTranslate} disabled={isTranslating || !text.trim()} data-testid="button-translate">
          {isTranslating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Languages className="h-3 w-3 mr-1" />}
          {translationLabel || "Translate to English"}
        </Button>
      )}
    </div>
  );
}

function SortableStep({ step, index, onEdit, onDelete, onSettings, onUpdateStep, readOnly }: SortableStepProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(step.label);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showIssueReporter, setShowIssueReporter] = useState(false);
  const [editDescription, setEditDescription] = useState(step.description || "");
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasIssues = step.issues && step.issues.length > 0;
  const activeIssues = step.issues?.filter(i => !i.resolvedAt) || [];

  const handleLabelSave = () => {
    if (editLabel.trim() && editLabel !== step.label) {
      onUpdateStep(step.id, { label: editLabel.trim() });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLabelSave();
    } else if (e.key === 'Escape') {
      setEditLabel(step.label);
      setIsEditing(false);
    }
  };

  const handleDescriptionSave = () => {
    if (editDescription !== (step.description || "")) {
      onUpdateStep(step.id, { description: editDescription });
    }
  };

  const handleVoiceComplete = (data: { audioBase64: string; transcript: string }) => {
    onUpdateStep(step.id, {
      voiceNoteUrl: `data:audio/webm;base64,${data.audioBase64}`,
      voiceNoteTranscript: data.transcript,
      voiceNoteAiSummary: null as any,
      voiceNoteTranslation: null as any,
    });
    setShowVoiceRecorder(false);
  };

  const handleSaveIssue = (issue: ProcedureStepIssue) => {
    const existingIssues = step.issues || [];
    onUpdateStep(step.id, { issues: [...existingIssues, issue] as any });
    setShowIssueReporter(false);
    toast({ title: "Issue reported", description: "The issue has been saved to this step." });
  };

  const handleResolveIssue = (issueId: string) => {
    const updatedIssues = (step.issues || []).map(i => 
      i.id === issueId ? { ...i, resolvedAt: new Date().toISOString() } : i
    );
    onUpdateStep(step.id, { issues: updatedIssues as any });
  };

  const toggleAudio = () => {
    if (!step.voiceNoteUrl) return;
    if (isPlayingAudio && audioRef.current) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      if (!audioRef.current) {
        audioRef.current = new Audio(step.voiceNoteUrl);
        audioRef.current.onended = () => setIsPlayingAudio(false);
      }
      audioRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="py-1"
      data-testid={`step-item-${step.id}`}
    >
      <div 
        className="flex items-center gap-3 group cursor-pointer rounded-md hover-elevate px-1 py-0.5 -mx-1"
        onClick={() => {
          if (!isEditing) setIsExpanded(!isExpanded);
        }}
        data-testid={`step-row-${step.id}`}
      >
        <div
          {...(readOnly ? {} : { ...attributes, ...listeners })}
          className={`${readOnly ? 'invisible' : 'cursor-grab active:cursor-grabbing'} opacity-0 group-hover:opacity-100 transition-opacity`}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
          activeIssues.length > 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : 'bg-primary/10'
        }`}>
          {activeIssues.length > 0 ? (
            <AlertTriangle className="h-3 w-3" />
          ) : (
            index + 1
          )}
        </div>
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <Input
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onBlur={handleLabelSave}
              onKeyDown={handleKeyDown}
              className="h-7 text-sm"
              autoFocus
              onClick={(e) => e.stopPropagation()}
              data-testid={`input-step-label-${step.id}`}
            />
          ) : (
            <div className="flex items-center gap-2">
              <p 
                className={`font-medium text-sm ${readOnly ? '' : 'cursor-text hover:text-primary'} transition-colors`}
                onClick={(e) => {
                  if (readOnly) return;
                  e.stopPropagation();
                  setIsEditing(true);
                }}
                data-testid={`text-step-label-${step.id}`}
              >
                {step.label}
              </p>
              {step.voiceNoteUrl && (
                <Mic className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              )}
              {activeIssues.length > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  {activeIssues.length} issue{activeIssues.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground/40 hover:text-muted-foreground"
            onClick={() => setIsExpanded(!isExpanded)}
            title="Expand step details"
            data-testid={`button-expand-step-${step.id}`}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${step.requiresGpsVerification ? 'text-green-600 bg-green-100 dark:bg-green-900/30' : 'text-muted-foreground/40 hover:text-muted-foreground'} ${readOnly ? 'pointer-events-none' : ''}`}
            onClick={() => !readOnly && onUpdateStep(step.id, { requiresGpsVerification: !step.requiresGpsVerification })}
            title={step.requiresGpsVerification ? "GPS verification required" : readOnly ? "GPS verification not required" : "Enable GPS verification"}
            data-testid={`button-step-gps-${step.id}`}
          >
            <MapPin className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${
              (step.photoVerificationMode || (step.requiresPhotoVerification ? 'required' : 'none')) === 'required' 
                ? 'text-blue-600 bg-blue-100 dark:bg-blue-900/30' 
                : (step.photoVerificationMode || 'none') === 'optional'
                  ? 'text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30'
                  : 'text-muted-foreground/40 hover:text-muted-foreground'
            } ${readOnly ? 'pointer-events-none' : ''}`}
            onClick={() => {
              if (readOnly) return;
              const current = step.photoVerificationMode || (step.requiresPhotoVerification ? 'required' : 'none');
              const next = current === 'none' ? 'optional' : current === 'optional' ? 'required' : 'none';
              onUpdateStep(step.id, { photoVerificationMode: next, requiresPhotoVerification: next === 'required' });
            }}
            title={
              (step.photoVerificationMode || (step.requiresPhotoVerification ? 'required' : 'none')) === 'required' 
                ? "Photo required (click to disable)" 
                : (step.photoVerificationMode || 'none') === 'optional'
                  ? "Photo allowed (click to make required)"
                  : readOnly ? "No photo verification" : "Enable optional photo (click)"
            }
            data-testid={`button-step-photo-${step.id}`}
          >
            <Camera className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${step.media && step.media.length > 0 ? 'text-purple-600 bg-purple-100 dark:bg-purple-900/30' : 'text-muted-foreground/40 hover:text-muted-foreground'} ${readOnly ? 'pointer-events-none' : ''}`}
            onClick={() => !readOnly && onSettings(step)}
            title={step.media && step.media.length > 0 ? `${step.media.length} attachment(s)` : readOnly ? "No attachments" : "Add attachments"}
            data-testid={`button-step-files-${step.id}`}
          >
            <FileText className="h-4 w-4" />
          </Button>
          {!readOnly && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onDelete(step.id)}
            title="Delete step"
            data-testid={`button-delete-step-${step.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="ml-[52px] mt-2 space-y-3 pb-2" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              onBlur={handleDescriptionSave}
              placeholder="Add a description for this step..."
              className="min-h-[50px] text-sm"
              data-testid={`textarea-step-desc-${step.id}`}
            />
            {editDescription.trim() && (
              <TextActionButtons
                text={editDescription}
                onSummarized={(summary) => {
                  setEditDescription(summary);
                  onUpdateStep(step.id, { description: summary });
                }}
                onTranslated={(translation) => {
                  setEditDescription(translation);
                  onUpdateStep(step.id, { description: translation });
                }}
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Voice Note</label>
            {step.voiceNoteUrl ? (
              <div className="space-y-2 p-2 bg-muted/30 rounded-md">
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={toggleAudio} data-testid={`button-play-voice-${step.id}`}>
                    {isPlayingAudio ? <Pause className="h-3 w-3 mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                    {isPlayingAudio ? "Pause" : "Play"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowVoiceRecorder(true)}>
                    Re-record
                  </Button>
                </div>
                {step.voiceNoteTranscript && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Transcript:</p>
                    <p className="text-sm">{step.voiceNoteTranscript}</p>
                    <TextActionButtons
                      text={step.voiceNoteTranscript}
                      onSummarized={(summary) => onUpdateStep(step.id, { voiceNoteAiSummary: summary })}
                      onTranslated={(translation) => onUpdateStep(step.id, { voiceNoteTranslation: translation })}
                    />
                  </div>
                )}
                {step.voiceNoteAiSummary && (
                  <div className="p-2 bg-primary/5 rounded border border-primary/10">
                    <p className="text-xs text-muted-foreground font-medium mb-1">AI Summary:</p>
                    <p className="text-sm">{step.voiceNoteAiSummary}</p>
                  </div>
                )}
                {step.voiceNoteTranslation && (
                  <div className="p-2 bg-blue-50/50 dark:bg-blue-950/20 rounded border border-blue-200/30 dark:border-blue-800/30">
                    <p className="text-xs text-muted-foreground font-medium mb-1">English Translation:</p>
                    <p className="text-sm">{step.voiceNoteTranslation}</p>
                  </div>
                )}
              </div>
            ) : showVoiceRecorder ? (
              <StepVoiceRecorder
                onComplete={handleVoiceComplete}
                onCancel={() => setShowVoiceRecorder(false)}
              />
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => setShowVoiceRecorder(true)} data-testid={`button-add-voice-${step.id}`}>
                <Mic className="h-3 w-3 mr-1" /> Add Voice Note
              </Button>
            )}
            {step.voiceNoteUrl && showVoiceRecorder && (
              <StepVoiceRecorder
                onComplete={handleVoiceComplete}
                onCancel={() => setShowVoiceRecorder(false)}
              />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Issues</label>
              {!showIssueReporter && (
                <Button type="button" variant="outline" size="sm" onClick={() => setShowIssueReporter(true)} data-testid={`button-report-issue-${step.id}`}>
                  <AlertTriangle className="h-3 w-3 mr-1" /> Report Issue
                </Button>
              )}
            </div>

            {activeIssues.length > 0 && (
              <div className="space-y-2">
                {activeIssues.map((issue) => (
                  <div key={issue.id} className="p-2 border border-red-200 dark:border-red-900/40 rounded-md bg-red-50/30 dark:bg-red-950/10 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {issue.description && <p className="text-sm">{issue.description}</p>}
                        {issue.voiceNoteTranscript && (
                          <div className="mt-1">
                            <p className="text-xs text-muted-foreground">Voice note: {issue.voiceNoteTranscript}</p>
                            {issue.voiceNoteUrl && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const audio = new Audio(issue.voiceNoteUrl!);
                                  audio.play();
                                }}
                              >
                                <Play className="h-3 w-3 mr-1" /> Play
                              </Button>
                            )}
                          </div>
                        )}
                        {issue.aiSummary && (
                          <p className="text-xs mt-1 p-1.5 bg-primary/5 rounded"><span className="font-medium">AI Summary:</span> {issue.aiSummary}</p>
                        )}
                        {issue.translatedText && (
                          <p className="text-xs mt-1 p-1.5 bg-blue-50/50 dark:bg-blue-950/20 rounded"><span className="font-medium">Translation:</span> {issue.translatedText}</p>
                        )}
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleResolveIssue(issue.id)} data-testid={`button-resolve-issue-${issue.id}`}>
                        <Check className="h-3 w-3 mr-1" /> Resolve
                      </Button>
                    </div>
                    {issue.photos && issue.photos.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {issue.photos.map((photo, i) => (
                          <div key={i} className="w-20 h-20 rounded-md overflow-hidden border">
                            <img src={photo} alt={`Issue photo ${i + 1}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
                    {(issue.voiceNoteTranscript || issue.description) && (
                      <TextActionButtons
                        text={issue.voiceNoteTranscript || issue.description || ""}
                        onSummarized={(summary) => {
                          const updatedIssues = (step.issues || []).map(i => 
                            i.id === issue.id ? { ...i, aiSummary: summary } : i
                          );
                          onUpdateStep(step.id, { issues: updatedIssues as any });
                        }}
                        onTranslated={(translation) => {
                          const updatedIssues = (step.issues || []).map(i => 
                            i.id === issue.id ? { ...i, translatedText: translation } : i
                          );
                          onUpdateStep(step.id, { issues: updatedIssues as any });
                        }}
                      />
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      Reported {new Date(issue.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {showIssueReporter && (
              <IssueReporter
                step={step}
                onSaveIssue={(issue) => {
                  handleSaveIssue(issue);
                  setShowIssueReporter(false);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProceduresPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [selectedProcedure, setSelectedProcedure] = useState<ProcedureWithSteps | null>(null);
  const [editingStep, setEditingStep] = useState<ProcedureStep | null>(null);
  const [stepSettingsSheet, setStepSettingsSheet] = useState<ProcedureStep | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "draft" | "archived">("draft");
  const [addStepFocused, setAddStepFocused] = useState(false);
  const [expandedProcedures, setExpandedProcedures] = useState<Set<string>>(new Set());
  const [expandedProcedureDetails, setExpandedProcedureDetails] = useState<Record<string, ProcedureWithSteps>>({});
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState("");
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());
  const [showModulesPanel, setShowModulesPanel] = useState(false);
  const [inlineAddingProcedureId, setInlineAddingProcedureId] = useState<string | null>(null);
  const [inlineAddStepFocused, setInlineAddStepFocused] = useState(false);
  const [inlineNewStep, setInlineNewStep] = useState<StepFormData>({
    label: "",
    description: "",
    requiresPhotoVerification: false,
    photoVerificationMode: "none",
    requiresGpsVerification: false,
    media: [],
  });

  const [newProcedure, setNewProcedure] = useState({ title: "", description: "", listingId: "" });
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMode, setAiMode] = useState<"text" | "voice">("text");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [newStep, setNewStep] = useState<StepFormData>({
    label: "",
    description: "",
    requiresPhotoVerification: false,
    photoVerificationMode: "none",
    requiresGpsVerification: false,
    media: [],
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Group steps by module for display
  const groupStepsByModule = (steps: ProcedureStep[]) => {
    const groups: { moduleTitle: string | null; moduleOrder: number | null; sourceModuleId: string | null; steps: ProcedureStep[] }[] = [];
    let currentGroup: typeof groups[0] | null = null;
    
    for (const step of steps) {
      const stepModuleTitle = step.moduleTitle || null;
      const stepModuleOrder = step.moduleOrder ?? null;
      
      if (!currentGroup || currentGroup.moduleTitle !== stepModuleTitle || currentGroup.moduleOrder !== stepModuleOrder) {
        currentGroup = {
          moduleTitle: stepModuleTitle,
          moduleOrder: stepModuleOrder,
          sourceModuleId: step.sourceModuleId || null,
          steps: [step],
        };
        groups.push(currentGroup);
      } else {
        currentGroup.steps.push(step);
      }
    }
    
    return groups;
  };

  const toggleModuleCollapse = (moduleKey: string) => {
    setCollapsedModules(prev => {
      const next = new Set(prev);
      if (next.has(moduleKey)) {
        next.delete(moduleKey);
      } else {
        next.add(moduleKey);
      }
      return next;
    });
  };

  const { data: procedures = [], isLoading } = useQuery<Procedure[]>({
    queryKey: ["/api/procedures"],
  });

  const { data: listings = [] } = useQuery<Listing[]>({
    queryKey: ["/api/listings"],
  });

  const { data: recommendedModules = [] } = useQuery<TaskModule[]>({
    queryKey: ["/api/task-modules/recommended"],
  });

  const { data: allModules = [] } = useQuery<TaskModule[]>({
    queryKey: ["/api/task-modules"],
  });

  const addModuleMutation = useMutation({
    mutationFn: async ({ procedureId, moduleId }: { procedureId: string; moduleId: string }) => {
      const res = await apiRequest("POST", `/api/procedures/${procedureId}/add-module/${moduleId}`);
      return res.json();
    },
    onSuccess: (data: ProcedureWithSteps) => {
      queryClient.invalidateQueries({ queryKey: ["/api/procedures"] });
      setSelectedProcedure(data);
      toast({ title: "Module added", description: "Module steps have been added to the procedure." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add module", variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; status?: string; listingId?: string }) => {
      const res = await apiRequest("POST", "/api/procedures", data);
      return res.json();
    },
    onSuccess: async (data: ProcedureWithSteps) => {
      queryClient.invalidateQueries({ queryKey: ["/api/procedures"] });
      setCreateDialogOpen(false);
      setNewProcedure({ title: "", description: "", listingId: "" });
      setExpandedProcedures(prev => { const next = new Set(prev); next.add(data.id); return next; });
      setExpandedProcedureDetails(prev => ({ ...prev, [data.id]: { ...data, steps: data.steps || [] } }));
      setInlineAddingProcedureId(data.id);
      setInlineAddStepFocused(true);
      toast({ title: "Procedure created", description: "Now add steps to your procedure." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create procedure", variant: "destructive" });
    },
  });

  const aiCreateMutation = useMutation({
    mutationFn: async (prompt: string): Promise<ProcedureWithSteps> => {
      const res = await apiRequest("POST", "/api/procedures/generate", { prompt });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/procedures"] });
      setAiDialogOpen(false);
      setAiPrompt("");
      setExpandedProcedures(prev => { const next = new Set(prev); next.add(data.id); return next; });
      setExpandedProcedureDetails(prev => ({ ...prev, [data.id]: data }));
      toast({ 
        title: "Procedure generated", 
        description: `Created "${data.title}" with ${data.steps?.length || 0} steps. Review and activate when ready.` 
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate procedure", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Procedure> }) => {
      const res = await apiRequest("PATCH", `/api/procedures/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/procedures"] });
      toast({ title: "Procedure updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update procedure", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/procedures/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/procedures"] });
      setSelectedProcedure(null);
      toast({ title: "Procedure deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete procedure", variant: "destructive" });
    },
  });

  const addStepMutation = useMutation({
    mutationFn: async ({ procedureId, data }: { procedureId: string; data: StepFormData }) => {
      const res = await apiRequest("POST", `/api/procedures/${procedureId}/steps`, data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      if (selectedProcedure) {
        fetchProcedureDetails(selectedProcedure.id);
      }
      fetchProcedureDetailsForExpand(variables.procedureId);
      resetNewStep();
      resetInlineNewStep();
      toast({ title: "Step added" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add step", variant: "destructive" });
    },
  });

  const updateStepMutation = useMutation({
    mutationFn: async ({ procedureId, stepId, data }: { procedureId: string; stepId: string; data: Partial<StepFormData> }) => {
      const res = await apiRequest("PATCH", `/api/procedures/${procedureId}/steps/${stepId}`, data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      if (selectedProcedure) {
        fetchProcedureDetails(selectedProcedure.id);
      }
      fetchProcedureDetailsForExpand(variables.procedureId);
      setEditingStep(null);
      toast({ title: "Step updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update step", variant: "destructive" });
    },
  });

  const deleteStepMutation = useMutation({
    mutationFn: async ({ procedureId, stepId }: { procedureId: string; stepId: string }) => {
      return apiRequest("DELETE", `/api/procedures/${procedureId}/steps/${stepId}`);
    },
    onSuccess: (_data, variables) => {
      if (selectedProcedure) {
        fetchProcedureDetails(selectedProcedure.id);
      }
      fetchProcedureDetailsForExpand(variables.procedureId);
      toast({ title: "Step deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete step", variant: "destructive" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ procedureId, stepIds }: { procedureId: string; stepIds: string[] }): Promise<ProcedureWithSteps> => {
      const res = await apiRequest("POST", `/api/procedures/${procedureId}/reorder`, { stepIds });
      return res.json();
    },
    onSuccess: (data) => {
      if (selectedProcedure?.id === data.id) {
        setSelectedProcedure(data);
      }
      setExpandedProcedureDetails(prev => ({ ...prev, [data.id]: data }));
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reorder steps", variant: "destructive" });
    },
  });

  const fetchProcedureDetails = async (id: string) => {
    try {
      const res = await apiRequest("GET", `/api/procedures/${id}`);
      const data = await res.json();
      setSelectedProcedure(data);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load procedure details", variant: "destructive" });
    }
  };

  const resetNewStep = () => {
    setNewStep({
      label: "",
      description: "",
      requiresPhotoVerification: false,
      photoVerificationMode: "none",
      requiresGpsVerification: false,
      media: [],
    });
  };

  const resetInlineNewStep = () => {
    setInlineNewStep({
      label: "",
      description: "",
      requiresPhotoVerification: false,
      photoVerificationMode: "none",
      requiresGpsVerification: false,
      media: [],
    });
    setInlineAddStepFocused(false);
  };

  const toggleExpanded = async (id: string) => {
    setExpandedProcedures(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Fetch procedure details when expanding
        if (!expandedProcedureDetails[id]) {
          fetchProcedureDetailsForExpand(id);
        }
      }
      return next;
    });
  };

  const fetchProcedureDetailsForExpand = async (id: string) => {
    try {
      const res = await apiRequest("GET", `/api/procedures/${id}`);
      const data = await res.json();
      setExpandedProcedureDetails(prev => ({ ...prev, [id]: data }));
    } catch (error) {
      console.error("Failed to fetch procedure details:", error);
    }
  };

  const getListingName = (listingId: string | null | undefined) => {
    if (!listingId) return null;
    const listing = listings.find(l => l.id === listingId);
    return listing?.name;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id && selectedProcedure) {
      const oldIndex = selectedProcedure.steps.findIndex(s => s.id === active.id);
      const newIndex = selectedProcedure.steps.findIndex(s => s.id === over.id);
      
      const newSteps = arrayMove(selectedProcedure.steps, oldIndex, newIndex);
      setSelectedProcedure({ ...selectedProcedure, steps: newSteps });
      
      reorderMutation.mutate({
        procedureId: selectedProcedure.id,
        stepIds: newSteps.map(s => s.id),
      });
    }
  };

  const filteredProcedures = procedures.filter(p => p.status === activeTab);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Procedures</h1>
            <p className="text-muted-foreground mt-1">Create step-by-step playbooks for your team</p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={() => setAiDialogOpen(true)}
              data-testid="button-ai-create"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              AI Create
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-procedure">
              <Plus className="h-4 w-4 mr-2" />
              New Procedure
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {selectedProcedure ? (
          /* Procedure Editor View */
          <div className="max-w-3xl mx-auto">
            <Button 
              variant="ghost" 
              onClick={() => setSelectedProcedure(null)} 
              className="mb-4"
              data-testid="button-back-to-list"
            >
              <ChevronUp className="h-4 w-4 mr-1 -rotate-90" />
              Back to Procedures
            </Button>
            
            {(() => {
              const isCreator = user?.id === selectedProcedure.createdByUserId;
              const isLockedForUser = selectedProcedure.isLocked && !isCreator;
              return (
            <Card className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-xl font-semibold">{selectedProcedure.title}</h2>
                    <Badge className={STATUS_COLORS[selectedProcedure.status || "draft"]}>
                      {selectedProcedure.status}
                    </Badge>
                    {selectedProcedure.isLocked && (
                      <Badge variant="outline" className="gap-1">
                        <Lock className="h-3 w-3" />
                        Locked
                      </Badge>
                    )}
                  </div>
                  {selectedProcedure.description && (
                    <p className="text-muted-foreground">{selectedProcedure.description}</p>
                  )}
                  {isLockedForUser && (
                    <p className="text-sm text-muted-foreground mt-1">This procedure is locked. You can add descriptions, voice notes, and report issues, but cannot change steps or settings.</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {isCreator && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        const newLocked = !selectedProcedure.isLocked;
                        updateMutation.mutate({ id: selectedProcedure.id, data: { isLocked: newLocked } });
                        setSelectedProcedure({ ...selectedProcedure, isLocked: newLocked });
                        toast({ title: newLocked ? "Procedure locked" : "Procedure unlocked", description: newLocked ? "Only you can edit this procedure now." : "Others can now edit this procedure." });
                      }}
                      title={selectedProcedure.isLocked ? "Unlock procedure" : "Lock procedure"}
                      data-testid="button-toggle-lock"
                    >
                      {selectedProcedure.isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                    </Button>
                  )}
                  {selectedProcedure.status === "draft" && !isLockedForUser && (
                    <Button
                      onClick={() => {
                        updateMutation.mutate({ id: selectedProcedure.id, data: { status: "active" } });
                        setSelectedProcedure({ ...selectedProcedure, status: "active" });
                      }}
                      disabled={(selectedProcedure.steps?.length || 0) === 0}
                      data-testid="button-activate-procedure"
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Activate
                    </Button>
                  )}
                  {selectedProcedure.status === "active" && !isLockedForUser && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        updateMutation.mutate({ id: selectedProcedure.id, data: { status: "archived" } });
                        setSelectedProcedure({ ...selectedProcedure, status: "archived" });
                      }}
                    >
                      <Archive className="h-4 w-4 mr-2" />
                      Archive
                    </Button>
                  )}
                </div>
              </div>

              <div className="border-t pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium">Steps ({selectedProcedure.steps?.length || 0})</h3>
                  {!isLockedForUser && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowModulesPanel(!showModulesPanel)}
                    data-testid="button-toggle-modules-panel"
                  >
                    <Package className="h-4 w-4 mr-2" />
                    {showModulesPanel ? "Hide Modules" : "Add Module"}
                  </Button>
                  )}
                </div>

                {/* Recommended Modules Panel */}
                {showModulesPanel && (
                  <div className="mb-4 p-4 border rounded-lg bg-muted/30 animate-in fade-in slide-in-from-top-2">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      Available Modules
                    </h4>
                    {allModules.length > 0 ? (
                      <div className="grid gap-2">
                        {allModules.map((module) => (
                          <div
                            key={module.id}
                            className="flex items-center justify-between p-2 border rounded-md bg-background hover-elevate"
                          >
                            <div>
                              <p className="text-sm font-medium">{module.name}</p>
                              {module.description && (
                                <p className="text-xs text-muted-foreground">{module.description}</p>
                              )}
                              {module.category && (
                                <Badge variant="outline" className="mt-1 text-xs">
                                  {module.category}
                                </Badge>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                addModuleMutation.mutate({
                                  procedureId: selectedProcedure.id,
                                  moduleId: module.id,
                                });
                              }}
                              disabled={addModuleMutation.isPending}
                              data-testid={`button-add-module-${module.id}`}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No modules available yet. Create modules in the Modules page to reuse step groups across procedures.
                      </p>
                    )}
                  </div>
                )}

                {selectedProcedure.steps && selectedProcedure.steps.length > 0 ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={selectedProcedure.steps.map(s => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-4">
                        {(() => {
                          const groups = groupStepsByModule(selectedProcedure.steps || []);
                          let globalIndex = 0;
                          return groups.map((group, groupIndex) => {
                            const moduleKey = `${group.moduleTitle || 'ungrouped'}-${group.moduleOrder || 0}`;
                            const isCollapsed = collapsedModules.has(moduleKey);
                            
                            if (group.moduleTitle) {
                              const startIndex = globalIndex;
                              globalIndex += group.steps.length;
                              return (
                                <Collapsible key={moduleKey} open={!isCollapsed} onOpenChange={() => toggleModuleCollapse(moduleKey)}>
                                  <div className="border rounded-lg overflow-hidden">
                                    <CollapsibleTrigger asChild>
                                      <button className="w-full flex items-center justify-between p-3 bg-muted/50 hover-elevate transition-colors">
                                        <div className="flex items-center gap-2">
                                          <Package className="h-4 w-4 text-muted-foreground" />
                                          <span className="font-medium text-sm">{group.moduleTitle}</span>
                                          <Badge variant="secondary" className="text-xs">
                                            {group.steps.length} steps
                                          </Badge>
                                        </div>
                                        {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                                      </button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <div className="p-2 space-y-2">
                                        {group.steps.map((step, idx) => (
                                          <SortableStep
                                            key={step.id}
                                            step={step}
                                            index={startIndex + idx}
                                            onEdit={setEditingStep}
                                            onDelete={(stepId) => deleteStepMutation.mutate({ 
                                              procedureId: selectedProcedure.id, 
                                              stepId 
                                            })}
                                            onSettings={setStepSettingsSheet}
                                            onUpdateStep={(stepId, updates) => updateStepMutation.mutate({
                                              procedureId: selectedProcedure.id,
                                              stepId,
                                              data: updates as Partial<StepFormData>
                                            })}
                                            readOnly={isLockedForUser}
                                          />
                                        ))}
                                      </div>
                                    </CollapsibleContent>
                                  </div>
                                </Collapsible>
                              );
                            } else {
                              const result = group.steps.map((step, idx) => {
                                const currentIndex = globalIndex + idx;
                                return (
                                  <SortableStep
                                    key={step.id}
                                    step={step}
                                    index={currentIndex}
                                    onEdit={setEditingStep}
                                    onDelete={(stepId) => deleteStepMutation.mutate({ 
                                      procedureId: selectedProcedure.id, 
                                      stepId 
                                    })}
                                    onSettings={setStepSettingsSheet}
                                    onUpdateStep={(stepId, updates) => updateStepMutation.mutate({
                                      procedureId: selectedProcedure.id,
                                      stepId,
                                      data: updates as Partial<StepFormData>
                                    })}
                                    readOnly={isLockedForUser}
                                  />
                                );
                              });
                              globalIndex += group.steps.length;
                              return result;
                            }
                          });
                        })()}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    No steps yet. Add your first step below or add a module above.
                  </div>
                )}

                {/* Inline Add Step */}
                {!isLockedForUser && (
                <div className="mt-4 flex items-start gap-2">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground/60 flex-shrink-0 mt-1">
                    <Plus className="h-3 w-3" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Add step..."
                      value={newStep.label}
                      onChange={(e) => setNewStep(prev => ({ ...prev, label: e.target.value }))}
                      onFocus={() => setAddStepFocused(true)}
                      onBlur={(e) => {
                        if (!e.relatedTarget?.closest('[data-step-form]')) {
                          setTimeout(() => {
                            if (!newStep.label.trim()) {
                              setAddStepFocused(false);
                            }
                          }, 150);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newStep.label.trim() && selectedProcedure) {
                          e.preventDefault();
                          addStepMutation.mutate({ 
                            procedureId: selectedProcedure.id, 
                            data: newStep 
                          });
                        }
                        if (e.key === 'Escape') {
                          setAddStepFocused(false);
                          resetNewStep();
                        }
                      }}
                      className="border-0 shadow-none px-0 h-8 focus-visible:ring-0 placeholder:text-muted-foreground/60"
                      data-testid="input-step-label"
                    />
                    {addStepFocused && (
                      <div data-step-form className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
                        <Textarea
                          placeholder="Description (optional)"
                          value={newStep.description}
                          onChange={(e) => setNewStep(prev => ({ ...prev, description: e.target.value }))}
                          className="min-h-[50px] text-sm"
                          data-testid="input-step-description"
                        />
                        <div className="flex items-center justify-between">
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                const current = newStep.photoVerificationMode || 'none';
                                const next = current === 'none' ? 'optional' : current === 'optional' ? 'required' : 'none';
                                setNewStep(prev => ({ ...prev, photoVerificationMode: next, requiresPhotoVerification: next === 'required' }));
                              }}
                              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${
                                newStep.photoVerificationMode === 'required'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' 
                                  : newStep.photoVerificationMode === 'optional'
                                    ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300'
                                    : 'text-muted-foreground hover:bg-muted'
                              }`}
                              data-testid="switch-photo-verification"
                            >
                              <Camera className="h-3 w-3" />
                              {newStep.photoVerificationMode === 'required' ? 'Photo Required' : newStep.photoVerificationMode === 'optional' ? 'Photo Allowed' : 'Photo'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setNewStep(prev => ({ ...prev, requiresGpsVerification: !prev.requiresGpsVerification }))}
                              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${
                                newStep.requiresGpsVerification 
                                  ? 'bg-primary/10 text-primary' 
                                  : 'text-muted-foreground hover:bg-muted'
                              }`}
                              data-testid="switch-gps-verification"
                            >
                              <MapPin className="h-3 w-3" />
                              GPS
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setAddStepFocused(false);
                                resetNewStep();
                              }}
                            >
                              Cancel
                            </Button>
                            <Button 
                              size="sm"
                              onClick={() => selectedProcedure && addStepMutation.mutate({ 
                                procedureId: selectedProcedure.id, 
                                data: newStep 
                              })}
                              disabled={!newStep.label.trim() || addStepMutation.isPending}
                              data-testid="button-submit-step"
                            >
                              {addStepMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                              Add
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                )}
              </div>
            </Card>
              );
            })()}
          </div>
        ) : (
          /* Procedures List View */
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="mb-4">
              <TabsTrigger value="active" data-testid="tab-active">
                Active ({procedures.filter(p => p.status === "active").length})
              </TabsTrigger>
              <TabsTrigger value="draft" data-testid="tab-draft">
                Drafts ({procedures.filter(p => p.status === "draft").length})
              </TabsTrigger>
              <TabsTrigger value="archived" data-testid="tab-archived">
                Archived ({procedures.filter(p => p.status === "archived").length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-0">
              {filteredProcedures.length === 0 ? (
                <Card className="p-8 text-center">
                  <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">No {activeTab} procedures</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {activeTab === "active" 
                      ? "Create a procedure to standardize tasks for your team"
                      : activeTab === "draft"
                      ? "Drafts are procedures still being built"
                      : "Archived procedures are stored here"
                    }
                  </p>
                  {activeTab !== "archived" && (
                    <Button onClick={() => setCreateDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Procedure
                    </Button>
                  )}
                </Card>
              ) : (
              <div className="space-y-3">
                {filteredProcedures.map(procedure => {
                  const isExpanded = expandedProcedures.has(procedure.id);
                  const details = expandedProcedureDetails[procedure.id];
                  const listingName = getListingName((procedure as any).listingId);
                  
                  return (
                    <Card 
                      key={procedure.id} 
                      className="overflow-hidden"
                      data-testid={`card-procedure-${procedure.id}`}
                    >
                      <div 
                        className="p-4 cursor-pointer hover-elevate"
                        onClick={() => toggleExpanded(procedure.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              {editingTitleId === procedure.id ? (
                                <Input
                                  autoFocus
                                  value={editingTitleValue}
                                  onChange={(e) => setEditingTitleValue(e.target.value)}
                                  onBlur={() => {
                                    if (editingTitleValue.trim() && editingTitleValue !== procedure.title) {
                                      updateMutation.mutate({ id: procedure.id, data: { title: editingTitleValue.trim() } });
                                    }
                                    setEditingTitleId(null);
                                  }}
                                  onKeyDown={(e) => {
                                    e.stopPropagation();
                                    if (e.key === 'Enter' && editingTitleValue.trim()) {
                                      if (editingTitleValue !== procedure.title) {
                                        updateMutation.mutate({ id: procedure.id, data: { title: editingTitleValue.trim() } });
                                      }
                                      setEditingTitleId(null);
                                    }
                                    if (e.key === 'Escape') {
                                      setEditingTitleId(null);
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-7 font-medium w-auto max-w-[300px]"
                                  data-testid={`input-procedure-title-${procedure.id}`}
                                />
                              ) : (
                                <h3 
                                  className={`font-medium ${procedure.isLocked && user?.id !== procedure.createdByUserId ? '' : 'cursor-text hover:bg-muted/50'} px-1 -mx-1 rounded transition-colors`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (procedure.isLocked && user?.id !== procedure.createdByUserId) return;
                                    setEditingTitleId(procedure.id);
                                    setEditingTitleValue(procedure.title);
                                  }}
                                  data-testid={`text-procedure-title-${procedure.id}`}
                                >
                                  {procedure.title}
                                </h3>
                              )}
                              <Badge className={STATUS_COLORS[procedure.status || "draft"]}>
                                {procedure.status}
                              </Badge>
                              {procedure.isLocked && (
                                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                              {listingName && (
                                <Badge variant="secondary" className="text-xs">
                                  <Building2 className="h-3 w-3 mr-1" />
                                  {listingName}
                                </Badge>
                              )}
                              {procedure.createdViaAi && (
                                <Badge variant="outline" className="text-xs">
                                  <Sparkles className="h-3 w-3 mr-1" />
                                  AI
                                </Badge>
                              )}
                            </div>
                            {procedure.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {procedure.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isExpanded) {
                                  toggleExpanded(procedure.id);
                                }
                                setInlineAddingProcedureId(procedure.id);
                                setInlineAddStepFocused(true);
                              }}
                              data-testid={`button-edit-procedure-${procedure.id}`}
                            >
                              <Pencil className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" data-testid={`button-procedure-menu-${procedure.id}`}>
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {procedure.status === "draft" && (
                                  <DropdownMenuItem 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateMutation.mutate({ id: procedure.id, data: { status: "active" } });
                                    }}
                                  >
                                    <Check className="h-4 w-4 mr-2" />
                                    Activate
                                  </DropdownMenuItem>
                                )}
                                {procedure.status === "active" && (
                                  <DropdownMenuItem 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateMutation.mutate({ id: procedure.id, data: { status: "archived" } });
                                    }}
                                  >
                                    <Archive className="h-4 w-4 mr-2" />
                                    Archive
                                  </DropdownMenuItem>
                                )}
                                {procedure.status === "archived" && (
                                  <DropdownMenuItem 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateMutation.mutate({ id: procedure.id, data: { status: "active" } });
                                    }}
                                  >
                                    <Check className="h-4 w-4 mr-2" />
                                    Restore
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteMutation.mutate(procedure.id);
                                  }}
                                  className="text-destructive"
                                  data-testid={`button-delete-procedure-${procedure.id}`}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Expanded Steps - Inline Editing */}
                      {isExpanded && (
                        <div className="border-t px-4 py-3 bg-muted/30" onClick={(e) => e.stopPropagation()}>
                          {!details ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {details.steps && details.steps.length > 0 && (
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {details.steps.length} step{details.steps.length !== 1 ? 's' : ''}
                                  </span>
                                </div>
                              )}

                              {details.steps && details.steps.length > 0 ? (
                                <DndContext
                                  sensors={sensors}
                                  collisionDetection={closestCenter}
                                  onDragEnd={(event) => {
                                    const { active, over } = event;
                                    if (over && active.id !== over.id && details) {
                                      const oldIndex = details.steps.findIndex(s => s.id === active.id);
                                      const newIndex = details.steps.findIndex(s => s.id === over.id);
                                      const newStepsArr = arrayMove(details.steps, oldIndex, newIndex);
                                      setExpandedProcedureDetails(prev => ({
                                        ...prev,
                                        [procedure.id]: { ...details, steps: newStepsArr },
                                      }));
                                      reorderMutation.mutate({
                                        procedureId: procedure.id,
                                        stepIds: newStepsArr.map(s => s.id),
                                      });
                                    }
                                  }}
                                >
                                  <SortableContext
                                    items={details.steps.map(s => s.id)}
                                    strategy={verticalListSortingStrategy}
                                  >
                                    <div className="space-y-1">
                                      {details.steps.map((step, index) => (
                                        <SortableStep
                                          key={step.id}
                                          step={step}
                                          index={index}
                                          onEdit={(s) => {
                                            setEditingStep(s);
                                            setInlineAddingProcedureId(procedure.id);
                                          }}
                                          onDelete={(stepId) => deleteStepMutation.mutate({
                                            procedureId: procedure.id,
                                            stepId,
                                          })}
                                          onSettings={(s) => {
                                            setStepSettingsSheet(s);
                                            setInlineAddingProcedureId(procedure.id);
                                          }}
                                          onUpdateStep={(stepId, updates) => updateStepMutation.mutate({
                                            procedureId: procedure.id,
                                            stepId,
                                            data: updates as Partial<StepFormData>,
                                          })}
                                          readOnly={procedure.isLocked && user?.id !== procedure.createdByUserId}
                                        />
                                      ))}
                                    </div>
                                  </SortableContext>
                                </DndContext>
                              ) : (
                                <div className="text-center py-3">
                                  <p className="text-sm text-muted-foreground mb-2">No steps yet</p>
                                </div>
                              )}

                              {/* Inline Add Step */}
                              {!(procedure.isLocked && user?.id !== procedure.createdByUserId) && (
                              <div className="mt-3 flex items-start gap-2 pt-2 border-t border-dashed">
                                <div className="flex items-center justify-center w-5 h-5 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground/60 flex-shrink-0 mt-1">
                                  <Plus className="h-3 w-3" />
                                </div>
                                <div className="flex-1 space-y-2">
                                  <Input
                                    placeholder="Add a step..."
                                    value={inlineAddingProcedureId === procedure.id ? inlineNewStep.label : ""}
                                    onChange={(e) => {
                                      setInlineAddingProcedureId(procedure.id);
                                      setInlineNewStep(prev => ({ ...prev, label: e.target.value }));
                                    }}
                                    onFocus={() => {
                                      setInlineAddingProcedureId(procedure.id);
                                      setInlineAddStepFocused(true);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                      e.stopPropagation();
                                      if (e.key === 'Enter' && inlineNewStep.label.trim()) {
                                        e.preventDefault();
                                        addStepMutation.mutate({
                                          procedureId: procedure.id,
                                          data: inlineNewStep,
                                        });
                                      }
                                      if (e.key === 'Escape') {
                                        resetInlineNewStep();
                                      }
                                    }}
                                    className="border-0 shadow-none px-0 h-7 text-sm focus-visible:ring-0 placeholder:text-muted-foreground/60"
                                    data-testid={`input-inline-step-${procedure.id}`}
                                  />
                                  {inlineAddStepFocused && inlineAddingProcedureId === procedure.id && (
                                    <div data-step-form className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-150" onClick={(e) => e.stopPropagation()}>
                                      <Textarea
                                        placeholder="Description (optional)"
                                        value={inlineNewStep.description}
                                        onChange={(e) => setInlineNewStep(prev => ({ ...prev, description: e.target.value }))}
                                        className="min-h-[40px] text-sm"
                                        data-testid={`input-inline-step-desc-${procedure.id}`}
                                      />
                                      <div className="flex items-center justify-between">
                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const current = inlineNewStep.photoVerificationMode || 'none';
                                              const next = current === 'none' ? 'optional' : current === 'optional' ? 'required' : 'none';
                                              setInlineNewStep(prev => ({ ...prev, photoVerificationMode: next, requiresPhotoVerification: next === 'required' }));
                                            }}
                                            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${
                                              inlineNewStep.photoVerificationMode === 'required'
                                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                                : inlineNewStep.photoVerificationMode === 'optional'
                                                  ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300'
                                                  : 'text-muted-foreground hover:bg-muted'
                                            }`}
                                          >
                                            <Camera className="h-3 w-3" />
                                            {inlineNewStep.photoVerificationMode === 'required' ? 'Photo Required' : inlineNewStep.photoVerificationMode === 'optional' ? 'Photo Allowed' : 'Photo'}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setInlineNewStep(prev => ({ ...prev, requiresGpsVerification: !prev.requiresGpsVerification }))}
                                            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${
                                              inlineNewStep.requiresGpsVerification
                                                ? 'bg-primary/10 text-primary'
                                                : 'text-muted-foreground hover:bg-muted'
                                            }`}
                                          >
                                            <MapPin className="h-3 w-3" />
                                            GPS
                                          </button>
                                        </div>
                                        <div className="flex gap-2">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => resetInlineNewStep()}
                                          >
                                            Cancel
                                          </Button>
                                          <Button
                                            size="sm"
                                            onClick={() => addStepMutation.mutate({
                                              procedureId: procedure.id,
                                              data: inlineNewStep,
                                            })}
                                            disabled={!inlineNewStep.label.trim() || addStepMutation.isPending}
                                            data-testid={`button-inline-add-step-${procedure.id}`}
                                          >
                                            {addStepMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                            Add
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
        )}
      </div>

      {/* Create Procedure Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Procedure</DialogTitle>
            <DialogDescription>
              Create a step-by-step playbook for your team to follow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="e.g., Guest Checkout Inspection"
                value={newProcedure.title}
                onChange={(e) => setNewProcedure(prev => ({ ...prev, title: e.target.value }))}
                data-testid="input-procedure-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="Describe what this procedure accomplishes..."
                value={newProcedure.description}
                onChange={(e) => setNewProcedure(prev => ({ ...prev, description: e.target.value }))}
                data-testid="input-procedure-description"
              />
            </div>
            <div className="space-y-2">
              <Label>Property (optional)</Label>
              <Select
                value={newProcedure.listingId}
                onValueChange={(value) => setNewProcedure(prev => ({ ...prev, listingId: value === "none" ? "" : value }))}
              >
                <SelectTrigger data-testid="select-procedure-listing">
                  <SelectValue placeholder="All properties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All properties</SelectItem>
                  {listings.map(listing => (
                    <SelectItem key={listing.id} value={listing.id}>
                      {listing.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Optionally associate this procedure with a specific property
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => createMutation.mutate({ 
                ...newProcedure, 
                status: "draft",
                listingId: newProcedure.listingId || undefined 
              })}
              disabled={!newProcedure.title.trim() || createMutation.isPending}
              data-testid="button-submit-procedure"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Create Dialog */}
      <Dialog open={aiDialogOpen} onOpenChange={(open) => {
        setAiDialogOpen(open);
        if (!open) {
          setAiMode("text");
          setVoiceTranscript("");
          setAiPrompt("");
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI-Assisted Creation
            </DialogTitle>
            <DialogDescription>
              Describe what you need and AI will generate a procedure with steps.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Mode Toggle */}
            <div className="flex gap-2">
              <Button
                variant={aiMode === "text" ? "default" : "outline"}
                size="sm"
                onClick={() => setAiMode("text")}
                className="flex-1"
                data-testid="button-ai-mode-text"
              >
                <Type className="h-4 w-4 mr-2" />
                Type it
              </Button>
              <Button
                variant={aiMode === "voice" ? "default" : "outline"}
                size="sm"
                onClick={() => setAiMode("voice")}
                className="flex-1"
                data-testid="button-ai-mode-voice"
              >
                <Mic className="h-4 w-4 mr-2" />
                Say it
              </Button>
            </div>

            {aiMode === "text" ? (
              <div className="space-y-2">
                <Label htmlFor="ai-prompt">Describe your procedure</Label>
                <Textarea
                  id="ai-prompt"
                  placeholder="e.g., Create a procedure for inspecting a vacation rental after guest checkout. Include checking all rooms, testing appliances, documenting any damage with photos, and restocking supplies..."
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  rows={5}
                  data-testid="input-ai-prompt"
                />
              </div>
            ) : (
              <div className="space-y-3">
                {!voiceTranscript ? (
                  <div className="border rounded-lg p-4 bg-muted/30">
                    <VoiceRecorder
                      onTranscriptReady={(transcript) => setVoiceTranscript(transcript)}
                      onCancel={() => setAiMode("text")}
                      placeholder="Your voice description will appear here..."
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Your description (edit if needed)</Label>
                    <Textarea
                      value={voiceTranscript}
                      onChange={(e) => setVoiceTranscript(e.target.value)}
                      rows={5}
                      data-testid="textarea-voice-transcript"
                    />
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setVoiceTranscript("")}
                    >
                      <Mic className="h-4 w-4 mr-1" />
                      Record again
                    </Button>
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Tip: Be specific about what steps are needed, any verification requirements, and what the final outcome should be.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => aiCreateMutation.mutate(aiMode === "text" ? aiPrompt : voiceTranscript)}
              disabled={
                (aiMode === "text" ? !aiPrompt.trim() : !voiceTranscript.trim()) || 
                aiCreateMutation.isPending
              }
              data-testid="button-submit-ai-prompt"
            >
              {aiCreateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Procedure
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Step Dialog */}
      <Dialog open={!!editingStep} onOpenChange={(open) => !open && setEditingStep(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Step</DialogTitle>
          </DialogHeader>
          {editingStep && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-step-label">Step Label</Label>
                <Input
                  id="edit-step-label"
                  value={editingStep.label}
                  onChange={(e) => setEditingStep({ ...editingStep, label: e.target.value })}
                  data-testid="input-edit-step-label"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-step-description">Description</Label>
                <Textarea
                  id="edit-step-description"
                  value={editingStep.description || ""}
                  onChange={(e) => setEditingStep({ ...editingStep, description: e.target.value })}
                  data-testid="input-edit-step-description"
                />
              </div>
              <div className="space-y-3">
                <Label>Verification Requirements</Label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Photo verification</span>
                  </div>
                  <div className="flex gap-1">
                    {(['none', 'optional', 'required'] as const).map((mode) => (
                      <Button
                        key={mode}
                        type="button"
                        size="sm"
                        variant={
                          (editingStep.photoVerificationMode || (editingStep.requiresPhotoVerification ? 'required' : 'none')) === mode ? 'default' : 'outline'
                        }
                        className={
                          (editingStep.photoVerificationMode || (editingStep.requiresPhotoVerification ? 'required' : 'none')) === mode
                            ? mode === 'required' ? 'bg-blue-600 text-white' : mode === 'optional' ? 'bg-cyan-600 text-white' : ''
                            : ''
                        }
                        onClick={() => setEditingStep({ ...editingStep, photoVerificationMode: mode, requiresPhotoVerification: mode === 'required' })}
                      >
                        {mode === 'none' ? 'Off' : mode === 'optional' ? 'Allowed' : 'Required'}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Require GPS verification</span>
                  </div>
                  <Switch
                    checked={editingStep.requiresGpsVerification}
                    onCheckedChange={(checked) => setEditingStep({ ...editingStep, requiresGpsVerification: checked })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingStep(null)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                const procId = selectedProcedure?.id || inlineAddingProcedureId;
                if (procId && editingStep) {
                  updateStepMutation.mutate({
                    procedureId: procId,
                    stepId: editingStep.id,
                    data: {
                      label: editingStep.label,
                      description: editingStep.description || undefined,
                      requiresPhotoVerification: editingStep.requiresPhotoVerification,
                      photoVerificationMode: editingStep.photoVerificationMode || (editingStep.requiresPhotoVerification ? 'required' : 'none'),
                      requiresGpsVerification: editingStep.requiresGpsVerification,
                    },
                  });
                }
              }}
              disabled={updateStepMutation.isPending}
              data-testid="button-save-step"
            >
              {updateStepMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step Settings Sheet */}
      <Sheet open={!!stepSettingsSheet} onOpenChange={(open) => !open && setStepSettingsSheet(null)}>
        <SheetContent className="sm:max-w-[400px]">
          <SheetHeader>
            <SheetTitle>Step Settings</SheetTitle>
            <SheetDescription>
              Configure verification requirements for this step
            </SheetDescription>
          </SheetHeader>
          {stepSettingsSheet && (
            <div className="space-y-6 py-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Step Name</Label>
                <p className="text-sm text-muted-foreground">{stepSettingsSheet.label}</p>
              </div>

              <div className="space-y-4">
                <Label className="text-sm font-medium">Verification Requirements</Label>
                
                <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-background rounded-md">
                      <Camera className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Photo Verification</p>
                      <p className="text-xs text-muted-foreground">Choose whether photos are off, allowed, or required</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {(['none', 'optional', 'required'] as const).map((mode) => {
                      const currentMode = stepSettingsSheet.photoVerificationMode || (stepSettingsSheet.requiresPhotoVerification ? 'required' : 'none');
                      return (
                        <Button
                          key={mode}
                          type="button"
                          size="sm"
                          variant={currentMode === mode ? 'default' : 'outline'}
                          className={
                            currentMode === mode
                              ? mode === 'required' ? 'bg-blue-600 text-white' : mode === 'optional' ? 'bg-cyan-600 text-white' : ''
                              : ''
                          }
                          onClick={() => {
                            const procId = selectedProcedure?.id || inlineAddingProcedureId;
                            if (procId) {
                              updateStepMutation.mutate({
                                procedureId: procId,
                                stepId: stepSettingsSheet.id,
                                data: { photoVerificationMode: mode, requiresPhotoVerification: mode === 'required' },
                              });
                              setStepSettingsSheet({ ...stepSettingsSheet, photoVerificationMode: mode, requiresPhotoVerification: mode === 'required' });
                            }
                          }}
                          data-testid={`button-step-photo-${mode}`}
                        >
                          {mode === 'none' ? 'Off' : mode === 'optional' ? 'Allowed' : 'Required'}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-background rounded-md">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">GPS Verification</p>
                      <p className="text-xs text-muted-foreground">Verify location when completing</p>
                    </div>
                  </div>
                  <Switch
                    checked={stepSettingsSheet.requiresGpsVerification}
                    onCheckedChange={(checked) => {
                      const procId = selectedProcedure?.id || inlineAddingProcedureId;
                      if (procId) {
                        updateStepMutation.mutate({
                          procedureId: procId,
                          stepId: stepSettingsSheet.id,
                          data: { requiresGpsVerification: checked },
                        });
                        setStepSettingsSheet({ ...stepSettingsSheet, requiresGpsVerification: checked });
                      }
                    }}
                    data-testid="switch-step-gps-verification"
                  />
                </div>
              </div>

              <div className="pt-4 border-t">
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setStepSettingsSheet(null)}
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
