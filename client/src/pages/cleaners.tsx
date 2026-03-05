import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  Users,
  Mail,
  Phone,
  MessageSquare,
  Bell,
  Calendar,
  Send,
  X,
  UserPlus,
  Check,
  Home,
  Building2,
  User,
  ChevronDown,
  ChevronRight,
  Clock,
  CircleCheck,
  CircleDashed,
  ArrowRightLeft,
  Shield,
  Repeat,
  ClipboardList,
  MapPin,
  UserCog,
  RefreshCw,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Cleaner, CleanerAssignment, CleanerWithAssignments, CleaningTaskWithDetails, NotificationTemplate } from "@shared/schema";
import { NOTIFICATION_TEMPLATE_TYPES, NOTIFICATION_SHORT_CODES } from "@shared/schema";

function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (value.startsWith("+") && !digits.startsWith("1")) {
    const countryCode = digits.slice(0, Math.min(3, digits.length));
    const rest = digits.slice(countryCode.length);
    if (rest.length === 0) return `+${countryCode}`;
    return `+${countryCode} ${rest}`;
  }
  const d = digits.startsWith("1") ? digits : "1" + digits;
  const area = d.slice(1, 4);
  const prefix = d.slice(4, 7);
  const line = d.slice(7, 11);
  if (d.length <= 1) return "+1 ";
  if (d.length <= 4) return `+1 (${area}`;
  if (d.length <= 7) return `+1 (${area}) ${prefix}`;
  return `+1 (${area}) ${prefix}-${line}`;
}

function isValidPhone(value: string): boolean {
  if (!value.trim()) return true;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return false;
  return true;
}

function getPhoneError(value: string): string | null {
  if (!value.trim()) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return "Phone number is too short";
  if (digits.length > 15) return "Phone number is too long";
  return null;
}

interface CleanerFormData {
  name: string;
  email: string;
  phone: string;
  notifyByEmail: boolean;
  notifyBySms: boolean;
  reminderTiming: string;
  reminderTime: string;
  type: string;
  contactName: string;
}

const defaultCleanerForm: CleanerFormData = {
  name: "",
  email: "",
  phone: "",
  notifyByEmail: true,
  notifyBySms: true,
  reminderTiming: "morning_of",
  reminderTime: "08:00",
  type: "individual",
  contactName: "",
};

function getCleaningStatus(task: any, checkOutDate: string | null): string {
  if (!task) return "Upcoming";
  if (task.status === "cancelled") return "Cancelled";
  if (task.status === "completed") return "Complete";
  if (task.status === "in_progress") return "In-Progress";
  if (checkOutDate) {
    const now = new Date();
    const checkout = new Date(checkOutDate);
    if (now >= checkout) return "Pending Start";
  }
  return "Upcoming";
}

function cleaningStatusColor(status: string) {
  switch (status) {
    case "Upcoming":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "Pending Start":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
    case "In-Progress":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "Complete":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "Cancelled":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    default:
      return "";
  }
}

function formatDate(date: string | Date | null) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const TEMPLATE_LABELS: Record<string, string> = {
  reminder_email: "Reminder Email",
  reminder_sms: "Reminder SMS",
  cancelled_email: "Cancellation Email",
  cancelled_sms: "Cancellation SMS",
  changed_email: "Change Notification Email",
  changed_sms: "Change Notification SMS",
};

