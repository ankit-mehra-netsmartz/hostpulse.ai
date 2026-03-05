import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/contexts/workspace-context";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogOut, Building2, Moon, Sun, ChevronRight, Users } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Link } from "wouter";

export default function MobileProfile() {
  const { user, logout } = useAuth();
  const { workspaces, activeWorkspace, setActiveWorkspaceId } = useWorkspace();
  const { theme, setTheme } = useTheme();

  const { data: companyProfile } = useQuery<{ id: string; name: string; type: string }>({
    queryKey: ["/api/mobile/my-company"],
    retry: false,
  });

  const initials = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .map((n) => n![0])
    .join("")
    .toUpperCase() || "?";

  return (
    <div className="px-4 pt-6 pb-4 space-y-4" data-testid="mobile-profile">
      <h1 className="text-xl font-semibold">Profile</h1>

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={user?.profileImageUrl || undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate" data-testid="text-user-name">
              {[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User"}
            </div>
            {user?.email && (
              <div className="text-sm text-muted-foreground truncate" data-testid="text-user-email">{user.email}</div>
            )}
          </div>
        </div>
      </Card>

      {companyProfile && (
        <Link href="/mobile/company">
          <Card className="p-4 hover-elevate cursor-pointer" data-testid="link-company-management">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-sm font-medium">My Company</div>
                  <div className="text-xs text-muted-foreground">{companyProfile.name}</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Card>
        </Link>
      )}

      {workspaces.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Building2 className="h-4 w-4" />
            Workspace
          </div>
          <Select
            value={activeWorkspace?.id || ""}
            onValueChange={(val) => setActiveWorkspaceId(val)}
          >
            <SelectTrigger data-testid="select-workspace">
              <SelectValue placeholder="Select workspace" />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((ws) => (
                <SelectItem key={ws.id} value={ws.id} data-testid={`workspace-option-${ws.id}`}>
                  {ws.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            Appearance
          </div>
          <Select value={theme} onValueChange={(val: "light" | "dark" | "system") => setTheme(val)}>
            <SelectTrigger className="w-[120px]" data-testid="select-theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => logout()}
        data-testid="btn-logout"
      >
        <LogOut className="h-4 w-4 mr-2" />
        Sign Out
      </Button>
    </div>
  );
}
