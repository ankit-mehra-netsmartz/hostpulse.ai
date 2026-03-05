import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, Calendar } from "lucide-react";
import type { ListingAnalysis } from "@shared/schema";

interface AnalysisHistorySheetProps {
  isOpen: boolean;
  onClose: () => void;
  listingId: string | null;
  listingName: string;
}

interface CategoryConfig {
  key: string;
  label: string;
  color: string;
  analysisField: keyof ListingAnalysis;
  gradeColumn: keyof ListingAnalysis;
}

const categoryConfigs: CategoryConfig[] = [
  { key: "overall", label: "Overall", color: "#8b5cf6", analysisField: "score" as keyof ListingAnalysis, gradeColumn: "overallGrade" as keyof ListingAnalysis },
  { key: "title", label: "Title", color: "#3b82f6", analysisField: "titleAnalysis" as keyof ListingAnalysis, gradeColumn: "titleGrade" as keyof ListingAnalysis },
  { key: "description", label: "Description", color: "#10b981", analysisField: "descriptionAnalysis" as keyof ListingAnalysis, gradeColumn: "descriptionGrade" as keyof ListingAnalysis },
  { key: "photos", label: "Photos", color: "#f59e0b", analysisField: "photosAnalysis" as keyof ListingAnalysis, gradeColumn: "photosGrade" as keyof ListingAnalysis },
  { key: "reviews", label: "Reviews", color: "#ef4444", analysisField: "reviewsAnalysis" as keyof ListingAnalysis, gradeColumn: "reviewsGrade" as keyof ListingAnalysis },
  { key: "pet", label: "Pet", color: "#06b6d4", analysisField: "petAnalysis" as keyof ListingAnalysis, gradeColumn: "petGrade" as keyof ListingAnalysis },
  { key: "guestFav", label: "Guest Fav", color: "#ec4899", analysisField: "guestFavAnalysis" as keyof ListingAnalysis, gradeColumn: "guestFavGrade" as keyof ListingAnalysis },
  { key: "ideal", label: "Ideal", color: "#84cc16", analysisField: "idealAnalysis" as keyof ListingAnalysis, gradeColumn: "idealGrade" as keyof ListingAnalysis },
];

function scoreToGrade(value: number): string {
  if (value >= 10) return "A";
  if (value >= 8) return "B";
  if (value >= 6) return "C";
  if (value >= 4) return "D";
  return "F";
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const fullDate = payload[0]?.payload?.fullDate;
  return (
    <div style={{
      backgroundColor: "hsl(var(--card))",
      border: "1px solid hsl(var(--border))",
      borderRadius: "8px",
      padding: "10px 14px",
      fontSize: "13px",
      lineHeight: "1.6",
    }}>
      {fullDate && <div style={{ fontWeight: 600, marginBottom: 4, color: "hsl(var(--foreground))" }}>{fullDate}</div>}
      {payload.map((entry: any) => {
        if (entry.value == null) return null;
        const isOverall = entry.dataKey === "overall";
        const display = isOverall
          ? `${Number(entry.value).toFixed(1)}/10`
          : scoreToGrade(entry.value);
        return (
          <div key={entry.dataKey} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              backgroundColor: entry.color, display: "inline-block", flexShrink: 0,
            }} />
            <span style={{ color: entry.color, fontWeight: 500 }}>{entry.name}:</span>
            <span style={{ color: "hsl(var(--foreground))" }}>{display}</span>
          </div>
        );
      })}
    </div>
  );
}

function gradeToScore(grade: string | null | undefined): number | null {
  if (!grade) return null;
  switch (grade.toUpperCase()) {
    case "A": return 10;
    case "B": return 8;
    case "C": return 6;
    case "D": return 4;
    case "F": return 2;
    default: return null;
  }
}