function NotificationTemplateEditor() {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<string>("reminder_email");
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  const { data: templates = [] } = useQuery<NotificationTemplate[]>({
    queryKey: ["/api/notification-templates"],
  });

  const { data: defaults = {} } = useQuery<Record<string, { subject?: string; body: string }>>({
    queryKey: ["/api/notification-templates/defaults"],
  });

  const defaultsLoaded = Object.keys(defaults).length > 0;
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (defaultsLoaded && !initialLoadDone.current) {
      initialLoadDone.current = true;
      loadTemplate(selectedType);
    }
  }, [defaultsLoaded]);

  const saveMutation = useMutation({
    mutationFn: async ({ type, subject, body }: { type: string; subject: string; body: string }) => {
      const res = await apiRequest("PUT", `/api/notification-templates/${type}`, { subject, body });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notification-templates"] });
      setHasChanges(false);
      toast({ title: "Template saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save template", variant: "destructive" });
    },
  });

  const loadTemplate = (type: string) => {
    const saved = templates.find(t => t.type === type);
    const def = defaults[type];
    setEditSubject(saved?.subject || def?.subject || "");
    setEditBody(saved?.body || def?.body || "");
    setSelectedType(type);
    setHasChanges(false);
  };

  const handleResetToDefault = () => {
    const def = defaults[selectedType];
    if (def) {
      setEditSubject(def.subject || "");
      setEditBody(def.body);
      setHasChanges(true);
    }
  };

  const isEmailType = selectedType.includes("email");

  return (
    <div className="mt-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-templates-title">Notification Templates</h1>
        <p className="text-muted-foreground">
          Customize messages sent to cleaners for reminders, cancellations, and changes
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <div className="space-y-1">
          {NOTIFICATION_TEMPLATE_TYPES.map((type) => {
            const saved = templates.find(t => t.type === type);
            return (
              <Button
                key={type}
                variant={selectedType === type ? "secondary" : "ghost"}
                className="w-full justify-start gap-2 toggle-elevate"
                onClick={() => loadTemplate(type)}
                data-testid={`button-template-${type}`}
              >
                {type.includes("email") ? <Mail className="h-4 w-4 shrink-0" /> : <MessageSquare className="h-4 w-4 shrink-0" />}
                <span className="truncate">{TEMPLATE_LABELS[type] || type}</span>
                {saved && <Badge variant="secondary" className="ml-auto text-xs">Custom</Badge>}
              </Button>
            );
          })}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{TEMPLATE_LABELS[selectedType]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEmailType && (
              <div>
                <Label htmlFor="tmpl-subject">Subject Line</Label>
                <Input
                  id="tmpl-subject"
                  value={editSubject}
                  onChange={(e) => { setEditSubject(e.target.value); setHasChanges(true); }}
                  placeholder="Email subject..."
                  data-testid="input-template-subject"
                />
              </div>
            )}
            <div>
              <Label htmlFor="tmpl-body">{isEmailType ? "Email Body" : "SMS Message"}</Label>
              <Textarea
                id="tmpl-body"
                value={editBody}
                onChange={(e) => { setEditBody(e.target.value); setHasChanges(true); }}
                rows={isEmailType ? 8 : 4}
                placeholder="Message body..."
                data-testid="input-template-body"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Available Short Codes</Label>
              <div className="flex flex-wrap gap-1">
                {NOTIFICATION_SHORT_CODES.map((sc) => (
                  <Badge
                    key={sc.code}
                    variant="outline"
                    className="cursor-pointer text-xs"
                    onClick={() => {
                      setEditBody(prev => prev + sc.code);
                      setHasChanges(true);
                    }}
                    data-testid={`badge-shortcode-${sc.code.replace(/[{}]/g, '')}`}
                  >
                    {sc.code}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Click a short code to insert it. These will be replaced with actual values when sent.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button
                onClick={() => saveMutation.mutate({ type: selectedType, subject: editSubject, body: editBody })}
                disabled={!hasChanges || saveMutation.isPending || !editBody.trim() || !defaultsLoaded}
                data-testid="button-save-template"
              >
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Template
              </Button>
              <Button variant="outline" onClick={handleResetToDefault} data-testid="button-reset-template">
                Reset to Default
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function CleanersPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("cleaners");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedCleanerId, setSelectedCleanerId] = useState<string | null>(null);
  const [cleanerForm, setCleanerForm] = useState<CleanerFormData>(defaultCleanerForm);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<CleanerFormData>(defaultCleanerForm);
  const [assignListingIds, setAssignListingIds] = useState<string[]>([]);
  const [assignProcedureId, setAssignProcedureId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cleanerFilter, setCleanerFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("upcoming");
  const [customFromDate, setCustomFromDate] = useState("");
  const [customToDate, setCustomToDate] = useState("");
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [memberForm, setMemberForm] = useState({ name: "", email: "", phone: "" });
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [reassignTaskId, setReassignTaskId] = useState<string | null>(null);
  const [offeredFilter, setOfferedFilter] = useState("all");
  const [memberToDelete, setMemberToDelete] = useState<Cleaner | null>(null);
  const [memberDeps, setMemberDeps] = useState<{ activeTasks: { id: string; listingName: string; scheduledDate: string; guestName: string | null }[]; autoAssignRules: { id: string; listingName: string }[] } | null>(null);
  const [replacementMemberId, setReplacementMemberId] = useState<string>("");
  const [checkingDeps, setCheckingDeps] = useState(false);

  const { data: cleaners = [], isLoading: cleanersLoading } = useQuery<Cleaner[]>({
    queryKey: ["/api/cleaners"],
  });

  const { data: selectedCleaner, isLoading: cleanerDetailLoading } = useQuery<CleanerWithAssignments & { members?: Cleaner[] }>({
    queryKey: ["/api/cleaners", selectedCleanerId],
    enabled: !!selectedCleanerId,
  });

  const { data: expandedMemberDetail } = useQuery<CleanerWithAssignments>({
    queryKey: ["/api/cleaners", expandedMemberId],
    enabled: !!expandedMemberId,
  });

  const { data: listings = [] } = useQuery<{ id: string; name: string; internalName: string | null; imageUrl: string | null; address: string | null; defaultProcedureId: string | null }[]>({
    queryKey: ["/api/listings"],
  });

  const { data: procedures = [] } = useQuery<{ id: string; title: string; status: string }[]>({
    queryKey: ["/api/procedures"],
  });

  const { data: allAssignments = [] } = useQuery<CleanerAssignment[]>({
    queryKey: ["/api/cleaner-assignments"],
  });

  const getDateRange = (): { fromDate?: string; toDate?: string } => {
    const now = new Date();
    if (dateFilter === "today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { fromDate: start.toISOString(), toDate: end.toISOString() };
    }
    if (dateFilter === "week") {
      const dayOfWeek = now.getDay();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { fromDate: start.toISOString(), toDate: end.toISOString() };
    }
    if (dateFilter === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { fromDate: start.toISOString(), toDate: end.toISOString() };
    }
    if (dateFilter === "custom") {
      const result: { fromDate?: string; toDate?: string } = {};
      if (customFromDate) result.fromDate = new Date(customFromDate).toISOString();
      if (customToDate) {
        const end = new Date(customToDate);
        end.setDate(end.getDate() + 1);
        result.toDate = end.toISOString();
      }
      return result;
    }
    if (dateFilter === "upcoming") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { fromDate: start.toISOString() };
    }
    return {};
  };

  const dateRange = getDateRange();

  const { data: turnovers = [], isLoading: turnoversLoading } = useQuery<any[]>({
    queryKey: ["/api/turnovers", statusFilter, cleanerFilter, dateFilter, customFromDate, customToDate, offeredFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (cleanerFilter !== "all") params.set("cleanerId", cleanerFilter);
      if (offeredFilter !== "all") params.set("offered", offeredFilter);
      if (dateRange.fromDate) params.set("fromDate", dateRange.fromDate);
      if (dateRange.toDate) params.set("toDate", dateRange.toDate);
      const workspaceId = localStorage.getItem("hostpulse-active-workspace");
      const headers: Record<string, string> = {};
      if (workspaceId) headers["X-Workspace-Id"] = workspaceId;
      const res = await fetch(`/api/turnovers?${params.toString()}`, { credentials: "include", headers });
      if (!res.ok) throw new Error("Failed to fetch turnovers");
      return res.json();
    },
  });

  const createCleanerMutation = useMutation({
    mutationFn: async (data: CleanerFormData) => {
      if (data.type === 'company' || data.type === 'cleaning_manager') {
        const companyRes = await apiRequest("POST", "/api/cleaners", {
          name: data.name,
          type: data.type,
          notifyByEmail: data.notifyByEmail,
          notifyBySms: data.notifyBySms,
          reminderTiming: data.reminderTiming,
          reminderTime: data.reminderTime,
        });
        const company = await companyRes.json();
        if (data.contactName.trim()) {
          await apiRequest("POST", `/api/cleaners/${company.id}/members`, {
            name: data.contactName,
            email: data.email || undefined,
            phone: data.phone || undefined,
          });
        }
        return company;
      }
      const res = await apiRequest("POST", "/api/cleaners", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cleaners"] });
      setCreateDialogOpen(false);
      setCleanerForm(defaultCleanerForm);
      toast({ title: "Cleaner created" });
    },
    onError: (error: any) => {
      let description = "Failed to create cleaner";
      try {
        const match = error?.message?.match(/\d+:\s*(.+)/);
        if (match) {
          const parsed = JSON.parse(match[1]);
          description = parsed.message || description;
        }
      } catch {}
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  const updateCleanerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CleanerFormData> }) => {
      const res = await apiRequest("PATCH", `/api/cleaners/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cleaners"] });
      if (selectedCleanerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/cleaners", selectedCleanerId] });
      }
      setIsEditing(false);
      toast({ title: "Cleaner updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update cleaner", variant: "destructive" });
    },
  });

  const deleteCleanerMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/cleaners/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cleaners"] });
      setSelectedCleanerId(null);
      toast({ title: "Cleaner deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete cleaner", variant: "destructive" });
    },
  });

  const createAssignmentMutation = useMutation({
    mutationFn: async ({ cleanerId, data }: { cleanerId: string; data: { listingIds: string[]; procedureId?: string } }) => {
      const results = [];
      const errors: string[] = [];
      for (const listingId of data.listingIds) {
        try {
          const res = await apiRequest("POST", `/api/cleaners/${cleanerId}/assignments`, {
            listingId,
            procedureId: data.procedureId,
          });
          results.push(await res.json());
        } catch (err: any) {
          errors.push(listingId);
        }
      }
      if (errors.length > 0 && results.length > 0) {
        throw new Error(`Partially assigned: ${results.length} succeeded, ${errors.length} failed`);
      } else if (errors.length > 0) {
        throw new Error(`Failed to create ${errors.length} assignment(s)`);
      }
      return results;
    },
    onSuccess: (_data, variables) => {
      if (selectedCleanerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/cleaners", selectedCleanerId] });
      }
      setAssignListingIds([]);
      setAssignProcedureId("");
      const count = variables.data.listingIds.length;
      toast({ title: `${count} ${count === 1 ? "property" : "properties"} assigned` });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cleaners"] });
      if (selectedCleanerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/cleaners", selectedCleanerId] });
      }
      toast({ title: "Assignment Error", description: error.message || "Failed to create assignment", variant: "destructive" });
    },
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { assignmentMode?: string; defaultMemberId?: string | null } }) => {
      return apiRequest("PATCH", `/api/cleaner-assignments/${id}`, data);
    },
    onSuccess: () => {
      if (selectedCleanerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/cleaners", selectedCleanerId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/cleaning-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/turnovers"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update assignment", variant: "destructive" });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/cleaner-assignments/${id}`);
    },
    onSuccess: () => {
      if (selectedCleanerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/cleaners", selectedCleanerId] });
      }
      toast({ title: "Assignment removed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove assignment", variant: "destructive" });
    },
  });

  const syncTurnoversMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/turnovers/sync");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/turnovers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      toast({ title: "Reservations synced", description: `${data.created} new, ${data.updated} updated` });
    },
    onError: (error: any) => {
      let description = "Failed to sync reservations";
      try {
        const match = error?.message?.match(/\d+:\s*(.+)/);
        if (match) {
          const parsed = JSON.parse(match[1]);
          description = parsed.message || description;
        }
      } catch {}
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  const generateTasksMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cleaning-tasks/generate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cleaning-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/turnovers"] });
      toast({ title: "Tasks generated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate tasks", variant: "destructive" });
    },
  });

  const sendRemindersMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cleaning-tasks/send-reminders");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cleaning-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/turnovers"] });
      toast({ title: "Reminders sent" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send reminders", variant: "destructive" });
    },
  });

  const reassignCleanerMutation = useMutation({
    mutationFn: async ({ taskId, cleanerId, assignedMemberId }: { taskId: string; cleanerId: string | null; assignedMemberId?: string | null }) => {
      const res = await apiRequest("PATCH", `/api/cleaning-tasks/${taskId}/reassign-cleaner`, { cleanerId, assignedMemberId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cleaning-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/turnovers"] });
      setReassignTaskId(null);
      toast({ title: "Cleaner reassigned" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reassign cleaner", variant: "destructive" });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async ({ companyId, data }: { companyId: string; data: { name: string; email: string; phone: string } }) => {
      const res = await apiRequest("POST", `/api/cleaners/${companyId}/members`, data);
      return res.json();
    },
    onSuccess: () => {
      if (selectedCleanerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/cleaners", selectedCleanerId] });
      }
      setAddMemberDialogOpen(false);
      setMemberForm({ name: "", email: "", phone: "" });
      toast({ title: "Team member added" });
    },
    onError: (error: any) => {
      let description = "Failed to add team member";
      try {
        const match = error?.message?.match(/\d+:\s*(.+)/);
        if (match) {
          const parsed = JSON.parse(match[1]);
          description = parsed.message || description;
        }
      } catch {}
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  const handleDeleteMember = async (member: Cleaner) => {
    setCheckingDeps(true);
    try {
      const res = await apiRequest("GET", `/api/cleaners/${member.id}/dependencies`);
      const deps = await res.json();
      if (deps.activeTasks.length > 0 || deps.autoAssignRules.length > 0) {
        setMemberToDelete(member);
        setMemberDeps(deps);
        setReplacementMemberId("");
      } else {
        setMemberToDelete(member);
        setMemberDeps(null);
        setReplacementMemberId("");
      }
    } catch {
      toast({ title: "Error", description: "Failed to check dependencies", variant: "destructive" });
    } finally {
      setCheckingDeps(false);
    }
  };

  const replaceAndDeleteMutation = useMutation({
    mutationFn: async ({ memberId, replacementId }: { memberId: string; replacementId: string | null }) => {
      return apiRequest("POST", `/api/cleaners/${memberId}/replace-and-delete`, { replacementId });
    },
    onSuccess: () => {
      if (selectedCleanerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/cleaners", selectedCleanerId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/cleaners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cleaning-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/turnovers"] });
      setMemberToDelete(null);
      setMemberDeps(null);
      toast({ title: "Team member removed and reassigned" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove team member", variant: "destructive" });
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      return apiRequest("DELETE", `/api/cleaners/${memberId}`);
    },
    onSuccess: () => {
      if (selectedCleanerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/cleaners", selectedCleanerId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/cleaners"] });
      setMemberToDelete(null);
      setMemberDeps(null);
      toast({ title: "Team member removed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove team member", variant: "destructive" });
    },
  });

  const assignMemberMutation = useMutation({
    mutationFn: async ({ taskId, memberId }: { taskId: string; memberId: string | null }) => {
      const res = await apiRequest("PATCH", `/api/cleaning-tasks/${taskId}/assign-member`, { assignedMemberId: memberId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cleaning-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/turnovers"] });
      toast({ title: "Team member assigned" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to assign team member", variant: "destructive" });
    },
  });

  const memberAssignMutation = useMutation({
    mutationFn: async ({ memberId, listingId, procedureId }: { memberId: string; listingId: string; procedureId?: string }) => {
      const res = await apiRequest("POST", `/api/cleaners/${memberId}/assignments`, { listingId, procedureId });
      return res.json();
    },
    onSuccess: () => {
      if (expandedMemberId) {
        queryClient.invalidateQueries({ queryKey: ["/api/cleaners", expandedMemberId] });
      }
      toast({ title: "Property assigned to member" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to assign property", variant: "destructive" });
    },
  });

  const memberUnassignMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      return apiRequest("DELETE", `/api/cleaner-assignments/${assignmentId}`);
    },
    onSuccess: () => {
      if (expandedMemberId) {
        queryClient.invalidateQueries({ queryKey: ["/api/cleaners", expandedMemberId] });
      }
      toast({ title: "Property unassigned from member" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to unassign property", variant: "destructive" });
    },
  });

  const updateListingProcedureMutation = useMutation({
    mutationFn: async ({ listingId, procedureId }: { listingId: string; procedureId: string | null }) => {
      return apiRequest("PATCH", `/api/listings/${listingId}`, { defaultProcedureId: procedureId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      toast({ title: "Procedure updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update procedure", variant: "destructive" });
    },
  });

  const topLevelCleaners = cleaners.filter(c => !c.parentId);

  const membersByCompany: Record<string, Cleaner[]> = {};
  for (const c of cleaners) {
    if (c.parentId) {
      if (!membersByCompany[c.parentId]) membersByCompany[c.parentId] = [];
      membersByCompany[c.parentId].push(c);
    }
  }

  const handleSelectCleaner = (cleaner: Cleaner) => {
    setSelectedCleanerId(cleaner.id);
    setExpandedMemberId(null);
    setIsEditing(false);
    setEditForm({
      name: cleaner.name,
      email: cleaner.email || "",
      phone: cleaner.phone || "",
      notifyByEmail: cleaner.notifyByEmail,
      notifyBySms: cleaner.notifyBySms,
      reminderTiming: cleaner.reminderTiming,
      reminderTime: cleaner.reminderTime || "08:00",
      type: cleaner.type || "individual",
    });
  };

  const handleStartEdit = () => {
    if (selectedCleaner) {
      setEditForm({
        name: selectedCleaner.name,
        email: selectedCleaner.email || "",
        phone: selectedCleaner.phone ? formatPhoneNumber(selectedCleaner.phone) : "",
        notifyByEmail: selectedCleaner.notifyByEmail,
        notifyBySms: selectedCleaner.notifyBySms,
        reminderTiming: selectedCleaner.reminderTiming,
        reminderTime: selectedCleaner.reminderTime || "08:00",
        type: selectedCleaner.type || "individual",
      });
      setIsEditing(true);
    }
  };

  const handleSaveEdit = () => {
    if (selectedCleanerId) {
      updateCleanerMutation.mutate({ id: selectedCleanerId, data: editForm });
    }
  };

  const handleAssign = () => {
    if (selectedCleanerId && assignListingIds.length > 0) {
      createAssignmentMutation.mutate({
        cleanerId: selectedCleanerId,
        data: {
          listingIds: assignListingIds,
          procedureId: assignProcedureId || undefined,
        },
      });
    }
  };

  const toggleListingSelection = (listingId: string) => {
    setAssignListingIds((prev) =>
      prev.includes(listingId)
        ? prev.filter((id) => id !== listingId)
        : [...prev, listingId]
    );
  };

  const completionPercent = (task: CleaningTaskWithDetails) => {
    if (!task.items || task.items.length === 0) return 0;
    const done = task.items.filter((i) => i.isCompleted).length;
    return Math.round((done / task.items.length) * 100);
  };

  return (
    <div className="flex-1 p-4 md:p-6 overflow-auto">
      <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="tabs-cleaners">
        <TabsList data-testid="tabs-list">
          <TabsTrigger value="cleaners" data-testid="tab-cleaners">Cleaners</TabsTrigger>
          <TabsTrigger value="turnovers" data-testid="tab-turnovers">Turnovers</TabsTrigger>
          <TabsTrigger value="properties" data-testid="tab-properties">Properties</TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="cleaners">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-6 mt-4">
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-cleaners-title">Cleaners</h1>
              <p className="text-muted-foreground">
                Manage your cleaning staff and assign them to properties
              </p>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-add-cleaner">
              <Plus className="h-4 w-4 mr-2" />
              Add Cleaner
            </Button>
          </div>

          {cleanersLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : topLevelCleaners.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No cleaners yet</h3>
                <p className="text-muted-foreground mb-4">
                  Add your first cleaner or cleaning company to start managing cleaning schedules
                </p>
                <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-add-first-cleaner">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Your First Cleaner
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {topLevelCleaners.map((cleaner) => (
                <Card
                  key={cleaner.id}
                  className="cursor-pointer hover-elevate"
                  onClick={() => handleSelectCleaner(cleaner)}
                  data-testid={`card-cleaner-${cleaner.id}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base flex items-center gap-2" data-testid={`text-cleaner-name-${cleaner.id}`}>
                        {cleaner.type === 'company' ? (
                          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : cleaner.type === 'cleaning_manager' ? (
                          <Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        {cleaner.name}
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs shrink-0" data-testid={`badge-type-${cleaner.id}`}>
                        {cleaner.type === 'company' ? 'Company' : cleaner.type === 'cleaning_manager' ? 'Manager' : 'Individual'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2 space-y-2">
                    {cleaner.email && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" />
                        <span data-testid={`text-cleaner-email-${cleaner.id}`}>{cleaner.email}</span>
                      </div>
                    )}
                    {cleaner.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" />
                        <span data-testid={`text-cleaner-phone-${cleaner.id}`}>{cleaner.phone}</span>
                      </div>
                    )}
                    {(cleaner.type === 'company' || cleaner.type === 'cleaning_manager') && (() => {
                      const members = membersByCompany[cleaner.id] || [];
                      const maxShow = 4;
                      const shown = members.slice(0, maxShow);
                      const remaining = members.length - maxShow;
                      if (members.length === 0) return null;
                      return (
                        <div className="flex items-center gap-1 pt-1" data-testid={`members-preview-${cleaner.id}`}>
                          <div className="flex -space-x-2">
                            {shown.map((member) => (
                              <div
                                key={member.id}
                                className="h-7 w-7 rounded-full bg-muted border-2 border-card flex items-center justify-center shrink-0"
                                title={member.name}
                              >
                                <span className="text-[10px] font-medium text-muted-foreground">
                                  {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                </span>
                              </div>
                            ))}
                            {remaining > 0 && (
                              <div className="h-7 w-7 rounded-full bg-muted border-2 border-card flex items-center justify-center shrink-0">
                                <span className="text-[10px] font-medium text-muted-foreground">+{remaining}</span>
                              </div>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground ml-1">
                            {members.length} {members.length === 1 ? 'member' : 'members'}
                          </span>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="turnovers">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-6 mt-4">
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-turnovers-title">Turnovers</h1>
              <p className="text-muted-foreground">
                Track cleaning tasks for upcoming and past reservation checkouts
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => syncTurnoversMutation.mutate()}
                disabled={syncTurnoversMutation.isPending}
                data-testid="button-sync-turnovers"
              >
                {syncTurnoversMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync Reservations
              </Button>
              <Button
                variant="outline"
                onClick={() => generateTasksMutation.mutate()}
                disabled={generateTasksMutation.isPending}
                data-testid="button-bulk-offer"
              >
                {generateTasksMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Bulk Offer
              </Button>
              <Button
                onClick={() => sendRemindersMutation.mutate()}
                disabled={sendRemindersMutation.isPending}
                data-testid="button-send-reminders"
              >
                {sendRemindersMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send Reminders
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Select value={dateFilter} onValueChange={(v) => { setDateFilter(v); if (v !== "custom") { setCustomFromDate(""); setCustomToDate(""); } }}>
              <SelectTrigger className="w-[180px]" data-testid="select-date-filter">
                <Calendar className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                <SelectValue placeholder="All dates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
                <SelectItem value="all">All dates</SelectItem>
              </SelectContent>
            </Select>
            {dateFilter === "custom" && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={customFromDate}
                  onChange={(e) => setCustomFromDate(e.target.value)}
                  className="w-[150px]"
                  data-testid="input-date-from"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={customToDate}
                  onChange={(e) => setCustomToDate(e.target.value)}
                  className="w-[150px]"
                  data-testid="input-date-to"
                />
              </div>
            )}
            <Select value={offeredFilter} onValueChange={setOfferedFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-offered-filter">
                <SelectValue placeholder="All turnovers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All turnovers</SelectItem>
                <SelectItem value="yes">Offered</SelectItem>
                <SelectItem value="no">Not offered</SelectItem>
              </SelectContent>
            </Select>
            <Select value={cleanerFilter} onValueChange={setCleanerFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-cleaner-filter">
                <SelectValue placeholder="All cleaners" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cleaners</SelectItem>
                {topLevelCleaners.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.type === 'company' ? `${c.name} (Company)` : c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-status-filter">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="pending_start">Pending Start</SelectItem>
                <SelectItem value="in_progress">In-Progress</SelectItem>
                <SelectItem value="completed">Complete</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {turnoversLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : turnovers.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <ArrowRightLeft className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No turnovers found</h3>
                <p className="text-muted-foreground mb-4">
                  Sync reservations to load current and future bookings, then generate cleaning tasks to assign cleaners.
                </p>
                <Button
                  variant="outline"
                  onClick={() => syncTurnoversMutation.mutate()}
                  disabled={syncTurnoversMutation.isPending}
                  data-testid="button-sync-first-turnovers"
                >
                  {syncTurnoversMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Sync Reservations
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-md">
              <div className="grid grid-cols-[1fr_160px_150px_80px_80px_100px_110px_40px] gap-3 px-4 py-3 border-b bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <span data-testid="header-turnovers-property">Property / Guest</span>
                <span data-testid="header-turnovers-assigned">Assigned To</span>
                <span data-testid="header-turnovers-checkout">Checkout</span>
                <span data-testid="header-turnovers-mode">Mode</span>
                <span data-testid="header-turnovers-offered">Offered</span>
                <span data-testid="header-turnovers-accepted">Accepted</span>
                <span data-testid="header-turnovers-status">Status</span>
                <span></span>
              </div>
              <div className="divide-y">
                {turnovers.map((turnover: any) => {
                  const task = turnover.cleaningTask;
                  const cleaningStatus = getCleaningStatus(task, turnover.checkOutDate);

                  const checkoutTime = turnover.checkOutDate
                    ? new Date(turnover.checkOutDate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
                    : null;

                  return (
                    <div
                      key={turnover.reservationId}
                      className="grid grid-cols-[1fr_160px_150px_80px_80px_100px_110px_40px] gap-3 px-4 py-3 items-center"
                      data-testid={`row-turnover-${turnover.reservationId}`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {turnover.listing?.imageUrl ? (
                            <img
                              src={turnover.listing.imageUrl}
                              alt={turnover.listing.internalName || turnover.listing.name}
                              className="h-8 w-8 rounded-md object-cover shrink-0"
                              data-testid={`img-turnover-listing-${turnover.reservationId}`}
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0" data-testid={`img-turnover-fallback-${turnover.reservationId}`}>
                              <Home className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate" data-testid={`text-turnover-listing-${turnover.reservationId}`}>
                              {turnover.listing?.internalName || turnover.listing?.name || "Unknown"}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {turnover.guestName && (
                                <span data-testid={`text-turnover-guest-${turnover.reservationId}`}>{turnover.guestName}</span>
                              )}
                              {turnover.confirmationCode && (
                                <span className="font-mono" data-testid={`text-turnover-confirmation-${turnover.reservationId}`}>#{turnover.confirmationCode}</span>
                              )}
                              {turnover.platform && (
                                <span data-testid={`text-turnover-platform-${turnover.reservationId}`}>{turnover.platform}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0" data-testid={`text-turnover-assigned-${turnover.reservationId}`}>
                        {turnover.assignment ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            {turnover.assignment.cleanerType === 'company' ? (
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            ) : turnover.assignment.cleanerType === 'cleaning_manager' ? (
                              <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            ) : (
                              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            )}
                            <span className="text-sm truncate">{turnover.assignment.cleanerName}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unassigned</span>
                        )}
                      </div>
                      <div data-testid={`text-turnover-checkout-${turnover.reservationId}`}>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm">{turnover.checkOutDate ? formatDate(turnover.checkOutDate) : "N/A"}</span>
                        </div>
                        <span className="text-xs text-muted-foreground ml-5" data-testid={`text-turnover-checkout-time-${turnover.reservationId}`}>
                          {checkoutTime || "N/A"}
                        </span>
                      </div>
                      <div data-testid={`text-turnover-mode-${turnover.reservationId}`}>
                        {turnover.assignment ? (
                          <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">
                            {turnover.assignment.assignmentMode === 'auto' ? 'Auto' : 'Manual'}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                      </div>
                      <div data-testid={`text-turnover-offered-${turnover.reservationId}`}>
                        {turnover.offered ? (
                          <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            Yes
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">
                            No
                          </Badge>
                        )}
                      </div>
                      <div data-testid={`text-turnover-accepted-${turnover.reservationId}`}>
                        {task ? (
                          task.cleanerAccepted === true ? (
                            <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                              <CircleCheck className="h-3 w-3 mr-1" />
                              Accepted
                            </Badge>
                          ) : task.cleanerAccepted === false ? (
                            <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                              <X className="h-3 w-3 mr-1" />
                              Declined
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">
                              <CircleDashed className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                      </div>
                      <div data-testid={`badge-turnover-status-${turnover.reservationId}`}>
                        <Badge
                          variant="secondary"
                          className={`text-xs no-default-hover-elevate no-default-active-elevate ${cleaningStatusColor(cleaningStatus)}`}
                        >
                          {cleaningStatus}
                        </Badge>
                      </div>
                      <div>
                        {task ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-turnover-actions-${turnover.reservationId}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => setReassignTaskId(task.id)}
                                data-testid={`button-reassign-${turnover.reservationId}`}
                              >
                                <Repeat className="h-4 w-4 mr-2" />
                                Reassign Cleaner
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="properties">
          <div className="mt-4">
            {listings.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <Home className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2" data-testid="text-no-properties">No properties found</h3>
                  <p className="text-muted-foreground">
                    Sync your listings from Hospitable to assign cleaning procedures.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="border rounded-md overflow-x-auto">
                <div className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-4 px-4 py-3 border-b bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wide min-w-[700px]">
                  <span data-testid="header-properties-name">Property</span>
                  <span data-testid="header-properties-assigned">Assigned Cleaner</span>
                  <span data-testid="header-properties-procedure">Default Procedure</span>
                  <span data-testid="header-properties-mode">Mode</span>
                  <span data-testid="header-properties-default-member">Default Member</span>
                </div>
                <div className="divide-y min-w-[700px]">
                  {listings.map((listing) => {
                    const activeAssignments = allAssignments.filter(a => a.listingId === listing.id && a.isActive);
                    const assignment = activeAssignments[0];
                    const assignedCleaner = assignment ? cleaners.find(c => c.id === assignment.cleanerId) : null;
                    const defaultMember = assignment?.defaultMemberId ? cleaners.find(c => c.id === assignment.defaultMemberId) : null;

                    return (
                      <div
                        key={listing.id}
                        className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-4 px-4 py-3 items-center"
                        data-testid={`row-property-${listing.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {listing.imageUrl ? (
                            <img
                              src={listing.imageUrl}
                              alt={listing.internalName || listing.name}
                              className="h-10 w-10 rounded-md object-cover shrink-0"
                              data-testid={`img-property-${listing.id}`}
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0" data-testid={`img-property-fallback-${listing.id}`}>
                              <Home className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <p className="text-sm font-medium truncate" data-testid={`text-property-name-${listing.id}`}>
                            {listing.internalName || listing.name}
                          </p>
                        </div>
                        <div className="min-w-0" data-testid={`text-assigned-cleaner-${listing.id}`}>
                          {assignedCleaner ? (
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge variant="secondary" className="text-xs shrink-0 no-default-hover-elevate no-default-active-elevate">
                                {assignedCleaner.type === "company" ? (
                                  <Building2 className="h-3 w-3 mr-1" />
                                ) : assignedCleaner.type === "cleaning_manager" ? (
                                  <UserCog className="h-3 w-3 mr-1" />
                                ) : (
                                  <User className="h-3 w-3 mr-1" />
                                )}
                                {assignedCleaner.type === "company" ? "Company" : assignedCleaner.type === "cleaning_manager" ? "Manager" : "Individual"}
                              </Badge>
                              <span className="text-sm truncate">{assignedCleaner.name}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Not assigned</span>
                          )}
                        </div>
                        <div>
                          <Select
                            value={listing.defaultProcedureId || "none"}
                            onValueChange={(val) => {
                              updateListingProcedureMutation.mutate({
                                listingId: listing.id,
                                procedureId: val === "none" ? null : val,
                              });
                            }}
                          >
                            <SelectTrigger data-testid={`select-procedure-${listing.id}`}>
                              <SelectValue placeholder="No procedure assigned" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No procedure</SelectItem>
                              {procedures.map((proc) => (
                                <SelectItem key={proc.id} value={proc.id} data-testid={`option-procedure-${proc.id}`}>
                                  {proc.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div data-testid={`text-assignment-mode-${listing.id}`}>
                          {assignment ? (
                            <Badge
                              variant={assignment.assignmentMode === "auto" ? "default" : "outline"}
                              className="text-xs no-default-hover-elevate no-default-active-elevate"
                            >
                              {assignment.assignmentMode === "auto" ? "Auto" : "Manual"}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </div>
                        <div className="min-w-[100px]" data-testid={`text-default-member-${listing.id}`}>
                          {assignment?.assignmentMode === "auto" && defaultMember ? (
                            <span className="text-sm truncate">{defaultMember.name}</span>
                          ) : assignment?.assignmentMode === "auto" ? (
                            <span className="text-sm text-muted-foreground">Not set</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="templates">
          <NotificationTemplateEditor />
        </TabsContent>
      </Tabs>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Cleaner</DialogTitle>
            <DialogDescription>
              Add an individual cleaner, cleaning company, or cleaning manager to your team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Type</Label>
              <Select
                value={cleanerForm.type}
                onValueChange={(val) => setCleanerForm((prev) => ({ ...prev, type: val }))}
              >
                <SelectTrigger data-testid="select-cleaner-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual" data-testid="option-type-individual">
                    Individual Cleaner
                  </SelectItem>
                  <SelectItem value="company" data-testid="option-type-company">
                    Cleaning Company
                  </SelectItem>
                  <SelectItem value="cleaning_manager" data-testid="option-type-cleaning-manager">
                    Cleaning Manager
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cleaner-name">{cleanerForm.type === 'company' ? 'Company Name' : cleanerForm.type === 'cleaning_manager' ? 'Manager Title' : 'Name'}</Label>
              <Input
                id="cleaner-name"
                value={cleanerForm.name}
                onChange={(e) => setCleanerForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={cleanerForm.type === 'company' ? 'e.g. Sparkle Cleaning Co.' : cleanerForm.type === 'cleaning_manager' ? 'e.g. West Side Manager' : 'Full name'}
                data-testid="input-cleaner-name"
              />
            </div>
            {(cleanerForm.type === 'company' || cleanerForm.type === 'cleaning_manager') && (
              <>
                <div className="border-t pt-3 mt-1">
                  <p className="text-xs text-muted-foreground mb-3">Contact person who will manage this {cleanerForm.type === 'company' ? 'company' : 'team'}</p>
                </div>
                <div>
                  <Label htmlFor="cleaner-contact-name">Contact Person Name</Label>
                  <Input
                    id="cleaner-contact-name"
                    value={cleanerForm.contactName}
                    onChange={(e) => setCleanerForm((prev) => ({ ...prev, contactName: e.target.value }))}
                    placeholder="Full name of the contact person"
                    data-testid="input-cleaner-contact-name"
                  />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="cleaner-email">{(cleanerForm.type === 'company' || cleanerForm.type === 'cleaning_manager') ? 'Contact Email' : 'Email'}</Label>
              <Input
                id="cleaner-email"
                type="email"
                value={cleanerForm.email}
                onChange={(e) => setCleanerForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="email@example.com"
                data-testid="input-cleaner-email"
              />
            </div>
            <div>
              <Label htmlFor="cleaner-phone">{(cleanerForm.type === 'company' || cleanerForm.type === 'cleaning_manager') ? 'Contact Phone' : 'Phone'}</Label>
              <Input
                id="cleaner-phone"
                type="tel"
                value={cleanerForm.phone}
                onChange={(e) => setCleanerForm((prev) => ({ ...prev, phone: formatPhoneNumber(e.target.value) }))}
                placeholder="+1 (555) 000-0000"
                data-testid="input-cleaner-phone"
              />
              {getPhoneError(cleanerForm.phone) && (
                <p className="text-xs text-destructive mt-1" data-testid="error-cleaner-phone">{getPhoneError(cleanerForm.phone)}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} data-testid="button-cancel-create">
              Cancel
            </Button>
            <Button
              onClick={() => createCleanerMutation.mutate(cleanerForm)}
              disabled={!cleanerForm.name.trim() || !isValidPhone(cleanerForm.phone) || createCleanerMutation.isPending}
              data-testid="button-create-cleaner"
            >
              {createCleanerMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!selectedCleanerId} onOpenChange={(open) => !open && setSelectedCleanerId(null)}>
        <SheetContent className="sm:max-w-lg flex flex-col overflow-hidden">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {selectedCleaner?.type === 'company' ? (
                <Building2 className="h-5 w-5" />
              ) : selectedCleaner?.type === 'cleaning_manager' ? (
                <Shield className="h-5 w-5" />
              ) : (
                <User className="h-5 w-5" />
              )}
              {selectedCleaner?.name || "Cleaner Details"}
              {selectedCleaner?.type === 'company' && (
                <Badge variant="secondary" className="text-xs">Company</Badge>
              )}
              {selectedCleaner?.type === 'cleaning_manager' && (
                <Badge variant="secondary" className="text-xs">Manager</Badge>
              )}
            </SheetTitle>
            <SheetDescription>
              {selectedCleaner?.type === 'company'
                ? "Manage company details, team members, notifications, and property assignments"
                : selectedCleaner?.type === 'cleaning_manager'
                ? "Manage cleaning manager details, notifications, and turnover assignments"
                : "Manage cleaner details, notifications, and property assignments"
              }
            </SheetDescription>
          </SheetHeader>

          {cleanerDetailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedCleaner ? (
            <div className="mt-6 space-y-6 flex-1 overflow-y-auto min-h-0">
              <div className="flex items-center justify-end gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-cleaner-actions">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleStartEdit} data-testid="button-edit-cleaner">
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => deleteCleanerMutation.mutate(selectedCleaner.id)}
                      className="text-destructive"
                      data-testid="button-delete-cleaner"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {isEditing ? (
                <div className="space-y-4 border-t pt-4">
                  <div>
                    <Label htmlFor="edit-name">Name</Label>
                    <Input
                      id="edit-name"
                      value={editForm.name}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                      data-testid="input-edit-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-email">Email</Label>
                    <Input
                      id="edit-email"
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                      data-testid="input-edit-email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-phone">Phone</Label>
                    <Input
                      id="edit-phone"
                      type="tel"
                      value={editForm.phone}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, phone: formatPhoneNumber(e.target.value) }))}
                      placeholder="+1 (555) 000-0000"
                      data-testid="input-edit-phone"
                    />
                    {getPhoneError(editForm.phone) && (
                      <p className="text-xs text-destructive mt-1" data-testid="error-edit-phone">{getPhoneError(editForm.phone)}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Button variant="outline" onClick={() => setIsEditing(false)} data-testid="button-cancel-edit">
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveEdit}
                      disabled={!editForm.name.trim() || !isValidPhone(editForm.phone) || updateCleanerMutation.isPending}
                      data-testid="button-save-edit"
                    >
                      {updateCleanerMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 border-t pt-4">
                  {selectedCleaner.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span data-testid="text-detail-email">{selectedCleaner.email}</span>
                    </div>
                  )}
                  {selectedCleaner.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span data-testid="text-detail-phone">{selectedCleaner.phone}</span>
                    </div>
                  )}
                </div>
              )}

              {(selectedCleaner.type === 'company' || selectedCleaner.type === 'cleaning_manager') && (
                <div className="border-t pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="font-medium">
                      Team Members ({selectedCleaner.members?.length || 0})
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddMemberDialogOpen(true)}
                      data-testid="button-add-member"
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Member
                    </Button>
                  </div>
                  {selectedCleaner.members && selectedCleaner.members.length > 0 ? (
                    <div className="space-y-2">
                      {selectedCleaner.members.map((member) => {
                        const isExpanded = expandedMemberId === member.id;
                        const companyPropertyIds = selectedCleaner.assignments?.map(a => a.listingId) || [];
                        const memberAssignedIds = new Set(
                          expandedMemberDetail?.assignments?.map(a => a.listingId) || []
                        );
                        const companyProperties = selectedCleaner.assignments?.filter(a => companyPropertyIds.includes(a.listingId)) || [];

                        return (
                          <div
                            key={member.id}
                            className="border rounded-md bg-background"
                            data-testid={`member-${member.id}`}
                          >
                            <div className="flex items-center justify-between gap-2 p-3">
                              <div
                                className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                                onClick={() => setExpandedMemberId(isExpanded ? null : member.id)}
                                data-testid={`button-expand-member-${member.id}`}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium truncate" data-testid={`text-member-name-${member.id}`}>
                                    {member.name}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                    {member.email && <span>{member.email}</span>}
                                    {member.phone && <span>{member.phone}</span>}
                                    {isExpanded && expandedMemberDetail?.assignments && (
                                      <span>{expandedMemberDetail.assignments.length} {expandedMemberDetail.assignments.length === 1 ? 'property' : 'properties'}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); handleDeleteMember(member); }}
                                disabled={checkingDeps}
                                data-testid={`button-delete-member-${member.id}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            {isExpanded && (
                              <div className="px-3 pb-3 pt-0 border-t">
                                <p className="text-xs font-medium text-muted-foreground mt-3 mb-2">
                                  Assign company properties to this member
                                </p>
                                {companyProperties.length > 0 ? (
                                  <div className="space-y-1">
                                    {companyProperties.map((assignment) => {
                                      const isAssigned = isExpanded && memberAssignedIds.has(assignment.listingId);
                                      const memberAssignment = expandedMemberDetail?.assignments?.find(a => a.listingId === assignment.listingId);
                                      return (
                                        <label
                                          key={assignment.listingId}
                                          className="flex items-center gap-3 p-2 rounded-md cursor-pointer hover-elevate"
                                          data-testid={`member-property-${member.id}-${assignment.listingId}`}
                                        >
                                          <Checkbox
                                            checked={isAssigned}
                                            disabled={memberAssignMutation.isPending || memberUnassignMutation.isPending}
                                            onCheckedChange={(checked) => {
                                              if (checked) {
                                                memberAssignMutation.mutate({
                                                  memberId: member.id,
                                                  listingId: assignment.listingId,
                                                  procedureId: assignment.procedureId || undefined,
                                                });
                                              } else if (memberAssignment) {
                                                memberUnassignMutation.mutate(memberAssignment.id);
                                              }
                                            }}
                                            data-testid={`checkbox-member-property-${member.id}-${assignment.listingId}`}
                                          />
                                          {assignment.listing?.imageUrl ? (
                                            <img
                                              src={assignment.listing.imageUrl}
                                              alt={assignment.listing.internalName || assignment.listing.name}
                                              className="h-7 w-7 rounded-md object-cover shrink-0"
                                            />
                                          ) : (
                                            <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                                              <Home className="h-3.5 w-3.5 text-muted-foreground" />
                                            </div>
                                          )}
                                          <span className="text-sm truncate min-w-0 flex-1">
                                            {assignment.listing?.internalName || assignment.listing?.name || "Unknown"}
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    No properties assigned to the company yet. Assign properties to the company first, then you can assign them to team members.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No team members yet. Add members to assign them to cleaning tasks.</p>
                  )}
                </div>
              )}

              <div className="border-t pt-4">
                <h3 className="font-medium mb-3">
                  Assigned Properties ({selectedCleaner.assignments?.length || 0})
                </h3>
                {selectedCleaner.assignments && selectedCleaner.assignments.length > 0 ? (
                  <div className="space-y-2">
                    {[...selectedCleaner.assignments].sort((a, b) => {
                      const nameA = (a.listing?.internalName || a.listing?.name || "").toLowerCase();
                      const nameB = (b.listing?.internalName || b.listing?.name || "").toLowerCase();
                      return nameA.localeCompare(nameB);
                    }).map((assignment) => {
                      const isCompanyOrManager = selectedCleaner.type === 'company' || selectedCleaner.type === 'cleaning_manager';
                      const members = selectedCleaner.members || [];
                      const currentMode = (assignment as any).assignmentMode || "manual";
                      const currentDefaultMember = (assignment as any).defaultMemberId || null;
                      const assignedMemberName = currentDefaultMember
                        ? members.find(m => m.id === currentDefaultMember)?.name
                        : null;

                      return (
                        <div
                          key={assignment.id}
                          className="p-3 border rounded-md bg-background space-y-2"
                          data-testid={`assignment-${assignment.id}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {assignment.listing?.imageUrl ? (
                                <img
                                  src={assignment.listing.imageUrl}
                                  alt={assignment.listing.internalName || assignment.listing.name}
                                  className="h-8 w-8 rounded-md object-cover shrink-0"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                                  <Home className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {assignment.listing?.internalName || assignment.listing?.name || "Unknown listing"}
                                </p>
                                {assignment.procedure && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {assignment.procedure.title}
                                  </p>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteAssignmentMutation.mutate(assignment.id)}
                              data-testid={`button-delete-assignment-${assignment.id}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>

                          {isCompanyOrManager && members.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 pl-11">
                              <Select
                                value={currentMode}
                                onValueChange={(mode) => {
                                  updateAssignmentMutation.mutate({
                                    id: assignment.id,
                                    data: {
                                      assignmentMode: mode,
                                      defaultMemberId: mode === "manual" ? null : currentDefaultMember,
                                    },
                                  });
                                }}
                              >
                                <SelectTrigger className="w-[130px]" data-testid={`select-assignment-mode-${assignment.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="manual">Manual</SelectItem>
                                  <SelectItem value="auto">Auto-assign</SelectItem>
                                </SelectContent>
                              </Select>
                              {currentMode === "auto" && (
                                <Select
                                  value={currentDefaultMember || ""}
                                  onValueChange={(memberId) => {
                                    updateAssignmentMutation.mutate({
                                      id: assignment.id,
                                      data: {
                                        assignmentMode: "auto",
                                        defaultMemberId: memberId || null,
                                      },
                                    });
                                  }}
                                >
                                  <SelectTrigger className="w-[170px]" data-testid={`select-default-member-${assignment.id}`}>
                                    <SelectValue placeholder="Select cleaner" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {members.map((m) => (
                                      <SelectItem key={m.id} value={m.id}>
                                        {m.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              {currentMode === "manual" && (
                                <span className="text-xs text-muted-foreground">Assign per turnover</span>
                              )}
                              {currentMode === "auto" && assignedMemberName && (
                                <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">
                                  {assignedMemberName}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No properties assigned yet.</p>
                )}

                <div className="mt-4 space-y-3">
                  <h4 className="text-sm font-medium">Add Properties</h4>
                  {(() => {
                    const assignedIds = new Set(selectedCleaner.assignments?.map(a => a.listingId) || []);
                    const availableListings = listings.filter(l => !assignedIds.has(l.id));
                    if (availableListings.length === 0) {
                      return (
                        <p className="text-sm text-muted-foreground" data-testid="text-all-assigned">
                          All properties are already assigned.
                        </p>
                      );
                    }
                    return (
                      <>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAssignListingIds(availableListings.map(l => l.id))}
                            disabled={assignListingIds.length === availableListings.length}
                            data-testid="button-select-all-listings"
                          >
                            Select All
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAssignListingIds([])}
                            disabled={assignListingIds.length === 0}
                            data-testid="button-deselect-all-listings"
                          >
                            Deselect All
                          </Button>
                        </div>
                        <ScrollArea className="border rounded-md">
                          <div className="p-2 space-y-1">
                            {availableListings.map((l) => {
                              const isSelected = assignListingIds.includes(l.id);
                              return (
                                <label
                                  key={l.id}
                                  className="flex items-center gap-3 p-2 rounded-md cursor-pointer hover-elevate"
                                  data-testid={`listing-option-${l.id}`}
                                >
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleListingSelection(l.id)}
                                    data-testid={`checkbox-listing-${l.id}`}
                                  />
                                  {l.imageUrl ? (
                                    <img
                                      src={l.imageUrl}
                                      alt={l.internalName || l.name}
                                      className="h-8 w-8 rounded-md object-cover shrink-0"
                                      data-testid={`img-listing-${l.id}`}
                                    />
                                  ) : (
                                    <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                                      <Home className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  )}
                                  <span className="text-sm truncate min-w-0 flex-1">{l.internalName || l.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : null}

          {selectedCleaner && !isEditing && !cleanerDetailLoading && (() => {
            const assignedIds = new Set(selectedCleaner.assignments?.map(a => a.listingId) || []);
            const hasAvailable = listings.some(l => !assignedIds.has(l.id));
            if (!hasAvailable) return null;
            return (
              <div className="border-t pt-3 pb-1 shrink-0 flex items-center justify-between gap-2">
                {assignListingIds.length > 0 && (
                  <p className="text-xs text-muted-foreground" data-testid="text-selected-count">
                    {assignListingIds.length} {assignListingIds.length === 1 ? "property" : "properties"} selected
                  </p>
                )}
                <Button
                  onClick={handleAssign}
                  disabled={assignListingIds.length === 0 || createAssignmentMutation.isPending}
                  className="ml-auto"
                  data-testid="button-assign"
                >
                  {createAssignmentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Assign {assignListingIds.length > 0 ? `(${assignListingIds.length})` : ""}
                </Button>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      <Dialog open={addMemberDialogOpen} onOpenChange={setAddMemberDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              Add a team member to {selectedCleaner?.name || "this company"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="member-name">Name</Label>
              <Input
                id="member-name"
                value={memberForm.name}
                onChange={(e) => setMemberForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Full name"
                data-testid="input-member-name"
              />
            </div>
            <div>
              <Label htmlFor="member-email">Email</Label>
              <Input
                id="member-email"
                type="email"
                value={memberForm.email}
                onChange={(e) => setMemberForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="email@example.com"
                data-testid="input-member-email"
              />
            </div>
            <div>
              <Label htmlFor="member-phone">Phone</Label>
              <Input
                id="member-phone"
                type="tel"
                value={memberForm.phone}
                onChange={(e) => setMemberForm((prev) => ({ ...prev, phone: formatPhoneNumber(e.target.value) }))}
                placeholder="+1 (555) 000-0000"
                data-testid="input-member-phone"
              />
              {getPhoneError(memberForm.phone) && (
                <p className="text-xs text-destructive mt-1" data-testid="error-member-phone">{getPhoneError(memberForm.phone)}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberDialogOpen(false)} data-testid="button-cancel-add-member">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedCleanerId) {
                  addMemberMutation.mutate({ companyId: selectedCleanerId, data: memberForm });
                }
              }}
              disabled={!memberForm.name.trim() || !isValidPhone(memberForm.phone) || addMemberMutation.isPending}
              data-testid="button-create-member"
            >
              {addMemberMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reassignTaskId} onOpenChange={(open) => !open && setReassignTaskId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign Cleaner</DialogTitle>
            <DialogDescription>
              Select a cleaner to assign to this turnover. The acceptance status will be reset.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {topLevelCleaners
              .filter(c => c.type !== 'cleaning_manager')
              .map((cleaner) => {
                const reassignTurnover = turnovers.find(t => t.cleaningTask?.id === reassignTaskId);
                const isCurrentCleaner = reassignTurnover?.cleaningTask?.cleanerId === cleaner.id;
                return (
                  <Button
                    key={cleaner.id}
                    variant="outline"
                    className={`w-full flex items-center justify-between gap-3 p-3 h-auto ${isCurrentCleaner ? 'border-primary bg-primary/5' : ''}`}
                    disabled={isCurrentCleaner || reassignCleanerMutation.isPending}
                    onClick={() => {
                      if (!isCurrentCleaner && reassignTaskId) {
                        reassignCleanerMutation.mutate({ taskId: reassignTaskId, cleanerId: cleaner.id });
                      }
                    }}
                    data-testid={`button-reassign-option-${cleaner.id}`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {cleaner.type === 'company' ? (
                        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 text-left">
                        <span className="text-sm font-medium truncate block">{cleaner.name}</span>
                        <span className="text-xs text-muted-foreground block">
                          {cleaner.type === 'company' ? 'Company' : 'Individual'}
                        </span>
                      </span>
                    </span>
                    {isCurrentCleaner && (
                      <Badge variant="secondary" className="text-xs shrink-0 no-default-hover-elevate no-default-active-elevate">
                        Current
                      </Badge>
                    )}
                    {reassignCleanerMutation.isPending && !isCurrentCleaner && (
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    )}
                  </Button>
                );
              })}
            {topLevelCleaners.filter(c => c.type !== 'cleaning_manager').length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-cleaners-available">
                No cleaners available. Add individual cleaners or companies first.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignTaskId(null)} data-testid="button-cancel-reassign">
              Cancel
            </Button>
            {turnovers.find(t => t.cleaningTask?.id === reassignTaskId)?.cleaningTask?.cleanerId && (
              <Button
                variant="outline"
                onClick={() => {
                  if (reassignTaskId) {
                    reassignCleanerMutation.mutate({ taskId: reassignTaskId, cleanerId: null });
                  }
                }}
                disabled={reassignCleanerMutation.isPending}
                data-testid="button-unassign-cleaner"
              >
                Unassign
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!memberToDelete} onOpenChange={(open) => { if (!open) { setMemberToDelete(null); setMemberDeps(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Team Member</DialogTitle>
            <DialogDescription>
              {memberDeps && (memberDeps.activeTasks.length > 0 || memberDeps.autoAssignRules.length > 0) ? (
                <>
                  <span className="font-medium">{memberToDelete?.name}</span> is currently assigned to tasks or auto-assign rules. Select a replacement team member before removing.
                </>
              ) : (
                <>Are you sure you want to remove <span className="font-medium">{memberToDelete?.name}</span> from the team?</>
              )}
            </DialogDescription>
          </DialogHeader>

          {memberDeps && (memberDeps.activeTasks.length > 0 || memberDeps.autoAssignRules.length > 0) && (
            <div className="space-y-3">
              {memberDeps.activeTasks.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Active Turnovers ({memberDeps.activeTasks.length})</p>
                  <div className="space-y-1 max-h-[120px] overflow-y-auto">
                    {memberDeps.activeTasks.map((task) => (
                      <div key={task.id} className="text-xs text-muted-foreground flex items-center justify-between gap-2" data-testid={`dep-task-${task.id}`}>
                        <span className="truncate">{task.listingName}</span>
                        <span className="shrink-0">{new Date(task.scheduledDate).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {memberDeps.autoAssignRules.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Auto-assign Rules ({memberDeps.autoAssignRules.length})</p>
                  <div className="space-y-1 max-h-[120px] overflow-y-auto">
                    {memberDeps.autoAssignRules.map((rule) => (
                      <div key={rule.id} className="text-xs text-muted-foreground" data-testid={`dep-rule-${rule.id}`}>
                        {rule.listingName}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <Label>Replace with</Label>
                <Select value={replacementMemberId} onValueChange={setReplacementMemberId}>
                  <SelectTrigger data-testid="select-replacement-member">
                    <SelectValue placeholder="Select replacement" />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedCleaner?.members || [])
                      .filter((m) => m.id !== memberToDelete?.id)
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id} data-testid={`replacement-option-${m.id}`}>
                          {m.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setMemberToDelete(null); setMemberDeps(null); }} data-testid="btn-cancel-delete-member">
              Cancel
            </Button>
            {memberDeps && (memberDeps.activeTasks.length > 0 || memberDeps.autoAssignRules.length > 0) ? (
              <Button
                variant="destructive"
                onClick={() => memberToDelete && replaceAndDeleteMutation.mutate({ memberId: memberToDelete.id, replacementId: replacementMemberId || null })}
                disabled={!replacementMemberId || replaceAndDeleteMutation.isPending}
                data-testid="btn-confirm-replace-delete"
              >
                {replaceAndDeleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Replace & Remove
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => memberToDelete && deleteMemberMutation.mutate(memberToDelete.id)}
                disabled={deleteMemberMutation.isPending}
                data-testid="btn-confirm-delete-member"
              >
                {deleteMemberMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Remove
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
