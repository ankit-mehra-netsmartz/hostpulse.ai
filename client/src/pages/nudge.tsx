import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Hand,
  Plus,
  MessageSquare,
  Send,
  Users,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  Pause,
  Settings,
  Trash2,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Building2,
  User,
  Calendar
} from "lucide-react";
import { useWorkspace } from "@/contexts/workspace-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { 
  NudgeCampaign, 
  NudgeConversation, 
  NudgeMessage,
  NudgeCampaignWithStats,
  NudgeConversationWithMessages,
  Listing,
  Reservation
} from "@shared/schema";

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

function formatDate(dateStr: string | Date | null): string {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return null;
  
  const config = {
    positive: { icon: ThumbsUp, className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
    neutral: { icon: Minus, className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
    negative: { icon: ThumbsDown, className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  }[sentiment] || { icon: Minus, className: "bg-gray-100 text-gray-700" };
  
  const Icon = config.icon;
  return (
    <Badge variant="secondary" className={config.className}>
      <Icon className="w-3 h-3 mr-1" />
      {sentiment}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { className: string; label: string }> = {
    draft: { className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", label: "Draft" },
    active: { className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", label: "Active" },
    paused: { className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300", label: "Paused" },
    completed: { className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", label: "Completed" },
    pending: { className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", label: "Pending" },
    opted_out: { className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300", label: "Opted Out" },
  };
  
  const { className, label } = config[status] || config.draft;
  return <Badge variant="secondary" className={className}>{label}</Badge>;
}

function ConversationDetail({ 
  conversation, 
  onClose,
  onDelete
}: { 
  conversation: NudgeConversationWithMessages;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [newMessage, setNewMessage] = useState("");
  const { toast } = useToast();

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest("POST", `/api/nudge/conversations/${conversation.id}/send`, { content });
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/nudge/conversations", conversation.id] });
      toast({ title: "Message sent" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send message", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="font-medium">{conversation.guestName || "Guest"}</div>
            <div className="text-sm text-muted-foreground">{formatPhone(conversation.guestPhone)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={conversation.status} />
          <SentimentBadge sentiment={conversation.sentiment} />
          <Button
            size="icon"
            variant="ghost"
            onClick={onDelete}
            title="Delete conversation"
            data-testid="button-delete-conversation"
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </div>
      
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {conversation.messages?.map((message) => (
            <div 
              key={message.id}
              className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] ${message.direction === 'outbound' ? 'text-right' : 'text-left'}`}>
                <div className={`text-xs mb-1 ${message.direction === 'outbound' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                  {message.direction === 'outbound' ? 'Nudge AI' : conversation.guestName || 'Guest'}
                </div>
                <div 
                  className={`rounded-lg px-4 py-2 inline-block text-left ${
                    message.direction === 'outbound' 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-green-100 dark:bg-green-900 text-green-900 dark:text-green-100'
                  }`}
                >
                  <p className="text-sm">{message.content}</p>
                  <div className={`text-xs mt-1 flex items-center gap-1 ${
                    message.direction === 'outbound' ? 'text-primary-foreground/70 justify-end' : 'text-green-700 dark:text-green-300'
                  }`}>
                    {formatDate(message.createdAt)}
                    {message.direction === 'outbound' && (
                      <>
                        {message.status === 'sent' && (
                          <span className="ml-1 flex items-center gap-0.5" title="Sent">
                            <CheckCircle2 className="w-3 h-3" />
                          </span>
                        )}
                        {message.status === 'delivered' && (
                          <span className="ml-1 flex items-center gap-0.5 text-green-400" title="Delivered">
                            <CheckCircle2 className="w-3 h-3" />
                            <CheckCircle2 className="w-3 h-3 -ml-1.5" />
                          </span>
                        )}
                        {message.status === 'pending' && (
                          <span className="ml-1" title="Sending...">
                            <Clock className="w-3 h-3" />
                          </span>
                        )}
                        {message.status === 'failed' && (
                          <span className="ml-1 flex items-center gap-1 text-red-400" title={message.errorMessage || 'Failed to send'}>
                            <XCircle className="w-3 h-3" />
                            <span>Failed</span>
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          {(!conversation.messages || conversation.messages.length === 0) && (
            <div className="text-center text-muted-foreground py-8">
              No messages yet
            </div>
          )}
        </div>
      </ScrollArea>

      {conversation.feedbackSummary && (
        <div className="p-4 border-t bg-muted/50">
          <div className="text-sm font-medium mb-1">AI Summary</div>
          <p className="text-sm text-muted-foreground">{conversation.feedbackSummary}</p>
        </div>
      )}
      
      {conversation.status === 'active' && (
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="resize-none"
              rows={2}
              data-testid="input-message"
            />
            <Button 
              onClick={() => sendMessageMutation.mutate(newMessage)}
              disabled={!newMessage.trim() || sendMessageMutation.isPending}
              size="icon"
              className="h-auto"
              data-testid="button-send-message"
            >
              {sendMessageMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CampaignCard({ 
  campaign, 
  onSelect,
  onEdit
}: { 
  campaign: NudgeCampaignWithStats;
  onSelect: () => void;
  onEdit: () => void;
}) {
  return (
    <Card 
      className="cursor-pointer hover-elevate transition-all"
      onClick={onSelect}
      data-testid={`card-campaign-${campaign.id}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">{campaign.name}</CardTitle>
            {campaign.description && (
              <CardDescription className="line-clamp-2">{campaign.description}</CardDescription>
            )}
          </div>
          <StatusBadge status={campaign.status} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold">{campaign.totalConversations || 0}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">{campaign.activeConversations || 0}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600">{campaign.completedConversations || 0}</div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </div>
        </div>
        
        {(campaign.positiveCount > 0 || campaign.neutralCount > 0 || campaign.negativeCount > 0) && (
          <div className="mt-4 flex gap-2 justify-center">
            {campaign.positiveCount > 0 && (
              <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                <ThumbsUp className="w-3 h-3 mr-1" /> {campaign.positiveCount}
              </Badge>
            )}
            {campaign.neutralCount > 0 && (
              <Badge variant="secondary" className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                <Minus className="w-3 h-3 mr-1" /> {campaign.neutralCount}
              </Badge>
            )}
            {campaign.negativeCount > 0 && (
              <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                <ThumbsDown className="w-3 h-3 mr-1" /> {campaign.negativeCount}
              </Badge>
            )}
          </div>
        )}
        
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {campaign.triggerDelayHours}h after checkout
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            data-testid={`button-edit-campaign-${campaign.id}`}
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Shortcodes available for message templates
const SHORTCODES = [
  { code: "%guest_name", description: "Guest's first name", example: "John" },
  { code: "%guest_full_name", description: "Guest's full name", example: "John Smith" },
  { code: "%property_name", description: "Property/listing name", example: "Sunset Beach House" },
  { code: "%host_name", description: "Host's name", example: "Sarah" },
  { code: "%checkout_date", description: "Checkout date", example: "Jan 15" },
  { code: "%nights_stayed", description: "Number of nights", example: "3" },
];

function applyShortcodes(message: string, reservation?: Reservation | null, listings?: Listing[]): string {
  if (!message) return "";
  
  let result = message;
  
  if (reservation) {
    const listing = listings?.find(l => l.id === reservation.listingId);
    const guestName = reservation.guestName || "Guest";
    const nameParts = guestName.split(" ");
    const firstName = nameParts[0] || "Guest";
    const checkoutDate = reservation.checkOutDate 
      ? new Date(reservation.checkOutDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : "N/A";
    const nights = reservation.checkOutDate && reservation.checkInDate
      ? Math.ceil((new Date(reservation.checkOutDate).getTime() - new Date(reservation.checkInDate).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    
    result = result
      .replace(/%guest_name/g, firstName)
      .replace(/%guest_full_name/g, guestName)
      .replace(/%property_name/g, listing?.name || reservation.listingId || "Your Property")
      .replace(/%host_name/g, "Host")
      .replace(/%checkout_date/g, checkoutDate)
      .replace(/%nights_stayed/g, String(nights));
  } else {
    // Show example values when no reservation selected
    result = result
      .replace(/%guest_name/g, "John")
      .replace(/%guest_full_name/g, "John Smith")
      .replace(/%property_name/g, "Sunset Beach House")
      .replace(/%host_name/g, "Sarah")
      .replace(/%checkout_date/g, "Jan 15")
      .replace(/%nights_stayed/g, "3");
  }
  
  return result;
}

function CreateCampaignDialog({
  open,
  onOpenChange,
  editingCampaign,
  onCampaignCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCampaign?: NudgeCampaign | null;
  onCampaignCreated?: (campaign: NudgeCampaign) => void;
}) {
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [name, setName] = useState(editingCampaign?.name || "");
  const [description, setDescription] = useState(editingCampaign?.description || "");
  const [initialMessage, setInitialMessage] = useState(
    editingCampaign?.initialMessage || 
    "Hi %guest_name! This is %property_name. We hope you enjoyed your stay! We'd love to hear your feedback. How was your experience with us?"
  );
  const [aiInstructions, setAiInstructions] = useState(
    editingCampaign?.aiInstructions ||
    "You are a friendly host assistant collecting feedback from a recent guest. Be warm, empathetic, and conversational. Ask follow-up questions to understand their experience. If they mention issues, express understanding and assure them their feedback will be addressed. Aim to understand: overall satisfaction, specific highlights or concerns, and suggestions for improvement. Keep responses concise and natural."
  );
  const [triggerDelayHours, setTriggerDelayHours] = useState(String(editingCampaign?.triggerDelayHours || 24));
  const [maxMessages, setMaxMessages] = useState(String(editingCampaign?.maxMessages || 10));
  const [previewReservationId, setPreviewReservationId] = useState<string>("");

  // Fetch recent reservations for preview
  const { data: recentReservations } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations", { limit: 10, workspaceId: activeWorkspace?.id }],
    queryFn: async () => {
      const res = await fetch(`/api/reservations?limit=10`, {
        credentials: "include",
        headers: { "x-workspace-id": activeWorkspace?.id || "" }
      });
      if (!res.ok) return [];
      const data = await res.json();
      // API returns paginated response with items array
      return data.items || data;
    },
    enabled: open && !!activeWorkspace?.id,
  });

  // Fetch listings for property names
  const { data: listings } = useQuery<Listing[]>({
    queryKey: ["/api/listings"],
    enabled: open,
  });

  const selectedReservation = recentReservations?.find(r => r.id === previewReservationId);

  const createMutation = useMutation({
    mutationFn: async (data: any): Promise<NudgeCampaign> => {
      const url = editingCampaign 
        ? `/api/nudge/campaigns/${editingCampaign.id}` 
        : "/api/nudge/campaigns";
      const res = await apiRequest(editingCampaign ? "PATCH" : "POST", url, data);
      return res.json();
    },
    onSuccess: (campaign: NudgeCampaign) => {
      queryClient.invalidateQueries({ queryKey: ["/api/nudge/campaigns"] });
      onOpenChange(false);
      toast({ 
        title: editingCampaign ? "Campaign updated" : "Campaign created successfully!",
        description: editingCampaign 
          ? undefined 
          : "Your campaign is saved. Click on it to start conversations or send a test."
      });
      if (!editingCampaign && onCampaignCreated) {
        onCampaignCreated(campaign);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save campaign", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!name.trim() || !initialMessage.trim()) {
      toast({ title: "Please fill in required fields", variant: "destructive" });
      return;
    }
    
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
      initialMessage: initialMessage.trim(),
      aiInstructions: aiInstructions.trim() || null,
      triggerDelayHours: parseInt(triggerDelayHours) || 24,
      maxMessages: parseInt(maxMessages) || 10,
      workspaceId: activeWorkspace?.id,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingCampaign ? "Edit Campaign" : "Create Nudge Campaign"}</DialogTitle>
          <DialogDescription>
            Set up an AI-powered SMS conversation to collect guest feedback after checkout.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Campaign Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Post-Stay Feedback"
              data-testid="input-campaign-name"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this campaign"
              data-testid="input-campaign-description"
            />
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <Label htmlFor="initialMessage">Initial Message *</Label>
            <Textarea
              id="initialMessage"
              value={initialMessage}
              onChange={(e) => setInitialMessage(e.target.value)}
              placeholder="The first message sent to guests..."
              rows={3}
              data-testid="input-initial-message"
            />
            
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <div className="text-xs font-medium">Available Shortcodes:</div>
              <div className="flex flex-wrap gap-2">
                {SHORTCODES.map((sc) => (
                  <button
                    key={sc.code}
                    type="button"
                    onClick={() => {
                      const textarea = document.getElementById('initialMessage') as HTMLTextAreaElement;
                      const start = textarea?.selectionStart || initialMessage.length;
                      const newMessage = initialMessage.slice(0, start) + sc.code + initialMessage.slice(start);
                      setInitialMessage(newMessage);
                    }}
                    className="text-xs px-2 py-1 bg-background border rounded hover-elevate cursor-pointer"
                    title={`${sc.description} (e.g., "${sc.example}")`}
                    data-testid={`shortcode-${sc.code}`}
                  >
                    <code>{sc.code}</code>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="bg-muted rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium">Message Preview</div>
                <Select value={previewReservationId} onValueChange={setPreviewReservationId}>
                  <SelectTrigger className="w-[200px] h-7 text-xs" data-testid="select-preview-reservation">
                    <SelectValue placeholder="Select reservation..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="example">Use example values</SelectItem>
                    {recentReservations?.map((res) => (
                      <SelectItem key={res.id} value={res.id}>
                        {res.guestName || "Guest"} - {res.checkOutDate ? new Date(res.checkOutDate).toLocaleDateString() : "N/A"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-foreground">
                {applyShortcodes(
                  initialMessage, 
                  previewReservationId === "example" ? null : selectedReservation,
                  listings
                )}
              </p>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="aiInstructions">AI Conversation Instructions</Label>
            <Textarea
              id="aiInstructions"
              value={aiInstructions}
              onChange={(e) => setAiInstructions(e.target.value)}
              placeholder="Instructions for how the AI should handle the conversation..."
              rows={4}
              data-testid="input-ai-instructions"
            />
            <p className="text-xs text-muted-foreground">
              Guide the AI on tone, topics to explore, and how to handle different scenarios.
            </p>
          </div>
          
          <Separator />
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="triggerDelay">Send After Checkout</Label>
              <Select value={triggerDelayHours} onValueChange={setTriggerDelayHours}>
                <SelectTrigger data-testid="select-trigger-delay">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 hour</SelectItem>
                  <SelectItem value="2">2 hours</SelectItem>
                  <SelectItem value="6">6 hours</SelectItem>
                  <SelectItem value="12">12 hours</SelectItem>
                  <SelectItem value="24">24 hours</SelectItem>
                  <SelectItem value="48">48 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="maxMessages">Max AI Responses</Label>
              <Select value={maxMessages} onValueChange={setMaxMessages}>
                <SelectTrigger data-testid="select-max-messages">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 messages</SelectItem>
                  <SelectItem value="10">10 messages</SelectItem>
                  <SelectItem value="15">15 messages</SelectItem>
                  <SelectItem value="20">20 messages</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            data-testid="button-save-campaign"
          >
            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editingCampaign ? "Update" : "Create"} Campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StartConversationDialog({
  open,
  onOpenChange,
  campaign
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: NudgeCampaign;
}) {
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [selectedListingId, setSelectedListingId] = useState<string>("");

  const { data: listings } = useQuery<Listing[]>({
    queryKey: ["/api/listings"],
  });

  const startMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/nudge/conversations", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nudge/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nudge/conversations"] });
      onOpenChange(false);
      setGuestName("");
      setGuestPhone("");
      setSelectedListingId("");
      toast({ title: "Conversation started", description: "Initial message sent to guest." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to start conversation", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!guestPhone.trim()) {
      toast({ title: "Phone number is required", variant: "destructive" });
      return;
    }
    
    const listing = listings?.find(l => l.id === selectedListingId);
    
    startMutation.mutate({
      campaignId: campaign.id,
      workspaceId: activeWorkspace?.id,
      guestName: guestName.trim() || null,
      guestPhone: guestPhone.trim(),
      listingId: selectedListingId || null,
      listingName: listing?.name || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start New Conversation</DialogTitle>
          <DialogDescription>
            Send a nudge message to a guest to collect their feedback.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="guestName">Guest Name</Label>
            <Input
              id="guestName"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="e.g., John Smith"
              data-testid="input-guest-name"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="guestPhone">Phone Number *</Label>
            <Input
              id="guestPhone"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="+1 (555) 123-4567"
              data-testid="input-guest-phone"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="listing">Property</Label>
            <Select value={selectedListingId} onValueChange={setSelectedListingId}>
              <SelectTrigger data-testid="select-listing">
                <SelectValue placeholder="Select a property" />
              </SelectTrigger>
              <SelectContent>
                {listings?.map((listing) => (
                  <SelectItem key={listing.id} value={listing.id}>
                    {listing.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={startMutation.isPending}
            data-testid="button-start-conversation"
          >
            {startMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Send Message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestCampaignDialog({
  open,
  onOpenChange,
  campaign
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: NudgeCampaign;
}) {
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [testPhone, setTestPhone] = useState("");
  const [testName, setTestName] = useState("Test User");

  const testMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/nudge/conversations", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nudge/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nudge/conversations"] });
      onOpenChange(false);
      setTestPhone("");
      toast({ 
        title: "Test message sent!", 
        description: "Check your phone for the SMS. Reply to test the AI conversation."
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send test", description: error.message, variant: "destructive" });
    },
  });

  const handleTest = () => {
    if (!testPhone.trim()) {
      toast({ title: "Please enter your phone number", variant: "destructive" });
      return;
    }
    
    testMutation.mutate({
      campaignId: campaign.id,
      workspaceId: activeWorkspace?.id,
      guestName: testName.trim() || "Test User",
      guestPhone: testPhone.trim(),
      listingId: null,
      listingName: "Test Property",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Test Campaign</DialogTitle>
          <DialogDescription>
            Send a test message to your own phone to see how the campaign works.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="p-3 bg-muted rounded-lg">
            <div className="text-sm font-medium mb-1">Preview Message:</div>
            <p className="text-sm text-muted-foreground">
              {campaign.initialMessage
                .replace(/{guestName}/g, testName || 'Guest')
                .replace(/{propertyName}/g, 'Test Property')}
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="testName">Your Name</Label>
            <Input
              id="testName"
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              placeholder="Your name"
              data-testid="input-test-name"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="testPhone">Your Phone Number *</Label>
            <Input
              id="testPhone"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+1 (555) 123-4567"
              data-testid="input-test-phone"
            />
            <p className="text-xs text-muted-foreground">
              Enter your phone number with country code (e.g., +1 for US)
            </p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleTest}
            disabled={testMutation.isPending}
            data-testid="button-send-test"
          >
            {testMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Phone className="w-4 h-4 mr-2" />
            Send Test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function NudgePage() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [selectedCampaign, setSelectedCampaign] = useState<NudgeCampaignWithStats | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<NudgeConversationWithMessages | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<NudgeCampaign | null>(null);

  // Only super admins can access the full Nudge feature
  const isAppAdmin = user?.role === "app_admin";

  const { data: campaigns, isLoading: campaignsLoading } = useQuery<NudgeCampaignWithStats[]>({
    queryKey: ["/api/nudge/campaigns", activeWorkspace?.id],
    queryFn: async () => {
      const res = await fetch("/api/nudge/campaigns", {
        credentials: "include",
        headers: { "x-workspace-id": activeWorkspace?.id || "" }
      });
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
    enabled: !!activeWorkspace?.id,
  });

  const { data: conversations, isLoading: conversationsLoading } = useQuery<NudgeConversation[]>({
    queryKey: ["/api/nudge/conversations", { campaignId: selectedCampaign?.id }],
    queryFn: async () => {
      const res = await fetch(`/api/nudge/conversations?campaignId=${selectedCampaign?.id}`, {
        credentials: "include",
        headers: { "x-workspace-id": activeWorkspace?.id || "" }
      });
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
    enabled: !!selectedCampaign?.id && !!activeWorkspace?.id,
  });

  const { data: conversationDetail } = useQuery<NudgeConversationWithMessages>({
    queryKey: ["/api/nudge/conversations", selectedConversation?.id],
    queryFn: async () => {
      const res = await fetch(`/api/nudge/conversations/${selectedConversation?.id}`, {
        credentials: "include",
        headers: { "x-workspace-id": activeWorkspace?.id || "" }
      });
      if (!res.ok) throw new Error("Failed to fetch conversation");
      return res.json();
    },
    enabled: !!selectedConversation?.id && !!activeWorkspace?.id,
  });

  const toggleCampaignMutation = useMutation({
    mutationFn: async ({ campaignId, status }: { campaignId: string; status: string }) => {
      return apiRequest("PATCH", `/api/nudge/campaigns/${campaignId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nudge/campaigns"] });
      toast({ title: "Campaign status updated" });
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      return apiRequest("DELETE", `/api/nudge/campaigns/${campaignId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nudge/campaigns"] });
      setSelectedCampaign(null);
      toast({ title: "Campaign deleted" });
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      return apiRequest("DELETE", `/api/nudge/conversations/${conversationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nudge/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nudge/campaigns"] });
      setSelectedConversation(null);
      toast({ title: "Conversation deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete conversation", description: error.message, variant: "destructive" });
    },
  });

  if (!activeWorkspace) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Please select a workspace</p>
      </div>
    );
  }

  // Show Coming Soon for non-admin users
  if (!isAppAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Hand className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Nudge AI Agent</CardTitle>
            <CardDescription className="text-base">
              AI-powered SMS conversations to collect guest feedback after checkout
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <Badge variant="secondary" className="text-sm px-4 py-1">
              Coming Soon
            </Badge>
            <p className="text-sm text-muted-foreground">
              This feature is currently in testing and will be available soon. 
              Stay tuned for updates!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-80 border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold flex items-center gap-2">
              <Hand className="w-5 h-5" />
              Nudge
            </h2>
            <Button 
              size="sm" 
              onClick={() => {
                setEditingCampaign(null);
                setShowCreateDialog(true);
              }}
              data-testid="button-new-campaign"
            >
              <Plus className="w-4 h-4 mr-1" />
              New
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            AI-powered SMS conversations to collect guest feedback
          </p>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {campaignsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : campaigns?.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-4">No campaigns yet</p>
                <Button 
                  size="sm"
                  onClick={() => setShowCreateDialog(true)}
                  data-testid="button-create-first-campaign"
                >
                  Create your first campaign
                </Button>
              </div>
            ) : (
              campaigns?.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  onSelect={() => {
                    setSelectedCampaign(campaign);
                    setSelectedConversation(null);
                  }}
                  onEdit={() => {
                    setEditingCampaign(campaign);
                    setShowCreateDialog(true);
                  }}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
      
      {selectedCampaign ? (
        <div className="flex-1 flex overflow-hidden">
          <div className="w-80 border-r flex flex-col">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold truncate">{selectedCampaign.name}</h3>
                <div className="flex items-center gap-1">
                  {selectedCampaign.status === 'active' ? (
                    <Button 
                      size="icon" 
                      variant="ghost"
                      onClick={() => toggleCampaignMutation.mutate({ 
                        campaignId: selectedCampaign.id, 
                        status: 'paused' 
                      })}
                      data-testid="button-pause-campaign"
                    >
                      <Pause className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button 
                      size="icon" 
                      variant="ghost"
                      onClick={() => toggleCampaignMutation.mutate({ 
                        campaignId: selectedCampaign.id, 
                        status: 'active' 
                      })}
                      data-testid="button-activate-campaign"
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                  )}
                  <Button 
                    size="icon" 
                    variant="ghost"
                    onClick={() => setShowTestDialog(true)}
                    title="Send test to yourself"
                    data-testid="button-test-campaign"
                  >
                    <Phone className="w-4 h-4" />
                  </Button>
                  <Button 
                    size="icon" 
                    variant="ghost"
                    onClick={() => setShowStartDialog(true)}
                    title="Start new conversation"
                    data-testid="button-start-new-conversation"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <StatusBadge status={selectedCampaign.status} />
            </div>
            
            <ScrollArea className="flex-1">
              <div className="divide-y">
                {conversationsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : conversations?.length === 0 ? (
                  <div className="text-center py-8 px-4">
                    <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">No conversations yet</p>
                    <Button 
                      size="sm"
                      onClick={() => setShowStartDialog(true)}
                      data-testid="button-start-first-conversation"
                    >
                      Start a conversation
                    </Button>
                  </div>
                ) : (
                  conversations?.map((conv) => (
                    <div
                      key={conv.id}
                      className={`p-4 cursor-pointer hover-elevate ${
                        selectedConversation?.id === conv.id ? 'bg-muted' : ''
                      }`}
                      onClick={() => setSelectedConversation(conv as NudgeConversationWithMessages)}
                      data-testid={`conversation-${conv.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{conv.guestName || "Guest"}</div>
                          <div className="text-sm text-muted-foreground truncate">
                            {formatPhone(conv.guestPhone)}
                          </div>
                          {conv.listingName && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <Building2 className="w-3 h-3" />
                              <span className="truncate">{conv.listingName}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <StatusBadge status={conv.status} />
                          <SentimentBadge sentiment={conv.sentiment} />
                        </div>
                      </div>
                      {conv.messageCount && conv.messageCount > 0 && (
                        <div className="text-xs text-muted-foreground mt-2">
                          {conv.messageCount} messages
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
          
          <div className="flex-1 flex flex-col">
            {conversationDetail ? (
              <ConversationDetail 
                conversation={conversationDetail}
                onClose={() => setSelectedConversation(null)}
                onDelete={() => {
                  if (confirm("Are you sure you want to delete this conversation?")) {
                    deleteConversationMutation.mutate(conversationDetail.id);
                  }
                }}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <MessageSquare className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Select a conversation to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <Hand className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Guest Feedback Nudge</h3>
            <p className="text-muted-foreground mb-6">
              Create AI-powered SMS campaigns that have natural conversations with your guests 
              to collect valuable feedback after their stay.
            </p>
            <Button onClick={() => setShowCreateDialog(true)} data-testid="button-get-started">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Campaign
            </Button>
          </div>
        </div>
      )}
      
      <CreateCampaignDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) setEditingCampaign(null);
        }}
        editingCampaign={editingCampaign}
        onCampaignCreated={(campaign) => {
          // Auto-select the new campaign so user can see it immediately
          setSelectedCampaign(campaign as NudgeCampaignWithStats);
        }}
      />
      
      {selectedCampaign && (
        <>
          <StartConversationDialog
            open={showStartDialog}
            onOpenChange={setShowStartDialog}
            campaign={selectedCampaign}
          />
          <TestCampaignDialog
            open={showTestDialog}
            onOpenChange={setShowTestDialog}
            campaign={selectedCampaign}
          />
        </>
      )}
    </div>
  );
}
