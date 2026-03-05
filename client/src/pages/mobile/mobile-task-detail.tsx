import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Building2, CalendarDays, CheckCircle2, Clock, AlertCircle, Play, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";

interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  assigneeName: string | null;
  listing: { id: string; name: string; imageUrl?: string; address?: string } | null;
  procedure: {
    id: string;
    title: string;
    status: string;
    steps: Array<{
      id: string;
      stepOrder: number;
      label: string;
      description: string | null;
      requiresPhotoVerification: boolean;
      requiresGpsVerification: boolean;
      moduleTitle: string | null;
      completions: Array<{ userId: string; completedAt: string }> | null;
    }>;
  } | null;
  procedureAssignmentId: string | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  high: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
};

const STATUS_CONFIG: Record<string, { icon: typeof Clock; color: string; bgColor: string; label: string }> = {
  pending: { icon: Clock, color: "text-yellow-600 dark:text-yellow-400", bgColor: "bg-yellow-100 dark:bg-yellow-900/30", label: "Pending" },
  in_progress: { icon: AlertCircle, color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-100 dark:bg-blue-900/30", label: "In Progress" },
  done: { icon: CheckCircle2, color: "text-green-600 dark:text-green-400", bgColor: "bg-green-100 dark:bg-green-900/30", label: "Done" },
};

export default function MobileTaskDetail({ params }: { params: { id: string } }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: task, isLoading } = useQuery<TaskDetail>({
    queryKey: ["/api/mobile/my-tasks", params.id],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      await apiRequest("PATCH", `/api/mobile/tasks/${params.id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/my-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/dashboard"] });
      toast({ title: "Status updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="px-4 pt-6">
        <p className="text-muted-foreground">Task not found</p>
      </div>
    );
  }

  const statusInfo = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusInfo.icon;
  const completedSteps = task.procedure?.steps.filter(
    (s) => s.completions && (s.completions as any[]).some((c: any) => c.userId === user?.id)
  ).length || 0;
  const totalSteps = task.procedure?.steps.length || 0;
  const progress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <div className="px-4 pt-4 pb-4 space-y-4" data-testid="mobile-task-detail">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/mobile/tasks")} data-testid="btn-back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold line-clamp-1 flex-1">Task Details</h1>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold text-base leading-snug" data-testid="text-task-title">{task.title}</h2>
          <Badge className={PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium}>
            {task.priority}
          </Badge>
        </div>

        {task.description && (
          <p className="text-sm text-muted-foreground" data-testid="text-task-description">{task.description}</p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${statusInfo.bgColor} ${statusInfo.color}`}>
            <StatusIcon className="h-3.5 w-3.5" />
            {statusInfo.label}
          </div>
          {task.dueDate && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              Due {format(new Date(task.dueDate), "MMM d, yyyy")}
            </div>
          )}
        </div>

        {task.listing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground pt-1 border-t">
            <Building2 className="h-4 w-4 flex-shrink-0" />
            <div className="min-w-0">
              <div className="truncate font-medium text-foreground">{task.listing.name}</div>
              {task.listing.address && <div className="text-xs truncate">{task.listing.address}</div>}
            </div>
          </div>
        )}
      </Card>

      <div className="flex gap-2">
        {task.status === "pending" && (
          <Button
            className="flex-1"
            onClick={() => updateStatusMutation.mutate("in_progress")}
            disabled={updateStatusMutation.isPending}
            data-testid="btn-start-task"
          >
            {updateStatusMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Play className="h-4 w-4 mr-1" />
            )}
            Start Task
          </Button>
        )}
        {task.status === "in_progress" && (
          <Button
            className="flex-1"
            onClick={() => updateStatusMutation.mutate("done")}
            disabled={updateStatusMutation.isPending}
            data-testid="btn-complete-task"
          >
            {updateStatusMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-1" />
            )}
            Complete Task
          </Button>
        )}
        {task.status === "done" && (
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => updateStatusMutation.mutate("in_progress")}
            disabled={updateStatusMutation.isPending}
            data-testid="btn-reopen-task"
          >
            Reopen Task
          </Button>
        )}
      </div>

      {task.procedure && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Linked Procedure</h3>
            {totalSteps > 0 && (
              <span className="text-xs text-muted-foreground">{completedSteps}/{totalSteps} steps</span>
            )}
          </div>

          {totalSteps > 0 && (
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
                data-testid="progress-bar"
              />
            </div>
          )}

          <Link href={`/mobile/procedures/${task.procedure.id}?taskId=${task.id}`}>
            <Card className="p-3 hover-elevate" data-testid="card-procedure-link">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm">{task.procedure.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {totalSteps} steps {completedSteps > 0 && `- ${progress}% complete`}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              </div>
            </Card>
          </Link>
        </div>
      )}
    </div>
  );
}
