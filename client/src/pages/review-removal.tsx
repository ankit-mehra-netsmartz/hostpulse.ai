import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Ban, Star, ChevronRight, ChevronDown, ArrowLeft, Sparkles, Copy, Check,
  AlertTriangle, Shield, FileText, Scale, ExternalLink, Loader2,
  CheckCircle2, XCircle, Clock, Calendar, User, MapPin, Mail, MessageSquare,
  Pencil, Send, RotateCcw, Trash2
} from "lucide-react";

function CollapsibleCard({
  title, icon, description, defaultOpen = true, children, className = "", headerExtra
}: {
  title: string;
  icon?: any;
  description?: string;
  defaultOpen?: boolean;
  children: any;
  className?: string;
  headerExtra?: any;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const Icon = icon;
  return (
    <Card className={className}>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
        data-testid={`collapsible-${title.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
            <CardTitle className="text-base">{title}</CardTitle>
            {headerExtra}
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`} />
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {isOpen && children}
    </Card>
  );
}

const STAGES = [
  { key: "analysis", label: "Analysis", icon: Sparkles, description: "AI analyzes the review for policy violations" },
  { key: "challenge_1", label: "1st Challenge", icon: Shield, description: "Submit first challenge to Airbnb" },
  { key: "challenge_2", label: "2nd Challenge", icon: Shield, description: "Escalate with second challenge" },
  { key: "arbitration", label: "Arbitration", icon: Scale, description: "File for formal arbitration" },
  { key: "resolved", label: "Resolved", icon: CheckCircle2, description: "Case closed" },
];

function LikelihoodBadge({ likelihood, score }: { likelihood: string | null; score: number | null }) {
  if (!likelihood) return null;
  const config: Record<string, { color: string; label: string }> = {
    high: { color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", label: "High Chance" },
    medium: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", label: "Medium Chance" },
    low: { color: "bg-red-500/20 text-red-400 border-red-500/30", label: "Low Chance" },
  };
  const c = config[likelihood] || config.low;
  return (
    <Badge variant="secondary" className={`${c.color} text-xs`} data-testid="badge-likelihood">
      {c.label}{score != null ? ` (${score}%)` : ""}
    </Badge>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" data-testid="star-rating">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      data-testid="button-copy"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export default function ReviewRemovalPage() {
  const { toast } = useToast();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [editingFields, setEditingFields] = useState<Record<string, string>>({});
  const [analyzingReservationId, setAnalyzingReservationId] = useState<string | null>(null);

  const { data: badReviews, isLoading: loadingReviews } = useQuery<any[]>({
    queryKey: ["/api/review-removal/bad-reviews"],
  });

  const { data: cases, isLoading: loadingCases } = useQuery<any[]>({
    queryKey: ["/api/review-removal/cases"],
  });

  const { data: selectedCase, isLoading: loadingCase } = useQuery<any>({
    queryKey: ["/api/review-removal/cases", selectedCaseId],
    enabled: !!selectedCaseId,
  });

  const createCaseMutation = useMutation({
    mutationFn: (reservationId: string) => {
      setAnalyzingReservationId(reservationId);
      return apiRequest("POST", "/api/review-removal/cases", { reservationId });
    },
    onSuccess: async (res) => {
      const data = await res.json();
      const caseObj = data.case || data;
      queryClient.invalidateQueries({ queryKey: ["/api/review-removal/bad-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/review-removal/cases"] });
      setSelectedCaseId(caseObj.id);
      setAnalyzingReservationId(null);
      toast({
        title: data.autoAnalyzed ? "Case created & analyzed" : "Case created",
        description: `Case ${caseObj.caseNumber} opened${data.autoAnalyzed ? " — AI analysis complete" : ""}`,
      });
    },
    onError: () => {
      setAnalyzingReservationId(null);
      toast({ title: "Error", description: "Failed to create case", variant: "destructive" });
    },
  });

  const updateCaseMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PATCH", `/api/review-removal/cases/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/review-removal/cases", selectedCaseId] });
      queryClient.invalidateQueries({ queryKey: ["/api/review-removal/cases"] });
      toast({ title: "Case updated" });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: ({ id, additionalContext }: { id: string; additionalContext?: string }) =>
      apiRequest("POST", `/api/review-removal/cases/${id}/analyze`, { additionalContext }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/review-removal/cases", selectedCaseId] });
      toast({ title: "Analysis complete" });
    },
    onError: () => toast({ title: "Error", description: "Analysis failed", variant: "destructive" }),
  });

  const reviseMutation = useMutation({
    mutationFn: async ({ id, currentText, userFeedback }: { id: string; currentText: string; userFeedback: string }) => {
      const res = await apiRequest("POST", `/api/review-removal/cases/${id}/revise`, { currentText, userFeedback });
      const data = await res.json();
      return data.revisedText as string;
    },
    onError: () => toast({ title: "Error", description: "Failed to revise", variant: "destructive" }),
  });

  const saveDraftMutation = useMutation({
    mutationFn: ({ id, text, stage }: { id: string; text: string; stage: string }) =>
      apiRequest("POST", `/api/review-removal/cases/${id}/save-draft`, { text, stage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/review-removal/cases", selectedCaseId] });
      queryClient.invalidateQueries({ queryKey: ["/api/review-removal/cases"] });
      toast({ title: "Saved for submission" });
    },
    onError: () => toast({ title: "Error", description: "Failed to save", variant: "destructive" }),
  });

  const deleteCaseMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiRequest("DELETE", `/api/review-removal/cases/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/review-removal/cases"] });
      setSelectedCaseId(null);
      setEditingFields({});
      toast({ title: "Case deleted" });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete case", variant: "destructive" }),
  });

  const advanceMutation = useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome?: string }) =>
      apiRequest("POST", `/api/review-removal/cases/${id}/advance`, { outcome }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/review-removal/cases", selectedCaseId] });
      queryClient.invalidateQueries({ queryKey: ["/api/review-removal/cases"] });
      toast({ title: "Stage advanced" });
    },
  });

  if (selectedCaseId) {
    return (
      <CaseDetailView
        caseData={selectedCase}
        isLoading={loadingCase}
        editingFields={editingFields}
        setEditingFields={setEditingFields}
        onBack={() => { setSelectedCaseId(null); setEditingFields({}); }}
        onUpdate={(data: any) => updateCaseMutation.mutate({ id: selectedCaseId, data })}
        onAnalyze={(additionalContext?: string) => analyzeMutation.mutate({ id: selectedCaseId, additionalContext })}
        onRevise={async (currentText: string, userFeedback: string) => {
          return await reviseMutation.mutateAsync({ id: selectedCaseId, currentText, userFeedback });
        }}
        isRevising={reviseMutation.isPending}
        onSaveDraft={(text: string, stage: string) => saveDraftMutation.mutate({ id: selectedCaseId, text, stage })}
        isSavingDraft={saveDraftMutation.isPending}
        onDelete={() => deleteCaseMutation.mutate({ id: selectedCaseId })}
        isDeleting={deleteCaseMutation.isPending}
        onAdvance={(outcome?: string) => advanceMutation.mutate({ id: selectedCaseId, outcome })}
        isAnalyzing={analyzeMutation.isPending}
        isAdvancing={advanceMutation.isPending}
        isUpdating={updateCaseMutation.isPending}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-5xl mx-auto space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Ban className="w-6 h-6 text-red-400" />
        <div>
          <h1 className="text-2xl font-bold">Review Removal</h1>
          <p className="text-sm text-muted-foreground">
            Challenge unfair reviews using Airbnb's own policies
          </p>
        </div>
      </div>

      {(cases && cases.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Active Cases ({cases.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {cases.map((c: any) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                  onClick={() => setSelectedCaseId(c.id)}
                  data-testid={`case-row-${c.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs font-mono">{c.caseNumber}</Badge>
                    <div>
                      <p className="text-sm font-medium">{c.propertyName || "Unknown Property"}</p>
                      <p className="text-xs text-muted-foreground">Guest: {c.guestName || "Unknown"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <LikelihoodBadge likelihood={c.likelihood} score={c.likelihoodScore} />
                    <Badge variant="secondary" className="text-xs capitalize">{c.stage?.replace("_", " ")}</Badge>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${
                        c.status === "won" ? "bg-emerald-500/20 text-emerald-400" :
                        c.status === "lost" ? "bg-red-500/20 text-red-400" :
                        "bg-blue-500/20 text-blue-400"
                      }`}
                    >
                      {c.status}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Reviews Under 5 Stars
          </CardTitle>
          <CardDescription>
            Reviews that may qualify for removal based on Airbnb's Review Policy
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingReviews ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : badReviews && badReviews.length > 0 ? (
            <div className="space-y-2">
              {badReviews.map((r: any) => (
                <div
                  key={r.id}
                  className="flex items-start justify-between p-3 rounded-lg bg-muted/50 gap-4"
                  data-testid={`bad-review-${r.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium">{r.guestName || "Unknown Guest"}</p>
                      <StarRating rating={r.guestRating} />
                      {r.reviewPostedAt && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.reviewPostedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{r.publicReview}</p>
                  </div>
                  <div className="flex-shrink-0">
                    {r.hasCase ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setSelectedCaseId(r.existingCase?.id)}
                        data-testid={`button-view-case-${r.id}`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        View Case
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => createCaseMutation.mutate(r.id)}
                        disabled={createCaseMutation.isPending}
                        data-testid={`button-analyze-${r.id}`}
                      >
                        {analyzingReservationId === r.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        {analyzingReservationId === r.id ? "Analyzing..." : "Analyze"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Star className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No bad reviews found</p>
              <p className="text-xs">All your reviews are 5 stars — great job!</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </div>
  );
}

interface CaseDetailProps {
  caseData: any;
  isLoading: boolean;
  editingFields: Record<string, string>;
  setEditingFields: (fields: Record<string, string>) => void;
  onBack: () => void;
  onUpdate: (data: any) => void;
  onAnalyze: (additionalContext?: string) => void;
  onRevise: (currentText: string, userFeedback: string) => Promise<string>;
  isRevising: boolean;
  onSaveDraft: (text: string, stage: string) => void;
  isSavingDraft: boolean;
  onDelete: () => void;
  isDeleting: boolean;
  onAdvance: (outcome?: string) => void;
  isAnalyzing: boolean;
  isAdvancing: boolean;
  isUpdating: boolean;
}

function CaseDetailView({
  caseData, isLoading, editingFields, setEditingFields,
  onBack, onUpdate, onAnalyze, onRevise, isRevising, onSaveDraft, isSavingDraft, onDelete, isDeleting, onAdvance, isAnalyzing, isAdvancing, isUpdating
}: CaseDetailProps) {
  if (isLoading || !caseData) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  const [additionalContext, setAdditionalContext] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const aiAnalysis = (caseData.aiAnalysis as any) || {};
  const currentStageAnalysis = aiAnalysis[caseData.stage];
  const currentStageIndex = STAGES.findIndex(s => s.key === caseData.stage);

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">Case {caseData.caseNumber}</h1>
            <LikelihoodBadge likelihood={caseData.likelihood} score={caseData.likelihoodScore} />
            <Badge
              variant="secondary"
              className={`text-xs ${
                caseData.status === "won" ? "bg-emerald-500/20 text-emerald-400" :
                caseData.status === "lost" ? "bg-red-500/20 text-red-400" :
                "bg-blue-500/20 text-blue-400"
              }`}
            >
              {caseData.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {caseData.propertyName} — Guest: {caseData.guestName}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-red-400 border-red-500/30"
          onClick={() => { setShowDeleteConfirm(true); setDeleteConfirmText(""); }}
          data-testid="button-delete-case"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete Case
        </Button>
      </div>

      {showDeleteConfirm && (
        <Card className="border-red-500/30">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
              <div className="space-y-2 flex-1">
                <p className="text-sm font-medium">Are you sure you want to delete this case?</p>
                <p className="text-xs text-muted-foreground">
                  This will permanently remove all analysis, challenge history, and saved submissions for this case. This action cannot be undone.
                </p>
                <p className="text-xs text-muted-foreground">
                  Type <span className="font-mono font-semibold text-red-400">delete</span> to confirm.
                </p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type delete to confirm"
                  className="flex h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  autoFocus
                  data-testid="input-delete-confirm"
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                    disabled={deleteConfirmText.toLowerCase() !== "delete" || isDeleting}
                    onClick={() => onDelete()}
                    data-testid="button-confirm-delete"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    Delete Permanently
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                    data-testid="button-cancel-delete"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {STAGES.map((stage, i) => {
          const isActive = stage.key === caseData.stage;
          const isPast = i < currentStageIndex;
          const StageIcon = stage.icon;
          return (
            <div key={stage.key} className="flex items-center">
              {i > 0 && (
                <div className={`w-6 h-0.5 ${isPast ? "bg-emerald-500" : "bg-muted"}`} />
              )}
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                  isActive ? "bg-primary text-primary-foreground" :
                  isPast ? "bg-emerald-500/20 text-emerald-400" :
                  "bg-muted text-muted-foreground"
                }`}
                data-testid={`stage-${stage.key}`}
              >
                <StageIcon className="w-3.5 h-3.5" />
                {stage.label}
              </div>
            </div>
          );
        })}
      </div>

      <CollapsibleCard title="Airbnb Policies Referenced" icon={Shield} defaultOpen={false}>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            The AI analysis references these official Airbnb policies. Click to read the full policy on Airbnb.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { name: "Reviews Policy", url: "https://www.airbnb.com/help/article/2673", description: "Defines what reviews can be removed: retaliatory, irrelevant, fake, coercive, or competitive." },
              { name: "Content Policy", url: "https://www.airbnb.com/help/article/546", description: "Prohibits violent, threatening, demeaning, harassing, or discriminatory content." },
              { name: "Community Standards", url: "https://www.airbnb.com/help/article/3328", description: "Covers safety, security, fairness, authenticity, and reliability expectations." },
              { name: "Nondiscrimination Policy", url: "https://www.airbnb.com/help/article/2867", description: "Prohibits discrimination based on protected characteristics." },
            ].map((policy) => (
              <a
                key={policy.name}
                href={policy.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors group"
                data-testid={`link-policy-${policy.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <ExternalLink className="w-3.5 h-3.5 mt-0.5 text-blue-400 flex-shrink-0 group-hover:text-blue-300" />
                <div>
                  <p className="text-xs font-medium text-blue-400 group-hover:text-blue-300">{policy.name}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{policy.description}</p>
                </div>
              </a>
            ))}
          </div>
        </CardContent>
      </CollapsibleCard>

      <CollapsibleCard title="Review Details" icon={Star}>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <StarRating rating={caseData.guestRating || 0} />
            <span className="text-sm text-muted-foreground">({caseData.guestRating} stars)</span>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-sm italic">"{caseData.reviewText || "No review text"}"</p>
          </div>
          {caseData.categoryRatings && (
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(caseData.categoryRatings as Record<string, any>)
                .filter(([key, val]) => typeof val === "number")
                .map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between p-2 rounded bg-muted/30 text-xs">
                    <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="font-medium">{val as number}/5</span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </CollapsibleCard>

      {caseData.reservationDetails && (
        <CollapsibleCard title="Reservation Details" icon={Calendar} defaultOpen={false}>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {caseData.reservationDetails.confirmationCode && (
                <div className="flex items-start gap-2 p-2 rounded bg-muted/30">
                  <FileText className="w-3.5 h-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Confirmation Code</p>
                    <p className="text-xs font-medium">{caseData.reservationDetails.confirmationCode}</p>
                  </div>
                </div>
              )}
              {caseData.reservationDetails.platform && (
                <div className="flex items-start gap-2 p-2 rounded bg-muted/30">
                  <ExternalLink className="w-3.5 h-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Platform</p>
                    <p className="text-xs font-medium">{caseData.reservationDetails.platform}</p>
                  </div>
                </div>
              )}
              {caseData.reservationDetails.status && (
                <div className="flex items-start gap-2 p-2 rounded bg-muted/30">
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Status</p>
                    <p className="text-xs font-medium capitalize">{caseData.reservationDetails.status}</p>
                  </div>
                </div>
              )}
              {caseData.reservationDetails.checkInDate && (
                <div className="flex items-start gap-2 p-2 rounded bg-muted/30">
                  <Calendar className="w-3.5 h-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Check-in</p>
                    <p className="text-xs font-medium">{new Date(caseData.reservationDetails.checkInDate).toLocaleDateString()}</p>
                  </div>
                </div>
              )}
              {caseData.reservationDetails.checkOutDate && (
                <div className="flex items-start gap-2 p-2 rounded bg-muted/30">
                  <Calendar className="w-3.5 h-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Check-out</p>
                    <p className="text-xs font-medium">{new Date(caseData.reservationDetails.checkOutDate).toLocaleDateString()}</p>
                  </div>
                </div>
              )}
              {caseData.reservationDetails.checkInDate && caseData.reservationDetails.checkOutDate && (
                <div className="flex items-start gap-2 p-2 rounded bg-muted/30">
                  <Clock className="w-3.5 h-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Length of Stay</p>
                    <p className="text-xs font-medium">
                      {Math.ceil((new Date(caseData.reservationDetails.checkOutDate).getTime() - new Date(caseData.reservationDetails.checkInDate).getTime()) / (1000 * 60 * 60 * 24))} nights
                    </p>
                  </div>
                </div>
              )}
              {caseData.guestName && (
                <div className="flex items-start gap-2 p-2 rounded bg-muted/30">
                  <User className="w-3.5 h-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Guest</p>
                    <p className="text-xs font-medium">{caseData.guestName}</p>
                  </div>
                </div>
              )}
              {caseData.reservationDetails.guestEmail && (
                <div className="flex items-start gap-2 p-2 rounded bg-muted/30">
                  <Mail className="w-3.5 h-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Guest Email</p>
                    <p className="text-xs font-medium truncate">{caseData.reservationDetails.guestEmail}</p>
                  </div>
                </div>
              )}
              {caseData.reservationDetails.guestLocation && (
                <div className="flex items-start gap-2 p-2 rounded bg-muted/30">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Guest Location</p>
                    <p className="text-xs font-medium">{caseData.reservationDetails.guestLocation}</p>
                  </div>
                </div>
              )}
            </div>
            {caseData.reservationDetails.privateRemarks && (
              <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-[10px] font-medium text-amber-400 mb-1">Private Remarks from Guest</p>
                <p className="text-xs text-muted-foreground">{caseData.reservationDetails.privateRemarks}</p>
              </div>
            )}
            {caseData.reservationDetails.hostReply && (
              <div className="mt-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-[10px] font-medium text-blue-400 mb-1">Host Reply to Review</p>
                <p className="text-xs text-muted-foreground">{caseData.reservationDetails.hostReply}</p>
              </div>
            )}
          </CardContent>
        </CollapsibleCard>
      )}

      <CollapsibleCard title="Case Information" icon={FileText} description="Auto-populated from your listing and reservation data. You can edit to add more details." defaultOpen={false}>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Label className="text-xs font-medium">House Rules</Label>
              {caseData.houseRules && <span className="text-[10px] text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">Auto-populated from listing</span>}
            </div>
            <Textarea
              placeholder="No house rules found — paste your Airbnb house rules here..."
              value={editingFields.houseRules ?? caseData.houseRules ?? ""}
              onChange={(e) => setEditingFields({ ...editingFields, houseRules: e.target.value })}
              className="min-h-[80px] text-sm"
              data-testid="input-house-rules"
            />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Label className="text-xs font-medium">Guest Messaging History</Label>
              {caseData.guestMessages && <span className="text-[10px] text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">Auto-populated from reservation</span>}
            </div>
            <Textarea
              placeholder="No messaging history found — paste guest messages here..."
              value={editingFields.guestMessages ?? caseData.guestMessages ?? ""}
              onChange={(e) => setEditingFields({ ...editingFields, guestMessages: e.target.value })}
              className="min-h-[80px] text-sm"
              data-testid="input-guest-messages"
            />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Label className="text-xs font-medium">Off-Platform Guest Conversation</Label>
            </div>
            <Textarea
              placeholder="Paste any off-platform messages (SMS, WhatsApp, etc.) with the guest..."
              value={editingFields.resolutionMessages ?? caseData.resolutionMessages ?? ""}
              onChange={(e) => setEditingFields({ ...editingFields, resolutionMessages: e.target.value })}
              className="min-h-[80px] text-sm"
              data-testid="input-resolution-messages"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const data: any = {};
              if (editingFields.houseRules !== undefined) data.houseRules = editingFields.houseRules;
              if (editingFields.guestMessages !== undefined) data.guestMessages = editingFields.guestMessages;
              if (editingFields.resolutionMessages !== undefined) data.resolutionMessages = editingFields.resolutionMessages;
              if (Object.keys(data).length > 0) onUpdate(data);
            }}
            disabled={isUpdating}
            data-testid="button-save-info"
          >
            {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
            Save Changes
          </Button>
        </CardContent>
      </CollapsibleCard>

      {currentStageAnalysis && (
        <StageAnalysisCard
          stage={caseData.stage}
          analysis={currentStageAnalysis}
          onRevise={onRevise}
          isRevising={isRevising}
          onSaveDraft={onSaveDraft}
          isSavingDraft={isSavingDraft}
          onUpdate={onUpdate}
          caseData={caseData}
        />
      )}

      {caseData.stage !== "resolved" && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            {(caseData.stage === "challenge_1" || caseData.stage === "challenge_2" || caseData.stage === "arbitration") && !currentStageAnalysis && (
              <div>
                <Label className="text-xs font-medium mb-1.5 block">Additional Context</Label>
                <Textarea
                  placeholder="Add any extra details, arguments, or context you want the AI to consider when writing this challenge..."
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  className="min-h-[80px] text-sm"
                  data-testid="input-additional-context"
                />
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                onClick={() => {
                  onAnalyze(additionalContext || undefined);
                  setAdditionalContext("");
                }}
                disabled={isAnalyzing}
                className="gap-1.5"
                data-testid="button-run-analysis"
              >
                {isAnalyzing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {currentStageAnalysis ? "Re-analyze" : `Run ${STAGES[currentStageIndex]?.key === "analysis" ? "" : (STAGES[currentStageIndex]?.label + " ") || ""}Analysis`}
              </Button>

              {currentStageAnalysis && caseData.stage !== "resolved" && (
                <Button
                  variant="outline"
                  onClick={() => onAdvance()}
                  disabled={isAdvancing}
                  className="gap-1.5"
                  data-testid="button-advance"
                >
                  {isAdvancing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                  {currentStageIndex < STAGES.length - 2
                    ? `Advance to ${STAGES[currentStageIndex + 1]?.label}`
                    : "Mark Resolved"}
                </Button>
              )}

              {caseData.stage !== "analysis" && caseData.status === "open" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                    onClick={() => onAdvance("won")}
                    disabled={isAdvancing}
                    data-testid="button-mark-won"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark Won
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-red-400 border-red-500/30 hover:bg-red-500/10"
                    onClick={() => {
                      const updates: any = { status: "lost" };
                      onUpdate(updates);
                    }}
                    disabled={isUpdating}
                    data-testid="button-mark-lost"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Mark Lost
                  </Button>
                </>
              )}
            </div>

            {caseData.stage === "analysis" && (
              <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-xs text-blue-400 flex items-start gap-2">
                  <ExternalLink className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>
                    To submit your review removal request, log into Airbnb and visit:{" "}
                    <a
                      href="https://www.airbnb.com/resolution/review_dispute/intro"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium"
                    >
                      airbnb.com/resolution/review_dispute/intro
                    </a>
                    . You cannot request removal through the message thread. Watch for an email response within 48 hours.
                  </span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(caseData.challengeHistory as any[])?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Challenge History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(caseData.challengeHistory as any[]).map((entry: any, i: number) => (
              <div key={i} className="p-3 rounded-lg bg-muted/50 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs capitalize">
                      {entry.stage?.replace("_", " ")}
                    </Badge>
                    {entry.type === "submitted" ? (
                      <Badge className="text-xs bg-emerald-600/20 text-emerald-400 border-emerald-500/30" data-testid={`badge-submitted-${i}`}>
                        <Check className="w-3 h-3 mr-1" />
                        Saved for Submission
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground" data-testid={`badge-draft-${i}`}>
                        <Sparkles className="w-3 h-3 mr-1" />
                        AI Draft
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {(entry.generatedAt || entry.savedAt) ? new Date(entry.generatedAt || entry.savedAt).toLocaleString() : ""}
                  </span>
                </div>
                {entry.message && (
                  <div>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{entry.message}</p>
                    <div className="mt-2">
                      <CopyButton text={entry.message} />
                    </div>
                  </div>
                )}
                {entry.letter && (
                  <div>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{entry.letter}</p>
                    <div className="mt-2">
                      <CopyButton text={entry.letter} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
    </div>
  );
}

const CHAR_LIMIT = 2500;

function CharacterCount({ text }: { text: string }) {
  const count = text.length;
  const isOver = count > CHAR_LIMIT;
  return (
    <p className={`text-xs text-right ${isOver ? "text-red-400 font-medium" : "text-muted-foreground"}`} data-testid="text-char-count">
      {count.toLocaleString()} / {CHAR_LIMIT.toLocaleString()} characters{isOver ? " (over limit)" : ""}
    </p>
  );
}

function StageAnalysisCard({ stage, analysis, onRevise, isRevising, onSaveDraft, isSavingDraft, onUpdate, caseData }: {
  stage: string;
  analysis: any;
  onRevise?: (currentText: string, userFeedback: string) => Promise<string>;
  isRevising?: boolean;
  onSaveDraft?: (text: string, stage: string) => void;
  isSavingDraft?: boolean;
  onUpdate?: (data: any) => void;
  caseData?: any;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [revisionFeedback, setRevisionFeedback] = useState("");
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const { toast } = useToast();
  if (stage === "analysis") {
    return (
      <Card className="border-purple-500/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            AI Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {analysis.removalCategory && analysis.removalCategory !== "none" && (
            <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <p className="text-xs font-medium text-purple-400 mb-1">Recommended Removal Category</p>
              <p className="text-sm font-medium" data-testid="text-removal-category">
                {analysis.removalCategory === "retaliatory" && "It's Retaliatory"}
                {analysis.removalCategory === "irrelevant" && "It's Irrelevant"}
                {analysis.removalCategory === "pressure_coercion" && "It Involves Pressure or Coercion"}
                {analysis.removalCategory === "competitor" && "It Was Posted by a Competitor"}
                {analysis.removalCategory === "content_policy" && "It Doesn't Follow Content Policy"}
              </p>
              {analysis.removalCategoryExplanation && (
                <p className="text-xs text-muted-foreground mt-1">{analysis.removalCategoryExplanation}</p>
              )}
            </div>
          )}

          {analysis.removalCategory === "none" && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs font-medium text-red-400 mb-1">No Clear Removal Category</p>
              {analysis.removalCategoryExplanation && (
                <p className="text-xs text-muted-foreground">{analysis.removalCategoryExplanation}</p>
              )}
            </div>
          )}

          {analysis.reasoning && (
            <p className="text-sm">{analysis.reasoning}</p>
          )}

          {analysis.policyViolations?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-red-400 mb-1.5">Policy Violations Found</p>
              <div className="space-y-2">
                {analysis.policyViolations.map((v: any, i: number) => (
                  typeof v === 'string' ? (
                    <div key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                      {v}
                    </div>
                  ) : (
                    <div key={i} className="p-2.5 rounded-lg bg-red-500/5 border border-red-500/15 space-y-1" data-testid={`policy-violation-${i}`}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium text-red-400">{v.policy}</span>
                        {v.section && (
                          <>
                            <span className="text-[10px] text-muted-foreground">›</span>
                            <span className="text-xs text-red-300">{v.section}</span>
                          </>
                        )}
                      </div>
                      {v.verbatimQuote && (
                        <div className="pl-2 border-l-2 border-red-500/30">
                          <p className="text-[11px] text-muted-foreground italic">"{v.verbatimQuote}"</p>
                        </div>
                      )}
                      {v.explanation && (
                        <p className="text-xs text-muted-foreground">{v.explanation}</p>
                      )}
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          {analysis.houseRuleViolations?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-amber-400 mb-1.5">House Rule Violations</p>
              <ul className="space-y-1">
                {analysis.houseRuleViolations.map((v: string, i: number) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                    {v}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.factualErrors?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-orange-400 mb-1.5">Factual Errors in Review</p>
              <ul className="space-y-1">
                {analysis.factualErrors.map((v: string, i: number) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 flex-shrink-0" />
                    {v}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {analysis.strengths?.length > 0 && (
              <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-[10px] font-medium text-emerald-400 mb-1">Strengths</p>
                <ul className="space-y-0.5">
                  {analysis.strengths.map((s: string, i: number) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.weaknesses?.length > 0 && (
              <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
                <p className="text-[10px] font-medium text-red-400 mb-1">Weaknesses</p>
                <ul className="space-y-0.5">
                  {analysis.weaknesses.map((w: string, i: number) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {analysis.recommendedAction && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-xs font-medium text-blue-400 mb-1">Recommended Action</p>
              <p className="text-sm">{analysis.recommendedAction}</p>
            </div>
          )}

          {analysis.missingInfo?.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs font-medium text-amber-400 mb-1">Additional Information Needed</p>
              <ul className="space-y-0.5">
                {analysis.missingInfo.map((m: string, i: number) => (
                  <li key={i} className="text-xs text-muted-foreground">• {m}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (stage === "challenge_1" || stage === "challenge_2") {
    const currentMessage = isEditing ? editedText : (analysis.challengeMessage || "");

    const handleStartEdit = () => {
      setEditedText(analysis.challengeMessage || "");
      setIsEditing(true);
    };

    const handleCancelEdit = () => {
      setIsEditing(false);
      setEditedText("");
      setShowRevisionInput(false);
      setRevisionFeedback("");
    };

    const handleAiRevise = async () => {
      if (!revisionFeedback.trim() || !onRevise) return;
      try {
        const revised = await onRevise(currentMessage, revisionFeedback.trim());
        if (revised) {
          setEditedText(revised);
          setRevisionFeedback("");
          setShowRevisionInput(false);
          toast({ title: "Challenge revised by AI" });
        }
      } catch {}
    };

    return (
      <Card className="border-blue-500/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400" />
            {stage === "challenge_1" ? "First Challenge Response" : "Second Challenge Response"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {analysis.challengeMessage && (
            <div className="space-y-2">
              {isEditing ? (
                <>
                  <Textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className={`min-h-[200px] text-sm ${editedText.length > CHAR_LIMIT ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                    data-testid="textarea-edit-challenge"
                  />
                  <CharacterCount text={editedText} />
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="default"
                      className="gap-1.5"
                      onClick={() => {
                        if (onSaveDraft) onSaveDraft(editedText, stage);
                        setIsEditing(false);
                        setEditedText("");
                      }}
                      disabled={isSavingDraft || !editedText.trim()}
                      data-testid="button-save-challenge"
                    >
                      {isSavingDraft ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      Save for Submission
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={handleCancelEdit}
                      data-testid="button-cancel-edit"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Discard
                    </Button>
                    <CopyButton text={editedText} />
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-purple-400 border-purple-500/30 hover:bg-purple-500/10"
                      onClick={() => setShowRevisionInput(!showRevisionInput)}
                      data-testid="button-ai-revise-toggle"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      AI Revise
                    </Button>
                  </div>
                  {showRevisionInput && (
                    <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 space-y-2">
                      <Label className="text-xs font-medium text-purple-400">What should the AI change?</Label>
                      <Textarea
                        placeholder="e.g. Make the tone more assertive, add more emphasis on the cleanliness issue, shorten the second paragraph..."
                        value={revisionFeedback}
                        onChange={(e) => setRevisionFeedback(e.target.value)}
                        className="min-h-[60px] text-sm"
                        data-testid="textarea-revision-feedback"
                      />
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={handleAiRevise}
                        disabled={isRevising || !revisionFeedback.trim()}
                        data-testid="button-submit-revision"
                      >
                        {isRevising ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        {isRevising ? "Revising..." : "Apply Feedback"}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className={`p-3 rounded-lg bg-muted/50 ${(analysis.challengeMessage || "").length > CHAR_LIMIT ? "border border-red-500/30" : ""}`}>
                    <p className="text-sm whitespace-pre-wrap">{analysis.challengeMessage}</p>
                  </div>
                  <CharacterCount text={analysis.challengeMessage || ""} />
                  <div className="flex items-center gap-2">
                    <CopyButton text={analysis.challengeMessage} />
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={handleStartEdit}
                      data-testid="button-edit-challenge"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-purple-400 border-purple-500/30 hover:bg-purple-500/10"
                      onClick={() => {
                        handleStartEdit();
                        setShowRevisionInput(true);
                      }}
                      data-testid="button-ai-revise"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      AI Revise
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {analysis.keyArguments?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-blue-400 mb-1.5">Key Arguments</p>
              <ul className="space-y-1">
                {analysis.keyArguments.map((a: string, i: number) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.policiesCited?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-purple-400 mb-1.5">Policies Cited</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.policiesCited.map((p: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-xs">{p}</Badge>
                ))}
              </div>
            </div>
          )}

          {analysis.escalationPoints?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-amber-400 mb-1.5">Escalation Points</p>
              <ul className="space-y-1">
                {analysis.escalationPoints.map((p: string, i: number) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.templateResponseCallouts?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-red-400 mb-1.5">Templated Response Callouts</p>
              <ul className="space-y-1">
                {analysis.templateResponseCallouts.map((c: string, i: number) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.tips?.length > 0 && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-xs font-medium text-emerald-400 mb-1">Tips</p>
              <ul className="space-y-0.5">
                {analysis.tips.map((t: string, i: number) => (
                  <li key={i} className="text-xs text-muted-foreground">• {t}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (stage === "arbitration") {
    const currentLetter = isEditing ? editedText : (analysis.arbitrationLetter || "");

    const handleStartEdit = () => {
      setEditedText(analysis.arbitrationLetter || "");
      setIsEditing(true);
    };

    const handleCancelEdit = () => {
      setIsEditing(false);
      setEditedText("");
      setShowRevisionInput(false);
      setRevisionFeedback("");
    };

    const handleAiRevise = async () => {
      if (!revisionFeedback.trim() || !onRevise) return;
      try {
        const revised = await onRevise(currentLetter, revisionFeedback.trim());
        if (revised) {
          setEditedText(revised);
          setRevisionFeedback("");
          setShowRevisionInput(false);
          toast({ title: "Letter revised by AI" });
        }
      } catch {}
    };

    return (
      <Card className="border-amber-500/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="w-4 h-4 text-amber-400" />
            Arbitration Filing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {analysis.arbitrationLetter && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-amber-400 mb-1">Arbitration Letter</p>
              {isEditing ? (
                <>
                  <Textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className={`min-h-[250px] text-sm ${editedText.length > CHAR_LIMIT ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                    data-testid="textarea-edit-arbitration"
                  />
                  <CharacterCount text={editedText} />
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="default"
                      className="gap-1.5"
                      onClick={() => {
                        if (onSaveDraft) onSaveDraft(editedText, "arbitration");
                        setIsEditing(false);
                        setEditedText("");
                      }}
                      disabled={isSavingDraft || !editedText.trim()}
                      data-testid="button-save-arbitration"
                    >
                      {isSavingDraft ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      Save for Submission
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={handleCancelEdit}
                      data-testid="button-cancel-edit-arb"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Discard
                    </Button>
                    <CopyButton text={editedText} />
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-purple-400 border-purple-500/30 hover:bg-purple-500/10"
                      onClick={() => setShowRevisionInput(!showRevisionInput)}
                      data-testid="button-ai-revise-arb-toggle"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      AI Revise
                    </Button>
                  </div>
                  {showRevisionInput && (
                    <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 space-y-2">
                      <Label className="text-xs font-medium text-purple-400">What should the AI change?</Label>
                      <Textarea
                        placeholder="e.g. Add more legal weight, reference specific ToS sections, make it shorter..."
                        value={revisionFeedback}
                        onChange={(e) => setRevisionFeedback(e.target.value)}
                        className="min-h-[60px] text-sm"
                        data-testid="textarea-revision-feedback-arb"
                      />
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={handleAiRevise}
                        disabled={isRevising || !revisionFeedback.trim()}
                        data-testid="button-submit-revision-arb"
                      >
                        {isRevising ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        {isRevising ? "Revising..." : "Apply Feedback"}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className={`p-3 rounded-lg bg-muted/50 ${(analysis.arbitrationLetter || "").length > CHAR_LIMIT ? "border border-red-500/30" : ""}`}>
                    <p className="text-sm whitespace-pre-wrap">{analysis.arbitrationLetter}</p>
                  </div>
                  <CharacterCount text={analysis.arbitrationLetter || ""} />
                  <div className="flex items-center gap-2">
                    <CopyButton text={analysis.arbitrationLetter} />
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={handleStartEdit}
                      data-testid="button-edit-arbitration"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-purple-400 border-purple-500/30 hover:bg-purple-500/10"
                      onClick={() => {
                        handleStartEdit();
                        setShowRevisionInput(true);
                      }}
                      data-testid="button-ai-revise-arb"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      AI Revise
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {analysis.evidenceSummary?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-blue-400 mb-1.5">Evidence to Include</p>
              <ul className="space-y-1">
                {analysis.evidenceSummary.map((e: string, i: number) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.timeline?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-purple-400 mb-1.5">Timeline of Events</p>
              <ul className="space-y-1">
                {analysis.timeline.map((t: string, i: number) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-xs text-purple-400 font-mono mr-1">{i + 1}.</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.reliefRequested && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-xs font-medium text-emerald-400 mb-1">Relief Requested</p>
              <p className="text-sm">{analysis.reliefRequested}</p>
            </div>
          )}

          {analysis.filingInstructions && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-xs font-medium text-blue-400 mb-1">Filing Instructions</p>
              <p className="text-sm whitespace-pre-wrap">{analysis.filingInstructions}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return null;
}
