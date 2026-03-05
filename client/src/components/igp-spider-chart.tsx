import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer,
  Tooltip
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Target, Loader2 } from "lucide-react";
import { GuestType, CategoryAnalysis } from "@shared/schema";

interface AlignmentScore {
  guestType: string;
  score: number;
  rationale: string[];
}

interface IGPSpiderChartProps {
  guestTypes: GuestType[];
  analysis?: CategoryAnalysis | null;
  grade?: string | null;
  onBack: () => void;
  alignmentScores?: AlignmentScore[];
  isAlignmentPending?: boolean;
}

function GradeBadge({ grade, size = "default" }: { grade?: string | null; size?: "default" | "lg" }) {
  if (!grade) return null;
  
  const gradeColors: Record<string, string> = {
    'A+': 'bg-emerald-500',
    'A': 'bg-emerald-500',
    'A-': 'bg-emerald-400',
    'B+': 'bg-green-500',
    'B': 'bg-green-500',
    'B-': 'bg-green-400',
    'C+': 'bg-yellow-500',
    'C': 'bg-yellow-500',
    'C-': 'bg-yellow-400',
    'D+': 'bg-orange-500',
    'D': 'bg-orange-500',
    'D-': 'bg-orange-400',
    'F': 'bg-red-500',
  };

  const sizeClasses = size === "lg" ? "text-lg px-3 py-1" : "text-sm px-2 py-0.5";
  
  return (
    <Badge 
      className={`${gradeColors[grade] || 'bg-gray-500'} text-white ${sizeClasses}`}
      data-testid={`badge-grade-${grade}`}
    >
      {grade}
    </Badge>
  );
}

