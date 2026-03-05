import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Clock, AlertCircle, CheckCircle2, Building2, ChevronRight, Filter } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface MobileTask {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  assigneeName: string | null;
  listing: { id: string; name: string; imageUrl?: string; address?: string } | null;
  procedure: { id: string; title: string; status: string } | null;
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "Active" },
  { value: "done", label: "Done" },
];

const STATUS_CONFIG: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  pending: { icon: Clock, color: "text-yellow-500", label: "Pending" },
  in_progress: { icon: AlertCircle, color: "text-blue-500", label: "In Progress" },
  done: { icon: CheckCircle2, color: "text-green-500", label: "Done" },
  suggested: { icon: Clock, color: "text-muted-foreground", label: "Suggested" },
  discarded: { icon: Clock, color: "text-muted-foreground", label: "Discarded" },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  high: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
};

export default function MobileTasks() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const searchParams = new URLSearchParams(window.location.search);
  const initialFilter = searchParams.get("status") || "all";
  const [activeFilter, setActiveFilter] = useState(initialFilter);

  const statusQuery = activeFilter === "all" ? undefined : activeFilter;
  const queryUrl = statusQuery ? `/api/mobile/my-tasks?status=${statusQuery}` : "/api/mobile/my-tasks";
  const { data: tasks, isLoading } = useQuery<MobileTask[]>({
    queryKey: [queryUrl],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      await apiRequest("PATCH", `/api/mobile/tasks/${taskId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/my-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/dashboard"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const getNextStatus = (current: string): string | null => {
    if (current === "pending") return "in_progress";
    if (current === "in_progress") return "done";
    return null;
  };

  return (
    <div className="px-4 pt-6 pb-4 space-y-4" data-testid="mobile-tasks">
      <h1 className="text-xl font-semibold">My Tasks</h1>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" data-testid="task-filters">
        {STATUS_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            variant={activeFilter === filter.value ? "default" : "outline"}
            className="flex-shrink-0 toggle-elevate"
            onClick={() => setActiveFilter(filter.value)}
            data-testid={`filter-${filter.value}`}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !tasks || tasks.length === 0 ? (
        <Card className="p-8 text-center" data-testid="empty-tasks">
          <Filter className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {activeFilter === "all" ? "No tasks assigned to you" : `No ${activeFilter.replace("_", " ")} tasks`}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const statusInfo = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
            const StatusIcon = statusInfo.icon;
            const nextStatus = getNextStatus(task.status);

            return (
              <Card key={task.id} className="overflow-visible" data-testid={`mobile-task-${task.id}`}>
                <div
                  className="p-3 hover-elevate cursor-pointer"
                  onClick={() => navigate(`/mobile/tasks/${task.id}`)}
                >
                  <div className="flex items-start gap-3">
                    <button
                      className={cn("mt-0.5 flex-shrink-0 transition-colors", statusInfo.color)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (nextStatus) {
                          updateStatusMutation.mutate({ taskId: task.id, status: nextStatus });
                        }
                      }}
                      disabled={!nextStatus || updateStatusMutation.isPending}
                      data-testid={`btn-status-${task.id}`}
                    >
                      <StatusIcon className="h-5 w-5" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium text-sm line-clamp-2" data-testid={`text-task-title-${task.id}`}>
                          {task.title}
                        </h3>
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge className={PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium}>
                          {task.priority}
                        </Badge>
                        {task.listing && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5 truncate max-w-[160px]">
                            <Building2 className="h-3 w-3 flex-shrink-0" />
                            {task.listing.name}
                          </span>
                        )}
                        {task.dueDate && (
                          <span className="text-xs text-muted-foreground">
                            Due {format(new Date(task.dueDate), "MMM d")}
                          </span>
                        )}
                      </div>
                      {task.procedure && (
                        <div className="mt-1.5 flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            Procedure: {task.procedure.title}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
