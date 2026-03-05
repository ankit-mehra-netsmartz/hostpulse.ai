import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Loader2, CalendarDays, List, ChevronLeft, ChevronRight,
  CheckCircle2, Clock, MapPin, User, AlertTriangle
} from "lucide-react";
import { format, isToday, isTomorrow, isPast, startOfDay } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TurnoverItem {
  id: string;
  listingId: string;
  listingName: string;
  listingAddress: string | null;
  guestName: string | null;
  guestCheckoutTime: string | null;
  scheduledDate: string;
  status: string;
  cleanerAccepted: boolean | null;
  cleanerAcceptedAt: string | null;
  assignedMemberId: string | null;
  assignedMemberName: string | null;
  assignmentMode: string;
  reservationId: string | null;
  notes: string | null;
}

interface TeamMember {
  id: string;
  name: string;
}

interface TurnoversData {
  turnovers: TurnoverItem[];
  members: TeamMember[];
  isManager: boolean;
}

interface CalendarDayData {
  count: number;
  hasCheckoutOnly: boolean;
  hasSameDayTurnover: boolean;
  hasUnaccepted: boolean;
  tasks: Array<{
    id: string;
    listingName: string;
    guestName: string | null;
    status: string;
    isTurnover: boolean;
    cleanerAccepted: boolean | null;
  }>;
}

interface CalendarData {
  year: number;
  month: number;
  days: Record<string, CalendarDayData>;
}

type ViewMode = "calendar" | "list";
type ListFilter = "all" | "pending" | "accepted";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEE, MMM d");
}

