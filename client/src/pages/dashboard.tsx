import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Database, User, Calendar, Star, MessageSquare, ChevronRight, Tags, Wrench, Sparkles } from "lucide-react";
import { ReservationDetailSheet } from "@/components/reservation-detail-sheet";
import { format } from "date-fns";
import type { Reservation, DataSource } from "@shared/schema";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  Cell
} from "recharts";

interface TagChartDataItem {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
}

interface TagChartResponse {
  chartData: TagChartDataItem[];
  listings: { id: string; name: string }[];
}

interface TaskChartData {
  date: string;
  aiSuggested: number;
  userCreated: number;
  completed: number;
}

interface ReviewChartData {
  date: string;
  fiveStars: number;
  fourStars: number;
  lowStars: number;
}

interface ThemeData {
  id: string;
  name: string;
  icon: string;
  tagCount: number;
}

const THEME_COLORS = [
  "#db2777", // pink-600
  "#ec4899", // pink-500
  "#f472b6", // pink-400
  "#a855f7", // purple-500
  "#8b5cf6", // violet-500
  "#06b6d4", // cyan-500
  "#14b8a6", // teal-500
  "#22c55e", // green-500
];

function formatWeekLabel(dateStr: string) {
  try {
    const date = new Date(dateStr);
    return format(date, "MMM d");
  } catch {
    return dateStr;
  }
}

function formatWeekTooltipLabel(dateStr: string) {
  try {
    const date = new Date(dateStr);
    const day = date.getDate();
    const suffix = day === 1 || day === 21 || day === 31 ? 'st' 
                 : day === 2 || day === 22 ? 'nd' 
                 : day === 3 || day === 23 ? 'rd' 
                 : 'th';
    return `Week of ${format(date, "MMM")} ${day}${suffix}`;
  } catch {
    return dateStr;
  }
}

