import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  ArrowLeft,
  UserPlus,
  Trash2,
  Users,
  Building2,
  MapPin,
  Settings2,
  ChevronRight,
} from "lucide-react";
import { Link } from "wouter";
import type { CleanerWithAssignments, Cleaner, CleanerAssignment } from "@shared/schema";

type AssignmentWithDetails = CleanerAssignment & {
  listing?: { id: string; name: string; internalName: string | null; imageUrl: string | null; address: string | null };
  procedure?: { id: string; title: string } | null;
};

type CompanyData = CleanerWithAssignments;

type Tab = "team" | "properties";

function InviteMemberDialog({
  open,
  onOpenChange,
  companyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/cleaners/${companyId}/members`, {
        name,
        email: email || undefined,
        phone: phone || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Team member invited" });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/my-company"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cleaners", companyId, "members"] });
      setName("");
      setEmail("");
      setPhone("");
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to invite", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] rounded-lg">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>Add a new cleaner to your team. An invitation email will be sent if you provide their email.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="member-name">Name *</Label>
            <Input
              id="member-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              data-testid="input-member-name"
            />
          </div>
          <div>
            <Label htmlFor="member-email">Email</Label>
            <Input
              id="member-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              data-testid="input-member-email"
            />
          </div>
          <div>
            <Label htmlFor="member-phone">Phone</Label>
            <Input
              id="member-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 234 567 8901"
              data-testid="input-member-phone"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="btn-cancel-invite"
          >
            Cancel
          </Button>
          <Button
            onClick={() => inviteMutation.mutate()}
            disabled={!name.trim() || inviteMutation.isPending}
            data-testid="btn-confirm-invite"
          >
            {inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
            Invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteMemberDialog({
  open,
  onOpenChange,
  member,
  otherMembers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: Cleaner | null;
  otherMembers: Cleaner[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deps, setDeps] = useState<{ activeTasks: { id: string; listingName: string; scheduledDate: string; guestName: string | null }[]; autoAssignRules: { id: string; listingName: string }[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [replacementId, setReplacementId] = useState<string>("");

  useEffect(() => {
    if (open && member) {
      setLoading(true);
      setReplacementId("");
      apiRequest("GET", `/api/cleaners/${member.id}/dependencies`)
        .then((res) => res.json())
        .then((data) => setDeps(data))
        .catch(() => setDeps(null))
        .finally(() => setLoading(false));
    } else {
      setDeps(null);
    }
  }, [open, member]);

  const hasDeps = deps && (deps.activeTasks.length > 0 || deps.autoAssignRules.length > 0);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!member) return;
      await apiRequest("DELETE", `/api/cleaners/${member.id}`);
    },
    onSuccess: () => {
      toast({ title: "Team member removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/my-company"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove", description: error.message, variant: "destructive" });
    },
  });

  const replaceAndDeleteMutation = useMutation({
    mutationFn: async () => {
      if (!member) return;
      await apiRequest("POST", `/api/cleaners/${member.id}/replace-and-delete`, { replacementId: replacementId || null });
    },
    onSuccess: () => {
      toast({ title: "Team member removed and reassigned" });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/my-company"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] rounded-lg">
        <DialogHeader>
          <DialogTitle>Remove Team Member</DialogTitle>
          <DialogDescription>
            {hasDeps ? (
              <><span className="font-medium">{member?.name}</span> has active assignments. Select a replacement before removing.</>
            ) : (
              <>Are you sure you want to remove <span className="font-medium">{member?.name}</span> from your team?</>
            )}
          </DialogDescription>
        </DialogHeader>
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {hasDeps && !loading && (
          <div className="space-y-3">
            {deps.activeTasks.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Active Turnovers ({deps.activeTasks.length})</p>
                <div className="space-y-1 max-h-[100px] overflow-y-auto">
                  {deps.activeTasks.map((task) => (
                    <div key={task.id} className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                      <span className="truncate">{task.listingName}</span>
                      <span className="shrink-0">{new Date(task.scheduledDate).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {deps.autoAssignRules.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Auto-assign Rules ({deps.autoAssignRules.length})</p>
                <div className="space-y-1 max-h-[100px] overflow-y-auto">
                  {deps.autoAssignRules.map((rule) => (
                    <div key={rule.id} className="text-xs text-muted-foreground">{rule.listingName}</div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label>Replace with</Label>
              <Select value={replacementId} onValueChange={setReplacementId}>
                <SelectTrigger data-testid="select-mobile-replacement">
                  <SelectValue placeholder="Select replacement" />
                </SelectTrigger>
                <SelectContent>
                  {otherMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        {!loading && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="btn-cancel-delete">
              Cancel
            </Button>
            {hasDeps ? (
              <Button
                variant="destructive"
                onClick={() => replaceAndDeleteMutation.mutate()}
                disabled={!replacementId || replaceAndDeleteMutation.isPending}
                data-testid="btn-confirm-replace-delete"
              >
                {replaceAndDeleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Replace & Remove
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                data-testid="btn-confirm-delete"
              >
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Remove
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AssignmentSettingsSheet({
  open,
  onOpenChange,
  assignment,
  members,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: AssignmentWithDetails | null;
  members: Cleaner[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"auto" | "manual">("manual");
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");

  useEffect(() => {
    if (assignment) {
      setMode((assignment.assignmentMode as "auto" | "manual") || "manual");
      setSelectedMemberId(assignment.defaultMemberId || "");
    }
  }, [assignment]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!assignment) return;
      const data: Record<string, unknown> = { assignmentMode: mode };
      if (mode === "auto" && selectedMemberId) {
        data.defaultMemberId = selectedMemberId;
      } else if (mode === "manual") {
        data.defaultMemberId = null;
      }
      await apiRequest("PATCH", `/api/cleaner-assignments/${assignment.id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Assignment updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/my-company"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  const hasChanged =
    mode !== (assignment?.assignmentMode || "manual") ||
    (mode === "auto" && selectedMemberId !== (assignment?.defaultMemberId || ""));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] rounded-lg">
        <DialogHeader>
          <DialogTitle>Property Settings</DialogTitle>
          <DialogDescription>
            {assignment?.listing?.name || "Property"} — Configure how cleaners are assigned to this property.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Assignment Mode</Label>
            <Select value={mode} onValueChange={(v: "auto" | "manual") => setMode(v)}>
              <SelectTrigger data-testid="select-assignment-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="auto">Auto-assign</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === "auto"
                ? "A default cleaner will be automatically assigned to new turnovers."
                : "You will manually assign a cleaner for each turnover."}
            </p>
          </div>

          {mode === "auto" && (
            <div>
              <Label>Default Cleaner</Label>
              <Select
                value={selectedMemberId}
                onValueChange={setSelectedMemberId}
              >
                <SelectTrigger data-testid="select-default-member">
                  <SelectValue placeholder="Select a team member" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id} data-testid={`member-option-${m.id}`}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="btn-cancel-settings">
            Cancel
          </Button>
          <Button
            onClick={() => updateMutation.mutate()}
            disabled={!hasChanged || updateMutation.isPending || (mode === "auto" && !selectedMemberId)}
            data-testid="btn-save-settings"
          >
            {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamTab({ company }: { company: CompanyData }) {
  const [showInvite, setShowInvite] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Cleaner | null>(null);
  const members = company.members || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-medium">Team Members</h2>
        <Button size="sm" onClick={() => setShowInvite(true)} data-testid="btn-invite-member">
          <UserPlus className="h-4 w-4 mr-1" />
          Invite
        </Button>
      </div>

      {members.length === 0 ? (
        <Card className="p-6 text-center">
          <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No team members yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Invite cleaners to join your team.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <Card key={member.id} className="p-3" data-testid={`card-member-${member.id}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate" data-testid={`text-member-name-${member.id}`}>
                    {member.name}
                  </div>
                  <div className="flex items-center flex-wrap gap-1 mt-0.5">
                    {member.email && (
                      <span className="text-xs text-muted-foreground truncate">{member.email}</span>
                    )}
                    {member.userId ? (
                      <Badge variant="secondary" className="text-[10px]">Joined</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Invited</Badge>
                    )}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setDeleteTarget(member)}
                  data-testid={`btn-delete-member-${member.id}`}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <InviteMemberDialog
        open={showInvite}
        onOpenChange={setShowInvite}
        companyId={company.id}
      />
      <DeleteMemberDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        member={deleteTarget}
        otherMembers={(company.members || []).filter((m) => m.id !== deleteTarget?.id)}
      />
    </div>
  );
}

function PropertiesTab({ company }: { company: CompanyData }) {
  const [settingsTarget, setSettingsTarget] = useState<AssignmentWithDetails | null>(null);
  const assignments = company.assignments || [];
  const members = company.members || [];

  return (
    <div className="space-y-3">
      <h2 className="text-base font-medium">Assigned Properties</h2>

      {assignments.length === 0 ? (
        <Card className="p-6 text-center">
          <MapPin className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No properties assigned yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Properties will appear here once the host assigns them to your company.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {assignments.map((assignment) => {
            const defaultMember = members.find((m) => m.id === assignment.defaultMemberId);
            return (
              <Card
                key={assignment.id}
                className="p-3 hover-elevate cursor-pointer"
                onClick={() => setSettingsTarget(assignment)}
                data-testid={`card-assignment-${assignment.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate" data-testid={`text-property-name-${assignment.id}`}>
                      {assignment.listing?.internalName || assignment.listing?.name || "Property"}
                    </div>
                    {assignment.listing?.address && (
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {assignment.listing.address}
                      </div>
                    )}
                    <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
                      <Badge
                        variant={assignment.assignmentMode === "auto" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {assignment.assignmentMode === "auto" ? "Auto" : "Manual"}
                      </Badge>
                      {assignment.assignmentMode === "auto" && defaultMember && (
                        <span className="text-xs text-muted-foreground">{defaultMember.name}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AssignmentSettingsSheet
        open={!!settingsTarget}
        onOpenChange={(open) => !open && setSettingsTarget(null)}
        assignment={settingsTarget}
        members={members}
      />
    </div>
  );
}

export default function MobileCompany() {
  const [activeTab, setActiveTab] = useState<Tab>("team");

  const { data: company, isLoading, error } = useQuery<CompanyData>({
    queryKey: ["/api/mobile/my-company"],
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="px-4 pt-6 pb-4 space-y-4" data-testid="mobile-company-empty">
        <Link href="/mobile/profile">
          <Button variant="ghost" size="sm" data-testid="btn-back-profile">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Profile
          </Button>
        </Link>
        <Card className="p-6 text-center">
          <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">You don't have a company profile in this workspace.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-4" data-testid="mobile-company">
      <div className="flex items-center gap-2">
        <Link href="/mobile/profile">
          <Button variant="ghost" size="icon" data-testid="btn-back-profile">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold truncate">{company.name}</h1>
          <p className="text-xs text-muted-foreground">
            {company.type === "cleaning_manager" ? "Cleaning Manager" : "Cleaning Company"}
          </p>
        </div>
      </div>

      <div className="flex gap-1 bg-muted rounded-lg p-1">
        <button
          className={`flex-1 text-sm font-medium rounded-md py-1.5 px-3 transition-colors ${
            activeTab === "team"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground"
          }`}
          onClick={() => setActiveTab("team")}
          data-testid="tab-team"
        >
          <Users className="h-3.5 w-3.5 inline mr-1" />
          Team
        </button>
        <button
          className={`flex-1 text-sm font-medium rounded-md py-1.5 px-3 transition-colors ${
            activeTab === "properties"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground"
          }`}
          onClick={() => setActiveTab("properties")}
          data-testid="tab-properties"
        >
          <MapPin className="h-3.5 w-3.5 inline mr-1" />
          Properties
        </button>
      </div>

      {activeTab === "team" ? (
        <TeamTab company={company} />
      ) : (
        <PropertiesTab company={company} />
      )}
    </div>
  );
}