function AcceptDialog({
  open,
  onOpenChange,
  turnover,
  members,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  turnover: TurnoverItem | null;
  members: TeamMember[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");

  const isManualMode = turnover?.assignmentMode === "manual";
  const isAutoMode = turnover?.assignmentMode === "auto";
  const alreadyAssigned = !!turnover?.assignedMemberId;
  const showMemberSelector = isManualMode && members.length > 0 && !alreadyAssigned;

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!turnover) return;
      let memberId: string | null = null;
      if (showMemberSelector && selectedMemberId && selectedMemberId !== "none") {
        memberId = selectedMemberId;
      }
      await apiRequest("PATCH", `/api/mobile/turnovers/${turnover.id}/accept`, {
        assignedMemberId: memberId,
      });
    },
    onSuccess: () => {
      toast({ title: "Turnover accepted" });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/my-turnovers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/calendar"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/dashboard"] });
      setSelectedMemberId("");
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to accept", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] rounded-lg">
        <DialogHeader>
          <DialogTitle data-testid="text-accept-dialog-title">Accept Turnover</DialogTitle>
          <DialogDescription>
            {turnover?.listingName} — {turnover?.scheduledDate ? format(new Date(turnover.scheduledDate), "MMM d, yyyy") : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {turnover?.guestName && (
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>Guest: {turnover.guestName}</span>
            </div>
          )}
          {turnover?.guestCheckoutTime && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>Checkout: {turnover.guestCheckoutTime}</span>
            </div>
          )}
          {isAutoMode && alreadyAssigned && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              <span>Auto-assigned to: {turnover?.assignedMemberName || "team member"}</span>
            </div>
          )}
          {showMemberSelector && (
            <div>
              <Label>Assign to team member</Label>
              <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                <SelectTrigger data-testid="select-assign-member">
                  <SelectValue placeholder="Select a cleaner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Assign later</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {isManualMode && members.length === 0 && !alreadyAssigned && (
            <div className="text-sm text-muted-foreground">
              You can assign a team member after accepting.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="btn-cancel-accept">
            Cancel
          </Button>
          <Button
            onClick={() => acceptMutation.mutate()}
            disabled={acceptMutation.isPending}
            data-testid="btn-confirm-accept"
          >
            {acceptMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TurnoverCalendar({ onSelectTask }: { onSelectTask: (task: TurnoverItem) => void }) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  const { data: calendarData, isLoading } = useQuery<CalendarData>({
    queryKey: [`/api/mobile/calendar?month=${monthKey}`],
  });

  const { data: turnoversData } = useQuery<TurnoversData>({
    queryKey: ["/api/mobile/my-turnovers"],
  });

  const turnoversMap = useMemo(() => {
    const map: Record<string, TurnoverItem> = {};
    if (turnoversData?.turnovers) {
      for (const t of turnoversData.turnovers) {
        map[t.id] = t;
      }
    }
    return map;
  }, [turnoversData]);

  const calendarGrid = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const grid: Array<{ day: number | null; dateKey: string | null }> = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      grid.push({ day: null, dateKey: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      grid.push({ day: d, dateKey });
    }
    return grid;
  }, [year, month]);

  const goToPrevMonth = () => { setCurrentDate(new Date(year, month - 2, 1)); setSelectedDate(null); };
  const goToNextMonth = () => { setCurrentDate(new Date(year, month, 1)); setSelectedDate(null); };
  const goToToday = () => { setCurrentDate(new Date()); setSelectedDate(null); };

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const selectedDayData = selectedDate && calendarData?.days?.[selectedDate] || null;

  return (
    <Card className="p-3" data-testid="turnovers-calendar">
      <div className="flex items-center justify-between gap-2 mb-3">
        <Button size="icon" variant="ghost" onClick={goToPrevMonth} data-testid="btn-prev-month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button className="text-sm font-semibold" onClick={goToToday} data-testid="btn-calendar-title">
          {format(new Date(year, month - 1), "MMMM yyyy")}
        </button>
        <Button size="icon" variant="ghost" onClick={goToNextMonth} data-testid="btn-next-month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-0 mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-0" data-testid="calendar-grid">
          {calendarGrid.map((cell, idx) => {
            if (cell.day === null) return <div key={`empty-${idx}`} className="aspect-square" />;
            const dayData = calendarData?.days?.[cell.dateKey!];
            const isCurrentDay = cell.dateKey === todayKey;
            const isSelected = cell.dateKey === selectedDate;

            let dotColor = "";
            if (dayData) {
              if (dayData.hasUnaccepted) {
                dotColor = "bg-red-500";
              } else if (dayData.hasSameDayTurnover) {
                dotColor = "bg-orange-500";
              } else if (dayData.hasCheckoutOnly) {
                dotColor = "bg-blue-500";
              }
            }

            return (
              <button
                key={cell.dateKey}
                onClick={() => dayData ? setSelectedDate(isSelected ? null : cell.dateKey!) : undefined}
                className={[
                  "aspect-square flex flex-col items-center justify-center rounded-md relative text-xs transition-colors",
                  isCurrentDay ? "font-bold ring-1 ring-primary/50" : "",
                  isSelected ? "bg-primary/10 dark:bg-primary/20" : "",
                  dayData ? "cursor-pointer" : "cursor-default",
                ].join(" ")}
                data-testid={`calendar-day-${cell.dateKey}`}
              >
                <span className={isCurrentDay ? "text-primary" : ""}>{cell.day}</span>
                {dayData && (
                  <div className="flex items-center gap-0.5 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                    {dayData.count > 1 && (
                      <span className="text-[8px] font-bold leading-none">{dayData.count}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-center gap-3 mt-3 pt-2 border-t flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-[10px] text-muted-foreground">Needs acceptance</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange-500" />
          <span className="text-[10px] text-muted-foreground">Turnover</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-[10px] text-muted-foreground">Checkout</span>
        </div>
      </div>

      {selectedDayData && (
        <div className="mt-3 pt-2 border-t space-y-2" data-testid="calendar-day-detail">
          <div className="text-xs font-medium text-muted-foreground">
            {format(new Date(selectedDate! + "T12:00:00"), "EEEE, MMM d")} — {selectedDayData.count} {selectedDayData.count === 1 ? "turn" : "turns"}
          </div>
          {selectedDayData.tasks.map((task) => {
            const turnoverDetail = turnoversMap[task.id];
            return (
              <div
                key={task.id}
                className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted/50 cursor-pointer hover-elevate"
                onClick={() => turnoverDetail && onSelectTask(turnoverDetail)}
                data-testid={`calendar-task-${task.id}`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  !task.cleanerAccepted ? "bg-red-500" : task.isTurnover ? "bg-orange-500" : "bg-blue-500"
                }`} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{task.listingName}</div>
                  {task.guestName && (
                    <div className="text-[10px] text-muted-foreground truncate">{task.guestName}</div>
                  )}
                </div>
                {!task.cleanerAccepted ? (
                  <Badge variant="destructive" className="text-[10px]">
                    Pending
                  </Badge>
                ) : (
                  <Badge variant={task.status === "completed" ? "default" : "secondary"} className="text-[10px]">
                    Accepted
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function TurnoverList({
  turnovers,
  members,
  filter,
  onAccept,
}: {
  turnovers: TurnoverItem[];
  members: TeamMember[];
  filter: ListFilter;
  onAccept: (turnover: TurnoverItem) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filtered = useMemo(() => {
    let items = turnovers;
    if (filter === "pending") {
      items = items.filter(t => !t.cleanerAccepted && t.status !== "cancelled");
    } else if (filter === "accepted") {
      items = items.filter(t => t.cleanerAccepted);
    }
    return items;
  }, [turnovers, filter]);

  const grouped = useMemo(() => {
    const groups: Record<string, TurnoverItem[]> = {};
    for (const t of filtered) {
      const dateKey = format(new Date(t.scheduledDate), "yyyy-MM-dd");
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(t);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const assignMutation = useMutation({
    mutationFn: async ({ taskId, memberId }: { taskId: string; memberId: string }) => {
      await apiRequest("PATCH", `/api/cleaning-tasks/${taskId}/assign-member`, {
        assignedMemberId: memberId || null,
      });
    },
    onSuccess: () => {
      toast({ title: "Member assigned" });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/my-turnovers"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to assign", description: error.message, variant: "destructive" });
    },
  });

  if (filtered.length === 0) {
    return (
      <Card className="p-8 text-center" data-testid="empty-turnovers">
        <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500/60" />
        <p className="text-sm font-medium">
          {filter === "pending" ? "No turnovers waiting for acceptance" : "No turnovers found"}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="turnovers-list">
      {grouped.map(([dateKey, items]) => {
        const date = new Date(dateKey + "T12:00:00");
        const dateIsPast = isPast(startOfDay(date)) && !isToday(date);

        return (
          <div key={dateKey}>
            <div className={`text-xs font-semibold mb-2 ${dateIsPast ? "text-muted-foreground" : ""}`}>
              {formatDate(dateKey + "T12:00:00")}
              {isToday(date) && <Badge variant="default" className="ml-2 text-[10px]">Today</Badge>}
            </div>
            <div className="space-y-2">
              {items.map((turnover) => (
                <Card
                  key={turnover.id}
                  className={`p-3 ${!turnover.cleanerAccepted && turnover.status !== "cancelled" ? "border-red-200 dark:border-red-900/50" : ""}`}
                  data-testid={`turnover-card-${turnover.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="font-medium text-sm truncate" data-testid={`text-turnover-listing-${turnover.id}`}>
                        {turnover.listingName}
                      </div>
                      {turnover.listingAddress && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{turnover.listingAddress}</span>
                        </div>
                      )}
                      <div className="flex items-center flex-wrap gap-2 text-[11px] text-muted-foreground">
                        {turnover.guestName && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {turnover.guestName}
                          </span>
                        )}
                        {turnover.guestCheckoutTime && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {turnover.guestCheckoutTime}
                          </span>
                        )}
                      </div>
                      {turnover.cleanerAccepted && turnover.assignedMemberName && (
                        <div className="text-[11px] text-muted-foreground">
                          Assigned: {turnover.assignedMemberName}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {turnover.status === "cancelled" ? (
                        <Badge variant="secondary" className="text-[10px]">Cancelled</Badge>
                      ) : !turnover.cleanerAccepted ? (
                        <Button
                          size="sm"
                          onClick={() => onAccept(turnover)}
                          data-testid={`btn-accept-${turnover.id}`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Accept
                        </Button>
                      ) : (
                        <Badge variant="default" className="text-[10px]">Accepted</Badge>
                      )}
                      {turnover.cleanerAccepted && !turnover.assignedMemberId && members.length > 0 && turnover.status !== "cancelled" && (
                        <Select
                          value=""
                          onValueChange={(memberId) => {
                            if (memberId) {
                              assignMutation.mutate({ taskId: turnover.id, memberId });
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 text-[11px] w-[120px]" data-testid={`select-assign-${turnover.id}`}>
                            <SelectValue placeholder="Assign..." />
                          </SelectTrigger>
                          <SelectContent>
                            {members.map((m) => (
                              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MobileTurnovers() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [listFilter, setListFilter] = useState<ListFilter>("pending");
  const [acceptTarget, setAcceptTarget] = useState<TurnoverItem | null>(null);

  const { data, isLoading } = useQuery<TurnoversData>({
    queryKey: ["/api/mobile/my-turnovers"],
  });

  const pendingCount = useMemo(() => {
    if (!data?.turnovers) return 0;
    return data.turnovers.filter(t => !t.cleanerAccepted && t.status !== "cancelled").length;
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-4" data-testid="mobile-turnovers">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Turnovers</h1>
          {pendingCount > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <AlertTriangle className="h-3 w-3 text-red-500" />
              {pendingCount} awaiting acceptance
            </p>
          )}
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          <button
            className={`p-1.5 rounded-md transition-colors ${viewMode === "calendar" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            onClick={() => setViewMode("calendar")}
            data-testid="btn-view-calendar"
          >
            <CalendarDays className="h-4 w-4" />
          </button>
          <button
            className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            onClick={() => setViewMode("list")}
            data-testid="btn-view-list"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {viewMode === "list" && (
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {([
            { key: "pending" as const, label: "Pending" },
            { key: "accepted" as const, label: "Accepted" },
            { key: "all" as const, label: "All" },
          ]).map((tab) => (
            <button
              key={tab.key}
              className={`flex-1 text-xs font-medium rounded-md py-1.5 px-2 transition-colors ${
                listFilter === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
              onClick={() => setListFilter(tab.key)}
              data-testid={`tab-filter-${tab.key}`}
            >
              {tab.label}
              {tab.key === "pending" && pendingCount > 0 && (
                <Badge variant="destructive" className="ml-1 text-[9px] px-1 py-0">{pendingCount}</Badge>
              )}
            </button>
          ))}
        </div>
      )}

      {viewMode === "calendar" ? (
        <TurnoverCalendar onSelectTask={setAcceptTarget} />
      ) : (
        <TurnoverList
          turnovers={data?.turnovers || []}
          members={data?.members || []}
          filter={listFilter}
          onAccept={setAcceptTarget}
        />
      )}

      <AcceptDialog
        open={!!acceptTarget && !acceptTarget.cleanerAccepted}
        onOpenChange={(open) => !open && setAcceptTarget(null)}
        turnover={acceptTarget}
        members={data?.members || []}
      />
    </div>
  );
}
