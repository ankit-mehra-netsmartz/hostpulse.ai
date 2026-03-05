import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Pencil, Trash2, Save, X, AlertCircle, FileText, Loader2, Cpu, DollarSign, Clock, Settings, ArrowUpDown, ArrowUp, ArrowDown, CalendarIcon, User, ChevronDown, ChevronRight, Users, ExternalLink, Webhook, Search, Wrench, Upload, Download, Copy, Check, Zap, Play, Timer, History, Folder, RefreshCw, Heart, GripVertical, Send, Bell, Mail, Sparkles, Shield, ShieldOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Link } from "wouter";
import { format, subDays, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import type { AiPrompt, AiUsageLogWithUser, AIModelId, User as UserType, WebhookLog } from "@shared/schema";
import { AI_MODELS, ACCOUNT_TYPES } from "@shared/schema";
import type { DateRange } from "react-day-picker";

// Calculate average cost per 1K tokens for heatmap coloring
const getModelAvgCost = (modelId: string) => {
  const model = AI_MODELS[modelId as AIModelId];
  if (!model) return 0;
  return (model.inputCost + model.outputCost) / 2;
};

// Get all model average costs for normalization
const allModelCosts = Object.keys(AI_MODELS).map(getModelAvgCost);
const minCost = Math.min(...allModelCosts);
const maxCost = Math.max(...allModelCosts);

// Returns a heatmap color from green (cheap) to red (expensive)
const getPriceHeatmapColor = (modelId: string) => {
  const avgCost = getModelAvgCost(modelId);
  if (maxCost === minCost) return "bg-green-500";
  const normalized = (avgCost - minCost) / (maxCost - minCost);
  if (normalized < 0.2) return "bg-green-500";
  if (normalized < 0.4) return "bg-lime-500";
  if (normalized < 0.6) return "bg-yellow-500";
  if (normalized < 0.8) return "bg-orange-500";
  return "bg-red-500";
};

type SortField = "createdAt" | "inputTokens" | "outputTokens" | "estimatedCost";
type SortDirection = "asc" | "desc";
type DateRangePreset = "today" | "7days" | "30days" | "90days" | "custom";

interface ChangelogEntry {
  id: string;
  title: string;
  description: string;
  location?: string | null;
  hostBenefit?: string | null;
  commitHash?: string | null;
  status: "suggested" | "approved" | "sent" | "dismissed";
  suggestedAt?: string | null;
  approvedAt?: string | null;
  sentAt?: string | null;
  createdAt?: string | null;
}

interface ChangelogSettings {
  id?: string;
  sendTime: string;
  notificationType: "email" | "in_app" | "both";
  isEnabled: boolean;
  lastSentAt?: string | null;
  // Auto-suggest settings
  suggestTime: string;
  suggestIntervalDays: number;
  suggestEnabled: boolean;
  lastProcessedCommit?: string | null;
  lastSuggestRunAt?: string | null;
}

const INTERVAL_OPTIONS = [
  { value: 1, label: "Daily" },
  { value: 2, label: "Every 2 days" },
  { value: 3, label: "Every 3 days" },
  { value: 7, label: "Weekly" },
];

const EASTERN_TIME_OPTIONS = [
  { value: "06:00", label: "6:00 AM ET" },
  { value: "07:00", label: "7:00 AM ET" },
  { value: "08:00", label: "8:00 AM ET" },
  { value: "09:00", label: "9:00 AM ET" },
  { value: "10:00", label: "10:00 AM ET" },
  { value: "11:00", label: "11:00 AM ET" },
  { value: "12:00", label: "12:00 PM ET" },
  { value: "14:00", label: "2:00 PM ET" },
  { value: "16:00", label: "4:00 PM ET" },
  { value: "18:00", label: "6:00 PM ET" },
  { value: "20:00", label: "8:00 PM ET" },
];

class ChangelogErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ChangelogManagement Error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Card data-testid="card-changelog-error">
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Changelog</CardTitle>
            <CardDescription>An error occurred while loading the changelog management.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-muted-foreground whitespace-pre-wrap">{this.state.error?.message}</pre>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

// =====================
// Permissions Management Component
// =====================

interface NavItemInfo {
  id: string;
  title: string;
  parent: string | null;
}

interface Permission {
  id: string;
  role: string;
  navItemId: string;
  enabled: boolean;
}

interface PermissionsData {
  navItems: NavItemInfo[];
  permissions: Permission[];
}

interface TemplateStep {
  id?: string;
  stepOrder: number;
  label: string;
  description?: string | null;
  moduleTitle?: string | null;
  moduleOrder?: number | null;
  requiresPhotoVerification: boolean;
  photoVerificationMode: string;
  requiresGpsVerification: boolean;
  gpsRadiusMeters?: number | null;
}

interface ProcedureTemplateData {
  id: string;
  title: string;
  description?: string | null;
  updatedByUserId?: string | null;
  steps: TemplateStep[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

function ProcedureTemplateManagement() {
  const { toast } = useToast();
  const [editMode, setEditMode] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<TemplateStep[]>([]);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const { data: template, isLoading } = useQuery<ProcedureTemplateData | null>({
    queryKey: ["/api/admin/procedure-template"],
  });

  const { data: allProcedures } = useQuery<any[]>({
    queryKey: ["/api/admin/all-procedures"],
    enabled: importDialogOpen,
  });

  const startEditing = () => {
    if (template) {
      setTitle(template.title);
      setDescription(template.description || "");
      setSteps(template.steps.map(s => ({ ...s })));
    } else {
      setTitle("");
      setDescription("");
      setSteps([]);
    }
    setEditMode(true);
  };

  const addStep = () => {
    setSteps(prev => [...prev, {
      stepOrder: prev.length + 1,
      label: "",
      requiresPhotoVerification: false,
      photoVerificationMode: "none",
      requiresGpsVerification: false,
    }]);
  };

  const updateStep = (index: number, field: string, value: any) => {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const removeStep = (index: number) => {
    setSteps(prev => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, stepOrder: i + 1 })));
  };

  const moveStep = (index: number, direction: "up" | "down") => {
    const newSteps = [...steps];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newSteps.length) return;
    [newSteps[index], newSteps[swapIndex]] = [newSteps[swapIndex], newSteps[index]];
    setSteps(newSteps.map((s, i) => ({ ...s, stepOrder: i + 1 })));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/admin/procedure-template", {
        title,
        description: description || undefined,
        steps: steps.map(({ id, ...rest }) => rest),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/procedure-template"] });
      setEditMode(false);
      toast({ title: "Template saved", description: "The procedure template has been updated. New workspaces will use this template." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save template", variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (procedureId: string) => {
      const res = await apiRequest("POST", `/api/admin/procedure-template/import/${procedureId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/procedure-template"] });
      setImportDialogOpen(false);
      setEditMode(false);
      toast({ title: "Imported", description: "Procedure imported as the default template." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to import procedure", variant: "destructive" });
    },
  });

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-32 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Folder className="h-5 w-5" />
                Default Procedure Template
              </CardTitle>
              <CardDescription>
                This template is automatically added as a Draft procedure when a new workspace is created.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!editMode && (
                <>
                  <Button variant="outline" onClick={() => setImportDialogOpen(true)} data-testid="button-import-procedure">
                    <Upload className="h-4 w-4 mr-2" />
                    Import from Existing
                  </Button>
                  <Button onClick={startEditing} data-testid="button-edit-template">
                    <Pencil className="h-4 w-4 mr-2" />
                    {template ? "Edit Template" : "Create Template"}
                  </Button>
                </>
              )}
              {editMode && (
                <>
                  <Button variant="outline" onClick={() => setEditMode(false)} data-testid="button-cancel-template">
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || !title.trim() || steps.length === 0}
                    data-testid="button-save-template"
                  >
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Template
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {editMode ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Standard Cleaning Turnover"
                  data-testid="input-template-title"
                />
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe this procedure template..."
                  data-testid="input-template-description"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label>Steps ({steps.length})</Label>
                  <Button variant="outline" size="sm" onClick={addStep} data-testid="button-add-template-step">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Step
                  </Button>
                </div>
                {steps.length === 0 && (
                  <div className="text-sm text-muted-foreground p-4 border border-dashed rounded-md text-center">
                    No steps yet. Add steps or import from an existing procedure.
                  </div>
                )}
                <div className="space-y-2">
                  {steps.map((step, index) => (
                    <div key={index} className="flex items-start gap-2 p-3 border rounded-md" data-testid={`template-step-${index}`}>
                      <div className="flex flex-col gap-1 mt-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveStep(index, "up")} disabled={index === 0}>
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveStep(index, "down")} disabled={index === steps.length - 1}>
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">{step.stepOrder}</Badge>
                          <Input
                            value={step.label}
                            onChange={(e) => updateStep(index, "label", e.target.value)}
                            placeholder="Step name"
                            className="flex-1"
                            data-testid={`input-step-label-${index}`}
                          />
                        </div>
                        <div className="flex items-center gap-4 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={step.requiresGpsVerification}
                              onCheckedChange={(checked) => updateStep(index, "requiresGpsVerification", checked)}
                              data-testid={`switch-gps-${index}`}
                            />
                            <Label className="text-xs">GPS</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Select
                              value={step.photoVerificationMode}
                              onValueChange={(val) => updateStep(index, "photoVerificationMode", val)}
                            >
                              <SelectTrigger className="w-28" data-testid={`select-photo-mode-${index}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No Photo</SelectItem>
                                <SelectItem value="optional">Optional</SelectItem>
                                <SelectItem value="required">Required</SelectItem>
                              </SelectContent>
                            </Select>
                            <Label className="text-xs">Photo</Label>
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeStep(index)} data-testid={`button-remove-step-${index}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : template ? (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-lg">{template.title}</h3>
                {template.description && <p className="text-sm text-muted-foreground mt-1">{template.description}</p>}
                {template.updatedAt && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Last updated: {format(new Date(template.updatedAt), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Steps ({template.steps.length})</Label>
                <div className="space-y-1">
                  {template.steps.map((step, index) => (
                    <div key={step.id || index} className="flex items-center gap-2 p-2 rounded-md bg-muted/50" data-testid={`view-step-${index}`}>
                      <Badge variant="secondary" className="text-xs min-w-[24px] justify-center">{step.stepOrder}</Badge>
                      <span className="text-sm flex-1">{step.label}</span>
                      <div className="flex items-center gap-1">
                        {step.requiresGpsVerification && <Badge variant="outline" className="text-xs">GPS</Badge>}
                        {step.photoVerificationMode !== "none" && (
                          <Badge variant="outline" className="text-xs">
                            Photo: {step.photoVerificationMode}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center p-8 text-muted-foreground">
              <Folder className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No procedure template set</p>
              <p className="text-sm mt-1">Create a template or import one from an existing procedure.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Procedure as Template</DialogTitle>
            <DialogDescription>
              Select an existing procedure to use as the default template for new workspaces.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {!allProcedures ? (
              <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
            ) : allProcedures.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center p-4">No procedures found.</p>
            ) : (
              allProcedures.map((proc: any) => (
                <div
                  key={proc.id}
                  className="flex items-center justify-between gap-2 p-3 border rounded-md hover-elevate cursor-pointer"
                  onClick={() => importMutation.mutate(proc.id)}
                  data-testid={`import-procedure-${proc.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{proc.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {proc.stepCount || 0} steps
                      <Badge variant="secondary" className="ml-2 text-xs">{proc.status}</Badge>
                    </div>
                  </div>
                  {importMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PermissionsManagement() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<PermissionsData>({
    queryKey: ["/api/admin/permissions"],
  });

  const updatePermissionMutation = useMutation({
    mutationFn: async (params: { role: string; navItemId: string; enabled: boolean }) => {
      const response = await apiRequest("PATCH", "/api/admin/permissions", params);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/permissions"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update permission", variant: "destructive" });
    },
  });

  const getPermission = (role: string, navItemId: string): boolean => {
    if (!data?.permissions) return true;
    const perm = data.permissions.find(p => p.role === role && p.navItemId === navItemId);
    return perm?.enabled ?? true;
  };

  const handleToggle = (role: string, navItemId: string, currentValue: boolean) => {
    updatePermissionMutation.mutate({ role, navItemId, enabled: !currentValue });
  };

  // Get parent items (items without a parent)
  const parentItems = data?.navItems.filter(item => item.parent === null) || [];
  
  // Get sub items for a parent
  const getSubItems = (parentId: string) => {
    return data?.navItems.filter(item => item.parent === parentId) || [];
  };

  if (isLoading) {
    return (
      <Card data-testid="card-permissions-loading">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Navigation Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-permissions">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Navigation Permissions
        </CardTitle>
        <CardDescription>
          Control which navigation items are visible to Manager and Member roles. 
          Super Admins and Account Admins always have full access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Navigation Item</TableHead>
                <TableHead className="text-center w-[150px]">Manager</TableHead>
                <TableHead className="text-center w-[150px]">Member</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parentItems.map(item => {
                const subItems = getSubItems(item.id);
                const hasSubItems = subItems.length > 0;
                
                return (
                  <React.Fragment key={item.id}>
                    <TableRow className={hasSubItems ? "bg-muted/30" : ""}>
                      <TableCell className="font-medium">
                        {item.title}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={getPermission("user_manager", item.id)}
                          onCheckedChange={() => handleToggle("user_manager", item.id, getPermission("user_manager", item.id))}
                          disabled={updatePermissionMutation.isPending}
                          data-testid={`switch-manager-${item.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={getPermission("user_staff", item.id)}
                          onCheckedChange={() => handleToggle("user_staff", item.id, getPermission("user_staff", item.id))}
                          disabled={updatePermissionMutation.isPending}
                          data-testid={`switch-member-${item.id}`}
                        />
                      </TableCell>
                    </TableRow>
                    {subItems.map(subItem => (
                      <TableRow key={subItem.id} className="border-l-4 border-l-muted">
                        <TableCell className="pl-8 text-muted-foreground">
                          {subItem.title}
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={getPermission("user_manager", subItem.id)}
                            onCheckedChange={() => handleToggle("user_manager", subItem.id, getPermission("user_manager", subItem.id))}
                            disabled={updatePermissionMutation.isPending}
                            data-testid={`switch-manager-${subItem.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={getPermission("user_staff", subItem.id)}
                            onCheckedChange={() => handleToggle("user_staff", subItem.id, getPermission("user_staff", subItem.id))}
                            disabled={updatePermissionMutation.isPending}
                            data-testid={`switch-member-${subItem.id}`}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
        
        <div className="mt-6 p-4 rounded-md bg-muted/50">
          <h4 className="font-medium mb-2">Role Descriptions</h4>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div><strong>Manager (user_manager):</strong> Can manage workspace operations and team members.</div>
            <div><strong>Member (user_staff):</strong> Standard workspace member with limited access.</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChangelogManagementInner() {
  const { toast } = useToast();
  const [editingEntry, setEditingEntry] = useState<ChangelogEntry | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newEntry, setNewEntry] = useState({ title: "", description: "", location: "", hostBenefit: "" });
  const [draggedEntry, setDraggedEntry] = useState<ChangelogEntry | null>(null);

  const { data: settings, isLoading: settingsLoading } = useQuery<ChangelogSettings>({
    queryKey: ["/api/admin/changelog/settings"],
  });

  const { data: entries = [], isLoading: entriesLoading } = useQuery<ChangelogEntry[]>({
    queryKey: ["/api/admin/changelog/entries"],
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<ChangelogSettings>) => {
      const response = await apiRequest("POST", "/api/admin/changelog/settings", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/changelog/settings"] });
      toast({ title: "Settings saved", description: "Changelog settings have been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    },
  });

  const createEntryMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; location?: string; hostBenefit?: string }) => {
      const response = await apiRequest("POST", "/api/admin/changelog/entries", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/changelog/entries"] });
      setIsCreating(false);
      setNewEntry({ title: "", description: "", location: "", hostBenefit: "" });
      toast({ title: "Entry created", description: "New changelog entry has been added." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create entry", variant: "destructive" });
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ChangelogEntry> }) => {
      const response = await apiRequest("PATCH", `/api/admin/changelog/entries/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/changelog/entries"] });
      setEditingEntry(null);
      toast({ title: "Entry updated", description: "Changelog entry has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update entry", variant: "destructive" });
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/changelog/entries/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/changelog/entries"] });
      toast({ title: "Entry deleted", description: "Changelog entry has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete entry", variant: "destructive" });
    },
  });

  const generateSuggestionsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/changelog/generate-suggestions");
      return response.json();
    },
    onSuccess: (data: { suggestions: ChangelogEntry[]; message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/changelog/entries"] });
      toast({ 
        title: "Suggestions generated", 
        description: data.message || `Generated ${data.suggestions?.length || 0} suggestions` 
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate suggestions", variant: "destructive" });
    },
  });

  const suggestedEntries = entries.filter(e => e.status === "suggested");
  const approvedEntries = entries.filter(e => e.status === "approved");
  const sentEntries = entries.filter(e => e.status === "sent");

  const handleDragStart = (entry: ChangelogEntry) => {
    setDraggedEntry(entry);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetStatus: "suggested" | "approved") => {
    if (draggedEntry && draggedEntry.status !== targetStatus) {
      updateEntryMutation.mutate({ id: draggedEntry.id, data: { status: targetStatus } });
    }
    setDraggedEntry(null);
  };

  if (settingsLoading || entriesLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const currentSettings: ChangelogSettings = settings || { 
    sendTime: "09:00", 
    notificationType: "both", 
    isEnabled: true,
    suggestTime: "18:00",
    suggestIntervalDays: 1,
    suggestEnabled: true,
  };

  return (
    <div className="space-y-6" data-testid="changelog-management-content">
      <Card data-testid="card-changelog-settings">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Changelog Settings
          </CardTitle>
          <CardDescription>
            Configure when and how changelog updates are sent to users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>Daily Send Time (Eastern)</Label>
              <Select
                value={currentSettings.sendTime}
                onValueChange={(value) => updateSettingsMutation.mutate({ ...currentSettings, sendTime: value })}
              >
                <SelectTrigger data-testid="select-send-time">
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent>
                  {EASTERN_TIME_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notification Type</Label>
              <Select
                value={currentSettings.notificationType}
                onValueChange={(value: "email" | "in_app" | "both") => updateSettingsMutation.mutate({ ...currentSettings, notificationType: value })}
              >
                <SelectTrigger data-testid="select-notification-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email Only
                    </div>
                  </SelectItem>
                  <SelectItem value="in_app">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4" />
                      In-App Only
                    </div>
                  </SelectItem>
                  <SelectItem value="both">
                    <div className="flex items-center gap-2">
                      <Send className="h-4 w-4" />
                      Both
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Changelog Enabled</Label>
              <div className="flex items-center gap-3 pt-2">
                <Switch
                  checked={currentSettings.isEnabled}
                  onCheckedChange={(checked) => updateSettingsMutation.mutate({ ...currentSettings, isEnabled: checked })}
                  data-testid="switch-changelog-enabled"
                />
                <span className="text-sm text-muted-foreground">
                  {currentSettings.isEnabled ? "Active" : "Paused"}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t">
            <h4 className="text-sm font-medium mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Auto-Suggest Settings
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label>Suggest Time (Eastern)</Label>
                <Select
                  value={currentSettings.suggestTime}
                  onValueChange={(value) => updateSettingsMutation.mutate({ ...currentSettings, suggestTime: value })}
                >
                  <SelectTrigger data-testid="select-suggest-time">
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent>
                    {EASTERN_TIME_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Suggest Interval</Label>
                <Select
                  value={currentSettings.suggestIntervalDays.toString()}
                  onValueChange={(value) => updateSettingsMutation.mutate({ ...currentSettings, suggestIntervalDays: parseInt(value, 10) })}
                >
                  <SelectTrigger data-testid="select-suggest-interval">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVAL_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value.toString()}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Auto-Suggest Enabled</Label>
                <div className="flex items-center gap-3 pt-2">
                  <Switch
                    checked={currentSettings.suggestEnabled}
                    onCheckedChange={(checked) => updateSettingsMutation.mutate({ ...currentSettings, suggestEnabled: checked })}
                    data-testid="switch-suggest-enabled"
                  />
                  <span className="text-sm text-muted-foreground">
                    {currentSettings.suggestEnabled ? "Active" : "Paused"}
                  </span>
                </div>
              </div>
            </div>

            {currentSettings.lastSuggestRunAt && (
              <div className="mt-4 pt-4 border-t border-dashed">
                <p className="text-sm text-muted-foreground">
                  Last auto-suggest: {format(new Date(currentSettings.lastSuggestRunAt), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
            )}
          </div>

          {currentSettings.lastSentAt && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Last sent: {format(new Date(currentSettings.lastSentAt), "MMM d, yyyy 'at' h:mm a")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Changelog Review Board</h3>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={() => generateSuggestionsMutation.mutate()}
            disabled={generateSuggestionsMutation.isPending}
            data-testid="button-generate-suggestions"
          >
            {generateSuggestionsMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Generate from Commits
          </Button>
          <Button onClick={() => setIsCreating(true)} data-testid="button-create-entry">
            <Plus className="h-4 w-4 mr-2" />
            Add Entry
          </Button>
        </div>
      </div>

      {isCreating && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">New Changelog Entry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={newEntry.title}
                onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })}
                placeholder="e.g., Reviews Page Got a Fresh Look"
                data-testid="input-new-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newEntry.description}
                onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                placeholder="Describe the change in a fun, host-friendly way..."
                rows={3}
                data-testid="input-new-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location in Product</Label>
                <Input
                  value={newEntry.location}
                  onChange={(e) => setNewEntry({ ...newEntry, location: e.target.value })}
                  placeholder="e.g., Reviews Page"
                  data-testid="input-new-location"
                />
              </div>
              <div className="space-y-2">
                <Label>Benefit for Hosts</Label>
                <Input
                  value={newEntry.hostBenefit}
                  onChange={(e) => setNewEntry({ ...newEntry, hostBenefit: e.target.value })}
                  placeholder="e.g., Easier to find guest feedback"
                  data-testid="input-new-benefit"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsCreating(false)}>Cancel</Button>
              <Button 
                onClick={() => createEntryMutation.mutate(newEntry)} 
                disabled={!newEntry.title || !newEntry.description || createEntryMutation.isPending}
                data-testid="button-save-new-entry"
              >
                {createEntryMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Entry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card 
          className="min-h-[400px]"
          onDragOver={handleDragOver}
          onDrop={() => handleDrop("suggested")}
        >
          <CardHeader className="bg-amber-500/10 rounded-t-lg">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              Suggested
              <Badge variant="secondary" className="ml-auto">{suggestedEntries.length}</Badge>
            </CardTitle>
            <CardDescription>Drag entries to Approved to include in next send</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {suggestedEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No suggested entries</p>
              </div>
            ) : (
              suggestedEntries.map(entry => (
                <ChangelogCard
                  key={entry.id}
                  entry={entry}
                  onDragStart={() => handleDragStart(entry)}
                  onEdit={() => setEditingEntry(entry)}
                  onDelete={() => deleteEntryMutation.mutate(entry.id)}
                  onApprove={() => updateEntryMutation.mutate({ id: entry.id, data: { status: "approved" } })}
                  isDragging={draggedEntry?.id === entry.id}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card 
          className="min-h-[400px]"
          onDragOver={handleDragOver}
          onDrop={() => handleDrop("approved")}
        >
          <CardHeader className="bg-green-500/10 rounded-t-lg">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              Approved
              <Badge variant="secondary" className="ml-auto">{approvedEntries.length}</Badge>
            </CardTitle>
            <CardDescription>These will be sent at the next scheduled time</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {approvedEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Check className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Drag entries here to approve</p>
              </div>
            ) : (
              approvedEntries.map(entry => (
                <ChangelogCard
                  key={entry.id}
                  entry={entry}
                  onDragStart={() => handleDragStart(entry)}
                  onEdit={() => setEditingEntry(entry)}
                  onDelete={() => deleteEntryMutation.mutate(entry.id)}
                  onRevert={() => updateEntryMutation.mutate({ id: entry.id, data: { status: "suggested" } })}
                  isDragging={draggedEntry?.id === entry.id}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {sentEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-5 w-5" />
              Recently Sent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              <div className="space-y-2">
                {sentEntries.slice(0, 10).map(entry => (
                  <div key={entry.id} className="flex items-center gap-3 p-2 rounded border">
                    <Badge variant="outline" className="text-xs">
                      {entry.sentAt ? format(new Date(entry.sentAt), "MMM d") : "N/A"}
                    </Badge>
                    <span className="text-sm font-medium">{entry.title}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <Sheet open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <SheetContent className="w-[500px] sm:max-w-[500px]">
          <SheetHeader>
            <SheetTitle>Edit Changelog Entry</SheetTitle>
            <SheetDescription>Update the details of this changelog entry</SheetDescription>
          </SheetHeader>
          {editingEntry && (
            <div className="space-y-4 mt-6">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={editingEntry.title}
                  onChange={(e) => setEditingEntry({ ...editingEntry, title: e.target.value })}
                  data-testid="input-edit-title"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editingEntry.description}
                  onChange={(e) => setEditingEntry({ ...editingEntry, description: e.target.value })}
                  rows={4}
                  data-testid="input-edit-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Location in Product</Label>
                <Input
                  value={editingEntry.location || ""}
                  onChange={(e) => setEditingEntry({ ...editingEntry, location: e.target.value })}
                  data-testid="input-edit-location"
                />
              </div>
              <div className="space-y-2">
                <Label>Benefit for Hosts</Label>
                <Input
                  value={editingEntry.hostBenefit || ""}
                  onChange={(e) => setEditingEntry({ ...editingEntry, hostBenefit: e.target.value })}
                  data-testid="input-edit-benefit"
                />
              </div>
              <div className="flex gap-2 justify-end pt-4">
                <Button variant="outline" onClick={() => setEditingEntry(null)}>Cancel</Button>
                <Button
                  onClick={() => updateEntryMutation.mutate({
                    id: editingEntry.id,
                    data: {
                      title: editingEntry.title,
                      description: editingEntry.description,
                      location: editingEntry.location,
                      hostBenefit: editingEntry.hostBenefit,
                    }
                  })}
                  disabled={updateEntryMutation.isPending}
                  data-testid="button-save-edit"
                >
                  {updateEntryMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ChangelogManagement() {
  return (
    <ChangelogErrorBoundary>
      <ChangelogManagementInner />
    </ChangelogErrorBoundary>
  );
}

interface ChangelogCardProps {
  entry: ChangelogEntry;
  onDragStart: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onApprove?: () => void;
  onRevert?: () => void;
  isDragging: boolean;
}

function ChangelogCard({ entry, onDragStart, onEdit, onDelete, onApprove, onRevert, isDragging }: ChangelogCardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`p-3 border rounded-lg cursor-grab active:cursor-grabbing transition-all ${isDragging ? "opacity-50 scale-95" : "hover-elevate"}`}
      data-testid={`changelog-card-${entry.id}`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate">{entry.title}</h4>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{entry.description}</p>
          {entry.location && (
            <Badge variant="outline" className="mt-2 text-xs">{entry.location}</Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 mt-2 justify-end">
        {onApprove && (
          <Button size="sm" variant="ghost" onClick={onApprove} className="h-7 px-2" data-testid={`button-approve-${entry.id}`}>
            <Check className="h-3 w-3 mr-1" />
            Approve
          </Button>
        )}
        {onRevert && (
          <Button size="sm" variant="ghost" onClick={onRevert} className="h-7 px-2" data-testid={`button-revert-${entry.id}`}>
            <ArrowLeft className="h-3 w-3 mr-1" />
            Revert
          </Button>
        )}
        <Button size="icon" variant="ghost" onClick={onEdit} className="h-7 w-7" data-testid={`button-edit-${entry.id}`}>
          <Pencil className="h-3 w-3" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete} className="h-7 w-7 text-destructive" data-testid={`button-delete-${entry.id}`}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  pet: "Pet Friendly",
  reviews: "Reviews",
  photos: "Photos",
  sleep: "Sleep Setup",
  host_profile: "Host Profile",
  guest_favorites: "Guest Favorites",
  superhost_status: "Superhost Status",
  ideal_guest_profile: "Ideal Guest Profile",
};

function CategoryWeightsPanel() {
  const { toast } = useToast();
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const { data, isLoading } = useQuery<{ weights: Record<string, number>; updatedAt?: string; updatedBy?: string }>({
    queryKey: ["/api/admin/category-weights"],
  });

  React.useEffect(() => {
    if (data?.weights) {
      setWeights(data.weights);
      setHasChanges(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (newWeights: Record<string, number>) => {
      const res = await apiRequest("POST", "/api/admin/category-weights", { weights: newWeights });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/category-weights"] });
      setHasChanges(false);
      toast({ title: "Weights saved", description: "Category weights have been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);

  const handleWeightChange = (category: string, value: string) => {
    const numVal = parseFloat(value);
    if (isNaN(numVal) || numVal < 0) return;
    setWeights((prev) => ({ ...prev, [category]: numVal }));
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-category-weights">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowUpDown className="h-5 w-5" />
          Overall Grade Weights
        </CardTitle>
        <CardDescription>
          Configure how much each category contributes to the overall listing grade. 
          Weights are relative - they don't need to add up to 100. Categories with higher weights have more impact on the overall grade.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
            const weight = weights[key] ?? 0;
            const percentage = totalWeight > 0 ? ((weight / totalWeight) * 100).toFixed(1) : "0.0";
            return (
              <div key={key} className="flex items-center gap-4" data-testid={`weight-row-${key}`}>
                <span className="w-40 text-sm font-medium shrink-0">{label}</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={weight}
                  onChange={(e) => handleWeightChange(key, e.target.value)}
                  className="w-24"
                  data-testid={`input-weight-${key}`}
                />
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
                <span className="w-16 text-sm text-muted-foreground text-right" data-testid={`text-percentage-${key}`}>
                  {percentage}%
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-4 border-t gap-4">
          <div className="text-sm text-muted-foreground">
            Total weight points: <span className="font-medium text-foreground">{totalWeight}</span>
          </div>
          <Button
            onClick={() => saveMutation.mutate(weights)}
            disabled={!hasChanges || saveMutation.isPending || totalWeight === 0}
            data-testid="button-save-weights"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Weights
          </Button>
        </div>

        {data?.updatedAt && (
          <div className="text-xs text-muted-foreground pt-2">
            Last updated: {format(new Date(data.updatedAt), "MMM d, yyyy 'at' h:mm a")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [editingPrompt, setEditingPrompt] = useState<AiPrompt | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    promptTemplate: "",
    modelId: "" as string,
    category: "",
    systemPrompt: "",
  });

  // Collapsable prompts state
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());
  
  const togglePromptExpanded = (promptId: string) => {
    setExpandedPrompts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(promptId)) {
        newSet.delete(promptId);
      } else {
        newSet.add(promptId);
      }
      return newSet;
    });
  };

  // AI Model selection state
  const [selectedModel, setSelectedModel] = useState<AIModelId>("gpt-4.1-mini");
  const [pendingModelChange, setPendingModelChange] = useState<string | null>(null);
  const [showModelChangeDialog, setShowModelChangeDialog] = useState(false);

  // AI Usage filtering and sorting state
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>("30days");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Users search state
  const [userSearchQuery, setUserSearchQuery] = useState("");

  const { data: prompts, isLoading: promptsLoading, error: promptsError } = useQuery<AiPrompt[]>({
    queryKey: ["/api/admin/prompts"],
  });

  const { data: logs, isLoading: logsLoading, error: logsError } = useQuery<AiUsageLogWithUser[]>({
    queryKey: ["/api/admin/ai-usage"],
  });

  type CleanerProfile = { id: string; name: string; type: string; workspaceId: string; parentId: string | null };
  type UserWithWorkspaces = UserType & { workspaces: { id: string; name: string }[]; cleanerProfiles: CleanerProfile[] };
  const { data: allUsers, isLoading: usersLoading } = useQuery<UserWithWorkspaces[]>({
    queryKey: ["/api/admin/users"],
  });
  const [userTypeFilter, setUserTypeFilter] = useState<"all" | "cleaners" | "managers" | "staff">("all");

  const { data: webhookLogs, isLoading: webhookLogsLoading } = useQuery<WebhookLog[]>({
    queryKey: ["/api/admin/webhook-logs"],
  });

  // Default themes for admin display
  type DefaultTheme = { name: string; icon: string; description: string };
  const { data: defaultThemes, isLoading: defaultThemesLoading } = useQuery<DefaultTheme[]>({
    queryKey: ["/api/admin/themes"],
  });

  // Backfill themes mutation
  const backfillThemesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/themes/backfill");
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Themes Backfilled",
        description: `Seeded ${data.workspacesSeeded} workspaces, skipped ${data.workspacesSkipped} workspaces.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Backfill Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Dev Tools: Data Sources for import/export
  type DataSourceInfo = {
    id: string;
    userId: string;
    workspaceId: string | null;
    provider: string;
    name: string;
    accessToken: string | null;
    refreshToken: string | null;
    tokenExpiresAt: string | null;
    isConnected: boolean;
    lastSyncAt: string | null;
    createdAt: string;
  };
  const { data: adminDataSources, isLoading: dataSourcesLoading } = useQuery<DataSourceInfo[]>({
    queryKey: ["/api/admin/data-sources"],
  });
  
  // State for import form
  const [importFormData, setImportFormData] = useState({
    provider: "hospitable",
    name: "",
    accessToken: "",
    refreshToken: "",
    workspaceId: "",
  });
  const [copiedCredentials, setCopiedCredentials] = useState<string | null>(null);

  // Speed Test state
  const [speedTestMode, setSpeedTestMode] = useState<"sync" | "sentiment" | "simple">("sync");
  const [speedTestPrompt, setSpeedTestPrompt] = useState("Analyze this short-term rental description and provide 3 improvement suggestions: 'Cozy 2BR apartment near downtown. Clean and quiet. Free parking. Great views.'");
  const [speedTestModelA, setSpeedTestModelA] = useState("gpt-4.1-mini");
  const [speedTestModelB, setSpeedTestModelB] = useState("x-ai/grok-3-mini");
  const [speedTestOpenAIModel, setSpeedTestOpenAIModel] = useState("gpt-4.1-mini");
  const [speedTestGrokModel, setSpeedTestGrokModel] = useState("x-ai/grok-3-mini");
  
  // Shared test config state
  const [testWorkspaceId, setTestWorkspaceId] = useState<string>("");
  const [testListingId, setTestListingId] = useState<string>("");
  const [testDaysBack, setTestDaysBack] = useState<string>("90");
  
  // Legacy Comparison Test state (for backward compatibility)
  const [comparisonWorkspaceId, setComparisonWorkspaceId] = useState<string>("");
  const [comparisonListingId, setComparisonListingId] = useState<string>("");
  const [comparisonDaysBack, setComparisonDaysBack] = useState<string>("90");
  const [comparisonSelectedReservation, setComparisonSelectedReservation] = useState<string | null>(null);
  
  type SpeedTestResult = {
    prompt: string;
    results: {
      openai: { model: string; responseTime: number; tokens: { input: number; output: number }; response: string; error?: string };
      grok: { model: string; responseTime: number; tokens: { input: number; output: number }; response: string; error?: string };
    };
    speedComparison: {
      fasterModel: string;
      timeDifference: number;
      percentageFaster: string;
      comparisonAvailable?: boolean;
      reason?: string;
    };
    timestamp: string;
  };
  const [speedTestResult, setSpeedTestResult] = useState<SpeedTestResult | null>(null);

  const speedTestMutation = useMutation({
    mutationFn: async (data: { prompt: string; openaiModel: string; grokModel: string }) => {
      const res = await apiRequest("POST", "/api/admin/ai-speed-test", data);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Speed test failed" }));
        throw new Error(errorData.message || "Speed test failed");
      }
      return res.json() as Promise<SpeedTestResult>;
    },
    onSuccess: (data) => {
      setSpeedTestResult(data);
      if (data.speedComparison.comparisonAvailable === false) {
        toast({
          title: "Speed Test Completed with Errors",
          description: data.speedComparison.reason || "One or both models failed",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Speed Test Complete",
          description: `${data.speedComparison.fasterModel === "grok" ? "Grok" : "OpenAI"} was ${data.speedComparison.percentageFaster}% faster`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Speed Test Failed",
        description: error.message || "Failed to run speed test",
        variant: "destructive",
      });
    },
  });

  // Comparison Test types and mutation
  type TagResult = {
    name: string;
    sentiment: string;
    summary?: string;
    verbatimEvidence?: string;
    suggestedTheme?: string;
    suggestedThemeIcon?: string;
    suggestedTaskTitle?: string | null;
    suggestedTaskDescription?: string | null;
  };

  type ReservationComparison = {
    reservationId: string;
    guestName: string;
    checkIn: string | null;
    checkOut: string | null;
    hasReview: boolean;
    hasPrivateRemarks: boolean;
    openai: { tags: TagResult[]; sentimentScores?: { overall: number; summary: string } | null };
    grok: { tags: TagResult[]; sentimentScores?: { overall: number; summary: string } | null };
  };

  type StageMetrics = {
    responseTime: number;
    tokens: { input: number; output: number };
    estimatedCost: number;
    error?: string;
  };

  type StageResult = {
    openai: StageMetrics;
    grok: StageMetrics;
    winner: "openai" | "grok" | "tie";
  };

  type TaskComparison = {
    title: string;
    description: string;
    priority: string;
    effort: string;
    relatedTagName?: string;
  };

  type ThemeComparison = {
    name: string;
    icon: string;
    description: string;
    isNew: boolean;
    tagNames: string[];
  };

  type ComparisonTestResult = {
    id?: string;
    testConfig: {
      workspaceId: string;
      listingId: string;
      listingName: string;
      dateRange: { startDate: string; endDate: string };
      reservationCount: number;
      openaiModel: string;
      grokModel: string;
    };
    stages: {
      tags: StageResult;
      tasks: StageResult;
      themes: StageResult;
    };
    totals: {
      openai: { responseTime: number; tokens: { input: number; output: number }; estimatedCost: number };
      grok: { responseTime: number; tokens: { input: number; output: number }; estimatedCost: number };
    };
    overallWinner: "openai" | "grok" | "tie";
    reservationComparisons: ReservationComparison[];
    tasksComparison: {
      openai: TaskComparison[];
      grok: TaskComparison[];
    };
    themesComparison: {
      openai: ThemeComparison[];
      grok: ThemeComparison[];
    };
    timestamp: string;
  };

  type SpeedTestHistory = {
    id: string;
    listingName: string | null;
    openaiModel: string;
    grokModel: string;
    reservationCount: number;
    overallWinner: string;
    totalOpenaiTime: number;
    totalGrokTime: number;
    totalOpenaiCost: number;
    totalGrokCost: number;
    createdAt: string;
  };

  // New unified speed test result type
  type UnifiedSpeedTestResult = {
    testType: "sync" | "sentiment";
    testConfig: {
      workspaceId: string;
      listingId: string;
      listingName: string;
      dateRange: { startDate: string; endDate: string };
      reservationCount: number;
    };
    results: {
      modelA: { model: string; responseTime: number; tokens: { input: number; output: number }; estimatedCost: number; tagCount?: number; scoresReturned?: number; error?: string };
      modelB: { model: string; responseTime: number; tokens: { input: number; output: number }; estimatedCost: number; tagCount?: number; scoresReturned?: number; error?: string };
    };
    comparison: { winner: string; timeDifference: number; percentageFaster: string; hasErrors: boolean };
    timestamp: string;
  };

  const [comparisonTestResult, setComparisonTestResult] = useState<ComparisonTestResult | null>(null);
  const [unifiedTestResult, setUnifiedTestResult] = useState<UnifiedSpeedTestResult | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Fetch speed test history
  const { data: speedTestHistory, refetch: refetchHistory } = useQuery<SpeedTestHistory[]>({
    queryKey: ["/api/admin/speed-test-history"],
    enabled: showHistory,
  });

  // Load a specific history run
  const loadHistoryRun = async (id: string) => {
    try {
      const res = await apiRequest("GET", `/api/admin/speed-test-history/${id}`);
      if (!res.ok) throw new Error("Failed to load history");
      const run = await res.json();
      // Transform the stored results into the display format
      const results = run.results;
      setComparisonTestResult({
        id: run.id,
        testConfig: {
          workspaceId: run.workspaceId,
          listingId: run.listingId,
          listingName: run.listingName || "Unknown",
          dateRange: { startDate: "", endDate: "" },
          reservationCount: run.reservationCount,
          openaiModel: run.openaiModel,
          grokModel: run.grokModel,
        },
        stages: results.stages,
        totals: results.totals,
        overallWinner: results.overallWinner,
        reservationComparisons: results.reservationComparisons || [],
        tasksComparison: results.tasksComparison || { openai: [], grok: [] },
        themesComparison: results.themesComparison || { openai: [], grok: [] },
        timestamp: run.createdAt,
      });
      setComparisonSelectedReservation(results.reservationComparisons?.[0]?.reservationId || null);
      setShowHistory(false);
      toast({ title: "History Loaded", description: `Loaded test from ${format(new Date(run.createdAt), "MMM d, yyyy h:mm a")}` });
    } catch (error) {
      toast({ title: "Error", description: "Failed to load test history", variant: "destructive" });
    }
  };

  // Fetch workspaces for comparison test
  type WorkspaceInfo = { id: string; name: string };
  const { data: workspaces } = useQuery<WorkspaceInfo[]>({
    queryKey: ["/api/workspaces"],
  });

  // Fetch listings for selected workspace (with explicit workspace header)
  type ListingInfo = { id: string; name: string };
  const { data: workspaceListings } = useQuery<ListingInfo[]>({
    queryKey: ["/api/listings", "comparison", comparisonWorkspaceId],
    queryFn: async () => {
      const res = await fetch("/api/listings", {
        credentials: "include",
        headers: {
          "X-Workspace-Id": comparisonWorkspaceId,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch listings");
      return res.json();
    },
    enabled: !!comparisonWorkspaceId,
  });

  // Fetch listings for the unified test workspace
  const { data: testListings } = useQuery<ListingInfo[]>({
    queryKey: ["/api/listings", "speedtest", testWorkspaceId],
    queryFn: async () => {
      const res = await fetch("/api/listings", {
        credentials: "include",
        headers: { "X-Workspace-Id": testWorkspaceId },
      });
      if (!res.ok) throw new Error("Failed to fetch listings");
      return res.json();
    },
    enabled: !!testWorkspaceId,
  });

  // Sync Speed Test mutation
  const syncSpeedTestMutation = useMutation({
    mutationFn: async (data: { workspaceId: string; listingId: string; startDate: string; endDate: string; modelA: string; modelB: string }) => {
      const res = await apiRequest("POST", "/api/admin/sync-speed-test", data);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Sync speed test failed" }));
        throw new Error(errorData.message || "Sync speed test failed");
      }
      return res.json() as Promise<UnifiedSpeedTestResult>;
    },
    onSuccess: (data) => {
      setUnifiedTestResult(data);
      const winner = data.comparison.winner === "modelA" ? data.results.modelA.model : data.comparison.winner === "modelB" ? data.results.modelB.model : "Tie";
      toast({
        title: "Initial Sync Speed Test Complete",
        description: `Tested ${data.testConfig.reservationCount} reservations. Winner: ${winner} (${data.comparison.percentageFaster}% faster)`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Sync Speed Test Failed", description: error.message, variant: "destructive" });
    },
  });

  // Sentiment Speed Test mutation
  const sentimentSpeedTestMutation = useMutation({
    mutationFn: async (data: { workspaceId: string; listingId: string; startDate: string; endDate: string; modelA: string; modelB: string }) => {
      const res = await apiRequest("POST", "/api/admin/sentiment-speed-test", data);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Sentiment speed test failed" }));
        throw new Error(errorData.message || "Sentiment speed test failed");
      }
      return res.json() as Promise<UnifiedSpeedTestResult>;
    },
    onSuccess: (data) => {
      setUnifiedTestResult(data);
      const winner = data.comparison.winner === "modelA" ? data.results.modelA.model : data.comparison.winner === "modelB" ? data.results.modelB.model : "Tie";
      toast({
        title: "Sentiment Speed Test Complete",
        description: `Tested ${data.testConfig.reservationCount} reservations. Winner: ${winner} (${data.comparison.percentageFaster}% faster)`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Sentiment Speed Test Failed", description: error.message, variant: "destructive" });
    },
  });

  const comparisonTestMutation = useMutation({
    mutationFn: async (data: { workspaceId: string; listingId: string; startDate: string; endDate: string; openaiModel: string; grokModel: string }) => {
      const res = await apiRequest("POST", "/api/admin/ai-comparison-test", data);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Comparison test failed" }));
        throw new Error(errorData.message || "Comparison test failed");
      }
      return res.json() as Promise<ComparisonTestResult>;
    },
    onSuccess: (data) => {
      setComparisonTestResult(data);
      setComparisonSelectedReservation(data.reservationComparisons[0]?.reservationId || null);
      toast({
        title: "Comparison Test Complete",
        description: `Analyzed ${data.testConfig.reservationCount} reservations across 3 stages. Overall winner: ${data.overallWinner === "tie" ? "Tie" : data.overallWinner === "grok" ? "Grok" : "OpenAI"}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Comparison Test Failed",
        description: error.message || "Failed to run comparison test",
        variant: "destructive",
      });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/impersonate/${userId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Impersonation Started",
        description: "You are now viewing the app as this user. A new tab has been opened.",
      });
      window.open("/", "_blank");
    },
    onError: (error: Error) => {
      toast({
        title: "Impersonation Failed",
        description: error.message || "Failed to start impersonation",
        variant: "destructive",
      });
    },
  });

  const [userToDelete, setUserToDelete] = useState<UserType | null>(null);
  const [userToToggleAdmin, setUserToToggleAdmin] = useState<UserWithWorkspaces | null>(null);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookLog | null>(null);

  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update user role");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setUserToToggleAdmin(null);
      const isPromotion = variables.role === "app_admin";
      toast({
        title: isPromotion ? "User Promoted" : "User Demoted",
        description: isPromotion 
          ? "User has been promoted to Super Admin." 
          : "User has been demoted from Super Admin.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update user role",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${userId}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setUserToDelete(null);
      toast({
        title: "User Deleted",
        description: "The user has been successfully deleted.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  // AI Model configuration
  const { data: modelConfig, isLoading: modelLoading } = useQuery<{ model: string; updatedAt: string | null; updatedBy: string | null }>({
    queryKey: ["/api/admin/ai-model"],
  });

  // Sync AI Model configuration
  const { data: syncModelConfig, isLoading: syncModelLoading } = useQuery<{ model: string; updatedAt: string | null; updatedBy: string | null; isDefault?: boolean }>({
    queryKey: ["/api/admin/sync-ai-model"],
  });

  // Sentiment AI Model configuration
  const { data: sentimentModelConfig, isLoading: sentimentModelLoading } = useQuery<{ model: string; updatedAt: string | null; updatedBy: string | null; isDefault?: boolean }>({
    queryKey: ["/api/admin/sentiment-ai-model"],
  });

  const modelMutation = useMutation({
    mutationFn: async ({ model, updatePrompts }: { model: string; updatePrompts?: "using-default" | "using-old-default" | "none" }) => {
      const response = await apiRequest("POST", "/api/admin/ai-model", { 
        model, 
        updatePrompts,
        oldModel: currentModel 
      });
      if (!response.ok) throw new Error("Failed to save model");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-model"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prompts"] });
      setShowModelChangeDialog(false);
      setPendingModelChange(null);
      const promptsUpdated = data.promptsUpdated || 0;
      const message = promptsUpdated > 0 
        ? `Default model updated. ${promptsUpdated} prompt(s) updated to use the new model.`
        : "Default model updated successfully";
      toast({ title: "Success", description: message });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleModelChange = (newModel: string) => {
    if (newModel !== currentModel) {
      setPendingModelChange(newModel);
      setShowModelChangeDialog(true);
    }
  };

  const confirmModelChange = (updateOption: "using-default" | "using-old-default" | "none") => {
    if (pendingModelChange) {
      modelMutation.mutate({ model: pendingModelChange, updatePrompts: updateOption });
    }
  };

  // Sync AI Model mutation (for Initial Sync / Tag extraction)
  const syncModelMutation = useMutation({
    mutationFn: async (model: string) => {
      const response = await apiRequest("POST", "/api/admin/sync-ai-model", { model });
      if (!response.ok) throw new Error("Failed to save sync model");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sync-ai-model"] });
      toast({ title: "Success", description: "Sync AI model updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Sentiment AI Model mutation
  const sentimentModelMutation = useMutation({
    mutationFn: async (model: string) => {
      const response = await apiRequest("POST", "/api/admin/sentiment-ai-model", { model });
      if (!response.ok) throw new Error("Failed to save sentiment model");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sentiment-ai-model"] });
      toast({ title: "Success", description: "Sentiment AI model updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Sync selected model with server
  const currentModel = modelConfig?.model || "gpt-4.1-mini";
  const currentSyncModel = syncModelConfig?.model || currentModel;
  const currentSentimentModel = sentimentModelConfig?.model || currentModel;

  // Count prompts using default vs specific models
  const promptsUsingDefault = prompts?.filter(p => !p.modelId).length || 0;
  const promptsUsingOldDefault = prompts?.filter(p => p.modelId === currentModel).length || 0;

  // Calculate date range based on preset
  const getDateRange = (): { start: Date; end: Date } | null => {
    const now = new Date();
    switch (dateRangePreset) {
      case "today":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "7days":
        return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
      case "30days":
        return { start: startOfDay(subDays(now, 30)), end: endOfDay(now) };
      case "90days":
        return { start: startOfDay(subDays(now, 90)), end: endOfDay(now) };
      case "custom":
        if (customDateRange?.from && customDateRange?.to) {
          return { start: startOfDay(customDateRange.from), end: endOfDay(customDateRange.to) };
        }
        return null;
      default:
        return null;
    }
  };

  // Filter and sort logs
  const filteredAndSortedLogs = useMemo(() => {
    if (!logs) return [];
    
    const dateRange = getDateRange();
    let filtered = logs;
    
    // Apply date filter
    if (dateRange) {
      filtered = logs.filter((log) => {
        if (!log.createdAt) return false;
        const logDate = new Date(log.createdAt);
        return isWithinInterval(logDate, { start: dateRange.start, end: dateRange.end });
      });
    }
    
    // Apply sorting
    return [...filtered].sort((a, b) => {
      let aValue: number;
      let bValue: number;
      
      switch (sortField) {
        case "createdAt":
          aValue = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          bValue = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          break;
        case "inputTokens":
          aValue = a.inputTokens || 0;
          bValue = b.inputTokens || 0;
          break;
        case "outputTokens":
          aValue = a.outputTokens || 0;
          bValue = b.outputTokens || 0;
          break;
        case "estimatedCost":
          aValue = a.estimatedCost || 0;
          bValue = b.estimatedCost || 0;
          break;
        default:
          return 0;
      }
      
      return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
    });
  }, [logs, dateRangePreset, customDateRange, sortField, sortDirection]);

  const filteredUsers = useMemo(() => {
    if (!allUsers) return [];
    let filtered = allUsers;

    if (userTypeFilter === "cleaners") {
      filtered = filtered.filter(u => u.cleanerProfiles?.length > 0);
    } else if (userTypeFilter === "managers") {
      filtered = filtered.filter(u => u.cleanerProfiles?.some(c => c.type === "company" || c.type === "cleaning_manager"));
    } else if (userTypeFilter === "staff") {
      filtered = filtered.filter(u => !u.cleanerProfiles?.length);
    }

    if (userSearchQuery.trim()) {
      const query = userSearchQuery.toLowerCase().trim();
      filtered = filtered.filter((u) => {
        const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
        const email = (u.email || '').toLowerCase();
        const workspaceNames = (u.workspaces || []).map(w => w.name.toLowerCase()).join(' ');
        const cleanerNames = (u.cleanerProfiles || []).map(c => c.name.toLowerCase()).join(' ');
        return fullName.includes(query) || email.includes(query) || workspaceNames.includes(query) || cleanerNames.includes(query);
      });
    }

    return filtered;
  }, [allUsers, userSearchQuery, userTypeFilter]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 ml-1" />;
    }
    return sortDirection === "asc" ? 
      <ArrowUp className="w-3 h-3 ml-1" /> : 
      <ArrowDown className="w-3 h-3 ml-1" />;
  };

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; promptTemplate: string; modelId?: string }) => {
      return apiRequest("POST", "/api/admin/prompts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prompts"] });
      setIsCreating(false);
      setFormData({ name: "", description: "", promptTemplate: "", modelId: "", category: "", systemPrompt: "" });
      toast({
        title: "Prompt Created",
        description: "The AI prompt has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create prompt",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AiPrompt> }) => {
      return apiRequest("PATCH", `/api/admin/prompts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prompts"] });
      setEditingPrompt(null);
      toast({
        title: "Prompt Updated",
        description: "The AI prompt has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update prompt",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/prompts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prompts"] });
      toast({
        title: "Prompt Deleted",
        description: "The AI prompt has been deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete prompt",
        variant: "destructive",
      });
    },
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/prompts/seed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prompts"] });
      toast({
        title: "Prompts Seeded",
        description: "Default listing analysis prompts have been created.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to seed prompts",
        variant: "destructive",
      });
    },
  });

  // Import data source mutation
  const importDataSourceMutation = useMutation({
    mutationFn: async (data: typeof importFormData) => {
      const res = await apiRequest("POST", "/api/admin/data-sources/import", data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to import data source");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/data-sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/data-sources"] });
      setImportFormData({
        provider: "hospitable",
        name: "",
        accessToken: "",
        refreshToken: "",
        workspaceId: "",
      });
      toast({
        title: "Data Source Imported",
        description: "The data source credentials have been imported successfully. You can now sync properties.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import data source",
        variant: "destructive",
      });
    },
  });

  // Export credentials to clipboard
  const handleExportCredentials = async (dataSourceId: string) => {
    try {
      const res = await fetch(`/api/admin/data-sources/${dataSourceId}/export`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to export credentials");
      }
      const data = await res.json();
      const jsonStr = JSON.stringify(data, null, 2);
      await navigator.clipboard.writeText(jsonStr);
      setCopiedCredentials(dataSourceId);
      setTimeout(() => setCopiedCredentials(null), 2000);
      toast({
        title: "Credentials Copied",
        description: "Data source credentials copied to clipboard. Paste them into the dev environment.",
      });
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export credentials",
        variant: "destructive",
      });
    }
  };

  const handleCreate = () => {
    if (!formData.name || !formData.promptTemplate) {
      toast({
        title: "Validation Error",
        description: "Name and prompt template are required.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(formData);
  };

  const handleUpdate = () => {
    if (!editingPrompt) return;
    updateMutation.mutate({
      id: editingPrompt.id,
      data: {
        name: editingPrompt.name,
        description: editingPrompt.description || undefined,
        promptTemplate: editingPrompt.promptTemplate || undefined,
        modelId: editingPrompt.modelId || undefined,
        category: editingPrompt.category || undefined,
        systemPrompt: editingPrompt.systemPrompt || undefined,
      },
    });
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (date: Date | string | null) => {
    if (!date) return "-";
    const d = new Date(date);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCost = (cost: number | null) => {
    if (cost === null || cost === undefined) return "$0.0000";
    return `$${cost.toFixed(4)}`;
  };

  // Calculate totals from filtered logs
  const totalCost = filteredAndSortedLogs.reduce((sum, log) => sum + (log.estimatedCost || 0), 0);
  const totalInputTokens = filteredAndSortedLogs.reduce((sum, log) => sum + (log.inputTokens || 0), 0);
  const totalOutputTokens = filteredAndSortedLogs.reduce((sum, log) => sum + (log.outputTokens || 0), 0);

  if (user?.role !== "app_admin") {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You must be an Application Admin to access this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <Tabs defaultValue="model" className="flex h-full" orientation="vertical">
      {/* Left Sidebar with Tabs */}
      <div className="w-56 border-r bg-muted/30 flex flex-col shrink-0">
        <div className="p-4 border-b">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-2" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold" data-testid="text-admin-title">Admin Portal</h1>
          </div>
        </div>
        
        <TabsList className="flex flex-col h-auto bg-transparent p-2 gap-1">
          <TabsTrigger value="model" className="w-full justify-start" data-testid="tab-model">
            <Settings className="h-4 w-4 mr-2" />
            Model
          </TabsTrigger>
          <TabsTrigger value="prompts" className="w-full justify-start" data-testid="tab-prompts">
            <FileText className="h-4 w-4 mr-2" />
            Prompts
          </TabsTrigger>
          <TabsTrigger value="themes" className="w-full justify-start" data-testid="tab-themes">
            <Folder className="h-4 w-4 mr-2" />
            Themes
          </TabsTrigger>
          <TabsTrigger value="usage" className="w-full justify-start" data-testid="tab-usage">
            <Cpu className="h-4 w-4 mr-2" />
            Usage
          </TabsTrigger>
          <TabsTrigger value="speedtest" className="w-full justify-start" data-testid="tab-speedtest">
            <Zap className="h-4 w-4 mr-2" />
            Speed Test
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="w-full justify-start" data-testid="tab-webhooks">
            <Webhook className="h-4 w-4 mr-2" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="users" className="w-full justify-start" data-testid="tab-users">
            <Users className="h-4 w-4 mr-2" />
            Users
          </TabsTrigger>
          <TabsTrigger value="devtools" className="w-full justify-start" data-testid="tab-devtools">
            <Wrench className="h-4 w-4 mr-2" />
            Dev Tools
          </TabsTrigger>
          <TabsTrigger value="changelog" className="w-full justify-start" data-testid="tab-changelog">
            <FileText className="h-4 w-4 mr-2" />
            Changelog
          </TabsTrigger>
          <TabsTrigger value="permissions" className="w-full justify-start" data-testid="tab-permissions">
            <Shield className="h-4 w-4 mr-2" />
            Permissions
          </TabsTrigger>
          <TabsTrigger value="procedure-template" className="w-full justify-start" data-testid="tab-procedure-template">
            <Folder className="h-4 w-4 mr-2" />
            Procedure Template
          </TabsTrigger>
          <TabsTrigger value="category-weights" className="w-full justify-start" data-testid="tab-category-weights">
            <ArrowUpDown className="h-4 w-4 mr-2" />
            Grade Weights
          </TabsTrigger>
        </TabsList>
      </div>
        
      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <TabsContent value="model" className="space-y-6 mt-0">
          <Card data-testid="card-model-config">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5" />
                Default AI Model
              </CardTitle>
              <CardDescription>
                Set the default AI model used for prompts that don't have a specific model assigned. 
                Individual prompts can override this in the Prompts tab.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {modelLoading ? (
                <Skeleton className="h-10 w-full max-w-sm" />
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="model-select">Default Model</Label>
                    <Select
                      value={currentModel}
                      onValueChange={handleModelChange}
                      disabled={modelMutation.isPending}
                    >
                      <SelectTrigger className="w-full max-w-md" id="model-select" data-testid="select-model">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(AI_MODELS).map(([modelId, info]) => (
                          <SelectItem key={modelId} value={modelId} data-testid={`select-item-model-${modelId}`}>
                            <div className="flex items-center justify-between gap-4">
                              <span>{info.name}</span>
                              <span className="text-xs text-muted-foreground">
                                ${info.inputCost.toFixed(4)}/{info.outputCost.toFixed(4)} per 1K tokens
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {modelMutation.isPending && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </div>
                    )}
                  </div>

                  {modelConfig && AI_MODELS[currentModel as AIModelId] && (
                    <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{AI_MODELS[currentModel as AIModelId].provider}</Badge>
                        <span className="font-medium">{AI_MODELS[currentModel as AIModelId].name}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Input cost:</span>{" "}
                          <span className="font-mono">${AI_MODELS[currentModel as AIModelId].inputCost.toFixed(4)}</span>
                          <span className="text-muted-foreground"> / 1K tokens</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Output cost:</span>{" "}
                          <span className="font-mono">${AI_MODELS[currentModel as AIModelId].outputCost.toFixed(4)}</span>
                          <span className="text-muted-foreground"> / 1K tokens</span>
                        </div>
                      </div>
                      {modelConfig.updatedAt && (
                        <div className="text-xs text-muted-foreground">
                          Last updated: {format(new Date(modelConfig.updatedAt), "MMM d, yyyy h:mm a")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={showModelChangeDialog} onOpenChange={(open) => {
            if (!open) {
              setShowModelChangeDialog(false);
              setPendingModelChange(null);
            }
          }}>
            <DialogContent className="sm:max-w-lg" data-testid="dialog-model-change">
              <DialogHeader>
                <DialogTitle>Change Default Model</DialogTitle>
                <DialogDescription>
                  You're changing the default model from{" "}
                  <span className="font-medium">{AI_MODELS[currentModel as AIModelId]?.name || currentModel}</span>
                  {" "}to{" "}
                  <span className="font-medium">{pendingModelChange && AI_MODELS[pendingModelChange as AIModelId]?.name}</span>.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <p className="text-sm text-muted-foreground">
                  Would you like to update existing prompts to use the new model?
                </p>
                
                <div className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start text-left h-auto py-3"
                    onClick={() => confirmModelChange("none")}
                    disabled={modelMutation.isPending}
                    data-testid="button-change-default-only"
                  >
                    <div className="flex flex-col items-start gap-1">
                      <span className="font-medium">Change default only</span>
                      <span className="text-xs text-muted-foreground">
                        Only prompts without a specific model ({promptsUsingDefault}) will use the new default
                      </span>
                    </div>
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="w-full justify-start text-left h-auto py-3"
                    onClick={() => confirmModelChange("using-old-default")}
                    disabled={modelMutation.isPending || promptsUsingOldDefault === 0}
                    data-testid="button-update-prompts-old-default"
                  >
                    <div className="flex flex-col items-start gap-1">
                      <span className="font-medium">Update prompts using the old default</span>
                      <span className="text-xs text-muted-foreground">
                        Update {promptsUsingOldDefault} prompt(s) that have "{AI_MODELS[currentModel as AIModelId]?.name}" explicitly set
                      </span>
                    </div>
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="w-full justify-start text-left h-auto py-3"
                    onClick={() => confirmModelChange("using-default")}
                    disabled={modelMutation.isPending || promptsUsingDefault === 0}
                    data-testid="button-update-prompts-using-default"
                  >
                    <div className="flex flex-col items-start gap-1">
                      <span className="font-medium">Update prompts using the default</span>
                      <span className="text-xs text-muted-foreground">
                        Set {promptsUsingDefault} prompt(s) with no specific model to use the new model explicitly
                      </span>
                    </div>
                  </Button>
                </div>
              </div>

              <DialogFooter>
                <Button 
                  variant="ghost" 
                  onClick={() => {
                    setShowModelChangeDialog(false);
                    setPendingModelChange(null);
                  }}
                  disabled={modelMutation.isPending}
                  data-testid="button-cancel-model-change"
                >
                  Cancel
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Sync AI Model Card */}
          <Card data-testid="card-sync-model-config">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Initial Sync AI Model
              </CardTitle>
              <CardDescription>
                AI model used for tag extraction and theme analysis during property sync. 
                Falls back to Default AI Model if not set.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {syncModelLoading ? (
                <Skeleton className="h-10 w-full max-w-sm" />
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="sync-model-select">Sync Model</Label>
                    <div className="flex items-center gap-2">
                      <Select
                        value={currentSyncModel}
                        onValueChange={(model) => syncModelMutation.mutate(model)}
                        disabled={syncModelMutation.isPending}
                      >
                        <SelectTrigger className="w-full max-w-md" id="sync-model-select" data-testid="select-sync-model">
                          <SelectValue placeholder="Select a model" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(AI_MODELS).map(([modelId, info]) => (
                            <SelectItem key={modelId} value={modelId}>
                              <div className="flex items-center justify-between gap-4">
                                <span>{info.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  ${info.inputCost.toFixed(4)}/{info.outputCost.toFixed(4)} per 1K tokens
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {syncModelConfig?.isDefault && (
                        <Badge variant="secondary">Using Default</Badge>
                      )}
                    </div>
                    {syncModelMutation.isPending && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </div>
                    )}
                  </div>

                  {syncModelConfig && AI_MODELS[currentSyncModel as AIModelId] && (
                    <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{AI_MODELS[currentSyncModel as AIModelId].provider}</Badge>
                        <span className="font-medium">{AI_MODELS[currentSyncModel as AIModelId].name}</span>
                      </div>
                      {syncModelConfig.updatedAt && !syncModelConfig.isDefault && (
                        <div className="text-xs text-muted-foreground">
                          Last updated: {format(new Date(syncModelConfig.updatedAt), "MMM d, yyyy h:mm a")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sentiment AI Model Card */}
          <Card data-testid="card-sentiment-model-config">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5" />
                AI Sentiment Score Model
              </CardTitle>
              <CardDescription>
                AI model used for guest sentiment scoring and review analysis. 
                Falls back to Default AI Model if not set.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {sentimentModelLoading ? (
                <Skeleton className="h-10 w-full max-w-sm" />
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="sentiment-model-select">Sentiment Model</Label>
                    <div className="flex items-center gap-2">
                      <Select
                        value={currentSentimentModel}
                        onValueChange={(model) => sentimentModelMutation.mutate(model)}
                        disabled={sentimentModelMutation.isPending}
                      >
                        <SelectTrigger className="w-full max-w-md" id="sentiment-model-select" data-testid="select-sentiment-model">
                          <SelectValue placeholder="Select a model" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(AI_MODELS).map(([modelId, info]) => (
                            <SelectItem key={modelId} value={modelId}>
                              <div className="flex items-center justify-between gap-4">
                                <span>{info.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  ${info.inputCost.toFixed(4)}/{info.outputCost.toFixed(4)} per 1K tokens
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {sentimentModelConfig?.isDefault && (
                        <Badge variant="secondary">Using Default</Badge>
                      )}
                    </div>
                    {sentimentModelMutation.isPending && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </div>
                    )}
                  </div>

                  {sentimentModelConfig && AI_MODELS[currentSentimentModel as AIModelId] && (
                    <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{AI_MODELS[currentSentimentModel as AIModelId].provider}</Badge>
                        <span className="font-medium">{AI_MODELS[currentSentimentModel as AIModelId].name}</span>
                      </div>
                      {sentimentModelConfig.updatedAt && !sentimentModelConfig.isDefault && (
                        <div className="text-xs text-muted-foreground">
                          Last updated: {format(new Date(sentimentModelConfig.updatedAt), "MMM d, yyyy h:mm a")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompts" className="space-y-6 mt-0">
          <div className="flex justify-between items-center gap-2 flex-wrap">
            <div className="text-sm text-muted-foreground">
              Manage AI prompts for listing analysis. Use "Seed Defaults" to create prompts for all listing analysis categories.
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                data-testid="button-seed-prompts"
              >
                {seedMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Wrench className="h-4 w-4 mr-2" />
                )}
                Seed Defaults
              </Button>
              <Button 
                onClick={() => setIsCreating(true)} 
                disabled={isCreating}
                data-testid="button-create-prompt"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create New Prompt
              </Button>
            </div>
          </div>

          {isCreating && (
            <Card data-testid="card-create-prompt">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Create New Prompt
                </CardTitle>
                <CardDescription>Add a new AI prompt template</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., listing_analysis"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    data-testid="input-prompt-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    placeholder="Brief description of what this prompt does"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    data-testid="input-prompt-description"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category (for Listing Analysis)</Label>
                  <Select 
                    value={formData.category || ""} 
                    onValueChange={(value) => setFormData({ ...formData, category: value === "none" ? "" : value })}
                  >
                    <SelectTrigger data-testid="select-prompt-category">
                      <SelectValue placeholder="Select category (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No category</SelectItem>
                      <SelectItem value="photos">Photos</SelectItem>
                      <SelectItem value="title">Listing Title</SelectItem>
                      <SelectItem value="title_generator">Title Generator</SelectItem>
                      <SelectItem value="reviews">Reviews</SelectItem>
                      <SelectItem value="pet_friendly">Pet Friendly</SelectItem>
                      <SelectItem value="description">Listing Description</SelectItem>
                      <SelectItem value="description_generator">Description Generator</SelectItem>
                      <SelectItem value="sleep">Where You'll Sleep</SelectItem>
                      <SelectItem value="host_profile">Host Profile</SelectItem>
                      <SelectItem value="guest_favorites">Guest Favorites</SelectItem>
                      <SelectItem value="superhost">Superhost</SelectItem>
                      <SelectItem value="ideal_alignment">Ideal Guest Profile Alignment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="systemPrompt">System Prompt</Label>
                  <Textarea
                    id="systemPrompt"
                    placeholder="Enter the system prompt for the AI..."
                    value={formData.systemPrompt}
                    onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                    rows={6}
                    className="font-mono text-sm"
                    data-testid="input-system-prompt"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="promptTemplate">Prompt Template</Label>
                  <Textarea
                    id="promptTemplate"
                    placeholder="Enter the AI prompt template..."
                    value={formData.promptTemplate}
                    onChange={(e) => setFormData({ ...formData, promptTemplate: e.target.value })}
                    rows={15}
                    className="font-mono text-sm"
                    data-testid="input-prompt-template"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="modelId">AI Model</Label>
                  <Select 
                    value={formData.modelId || ""} 
                    onValueChange={(value) => setFormData({ ...formData, modelId: value === "default" ? "" : value })}
                  >
                    <SelectTrigger data-testid="select-prompt-model">
                      <SelectValue placeholder="Use global default model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Use global default</SelectItem>
                      {Object.entries(AI_MODELS).map(([id, model]) => (
                        <SelectItem key={id} value={id}>
                          {model.name} (${model.inputCost.toFixed(4)}/${model.outputCost.toFixed(4)} per 1K tokens)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Select a specific model for this prompt, or use the global default configured in the Model tab.
                  </p>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setIsCreating(false);
                      setFormData({ name: "", description: "", promptTemplate: "", modelId: "", category: "", systemPrompt: "" });
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreate}
                    disabled={createMutation.isPending}
                    data-testid="button-save-prompt"
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Prompt
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {promptsLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-4 w-64" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-32 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : promptsError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error Loading Prompts</AlertTitle>
              <AlertDescription>
                {(promptsError as Error).message || "Failed to load prompts."}
              </AlertDescription>
            </Alert>
          ) : prompts && prompts.length > 0 ? (
            <div className="space-y-4">
              {prompts.map((prompt) => (
                <Card key={prompt.id} data-testid={`prompt-card-${prompt.id}`}>
                  <CardHeader 
                    className="cursor-pointer hover-elevate"
                    onClick={() => togglePromptExpanded(prompt.id)}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        {expandedPrompts.has(prompt.id) ? (
                          <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                        )}
                        <FileText className="h-5 w-5 shrink-0 text-primary" />
                        <div>
                          <CardTitle className="text-lg">{prompt.name}</CardTitle>
                          {prompt.description && (
                            <CardDescription>{prompt.description}</CardDescription>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {prompt.category && (
                          <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                            {prompt.category.replace(/_/g, ' ')}
                          </Badge>
                        )}
                        {prompt.modelId && AI_MODELS[prompt.modelId as AIModelId] ? (
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Cpu className="h-3 w-3" />
                            {AI_MODELS[prompt.modelId as AIModelId].name}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Default Model
                          </Badge>
                        )}
                        <Badge variant={prompt.isActive === "true" ? "default" : "secondary"}>
                          {prompt.isActive === "true" ? "Active" : "Inactive"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingPrompt(prompt)}
                          data-testid={`button-edit-prompt-${prompt.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              data-testid={`button-delete-prompt-${prompt.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Delete Prompt</DialogTitle>
                              <DialogDescription>
                                Are you sure you want to delete "{prompt.name}"? This action cannot be undone.
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <Button
                                variant="destructive"
                                onClick={() => deleteMutation.mutate(prompt.id)}
                                disabled={deleteMutation.isPending}
                              >
                                {deleteMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4 mr-2" />
                                )}
                                Delete
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </CardHeader>
                  {expandedPrompts.has(prompt.id) && (
                    <CardContent>
                    {editingPrompt?.id === prompt.id ? (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Name</Label>
                          <Input
                            value={editingPrompt.name}
                            onChange={(e) => setEditingPrompt({ ...editingPrompt, name: e.target.value })}
                            data-testid="input-edit-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Input
                            value={editingPrompt.description || ""}
                            onChange={(e) => setEditingPrompt({ ...editingPrompt, description: e.target.value })}
                            data-testid="input-edit-description"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Category (for Listing Analysis)</Label>
                          <Select 
                            value={editingPrompt.category || "none"} 
                            onValueChange={(value) => setEditingPrompt({ ...editingPrompt, category: value === "none" ? null : value })}
                          >
                            <SelectTrigger data-testid="select-edit-category">
                              <SelectValue placeholder="Select category (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No category</SelectItem>
                              <SelectItem value="photos">Photos</SelectItem>
                              <SelectItem value="title">Listing Title</SelectItem>
                              <SelectItem value="title_generator">Title Generator</SelectItem>
                              <SelectItem value="reviews">Reviews</SelectItem>
                              <SelectItem value="pet_friendly">Pet Friendly</SelectItem>
                              <SelectItem value="description">Listing Description</SelectItem>
                              <SelectItem value="description_generator">Description Generator</SelectItem>
                              <SelectItem value="sleep">Where You'll Sleep</SelectItem>
                              <SelectItem value="host_profile">Host Profile</SelectItem>
                              <SelectItem value="guest_favorites">Guest Favorites</SelectItem>
                              <SelectItem value="superhost">Superhost</SelectItem>
                              <SelectItem value="ideal_alignment">Ideal Guest Profile Alignment</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>System Prompt</Label>
                          <Textarea
                            value={editingPrompt.systemPrompt || ""}
                            onChange={(e) => setEditingPrompt({ ...editingPrompt, systemPrompt: e.target.value })}
                            rows={6}
                            className="font-mono text-sm"
                            data-testid="input-edit-system-prompt"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Prompt Template</Label>
                          <Textarea
                            value={editingPrompt.promptTemplate || ""}
                            onChange={(e) => setEditingPrompt({ ...editingPrompt, promptTemplate: e.target.value })}
                            rows={15}
                            className="font-mono text-sm"
                            data-testid="input-edit-template"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>AI Model</Label>
                          <Select 
                            value={editingPrompt.modelId || "default"} 
                            onValueChange={(value) => setEditingPrompt({ ...editingPrompt, modelId: value === "default" ? null : value })}
                          >
                            <SelectTrigger data-testid="select-edit-prompt-model">
                              <SelectValue placeholder="Use global default model" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">Use global default</SelectItem>
                              {Object.entries(AI_MODELS).map(([id, model]) => (
                                <SelectItem key={id} value={id}>
                                  {model.name} (${model.inputCost.toFixed(4)}/${model.outputCost.toFixed(4)} per 1K tokens)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Select a specific model for this prompt, or use the global default.
                          </p>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button variant="outline" onClick={() => setEditingPrompt(null)}>
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                          </Button>
                          <Button 
                            onClick={handleUpdate}
                            disabled={updateMutation.isPending}
                            data-testid="button-update-prompt"
                          >
                            {updateMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4 mr-2" />
                            )}
                            Save Changes
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {prompt.systemPrompt && (
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">System Prompt</Label>
                            <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto max-h-32 overflow-y-auto">
                              {prompt.systemPrompt}
                            </pre>
                          </div>
                        )}
                        {prompt.promptTemplate && (
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">Prompt Template</Label>
                            <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto max-h-48 overflow-y-auto">
                              {prompt.promptTemplate}
                            </pre>
                          </div>
                        )}
                        {!prompt.systemPrompt && !prompt.promptTemplate && (
                          <p className="text-muted-foreground text-sm">No prompt content configured.</p>
                        )}
                      </div>
                    )}
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No AI Prompts Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first AI prompt template to customize the analysis behavior.
                </p>
                <Button onClick={() => setIsCreating(true)} data-testid="button-create-first-prompt">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Prompt
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Prompt Template Guide</CardTitle>
              <CardDescription>Create prompts to customize AI analysis behavior</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-medium mb-3">Reserved Prompt Names</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <code className="bg-primary/10 text-primary px-2 py-1 rounded font-mono">reservation_analysis</code>
                    <span className="text-muted-foreground">Analyzes reservations to generate Tags, match Themes, and create Tasks. Used when syncing property data.</span>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-3">Reservation Analysis Placeholders</h4>
                <p className="text-sm text-muted-foreground mb-3">The reservation_analysis prompt receives reservation data in context. You can reference these in your prompt instructions:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">reservationId</Badge>
                    <span className="text-muted-foreground">Unique reservation ID</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">guestName</Badge>
                    <span className="text-muted-foreground">Guest's name</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">checkIn / checkOut</Badge>
                    <span className="text-muted-foreground">Stay dates</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">publicReview</Badge>
                    <span className="text-muted-foreground">Guest's public review</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">privateRemarks</Badge>
                    <span className="text-muted-foreground">Private feedback from guest</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">conversationHistory</Badge>
                    <span className="text-muted-foreground">Guest message thread</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Expected JSON Output</h4>
                <p className="text-sm text-muted-foreground mb-2">The reservation_analysis prompt should return JSON with this structure:</p>
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">{`{
  "reservations": [{
    "reservationId": "<id>",
    "tags": [{
      "name": "Tag Name",
      "sentiment": "positive|negative|neutral",
      "summary": "Brief explanation",
      "verbatimEvidence": "Quote from review/message",
      "suggestedTheme": "Theme Name or NEW: Theme Name",
      "suggestedTaskTitle": "Task title or null",
      "suggestedTaskDescription": "Task description or null"
    }]
  }]
}`}</pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="themes" className="space-y-6 mt-0">
          <Card data-testid="card-themes-config">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Folder className="h-5 w-5" />
                Default Themes Configuration
              </CardTitle>
              <CardDescription>
                These are the pre-seeded themes available in all workspaces. Tags are automatically assigned to these themes during AI analysis. 
                Tags that don't fit any category are assigned to "Unassigned" for later review.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">System Themes</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => backfillThemesMutation.mutate()}
                    disabled={backfillThemesMutation.isPending}
                    data-testid="button-backfill-themes"
                  >
                    {backfillThemesMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Backfilling...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Backfill Themes to All Workspaces
                      </>
                    )}
                  </Button>
                </div>
                
                {defaultThemesLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[60px]">Icon</TableHead>
                          <TableHead>Theme Name</TableHead>
                          <TableHead className="hidden md:table-cell">Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {defaultThemes?.map((theme: { name: string; icon: string; description: string }) => (
                          <TableRow key={theme.name}>
                            <TableCell className="text-2xl">{theme.icon}</TableCell>
                            <TableCell className="font-medium">{theme.name}</TableCell>
                            <TableCell className="hidden md:table-cell text-muted-foreground">{theme.description}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Theme Assignment Flow</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                      <li>AI analysis automatically assigns tags to the most relevant theme</li>
                      <li>If no theme matches, tags are assigned to "Unassigned"</li>
                      <li>Review Unassigned tags periodically to identify patterns for new themes</li>
                      <li>When a new theme pattern emerges with 5+ similar tags, create a new theme and reassign those tags</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="space-y-6 mt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Cpu className="w-4 h-4" />
                  Total Input Tokens
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-input-tokens">
                  {totalInputTokens.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Cpu className="w-4 h-4" />
                  Total Output Tokens
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-output-tokens">
                  {totalOutputTokens.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Total Estimated Cost
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary" data-testid="text-total-cost">
                  ${totalCost.toFixed(4)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Usage History
                  </CardTitle>
                  <CardDescription>
                    Detailed log of all AI API calls with token usage and costs
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select
                    value={dateRangePreset}
                    onValueChange={(value: DateRangePreset) => setDateRangePreset(value)}
                  >
                    <SelectTrigger className="w-[140px]" data-testid="select-date-range">
                      <SelectValue placeholder="Select range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="7days">Last 7 Days</SelectItem>
                      <SelectItem value="30days">Last 30 Days</SelectItem>
                      <SelectItem value="90days">Last 90 Days</SelectItem>
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {dateRangePreset === "custom" && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="justify-start text-left font-normal"
                          data-testid="button-custom-date-range"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {customDateRange?.from ? (
                            customDateRange.to ? (
                              <>
                                {format(customDateRange.from, "MMM d")} - {format(customDateRange.to, "MMM d, yyyy")}
                              </>
                            ) : (
                              format(customDateRange.from, "MMM d, yyyy")
                            )
                          ) : (
                            <span>Pick dates</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          initialFocus
                          mode="range"
                          defaultMonth={customDateRange?.from}
                          selected={customDateRange}
                          onSelect={setCustomDateRange}
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : logsError ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>
                    Failed to load AI usage logs. Please try again.
                  </AlertDescription>
                </Alert>
              ) : filteredAndSortedLogs.length > 0 ? (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead>Listing</TableHead>
                        <TableHead>
                          <div className="flex items-center gap-1">
                            <Cpu className="w-3 h-3" />
                            Model
                          </div>
                        </TableHead>
                        <TableHead>
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            User
                          </div>
                        </TableHead>
                        <TableHead>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-auto p-0 font-medium hover:bg-transparent"
                            onClick={() => handleSort("createdAt")}
                            data-testid="sort-date"
                          >
                            Date/Time
                            {getSortIcon("createdAt")}
                          </Button>
                        </TableHead>
                        <TableHead className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-auto p-0 font-medium hover:bg-transparent ml-auto"
                            onClick={() => handleSort("inputTokens")}
                            data-testid="sort-input-tokens"
                          >
                            Input Tokens
                            {getSortIcon("inputTokens")}
                          </Button>
                        </TableHead>
                        <TableHead className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-auto p-0 font-medium hover:bg-transparent ml-auto"
                            onClick={() => handleSort("outputTokens")}
                            data-testid="sort-output-tokens"
                          >
                            Output Tokens
                            {getSortIcon("outputTokens")}
                          </Button>
                        </TableHead>
                        <TableHead className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-auto p-0 font-medium hover:bg-transparent ml-auto"
                            onClick={() => handleSort("estimatedCost")}
                            data-testid="sort-cost"
                          >
                            Est. Cost
                            {getSortIcon("estimatedCost")}
                          </Button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAndSortedLogs.map((log) => (
                        <TableRow key={log.id} data-testid={`row-ai-usage-${log.id}`}>
                          <TableCell>
                            <Badge variant="outline" className="font-normal">
                              {log.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate" title={log.listingName || undefined}>
                            {log.listingName || "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs" data-testid={`text-model-${log.id}`}>
                              {log.model || "gpt-4.1-mini"}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[120px] truncate" title={log.userName || undefined}>
                            {log.userName || "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm">{formatDate(log.createdAt)}</span>
                              <span className="text-xs text-muted-foreground">{formatTime(log.createdAt)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {(log.inputTokens || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {(log.outputTokens || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-primary">
                            {formatCost(log.estimatedCost)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : logs && logs.length > 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CalendarIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No logs found for selected date range</p>
                  <p className="text-sm">Try adjusting your date filter</p>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Cpu className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No AI usage logs yet</p>
                  <p className="text-sm">Usage will be recorded when AI analysis is performed</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="speedtest" className="space-y-6 mt-0">
          <Card data-testid="card-speedtest">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                AI Speed & Quality Test: Grok vs OpenAI
              </CardTitle>
              <CardDescription>
                Compare response times and quality between Grok (via OpenRouter) and OpenAI models.
                Use real reservation data to evaluate both speed and analysis quality.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Test Mode Toggle */}
              <div className="flex gap-2 border-b pb-4 flex-wrap">
                <Button 
                  variant={speedTestMode === "sync" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => { setSpeedTestMode("sync"); setUnifiedTestResult(null); }}
                  data-testid="button-mode-sync"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Initial Sync Test
                </Button>
                <Button 
                  variant={speedTestMode === "sentiment" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => { setSpeedTestMode("sentiment"); setUnifiedTestResult(null); }}
                  data-testid="button-mode-sentiment"
                >
                  <Heart className="h-4 w-4 mr-2" />
                  Sentiment Score Test
                </Button>
                <Button 
                  variant={speedTestMode === "simple" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setSpeedTestMode("simple")}
                  data-testid="button-mode-simple"
                >
                  Simple Prompt Test
                </Button>
              </div>

              {(speedTestMode === "sync" || speedTestMode === "sentiment") ? (
                <>
                  {/* Unified Test Mode (Sync or Sentiment) */}
                  <div className="grid gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Workspace</Label>
                        <Select 
                          value={testWorkspaceId} 
                          onValueChange={(v) => {
                            setTestWorkspaceId(v);
                            setTestListingId("");
                          }}
                        >
                          <SelectTrigger data-testid="select-test-workspace">
                            <SelectValue placeholder="Select workspace" />
                          </SelectTrigger>
                          <SelectContent>
                            {workspaces?.map((ws) => (
                              <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Property</Label>
                        <Select 
                          value={testListingId} 
                          onValueChange={setTestListingId}
                          disabled={!testWorkspaceId}
                        >
                          <SelectTrigger data-testid="select-test-listing">
                            <SelectValue placeholder={testWorkspaceId ? "Select property" : "Select workspace first"} />
                          </SelectTrigger>
                          <SelectContent>
                            {testListings?.map((listing) => (
                              <SelectItem key={listing.id} value={listing.id}>{listing.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Reservation Period</Label>
                        <Select value={testDaysBack} onValueChange={setTestDaysBack}>
                          <SelectTrigger data-testid="select-test-days">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="30">30 days</SelectItem>
                            <SelectItem value="60">60 days</SelectItem>
                            <SelectItem value="90">90 days</SelectItem>
                            <SelectItem value="180">180 days</SelectItem>
                            <SelectItem value="365">1 year</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Model A</Label>
                        <Select value={speedTestModelA} onValueChange={setSpeedTestModelA}>
                          <SelectTrigger data-testid="select-model-a">
                            <SelectValue placeholder="Select model" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(AI_MODELS).map(([id, info]) => (
                              <SelectItem key={id} value={id}>
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${getPriceHeatmapColor(id)}`} />
                                  <span>{info.name}</span>
                                  <span className="text-xs text-muted-foreground ml-auto">
                                    ${((info.inputCost + info.outputCost) / 2).toFixed(4)}/1K
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Model B</Label>
                        <Select value={speedTestModelB} onValueChange={setSpeedTestModelB}>
                          <SelectTrigger data-testid="select-model-b">
                            <SelectValue placeholder="Select model" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(AI_MODELS).map(([id, info]) => (
                              <SelectItem key={id} value={id}>
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${getPriceHeatmapColor(id)}`} />
                                  <span>{info.name}</span>
                                  <span className="text-xs text-muted-foreground ml-auto">
                                    ${((info.inputCost + info.outputCost) / 2).toFixed(4)}/1K
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Button
                      className="w-full"
                      onClick={() => {
                        const endDate = new Date();
                        const startDate = new Date();
                        startDate.setDate(startDate.getDate() - parseInt(testDaysBack));
                        const testData = {
                          workspaceId: testWorkspaceId,
                          listingId: testListingId,
                          startDate: startDate.toISOString(),
                          endDate: endDate.toISOString(),
                          modelA: speedTestModelA,
                          modelB: speedTestModelB,
                        };
                        if (speedTestMode === "sync") {
                          syncSpeedTestMutation.mutate(testData);
                        } else {
                          sentimentSpeedTestMutation.mutate(testData);
                        }
                      }}
                      disabled={(syncSpeedTestMutation.isPending || sentimentSpeedTestMutation.isPending) || !testWorkspaceId || !testListingId}
                      data-testid="button-run-unified-test"
                    >
                      {(syncSpeedTestMutation.isPending || sentimentSpeedTestMutation.isPending) ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Running {speedTestMode === "sync" ? "Initial Sync" : "Sentiment"} Test...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Run {speedTestMode === "sync" ? "Initial Sync" : "Sentiment Score"} Test
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Unified Test Results */}
                  {unifiedTestResult && (
                    <div className="mt-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">
                          {unifiedTestResult.testType === "sync" ? "Initial Sync" : "Sentiment Score"} Test Results
                        </h3>
                        <Badge variant={unifiedTestResult.comparison.hasErrors ? "destructive" : "secondary"}>
                          {unifiedTestResult.testConfig.reservationCount} reservations tested
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Model A Results */}
                        <Card className={unifiedTestResult.comparison.winner === "modelA" && !unifiedTestResult.results.modelA.error ? "border-green-500 border-2" : unifiedTestResult.results.modelA.error ? "border-destructive border-2" : ""}>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center justify-between gap-2">
                              <span>{AI_MODELS[unifiedTestResult.results.modelA.model as AIModelId]?.name || unifiedTestResult.results.modelA.model}</span>
                              <div className="flex gap-1">
                                {unifiedTestResult.results.modelA.error && <Badge variant="destructive">Invalid</Badge>}
                                {unifiedTestResult.comparison.winner === "modelA" && !unifiedTestResult.results.modelA.error && <Badge className="bg-green-500">Winner</Badge>}
                              </div>
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Response Time:</span>
                              <span className="font-mono">{(unifiedTestResult.results.modelA.responseTime / 1000).toFixed(2)}s</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Tokens (in/out):</span>
                              <span className="font-mono">{unifiedTestResult.results.modelA.tokens.input}/{unifiedTestResult.results.modelA.tokens.output}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Est. Cost:</span>
                              <span className="font-mono">${unifiedTestResult.results.modelA.estimatedCost.toFixed(4)}</span>
                            </div>
                            {unifiedTestResult.testType === "sync" && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Tags Found:</span>
                                <span className={`font-mono ${(unifiedTestResult.results.modelA.tagCount || 0) === 0 ? "text-destructive" : ""}`}>{unifiedTestResult.results.modelA.tagCount || 0}</span>
                              </div>
                            )}
                            {unifiedTestResult.testType === "sentiment" && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Scores Returned:</span>
                                <span className={`font-mono ${(unifiedTestResult.results.modelA.scoresReturned || 0) === 0 ? "text-destructive" : ""}`}>{unifiedTestResult.results.modelA.scoresReturned || 0}</span>
                              </div>
                            )}
                            {unifiedTestResult.results.modelA.error && (
                              <div className="text-destructive text-xs mt-2 p-2 bg-destructive/10 rounded">{unifiedTestResult.results.modelA.error}</div>
                            )}
                          </CardContent>
                        </Card>

                        {/* Model B Results */}
                        <Card className={unifiedTestResult.comparison.winner === "modelB" && !unifiedTestResult.results.modelB.error ? "border-green-500 border-2" : unifiedTestResult.results.modelB.error ? "border-destructive border-2" : ""}>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center justify-between gap-2">
                              <span>{AI_MODELS[unifiedTestResult.results.modelB.model as AIModelId]?.name || unifiedTestResult.results.modelB.model}</span>
                              <div className="flex gap-1">
                                {unifiedTestResult.results.modelB.error && <Badge variant="destructive">Invalid</Badge>}
                                {unifiedTestResult.comparison.winner === "modelB" && !unifiedTestResult.results.modelB.error && <Badge className="bg-green-500">Winner</Badge>}
                              </div>
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Response Time:</span>
                              <span className="font-mono">{(unifiedTestResult.results.modelB.responseTime / 1000).toFixed(2)}s</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Tokens (in/out):</span>
                              <span className="font-mono">{unifiedTestResult.results.modelB.tokens.input}/{unifiedTestResult.results.modelB.tokens.output}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Est. Cost:</span>
                              <span className="font-mono">${unifiedTestResult.results.modelB.estimatedCost.toFixed(4)}</span>
                            </div>
                            {unifiedTestResult.testType === "sync" && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Tags Found:</span>
                                <span className={`font-mono ${(unifiedTestResult.results.modelB.tagCount || 0) === 0 ? "text-destructive" : ""}`}>{unifiedTestResult.results.modelB.tagCount || 0}</span>
                              </div>
                            )}
                            {unifiedTestResult.testType === "sentiment" && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Scores Returned:</span>
                                <span className={`font-mono ${(unifiedTestResult.results.modelB.scoresReturned || 0) === 0 ? "text-destructive" : ""}`}>{unifiedTestResult.results.modelB.scoresReturned || 0}</span>
                              </div>
                            )}
                            {unifiedTestResult.results.modelB.error && (
                              <div className="text-destructive text-xs mt-2 p-2 bg-destructive/10 rounded">{unifiedTestResult.results.modelB.error}</div>
                            )}
                          </CardContent>
                        </Card>
                      </div>

                      {/* Summary */}
                      <div className={`p-4 rounded-lg space-y-2 ${unifiedTestResult.comparison.hasErrors ? "bg-destructive/10" : "bg-muted/50"}`}>
                        {unifiedTestResult.comparison.hasErrors && (
                          <div className="flex items-center gap-2 text-destructive font-medium mb-2">
                            <AlertCircle className="h-4 w-4" />
                            <span>Test has invalid results - one or both models failed to produce valid output</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Speed Winner:</span>
                          <span className={`font-semibold ${unifiedTestResult.comparison.winner === "inconclusive" ? "text-muted-foreground" : "text-green-600 dark:text-green-400"}`}>
                            {unifiedTestResult.comparison.winner === "inconclusive" ? "Inconclusive (both tests invalid)" :
                             unifiedTestResult.comparison.winner === "tie" ? "Tie" : 
                              `${AI_MODELS[(unifiedTestResult.comparison.winner === "modelA" ? unifiedTestResult.results.modelA.model : unifiedTestResult.results.modelB.model) as AIModelId]?.name || "Winner"} was ${unifiedTestResult.comparison.percentageFaster}% faster`
                            }
                          </span>
                        </div>
                        {!unifiedTestResult.comparison.hasErrors && (() => {
                          const costA = unifiedTestResult.results.modelA.estimatedCost;
                          const costB = unifiedTestResult.results.modelB.estimatedCost;
                          const costDiff = Math.abs(costA - costB);
                          const maxCost = Math.max(costA, costB);
                          const costDiffPercent = maxCost > 0 ? ((costDiff / maxCost) * 100).toFixed(1) : "0";
                          const cheaperModel = costA < costB ? unifiedTestResult.results.modelA.model : unifiedTestResult.results.modelB.model;
                          const cheaperName = AI_MODELS[cheaperModel as AIModelId]?.name || "Model";
                          return (
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Cost Comparison:</span>
                              <span className="text-muted-foreground">
                                {costA === costB ? "Same cost" : 
                                  `${cheaperName} was ${costDiffPercent}% cheaper`
                                }
                              </span>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Side-by-side Quality Comparison */}
                      {(unifiedTestResult.results.modelA.reservations?.length > 0 || unifiedTestResult.results.modelB.reservations?.length > 0) && (
                        <div className="mt-6">
                          <div className="flex items-center gap-2 mb-4">
                            <ChevronDown className="h-4 w-4" />
                            <span className="font-semibold">Quality Comparison (Side-by-Side)</span>
                          </div>
                          
                          {/* Get all unique reservation IDs from both models */}
                          {(() => {
                            const allReservationIds = new Set<string>();
                            (unifiedTestResult.results.modelA.reservations || []).forEach((r: any) => allReservationIds.add(r.id));
                            (unifiedTestResult.results.modelB.reservations || []).forEach((r: any) => allReservationIds.add(r.id));
                            
                            return Array.from(allReservationIds).map((resId) => {
                              const modelARes = (unifiedTestResult.results.modelA.reservations || []).find((r: any) => r.id === resId);
                              const modelBRes = (unifiedTestResult.results.modelB.reservations || []).find((r: any) => r.id === resId);
                              
                              return (
                                <div key={resId} className="mb-4 p-3 rounded-lg border bg-card">
                                  <div className="text-xs text-muted-foreground mb-2 font-mono">Reservation: {resId}</div>
                                  <div className="grid grid-cols-2 gap-4">
                                    {/* Model A Output */}
                                    <div className="space-y-2">
                                      <div className="text-xs font-medium text-muted-foreground">
                                        {AI_MODELS[unifiedTestResult.results.modelA.model as AIModelId]?.name || "Model A"}
                                      </div>
                                      {unifiedTestResult.testType === "sync" && modelARes?.tags ? (
                                        <div className="space-y-1">
                                          {modelARes.tags.map((tag: any, idx: number) => (
                                            <div key={idx} className="text-xs p-2 rounded bg-muted">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <Badge 
                                                  className={`text-xs ${
                                                    tag.sentiment === "positive" ? "bg-green-500 hover:bg-green-600" : 
                                                    tag.sentiment === "negative" ? "bg-red-500 hover:bg-red-600" : 
                                                    tag.sentiment === "question" ? "bg-blue-500 hover:bg-blue-600" : 
                                                    "bg-yellow-500 hover:bg-yellow-600 text-black"
                                                  }`}
                                                >
                                                  {tag.name}
                                                </Badge>
                                                {tag.theme && <span className="text-muted-foreground">Theme: {tag.theme}</span>}
                                              </div>
                                              {tag.summary && <div className="text-muted-foreground mt-1">{tag.summary}</div>}
                                            </div>
                                          ))}
                                        </div>
                                      ) : unifiedTestResult.testType === "sentiment" && modelARes ? (
                                        <div className="text-xs p-2 rounded bg-muted">
                                          <div className="flex items-center gap-2">
                                            <span className="font-semibold">Score: {modelARes.score}</span>
                                          </div>
                                          {modelARes.summary && <div className="text-muted-foreground mt-1">{modelARes.summary}</div>}
                                        </div>
                                      ) : (
                                        <div className="text-xs text-muted-foreground italic">No data</div>
                                      )}
                                    </div>
                                    
                                    {/* Model B Output */}
                                    <div className="space-y-2">
                                      <div className="text-xs font-medium text-muted-foreground">
                                        {AI_MODELS[unifiedTestResult.results.modelB.model as AIModelId]?.name || "Model B"}
                                      </div>
                                      {unifiedTestResult.testType === "sync" && modelBRes?.tags ? (
                                        <div className="space-y-1">
                                          {modelBRes.tags.map((tag: any, idx: number) => (
                                            <div key={idx} className="text-xs p-2 rounded bg-muted">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <Badge 
                                                  className={`text-xs ${
                                                    tag.sentiment === "positive" ? "bg-green-500 hover:bg-green-600" : 
                                                    tag.sentiment === "negative" ? "bg-red-500 hover:bg-red-600" : 
                                                    tag.sentiment === "question" ? "bg-blue-500 hover:bg-blue-600" : 
                                                    "bg-yellow-500 hover:bg-yellow-600 text-black"
                                                  }`}
                                                >
                                                  {tag.name}
                                                </Badge>
                                                {tag.theme && <span className="text-muted-foreground">Theme: {tag.theme}</span>}
                                              </div>
                                              {tag.summary && <div className="text-muted-foreground mt-1">{tag.summary}</div>}
                                            </div>
                                          ))}
                                        </div>
                                      ) : unifiedTestResult.testType === "sentiment" && modelBRes ? (
                                        <div className="text-xs p-2 rounded bg-muted">
                                          <div className="flex items-center gap-2">
                                            <span className="font-semibold">Score: {modelBRes.score}</span>
                                          </div>
                                          {modelBRes.summary && <div className="text-muted-foreground mt-1">{modelBRes.summary}</div>}
                                        </div>
                                      ) : (
                                        <div className="text-xs text-muted-foreground italic">No data</div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Simple Speed Test Mode */}
                  <div className="grid gap-4 max-w-2xl">
                    <p className="text-sm text-muted-foreground">
                      Simple prompt-based speed test. Select "Initial Sync Test" or "Sentiment Score Test" above to compare AI models with real reservation data.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="simple-speed-test-prompt">Test Prompt</Label>
                      <Textarea
                        id="simple-speed-test-prompt"
                        placeholder="Enter a test prompt..."
                        value={speedTestPrompt}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSpeedTestPrompt(e.target.value)}
                        rows={3}
                        data-testid="input-simple-speed-test-prompt"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>OpenAI Model</Label>
                        <Select value={speedTestOpenAIModel} onValueChange={setSpeedTestOpenAIModel}>
                          <SelectTrigger data-testid="select-simple-openai-model">
                            <SelectValue placeholder="Select OpenAI model" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(AI_MODELS)
                              .filter(([_, info]) => info.provider === "openai")
                              .map(([id, info]) => (
                                <SelectItem key={id} value={id}>{info.name}</SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Grok Model</Label>
                        <Select value={speedTestGrokModel} onValueChange={setSpeedTestGrokModel}>
                          <SelectTrigger data-testid="select-simple-grok-model">
                            <SelectValue placeholder="Select Grok model" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(AI_MODELS)
                              .filter(([_, info]) => info.provider === "openrouter")
                              .map(([id, info]) => (
                                <SelectItem key={id} value={id}>{info.name}</SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Button 
                      onClick={() => speedTestMutation.mutate({ prompt: speedTestPrompt, openaiModel: speedTestOpenAIModel, grokModel: speedTestGrokModel })}
                      disabled={speedTestMutation.isPending || !speedTestPrompt.trim()}
                      data-testid="button-run-simple-speed-test"
                    >
                      {speedTestMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Run Simple Speed Test
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Simple Speed Test Results */}
                  {speedTestResult && (
                    <Card className="mt-4">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Simple Speed Test Results</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className={`p-3 rounded-lg border ${speedTestResult.winner === "openai" ? "border-green-500 bg-green-50 dark:bg-green-950/20" : ""}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-sm">OpenAI</span>
                              {speedTestResult.winner === "openai" && <Badge className="bg-green-500">Winner</Badge>}
                            </div>
                            <div className="text-2xl font-mono">{(speedTestResult.openaiResult.responseTime / 1000).toFixed(2)}s</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {speedTestResult.openaiResult.tokensUsed.input}/{speedTestResult.openaiResult.tokensUsed.output} tokens • ${speedTestResult.openaiResult.estimatedCost.toFixed(4)}
                            </div>
                          </div>
                          <div className={`p-3 rounded-lg border ${speedTestResult.winner === "grok" ? "border-green-500 bg-green-50 dark:bg-green-950/20" : ""}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-sm">Grok</span>
                              {speedTestResult.winner === "grok" && <Badge className="bg-green-500">Winner</Badge>}
                            </div>
                            <div className="text-2xl font-mono">{(speedTestResult.grokResult.responseTime / 1000).toFixed(2)}s</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {speedTestResult.grokResult.tokensUsed.input}/{speedTestResult.grokResult.tokensUsed.output} tokens • ${speedTestResult.grokResult.estimatedCost.toFixed(4)}
                            </div>
                          </div>
                        </div>
                        <div className="text-center text-sm text-muted-foreground">
                          {speedTestResult.winner === "tie" ? "It's a tie!" : `${speedTestResult.winner === "openai" ? "OpenAI" : "Grok"} was ${speedTestResult.percentageFaster}% faster`}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-6 mt-0">
          <Card data-testid="card-webhooks">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="h-5 w-5" />
                Webhook Logs
              </CardTitle>
              <CardDescription>
                Monitor incoming webhooks from external services like Hospitable
              </CardDescription>
            </CardHeader>
            <CardContent>
              {webhookLogsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : webhookLogs && webhookLogs.length > 0 ? (
                <>
                  {/* Desktop Table View - hidden on small screens */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Event</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Processing</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {webhookLogs.map((log) => (
                          <TableRow 
                            key={log.id} 
                            data-testid={`row-webhook-${log.id}`}
                            className="cursor-pointer hover-elevate"
                            onClick={() => setSelectedWebhook(log)}
                          >
                            <TableCell className="whitespace-nowrap text-sm">
                              {log.createdAt ? format(new Date(log.createdAt), "MMM d, HH:mm:ss") : "-"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{log.source}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {log.eventType}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={log.status === "success" ? "default" : log.status === "error" ? "destructive" : "secondary"}
                              >
                                {log.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {log.processingTimeMs ? `${log.processingTimeMs}ms` : "-"}
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                              {log.errorMessage || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Card View - visible only on small screens */}
                  <div className="md:hidden space-y-3">
                    {webhookLogs.map((log) => (
                      <div
                        key={log.id}
                        data-testid={`card-webhook-${log.id}`}
                        className="p-4 border rounded-md cursor-pointer hover-elevate space-y-2"
                        onClick={() => setSelectedWebhook(log)}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <Badge 
                            variant={log.status === "success" ? "default" : log.status === "error" ? "destructive" : "secondary"}
                          >
                            {log.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {log.createdAt ? format(new Date(log.createdAt), "MMM d, HH:mm:ss") : "-"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">{log.source}</Badge>
                          <span className="font-mono text-sm">{log.eventType}</span>
                        </div>
                        {log.errorMessage && (
                          <p className="text-sm text-destructive truncate">{log.errorMessage}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {log.processingTimeMs ? `Processing: ${log.processingTimeMs}ms` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Webhook className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No webhook logs yet</p>
                  <p className="text-sm">Webhook events will appear here when received</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Webhook Detail Sheet */}
          <Sheet open={!!selectedWebhook} onOpenChange={(open) => !open && setSelectedWebhook(null)}>
            <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Webhook className="h-5 w-5" />
                  Webhook Details
                </SheetTitle>
                <SheetDescription>
                  Full details for this webhook event
                </SheetDescription>
              </SheetHeader>
              
              {selectedWebhook && (() => {
                const log = selectedWebhook as {
                  id: string;
                  source: string;
                  eventType: string;
                  status: string;
                  statusCode: number | null;
                  payload: Record<string, unknown> | null;
                  errorMessage: string | null;
                  reservationId: string | null;
                  listingId: string | null;
                  workspaceId: string | null;
                  processingTimeMs: number | null;
                  createdAt: Date | null;
                };
                return (
                  <ScrollArea className="flex-1 -mx-6 px-6">
                    <div className="space-y-4 py-4">
                      {/* Status and Time */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Badge 
                          variant={log.status === "success" ? "default" : log.status === "error" ? "destructive" : "secondary"}
                        >
                          {log.status}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {log.createdAt ? format(new Date(log.createdAt), "PPpp") : "-"}
                        </span>
                      </div>

                      {/* Basic Info */}
                      <div className="grid gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Source</Label>
                          <p className="text-sm font-medium">{log.source}</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Event Type</Label>
                          <p className="text-sm font-mono">{log.eventType}</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Processing Time</Label>
                          <p className="text-sm">{log.processingTimeMs ? `${log.processingTimeMs}ms` : "-"}</p>
                        </div>
                        {log.statusCode != null && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Status Code</Label>
                            <p className="text-sm">{log.statusCode}</p>
                          </div>
                        )}
                        {log.reservationId != null && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Reservation ID</Label>
                            <p className="text-sm font-mono break-all">{log.reservationId}</p>
                          </div>
                        )}
                        {log.listingId != null && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Listing ID</Label>
                            <p className="text-sm font-mono break-all">{log.listingId}</p>
                          </div>
                        )}
                        {log.workspaceId != null && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Workspace ID</Label>
                            <p className="text-sm font-mono break-all">{log.workspaceId}</p>
                          </div>
                        )}
                      </div>

                      {/* Error Message */}
                      {log.errorMessage && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Error Message</Label>
                          <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription className="text-sm whitespace-pre-wrap break-words">
                              {log.errorMessage}
                            </AlertDescription>
                          </Alert>
                        </div>
                      )}

                      {/* Payload */}
                      {log.payload && (
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Payload</Label>
                          <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
                            {JSON.stringify(log.payload, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                );
              })()}
            </SheetContent>
          </Sheet>
        </TabsContent>

        <TabsContent value="users" className="space-y-6 mt-0">
          <Card data-testid="card-users">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                All Users
              </CardTitle>
              <CardDescription>
                View all registered users and manage access
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 space-y-3">
                <div className="relative max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, workspace, or cleaner name..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-user-search"
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {(["all", "cleaners", "managers", "staff"] as const).map((filter) => (
                    <Button
                      key={filter}
                      size="sm"
                      variant={userTypeFilter === filter ? "default" : "outline"}
                      onClick={() => setUserTypeFilter(filter)}
                      data-testid={`button-filter-${filter}`}
                    >
                      {filter === "all" ? "All Users" : filter === "cleaners" ? "Cleaners" : filter === "managers" ? "Managers" : "Non-Cleaners"}
                    </Button>
                  ))}
                </div>
              </div>
              {usersLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                      <Skeleton className="h-8 w-24" />
                    </div>
                  ))}
                </div>
              ) : allUsers && allUsers.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Cleaner Profile</TableHead>
                        <TableHead>Workspace</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Last Login</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground" data-testid="text-no-users-found">
                            No users found matching "{userSearchQuery}"
                          </TableCell>
                        </TableRow>
                      ) : filteredUsers.map((u) => (
                        <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8">
                                {u.profileImageUrl ? (
                                  <AvatarImage src={u.profileImageUrl} alt="" />
                                ) : null}
                                <AvatarFallback>
                                  <User className="w-4 h-4" />
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium">
                                  {u.firstName && u.lastName 
                                    ? `${u.firstName} ${u.lastName}` 
                                    : u.email?.split("@")[0] || "Unknown"}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {u.email || "No email"}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {u.cleanerProfiles && u.cleanerProfiles.length > 0 ? (
                              <div className="space-y-1">
                                {u.cleanerProfiles.map((cp) => (
                                  <div key={cp.id} className="flex items-center gap-1.5 flex-wrap">
                                    <Badge
                                      variant={cp.type === "company" || cp.type === "cleaning_manager" ? "default" : "secondary"}
                                      className="text-xs capitalize"
                                    >
                                      {cp.type === "cleaning_manager" ? "Manager" : cp.type === "company" ? "Company" : cp.parentId ? "Team Member" : "Individual"}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">{cp.name}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {u.workspaces && u.workspaces.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {u.workspaces.map((w) => (
                                  <Badge key={w.id} variant="secondary" className="text-xs">
                                    {w.name}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">None</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={u.role === "app_admin" ? "default" : "secondary"}
                              className="capitalize"
                            >
                              {u.role?.replace(/_/g, " ") || "user"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {u.createdAt ? formatDate(u.createdAt) : "-"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {u.lastLoginAt ? formatDate(u.lastLoginAt) : "Never"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant={u.role === "app_admin" ? "default" : "outline"}
                                onClick={() => setUserToToggleAdmin(u)}
                                disabled={u.id === user?.id}
                                data-testid={`button-toggle-admin-${u.id}`}
                                title={u.role === "app_admin" ? "Remove Super Admin" : "Make Super Admin"}
                              >
                                {u.role === "app_admin" ? (
                                  <ShieldOff className="w-3 h-3 mr-1" />
                                ) : (
                                  <Shield className="w-3 h-3 mr-1" />
                                )}
                                {u.role === "app_admin" ? "Demote" : "Promote"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => impersonateMutation.mutate(u.id)}
                                disabled={u.id === user?.id || impersonateMutation.isPending}
                                data-testid={`button-impersonate-${u.id}`}
                              >
                                {impersonateMutation.isPending ? (
                                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                ) : (
                                  <ExternalLink className="w-3 h-3 mr-1" />
                                )}
                                Impersonate
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setUserToDelete(u)}
                                disabled={u.id === user?.id}
                                data-testid={`button-delete-${u.id}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No users found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devtools" className="space-y-6 mt-0">
          <Card data-testid="card-devtools">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Development Tools
              </CardTitle>
              <CardDescription>
                Import/export Hospitable credentials between production and development environments.
                Use this to sync real data in development for testing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Export Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Export Credentials (from this environment)
                </h3>
                <p className="text-sm text-muted-foreground">
                  Copy credentials from an existing data source to import into another environment.
                </p>
                
                {dataSourcesLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : adminDataSources && adminDataSources.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>User ID</TableHead>
                        <TableHead>Connected</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adminDataSources.map((ds) => (
                        <TableRow key={ds.id}>
                          <TableCell className="font-medium">{ds.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{ds.provider}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{ds.userId}</TableCell>
                          <TableCell>
                            {ds.isConnected ? (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Connected</Badge>
                            ) : (
                              <Badge variant="secondary">Disconnected</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleExportCredentials(ds.id)}
                              data-testid={`button-export-${ds.id}`}
                            >
                              {copiedCredentials === ds.id ? (
                                <>
                                  <Check className="w-3 h-3 mr-1" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 mr-1" />
                                  Export
                                </>
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg">
                    <Wrench className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No data sources found in this environment</p>
                  </div>
                )}
              </div>

              <hr className="my-6" />

              {/* Import Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Import Credentials (into this environment)
                </h3>
                <p className="text-sm text-muted-foreground">
                  Paste credentials exported from another environment to set up a data source here.
                </p>
                
                <div className="grid gap-4 max-w-xl">
                  <div className="space-y-2">
                    <Label htmlFor="import-name">Connection Name</Label>
                    <Input
                      id="import-name"
                      placeholder="e.g., Production Hospitable"
                      value={importFormData.name}
                      onChange={(e) => setImportFormData({ ...importFormData, name: e.target.value })}
                      data-testid="input-import-name"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="import-access-token">Access Token</Label>
                    <Textarea
                      id="import-access-token"
                      placeholder="Paste the access token from exported credentials"
                      value={importFormData.accessToken}
                      onChange={(e) => setImportFormData({ ...importFormData, accessToken: e.target.value })}
                      rows={3}
                      data-testid="input-import-access-token"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="import-refresh-token">Refresh Token (optional)</Label>
                    <Textarea
                      id="import-refresh-token"
                      placeholder="Paste the refresh token from exported credentials"
                      value={importFormData.refreshToken}
                      onChange={(e) => setImportFormData({ ...importFormData, refreshToken: e.target.value })}
                      rows={3}
                      data-testid="input-import-refresh-token"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="import-workspace">Workspace ID (optional)</Label>
                    <Input
                      id="import-workspace"
                      placeholder="Leave empty to use your current workspace"
                      value={importFormData.workspaceId}
                      onChange={(e) => setImportFormData({ ...importFormData, workspaceId: e.target.value })}
                      data-testid="input-import-workspace"
                    />
                  </div>
                  
                  <Button
                    onClick={() => importDataSourceMutation.mutate(importFormData)}
                    disabled={!importFormData.name || !importFormData.accessToken || importDataSourceMutation.isPending}
                    data-testid="button-import-datasource"
                  >
                    {importDataSourceMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="w-4 h-4 mr-2" />
                    )}
                    Import Data Source
                  </Button>
                </div>
              </div>

              {/* Instructions */}
              <div className="mt-8 p-4 bg-muted rounded-lg">
                <h4 className="font-semibold mb-2">How to sync Hospitable data to development:</h4>
                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                  <li>In <strong>production</strong> (hostpulse.ai), connect your Hospitable account via OAuth</li>
                  <li>In <strong>production</strong> admin portal, go to Dev Tools and click "Export" on your data source</li>
                  <li>In <strong>development</strong> admin portal, paste the access token and refresh token here</li>
                  <li>After import, go to "Connect Data Source" to sync your properties</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="changelog" className="space-y-6 mt-0" data-testid="changelog-tab-content">
          <ChangelogManagement />
        </TabsContent>

        <TabsContent value="permissions" className="space-y-6 mt-0" data-testid="permissions-tab-content">
          <PermissionsManagement />
        </TabsContent>

        <TabsContent value="procedure-template" className="space-y-6 mt-0" data-testid="procedure-template-tab-content">
          <ProcedureTemplateManagement />
        </TabsContent>

        <TabsContent value="category-weights" className="space-y-6 mt-0" data-testid="category-weights-tab-content">
          <CategoryWeightsPanel />
        </TabsContent>
      </div>

      {/* Delete User Confirmation Dialog */}
      <Dialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this user? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {userToDelete && (
            <div className="py-4">
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  {userToDelete.profileImageUrl ? (
                    <AvatarImage src={userToDelete.profileImageUrl} alt="" />
                  ) : null}
                  <AvatarFallback>
                    <User className="w-5 h-5" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">
                    {userToDelete.firstName && userToDelete.lastName 
                      ? `${userToDelete.firstName} ${userToDelete.lastName}` 
                      : userToDelete.email?.split("@")[0] || "Unknown"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {userToDelete.email || "No email"}
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUserToDelete(null)}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => userToDelete && deleteUserMutation.mutate(userToDelete.id)}
              disabled={deleteUserMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteUserMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Super Admin Toggle Confirmation Dialog */}
      <Dialog open={!!userToToggleAdmin} onOpenChange={(open) => !open && setUserToToggleAdmin(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {userToToggleAdmin?.role === "app_admin" ? "Remove Super Admin Access" : "Grant Super Admin Access"}
            </DialogTitle>
            <DialogDescription>
              {userToToggleAdmin?.role === "app_admin" 
                ? "This will remove Super Admin privileges from this user. They will no longer have access to the admin panel."
                : "This will give this user full Super Admin access to manage all users, AI settings, and system configuration."}
            </DialogDescription>
          </DialogHeader>
          {userToToggleAdmin && (
            <div className="py-4">
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  {userToToggleAdmin.profileImageUrl ? (
                    <AvatarImage src={userToToggleAdmin.profileImageUrl} alt="" />
                  ) : null}
                  <AvatarFallback>
                    <User className="w-5 h-5" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">
                    {userToToggleAdmin.firstName && userToToggleAdmin.lastName 
                      ? `${userToToggleAdmin.firstName} ${userToToggleAdmin.lastName}` 
                      : userToToggleAdmin.email?.split("@")[0] || "Unknown"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {userToToggleAdmin.email || "No email"}
                  </div>
                </div>
              </div>
              <div className="mt-4 p-3 rounded-md bg-muted">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Current role:</span>
                  <Badge variant={userToToggleAdmin.role === "app_admin" ? "default" : "secondary"} className="capitalize">
                    {userToToggleAdmin.role?.replace(/_/g, " ") || "user"}
                  </Badge>
                  <span className="text-muted-foreground mx-2">→</span>
                  <Badge variant={userToToggleAdmin.role === "app_admin" ? "secondary" : "default"} className="capitalize">
                    {userToToggleAdmin.role === "app_admin" ? "user staff" : "app admin"}
                  </Badge>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUserToToggleAdmin(null)}
              data-testid="button-cancel-toggle-admin"
            >
              Cancel
            </Button>
            <Button
              variant={userToToggleAdmin?.role === "app_admin" ? "destructive" : "default"}
              onClick={() => {
                if (userToToggleAdmin) {
                  const newRole = userToToggleAdmin.role === "app_admin" ? "user_staff" : "app_admin";
                  updateUserRoleMutation.mutate({ userId: userToToggleAdmin.id, role: newRole });
                }
              }}
              disabled={updateUserRoleMutation.isPending}
              data-testid="button-confirm-toggle-admin"
            >
              {updateUserRoleMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : userToToggleAdmin?.role === "app_admin" ? (
                <ShieldOff className="w-4 h-4 mr-2" />
              ) : (
                <Shield className="w-4 h-4 mr-2" />
              )}
              {userToToggleAdmin?.role === "app_admin" ? "Remove Super Admin" : "Grant Super Admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
