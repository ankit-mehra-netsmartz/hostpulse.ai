import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { format, parseISO } from "date-fns";

interface ChartDataPoint {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
  question: number;
}

interface TagFrequencyChartProps {
  data: ChartDataPoint[];
  selectedDates: string[];
  onDateClick: (date: string) => void;
  onClearDate: (date: string) => void;
  onClearAll: () => void;
  isLoading?: boolean;
}

const sentimentColors = {
  negative: "hsl(0, 84%, 60%)",
  neutral: "hsl(45, 93%, 47%)",
  positive: "hsl(142, 71%, 45%)",
  question: "hsl(217, 91%, 60%)",
};

export function TagFrequencyChart({
  data,
  selectedDates,
  onDateClick,
  onClearDate,
  onClearAll,
  isLoading = false,
}: TagFrequencyChartProps) {
  const formattedData = useMemo(() => {
    return data.map((item) => ({
      ...item,
      displayDate: format(parseISO(item.date), "MM/dd/yy"),
      total: item.positive + item.neutral + item.negative + item.question,
    }));
  }, [data]);

  const handleBarClick = (entry: any) => {
    if (entry && entry.date) {
      onDateClick(entry.date);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tag Frequency Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tag Frequency Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center text-muted-foreground">
            No tag data available for the selected period
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Tag Frequency Over Time</CardTitle>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={formattedData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
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
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0]?.payload;
                  return (
                    <div className="bg-popover border border-border rounded-md p-2 shadow-md text-xs">
                      <p className="font-medium mb-1">{label}</p>
                      <p className="text-muted-foreground mb-1">Click to filter</p>
                      <div className="space-y-0.5">
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

        {selectedDates.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs text-muted-foreground">Filtering by dates:</span>
            {selectedDates.map((date) => (
              <Badge
                key={date}
                variant="secondary"
                className="text-xs cursor-pointer hover-elevate"
                onClick={() => onClearDate(date)}
                data-testid={`badge-date-filter-${date}`}
              >
                {format(parseISO(date), "MM/dd/yy")}
                <X className="w-3 h-3 ml-1" />
              </Badge>
            ))}
            <button
              onClick={onClearAll}
              className="text-xs text-muted-foreground hover:text-foreground underline"
              data-testid="button-clear-all-dates"
            >
              Clear all
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