export function IGPSpiderChart({ guestTypes, analysis, grade, onBack, alignmentScores, isAlignmentPending }: IGPSpiderChartProps) {
  const extendedAnalysis = analysis as any;
  const scores = alignmentScores || extendedAnalysis?.alignmentScores || [];
  const pending = isAlignmentPending || extendedAnalysis?.alignmentPending;
  
  // Use alignment scores if available, otherwise fall back to guest type percentages
  // Guest type percentages show "how likely this type of guest will book"
  // Alignment scores show "how well the listing suits each guest type"
  const hasAlignmentScores = scores.length > 0;
  
  // Normalize to exactly 4 guest types for optimal spider chart display
  // Take top 4 by score (for alignment) or percentage (for guest types)
  const normalizedScores: AlignmentScore[] = scores.length <= 4 
    ? scores 
    : [...scores].sort((a, b) => b.score - a.score).slice(0, 4);
    
  const normalizedGuestTypes = guestTypes.length <= 4 
    ? guestTypes 
    : [...guestTypes].sort((a, b) => (b.percentage || 0) - (a.percentage || 0)).slice(0, 4);
  
  const chartData = hasAlignmentScores 
    ? normalizedScores.map((as: AlignmentScore) => ({
        name: as.guestType,
        score: as.score,
        rationale: as.rationale,
        isAlignment: true,
        fullMark: 100,
      }))
    : normalizedGuestTypes.map((gt) => ({
        name: gt.name,
        score: gt.percentage || 0, // Use the original percentage as initial display (guard against undefined)
        rationale: gt.description ? [gt.description] : [],
        isAlignment: false,
        fullMark: 100,
      }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover border rounded-lg p-3 shadow-lg max-w-xs">
          <p className="font-medium text-sm">{data.name}</p>
          <p className="font-bold">
            {data.score}% {data.isAlignment ? "suitability" : "likelihood"}
          </p>
          {data.rationale && data.rationale.length > 0 && (
            <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
              {data.rationale.slice(0, 2).map((r: string, i: number) => (
                <li key={i} className="flex items-start gap-1">
                  <span className="text-muted-foreground mt-0.5">•</span> {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    return null;
  };

  const hasAlignmentData = scores.length > 0;

  return (
    <Card className="border-purple-500/30">
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onBack}
            data-testid="button-back-ideal"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-500" />
              {hasAlignmentScores ? "Ideal Guest Profile Alignment" : "Ideal Guest Profile"}
            </CardTitle>
            <CardDescription>
              {hasAlignmentScores 
                ? "How well your listing suits each identified guest type" 
                : "Breakdown of your ideal guest types based on booking history"}
            </CardDescription>
          </div>
        </div>
        <GradeBadge grade={grade} size="lg" />
      </CardHeader>
      <CardContent className="space-y-6">
        {pending ? (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-purple-500" />
            <p className="text-sm font-medium">Calculating Alignment Scores</p>
            <p className="text-xs text-muted-foreground mt-1">
              Analyzing how well your listing suits each guest profile...
            </p>
          </div>
        ) : hasAlignmentData ? (
          <>
            <div className="w-full h-[350px]" data-testid="chart-spider-igp">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                  <PolarGrid 
                    stroke="hsl(var(--foreground))" 
                    strokeOpacity={0.3}
                  />
                  <PolarAngleAxis 
                    dataKey="name" 
                    tick={{ 
                      fill: 'hsl(var(--foreground))', 
                      fontSize: 11,
                      fontWeight: 500
                    }}
                    className="text-xs"
                  />
                  <PolarRadiusAxis 
                    angle={30} 
                    domain={[0, 100]} 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    tickCount={5}
                  />
                  <Radar
                    name="Alignment Score"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.3}
                    strokeWidth={2}
                  />
                  <Tooltip content={<CustomTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Target className="w-4 h-4" />
                Alignment Rationale
              </h4>
              <div className="grid gap-4">
                {normalizedScores.map((as: AlignmentScore, i: number) => (
                  <div 
                    key={i} 
                    className="p-4 rounded-lg border bg-muted/30"
                    data-testid={`alignment-card-${i}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-sm">{as.guestType}</span>
                      <Badge 
                        variant="secondary" 
                        className={`text-xs ${
                          as.score >= 80 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                          as.score >= 60 ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' :
                          as.score >= 40 ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' :
                          'bg-red-500/20 text-red-600 dark:text-red-400'
                        }`}
                      >
                        {as.score}% Match
                      </Badge>
                    </div>
                    {as.rationale && as.rationale.length > 0 && (
                      <ul className="space-y-1.5">
                        {as.rationale.map((r: string, j: number) => (
                          <li 
                            key={j} 
                            className="flex items-start gap-2 text-xs text-muted-foreground"
                          >
                            <span className="w-1 h-1 rounded-full bg-muted-foreground mt-1.5 flex-shrink-0"></span>
                            {r}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : guestTypes.length > 0 ? (
          <>
            {/* Show guest type percentages while alignment scores are pending */}
            <div className="text-center pb-2">
              <p className="text-sm text-muted-foreground">
                Showing guest booking likelihood percentages. Alignment scores will appear after all analyses complete.
              </p>
            </div>
            <div className="w-full h-[350px]" data-testid="chart-spider-igp-pending">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                  <PolarGrid 
                    stroke="hsl(var(--foreground))" 
                    strokeOpacity={0.3}
                  />
                  <PolarAngleAxis 
                    dataKey="name" 
                    tick={{ 
                      fill: 'hsl(var(--foreground))', 
                      fontSize: 11,
                      fontWeight: 500
                    }}
                    className="text-xs"
                  />
                  <PolarRadiusAxis 
                    angle={30} 
                    domain={[0, 100]} 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    tickCount={5}
                  />
                  <Radar
                    name="Booking Likelihood"
                    dataKey="score"
                    stroke="hsl(var(--muted-foreground))"
                    fill="hsl(var(--muted-foreground))"
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                  <Tooltip content={<CustomTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            
            {/* Show guest type descriptions */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Target className="w-4 h-4" />
                Guest Profile Breakdown
              </h4>
              <div className="grid gap-4">
                {normalizedGuestTypes.map((gt, i) => (
                  <div 
                    key={i} 
                    className="p-4 rounded-lg border bg-muted/30"
                    data-testid={`guest-type-card-${i}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{gt.name}</span>
                      <Badge 
                        variant="secondary" 
                        className="text-xs"
                      >
                        {gt.percentage}% of guests
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{gt.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No guest profile data available</p>
            <p className="text-sm">Run AI analysis to generate guest profiles</p>
          </div>
        )}

        {analysis?.feedback && (
          <div className="p-4 rounded-lg bg-muted/50 border-l-4 border-primary">
            <h4 className="text-sm font-medium mb-2">AI Analysis</h4>
            <p className="text-sm text-muted-foreground" data-testid="text-igp-ai-feedback">
              {analysis.feedback}
            </p>
          </div>
        )}

        {analysis?.suggestions && analysis.suggestions.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Improvement Suggestions</h4>
            <ul className="space-y-2">
              {analysis.suggestions.map((suggestion, i) => (
                <li 
                  key={i} 
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                  data-testid={`text-igp-suggestion-${i}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 flex-shrink-0"></span>
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
