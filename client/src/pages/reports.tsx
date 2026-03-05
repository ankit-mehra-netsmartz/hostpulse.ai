import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useWorkspace } from "@/contexts/workspace-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ReservationDetailSheet } from "@/components/reservation-detail-sheet";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { 
  FileText, 
  Plus, 
  Calendar as CalendarIcon, 
  Users, 
  BarChart3, 
  AlertTriangle, 
  CheckCircle2,
  Clock,
  TrendingUp,
  Loader2,
  Pencil,
  Trash2,
  Play,
  UserCheck,
  Building2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  User
} from "lucide-react";
import type { Report, Listing, Reservation } from "@shared/schema";

interface ReportWithStats extends Report {
  stats?: {
    checkIns: number;
    checkOuts: number;
    escalations: number;
    smoothReservations: number;
    moderateReservations: number;
    troubleReservations: number;
    avgResponseTime?: number;
    repeatGuests?: number;
  };
}

export default function ReportsPage() {
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState<"staff_meeting" | "repeat_guests">("staff_meeting");
  const [reportName, setReportName] = useState("");
  const [dateRangeType, setDateRangeType] = useState("last_30_days");
  const [customStartDate, setCustomStartDate] = useState<Date>();
  const [customEndDate, setCustomEndDate] = useState<Date>();
  const [selectedListings, setSelectedListings] = useState<string[]>([]);
  const [activeReport, setActiveReport] = useState<ReportWithStats | null>(null);

  const { data: reports, isLoading: isLoadingReports } = useQuery<Report[]>({
    queryKey: ["/api/reports", activeWorkspace?.id],
    enabled: !!activeWorkspace,
  });

  const { data: listings } = useQuery<Listing[]>({
    queryKey: ["/api/listings", activeWorkspace?.id],
    enabled: !!activeWorkspace,
  });

  const createReportMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      reportType: string;
      dateRangeType: string;
      startDate?: Date;
      endDate?: Date;
      selectedListingIds: string[];
    }) => {
      const response = await apiRequest("POST", "/api/reports", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: "Report Created",
        description: "Your report has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create report. Please try again.",
        variant: "destructive",
      });
    },
  });

  const generateReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const response = await apiRequest("POST", `/api/reports/${reportId}/generate`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      setActiveReport(data);
      toast({
        title: "Report Generated",
        description: "Your report data has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate report. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      await apiRequest("DELETE", `/api/reports/${reportId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      if (activeReport) setActiveReport(null);
      toast({
        title: "Report Deleted",
        description: "The report has been deleted.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete report.",
        variant: "destructive",
      });
    },
  });

  const updateReportMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const response = await apiRequest("PATCH", `/api/reports/${id}`, { name });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Report Updated",
        description: "Report name has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update report.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setReportName("");
    setSelectedReportType("staff_meeting");
    setDateRangeType("last_30_days");
    setCustomStartDate(undefined);
    setCustomEndDate(undefined);
    setSelectedListings([]);
  };

  const handleCreateReport = () => {
    const name = reportName || (selectedReportType === "staff_meeting" ? "Staff Meeting Report" : "Repeat Guests Report");
    createReportMutation.mutate({
      name,
      reportType: selectedReportType,
      dateRangeType,
      startDate: dateRangeType === "custom" ? customStartDate : undefined,
      endDate: dateRangeType === "custom" ? customEndDate : undefined,
      selectedListingIds: selectedListings.length > 0 ? selectedListings : (listings?.map(l => l.id) || []),
    });
  };

  const toggleListing = (listingId: string) => {
    setSelectedListings(prev => 
      prev.includes(listingId) 
        ? prev.filter(id => id !== listingId)
        : [...prev, listingId]
    );
  };

  const getDateRangeLabel = (type: string, startDate?: Date | null, endDate?: Date | null) => {
    switch (type) {
      case "last_7_days":
        return "Last 7 Days";
      case "last_30_days":
        return "Last 30 Days";
      case "last_90_days":
        return "Last 90 Days";
      case "custom":
        if (startDate && endDate) {
          return `${format(new Date(startDate), "MMM d")} - ${format(new Date(endDate), "MMM d, yyyy")}`;
        }
        return "Custom Range";
      default:
        return "Last 30 Days";
    }
  };

  if (!activeWorkspace) {
    return (
      <ScrollArea className="flex-1">
        <div className="p-6">
          <div className="text-center py-12">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">Select a Workspace</h2>
            <p className="text-sm text-muted-foreground">Please select a workspace to view reports.</p>
          </div>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Reports</h1>
            <p className="text-sm text-muted-foreground">Generate insights and summaries for your team</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-report">
                <Plus className="w-4 h-4 mr-2" />
                New Report
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create New Report</DialogTitle>
                <DialogDescription>
                  Set up a new report to track and summarize your property data.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Report Type</Label>
                  <Select 
                    value={selectedReportType} 
                    onValueChange={(v) => setSelectedReportType(v as "staff_meeting" | "repeat_guests")}
                  >
                    <SelectTrigger data-testid="select-report-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff_meeting">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          <span>Staff Meeting Report</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="repeat_guests">
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-4 h-4" />
                          <span>Repeat Guests Report</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Report Name (Optional)</Label>
                  <Input 
                    placeholder={selectedReportType === "staff_meeting" ? "Staff Meeting Report" : "Repeat Guests Report"}
                    value={reportName}
                    onChange={(e) => setReportName(e.target.value)}
                    data-testid="input-report-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Date Range</Label>
                  <Select value={dateRangeType} onValueChange={setDateRangeType}>
                    <SelectTrigger data-testid="select-date-range">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                      <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                      <SelectItem value="last_90_days">Last 90 Days</SelectItem>
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {dateRangeType === "custom" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {customStartDate ? format(customStartDate, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={customStartDate}
                            onSelect={setCustomStartDate}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {customEndDate ? format(customEndDate, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={customEndDate}
                            onSelect={setCustomEndDate}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}

                {listings && listings.length > 0 && (
                  <div className="space-y-2">
                    <Label>Properties (leave empty for all)</Label>
                    <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                      {listings.map((listing) => (
                        <div key={listing.id} className="flex items-center gap-2">
                          <Checkbox
                            id={listing.id}
                            checked={selectedListings.includes(listing.id)}
                            onCheckedChange={() => toggleListing(listing.id)}
                          />
                          <label htmlFor={listing.id} className="text-sm cursor-pointer flex-1 truncate">
                            {listing.name}
                          </label>
                        </div>
                      ))}
                    </div>
                    {selectedListings.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {selectedListings.length} of {listings.length} properties selected
                      </p>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateReport}
                  disabled={createReportMutation.isPending}
                  data-testid="button-save-report"
                >
                  {createReportMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create Report
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoadingReports ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : reports && reports.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map((report) => (
              <ReportCard 
                key={report.id} 
                report={report}
                onGenerate={() => generateReportMutation.mutate(report.id)}
                onDelete={() => deleteReportMutation.mutate(report.id)}
                onUpdateName={(name) => updateReportMutation.mutate({ id: report.id, name })}
                onView={() => setActiveReport(report as ReportWithStats)}
                isGenerating={generateReportMutation.isPending && generateReportMutation.variables === report.id}
                getDateRangeLabel={getDateRangeLabel}
              />
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Reports Yet</h3>
              <p className="text-sm text-muted-foreground text-center mb-4 max-w-sm">
                Create your first report to get insights on staff meetings, guest escalations, or repeat guests.
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-report">
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Report
              </Button>
            </CardContent>
          </Card>
        )}

        {!reports?.length && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <Card className="hover-elevate cursor-pointer" onClick={() => {
              setSelectedReportType("staff_meeting");
              setIsCreateDialogOpen(true);
            }}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Staff Meeting Report</CardTitle>
                    <CardDescription>Weekly or daily team briefings</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    Check-ins and check-outs summary
                  </li>
                  <li className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Guest escalations and issues
                  </li>
                  <li className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-500" />
                    Response time metrics
                  </li>
                  <li className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-purple-500" />
                    AI-generated summary bullets
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="hover-elevate cursor-pointer" onClick={() => {
              setSelectedReportType("repeat_guests");
              setIsCreateDialogOpen(true);
            }}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <UserCheck className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Repeat Guests Report</CardTitle>
                    <CardDescription>VIP guest preparation</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-green-500" />
                    Upcoming repeat guest arrivals
                  </li>
                  <li className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-500" />
                    Guest preferences and likes
                  </li>
                  <li className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Known dislikes and past issues
                  </li>
                  <li className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-purple-500" />
                    Hospitality playbook suggestions
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        )}

        {activeReport && (
          <ReportViewer 
            report={activeReport} 
            onClose={() => setActiveReport(null)}
            onRegenerate={() => generateReportMutation.mutate(activeReport.id)}
            isRegenerating={generateReportMutation.isPending}
          />
        )}
      </div>
    </ScrollArea>
  );
}

function ReportCard({ 
  report, 
  onGenerate, 
  onDelete, 
  onUpdateName,
  onView,
  isGenerating,
  getDateRangeLabel
}: { 
  report: Report;
  onGenerate: () => void;
  onDelete: () => void;
  onUpdateName: (name: string) => void;
  onView: () => void;
  isGenerating: boolean;
  getDateRangeLabel: (type: string, startDate?: Date | null, endDate?: Date | null) => string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(report.name);

  const handleSaveName = () => {
    if (editName.trim() && editName !== report.name) {
      onUpdateName(editName.trim());
    }
    setIsEditing(false);
  };

  return (
    <Card className="hover-elevate" data-testid={`card-report-${report.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                autoFocus
                className="h-8"
              />
            ) : (
              <CardTitle className="text-base flex items-center gap-2">
                {report.reportType === "staff_meeting" ? (
                  <Users className="w-4 h-4 text-primary" />
                ) : (
                  <UserCheck className="w-4 h-4 text-green-500" />
                )}
                <span className="truncate">{report.name}</span>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                  }}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
              </CardTitle>
            )}
            <CardDescription className="mt-1">
              {getDateRangeLabel(report.dateRangeType, report.startDate, report.endDate)}
            </CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {report.reportType === "staff_meeting" ? "Staff" : "Guests"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Building2 className="w-3 h-3" />
          <span>
            {report.selectedListingIds && Array.isArray(report.selectedListingIds) && report.selectedListingIds.length > 0
              ? `${report.selectedListingIds.length} properties`
              : "All properties"}
          </span>
        </div>
        {report.lastGeneratedAt && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>Last generated {format(new Date(report.lastGeneratedAt), "MMM d, h:mm a")}</span>
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <Button 
            size="sm" 
            className="flex-1"
            onClick={report.lastGeneratedAt ? onView : onGenerate}
            disabled={isGenerating}
            data-testid={`button-view-report-${report.id}`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : report.lastGeneratedAt ? (
              <>
                <BarChart3 className="w-4 h-4 mr-2" />
                View Report
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Generate
              </>
            )}
          </Button>
          <Button 
            size="sm" 
            variant="outline"
            onClick={onDelete}
            data-testid={`button-delete-report-${report.id}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportViewer({ 
  report, 
  onClose,
  onRegenerate,
  isRegenerating
}: { 
  report: ReportWithStats;
  onClose: () => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
}) {
  const reportData = report.reportData as Record<string, unknown> | undefined;
  
  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                {report.reportType === "staff_meeting" ? (
                  <Users className="w-5 h-5 text-primary" />
                ) : (
                  <UserCheck className="w-5 h-5 text-green-500" />
                )}
                {report.name}
              </DialogTitle>
              <DialogDescription>
                {report.lastGeneratedAt && `Generated ${format(new Date(report.lastGeneratedAt), "MMMM d, yyyy 'at' h:mm a")}`}
              </DialogDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={onRegenerate}
              disabled={isRegenerating}
            >
              {isRegenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {report.aiSummary && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  AI Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {report.aiSummary.split('\n').map((line, i) => (
                    <p key={i} className="text-sm text-muted-foreground">{line}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {report.reportType === "staff_meeting" && reportData && (
            <StaffMeetingReportContent data={reportData} />
          )}

          {report.reportType === "repeat_guests" && reportData && (
            <RepeatGuestsReportContent data={reportData} />
          )}

          {!reportData && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Report Data</h3>
                <p className="text-sm text-muted-foreground text-center mb-4">
                  Click Refresh to generate the latest report data.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ReservationCardData {
  id: number;
  reservation: Partial<Reservation>;
  negativeTagCount: number;
}

function ReservationCard({ 
  data, 
  onClick 
}: { 
  data: ReservationCardData; 
  onClick: () => void;
}) {
  const res = data.reservation;
  return (
    <div
      className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer border border-border/50"
      onClick={onClick}
      data-testid={`reservation-card-${data.id}`}
    >
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
        <User className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{res.guestName || "Unknown Guest"}</p>
        <p className="text-xs text-muted-foreground">
          {res.checkInDate ? format(new Date(res.checkInDate), "MMM d") : "N/A"} - 
          {res.checkOutDate ? format(new Date(res.checkOutDate), "MMM d") : "N/A"}
        </p>
      </div>
      {data.negativeTagCount > 0 && (
        <Badge variant="destructive" className="text-xs">
          {data.negativeTagCount} issue{data.negativeTagCount > 1 ? "s" : ""}
        </Badge>
      )}
    </div>
  );
}

function StaffMeetingReportContent({ data }: { data: Record<string, unknown> }) {
  const [selectedReservation, setSelectedReservation] = useState<Partial<Reservation> | null>(null);
  const [expandedSection, setExpandedSection] = useState<"smooth" | "moderate" | "trouble" | null>(null);
  
  const checkIns = (data.checkIns as number) || 0;
  const checkOuts = (data.checkOuts as number) || 0;
  const smoothReservations = (data.smoothReservations as Array<ReservationCardData>) || [];
  const moderateReservations = (data.moderateReservations as Array<ReservationCardData>) || [];
  const troubleReservations = (data.troubleReservations as Array<ReservationCardData>) || [];
  const avgResponseTime = data.avgResponseTime as number | undefined;
  const totalQuestionsAnalyzed = data.totalQuestionsAnalyzed as number | undefined;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-500">{checkIns}</div>
            <div className="text-sm text-muted-foreground">Check-ins</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-500">{checkOuts}</div>
            <div className="text-sm text-muted-foreground">Check-outs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-amber-500">
              {moderateReservations.length + troubleReservations.length}
            </div>
            <div className="text-sm text-muted-foreground">Escalations</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-purple-500">
              {avgResponseTime ? `${Math.round(avgResponseTime)}m` : "N/A"}
            </div>
            <div className="text-sm text-muted-foreground">
              Avg Response
              {totalQuestionsAnalyzed ? ` (${totalQuestionsAnalyzed})` : ""}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Collapsible 
          open={expandedSection === "smooth"}
          onOpenChange={(open) => setExpandedSection(open ? "smooth" : null)}
        >
          <Card className="border-green-500/30">
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 cursor-pointer hover-elevate">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Smooth ({smoothReservations.length})
                  <span className="ml-auto">
                    {expandedSection === "smooth" ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </span>
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                {smoothReservations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No reservations</p>
                ) : (
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2">
                      {smoothReservations.map((item) => (
                        <ReservationCard
                          key={item.id}
                          data={item}
                          onClick={() => setSelectedReservation(item.reservation)}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Collapsible 
          open={expandedSection === "moderate"}
          onOpenChange={(open) => setExpandedSection(open ? "moderate" : null)}
        >
          <Card className="border-amber-500/30">
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 cursor-pointer hover-elevate">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Moderate ({moderateReservations.length})
                  <span className="ml-auto">
                    {expandedSection === "moderate" ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </span>
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                {moderateReservations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No escalations</p>
                ) : (
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2">
                      {moderateReservations.map((item) => (
                        <ReservationCard
                          key={item.id}
                          data={item}
                          onClick={() => setSelectedReservation(item.reservation)}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Collapsible 
          open={expandedSection === "trouble"}
          onOpenChange={(open) => setExpandedSection(open ? "trouble" : null)}
        >
          <Card className="border-red-500/30">
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 cursor-pointer hover-elevate">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  Trouble ({troubleReservations.length})
                  <span className="ml-auto">
                    {expandedSection === "trouble" ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </span>
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                {troubleReservations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No major issues</p>
                ) : (
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2">
                      {troubleReservations.map((item) => (
                        <ReservationCard
                          key={item.id}
                          data={item}
                          onClick={() => setSelectedReservation(item.reservation)}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>

      <ReservationDetailSheet
        open={!!selectedReservation}
        onOpenChange={(open) => !open && setSelectedReservation(null)}
        reservation={selectedReservation}
      />
    </div>
  );
}

function RepeatGuestsReportContent({ data }: { data: Record<string, unknown> }) {
  const repeatGuests = (data.repeatGuests as Array<{
    guestName: string;
    visitCount: number;
    upcomingReservation?: unknown;
    preferences?: string[];
    dislikes?: string[];
    playbook?: string;
  }>) || [];

  return (
    <div className="space-y-4">
      {repeatGuests.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <UserCheck className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No upcoming repeat guests found</p>
          </CardContent>
        </Card>
      ) : (
        repeatGuests.map((guest, index) => (
          <Card key={index}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-green-500" />
                  {guest.guestName}
                </CardTitle>
                <Badge variant="secondary">{guest.visitCount} visits</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {guest.preferences && guest.preferences.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    Preferences & Likes
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {guest.preferences.map((pref, i) => (
                      <Badge key={i} variant="outline" className="bg-green-500/10">
                        {pref}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {guest.dislikes && guest.dislikes.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Dislikes & Past Issues
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {guest.dislikes.map((dislike, i) => (
                      <Badge key={i} variant="outline" className="bg-amber-500/10">
                        {dislike}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {guest.playbook && (
                <div>
                  <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-purple-500" />
                    Hospitality Playbook
                  </h4>
                  <p className="text-sm text-muted-foreground">{guest.playbook}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
