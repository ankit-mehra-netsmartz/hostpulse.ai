import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Workspace } from "@shared/schema";

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  defaultWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string) => void;
  setAsDefault: (id: string) => Promise<void>;
  isLoading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const ACTIVE_WORKSPACE_KEY = "hostpulse-active-workspace";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(() => {
    return localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  });

  const { data: workspaces = [], isLoading: workspacesLoading } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces"],
  });

  const { data: defaultWorkspaceData, isLoading: defaultLoading } = useQuery<{ defaultWorkspaceId: string | null }>({
    queryKey: ["/api/user/default-workspace"],
  });

  const defaultWorkspaceId = defaultWorkspaceData?.defaultWorkspaceId || null;
  const isLoading = workspacesLoading || defaultLoading;

  // Find active workspace with priority: localStorage > default > first
  const storedWorkspaceIsValid = workspaces.some(w => w.id === activeWorkspaceId);
  const defaultWorkspaceIsValid = defaultWorkspaceId && workspaces.some(w => w.id === defaultWorkspaceId);
  
  let activeWorkspace: Workspace | null = null;
  if (storedWorkspaceIsValid) {
    activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || null;
  } else if (defaultWorkspaceIsValid) {
    activeWorkspace = workspaces.find(w => w.id === defaultWorkspaceId) || null;
  } else {
    activeWorkspace = workspaces[0] || null;
  }

  useEffect(() => {
    if (workspaces.length > 0 && !defaultLoading) {
      // If no valid workspace ID stored, use default or first workspace
      if (!storedWorkspaceIsValid) {
        const targetId = defaultWorkspaceIsValid ? defaultWorkspaceId : workspaces[0].id;
        setActiveWorkspaceIdState(targetId);
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, targetId);
      }
    }
  }, [workspaces, activeWorkspaceId, defaultWorkspaceId, defaultLoading, storedWorkspaceIsValid, defaultWorkspaceIsValid]);

  const setDefaultMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      await apiRequest("PUT", "/api/user/default-workspace", { workspaceId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/default-workspace"] });
    },
  });

  const setActiveWorkspaceId = (id: string) => {
    setActiveWorkspaceIdState(id);
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, id);
    queryClient.invalidateQueries({ queryKey: ["/api/data-sources"] });
    queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
    queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
  };

  const setAsDefault = async (id: string) => {
    await setDefaultMutation.mutateAsync(id);
  };

  return (
    <WorkspaceContext.Provider value={{ 
      workspaces, 
      activeWorkspace, 
      defaultWorkspaceId,
      setActiveWorkspaceId, 
      setAsDefault,
      isLoading 
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
