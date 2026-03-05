import { ChevronsUpDown, Building2, Plus, Star, Check } from "lucide-react";
import { useLocation } from "wouter";
import { useWorkspace } from "@/contexts/workspace-context";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, defaultWorkspaceId, setActiveWorkspaceId, setAsDefault } = useWorkspace();
  const { isMobile, state } = useSidebar();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isCollapsed = state === "collapsed";

  if (!activeWorkspace) {
    return null;
  }

  const handleSwitchWorkspace = (workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    setLocation("/");
  };

  const handleSetDefault = async (workspaceId: string, workspaceName: string) => {
    try {
      await setAsDefault(workspaceId);
      toast({
        title: "Default workspace updated",
        description: `"${workspaceName}" is now your default workspace`,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to set default workspace",
        variant: "destructive",
      });
    }
  };

  const isDefault = activeWorkspace.id === defaultWorkspaceId;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={`flex items-center gap-3 w-full p-2 rounded-lg hover-elevate text-left ${isCollapsed ? 'justify-center' : ''}`}
              data-testid="workspace-switcher-trigger"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground relative shrink-0 overflow-hidden">
                {(activeWorkspace as any).squareLogoUrl ? (
                  <img 
                    src={(activeWorkspace as any).squareLogoUrl} 
                    alt={`${activeWorkspace.name} logo`}
                    className="w-full h-full object-cover"
                    data-testid="workspace-logo-icon"
                  />
                ) : (
                  <Building2 className="size-4" />
                )}
                {isDefault && (
                  <Star className="size-2.5 absolute -top-0.5 -right-0.5 fill-yellow-400 text-yellow-400" />
                )}
              </div>
              {!isCollapsed && (
                <>
                  <div className="flex-1 min-w-0 text-sm leading-tight">
                    <p className="truncate font-semibold" data-testid="workspace-name">
                      {activeWorkspace.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {activeWorkspace.propertyManagementSoftware === "other"
                        ? activeWorkspace.customSoftwareName || "Other"
                        : activeWorkspace.propertyManagementSoftware === "none"
                        ? "No PMS"
                        : activeWorkspace.propertyManagementSoftware}
                    </p>
                  </div>
                  <ChevronsUpDown className="size-4 text-muted-foreground shrink-0" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Workspaces ({workspaces.length})
            </DropdownMenuLabel>
            {workspaces.map((workspace) => (
              <DropdownMenuItem
                key={workspace.id}
                className="gap-2 p-2 cursor-pointer"
                onClick={() => handleSwitchWorkspace(workspace.id)}
                data-testid={`workspace-option-${workspace.id}`}
              >
                <div className="flex size-6 items-center justify-center rounded-sm border relative overflow-hidden">
                  {(workspace as any).squareLogoUrl ? (
                    <img 
                      src={(workspace as any).squareLogoUrl} 
                      alt={`${workspace.name} logo`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Building2 className="size-4 shrink-0" />
                  )}
                  {workspace.id === defaultWorkspaceId && (
                    <Star className="size-2 absolute -top-0.5 -right-0.5 fill-yellow-400 text-yellow-400" />
                  )}
                </div>
                <div className="flex-1 truncate">
                  <span className="truncate">{workspace.name}</span>
                </div>
                {workspace.id === activeWorkspace.id && (
                  <Check className="size-4 text-primary shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
            {workspaces.length > 1 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Set Default
                </DropdownMenuLabel>
                {workspaces.filter(w => w.id !== defaultWorkspaceId).map((workspace) => (
                  <DropdownMenuItem
                    key={`default-${workspace.id}`}
                    className="gap-2 p-2 cursor-pointer"
                    onClick={() => handleSetDefault(workspace.id, workspace.name)}
                    data-testid={`set-default-workspace-${workspace.id}`}
                  >
                    <Star className="size-4 text-muted-foreground" />
                    <span className="truncate">Set "{workspace.name}" as default</span>
                  </DropdownMenuItem>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 p-2"
              onClick={() => setLocation("/onboarding?add=true")}
              data-testid="add-workspace-button"
            >
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <Plus className="size-4" />
              </div>
              <div className="font-medium text-muted-foreground">Add workspace</div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