export function AnalysisHistorySheet({ isOpen, onClose, listingId, listingName }: AnalysisHistorySheetProps) {
  const [enabledCategories, setEnabledCategories] = useState<Set<string>>(
    new Set(categoryConfigs.map(c => c.key))
  );

  const { data: analyses, isLoading } = useQuery<ListingAnalysis[]>({
    queryKey: ["/api/listings", listingId, "analyses"],
    enabled: !!listingId && isOpen,
  });

  const toggleCategory = (key: string) => {
    setEnabledCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const chartData = (analyses || [])
    .filter((analysis) => analysis.analyzedAt)
    .slice()
    .reverse()
    .map((analysis) => {
      const analyzedDate = new Date(analysis.analyzedAt!);
      const dataPoint: Record<string, number | string | null> = {
        date: analyzedDate.toLocaleDateString("en-US", { 
          month: "short", 
          day: "numeric" 
        }),
        fullDate: analyzedDate.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric"
        }),
      };

      categoryConfigs.forEach(config => {
        if (config.key === "overall") {
          dataPoint[config.key] = typeof analysis.score === "number" ? analysis.score : null;
        } else {
          const categoryAnalysis = analysis[config.analysisField] as { grade?: string } | null;
          const gradeFromAnalysis = categoryAnalysis?.grade;
          const gradeFromColumn = analysis[config.gradeColumn] as string | null;
          const grade = gradeFromAnalysis || gradeFromColumn;
          dataPoint[config.key] = grade ? gradeToScore(grade) : null;
        }
      });

      return dataPoint;
    });

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Analysis History
          </SheetTitle>
          <SheetDescription>
            Score trends over time for {listingName}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-[300px] w-full" />
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            </div>
          ) : analyses && analyses.length > 0 ? (
            <>
              <Card>
                <CardContent className="pt-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="date" 
                        className="text-xs"
                        tick={{ fill: "hsl(var(--muted-foreground))" }}
                      />
                      <YAxis 
                        yAxisId="left"
                        domain={[0, 10]} 
                        ticks={[2, 4, 6, 8, 10]}
                        className="text-xs"
                        tick={{ fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={(value) => {
                          const grades: Record<number, string> = { 2: "F", 4: "D", 6: "C", 8: "B", 10: "A" };
                          return grades[value] || "";
                        }}
                        label={{ value: "Grade", angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                      />
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        domain={[0, 10]} 
                        ticks={[0, 2, 4, 6, 8, 10]}
                        className="text-xs"
                        tick={{ fill: "hsl(var(--muted-foreground))" }}
                        label={{ value: "Score", angle: 90, position: "insideRight", fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend 
                        onClick={(e) => {
                          if (e && e.dataKey) {
                            toggleCategory(e.dataKey as string);
                          }
                        }}
                        wrapperStyle={{ cursor: "pointer" }}
                        formatter={(value, entry) => {
                          const isEnabled = enabledCategories.has(entry.dataKey as string);
                          return (
                            <span style={{ 
                              color: isEnabled ? entry.color : "hsl(var(--muted-foreground))",
                              textDecoration: isEnabled ? "none" : "line-through",
                              opacity: isEnabled ? 1 : 0.5
                            }}>
                              {value}
                            </span>
                          );
                        }}
                      />
                      {categoryConfigs.map(config => {
                        const isEnabled = enabledCategories.has(config.key);
                        return (
                          <Line
                            key={config.key}
                            type="monotone"
                            dataKey={config.key}
                            name={config.label}
                            stroke={config.color}
                            strokeWidth={config.key === "overall" ? 3 : 2}
                            strokeOpacity={isEnabled ? 1 : 0}
                            dot={isEnabled ? { r: config.key === "overall" ? 6 : 4, fill: config.color } : false}
                            activeDot={isEnabled ? { r: 8 } : false}
                            connectNulls
                            yAxisId={config.key === "overall" ? "right" : "left"}
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Click legend items to show/hide categories
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <Label className="text-sm font-medium mb-3 block">Analysis Runs ({analyses.length})</Label>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {analyses.map((analysis, index) => (
                      <div 
                        key={analysis.id} 
                        className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                        data-testid={`analysis-run-${index}`}
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">
                            {analysis.analyzedAt ? new Date(analysis.analyzedAt).toLocaleDateString("en-US", {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit"
                            }) : "Unknown date"}
                          </span>
                        </div>
                        <Badge variant="secondary">
                          {typeof analysis.score === "number" ? analysis.score.toFixed(1) : "-"}/10
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-1">No Analysis History</p>
                  <p className="text-sm">Run an AI analysis to start tracking score trends over time.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
