import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isAfter, isBefore, isWithinInterval, differenceInMinutes, differenceInHours, differenceInDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  MessageSquare,
  Home,
  Mail,
  MailOpen,
  Building2,
  Inbox as InboxIcon,
  MessageCircle,
  RefreshCw,
  ArrowLeft,
  Filter,
  X
} from "lucide-react";
import { SiAirbnb } from "react-icons/si";
import type { Reservation, ConversationMessage, Listing, Tag } from "@shared/schema";

interface ConversationPreview {
  id: string;
  guestName: string | null;
  guestEmail: string | null;
  guestProfilePicture: string | null;
  confirmationCode: string | null;
  checkIn: string | null;
  checkOut: string | null;
  status: string | null;
  platform: string;
  listingId: string;
  listing: { id: string; name: string; internalName: string | null; imageUrl: string | null } | null;
  tags: Tag[];
  messageCount: number;
  lastMessage: {
    content: string;
    timestamp: string;
    senderType: string;
  } | null;
}

interface ConversationsResponse {
  conversations: ConversationPreview[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

interface ReservationWithDetails extends Reservation {
  listing?: Listing;
  tags?: Tag[];
}

type StayPhase = "before" | "during" | "after" | "inquiry";

function getStayPhaseFromPreview(conv: ConversationPreview): StayPhase {
  const now = new Date();
  const checkIn = conv.checkIn ? new Date(conv.checkIn) : null;
  const checkOut = conv.checkOut ? new Date(conv.checkOut) : null;
  
  if (conv.status === "inquiry") return "inquiry";
  if (!checkIn || !checkOut) return "inquiry";
  
  if (isBefore(now, checkIn)) return "before";
  if (isAfter(now, checkOut)) return "after";
  if (isWithinInterval(now, { start: checkIn, end: checkOut })) return "during";
  
  return "after";
}

function getStayPhase(reservation: ReservationWithDetails): StayPhase {
  const now = new Date();
  const checkIn = reservation.checkInDate ? new Date(reservation.checkInDate) : null;
  const checkOut = reservation.checkOutDate ? new Date(reservation.checkOutDate) : null;
  
  if (reservation.status === "inquiry") return "inquiry";
  if (!checkIn || !checkOut) return "inquiry";
  
  if (isBefore(now, checkIn)) return "before";
  if (isAfter(now, checkOut)) return "after";
  if (isWithinInterval(now, { start: checkIn, end: checkOut })) return "during";
  
  return "after";
}

function getStayPhaseLabel(phase: StayPhase): string {
  switch (phase) {
    case "before": return "Upcoming";
    case "during": return "Staying";
    case "after": return "Past";
    case "inquiry": return "Inquiry";
  }
}

function getStayPhaseBadge(phase: StayPhase) {
  switch (phase) {
    case "before":
      return <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30">Future</Badge>;
    case "during":
      return <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">Current</Badge>;
    case "after":
      return <Badge className="bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30">Past</Badge>;
    case "inquiry":
      return <Badge className="bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30">Inquiry</Badge>;
  }
}

function getStayPhaseInlineBadge(phase: StayPhase) {
  const base = "text-[11px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 whitespace-nowrap";
  switch (phase) {
    case "before":
      return <span className={`${base} bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400`} data-testid="badge-status-upcoming">Upcoming</span>;
    case "during":
      return <span className={`${base} bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400`} data-testid="badge-status-staying">Staying</span>;
    case "after":
      return <span className={`${base} bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400`} data-testid="badge-status-past">Past</span>;
    case "inquiry":
      return <span className={`${base} bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400`} data-testid="badge-status-inquiry">Inquiry</span>;
  }
}

function ChannelIcon({ platform, className }: { platform: string; className?: string }) {
  const p = platform?.toLowerCase() || "";
  if (p.includes("airbnb")) {
    return <SiAirbnb className={className || "h-4 w-4"} style={{ color: "#FF5A5F" }} />;
  }
  if (p.includes("vrbo") || p.includes("homeaway")) {
    return (
      <svg className={className || "h-4 w-4"} viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#3B5998"/>
        <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">V</text>
      </svg>
    );
  }
  if (p.includes("direct")) {
    return <Mail className={className || "h-4 w-4"} />;
  }
  return <Home className={className || "h-4 w-4"} />;
}

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const mins = differenceInMinutes(now, date);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hrs = differenceInHours(now, date);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  const days = differenceInDays(now, date);
  if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
  return format(date, "MMM d");
}


function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}


