import { Button } from "@/components/ui/button";
import { AlertTriangle, X } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ImpersonationStatus {
  isImpersonating: boolean;
  impersonatedUser?: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

export function ImpersonationBanner() {
  const { toast } = useToast();

  const { data: status } = useQuery<ImpersonationStatus>({
    queryKey: ["/api/admin/impersonation-status"],
    refetchInterval: 5000,
  });

  const stopImpersonationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/stop-impersonation");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/impersonation-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Impersonation Ended",
        description: "You have returned to your admin account.",
      });
      window.location.reload();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to stop impersonation",
        variant: "destructive",
      });
    },
  });

  if (!status?.isImpersonating) {
    return null;
  }

  const userName = status.impersonatedUser?.firstName && status.impersonatedUser?.lastName
    ? `${status.impersonatedUser.firstName} ${status.impersonatedUser.lastName}`
    : status.impersonatedUser?.email || "Unknown User";

  return (
    <>
      <div 
        className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-amber-950 py-2 px-4 flex items-center justify-center gap-4 h-10"
        data-testid="impersonation-banner"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span className="font-medium">
            You are impersonating: <strong>{userName}</strong>
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="bg-amber-600 border-amber-700 text-amber-950"
          onClick={() => stopImpersonationMutation.mutate()}
          disabled={stopImpersonationMutation.isPending}
          data-testid="button-stop-impersonation"
        >
          <X className="w-3 h-3 mr-1" />
          Stop Impersonating
        </Button>
      </div>
      <div className="h-10" aria-hidden="true" />
    </>
  );
}
