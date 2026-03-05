import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { ReservationFrequencyChart } from "@/components/reservation-frequency-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TagDetailSheet } from "@/components/tag-detail-sheet";
import { 
  Calendar,
  Search,
  Building2,
  MessageSquare,
  Star,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Home,
  MessageCircle,
  Loader2
} from "lucide-react";
import type { Reservation, Tag, Listing, ConversationMessage } from "@shared/schema";

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
}

interface TagWithDetails extends Tag {
  listing?: Listing;
  reservation?: Reservation;
}

interface ReservationWithTags extends Reservation {
  tags?: Tag[];
  listing?: Listing;
}

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getTagColor(sentiment?: string): string {
  switch (sentiment) {
    case "positive":
      return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
    case "negative":
      return "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30";
    case "neutral":
    default:
      return "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30";
  }
}

const sentimentConfig = {
  positive: { color: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  negative: { color: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30" },
  neutral: { color: "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30" },
};

interface ReservationChartDataPoint {
  weekStart: string;
  count: number;
}

export default function ReservationsPage() {
  const [selectedReservation, setSelectedReservation] = useState<ReservationWithTags | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  
  const [propertyFilter, setPropertyFilter] = useState("all");
  
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);
  const [tagSheetOpen, setTagSheetOpen] = useState(false);
  const [showConversation, setShowConversation] = useState(false);
  const [conversationFilter, setConversationFilter] = useState<"both" | "host" | "guest">("both");
  
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { data: chartResponse, isLoading: chartLoading } = useQuery<{
    chartData: ReservationChartDataPoint[];
  }>({
    queryKey: ["/api/reservations/chart-data", "365"],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/chart-data?days=365`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch chart data");
      return res.json();
    },
  });

  const {
    data: reservationsData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<PaginatedResponse<ReservationWithTags>>({
    queryKey: ["/api/reservations"],
    queryFn: async ({ pageParam = 0 }) => {
      const res = await fetch(`/api/reservations?limit=50&offset=${pageParam}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch reservations");
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextOffset : undefined,
  });

  // Flatten all pages into a single array
  const reservations = reservationsData?.pages.flatMap(page => page.items) ?? [];
  const totalCount = reservationsData?.pages[0]?.total ?? 0;

  // Intersection observer to load more when scrolling
  useEffect(() => {
    const currentRef = loadMoreRef.current;
    if (!currentRef) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(currentRef);

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, reservations.length]);

  const { data: listings = [] } = useQuery<Listing[]>({
    queryKey: ["/api/listings"],
  });
  
  const { data: tagWithDetails } = useQuery<TagWithDetails>({
    queryKey: ["/api/tags", selectedTag?.id],
    enabled: !!selectedTag?.id && tagSheetOpen,
  });

  const handleTagClick = (tag: Tag, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTag(tag);
    setTagSheetOpen(true);
    setShowConversation(false);
  };

  const listingsMap = new Map(listings.map(l => [l.id, l]));

  const uniqueChannels = Array.from(new Set(reservations.map(r => r.platform)));
  const uniqueStatuses = Array.from(new Set(reservations.map(r => r.status)));

  const filteredReservations = useMemo(() => {
    return reservations.filter(reservation => {
      const guestName = reservation.guestName || "";
      const reservationId = reservation.confirmationCode || reservation.externalId || "";
      const matchesSearch = searchQuery === "" || 
        guestName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        reservationId.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesChannel = channelFilter === "all" || reservation.platform === channelFilter;
      const matchesStatus = statusFilter === "all" || reservation.status === statusFilter;
      const matchesProperty = propertyFilter === "all" || reservation.listingId === propertyFilter;
      
      return matchesSearch && matchesChannel && matchesStatus && matchesProperty;
    });
  }, [reservations, searchQuery, channelFilter, statusFilter, propertyFilter]);

  const selectedListing = selectedReservation ? listingsMap.get(selectedReservation.listingId) : null;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Reservations</h1>
          <p className="text-muted-foreground">
            View all reservations across your properties
          </p>
        </div>

        <ReservationFrequencyChart
          data={chartResponse?.chartData || []}
          isLoading={chartLoading}
        />

        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by guest or reservation ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-reservation-search"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={propertyFilter} onValueChange={setPropertyFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-property">
                <SelectValue placeholder="All properties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All properties</SelectItem>
                {listings.map(listing => (
                  <SelectItem key={listing.id} value={listing.id}>{listing.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-channel">
                <SelectValue placeholder="All channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                {uniqueChannels.map(channel => (
                  <SelectItem key={channel} value={channel}>{channel}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {uniqueStatuses.map(status => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filteredReservations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Calendar className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                {reservations.length === 0 
                  ? "No reservations synced yet. Import properties to see reservation data."
                  : "No reservations match your filters."
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Reservation ID</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead>Check Out</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReservations.map((reservation) => {
                  const listing = listingsMap.get(reservation.listingId);
                  return (
                    <TableRow 
                      key={reservation.id}
                      className="cursor-pointer hover-elevate"
                      onClick={() => {
                      setSelectedReservation(reservation);
                      setShowConversation(false);
                    }}
                      data-testid={`row-reservation-${reservation.id}`}
                    >
                      <TableCell>
                        <Link href={`/listings/${reservation.listingId}?tab=reservations`} onClick={(e) => e.stopPropagation()}>
                          <Avatar className="w-10 h-10 rounded-md">
                            <AvatarImage src={listing?.imageUrl || undefined} alt={listing?.name || "Property"} />
                            <AvatarFallback className="rounded-md bg-muted">
                              <Building2 className="w-5 h-5 text-muted-foreground" />
                            </AvatarFallback>
                          </Avatar>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={reservation.guestProfilePicture || undefined} alt={reservation.guestName || "Guest"} />
                            <AvatarFallback className="text-xs">
                              {(reservation.guestName || "G").substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{reservation.guestName || "Guest"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm text-muted-foreground">
                              {reservation.confirmationCode || reservation.externalId || "-"}
                            </span>
                      </TableCell>
                      <TableCell>{reservation.platform}</TableCell>
                      <TableCell>{formatDate(reservation.checkInDate)}</TableCell>
                      <TableCell>{formatDate(reservation.checkOutDate)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {reservation.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs xl:max-w-md 2xl:max-w-lg">
                        <div className="flex flex-wrap gap-1">
                          {reservation.tags?.map((tag) => (
                            <Badge 
                              key={tag.id} 
                              className={`text-xs ${getTagColor(tag.sentiment || undefined)}`}
                            >
                              {tag.name}
                            </Badge>
                          ))}
                          {(!reservation.tags || reservation.tags.length === 0) && (
                            reservation.tagsProcessedAt ? (
                              <span className="text-muted-foreground text-xs italic">Analysis justified no tags</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
          
          {/* Load more status */}
          <div className="py-4 flex justify-center">
            {isFetchingNextPage && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading more reservations...</span>
              </div>
            )}
            {!hasNextPage && reservations.length > 0 && (
              <span className="text-sm text-muted-foreground">
                Showing all {totalCount} reservations
              </span>
            )}
          </div>
          </>
        )}
        
        {/* Hidden load more trigger - always rendered for intersection observer */}
        <div ref={loadMoreRef} className="h-1" />
      </div>

      <Sheet open={!!selectedReservation} onOpenChange={(open) => {
        if (!open) {
          setSelectedReservation(null);
          setShowConversation(false);
        }
      }}>
        <SheetContent className="sm:max-w-xl md:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-xl">Reservation Details</SheetTitle>
          </SheetHeader>
          
          {selectedReservation && selectedListing && (
            <div className="mt-6 space-y-6">
              <Link href={`/listings/${selectedListing.id}?tab=reservations`}>
                <div className="flex items-center gap-3 hover-elevate p-2 rounded-lg cursor-pointer">
                  <Avatar className="w-12 h-12 rounded-lg">
                    <AvatarImage src={selectedListing.imageUrl || undefined} alt={selectedListing.name} />
                    <AvatarFallback className="rounded-lg bg-muted">
                      <Building2 className="w-6 h-6 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold">{selectedListing.name}</p>
                    <p className="text-sm text-muted-foreground">{selectedListing.address}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </div>
              </Link>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Guest:</span>
                    <span className="font-medium">{selectedReservation.guestName || "Guest"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reservation ID:</span>
                    <span className="font-mono text-primary">
                      {selectedReservation.confirmationCode || selectedReservation.externalId || "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Check in:</span>
                    <span>{formatDate(selectedReservation.checkInDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Check out:</span>
                    <span>{formatDate(selectedReservation.checkOutDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Channel:</span>
                    <span>{selectedReservation.platform}</span>
                  </div>
                </CardContent>
              </Card>

              {(selectedReservation.tags && selectedReservation.tags.length > 0) ? (
                <div>
                  <h4 className="text-sm font-medium mb-3">Tags</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedReservation.tags.map((tag) => (
                      <Badge 
                        key={tag.id}
                        className={`cursor-pointer hover-elevate ${getTagColor(tag.sentiment || undefined)}`}
                        onClick={(e) => handleTagClick(tag, e)}
                        data-testid={`button-tag-${tag.id}`}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : selectedReservation.tagsProcessedAt ? (
                <div>
                  <h4 className="text-sm font-medium mb-3">Tags</h4>
                  <p className="text-sm text-muted-foreground italic">
                    Analysis justified no tags - this reservation had no guest reviews or meaningful conversation to generate tags from.
                  </p>
                </div>
              ) : null}

              {selectedReservation.conversationHistory && (selectedReservation.conversationHistory as ConversationMessage[]).length > 0 && (
                <div>
                  <div 
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-md cursor-pointer hover-elevate"
                    onClick={() => setShowConversation(!showConversation)}
                    data-testid="button-toggle-conversation-sheet"
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      <span className="font-medium text-sm">Conversation Thread</span>
                      <Badge variant="secondary" className="text-xs">
                        {(selectedReservation.conversationHistory as ConversationMessage[]).length}
                      </Badge>
                    </div>
                    {showConversation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>

                  {showConversation && (
                    <div className="mt-4 space-y-4">
                      {/* Filter Buttons */}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={conversationFilter === "both" ? "secondary" : "ghost"}
                          className="h-7 text-xs"
                          onClick={() => setConversationFilter("both")}
                          data-testid="button-filter-both"
                        >
                          Both
                        </Button>
                        <Button
                          size="sm"
                          variant={conversationFilter === "host" ? "secondary" : "ghost"}
                          className="h-7 text-xs"
                          onClick={() => setConversationFilter("host")}
                          data-testid="button-filter-host"
                        >
                          Host
                        </Button>
                        <Button
                          size="sm"
                          variant={conversationFilter === "guest" ? "secondary" : "ghost"}
                          className="h-7 text-xs"
                          onClick={() => setConversationFilter("guest")}
                          data-testid="button-filter-guest"
                        >
                          Guest
                        </Button>
                      </div>
                      
                      {/* Message List */}
                      <div className="space-y-3 max-h-80 overflow-y-auto">
                      {(selectedReservation.conversationHistory as ConversationMessage[])
                        .filter(msg => 
                          conversationFilter === "both" || 
                          (conversationFilter === "host" && msg.sender === "host") ||
                          (conversationFilter === "guest" && msg.sender !== "host")
                        )
                        .map((msg, idx) => (
                        <div key={msg.id || idx} className="flex gap-3">
                          <Avatar className="w-8 h-8 flex-shrink-0">
                            {msg.sender !== 'host' && selectedReservation.guestProfilePicture && (
                              <AvatarImage src={selectedReservation.guestProfilePicture} alt={selectedReservation.guestName || "Guest"} />
                            )}
                            <AvatarFallback className={msg.sender === 'host' ? 'bg-primary text-primary-foreground' : 'bg-muted'}>
                              {msg.sender === 'host' ? 'H' : (selectedReservation.guestName || "G").slice(0, 1).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-xs">
                                {msg.sender === 'host' ? 'Host' : selectedReservation.guestName || 'Guest'}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {msg.timestamp ? format(new Date(msg.timestamp), "MMM d, h:mm a") : ""}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{msg.message}</p>
                          </div>
                        </div>
                      ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedReservation.publicReview && (
                <div>
                  <h4 className="text-sm font-medium mb-3">Public review</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={selectedReservation.guestProfilePicture || undefined} alt={selectedReservation.guestName || "Guest"} />
                        <AvatarFallback className="text-xs">
                          {(selectedReservation.guestName || "G").substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm">{selectedReservation.guestName || "Guest"}</span>
                      <div className="flex items-center gap-0.5">
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                        <span className="text-sm font-medium">5</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{selectedReservation.publicReview}</p>
                  </div>
                </div>
              )}

              {selectedReservation.privateRemarks && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Private Remark</h4>
                  <p className="text-sm text-muted-foreground">{selectedReservation.privateRemarks}</p>
                </div>
              )}

              {selectedReservation.hostReply && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Host review reply</h4>
                  <div className="flex items-start gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="text-xs bg-primary/10">
                        <Building2 className="w-4 h-4 text-primary" />
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-sm text-muted-foreground flex-1">{selectedReservation.hostReply}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Tag Investigation Sheet */}
      <TagDetailSheet
        open={tagSheetOpen}
        onOpenChange={setTagSheetOpen}
        tag={tagWithDetails || selectedTag}
        listing={tagWithDetails?.listing || (selectedReservation?.listingId ? listingsMap.get(selectedReservation.listingId) : undefined)}
        reservation={tagWithDetails?.reservation || selectedReservation || undefined}
        relatedTags={selectedReservation?.tags}
      />
    </div>
  );
}
