import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckCircle2,
  Circle,
  MapPin,
  Camera,
  Loader2,
  Home,
  Calendar,
  User,
  ChevronDown,
  ChevronUp,
  ClipboardList,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CleaningTaskWithDetails, CleaningTaskItem } from "@shared/schema";

function CompletionBar({ items }: { items: CleaningTaskItem[] }) {
  const completed = items.filter(i => i.isCompleted).length;
  const total = items.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-2" data-testid="completion-bar">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{completed} of {total} completed</span>
        <span className="font-medium">{percentage}%</span>
      </div>
      <div className="h-3 bg-muted rounded-md overflow-hidden">
        <div
          className="h-full bg-primary rounded-md transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

interface ChecklistGroupProps {
  title: string;
  items: CleaningTaskItem[];
  token: string;
}

function ChecklistGroup({ title, items, token }: ChecklistGroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  const completedCount = items.filter(i => i.isCompleted).length;

  const toggleMutation = useMutation({
    mutationFn: async ({ itemId, isCompleted }: { itemId: string; isCompleted: boolean }) => {
      const res = await apiRequest("PATCH", `/api/cleaning-checklist/${token}/items/${itemId}/toggle`, { isCompleted });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cleaning-checklist", token] });
    },
  });

  return (
    <div className="border rounded-md overflow-hidden" data-testid={`checklist-group-${title}`}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between p-3 bg-muted/50 hover-elevate"
        data-testid={`button-toggle-group-${title}`}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{title}</span>
          <Badge variant="outline" className="text-xs">
            {completedCount}/{items.length}
          </Badge>
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>
      {!collapsed && (
        <div className="p-2 space-y-1">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-start gap-3 p-3 rounded-md transition-colors ${
                item.isCompleted ? "bg-muted/30" : "bg-background"
              }`}
              data-testid={`checklist-item-${item.id}`}
            >
              <Checkbox
                checked={item.isCompleted}
                onCheckedChange={(checked) => {
                  toggleMutation.mutate({ itemId: item.id, isCompleted: !!checked });
                }}
                className="mt-0.5"
                data-testid={`checkbox-item-${item.id}`}
              />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${item.isCompleted ? "line-through text-muted-foreground" : ""}`}>
                  {item.label}
                </p>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                )}
                <div className="flex gap-1 mt-1 flex-wrap">
                  {item.requiresPhotoVerification && (
                    <Badge variant="outline" className="text-xs">
                      <Camera className="h-3 w-3 mr-1" />
                      Photo
                    </Badge>
                  )}
                  {item.requiresGpsVerification && (
                    <Badge variant="outline" className="text-xs">
                      <MapPin className="h-3 w-3 mr-1" />
                      GPS
                    </Badge>
                  )}
                </div>
              </div>
              {item.isCompleted ? (
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground/30 shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CleaningChecklistPage() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";

  const { data: task, isLoading, error } = useQuery<CleaningTaskWithDetails>({
    queryKey: ["/api/cleaning-checklist", token],
    queryFn: async () => {
      const res = await fetch(`/api/cleaning-checklist/${token}`);
      if (!res.ok) throw new Error("Checklist not found");
      return res.json();
    },
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading checklist...</p>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-6 space-y-4">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-lg font-semibold" data-testid="text-error-title">Checklist Not Found</h2>
            <p className="text-muted-foreground text-sm" data-testid="text-error-message">
              This checklist link may have expired or is invalid.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const scheduledDate = new Date(task.scheduledDate).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const statusColors: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };

  const groupedItems: Record<string, CleaningTaskItem[]> = {};
  const ungroupedItems: CleaningTaskItem[] = [];

  for (const item of task.items) {
    if (item.moduleTitle) {
      if (!groupedItems[item.moduleTitle]) groupedItems[item.moduleTitle] = [];
      groupedItems[item.moduleTitle].push(item);
    } else {
      ungroupedItems.push(item);
    }
  }

  const moduleGroups = Object.entries(groupedItems).sort(([, a], [, b]) => {
    const orderA = a[0]?.moduleOrder ?? 999;
    const orderB = b[0]?.moduleOrder ?? 999;
    return orderA - orderB;
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground p-4 pb-6">
        <div className="max-w-lg mx-auto space-y-2">
          <h1 className="text-xl font-bold" data-testid="text-checklist-title">Cleaning Checklist</h1>
          <div className="flex items-center gap-2 text-sm opacity-90">
            <Home className="h-4 w-4" />
            <span data-testid="text-listing-name">{task.listing.name}</span>
          </div>
          {task.listing.address && (
            <div className="flex items-center gap-2 text-sm opacity-80">
              <MapPin className="h-4 w-4" />
              <span data-testid="text-listing-address">{task.listing.address}</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 -mt-3 space-y-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span data-testid="text-scheduled-date">{scheduledDate}</span>
              </div>
              <Badge className={statusColors[task.status] || ""} data-testid="badge-status">
                {task.status.replace("_", " ")}
              </Badge>
            </div>
            {task.guestName && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span data-testid="text-guest-name">Departing guest: {task.guestName}</span>
              </div>
            )}
            <CompletionBar items={task.items} />
          </CardContent>
        </Card>

        {ungroupedItems.length > 0 && (
          <ChecklistGroup title="General" items={ungroupedItems} token={token} />
        )}

        {moduleGroups.map(([title, items]) => (
          <ChecklistGroup key={title} title={title} items={items} token={token} />
        ))}

        {task.items.length === 0 && (
          <Card className="text-center py-8">
            <CardContent>
              <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm" data-testid="text-no-items">
                No checklist items have been added yet.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}