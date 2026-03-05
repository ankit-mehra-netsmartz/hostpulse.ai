import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Clock, Building2, User, MoreVertical, Pencil, CalendarIcon, Loader2, Trash2, Sparkles, ClipboardList, X, CheckCircle2, Circle, ChevronDown, Mic, Paperclip, FileText, Link2, Image, ExternalLink, FolderIcon, Check } from "lucide-react";
import { TagDetailSheet } from "@/components/tag-detail-sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Task, Listing, Theme, Tag, Procedure, ProcedureWithSteps, ProcedureStep, TaskAttachment, FolderItem, Folder } from "@shared/schema";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { VoiceRecorder } from "@/components/voice-recorder";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type TaskStatus = "pending" | "in_progress" | "done" | "discarded" | "suggested";

const STATUS_COLUMNS: { id: TaskStatus; label: string; icon: string }[] = [
  { id: "pending", label: "Pending", icon: "clock" },
  { id: "in_progress", label: "In-Progress", icon: "loader" },
  { id: "done", label: "Done", icon: "check" },
  { id: "discarded", label: "Discarded", icon: "x" },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

interface TaskCardProps {
  task: Task;
  listing?: Listing;
  onClick: () => void;
}

function TaskCard({ task, listing, onClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="p-3 cursor-grab active:cursor-grabbing hover-elevate"
      onClick={onClick}
      data-testid={`task-card-${task.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <Badge className={PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium}>
          {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
        </Badge>
        <Button variant="ghost" size="icon" data-testid={`button-task-menu-${task.id}`} onClick={(e) => e.stopPropagation()}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </div>
      <h4 className="font-medium text-sm mb-2 line-clamp-2" data-testid={`text-task-title-${task.id}`}>
        {task.title}
      </h4>
      {task.dueDate && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
          <CalendarIcon className="h-3 w-3" />
          <span>{format(new Date(task.dueDate), "MM/dd/yy")}</span>
        </div>
      )}
      {listing && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
          <Building2 className="h-3 w-3" />
          <span className="truncate">{listing.name}</span>
        </div>
      )}
      {task.assigneeName && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <User className="h-3 w-3" />
          <span>{task.assigneeName}</span>
        </div>
      )}
    </Card>
  );
}

interface DroppableColumnProps {
  status: TaskStatus;
  label: string;
  tasks: Task[];
  listings: Listing[];
  onTaskClick: (task: Task) => void;
}

function DroppableColumn({ status, label, tasks, listings, onTaskClick }: DroppableColumnProps) {
  const listingsMap = new Map(listings.map(l => [l.id, l]));
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[250px] w-[250px] rounded-lg p-3 transition-colors ${
        isOver ? "bg-primary/10 ring-2 ring-primary/30" : "bg-muted/30"
      }`}
      data-testid={`column-${status}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-medium text-sm" data-testid={`text-column-title-${status}`}>{label}</h3>
        <Badge variant="secondary" className="ml-auto">
          {tasks.length}
        </Badge>
      </div>
      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 flex-1 min-h-[200px]">
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              listing={task.listingId ? listingsMap.get(task.listingId) : undefined}
              onClick={() => onTaskClick(task)}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

interface TaskEditSheetProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listings: Listing[];
  themes: Theme[];
  tags: Tag[];
}

function TaskEditSheet({ task, open, onOpenChange, listings, themes, tags }: TaskEditSheetProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [listingId, setListingId] = useState("");
  const [themeId, setThemeId] = useState("");
  const [tagId, setTagId] = useState("");
  const [status, setStatus] = useState("pending");
  const [priority, setPriority] = useState("medium");
  const [assigneeType, setAssigneeType] = useState("member");
  const [assigneeName, setAssigneeName] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [procedureExpanded, setProcedureExpanded] = useState(false);
  const [voiceNoteStepId, setVoiceNoteStepId] = useState<string | null>(null);
  const [summaryStage, setSummaryStage] = useState<'idle' | 'recording' | 'processing' | 'review'>('idle');
  const [voiceSummaryTranscript, setVoiceSummaryTranscript] = useState("");
  const [aiSummary, setAiSummary] = useState("");

  // Fetch available procedures
  const { data: procedures = [] } = useQuery<Procedure[]>({
    queryKey: ["/api/procedures"],
    enabled: open,
  });

  // Fetch current procedure assignment for this task
  const { data: procedureAssignment, refetch: refetchProcedure } = useQuery<{ assignment: any; procedure: ProcedureWithSteps } | null>({
    queryKey: ["/api/tasks", task?.id, "procedure"],
    enabled: open && !!task?.id,
  });

  // Fetch procedure completion progress
  const { data: completionData, refetch: refetchCompletion } = useQuery<{ completion: any; stepCompletions: any[] } | null>({
    queryKey: ["/api/tasks", task?.id, "procedure", "completion"],
    enabled: open && !!task?.id && !!procedureAssignment?.procedure,
  });

  // Fetch task attachments
  const { data: attachments = [], refetch: refetchAttachments } = useQuery<(TaskAttachment & { folderItem: FolderItem & { folder: Folder } })[]>({
    queryKey: ["/api/tasks", task?.id, "attachments"],
    enabled: open && !!task?.id,
  });

  // Fetch available folder items
  const { data: folderItems = [] } = useQuery<(FolderItem & { folder: Folder })[]>({
    queryKey: ["/api/folder-items"],
    enabled: open && !!task?.id,
  });

  const [showAttachmentPicker, setShowAttachmentPicker] = useState(false);

  const attachItemMutation = useMutation({
    mutationFn: async (folderItemId: string) => {
      return apiRequest("POST", `/api/tasks/${task?.id}/attachments`, { folderItemId });
    },
    onSuccess: () => {
      refetchAttachments();
      setShowAttachmentPicker(false);
      toast({ title: "Attached", description: "Item attached to task." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to attach item.", variant: "destructive" });
    },
  });

  const detachItemMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      return apiRequest("DELETE", `/api/task-attachments/${attachmentId}`);
    },
    onSuccess: () => {
      refetchAttachments();
      toast({ title: "Removed", description: "Attachment removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove attachment.", variant: "destructive" });
    },
  });

  const updateStepCompletionMutation = useMutation({
    mutationFn: async ({ stepId, isCompleted, notes, verificationPhotoUrl, gpsLatitude, gpsLongitude }: { 
      stepId: string; 
      isCompleted: boolean;
      notes?: string;
      verificationPhotoUrl?: string;
      gpsLatitude?: number;
      gpsLongitude?: number;
    }) => {
      const completionId = completionData?.completion?.id;
      if (!completionId) throw new Error("No completion record");
      const res = await apiRequest("PATCH", `/api/procedure-completions/${completionId}/steps/${stepId}`, { 
        isCompleted,
        notes,
        verificationPhotoUrl,
        gpsLatitude,
        gpsLongitude,
      });
      return res.json();
    },
    onSuccess: () => {
      refetchCompletion();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update step completion.", variant: "destructive" });
    },
  });

  const getStepCompletion = (stepId: string) => {
    return completionData?.stepCompletions?.find((sc: any) => sc.procedureStepId === stepId);
  };

  const completedStepsCount = completionData?.stepCompletions?.filter((sc: any) => sc.isCompleted).length || 0;
  const totalStepsCount = procedureAssignment?.procedure?.steps?.length || 0;
  const completionProgress = totalStepsCount > 0 ? (completedStepsCount / totalStepsCount) * 100 : 0;

  const handleVoiceNoteReady = (stepId: string, notes: string) => {
    updateStepCompletionMutation.mutate({ 
      stepId, 
      isCompleted: true,
      notes 
    });
    setVoiceNoteStepId(null);
  };

  const handleVoiceSummaryTranscript = async (transcript: string) => {
    setVoiceSummaryTranscript(transcript);
    setSummaryStage('processing');
    
    try {
      const completionId = completionData?.completion?.id;
      if (!completionId) throw new Error("No completion record");
      
      const response = await apiRequest("POST", `/api/procedure-completions/${completionId}/generate-summary`, { transcript });
      const data = await response.json();
      setAiSummary(data.summary || transcript);
      setSummaryStage('review');
    } catch (error) {
      console.error("Failed to generate summary:", error);
      setAiSummary(transcript);
      setSummaryStage('review');
      toast({ title: "Note", description: "Could not generate AI summary. Using transcript as-is.", variant: "default" });
    }
  };

  const saveSummaryMutation = useMutation({
    mutationFn: async (summary: string) => {
      const completionId = completionData?.completion?.id;
      if (!completionId) throw new Error("No completion record");
      return apiRequest("PATCH", `/api/procedure-completions/${completionId}`, { 
        aiSummary: summary,
        aiSummaryStatus: "saved",
        voiceUpdateTranscript: voiceSummaryTranscript,
      });
    },
    onSuccess: () => {
      refetchCompletion();
      setSummaryStage('idle');
      setVoiceSummaryTranscript("");
      setAiSummary("");
      toast({ title: "Summary saved", description: "Your voice update summary has been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save summary.", variant: "destructive" });
    },
  });

  const assignProcedureMutation = useMutation({
    mutationFn: async (procedureId: string) => {
      return apiRequest("POST", `/api/tasks/${task?.id}/procedure`, { procedureId });
    },
    onSuccess: () => {
      refetchProcedure();
      toast({ title: "Procedure assigned", description: "The procedure has been assigned to this task." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to assign procedure.", variant: "destructive" });
    },
  });

  const removeProcedureMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/tasks/${task?.id}/procedure`);
    },
    onSuccess: () => {
      refetchProcedure();
      toast({ title: "Procedure removed", description: "The procedure has been removed from this task." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove procedure.", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (task) {
      setTitle(task.title || "");
      setDescription(task.description || "");
      setListingId(task.listingId || "");
      setThemeId(task.themeId || "");
      setTagId(task.tagId || "");
      setStatus(task.status || "pending");
      setPriority(task.priority || "medium");
      setAssigneeType(task.assigneeType || "member");
      setAssigneeName(task.assigneeName || "");
      setDueDate(task.dueDate ? new Date(task.dueDate) : undefined);
      setIsEditingTitle(false);
      setProcedureExpanded(false);
    }
  }, [task]);

  const activeProcedures = procedures.filter(p => p.status === "active");

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Task>) => {
      return apiRequest("PATCH", `/api/tasks/${task?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task updated", description: "Your changes have been saved." });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update task.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/tasks/${task?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task deleted", description: "The task has been removed." });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete task.", variant: "destructive" });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      title,
      description,
      themeId: themeId && themeId !== "none" ? themeId : null,
      tagId: tagId && tagId !== "none" ? tagId : null,
      status,
      priority,
      assigneeType,
      assigneeName: assigneeName || null,
      dueDate: dueDate || null,
    });
  };

  const selectedListing = listings.find(l => l.id === (task?.listingId || listingId));
  const selectedTheme = themes.find(t => t.id === themeId);
  const selectedTag = tags.find(t => t.id === tagId);

  if (!task) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto" data-testid="sheet-task-edit">
        <SheetHeader className="mb-6">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Edit Task</span>
          </div>
          <div className="flex items-center gap-2">
            {isEditingTitle ? (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => e.key === "Enter" && setIsEditingTitle(false)}
                autoFocus
                className="text-xl font-semibold"
                data-testid="input-task-title"
              />
            ) : (
              <>
                <SheetTitle className="text-xl" data-testid="text-task-title">{title}</SheetTitle>
                <Button variant="ghost" size="icon" onClick={() => setIsEditingTitle(true)} data-testid="button-edit-title">
                  <Pencil className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </SheetHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm text-muted-foreground">Property</Label>
            <div className="mt-1 p-3 bg-muted/50 rounded-md text-sm" data-testid="text-task-property">
              {selectedListing?.name || "No property linked"}
            </div>
          </div>

          <div>
            <Label className="text-sm text-muted-foreground">Theme</Label>
            <Select value={themeId} onValueChange={setThemeId}>
              <SelectTrigger className="mt-1" data-testid="select-task-theme">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {themes.map(theme => (
                  <SelectItem key={theme.id} value={theme.id}>{theme.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground">Tag</Label>
              {selectedTag && (
                <Button variant="ghost" className="h-auto p-0 text-xs text-primary" data-testid="link-view-tag-details">
                  View Details
                </Button>
              )}
            </div>
            <Select value={tagId} onValueChange={setTagId}>
              <SelectTrigger className="mt-1" data-testid="select-task-tag">
                <SelectValue placeholder="Select tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {tags.map(tag => (
                  <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1" data-testid="select-task-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="discarded">Discarded</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm text-muted-foreground">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 250))}
              className="mt-1 min-h-[80px]"
              placeholder="Add a description..."
              data-testid="textarea-task-description"
            />
            <div className="text-xs text-muted-foreground text-right mt-1">
              {description.length}/250
            </div>
          </div>

          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">Procedure</Label>
            {procedureAssignment?.procedure ? (
              <div className="border rounded-lg overflow-hidden">
                <Collapsible open={procedureExpanded} onOpenChange={setProcedureExpanded}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-3 bg-muted/30 cursor-pointer hover-elevate" data-testid="procedure-header">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-primary" />
                        <span className="font-medium">{procedureAssignment.procedure.title}</span>
                        <Badge variant="secondary" className="text-xs">
                          {procedureAssignment.procedure.steps?.length || 0} steps
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeProcedureMutation.mutate();
                          }}
                          disabled={removeProcedureMutation.isPending}
                          data-testid="button-remove-procedure"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                        <ChevronDown className={`h-4 w-4 transition-transform ${procedureExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-3 space-y-3 border-t">
                      {procedureAssignment.procedure.description && (
                        <p className="text-sm text-muted-foreground mb-3">{procedureAssignment.procedure.description}</p>
                      )}
                      
                      {completionData && (
                        <div className="mb-4">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span>Progress</span>
                            <span>{completedStepsCount} of {totalStepsCount} steps</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary transition-all duration-300" 
                              style={{ width: `${completionProgress}%` }}
                            />
                          </div>
                        </div>
                      )}
                      
                      {procedureAssignment.procedure.steps?.map((step: ProcedureStep, index: number) => {
                        const stepCompletion = getStepCompletion(step.id);
                        const isCompleted = stepCompletion?.isCompleted || false;
                        
                        return (
                          <div 
                            key={step.id} 
                            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${isCompleted ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' : 'bg-muted/30'}`}
                            data-testid={`procedure-step-${step.id}`}
                          >
                            <button
                              type="button"
                              onClick={() => updateStepCompletionMutation.mutate({ 
                                stepId: step.id, 
                                isCompleted: !isCompleted 
                              })}
                              disabled={updateStepCompletionMutation.isPending}
                              className="flex-shrink-0 mt-0.5 group/check"
                              title={isCompleted ? "Click to mark incomplete" : "Click to mark complete"}
                              data-testid={`button-toggle-step-${step.id}`}
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 group-hover/check:text-green-500" />
                              ) : (
                                <div className="relative">
                                  <Circle className="h-5 w-5 text-muted-foreground group-hover/check:text-primary transition-colors" />
                                  <Check className="h-3 w-3 absolute top-1 left-1 text-muted-foreground/0 group-hover/check:text-primary/70 transition-colors" />
                                </div>
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium text-sm ${isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                                  {index + 1}. {step.label}
                                </span>
                              </div>
                              {step.description && (
                                <p className="text-muted-foreground text-xs mt-1">{step.description}</p>
                              )}
                              <div className="flex flex-wrap gap-2 mt-2">
                                {step.requiresPhotoVerification && (
                                  <Badge variant={stepCompletion?.verificationPhotoUrl ? "default" : "outline"} className="text-xs">
                                    {stepCompletion?.verificationPhotoUrl ? "Photo verified" : "Photo required"}
                                  </Badge>
                                )}
                                {step.requiresGpsVerification && (
                                  <Badge variant={stepCompletion?.gpsLatitude ? "default" : "outline"} className="text-xs">
                                    {stepCompletion?.gpsLatitude ? "Location verified" : "GPS required"}
                                  </Badge>
                                )}
                              </div>
                              
                              {stepCompletion?.notes && (
                                <p className="text-xs text-muted-foreground mt-2 italic">
                                  Note: {stepCompletion.notes}
                                </p>
                              )}
                              
                              {voiceNoteStepId === step.id ? (
                                <div className="mt-3 border-t pt-3">
                                  <VoiceRecorder
                                    onTranscriptReady={(notes) => handleVoiceNoteReady(step.id, notes)}
                                    onCancel={() => setVoiceNoteStepId(null)}
                                    placeholder="Your voice note will appear here for review..."
                                  />
                                </div>
                              ) : !stepCompletion?.notes && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="mt-2 h-7 text-xs"
                                  onClick={() => setVoiceNoteStepId(step.id)}
                                  data-testid={`button-add-voice-note-${step.id}`}
                                >
                                  <Mic className="h-3 w-3 mr-1" />
                                  Add voice note
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      
                      {completionProgress === 100 && (
                        <div className="mt-4 p-4 border rounded-lg bg-green-50 dark:bg-green-950/30">
                          <div className="flex items-center gap-2 mb-3">
                            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                            <span className="font-medium text-green-700 dark:text-green-300">All steps completed!</span>
                          </div>
                          
                          {completionData?.completion?.aiSummary ? (
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">Voice Summary</Label>
                              <p className="text-sm bg-background/80 p-3 rounded border">
                                {completionData.completion.aiSummary}
                              </p>
                              {completionData.completion.voiceUpdateTranscript && (
                                <details className="text-xs text-muted-foreground">
                                  <summary className="cursor-pointer">Show original transcript</summary>
                                  <p className="mt-1 p-2 bg-muted rounded">{completionData.completion.voiceUpdateTranscript}</p>
                                </details>
                              )}
                            </div>
                          ) : summaryStage === 'recording' ? (
                            <VoiceRecorder
                              onTranscriptReady={handleVoiceSummaryTranscript}
                              onCancel={() => setSummaryStage('idle')}
                              placeholder="Record a summary of your work on this procedure..."
                            />
                          ) : summaryStage === 'processing' ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Generating AI-enhanced summary...
                            </div>
                          ) : summaryStage === 'review' ? (
                            <div className="space-y-3">
                              <div>
                                <Label className="text-xs text-muted-foreground mb-1 block">Original Transcript</Label>
                                <p className="text-sm bg-muted/50 p-2 rounded border text-muted-foreground italic">
                                  {voiceSummaryTranscript}
                                </p>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground mb-1 block">AI-Enhanced Summary (edit if needed)</Label>
                                <Textarea
                                  value={aiSummary}
                                  onChange={(e) => setAiSummary(e.target.value)}
                                  className="min-h-[100px]"
                                  data-testid="textarea-ai-summary"
                                />
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSummaryStage('idle');
                                    setAiSummary("");
                                    setVoiceSummaryTranscript("");
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => saveSummaryMutation.mutate(aiSummary)}
                                  disabled={saveSummaryMutation.isPending}
                                  data-testid="button-save-summary"
                                >
                                  {saveSummaryMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                                  Save Summary
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSummaryStage('recording')}
                              className="gap-2"
                              data-testid="button-add-voice-summary"
                            >
                              <Mic className="h-4 w-4" />
                              Add voice summary
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ) : (
              <Select 
                onValueChange={(procedureId) => assignProcedureMutation.mutate(procedureId)}
                disabled={assignProcedureMutation.isPending}
              >
                <SelectTrigger className="w-full" data-testid="select-task-procedure">
                  <SelectValue placeholder="Assign a procedure..." />
                </SelectTrigger>
                <SelectContent>
                  {activeProcedures.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      No active procedures available
                    </div>
                  ) : (
                    activeProcedures.map(procedure => (
                      <SelectItem key={procedure.id} value={procedure.id}>
                        <div className="flex items-center gap-2">
                          <ClipboardList className="h-4 w-4" />
                          <span>{procedure.title}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">Assignment</Label>
            <RadioGroup value={assigneeType} onValueChange={setAssigneeType} className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="team" id="team" data-testid="radio-team" />
                <Label htmlFor="team" className="text-sm">Team</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="member" id="member" data-testid="radio-member" />
                <Label htmlFor="member" className="text-sm">Member</Label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label className="text-sm text-muted-foreground">Assign to</Label>
            <Input
              value={assigneeName}
              onChange={(e) => setAssigneeName(e.target.value)}
              className="mt-1"
              placeholder="Enter name..."
              data-testid="input-task-assignee"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-muted-foreground">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="mt-1" data-testid="select-task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Due date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full mt-1 justify-start" data-testid="button-due-date">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "MMM do, yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">Attachments</Label>
            <div className="space-y-2">
              {attachments.length > 0 ? (
                <div className="space-y-2">
                  {attachments.map((attachment) => {
                    const item = attachment.folderItem;
                    const isImage = item.type === 'file' && item.fileType?.startsWith('image/');
                    const isPdf = item.type === 'file' && item.fileType === 'application/pdf';
                    const isLink = item.type === 'link';
                    const itemUrl = item.type === 'file' ? item.fileUrl : item.linkUrl;
                    
                    return (
                      <div 
                        key={attachment.id}
                        className="flex items-center gap-2 p-2 border rounded-lg bg-muted/30"
                        data-testid={`attachment-${attachment.id}`}
                      >
                        <div className="flex-shrink-0">
                          {isImage && <Image className="h-4 w-4 text-blue-500" />}
                          {isPdf && <FileText className="h-4 w-4 text-red-500" />}
                          {isLink && <Link2 className="h-4 w-4 text-green-500" />}
                          {!isImage && !isPdf && !isLink && <FileText className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.folder?.name || 'Unknown folder'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {itemUrl && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => window.open(itemUrl, '_blank')}
                              data-testid={`button-open-attachment-${attachment.id}`}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => detachItemMutation.mutate(attachment.id)}
                            disabled={detachItemMutation.isPending}
                            data-testid={`button-remove-attachment-${attachment.id}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No attachments</p>
              )}
              
              {showAttachmentPicker ? (
                <div className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Select item to attach</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={() => setShowAttachmentPicker(false)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {folderItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No folder items available. Create items in Assets first.</p>
                    ) : (
                      folderItems
                        .filter(fi => !attachments.some(a => a.folderItemId === fi.id))
                        .map(item => (
                          <button
                            key={item.id}
                            className="w-full flex items-center gap-2 p-2 text-left rounded hover-elevate"
                            onClick={() => attachItemMutation.mutate(item.id)}
                            disabled={attachItemMutation.isPending}
                            data-testid={`button-attach-item-${item.id}`}
                          >
                            <FolderIcon className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm truncate flex-1">{item.name}</span>
                            <span className="text-xs text-muted-foreground">{item.folder?.name}</span>
                          </button>
                        ))
                    )}
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAttachmentPicker(true)}
                  className="gap-2"
                  data-testid="button-add-attachment"
                >
                  <Paperclip className="h-3 w-3" />
                  Add attachment
                </Button>
              )}
            </div>
          </div>

          <div className="pt-4 space-y-2">
            <Button
              className="w-full"
              onClick={handleSave}
              disabled={updateMutation.isPending}
              data-testid="button-save-task"
            >
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
            <Button
              variant="ghost"
              className="w-full text-destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-task"
            >
              Delete task
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface NewTaskSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listings: Listing[];
  themes: Theme[];
  tags: Tag[];
}

function NewTaskSheet({ open, onOpenChange, listings, themes, tags }: NewTaskSheetProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [listingId, setListingId] = useState("");
  const [themeId, setThemeId] = useState("");
  const [tagId, setTagId] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assigneeType, setAssigneeType] = useState("member");
  const [assigneeName, setAssigneeName] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/tasks", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task created", description: "Your new task has been created." });
      onOpenChange(false);
      setTitle("");
      setDescription("");
      setListingId("");
      setThemeId("");
      setTagId("");
      setPriority("medium");
      setAssigneeType("member");
      setAssigneeName("");
      setDueDate(undefined);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create task.", variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!title.trim()) {
      toast({ title: "Error", description: "Task title is required.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      title,
      description,
      listingId: listingId && listingId !== "none" ? listingId : null,
      themeId: themeId && themeId !== "none" ? themeId : null,
      tagId: tagId && tagId !== "none" ? tagId : null,
      priority,
      assigneeType,
      assigneeName: assigneeName || null,
      dueDate: dueDate || null,
      status: "pending",
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto" data-testid="sheet-new-task">
        <SheetHeader className="mb-6">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Plus className="h-3 w-3" />
            <span>New Task</span>
          </div>
          <SheetTitle className="text-xl">Create Task</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm text-muted-foreground">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1"
              placeholder="Enter task title..."
              data-testid="input-new-task-title"
            />
          </div>

          <div>
            <Label className="text-sm text-muted-foreground">Property</Label>
            <Select value={listingId} onValueChange={setListingId}>
              <SelectTrigger className="mt-1" data-testid="select-new-task-property">
                <SelectValue placeholder="Select property" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {listings.map(listing => (
                  <SelectItem key={listing.id} value={listing.id}>{listing.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm text-muted-foreground">Theme</Label>
            <Select value={themeId} onValueChange={setThemeId}>
              <SelectTrigger className="mt-1" data-testid="select-new-task-theme">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {themes.map(theme => (
                  <SelectItem key={theme.id} value={theme.id}>{theme.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm text-muted-foreground">Tag</Label>
            <Select value={tagId} onValueChange={setTagId}>
              <SelectTrigger className="mt-1" data-testid="select-new-task-tag">
                <SelectValue placeholder="Select tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {tags.map(tag => (
                  <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm text-muted-foreground">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 250))}
              className="mt-1 min-h-[80px]"
              placeholder="Add a description..."
              data-testid="textarea-new-task-description"
            />
            <div className="text-xs text-muted-foreground text-right mt-1">
              {description.length}/250
            </div>
          </div>

          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">Assignment</Label>
            <RadioGroup value={assigneeType} onValueChange={setAssigneeType} className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="team" id="new-team" data-testid="radio-new-team" />
                <Label htmlFor="new-team" className="text-sm">Team</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="member" id="new-member" data-testid="radio-new-member" />
                <Label htmlFor="new-member" className="text-sm">Member</Label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label className="text-sm text-muted-foreground">Assign to</Label>
            <Input
              value={assigneeName}
              onChange={(e) => setAssigneeName(e.target.value)}
              className="mt-1"
              placeholder="Enter name..."
              data-testid="input-new-task-assignee"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-muted-foreground">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="mt-1" data-testid="select-new-task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Due date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full mt-1 justify-start" data-testid="button-new-due-date">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "MMM do, yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="pt-4">
            <Button
              className="w-full"
              onClick={handleCreate}
              disabled={createMutation.isPending}
              data-testid="button-create-task"
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Task
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function TasksPage() {
  const { toast } = useToast();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("taskboard");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [tagSheetOpen, setTagSheetOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const { data: tasks = [], isLoading: isLoadingTasks } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: listings = [] } = useQuery<Listing[]>({
    queryKey: ["/api/listings"],
  });

  const { data: themes = [] } = useQuery<Theme[]>({
    queryKey: ["/api/themes"],
  });

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags", "all"],
    queryFn: async () => {
      const res = await fetch("/api/tags?all=true", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tags");
      return res.json();
    },
  });

  // Query for selected tag's full data including reservation
  const { data: selectedTagData } = useQuery<Tag & { reservation?: any; listing?: Listing }>({
    queryKey: ["/api/tags", selectedTagId],
    enabled: !!selectedTagId && tagSheetOpen,
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/tasks/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update task status.", variant: "destructive" });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/tasks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task deleted", description: "The suggested task has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete task.", variant: "destructive" });
    },
  });

  const acceptSuggestedTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/tasks/${id}`, { status: "pending" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task accepted", description: "The task has been moved to Pending." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to accept task.", variant: "destructive" });
    },
  });

  // Filter tasks for taskboard
  const filteredTasks = tasks.filter(task => {
    if (task.status === "suggested") return false;
    if (propertyFilter !== "all" && task.listingId !== propertyFilter) return false;
    if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
    return true;
  });

  // AI Suggested items: Tags with suggestedTaskTitle that don't have a linked task yet
  // These are potential tasks the user can choose to create
  const tagsWithSuggestedTasks = tags.filter(tag => {
    // Must have a suggested task title
    if (!tag.suggestedTaskTitle) return false;
    // Filter by property if set
    if (propertyFilter !== "all" && tag.listingId !== propertyFilter) return false;
    // Check if there's already a task linked to this tag
    const hasLinkedTask = tasks.some(task => task.tagId === tag.id);
    if (hasLinkedTask) return false;
    return true;
  });

  // Also include any actual tasks with status "suggested" (legacy support)
  const suggestedTasks = tasks.filter(task => {
    if (task.status !== "suggested") return false;
    if (propertyFilter !== "all" && task.listingId !== propertyFilter) return false;
    return true;
  });

  const tasksByStatus: Record<TaskStatus, Task[]> = {
    pending: filteredTasks.filter(t => t.status === "pending"),
    in_progress: filteredTasks.filter(t => t.status === "in_progress"),
    done: filteredTasks.filter(t => t.status === "done"),
    discarded: filteredTasks.filter(t => t.status === "discarded"),
    suggested: suggestedTasks,
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const taskId = active.id as string;
    const overId = over.id as string;

    // Check if dropped on a column directly
    let newStatus = STATUS_COLUMNS.find(col => col.id === overId)?.id;

    // If not dropped on a column, check if dropped on a task card
    if (!newStatus) {
      const targetTask = tasks.find(t => t.id === overId);
      if (targetTask) {
        newStatus = targetTask.status as TaskStatus;
      }
    }

    if (newStatus) {
      const task = tasks.find(t => t.id === taskId);
      if (task && task.status !== newStatus) {
        updateTaskMutation.mutate({ id: taskId, status: newStatus });
      }
    }
  };

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Tasks</h1>
            <p className="text-muted-foreground text-sm">Manage all your tasks</p>
          </div>
          <Button onClick={() => setIsNewTaskOpen(true)} data-testid="button-new-task">
            <Plus className="mr-2 h-4 w-4" />
            New Task
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList>
            <TabsTrigger value="taskboard" data-testid="tab-taskboard">Taskboard</TabsTrigger>
            <TabsTrigger value="suggested" data-testid="tab-suggested" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              AI Suggested
              {(tagsWithSuggestedTasks.length + suggestedTasks.length) > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {tagsWithSuggestedTasks.length + suggestedTasks.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="p-4 border-b bg-muted/30">
        <div className="flex gap-3 flex-wrap">
          <Select value={propertyFilter} onValueChange={setPropertyFilter}>
            <SelectTrigger className="w-[160px]" data-testid="filter-property">
              <SelectValue placeholder="All Properties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Properties</SelectItem>
              {listings.map(listing => (
                <SelectItem key={listing.id} value={listing.id}>{listing.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[130px]" data-testid="filter-priority">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {isLoadingTasks ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : activeTab === "suggested" ? (
          <div className="w-full">
            {(tagsWithSuggestedTasks.length + suggestedTasks.length) === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Sparkles className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">No AI Suggested Tasks</h3>
                <p className="text-muted-foreground text-sm max-w-sm">
                  When you sync properties and run AI analysis, suggested tasks will appear here.
                </p>
              </div>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[300px]">Task Name</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead>Event Date</TableHead>
                      <TableHead>Tag</TableHead>
                      <TableHead>Sentiment</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Tags with AI suggested tasks (new approach) */}
                    {tagsWithSuggestedTasks.map(tag => {
                      const listing = listings.find(l => l.id === tag.listingId);
                      return (
                        <TableRow 
                          key={`tag-${tag.id}`} 
                          data-testid={`row-suggested-tag-${tag.id}`}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            setSelectedTagId(tag.id);
                            setTagSheetOpen(true);
                          }}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Sparkles className="h-4 w-4 text-destructive flex-shrink-0" />
                              <span className="line-clamp-2">{tag.suggestedTaskTitle}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {listing ? (
                              <div className="flex items-center gap-1.5">
                                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="truncate max-w-[180px]">{listing.name}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {tag.reservation?.checkIn 
                              ? format(new Date(tag.reservation.checkIn), "MMM d, yyyy") 
                              : tag.createdAt 
                                ? format(new Date(tag.createdAt), "MMM d, yyyy") 
                                : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="truncate max-w-[150px]">
                              {tag.name}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {tag.sentiment ? (
                              <Badge 
                                className={
                                  tag.sentiment === "positive" 
                                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                    : tag.sentiment === "negative"
                                    ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                    : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                                }
                              >
                                {tag.sentiment.charAt(0).toUpperCase() + tag.sentiment.slice(1)}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTagId(tag.id);
                                setTagSheetOpen(true);
                              }}
                              data-testid={`button-view-tag-${tag.id}`}
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* Legacy suggested tasks (tasks with status "suggested") */}
                    {suggestedTasks.map(task => {
                      const listing = listings.find(l => l.id === task.listingId);
                      const tag = tags.find(t => t.id === task.tagId);
                      return (
                        <TableRow 
                          key={task.id} 
                          data-testid={`row-suggested-task-${task.id}`}
                          className={tag ? "cursor-pointer hover:bg-muted/50" : ""}
                          onClick={() => {
                            if (tag) {
                              setSelectedTagId(tag.id);
                              setTagSheetOpen(true);
                            }
                          }}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Sparkles className="h-4 w-4 text-destructive flex-shrink-0" />
                              <span className="line-clamp-2">{task.title}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {listing ? (
                              <div className="flex items-center gap-1.5">
                                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="truncate max-w-[180px]">{listing.name}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {task.createdAt ? format(new Date(task.createdAt), "MMM d, yyyy") : "—"}
                          </TableCell>
                          <TableCell>
                            {tag ? (
                              <Badge variant="outline" className="truncate max-w-[150px]">
                                {tag.name}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {tag?.sentiment ? (
                              <Badge 
                                className={
                                  tag.sentiment === "positive" 
                                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                    : tag.sentiment === "negative"
                                    ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                    : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                                }
                              >
                                {tag.sentiment.charAt(0).toUpperCase() + tag.sentiment.slice(1)}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  acceptSuggestedTaskMutation.mutate(task.id);
                                }}
                                disabled={acceptSuggestedTaskMutation.isPending}
                                data-testid={`button-accept-task-${task.id}`}
                              >
                                Accept
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteTaskMutation.mutate(task.id);
                                }}
                                disabled={deleteTaskMutation.isPending}
                                data-testid={`button-delete-task-${task.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 min-w-max">
              {STATUS_COLUMNS.map(column => (
                <DroppableColumn
                  key={column.id}
                  status={column.id}
                  label={column.label}
                  tasks={tasksByStatus[column.id]}
                  listings={listings}
                  onTaskClick={setSelectedTask}
                />
              ))}
            </div>
            <DragOverlay>
              {activeTask && (
                <Card className="p-3 shadow-lg">
                  <Badge className={PRIORITY_COLORS[activeTask.priority] || PRIORITY_COLORS.medium}>
                    {activeTask.priority.charAt(0).toUpperCase() + activeTask.priority.slice(1)}
                  </Badge>
                  <h4 className="font-medium text-sm mt-2">{activeTask.title}</h4>
                </Card>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <TaskEditSheet
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        listings={listings}
        themes={themes}
        tags={tags}
      />

      <NewTaskSheet
        open={isNewTaskOpen}
        onOpenChange={setIsNewTaskOpen}
        listings={listings}
        themes={themes}
        tags={tags}
      />

      <TagDetailSheet
        open={tagSheetOpen}
        onOpenChange={(open) => {
          setTagSheetOpen(open);
          if (!open) setSelectedTagId(null);
        }}
        tag={selectedTagData || null}
        listing={selectedTagData?.listing || listings.find(l => l.id === selectedTagData?.listingId)}
        reservation={selectedTagData?.reservation}
        className="z-[60]"
      />
    </div>
  );
}
