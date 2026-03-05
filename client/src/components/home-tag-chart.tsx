import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useLocation } from "wouter";

interface ChartDataPoint {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
  question: number;
}

interface HomeTagChartProps {
  data: ChartDataPoint[];
  isLoading?: boolean;
}

const sentimentColors = {
  negative: "hsl(0, 84%, 60%)",
  neutral: "hsl(45, 93%, 47%)",
  positive: "hsl(142, 71%, 45%)",
};

export function HomeTagChart({ data, isLoading = false }: HomeTagChartProps) {
  const [, navigate] = useLocation();

  const formattedData = useMemo(() => {
    return data.map((item) => ({
      ...item,
      displayDate: format(parseISO(item.date), "MM/dd"),
      total: item.positive + item.neutral + item.negative + item.question,
    }));
  }, [data]);

  const handleBarClick = (entry: any) => {
    if (entry && entry.date) {
      navigate(`/tags?dates=${entry.date}`);
    }
  };

  const handleViewAll = () => {
    navigate("/tags");
  };

  if (isLoading) {
    return (
      <Card className="cursor-pointer" onClick={handleViewAll}>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Tag Trends
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" data-testid="button-view-tags">
            View Tags <ArrowRight className="w-3 h-3" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-32 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="cursor-pointer" onClick={handleViewAll}>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Tag Trends
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" data-testid="button-view-tags">
            View Tags <ArrowRight className="w-3 h-3" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
            No tag data available yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Tag Trends
        </CardTitle>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleViewAll} data-testid="button-view-tags">
          View Tags <ArrowRight className="w-3 h-3" />
        </Button>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={formattedData}
              margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
              barSize={16}
              onClick={(state) => {
                if (state?.activePayload?.[0]?.payload) {
                  handleBarClick(state.activePayload[0].payload);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={30}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0]?.payload;
                  return (
                    <div className="bg-popover border border-border rounded-md p-2 shadow-md text-xs">
                      <p className="font-medium mb-1">{label}</p>
                      <p className="text-muted-foreground">Click to filter tags</p>
                      <div className="space-y-0.5 mt-1">
                        {data.negative > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: sentimentColors.negative }} />
                            <span>Negative: {data.negative}</span>
                          </div>
                        )}
                        {data.neutral > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: sentimentColors.neutral }} />
                            <span>Neutral: {data.neutral}</span>
                          </div>
                        )}
                        {data.positive > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: sentimentColors.positive }} />
                            <span>Positive: {data.positive}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="negative"
                stackId="stack"
                fill={sentimentColors.negative}
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="neutral"
                stackId="stack"
                fill={sentimentColors.neutral}
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="positive"
                stackId="stack"
                fill={sentimentColors.positive}
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-3 mt-2 text-xs">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: sentimentColors.negative }} />
            <span className="text-muted-foreground">Negative</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: sentimentColors.neutral }} />
            <span className="text-muted-foreground">Neutral</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: sentimentColors.positive }} />
            <span className="text-muted-foreground">Positive</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
