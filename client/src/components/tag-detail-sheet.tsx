import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Home, 
  MessageCircle, 
  ChevronUp, 
  ChevronDown,
  ChevronRight,
  Sparkles,
  Star,
  Search,
  X,
  Users,
  User,
  CalendarIcon,
  Pencil,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  BookOpen,
  Loader2,
  Send
} from "lucide-react";
import { SiNotion } from "react-icons/si";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useNotionSync } from "@/hooks/use-notion-sync";
import { useWorkspace } from "@/contexts/workspace-context";
import type { Tag, Listing, Reservation, Team, Procedure } from "@shared/schema";

interface WorkspaceMemberWithUser {
  id: string;
  userId: string | null;
  workspaceId: string;
  role: string;
  status: string;
  invitedEmail: string | null;
  user?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    profileImageUrl?: string;
  };
}

interface ConversationMessage {
  id: string | number;
  sender: string;
  message: string;
  timestamp: string;
}

interface TagWithDetails extends Tag {
  listing?: Listing;
  reservation?: Reservation;
  theme?: { id: string; name: string };
}

interface TagDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag: TagWithDetails | null;
  listing?: Listing;
  reservation?: Reservation;
  relatedTags?: Tag[];
  className?: string;
}

const sentimentConfig = {
  positive: { label: "Positive", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  negative: { label: "Negative", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  neutral: { label: "Neutral", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  question: { label: "Question", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
};

export function TagDetailSheet({ 
  open, 
  onOpenChange, 
  tag, 
  listing: propListing, 
  reservation: propReservation,
  relatedTags,
  className = ""
}: TagDetailSheetProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { canSync, syncToNotion, isSyncing, notionConnection } = useNotionSync();
  const [showReservation, setShowReservation] = useState(false);
  const [showConversation, setShowConversation] = useState(false);
  const [conversationFilter, setConversationFilter] = useState<"both" | "host" | "guest">("both");
  const [conversationSearch, setConversationSearch] = useState("");
  
  // Task creation state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [assignmentType, setAssignmentType] = useState<"team" | "member">("member");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [selectedProcedureId, setSelectedProcedureId] = useState<string>("");
  
  // Fetch procedures for the workspace
  const { data: procedures = [] } = useQuery<Procedure[]>({
    queryKey: ["/api/procedures"],
    enabled: !!activeWorkspace?.id && open,
  });
  
  // Filter to only active procedures
  const activeProcedures = procedures.filter(p => p.status === "active");
  
  // Fetch workspace members
  const { data: workspaceMembers = [] } = useQuery<WorkspaceMemberWithUser[]>({
    queryKey: ["/api/workspaces", activeWorkspace?.id, "members"],
    enabled: !!activeWorkspace?.id && open,
  });
  
  // Fetch teams
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/workspaces", activeWorkspace?.id, "teams"],
    enabled: !!activeWorkspace?.id && open,
  });
  
  // Check if a task already exists for this tag
  const { data: existingTask } = useQuery<{ id: string; title: string; description?: string; status: string } | null>({
    queryKey: ["/api/tasks", "by-tag", tag?.id],
    queryFn: async () => {
      if (!tag?.id) return null;
      const response = await fetch(`/api/tasks?tagId=${tag.id}`);
      if (!response.ok) return null;
      const tasks = await response.json();
      return tasks.length > 0 ? tasks[0] : null;
    },
    enabled: !!tag?.id && open,
  });
  
  // Rating state
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingReasons, setRatingReasons] = useState<string[]>([]);
  const [ratingDescription, setRatingDescription] = useState("");
  
  // Reset state when sheet closes or tag changes
  useEffect(() => {
    if (!open) {
      setShowReservation(false);
      setShowConversation(false);
      setConversationFilter("both");
      setConversationSearch("");
      setIsEditingTitle(false);
      setRating(null);
      setShowRatingModal(false);
      setRatingReasons([]);
      setRatingDescription("");
      setSelectedProcedureId("");
    }
  }, [open]);

  useEffect(() => {
    if (tag) {
      // Use existing task data if available (for suggested tasks), otherwise use tag suggestions
      if (existingTask && existingTask.status === "suggested") {
        setTaskTitle(existingTask.title || "");
        setTaskDescription(existingTask.description || "");
      } else {
        setTaskTitle(tag.suggestedTaskTitle || "");
        setTaskDescription(tag.suggestedTaskDescription || "");
      }
      setShowReservation(false);
      setShowConversation(false);
      setConversationFilter("both");
      setConversationSearch("");
      setIsEditingTitle(false);
      setDueDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      setAssignmentType("member");
      setSelectedAssigneeId(""); // Reset to trigger default assignee selection
      setSelectedProcedureId("");
    }
  }, [tag?.id, existingTask]);
  
  // Set default assignee to current user when members load or tag changes
  useEffect(() => {
    // Only set default if no assignee is selected yet
    if (!selectedAssigneeId) {
      if (assignmentType === "member" && user && workspaceMembers.length > 0) {
        const currentUserMember = workspaceMembers.find(m => m.userId === user.id);
        if (currentUserMember) {
          setSelectedAssigneeId(currentUserMember.id);
        }
      } else if (assignmentType === "team" && teams.length > 0) {
        setSelectedAssigneeId(teams[0].id);
      }
    }
  }, [assignmentType, user, workspaceMembers, teams, selectedAssigneeId]);
  
  // Get member display name helper
  const getMemberDisplayName = (member: WorkspaceMemberWithUser) => {
    if (member.user) {
      const name = [member.user.firstName, member.user.lastName].filter(Boolean).join(" ");
      return name || member.user.email || member.invitedEmail || "Unknown";
    }
    return member.invitedEmail || "Unknown";
  };
  
  // Get assignee name for the task
  const getAssigneeName = () => {
    if (assignmentType === "member") {
      const member = workspaceMembers.find(m => m.id === selectedAssigneeId);
      return member ? getMemberDisplayName(member) : "";
    } else {
      const team = teams.find(t => t.id === selectedAssigneeId);
      return team?.name || "";
    }
  };

  const listing = propListing || tag?.listing;
  const reservation = propReservation || tag?.reservation;
  const conversationHistory = (reservation?.conversationHistory as ConversationMessage[]) || [];
  
  const filteredConversation = useMemo(() => {
    return conversationHistory.filter(msg => {
      const matchesFilter = conversationFilter === "both" || 
        (conversationFilter === "host" && msg.sender === "host") ||
        (conversationFilter === "guest" && msg.sender !== "host");
      const matchesSearch = conversationSearch === "" || 
        msg.message.toLowerCase().includes(conversationSearch.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [conversationHistory, conversationFilter, conversationSearch]);

  // Show task section for all tags
  // Allow creating/editing if no task exists OR if task is still in "suggested" status (AI-created, not yet accepted)
  const isSuggestedTask = existingTask?.status === "suggested";
  const canAddTask = !existingTask || isSuggestedTask;
  const hasAcceptedTask = existingTask && existingTask.status !== "suggested";
  
  // Check if this is an AI-suggested task (from existing suggested task OR tag suggestions)
  const hasAISuggestedTask = isSuggestedTask || ((tag?.sentiment === "negative" || tag?.sentiment === "neutral") && tag?.suggestedTaskTitle);

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/tasks", {
        title: taskTitle,
        description: taskDescription,
        priority,
        status: "pending",
        listingId: tag?.listingId,
        tagId: tag?.id,
        themeId: tag?.themeId,
        dueDate: dueDate?.toISOString(),
        assigneeType: assignmentType,
        assigneeId: selectedAssigneeId || null,
        assigneeName: getAssigneeName() || null,
      });
      
      const createdTask = await response.json();
      
      // If a procedure was selected, assign it to the task
      if (selectedProcedureId && createdTask?.id) {
        try {
          await apiRequest("POST", `/api/tasks/${createdTask.id}/procedure`, {
            procedureId: selectedProcedureId,
          });
        } catch (error) {
          console.error("Failed to assign procedure:", error);
          // Task was still created, just procedure assignment failed
        }
      }
      
      return createdTask;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task Created",
        description: selectedProcedureId 
          ? "The task has been added with the attached procedure." 
          : "The task has been added to your pending tasks.",
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create task.",
        variant: "destructive",
      });
    },
  });

  // Discard tag mutation
  const discardTagMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/tags/${tag?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
      toast({ title: "Tag Discarded", description: "The tag has been removed." });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to discard tag.", variant: "destructive" });
    },
  });

  if (!tag) return null;

  const sentimentInfo = sentimentConfig[tag.sentiment as keyof typeof sentimentConfig] || sentimentConfig.neutral;

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        className={`w-full sm:max-w-lg overflow-y-auto z-[60] flex flex-col ${className}`} 
        data-testid="sheet-tag-detail"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Header */}
        <SheetHeader className="pb-4">
          <SheetTitle className="text-xl font-semibold" data-testid="text-tag-name">
            {tag.name}
          </SheetTitle>
        </SheetHeader>

        {/* Theme and Sentiment Row */}
        <div className="flex items-center justify-between gap-2 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Theme</span>
            <Badge variant="secondary" className="font-medium">
              {tag.theme?.name || "Uncategorized"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Tag sentiment</span>
            <Badge className={sentimentInfo.color}>
              {sentimentInfo.label}
            </Badge>
          </div>
        </div>

        {/* AI Generated Tag Card */}
        <Card className="p-4 bg-primary/5 border-primary/20 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">AI generated Tag</p>
              <p className="text-xs text-muted-foreground italic mt-0.5">
                Re: {tag.summary || "Analysis based on guest feedback and conversations."}
              </p>
            </div>
          </div>
          {tag.verbatimEvidence && (
            <p className="text-sm mt-3 pl-11">
              "{tag.verbatimEvidence}"
            </p>
          )}
        </Card>

        {/* Details Section */}
        <div className="space-y-1 mb-4">
          <h3 className="text-sm font-semibold mb-2">Details</h3>
          
          {/* See Reservation Row */}
          <div 
            className="flex items-center justify-between p-3 rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setShowReservation(!showReservation)}
            data-testid="button-toggle-reservation"
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">See reservation</span>
            </div>
            <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${showReservation ? 'rotate-90' : ''}`} />
          </div>

          {/* Reservation Details (Expandable) */}
          {showReservation && (
            <Card className="p-4 ml-6 mt-2 mb-2">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
                  {listing?.imageUrl ? (
                    <img 
                      src={listing.imageUrl} 
                      alt={listing.name || ""} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Home className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm line-clamp-2">
                    {listing?.name || "Unknown Property"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {listing?.address || ""}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Guest:</span>
                  <div className="flex items-center gap-2">
                    <Avatar className="w-6 h-6">
                      <AvatarImage src={reservation?.guestProfilePicture || undefined} alt={reservation?.guestName || "Guest"} />
                      <AvatarFallback className="text-xs">
                        {(reservation?.guestName || "G").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{reservation?.guestName || "Unknown"}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Reservation ID:</span>
                  <span className="font-medium text-primary">{reservation?.confirmationCode || reservation?.externalId || "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Check in:</span>
                  <span>{reservation?.checkInDate ? format(new Date(reservation.checkInDate), "MM/dd/yy") : "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Check out:</span>
                  <span>{reservation?.checkOutDate ? format(new Date(reservation.checkOutDate), "MM/dd/yy") : "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Channel:</span>
                  <span>{reservation?.platform || "-"}</span>
                </div>
              </div>

              {relatedTags && relatedTags.length > 0 && (
                <div className="pt-3 mt-3 border-t">
                  <span className="text-xs text-muted-foreground">Related Tags:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {relatedTags.map(t => (
                      <Badge 
                        key={t.id}
                        variant="secondary"
                        className={`text-xs ${t.id === tag.id ? 'ring-2 ring-primary' : ''} ${sentimentConfig[t.sentiment as keyof typeof sentimentConfig]?.color || ''}`}
                      >
                        {t.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
          
          {/* Conversation Thread Row */}
          <div 
            className="flex items-center justify-between p-3 rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setShowConversation(!showConversation)}
            data-testid="button-toggle-conversation"
          >
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Conversation Thread</span>
              <Badge variant="secondary" className="text-xs">
                {conversationHistory.length}
              </Badge>
            </div>
            <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${showConversation ? 'rotate-90' : ''}`} />
          </div>

          {/* Conversation Thread (Expandable) */}
          {showConversation && (
            <div className="ml-6 mt-2 space-y-3">
              {/* Filter and Search Controls */}
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Button
                    variant={conversationFilter === "both" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setConversationFilter("both")}
                    className="text-xs h-7"
                    data-testid="button-filter-both"
                  >
                    Both
                  </Button>
                  <Button
                    variant={conversationFilter === "host" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setConversationFilter("host")}
                    className="text-xs h-7"
                    data-testid="button-filter-host"
                  >
                    Host
                  </Button>
                  <Button
                    variant={conversationFilter === "guest" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setConversationFilter("guest")}
                    className="text-xs h-7"
                    data-testid="button-filter-guest"
                  >
                    Guest
                  </Button>
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search messages..."
                    value={conversationSearch}
                    onChange={(e) => setConversationSearch(e.target.value)}
                    className="pl-9 pr-8 h-8 text-sm"
                    data-testid="input-conversation-search"
                  />
                  {conversationSearch && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                      onClick={() => setConversationSearch("")}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Message List */}
              <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                {filteredConversation.length > 0 ? (
                  filteredConversation.map((msg, idx) => (
                    <div key={msg.id || idx} className="flex gap-3">
                      <Avatar className="w-8 h-8 flex-shrink-0">
                        {msg.sender !== 'host' && reservation?.guestProfilePicture && (
                          <AvatarImage src={reservation.guestProfilePicture} alt={reservation?.guestName || "Guest"} />
                        )}
                        <AvatarFallback className={msg.sender === 'host' ? 'bg-primary text-primary-foreground' : 'bg-muted'}>
                          {msg.sender === 'host' ? 'H' : (reservation?.guestName || "G").slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">
                            {msg.sender === 'host' ? 'Host' : (reservation?.guestName || 'Guest')}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {msg.timestamp ? format(new Date(msg.timestamp), "MMM d, h:mm a") : ""}
                          </span>
                        </div>
                        <p className="text-sm mt-0.5">{msg.message}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {conversationSearch ? "No messages match your search" : "No messages available"}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Task Section - Show for all tags */}
        {hasAcceptedTask ? (
          <Card className="p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Linked Task</Label>
                <Badge variant="outline" className="text-xs">{existingTask?.status}</Badge>
              </div>
            </div>
            <p className="text-sm font-medium mt-2">{existingTask?.title}</p>
          </Card>
        ) : canAddTask && (
          <Card className="p-4 mb-4">
            {/* Task Title with optional AI indicator */}
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-sm text-muted-foreground">Task Title</Label>
              {hasAISuggestedTask && (
                <span className="inline-flex items-center gap-1 text-xs text-destructive">
                  <Sparkles className="w-3 h-3" />
                  AI Suggested Task
                </span>
              )}
            </div>
            
            <Input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className="mb-4"
              placeholder="Enter task title..."
              data-testid="input-task-title"
            />

            {/* Team/Member Selection */}
            <RadioGroup 
              value={assignmentType} 
              onValueChange={(v) => setAssignmentType(v as "team" | "member")}
              className="flex items-center gap-4 mb-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="team" id="team" />
                <Label htmlFor="team" className="text-sm cursor-pointer">Team</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="member" id="member" />
                <Label htmlFor="member" className="text-sm cursor-pointer">Member</Label>
              </div>
            </RadioGroup>

            {/* Assign To */}
            <div className="mb-4">
              <Label className="text-sm text-muted-foreground mb-1.5 block">Assign to</Label>
              <Select 
                value={selectedAssigneeId} 
                onValueChange={(value) => setSelectedAssigneeId(value)}
              >
                <SelectTrigger data-testid="select-assign-to">
                  <SelectValue placeholder={assignmentType === "team" ? "Select team" : "Select member"} />
                </SelectTrigger>
                <SelectContent>
                  {assignmentType === "member" ? (
                    workspaceMembers.length > 0 ? (
                      workspaceMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {getMemberDisplayName(member)}
                          {member.userId === user?.id && " (You)"}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="loading" disabled>Loading members...</SelectItem>
                    )
                  ) : (
                    teams.length > 0 ? (
                      teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-teams" disabled>No teams available</SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Priority and Due Date */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <Label className="text-sm text-muted-foreground mb-1.5 block">Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger data-testid="select-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" className="z-[100]">
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground mb-1.5 block">Due date</Label>
                <Popover modal={true}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      data-testid="button-due-date"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dueDate ? format(dueDate, "MMM d, yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[100]" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={(date) => {
                        setDueDate(date);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Description */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Label className="text-sm text-muted-foreground">Description</Label>
                {hasAISuggestedTask && tag?.suggestedTaskDescription && (
                  <span className="inline-flex items-center gap-1 text-xs text-destructive">
                    <Sparkles className="w-3 h-3" />
                    AI
                  </span>
                )}
              </div>
              <Textarea
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="Input task instructions..."
                className="resize-none"
                rows={3}
                maxLength={250}
                data-testid="textarea-task-description"
              />
              <p className="text-xs text-muted-foreground text-right mt-1">
                {taskDescription.length}/250
              </p>
            </div>

            {/* Optional Procedure Assignment */}
            {activeProcedures.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                  <Label className="text-sm text-muted-foreground">Attach Procedure</Label>
                  <span className="text-xs text-muted-foreground/70">(optional)</span>
                </div>
                <Select 
                  value={selectedProcedureId} 
                  onValueChange={(value) => setSelectedProcedureId(value === "none" ? "" : value)}
                >
                  <SelectTrigger 
                    className="text-sm"
                    data-testid="select-procedure"
                  >
                    <SelectValue placeholder="No procedure" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No procedure</SelectItem>
                    {activeProcedures.map((procedure) => (
                      <SelectItem key={procedure.id} value={procedure.id}>
                        {procedure.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Action Button */}
            <Button
              className="w-full"
              onClick={() => createTaskMutation.mutate()}
              disabled={!taskTitle || createTaskMutation.isPending}
              data-testid="button-create-task"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Create Task
            </Button>
          </Card>
        )}

        {/* Footer */}
        <div className="mt-auto pt-4 border-t">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">How accurate was this tag?</span>
            </div>
          </div>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1">
              <span className="text-sm">Rate this tag</span>
              <Button 
                variant="ghost" 
                size="icon" 
                className={`h-8 w-8 ${rating === "up" ? "text-green-600 bg-green-100 dark:bg-green-900/30" : ""}`}
                onClick={() => {
                  setRating("up");
                  toast({ title: "Thanks for your feedback!", description: "Tag rated positively." });
                }}
                data-testid="button-rate-up"
              >
                <ThumbsUp className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className={`h-8 w-8 ${rating === "down" ? "text-red-600 bg-red-100 dark:bg-red-900/30" : ""}`}
                onClick={() => {
                  setRating("down");
                  setShowRatingModal(true);
                }}
                data-testid="button-rate-down"
              >
                <ThumbsDown className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {canSync && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => tag?.id && syncToNotion([tag.id])}
                  disabled={isSyncing || !tag?.id}
                  data-testid="button-sync-to-notion"
                >
                  {isSyncing ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <SiNotion className="w-4 h-4 mr-1" />
                  )}
                  Send to Notion
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-muted-foreground"
                onClick={() => discardTagMutation.mutate()}
                disabled={discardTagMutation.isPending}
                data-testid="button-discard-tag"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Discard tag
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>

    {/* Rating Modal */}
    <Dialog open={showRatingModal} onOpenChange={setShowRatingModal}>
      <DialogContent className="sm:max-w-md z-[70]" data-testid="dialog-rating">
        <DialogHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <ThumbsDown className="w-6 h-6 text-red-600" />
            </div>
          </div>
          <DialogTitle className="text-center">Rating</DialogTitle>
          <p className="text-sm text-muted-foreground text-center">
            Describe why tag was not accurate
          </p>
        </DialogHeader>

        <Separator className="my-4" />

        {/* Tag Info */}
        <div className="space-y-2">
          <h4 className="font-semibold">{tag.name}</h4>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Theme</span>
            <Badge variant="secondary">{tag.theme?.name || "Uncategorized"}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Tag sentiment</span>
            <Badge className={sentimentInfo.color}>{sentimentInfo.label}</Badge>
          </div>
          {tag.suggestedTaskTitle && (
            <div className="flex items-start gap-2">
              <span className="text-sm text-muted-foreground">Actionable Item:</span>
              <span className="text-sm">{tag.suggestedTaskTitle}</span>
            </div>
          )}
        </div>

        <Separator className="my-4" />

        {/* Reasons for Rating */}
        <div className="space-y-3">
          <h4 className="font-medium">Reasons for rating</h4>
          <div className="flex flex-wrap gap-3">
            {["Suggested Task", "Tag Name", "Sentiment", "Description"].map((reason) => (
              <div key={reason} className="flex items-center gap-2">
                <Checkbox
                  id={`reason-${reason}`}
                  checked={ratingReasons.includes(reason)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setRatingReasons([...ratingReasons, reason]);
                    } else {
                      setRatingReasons(ratingReasons.filter((r) => r !== reason));
                    }
                  }}
                  data-testid={`checkbox-reason-${reason.toLowerCase().replace(" ", "-")}`}
                />
                <Label htmlFor={`reason-${reason}`} className="text-sm cursor-pointer">
                  {reason}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2 mt-4">
          <Label className="font-medium">Description</Label>
          <Textarea
            value={ratingDescription}
            onChange={(e) => setRatingDescription(e.target.value)}
            placeholder="Explain your rating, this will help the AI engine learn..."
            className="resize-none"
            rows={3}
            maxLength={250}
            data-testid="textarea-rating-description"
          />
          <p className="text-xs text-muted-foreground text-right">
            {ratingDescription.length}/250
          </p>
        </div>

        <DialogFooter className="mt-4 flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setShowRatingModal(false);
              setRating(null);
              setRatingReasons([]);
              setRatingDescription("");
            }}
            data-testid="button-cancel-rating"
          >
            Cancel
          </Button>
          <Button
            className="bg-red-500 hover:bg-red-600 text-white"
            onClick={() => {
              toast({ 
                title: "Thanks for your feedback!", 
                description: "Your rating has been submitted." 
              });
              setShowRatingModal(false);
            }}
            data-testid="button-submit-rating"
          >
            Rate tag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  );
}
