import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, parseISO } from "date-fns";

interface ChartDataPoint {
  weekStart: string;
  count: number;
}

interface ReservationFrequencyChartProps {
  data: ChartDataPoint[];
  isLoading?: boolean;
}

export function ReservationFrequencyChart({
  data,
  isLoading = false,
}: ReservationFrequencyChartProps) {
  const formattedData = useMemo(() => {
    return data.map((item) => ({
      ...item,
      displayWeek: format(parseISO(item.weekStart), "MMM d"),
    }));
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Check-ins by Week (Last 12 Months)</CardTitle>
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
          <CardTitle className="text-base">Check-ins by Week (Last 12 Months)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center text-muted-foreground">
            No reservation data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Check-ins by Week (Last 12 Months)</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={formattedData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <XAxis
                dataKey="displayWeek"
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
                  const weekEnd = new Date(data.weekStart);
                  weekEnd.setDate(weekEnd.getDate() + 6);
                  return (
                    <div className="bg-popover border border-border rounded-md p-2 shadow-md text-xs">
                      <p className="font-medium mb-1">
                        Week of {format(parseISO(data.weekStart), "MMM d, yyyy")}
                      </p>
                      <p>Check-ins: {data.count}</p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="count"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
