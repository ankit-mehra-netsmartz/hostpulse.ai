import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { 
  Search, 
  Grid3X3, 
  List,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Users,
  CalendarDays
} from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/contexts/workspace-context";
import type { TeamWithStats } from "@shared/schema";

export default function Teams() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<TeamWithStats | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDescription, setNewTeamDescription] = useState("");

  const { data: teams = [], isLoading } = useQuery<TeamWithStats[]>({
    queryKey: ["/api/workspaces", activeWorkspace?.id, "teams"],
    queryFn: async () => {
      if (!activeWorkspace?.id) return [];
      const response = await fetch(`/api/workspaces/${activeWorkspace.id}/teams`);
      if (!response.ok) throw new Error("Failed to fetch teams");
      return response.json();
    },
    enabled: !!activeWorkspace?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      return apiRequest("POST", `/api/workspaces/${activeWorkspace?.id}/teams`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", activeWorkspace?.id, "teams"] });
      toast({ title: "Team created", description: "Your new team has been created successfully." });
      setCreateDialogOpen(false);
      setNewTeamName("");
      setNewTeamDescription("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create team.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      return apiRequest("PUT", `/api/workspaces/${activeWorkspace?.id}/teams/${selectedTeam?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", activeWorkspace?.id, "teams"] });
      toast({ title: "Team updated", description: "Team has been updated successfully." });
      setEditDialogOpen(false);
      setSelectedTeam(null);
      setNewTeamName("");
      setNewTeamDescription("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update team.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/workspaces/${activeWorkspace?.id}/teams/${selectedTeam?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", activeWorkspace?.id, "teams"] });
      toast({ title: "Team deleted", description: "Team has been removed." });
      setDeleteDialogOpen(false);
      setSelectedTeam(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete team.", variant: "destructive" });
    },
  });

  const filteredTeams = teams.filter(team => 
    searchQuery === "" || 
    team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    team.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateTeam = () => {
    if (!newTeamName.trim()) return;
    createMutation.mutate({ name: newTeamName, description: newTeamDescription || undefined });
  };

  const handleEditTeam = () => {
    if (!newTeamName.trim()) return;
    updateMutation.mutate({ name: newTeamName, description: newTeamDescription || undefined });
  };

  const openEditDialog = (team: TeamWithStats, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTeam(team);
    setNewTeamName(team.name);
    setNewTeamDescription(team.description || "");
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (team: TeamWithStats, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTeam(team);
    setDeleteDialogOpen(true);
  };

  const getInitials = (name: string) => {
    return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="w-full space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm text-muted-foreground">Teams</p>
            <h1 className="text-2xl font-bold">Teams</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant={viewMode === "list" ? "secondary" : "ghost"} 
              size="icon"
              onClick={() => setViewMode("list")}
              data-testid="button-view-list"
            >
              <List className="w-4 h-4" />
            </Button>
            <Button 
              variant={viewMode === "grid" ? "secondary" : "ghost"} 
              size="icon"
              onClick={() => setViewMode("grid")}
              data-testid="button-view-grid"
            >
              <Grid3X3 className="w-4 h-4" />
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-new-team">
              <Plus className="w-4 h-4 mr-2" />
              New Team
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 max-w-sm relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search teams..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-teams"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : teams.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Users className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">No Teams Yet</h3>
                <p className="text-muted-foreground mt-1">
                  Create your first team to start organizing your workspace members.
                </p>
              </div>
              <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-team">
                <Plus className="w-4 h-4 mr-2" />
                Create Team
              </Button>
            </div>
          </Card>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTeams.map((team) => (
              <Card
                key={team.id}
                className="p-4 cursor-pointer hover-elevate"
                onClick={() => navigate(`/teams/${team.id}`)}
                data-testid={`card-team-${team.id}`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-semibold text-lg truncate" data-testid={`text-team-name-${team.id}`}>
                    {team.name}
                  </h3>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" data-testid={`button-team-menu-${team.id}`}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => openEditDialog(team, e as unknown as React.MouseEvent)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={(e) => openDeleteDialog(team, e as unknown as React.MouseEvent)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {team.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {team.description}
                  </p>
                )}

                <div className="text-sm text-muted-foreground mb-3" data-testid={`text-tasks-assigned-${team.id}`}>
                  Tasks assigned: {team.taskCount || 0}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex -space-x-2">
                    {Array.from({ length: Math.min(team.memberCount || 0, 4) }).map((_, i) => (
                      <Avatar key={i} className="w-8 h-8 border-2 border-background">
                        <AvatarFallback className="text-xs">
                          {String.fromCharCode(65 + i)}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                    {(team.memberCount || 0) > 4 && (
                      <div className="w-8 h-8 rounded-full bg-muted border-2 border-background flex items-center justify-center text-xs text-muted-foreground">
                        +{(team.memberCount || 0) - 4}
                      </div>
                    )}
                    {(team.memberCount || 0) === 0 && (
                      <div className="text-xs text-muted-foreground">No members</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="w-3 h-3" />
                    {team.createdAt ? format(new Date(team.createdAt), "MMM d, yyyy") : "—"}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-sm text-muted-foreground">Team name</th>
                    <th className="text-left p-3 font-medium text-sm text-muted-foreground">Members</th>
                    <th className="text-left p-3 font-medium text-sm text-muted-foreground">Tasks assigned</th>
                    <th className="text-left p-3 font-medium text-sm text-muted-foreground">Created</th>
                    <th className="text-right p-3 font-medium text-sm text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeams.map((team) => (
                    <tr 
                      key={team.id} 
                      className="border-b hover-elevate cursor-pointer"
                      onClick={() => navigate(`/teams/${team.id}`)}
                      data-testid={`row-team-${team.id}`}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Users className="w-4 h-4 text-primary" />
                          </div>
                          <span className="font-medium">{team.name}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex -space-x-2">
                          {Array.from({ length: Math.min(team.memberCount || 0, 3) }).map((_, i) => (
                            <Avatar key={i} className="w-6 h-6 border-2 border-background">
                              <AvatarFallback className="text-xs">
                                {String.fromCharCode(65 + i)}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                          {(team.memberCount || 0) > 3 && (
                            <div className="w-6 h-6 rounded-full bg-muted border-2 border-background flex items-center justify-center text-xs text-muted-foreground">
                              +{(team.memberCount || 0) - 3}
                            </div>
                          )}
                          {(team.memberCount || 0) === 0 && (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-sm">{team.taskCount || 0}</td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {team.createdAt ? format(new Date(team.createdAt), "MMM d, yyyy") : "—"}
                      </td>
                      <td className="p-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" data-testid={`button-team-menu-row-${team.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => openEditDialog(team, e as unknown as React.MouseEvent)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={(e) => openDeleteDialog(team, e as unknown as React.MouseEvent)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {filteredTeams.length === 0 && teams.length > 0 && (
              <div className="p-12 text-center text-muted-foreground">
                No teams match your search criteria.
              </div>
            )}
          </Card>
        )}

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Team</DialogTitle>
              <DialogDescription>
                Add a new team to organize your workspace members.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="team-name">Team Name</Label>
                <Input
                  id="team-name"
                  placeholder="Enter team name"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  data-testid="input-team-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-description">Description (optional)</Label>
                <Textarea
                  id="team-description"
                  placeholder="Describe the team's purpose"
                  value={newTeamDescription}
                  onChange={(e) => setNewTeamDescription(e.target.value)}
                  data-testid="input-team-description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleCreateTeam} 
                disabled={!newTeamName.trim() || createMutation.isPending}
                data-testid="button-create-team-submit"
              >
                {createMutation.isPending ? "Creating..." : "Create Team"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Team</DialogTitle>
              <DialogDescription>
                Update the team information.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-team-name">Team Name</Label>
                <Input
                  id="edit-team-name"
                  placeholder="Enter team name"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  data-testid="input-edit-team-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-team-description">Description (optional)</Label>
                <Textarea
                  id="edit-team-description"
                  placeholder="Describe the team's purpose"
                  value={newTeamDescription}
                  onChange={(e) => setNewTeamDescription(e.target.value)}
                  data-testid="input-edit-team-description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleEditTeam} 
                disabled={!newTeamName.trim() || updateMutation.isPending}
                data-testid="button-edit-team-submit"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Team</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{selectedTeam?.name}"? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={() => deleteMutation.mutate()} 
                disabled={deleteMutation.isPending}
                data-testid="button-delete-team-confirm"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Team"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
