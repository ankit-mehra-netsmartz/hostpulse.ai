import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/contexts/workspace-context";

interface NotionConnectionStatus {
  connected: boolean;
  id?: string;
  notionWorkspaceName?: string;
  selectedDatabaseId?: string;
  selectedDatabaseName?: string;
}

interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  results: Array<{ tagId: string; success: boolean; error?: string }>;
}

export function useNotionSync() {
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();

  const { data: notionConnection } = useQuery<NotionConnectionStatus>({
    queryKey: ["/api/notion/connection", activeWorkspace?.id],
    enabled: !!activeWorkspace,
  });

  const syncMutation = useMutation({
    mutationFn: async (tagIds: string[]) => {
      const response = await apiRequest("POST", "/api/notion/sync-tags", { tagIds });
      return response.json() as Promise<SyncResult>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notion/connection"] });
      if (data.synced > 0) {
        toast({
          title: "Synced to Notion",
          description: `Successfully synced ${data.synced} tag${data.synced === 1 ? "" : "s"} to Notion.`,
        });
      }
      if (data.failed > 0) {
        toast({
          title: "Some tags failed to sync",
          description: `${data.failed} tag${data.failed === 1 ? "" : "s"} failed to sync.`,
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Sync Failed",
        description: "Failed to sync tags to Notion. Please try again.",
        variant: "destructive",
      });
    },
  });

  const canSync = notionConnection?.connected && notionConnection?.selectedDatabaseId;

  return {
    notionConnection,
    canSync,
    syncToNotion: (tagIds: string[]) => syncMutation.mutate(tagIds),
    isSyncing: syncMutation.isPending,
  };
}
