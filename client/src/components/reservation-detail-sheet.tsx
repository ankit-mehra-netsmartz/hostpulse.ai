import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare, ChevronUp, ChevronDown, Building2, Star } from "lucide-react";

interface ConversationMessage {
  id?: string;
  sender: "guest" | "host";
  message: string;
  timestamp?: string;
}

interface ReservationDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: any;
  listing?: {
    name?: string;
    address?: string;
    imageUrl?: string;
  } | null;
}

function getTagColor(sentiment?: string) {
  switch (sentiment?.toLowerCase()) {
    case 'positive':
      return 'bg-green-500/20 text-green-500 border-green-500/30';
    case 'negative':
      return 'bg-red-500/20 text-red-500 border-red-500/30';
    default:
      return 'bg-amber-500/20 text-amber-500 border-amber-500/30';
  }
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  try {
    return format(new Date(date), "MMM d, yyyy");
  } catch {
    return "-";
  }
}

export function ReservationDetailSheet({ 
  open, 
  onOpenChange, 
  reservation,
  listing: propListing
}: ReservationDetailSheetProps) {
  const [showConversation, setShowConversation] = useState(false);
  const [conversationFilter, setConversationFilter] = useState<"both" | "host" | "guest">("both");

  const { data: fetchedListing } = useQuery<any>({
    queryKey: ["/api/listings", reservation?.listingId],
    enabled: !!reservation?.listingId && !propListing && open,
  });

  const listing = propListing || fetchedListing;

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setShowConversation(false);
      setConversationFilter("both");
    }
    onOpenChange(newOpen);
  };

  if (!reservation) return null;

  const checkInDate = reservation.checkInDate || reservation.checkIn;
  const checkOutDate = reservation.checkOutDate || reservation.checkOut;
  const channel = reservation.platform || reservation.channel;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-xl md:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl">Reservation Details</SheetTitle>
        </SheetHeader>
        
        <div className="mt-6 space-y-6">
          <div className="flex items-center gap-3">
            <Avatar className="w-12 h-12 rounded-lg">
              {listing?.imageUrl && (
                <AvatarImage src={listing.imageUrl} alt={listing?.name} />
              )}
              <AvatarFallback className="rounded-lg bg-muted">
                <Building2 className="w-6 h-6 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{listing?.name || "Property"}</p>
              <p className="text-sm text-muted-foreground">{listing?.address || ""}</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Guest:</span>
                <span className="font-medium">{reservation.guestName || "Guest"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reservation ID:</span>
                <span className="font-mono text-primary">
                  {reservation.confirmationCode || reservation.externalId || "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Check in:</span>
                <span>{formatDate(checkInDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Check out:</span>
                <span>{formatDate(checkOutDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Channel:</span>
                <span>{channel || "-"}</span>
              </div>
            </CardContent>
          </Card>

          {reservation.tags && reservation.tags.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-3">Tags</h4>
              <div className="flex flex-wrap gap-2">
                {reservation.tags.map((tag: any) => (
                  <Badge 
                    key={tag.id}
                    className={getTagColor(tag.sentiment || undefined)}
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {reservation.conversationHistory && (reservation.conversationHistory as ConversationMessage[]).length > 0 && (
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
                    {(reservation.conversationHistory as ConversationMessage[]).length}
                  </Badge>
                </div>
                {showConversation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>

              {showConversation && (
                <div className="mt-4 space-y-4">
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
                  
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {(reservation.conversationHistory as ConversationMessage[])
                      .filter(msg => 
                        conversationFilter === "both" || 
                        (conversationFilter === "host" && msg.sender === "host") ||
                        (conversationFilter === "guest" && msg.sender !== "host")
                      )
                      .map((msg, idx) => (
                      <div key={msg.id || idx} className="flex gap-3">
                        <Avatar className="w-8 h-8 flex-shrink-0">
                          {msg.sender !== 'host' && reservation.guestProfilePicture && (
                            <AvatarImage src={reservation.guestProfilePicture} alt={reservation.guestName || "Guest"} />
                          )}
                          <AvatarFallback className={msg.sender === 'host' ? 'bg-primary text-primary-foreground' : 'bg-muted'}>
                            {msg.sender === 'host' ? 'H' : (reservation.guestName || "G").slice(0, 1).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-xs">
                              {msg.sender === 'host' ? 'Host' : reservation.guestName || 'Guest'}
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

          {reservation.publicReview && (
            <div>
              <h4 className="text-sm font-medium mb-3">Public review</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={reservation.guestProfilePicture || undefined} alt={reservation.guestName || "Guest"} />
                    <AvatarFallback className="text-xs">
                      {(reservation.guestName || "G").substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-sm">{reservation.guestName || "Guest"}</span>
                  {reservation.guestRating && (
                    <div className="flex items-center gap-0.5">
                      <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                      <span className="text-sm font-medium">{reservation.guestRating}</span>
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{reservation.publicReview}</p>
              </div>
            </div>
          )}

          {reservation.privateRemarks && (
            <div>
              <h4 className="text-sm font-medium mb-2">Private Remark</h4>
              <p className="text-sm text-muted-foreground">{reservation.privateRemarks}</p>
            </div>
          )}

          {reservation.hostReply && (
            <div>
              <h4 className="text-sm font-medium mb-2">Host review reply</h4>
              <div className="flex items-start gap-3">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="text-xs bg-primary/10">
                    <Building2 className="w-4 h-4 text-primary" />
                  </AvatarFallback>
                </Avatar>
                <p className="text-sm text-muted-foreground flex-1">{reservation.hostReply}</p>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
