import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Users,
  ClipboardList
} from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/contexts/workspace-context";
import type { Team, TeamMemberWithUser } from "@shared/schema";
import { TEAM_ROLES, TEAM_MEMBER_STATUS } from "@shared/schema";

const ITEMS_PER_PAGE = 10;

const statusStyles: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  invited: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

export default function TeamDetail() {
  const [, navigate] = useLocation();
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [editMemberDialogOpen, setEditMemberDialogOpen] = useState(false);
  const [deleteMemberDialogOpen, setDeleteMemberDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMemberWithUser | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>(TEAM_ROLES.MEMBER);
  const [editRole, setEditRole] = useState<string>(TEAM_ROLES.MEMBER);
  const [editStatus, setEditStatus] = useState<string>(TEAM_MEMBER_STATUS.ACTIVE);

  const { data: team, isLoading: teamLoading } = useQuery<Team | null>({
    queryKey: ["/api/workspaces", activeWorkspace?.id, "teams", teamId],
    queryFn: async (): Promise<Team | null> => {
      if (!activeWorkspace?.id || !teamId) return null;
      const response = await fetch(`/api/workspaces/${activeWorkspace.id}/teams/${teamId}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error("Failed to fetch team");
      }
      return response.json();
    },
    enabled: !!activeWorkspace?.id && !!teamId,
  });

  const { data: members = [], isLoading: membersLoading } = useQuery<TeamMemberWithUser[]>({
    queryKey: ["/api/workspaces", activeWorkspace?.id, "teams", teamId, "members"],
    queryFn: async () => {
      if (!activeWorkspace?.id || !teamId) return [];
      const response = await fetch(`/api/workspaces/${activeWorkspace.id}/teams/${teamId}/members`);
      if (!response.ok) throw new Error("Failed to fetch members");
      return response.json();
    },
    enabled: !!activeWorkspace?.id && !!teamId,
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: { invitedEmail: string; role: string }) => {
      return apiRequest("POST", `/api/workspaces/${activeWorkspace?.id}/teams/${teamId}/members`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", activeWorkspace?.id, "teams", teamId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", activeWorkspace?.id, "teams"] });
      toast({ title: "Invitation sent", description: "Member has been invited to the team." });
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole(TEAM_ROLES.MEMBER);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to invite member.", variant: "destructive" });
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: async (data: { role: string; status: string }) => {
      return apiRequest("PUT", `/api/workspaces/${activeWorkspace?.id}/teams/${teamId}/members/${selectedMember?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", activeWorkspace?.id, "teams", teamId, "members"] });
      toast({ title: "Member updated", description: "Member has been updated successfully." });
      setEditMemberDialogOpen(false);
      setSelectedMember(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update member.", variant: "destructive" });
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/workspaces/${activeWorkspace?.id}/teams/${teamId}/members/${selectedMember?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", activeWorkspace?.id, "teams", teamId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", activeWorkspace?.id, "teams"] });
      toast({ title: "Member removed", description: "Member has been removed from the team." });
      setDeleteMemberDialogOpen(false);
      setSelectedMember(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove member.", variant: "destructive" });
    },
  });

  const filteredMembers = members.filter(member => 
    statusFilter === "all" || member.status === statusFilter
  );

  const totalPages = Math.ceil(filteredMembers.length / ITEMS_PER_PAGE);
  const paginatedMembers = filteredMembers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleInvite = () => {
    if (!inviteEmail.trim()) return;
    inviteMutation.mutate({ invitedEmail: inviteEmail, role: inviteRole });
  };

  const handleUpdateMember = () => {
    updateMemberMutation.mutate({ role: editRole, status: editStatus });
  };

  const openEditMemberDialog = (member: TeamMemberWithUser) => {
    setSelectedMember(member);
    setEditRole(member.role);
    setEditStatus(member.status);
    setEditMemberDialogOpen(true);
  };

  const openDeleteMemberDialog = (member: TeamMemberWithUser) => {
    setSelectedMember(member);
    setDeleteMemberDialogOpen(true);
  };

  const getMemberName = (member: TeamMemberWithUser) => {
    if (member.firstName || member.lastName) {
      return `${member.firstName || ""} ${member.lastName || ""}`.trim();
    }
    return member.invitedEmail || "Unknown";
  };

  const getMemberEmail = (member: TeamMemberWithUser) => {
    return member.email || member.invitedEmail || "—";
  };

  const getInitials = (member: TeamMemberWithUser) => {
    const name = getMemberName(member);
    return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  };

  const isLoading = teamLoading || membersLoading;

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Team Not Found</h3>
              <p className="text-muted-foreground mt-1">
                The team you're looking for doesn't exist.
              </p>
            </div>
            <Button onClick={() => navigate("/teams")} data-testid="button-back-to-teams">
              Back to Teams
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="w-full space-y-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate("/teams")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Team</p>
            <h1 className="text-2xl font-bold" data-testid="text-team-name">{team.name}</h1>
          </div>
          <Button onClick={() => setInviteDialogOpen(true)} data-testid="button-invite-member">
            <Plus className="w-4 h-4 mr-2" />
            Invite member
          </Button>
        </div>

        {team.description && (
          <p className="text-muted-foreground">{team.description}</p>
        )}

        <div className="flex items-center gap-4 flex-wrap">
          <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setCurrentPage(1); }}>
            <SelectTrigger className="w-40" data-testid="select-status-filter">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="invited">Invited</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Creation date</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    {members.length === 0 
                      ? "No members in this team yet. Invite someone to get started."
                      : "No members match the selected filter."}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedMembers.map((member) => (
                  <TableRow key={member.id} data-testid={`row-member-${member.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                          {member.profileImageUrl && (
                            <AvatarImage src={member.profileImageUrl} alt={getMemberName(member)} />
                          )}
                          <AvatarFallback>{getInitials(member)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium" data-testid={`text-member-name-${member.id}`}>
                          {getMemberName(member)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground" data-testid={`text-member-email-${member.id}`}>
                      {getMemberEmail(member)}
                    </TableCell>
                    <TableCell className="capitalize" data-testid={`text-member-role-${member.id}`}>
                      {member.role}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.createdAt ? format(new Date(member.createdAt), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.lastLoginAt ? format(new Date(member.lastLoginAt), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusStyles[member.status] || statusStyles.active}>
                        {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => openEditMemberDialog(member)}
                          data-testid={`button-edit-member-${member.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => openDeleteMemberDialog(member)}
                          data-testid={`button-delete-member-${member.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredMembers.length)} of {filteredMembers.length} members
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  data-testid="button-prev-page"
                >
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <Button
                      key={page}
                      variant={page === currentPage ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      data-testid={`button-page-${page}`}
                    >
                      {page}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  data-testid="button-next-page"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            Tasks Assigned
          </h2>
          <Card className="p-8 text-center">
            <div className="flex flex-col items-center gap-2">
              <ClipboardList className="w-8 h-8 text-muted-foreground" />
              <p className="text-muted-foreground">
                Tasks assigned to this team will appear here.
              </p>
            </div>
          </Card>
        </div>

        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Member</DialogTitle>
              <DialogDescription>
                Send an invitation to add a new member to this team.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email Address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="member@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  data-testid="input-invite-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger data-testid="select-invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TEAM_ROLES.MANAGER}>Manager</SelectItem>
                    <SelectItem value={TEAM_ROLES.MEMBER}>Member</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleInvite} 
                disabled={!inviteEmail.trim() || inviteMutation.isPending}
                data-testid="button-invite-submit"
              >
                {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editMemberDialogOpen} onOpenChange={setEditMemberDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Member</DialogTitle>
              <DialogDescription>
                Update the role and status for {selectedMember ? getMemberName(selectedMember) : "this member"}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-role">Role</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger data-testid="select-edit-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TEAM_ROLES.MANAGER}>Manager</SelectItem>
                    <SelectItem value={TEAM_ROLES.MEMBER}>Member</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-status">Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger data-testid="select-edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TEAM_MEMBER_STATUS.ACTIVE}>Active</SelectItem>
                    <SelectItem value={TEAM_MEMBER_STATUS.INVITED}>Invited</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditMemberDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleUpdateMember} 
                disabled={updateMemberMutation.isPending}
                data-testid="button-edit-member-submit"
              >
                {updateMemberMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteMemberDialogOpen} onOpenChange={setDeleteMemberDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Member</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove {selectedMember ? getMemberName(selectedMember) : "this member"} from the team? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteMemberDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={() => deleteMemberMutation.mutate()} 
                disabled={deleteMemberMutation.isPending}
                data-testid="button-delete-member-confirm"
              >
                {deleteMemberMutation.isPending ? "Removing..." : "Remove Member"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
