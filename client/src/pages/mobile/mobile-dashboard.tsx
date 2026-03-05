import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ClipboardList, Clock, CheckCircle2, AlertCircle, ArrowRight, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { format, isToday, isTomorrow } from "date-fns";

interface DashboardData {
  taskCounts: {
    pending: number;
    in_progress: number;
    done: number;
    total: number;
  };
  todayCleaningTasks: Array<{
    id: string;
    listingName: string;
    guestName: string | null;
    status: string;
    scheduledDate: string;
  }>;
  upcomingTasks: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    dueDate: string | null;
    listingName: string | null;
  }>;
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

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  high: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "MMM d");
}

function TurnoverCalendar() {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  const { data: calendarData, isLoading } = useQuery<CalendarData>({
    queryKey: [`/api/mobile/calendar?month=${monthKey}`],
  });

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

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
    setSelectedDate(null);
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
    setSelectedDate(null);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(null);
  };

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const selectedDayData = selectedDate && calendarData?.days?.[selectedDate] || null;

  return (
    <Card className="p-3" data-testid="calendar-card">
      <div className="flex items-center justify-between gap-2 mb-3">
        <Button size="icon" variant="ghost" onClick={goToPrevMonth} data-testid="btn-prev-month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          className="text-sm font-semibold"
          onClick={goToToday}
          data-testid="btn-calendar-title"
        >
          {format(new Date(year, month - 1), "MMMM yyyy")}
        </button>
        <Button size="icon" variant="ghost" onClick={goToNextMonth} data-testid="btn-next-month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-0 mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-0" data-testid="calendar-grid">
          {calendarGrid.map((cell, idx) => {
            if (cell.day === null) {
              return <div key={`empty-${idx}`} className="aspect-square" />;
            }

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
          {selectedDayData.tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted/50"
              data-testid={`calendar-task-${task.id}`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${task.isTurnover ? "bg-orange-500" : "bg-blue-500"}`} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{task.listingName}</div>
                {task.guestName && (
                  <div className="text-[10px] text-muted-foreground truncate">{task.guestName}</div>
                )}
              </div>
              {!task.cleanerAccepted ? (
                <Badge variant="destructive" className="text-[10px]">Pending</Badge>
              ) : (
                <Badge variant={task.status === "completed" ? "default" : "secondary"} className="text-[10px]">
                  {task.isTurnover ? "Turnover" : "Checkout"}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function MobileDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/mobile/dashboard"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const greeting = getGreeting();

  return (
    <div className="px-4 pt-6 pb-4 space-y-6" data-testid="mobile-dashboard">
      <div>
        <h1 className="text-xl font-semibold" data-testid="text-greeting">
          {greeting}, {user?.firstName || "there"}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Here's your overview for today</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Link href="/mobile/tasks?status=pending">
          <Card className="p-3 text-center hover-elevate" data-testid="card-stat-pending">
            <Clock className="h-5 w-5 mx-auto mb-1 text-yellow-500" />
            <div className="text-2xl font-bold" data-testid="text-count-pending">{data?.taskCounts.pending || 0}</div>
            <div className="text-[11px] text-muted-foreground">Pending</div>
          </Card>
        </Link>
        <Link href="/mobile/tasks?status=in_progress">
          <Card className="p-3 text-center hover-elevate" data-testid="card-stat-inprogress">
            <AlertCircle className="h-5 w-5 mx-auto mb-1 text-blue-500" />
            <div className="text-2xl font-bold" data-testid="text-count-inprogress">{data?.taskCounts.in_progress || 0}</div>
            <div className="text-[11px] text-muted-foreground">In Progress</div>
          </Card>
        </Link>
        <Link href="/mobile/tasks?status=done">
          <Card className="p-3 text-center hover-elevate" data-testid="card-stat-done">
            <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-green-500" />
            <div className="text-2xl font-bold" data-testid="text-count-done">{data?.taskCounts.done || 0}</div>
            <div className="text-[11px] text-muted-foreground">Done</div>
          </Card>
        </Link>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4" />
          Turnover Schedule
        </h2>
        <TurnoverCalendar />
      </div>

      {data?.todayCleaningTasks && data.todayCleaningTasks.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" />
            Today's Turnovers
          </h2>
          <div className="space-y-2">
            {data.todayCleaningTasks.map((ct) => (
              <Card key={ct.id} className="p-3" data-testid={`card-cleaning-${ct.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{ct.listingName}</div>
                    {ct.guestName && (
                      <div className="text-xs text-muted-foreground">Guest: {ct.guestName}</div>
                    )}
                  </div>
                  <Badge variant={ct.status === "completed" ? "default" : "secondary"}>
                    {ct.status}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {data?.upcomingTasks && data.upcomingTasks.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <ClipboardList className="h-4 w-4" />
              Upcoming Tasks
            </h2>
            <Link href="/mobile/tasks">
              <button className="text-xs text-primary flex items-center gap-0.5" data-testid="link-view-all-tasks">
                View all <ArrowRight className="h-3 w-3" />
              </button>
            </Link>
          </div>
          <div className="space-y-2">
            {data.upcomingTasks.slice(0, 5).map((task) => (
              <Link key={task.id} href={`/mobile/tasks/${task.id}`}>
                <Card className="p-3 hover-elevate" data-testid={`card-upcoming-${task.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm line-clamp-1">{task.title}</div>
                      {task.listingName && (
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">{task.listingName}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {task.dueDate && (
                        <span className="text-[11px] text-muted-foreground">{formatDueDate(task.dueDate)}</span>
                      )}
                      <Badge className={PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium}>
                        {task.priority}
                      </Badge>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {(!data?.upcomingTasks || data.upcomingTasks.length === 0) && (!data?.todayCleaningTasks || data.todayCleaningTasks.length === 0) && (
        <Card className="p-8 text-center" data-testid="card-empty-state">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500/60" />
          <p className="text-sm font-medium">All caught up!</p>
          <p className="text-xs text-muted-foreground mt-1">No tasks assigned to you right now</p>
        </Card>
      )}
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