function AnimatedCard({ 
  children, 
  delay = 0, 
  className = "" 
}: { 
  children: React.ReactNode; 
  delay?: number; 
  className?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  
  return (
    <div 
      className={`transform transition-all duration-500 ease-out ${
        isVisible 
          ? "translate-y-0 opacity-100" 
          : "translate-y-8 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

// Custom bar shape that rounds the top corners of the topmost bar in each stack
function RoundedStackedBar(props: any) {
  const { x, y, width, height, fill, payload, dataKey, stackKeys } = props;
  
  if (!height || height <= 0) return null;
  
  // Find the topmost non-zero bar in the stack
  let isTopmost = true;
  if (stackKeys && payload) {
    const currentIndex = stackKeys.indexOf(dataKey);
    for (let i = currentIndex + 1; i < stackKeys.length; i++) {
      if (payload[stackKeys[i]] > 0) {
        isTopmost = false;
        break;
      }
    }
  }
  
  const radius = isTopmost ? 4 : 0;
  
  if (radius === 0) {
    return <rect x={x} y={y} width={width} height={height} fill={fill} />;
  }
  
  // Draw rounded rectangle for topmost bar
  return (
    <path
      d={`
        M ${x},${y + radius}
        Q ${x},${y} ${x + radius},${y}
        L ${x + width - radius},${y}
        Q ${x + width},${y} ${x + width},${y + radius}
        L ${x + width},${y + height}
        L ${x},${y + height}
        Z
      `}
      fill={fill}
    />
  );
}

function TagsChart({ data, isLoading }: { data: TagChartDataItem[]; isLoading: boolean }) {
  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        No tag data available
      </div>
    );
  }

  const safeData = Array.isArray(data) ? data : [];
  const stackKeys = ['negative', 'neutral', 'positive'];
  
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={safeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <XAxis 
          dataKey="date" 
          tickFormatter={formatWeekLabel}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis 
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: 'hsl(var(--card))', 
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px'
          }}
          labelFormatter={formatWeekLabel}
        />
        <Legend 
          iconType="circle"
          wrapperStyle={{ paddingTop: 10 }}
        />
        <Bar dataKey="negative" name="Negative" stackId="a" fill="hsl(0, 84%, 60%)" shape={(props: any) => <RoundedStackedBar {...props} stackKeys={stackKeys} />} />
        <Bar dataKey="neutral" name="Neutral" stackId="a" fill="hsl(45, 93%, 47%)" shape={(props: any) => <RoundedStackedBar {...props} stackKeys={stackKeys} />} />
        <Bar dataKey="positive" name="Positive" stackId="a" fill="hsl(142, 71%, 45%)" shape={(props: any) => <RoundedStackedBar {...props} stackKeys={stackKeys} />} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TasksChart({ data, isLoading }: { data: TaskChartData[]; isLoading: boolean }) {
  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        No task data available
      </div>
    );
  }

  const safeData = Array.isArray(data) ? data : [];
  const stackKeys = ['aiSuggested', 'userCreated', 'completed'];

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={safeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <XAxis 
          dataKey="date" 
          tickFormatter={formatWeekLabel}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis 
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: 'hsl(var(--card))', 
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px'
          }}
          labelFormatter={formatWeekLabel}
        />
        <Legend 
          iconType="circle"
          wrapperStyle={{ paddingTop: 10 }}
        />
        <Bar dataKey="aiSuggested" name="AI Suggested" stackId="a" fill="#a78bfa" shape={(props: any) => <RoundedStackedBar {...props} stackKeys={stackKeys} />} />
        <Bar dataKey="userCreated" name="User Created" stackId="a" fill="#fbbf24" shape={(props: any) => <RoundedStackedBar {...props} stackKeys={stackKeys} />} />
        <Bar dataKey="completed" name="Completed" stackId="a" fill="#4ade80" shape={(props: any) => <RoundedStackedBar {...props} stackKeys={stackKeys} />} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ReviewsChart({ data, isLoading }: { data: ReviewChartData[]; isLoading: boolean }) {
  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        No review data available
      </div>
    );
  }

  const safeData = Array.isArray(data) ? data : [];
  const stackKeys = ['lowStars', 'fourStars', 'fiveStars'];

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={safeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <XAxis 
          dataKey="date" 
          tickFormatter={formatWeekLabel}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis 
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: 'hsl(var(--card))', 
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px'
          }}
          labelFormatter={formatWeekTooltipLabel}
        />
        <Legend 
          iconType="circle"
          wrapperStyle={{ paddingTop: 10 }}
        />
        <Bar dataKey="lowStars" name="1-3 stars" stackId="a" fill="#ef4444" shape={(props: any) => <RoundedStackedBar {...props} stackKeys={stackKeys} />} />
        <Bar dataKey="fourStars" name="4 stars" stackId="a" fill="#fbbf24" shape={(props: any) => <RoundedStackedBar {...props} stackKeys={stackKeys} />} />
        <Bar dataKey="fiveStars" name="5 stars" stackId="a" fill="#4ade80" shape={(props: any) => <RoundedStackedBar {...props} stackKeys={stackKeys} />} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function SentimentHeatmap() {
  const [selectedCell, setSelectedCell] = useState<{ sentiment: number; review: number } | null>(null);
  const [showReservationsSheet, setShowReservationsSheet] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<any>(null);
  const [showReservationDetail, setShowReservationDetail] = useState(false);
  
  const { data: heatmapResponse, isLoading } = useQuery<{ heatmapData: { [key: string]: number } }>({
    queryKey: ["/api/dashboard/sentiment-heatmap"],
  });
  
  // Fetch reservations for selected cell - use path parameters for proper cache keying
  const { data: cellReservations, isLoading: reservationsLoading } = useQuery<Reservation[]>({
    queryKey: ["/api/dashboard/sentiment-reservations", selectedCell?.sentiment, selectedCell?.review],
    enabled: !!selectedCell && showReservationsSheet,
  });
  
  const heatmapData = heatmapResponse?.heatmapData || {};
  
  const rows = [5, 4, 3, 2, 1];
  const cols = [0, 1, 2, 3, 4, 5];
  
  const getColor = (value: number) => {
    if (value === 0) return "bg-emerald-950/30";
    if (value <= 2) return "bg-emerald-900/50";
    if (value <= 5) return "bg-emerald-800/60";
    if (value <= 10) return "bg-emerald-700/70";
    return "bg-emerald-500";
  };
  
  const handleCellClick = (sentiment: number, review: number, value: number) => {
    if (value > 0) {
      setSelectedCell({ sentiment, review });
      setSelectedReservation(null); // Clear previous selection
      setShowReservationsSheet(true);
    }
  };
  
  const handleReservationClick = (reservation: any) => {
    setSelectedReservation(reservation);
    setShowReservationDetail(true);
  };
  
  const handleCloseReservationsSheet = (open: boolean) => {
    setShowReservationsSheet(open);
    if (!open) {
      setSelectedReservation(null);
    }
  };
  
  const handleCloseDetailSheet = (open: boolean) => {
    setShowReservationDetail(open);
    if (!open) {
      setSelectedReservation(null);
    }
  };
  
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-40 ml-auto" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 30 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded" />
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>Density:</span>
          <div className="flex gap-1">
            {[0, 2, 5, 10, 20].map((v) => (
              <div key={v} className={`w-4 h-4 rounded ${getColor(v)}`} />
            ))}
          </div>
          <span>Low → High</span>
        </div>
        
        <div className="flex gap-2">
          {/* Vertical Y-axis label */}
          <div className="flex items-center justify-center">
            <span 
              className="text-xs text-muted-foreground whitespace-nowrap"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              AI Sentiment Score
            </span>
          </div>
          
          {/* Numerical Y-axis labels */}
          <div className="flex flex-col gap-1 items-end pr-2">
            {rows.map(row => (
              <div key={row} className="h-10 flex items-center text-xs text-muted-foreground">
                {row}
              </div>
            ))}
          </div>
          
          <div className="flex-1">
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>
              {rows.map(row => (
                cols.map(col => {
                  const value = heatmapData[`${row}-${col}`] || 0;
                  return (
                    <div 
                      key={`${row}-${col}`}
                      className={`h-10 rounded flex items-center justify-center text-sm font-medium transition-all cursor-pointer hover:ring-2 hover:ring-white/50 hover:scale-105 ${getColor(value)} ${value > 0 ? 'text-white' : 'text-muted-foreground/50'}`}
                      onClick={() => handleCellClick(row, col, value)}
                      data-testid={`heatmap-cell-${row}-${col}`}
                    >
                      {value || 0}
                    </div>
                  );
                })
              ))}
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted-foreground px-1">
              {cols.map(col => (
                <span key={col}>{col}</span>
              ))}
            </div>
            <div className="text-center mt-1 text-xs text-muted-foreground">
              Guest Public Review (0 = No Review)
            </div>
          </div>
        </div>
      </div>
      
      {/* Reservations Sheet */}
      <Sheet open={showReservationsSheet} onOpenChange={handleCloseReservationsSheet}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Reservations</SheetTitle>
            <SheetDescription>
              AI Sentiment: {selectedCell?.sentiment === 0 ? "No Score" : selectedCell?.sentiment} | Guest Review: {selectedCell?.review === 0 ? "No Review" : `${selectedCell?.review} Stars`}
            </SheetDescription>
          </SheetHeader>
          
          <div className="mt-4 space-y-3">
            {reservationsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : cellReservations && cellReservations.length > 0 ? (
              cellReservations.map((reservation: any) => (
                <div
                  key={reservation.id}
                  className="p-4 rounded-lg border hover-elevate cursor-pointer"
                  onClick={() => handleReservationClick(reservation)}
                  data-testid={`reservation-${reservation.id}`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="w-12 h-12">
                      {reservation.guestProfilePicture && (
                        <AvatarImage src={reservation.guestProfilePicture} alt={reservation.guestName || "Guest"} />
                      )}
                      <AvatarFallback>
                        <User className="w-6 h-6" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium truncate">{reservation.guestName || "Guest"}</p>
                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground">
                          {reservation.checkIn ? format(new Date(reservation.checkIn), "MMM d") : ""} - {reservation.checkOut ? format(new Date(reservation.checkOut), "MMM d, yyyy") : ""}
                        </p>
                        {reservation.channel && (
                          <Badge variant="secondary" className="text-xs capitalize">
                            {reservation.channel}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        {reservation.aiSentimentScore !== null && reservation.aiSentimentScore !== undefined && (
                          <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-500 border-purple-500/30">
                            AI: {Number(reservation.aiSentimentScore).toFixed(1)}
                          </Badge>
                        )}
                        {reservation.guestRating !== null && reservation.guestRating !== undefined && (
                          <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-500 border-amber-500/30">
                            <Star className="w-3 h-3 mr-1 fill-amber-500" />
                            {reservation.guestRating}
                          </Badge>
                        )}
                        {!reservation.guestRating && (
                          <span className="text-xs text-muted-foreground">No review</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No reservations found for this combination
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
      
      {/* Reservation Detail Sheet - reusable component */}
      <ReservationDetailSheet
        open={showReservationDetail}
        onOpenChange={handleCloseDetailSheet}
        reservation={selectedReservation}
      />
    </>
  );
}

function ThemesTreemap({ themes, isLoading, onThemeClick }: { themes: ThemeData[]; isLoading: boolean; onThemeClick: (themeId: string) => void }) {
  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  
  if (themes.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        No theme data available
      </div>
    );
  }
  
  const totalTags = themes.reduce((sum, t) => sum + t.tagCount, 0);
  const sortedThemes = [...themes].sort((a, b) => b.tagCount - a.tagCount).slice(0, 8);
  
  // Split themes into two rows based on tag count distribution
  const topRowThemes: ThemeData[] = [];
  const bottomRowThemes: ThemeData[] = [];
  let topRowTotal = 0;
  let bottomRowTotal = 0;
  
  sortedThemes.forEach((theme) => {
    // Balance the rows by adding to the one with fewer tags
    if (topRowTotal <= bottomRowTotal) {
      topRowThemes.push(theme);
      topRowTotal += theme.tagCount;
    } else {
      bottomRowThemes.push(theme);
      bottomRowTotal += theme.tagCount;
    }
  });
  
  const renderRow = (rowThemes: ThemeData[], rowTotal: number, startIndex: number) => (
    <div className="flex-1 flex gap-1 min-h-0">
      {rowThemes.map((theme, i) => {
        const widthPercent = rowTotal > 0 ? (theme.tagCount / rowTotal) * 100 : (100 / rowThemes.length);
        const bgColor = THEME_COLORS[(startIndex + i) % THEME_COLORS.length];
        
        return (
          <div
            key={theme.id}
            onClick={(e) => {
              e.stopPropagation();
              onThemeClick(theme.id);
            }}
            className="rounded-md flex flex-col items-center justify-center p-2 cursor-pointer transition-all hover:opacity-90 overflow-hidden min-w-0"
            style={{ 
              backgroundColor: bgColor,
              width: `${widthPercent}%`,
              flexShrink: 0,
            }}
            data-testid={`theme-block-${theme.id}`}
          >
            <span className="text-xl mb-0.5">{theme.icon}</span>
            <span className="text-white font-medium text-xs text-center line-clamp-1 px-1 w-full truncate">
              {theme.name}
            </span>
            <span className="text-white/80 font-bold text-sm">
              {theme.tagCount}
            </span>
          </div>
        );
      })}
    </div>
  );
  
  return (
    <div className="h-64 flex flex-col gap-1 p-2">
      {renderRow(topRowThemes, topRowTotal, 0)}
      {bottomRowThemes.length > 0 && renderRow(bottomRowThemes, bottomRowTotal, topRowThemes.length)}
    </div>
  );
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  
  const { data: dataSources } = useQuery<DataSource[]>({
    queryKey: ["/api/data-sources"],
  });
  
  const { data: tagsResponse, isLoading: tagsLoading } = useQuery<TagChartResponse>({
    queryKey: ["/api/tags/chart-data"],
  });
  const tagsChartData = tagsResponse?.chartData || [];
  
  const { data: tasksChartData = [], isLoading: tasksLoading } = useQuery<TaskChartData[]>({
    queryKey: ["/api/tasks/chart-data"],
  });
  
  const { data: reviewsChartData = [], isLoading: reviewsLoading } = useQuery<ReviewChartData[]>({
    queryKey: ["/api/reviews/chart-data"],
  });
  
  const { data: themesData = [], isLoading: themesLoading } = useQuery<ThemeData[]>({
    queryKey: ["/api/dashboard/themes"],
  });

  const connectedDataSource = dataSources?.find(ds => ds.isConnected);
  const hasConnectedSource = !!connectedDataSource;
  
  const isLoading = tagsLoading || tasksLoading || reviewsLoading || themesLoading;
  const hasNoData = !isLoading && 
    tagsChartData.length === 0 && 
    tasksChartData.length === 0 && 
    reviewsChartData.length === 0 && 
    themesData.length === 0;

  if (hasNoData) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="w-full">
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Database className="h-16 w-16 text-muted-foreground mb-4" />
              {hasConnectedSource ? (
                <>
                  <h2 className="text-xl font-semibold mb-2">Ready to Sync</h2>
                  <p className="text-muted-foreground mb-6 max-w-md">
                    Your Hospitable account is connected. Sync your listings to start seeing analytics and AI-powered insights.
                  </p>
                  <Button 
                    onClick={() => navigate("/properties")}
                    data-testid="button-sync-listings"
                  >
                    Sync Your Listings
                  </Button>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-semibold mb-2">No Data Connected</h2>
                  <p className="text-muted-foreground mb-6 max-w-md">
                    Connect your property management account to start analyzing your listings and get AI-powered insights.
                  </p>
                  <Button 
                    onClick={() => navigate("/data-sources")}
                    data-testid="button-connect-data"
                  >
                    Connect Data Source
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="w-full space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AnimatedCard delay={0}>
            <Card 
              data-testid="chart-tags" 
              className="cursor-pointer hover-elevate"
              onClick={() => navigate("/tags")}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Tags className="h-5 w-5" />
                  Tags
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TagsChart data={tagsChartData} isLoading={tagsLoading} />
              </CardContent>
            </Card>
          </AnimatedCard>

          <AnimatedCard delay={100}>
            <Card 
              data-testid="chart-tasks" 
              className="cursor-pointer hover-elevate"
              onClick={() => navigate("/tasks")}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Wrench className="h-5 w-5" />
                  Tasks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TasksChart data={tasksChartData} isLoading={tasksLoading} />
              </CardContent>
            </Card>
          </AnimatedCard>

          <AnimatedCard delay={200}>
            <Card 
              data-testid="chart-reviews" 
              className="cursor-pointer hover-elevate"
              onClick={() => navigate("/reviews")}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Star className="h-5 w-5" />
                  Reviews
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ReviewsChart data={reviewsChartData} isLoading={reviewsLoading} />
              </CardContent>
            </Card>
          </AnimatedCard>

          <AnimatedCard delay={300}>
            <Card data-testid="chart-sentiment">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  AI Sentiment vs Guest Reviews
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SentimentHeatmap />
              </CardContent>
            </Card>
          </AnimatedCard>
        </div>

        <AnimatedCard delay={400}>
          <Card 
            data-testid="chart-themes" 
            className="cursor-pointer hover-elevate"
            onClick={() => navigate("/themes")}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Themes by Tag Count</CardTitle>
            </CardHeader>
            <CardContent>
              <ThemesTreemap 
                themes={themesData} 
                isLoading={themesLoading} 
                onThemeClick={(themeId) => navigate(`/themes/${themeId}`)}
              />
            </CardContent>
          </Card>
        </AnimatedCard>
      </div>
    </div>
  );
}
