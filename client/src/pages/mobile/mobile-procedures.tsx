import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckSquare, ChevronRight, Lock } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { ProcedureWithSteps } from "@shared/schema";

export default function MobileProcedures() {
  const { user } = useAuth();

  const { data: procedures, isLoading } = useQuery<ProcedureWithSteps[]>({
    queryKey: ["/api/procedures"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeProcedures = procedures?.filter((p) => p.status === "active") || [];
  const draftProcedures = procedures?.filter((p) => p.status === "draft") || [];

  return (
    <div className="px-4 pt-6 pb-4 space-y-4" data-testid="mobile-procedures">
      <h1 className="text-xl font-semibold">Procedures</h1>

      {(!procedures || procedures.length === 0) ? (
        <Card className="p-8 text-center" data-testid="empty-procedures">
          <CheckSquare className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No procedures available</p>
        </Card>
      ) : (
        <>
          {activeProcedures.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active</h2>
              {activeProcedures.map((proc) => (
                <ProcedureCard key={proc.id} procedure={proc} userId={user?.id} />
              ))}
            </div>
          )}

          {draftProcedures.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Draft</h2>
              {draftProcedures.map((proc) => (
                <ProcedureCard key={proc.id} procedure={proc} userId={user?.id} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProcedureCard({ procedure, userId }: { procedure: ProcedureWithSteps; userId?: string }) {
  const steps = procedure.steps || [];
  const completedCount = steps.filter((s) =>
    s.completions && (s.completions as any[]).some((c: any) => c.userId === userId)
  ).length;
  const totalSteps = steps.length;
  const progress = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  return (
    <Link href={`/mobile/procedures/${procedure.id}`}>
      <Card className="hover-elevate overflow-visible" data-testid={`procedure-card-${procedure.id}`}>
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {procedure.isLocked && <Lock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                <h3 className="font-medium text-sm line-clamp-1" data-testid={`text-proc-title-${procedure.id}`}>
                  {procedure.title}
                </h3>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">{totalSteps} steps</span>
                {completedCount > 0 && (
                  <Badge variant={progress === 100 ? "default" : "secondary"}>
                    {progress}%
                  </Badge>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
          </div>

          {totalSteps > 0 && completedCount > 0 && (
            <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  progress === 100 ? "bg-green-500" : "bg-primary"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