function needsReplyPreview(conv: ConversationPreview): boolean {
  return conv.lastMessage?.senderType === "guest";
}

function ConversationPreviewItem({
  conversation,
  onClick,
}: {
  conversation: ConversationPreview;
  onClick: () => void;
}) {
  const phase = getStayPhaseFromPreview(conversation);
  const propertyName = conversation.listing?.internalName || conversation.listing?.name || "Unknown Property";
  
  const timeAgo = conversation.lastMessage ? formatTimeAgo(conversation.lastMessage.timestamp) : null;

  return (
    <div
      data-testid={`inbox-conversation-${conversation.id}`}
      onClick={onClick}
      className="px-3 sm:px-5 py-3 cursor-pointer transition-colors hover-elevate border-b"
    >
      <div
        className="grid items-center gap-2 sm:gap-3"
        style={{ gridTemplateColumns: "auto 1fr 1fr auto" }}
      >
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={conversation.guestProfilePicture || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary text-sm">
            {getInitials(conversation.guestName)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 overflow-hidden">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm truncate" data-testid={`text-guest-name-${conversation.id}`}>
              {conversation.guestName || "Unknown Guest"}
            </span>
            <ChannelIcon platform={conversation.platform} className="h-3.5 w-3.5 shrink-0" />
          </div>
          <p className="text-xs text-muted-foreground truncate" data-testid={`text-message-preview-${conversation.id}`}>
            {conversation.lastMessage?.content || "No messages yet"}
          </p>
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="h-8 w-8 rounded-md shrink-0">
            <AvatarImage src={conversation.listing?.imageUrl || undefined} className="object-cover rounded-md" />
            <AvatarFallback className="rounded-md bg-muted text-muted-foreground text-xs">
              <Building2 className="h-3.5 w-3.5" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            {getStayPhaseInlineBadge(phase)}
            <span className="text-xs text-muted-foreground truncate block mt-0.5" title={propertyName} data-testid={`text-property-name-${conversation.id}`}>
              {propertyName}
            </span>
          </div>
        </div>

        <span className="text-xs text-rose-400 dark:text-rose-300 whitespace-nowrap text-right min-w-[80px]" data-testid={`text-time-ago-${conversation.id}`}>
          {timeAgo || ""}
        </span>
      </div>
    </div>
  );
}

function MessageThread({ messages, timezone }: { messages: ConversationMessage[]; timezone: string }) {
  if (!messages || messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No messages in this conversation</p>
        </div>
      </div>
    );
  }

  let lastDate = "";
  
  return (
    <ScrollArea className="flex-1 p-4">
      <div className="space-y-4 max-w-3xl mx-auto">
        {messages.map((msg, idx) => {
          const msgDate = formatInTimeZone(new Date(msg.timestamp), timezone, "MMMM d, yyyy");
          const showDateHeader = msgDate !== lastDate;
          lastDate = msgDate;
          
          const isHost = msg.sender === "host";
          
          return (
            <div key={msg.id || idx}>
              {showDateHeader && (
                <div className="flex items-center justify-center my-4">
                  <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                    {msgDate}
                  </span>
                </div>
              )}
              
              <div className={`flex ${isHost ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[70%] rounded-lg p-3 ${
                    isHost
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium">
                      {isHost ? "You" : "Guest"}
                    </span>
                    <span className="text-xs opacity-70">
                      {formatInTimeZone(new Date(msg.timestamp), timezone, "h:mm a")}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function AtAGlancePanel({ reservation }: { reservation: ReservationWithDetails }) {
  const phase = getStayPhase(reservation);
  const checkIn = reservation.checkInDate ? new Date(reservation.checkInDate) : null;
  const checkOut = reservation.checkOutDate ? new Date(reservation.checkOutDate) : null;
  const nights = checkIn && checkOut ? Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  
  return (
    <div className="border-l bg-card overflow-y-auto shrink-0 w-[340px]" data-testid="at-a-glance-panel">
      <div className="p-4">
        <h3 className="font-semibold mb-4">At a glance</h3>
        
        <div className="flex items-center justify-center gap-1 mb-4">
          <span className={`px-3 py-1 text-xs rounded ${phase === "before" ? "bg-blue-500/20 text-blue-600" : "bg-muted text-muted-foreground"}`}>
            BEFORE
          </span>
          <span className={`px-3 py-1 text-xs rounded ${phase === "during" ? "bg-green-500/20 text-green-600" : "bg-muted text-muted-foreground"}`}>
            DURING
          </span>
          <span className={`px-3 py-1 text-xs rounded ${phase === "after" ? "bg-gray-500/20 text-gray-600" : "bg-muted text-muted-foreground"}`}>
            AFTER
          </span>
        </div>
        
        <div className="text-center mb-4">
          {checkIn && checkOut && (
            <span className="text-sm font-medium">
              {format(checkIn, "MMM d")} - {format(checkOut, "MMM d")}
            </span>
          )}
        </div>
        
        <Separator className="my-4" />
        
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageCircle className="h-4 w-4" />
            <span>AI Summary</span>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-sm">
            {reservation.aiGuestSummary || (
              <span className="text-muted-foreground italic">
                Conversation summary will appear here after AI analysis
              </span>
            )}
          </div>
        </div>
        
        <Separator className="my-4" />
        
        <div className="mb-2 text-sm font-medium">About</div>
        
        <Tabs defaultValue="booking" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="booking" data-testid="tab-glance-booking">Booking</TabsTrigger>
            <TabsTrigger value="contact" data-testid="tab-glance-contact">Contact</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="mt-4 space-y-4">
          <div className="flex items-start gap-3">
            <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium">{reservation.listing?.name || "Unknown Property"}</div>
              <div className="text-xs text-muted-foreground">{reservation.listing?.address || ""}</div>
            </div>
          </div>
          
          <Separator />
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Check-in date</div>
              <div>{checkIn ? format(checkIn, "MMM d, yyyy") : "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Check-in time</div>
              <div>{checkIn ? format(checkIn, "h:mm a") : "—"}</div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Checkout date</div>
              <div>{checkOut ? format(checkOut, "MMM d, yyyy") : "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Checkout time</div>
              <div>{checkOut ? format(checkOut, "h:mm a") : "—"}</div>
            </div>
          </div>
          
          <Separator />
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Reservation status</div>
              <div className="flex items-center gap-2">
                {getStayPhaseBadge(phase)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Booking channel</div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                {reservation.platform || "Airbnb"}
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Number of nights</div>
              <div>{nights} nights</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Confirmation code</div>
              <div>{reservation.confirmationCode || "—"}</div>
            </div>
          </div>
        </div>
        
        {reservation.tags && reservation.tags.length > 0 && (
          <>
            <Separator className="my-4" />
            <div className="mb-2 text-sm font-medium">Conversation Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {reservation.tags.slice(0, 5).map((tag) => (
                <Badge
                  key={tag.id}
                  variant="outline"
                  className={`text-xs ${
                    tag.sentiment === "positive"
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                      : tag.sentiment === "negative"
                      ? "bg-red-500/10 text-red-600 border-red-500/30"
                      : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                  }`}
                >
                  {tag.name}
                </Badge>
              ))}
              {reservation.tags.length > 5 && (
                <Badge variant="outline" className="text-xs">
                  +{reservation.tags.length - 5} more
                </Badge>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function InboxPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "todo" | "followup" | "done">("all");
  const [sortOrder, setSortOrder] = useState<"recent" | "oldest">("recent");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");

  const [allConversations, setAllConversations] = useState<ConversationPreview[]>([]);
  const [pagination, setPagination] = useState<{ total: number; hasMore: boolean; offset: number }>({ total: 0, hasMore: false, offset: 0 });
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();
  
  const { data: conversationsData, isLoading, refetch: refetchConversations } = useQuery<ConversationsResponse>({
    queryKey: ["/api/inbox/conversations"],
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });

  useEffect(() => {
    if (conversationsData && allConversations.length === 0) {
      setAllConversations(conversationsData.conversations);
      setPagination({
        total: conversationsData.pagination.total,
        hasMore: conversationsData.pagination.hasMore,
        offset: conversationsData.pagination.offset,
      });
    }
  }, [conversationsData]);
  
  const refreshConversations = async () => {
    setIsRefreshing(true);
    try {
      const result = await refetchConversations();
      if (result.data) {
        setAllConversations(result.data.conversations);
        setPagination({
          total: result.data.pagination.total,
          hasMore: result.data.pagination.hasMore,
          offset: result.data.pagination.offset,
        });
      } else if (result.error) {
        toast({
          title: "Failed to refresh",
          description: "Could not refresh conversations. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Connection error",
        description: "Failed to connect to the server. Please check your connection.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };
  
  const loadMore = async () => {
    if (isLoadingMore || !pagination.hasMore) return;
    setIsLoadingMore(true);
    try {
      const newOffset = allConversations.length;
      const response = await fetch(`/api/inbox/conversations?offset=${newOffset}&limit=20`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data: ConversationsResponse = await response.json();
        setAllConversations(prev => [...prev, ...data.conversations]);
        setPagination({
          total: data.pagination.total,
          hasMore: data.pagination.hasMore,
          offset: data.pagination.offset,
        });
      } else {
        toast({
          title: "Failed to load more",
          description: "Could not load additional conversations. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Connection error",
        description: "Failed to connect to the server. Please check your connection.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingMore(false);
    }
  };

  const { data: selectedConversationFull, isLoading: isLoadingConversation } = useQuery<ReservationWithDetails>({
    queryKey: ["/api/inbox/conversations", selectedConversationId],
    queryFn: async () => {
      const res = await fetch(`/api/inbox/conversations/${selectedConversationId}`, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to load conversation");
      return res.json();
    },
    enabled: !!selectedConversationId,
  });

  const { data: userProfile } = useQuery<{ timezone?: string }>({
    queryKey: ["/api/user/profile"],
  });
  
  const userTimezone = userProfile?.timezone || "America/New_York";

  const uniqueProperties = useMemo(() => {
    const map = new Map<string, string>();
    allConversations.forEach(c => {
      if (c.listing) {
        map.set(c.listingId, c.listing.internalName || c.listing.name);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allConversations]);

  const uniqueChannels = useMemo(() => {
    const set = new Set<string>();
    allConversations.forEach(c => {
      if (c.platform) set.add(c.platform);
    });
    return Array.from(set).sort();
  }, [allConversations]);

  const activeFilterCount = (propertyFilter !== "all" ? 1 : 0) + (channelFilter !== "all" ? 1 : 0);

  const filteredConversations = useMemo(() => {
    if (!allConversations) return [];
    
    let filtered = [...allConversations];
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.guestName?.toLowerCase().includes(query) ||
          c.guestEmail?.toLowerCase().includes(query) ||
          c.confirmationCode?.toLowerCase().includes(query) ||
          c.listing?.name?.toLowerCase().includes(query) ||
          c.listing?.internalName?.toLowerCase().includes(query)
      );
    }

    if (propertyFilter !== "all") {
      filtered = filtered.filter(c => c.listingId === propertyFilter);
    }

    if (channelFilter !== "all") {
      filtered = filtered.filter(c => c.platform === channelFilter);
    }
    
    if (statusFilter === "todo") {
      filtered = filtered.filter((c) => needsReplyPreview(c));
    } else if (statusFilter === "done") {
      filtered = filtered.filter((c) => !needsReplyPreview(c));
    }
    
    if (sortOrder === "oldest") {
      filtered.sort((a, b) => {
        const aTime = a.lastMessage ? new Date(a.lastMessage.timestamp).getTime() : 0;
        const bTime = b.lastMessage ? new Date(b.lastMessage.timestamp).getTime() : 0;
        return aTime - bTime;
      });
    }
    
    return filtered;
  }, [allConversations, searchQuery, statusFilter, sortOrder, propertyFilter, channelFilter]);

  const conversationCount = filteredConversations.length;
  const todoCount = allConversations?.filter((c) => needsReplyPreview(c)).length || 0;

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-4rem)] p-6 space-y-4" data-testid="inbox-page">
        <Skeleton className="h-10 w-48" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (selectedConversationId) {
    return (
      <div className="flex h-[calc(100vh-4rem)] bg-background" data-testid="inbox-page">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-3 border-b bg-card flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedConversationId(null)}
              data-testid="button-back-to-inbox"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              All Messages
            </Button>

            {selectedConversationFull && (
              <div className="flex items-center gap-3 ml-2">
                <Separator orientation="vertical" className="h-6" />
                <Avatar className="h-8 w-8">
                  <AvatarImage src={selectedConversationFull.guestProfilePicture || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {getInitials(selectedConversationFull.guestName)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <span className="font-medium text-sm" data-testid="text-conversation-guest-name">
                    {selectedConversationFull.guestName || "Unknown Guest"}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2" data-testid="text-conversation-listing-name">
                    {selectedConversationFull.listing?.name || ""}
                  </span>
                </div>
              </div>
            )}
          </div>

          {isLoadingConversation ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
                <p>Loading conversation...</p>
              </div>
            </div>
          ) : selectedConversationFull ? (
            <>
              <MessageThread messages={selectedConversationFull.conversationHistory || []} timezone={userTimezone} />
              
              <div className="px-4 py-3 border-t bg-muted/30">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MailOpen className="h-4 w-4" />
                  <span>Read-only inbox. Messages are synced from your property management system.</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <p>Conversation not found</p>
            </div>
          )}
        </div>

        {selectedConversationFull && (
          <AtAGlancePanel reservation={selectedConversationFull} />
        )}
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-background" data-testid="inbox-page">
      <div className="px-6 pt-5 pb-4 border-b bg-card">
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <h2 className="text-xl font-semibold flex items-center gap-2" data-testid="text-inbox-title">
            <InboxIcon className="h-5 w-5" />
            Inbox
          </h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={refreshConversations}
              disabled={isRefreshing}
              title="Refresh conversations"
              data-testid="button-refresh-inbox"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Badge variant="secondary">{conversationCount} conversations</Badge>
          </div>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="inbox-search"
              placeholder="Search by guest name, email, reservation code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <TabsList>
              <TabsTrigger value="all" data-testid="inbox-filter-all">All</TabsTrigger>
              <TabsTrigger value="todo" data-testid="inbox-filter-todo" className="relative">
                Todo
                {todoCount > 0 && (
                  <span className="ml-1 text-xs bg-red-500 text-white rounded-full px-1.5">{todoCount}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="done" data-testid="inbox-filter-done">Done</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <Select value={propertyFilter} onValueChange={setPropertyFilter}>
            <SelectTrigger className="w-[200px]" data-testid="select-property-filter">
              <Building2 className="h-3.5 w-3.5 mr-1.5 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="All Properties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Properties</SelectItem>
              {uniqueProperties.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-[170px]" data-testid="select-channel-filter">
              <MessageCircle className="h-3.5 w-3.5 mr-1.5 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="All Channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              {uniqueChannels.map((ch) => (
                <SelectItem key={ch} value={ch}>
                  {ch.charAt(0).toUpperCase() + ch.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setPropertyFilter("all"); setChannelFilter("all"); }}
              data-testid="button-clear-filters"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear filters
            </Button>
          )}
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        {filteredConversations.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg font-medium mb-1">No conversations found</p>
            <p className="text-sm">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredConversations.map((conversation) => (
              <ConversationPreviewItem
                key={conversation.id}
                conversation={conversation}
                onClick={() => setSelectedConversationId(conversation.id)}
              />
            ))}
            {pagination.hasMore && (
              <div className="p-4 text-center">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  data-testid="button-load-more"
                >
                  {isLoadingMore ? "Loading..." : `Load more (${allConversations.length} of ${pagination.total})`}
                </Button>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
