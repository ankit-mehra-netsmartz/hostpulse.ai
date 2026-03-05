import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Flashlight,
  Send,
  Filter,
  ChevronDown,
  ChevronRight,
  Plus,
  Bookmark,
  Clock,
  Layout,
  X,
  RefreshCw,
  Save,
  Check,
  Loader2,
  MessageSquare,
  Sparkles,
  BarChart3,
  PanelRightClose,
  PanelRight,
  Trash2
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from "recharts";

const EXAMPLE_PROMPTS = [
  "What are the most common guest complaints from the last 3 months?",
  "Show me properties with the highest positive sentiment scores",
  "Which amenities get mentioned most in guest feedback?",
  "Find reviews mentioning check-in issues",
  "What do guests love most about our properties?",
  "Compare guest satisfaction across all properties",
  "What cleaning issues have been reported recently?",
  "Show me trends in guest feedback over time",
];

import { useWorkspace } from "@/contexts/workspace-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LumiQuery, LumiView } from "@shared/schema";

interface ViewFilters {
  listingIds?: string[];
  sentiment?: string[];
  dateRange?: { start: string; end: string };
  platforms?: string[];
  themes?: string[];
  tags?: string[];
}

interface ThinkingStep {
  step: string;
  status: "in_progress" | "complete";
  detail?: string;
}

interface ChartData {
  chartType: "bar" | "line" | "pie" | "area";
  title: string;
  data: Array<{ name: string; value: number; [key: string]: string | number }>;
  xAxisKey?: string;
  yAxisKey?: string;
  colors?: string[];
}

interface ClarificationData {
  question: string;
  options?: string[];
  context?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinkingSteps?: ThinkingStep[];
  isStreaming?: boolean;
  sources?: {
    reservations?: number;
    reviews?: number;
    tags?: number;
    themes?: number;
    listings?: number;
  };
  charts?: ChartData[];
  clarification?: ClarificationData;
  followUpQuestions?: string[];
}

export default function AskLumi() {
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [textMatchOnly, setTextMatchOnly] = useState(false);
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [showNewViewModal, setShowNewViewModal] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [newViewDescription, setNewViewDescription] = useState("");
  const [newViewFilters, setNewViewFilters] = useState<ViewFilters>({});
  const [historyTab, setHistoryTab] = useState<"history" | "saved">("history");
  const [selectedSources, setSelectedSources] = useState<string[]>(["reservations", "reviews", "tags", "themes", "messages"]);
  
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [useAgenticMode, setUseAgenticMode] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [streamingCharts, setStreamingCharts] = useState<ChartData[]>([]);
  const [streamingClarification, setStreamingClarification] = useState<ClarificationData | null>(null);
  const [streamingFollowUp, setStreamingFollowUp] = useState<string[]>([]);
  
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [typedText, setTypedText] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const workspaceId = activeWorkspace?.id;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, thinkingSteps, streamingContent, scrollToBottom]);

  useEffect(() => {
    if (query) return;

    const currentPrompt = EXAMPLE_PROMPTS[currentPromptIndex];
    let charIndex = 0;
    let isDeleting = false;
    let timeoutId: NodeJS.Timeout;

    const typeCharacter = () => {
      if (!isDeleting) {
        if (charIndex <= currentPrompt.length) {
          setTypedText(currentPrompt.slice(0, charIndex));
          charIndex++;
          timeoutId = setTimeout(typeCharacter, 30);
        } else {
          setIsTyping(false);
          timeoutId = setTimeout(() => {
            isDeleting = true;
            setIsTyping(true);
            typeCharacter();
          }, 2000);
        }
      } else {
        if (charIndex > 0) {
          charIndex--;
          setTypedText(currentPrompt.slice(0, charIndex));
          timeoutId = setTimeout(typeCharacter, 15);
        } else {
          setCurrentPromptIndex((prev) => (prev + 1) % EXAMPLE_PROMPTS.length);
        }
      }
    };

    typeCharacter();

    return () => clearTimeout(timeoutId);
  }, [query, currentPromptIndex]);

  const { data: views = [] } = useQuery<LumiView[]>({
    queryKey: ["/api/lumi/views"],
    enabled: !!workspaceId,
  });

  const { data: queryHistory = [] } = useQuery<LumiQuery[]>({
    queryKey: ["/api/lumi/queries"],
    enabled: !!workspaceId,
  });

  const { data: listings = [] } = useQuery<any[]>({
    queryKey: ["/api/listings"],
    enabled: !!workspaceId,
  });

  const selectedView = views.find(v => v.id === selectedViewId);

  const createViewMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/lumi/views", {
        name: newViewName,
        description: newViewDescription,
        filters: newViewFilters,
        workspaceId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lumi/views"] });
      toast({ title: "View Created", description: "Your custom view has been created." });
      setShowNewViewModal(false);
      setNewViewName("");
      setNewViewDescription("");
      setNewViewFilters({});
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create view.", variant: "destructive" });
    },
  });

  const saveConversationMutation = useMutation({
    mutationFn: async (convId: string) => {
      return apiRequest("PATCH", `/api/lumi/conversations/${convId}/save`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lumi/queries"] });
      toast({ title: "Saved", description: "Conversation saved to your collection." });
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: async (convId: string) => {
      return apiRequest("DELETE", `/api/lumi/conversations/${convId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lumi/queries"] });
      toast({ title: "Deleted", description: "Conversation removed." });
    },
  });

  const historyItems = queryHistory.filter(q => !q.isSaved);
  const savedItems = queryHistory.filter(q => q.isSaved);

  // Group history by conversationId, showing only the first query of each conversation
  const conversationMap = historyItems.reduce((map, item) => {
    const key = item.conversationId || item.id; // Fall back to id if no conversationId
    if (!map[key]) {
      map[key] = item; // Keep the first (oldest) query of the conversation
    }
    return map;
  }, {} as Record<string, LumiQuery>);
  
  const uniqueConversations = Object.values(conversationMap);

  const groupedHistory = uniqueConversations.reduce((groups, item) => {
    const date = item.createdAt ? new Date(item.createdAt) : new Date();
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    let group = "Older";
    if (diffDays < 1) group = "Today";
    else if (diffDays < 7) group = "Last week";
    else if (diffDays < 30) group = "Last month";
    
    if (!groups[group]) groups[group] = [];
    groups[group].push(item);
    return groups;
  }, {} as Record<string, LumiQuery[]>);

  const handleStreamingQuery = async (overridePrompt?: string) => {
    const promptToUse = overridePrompt || query.trim();
    if (!promptToUse || !workspaceId) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: promptToUse,
    };
    setMessages(prev => [...prev, userMessage]);
    setQuery("");
    setThinkingSteps([]);
    setStreamingContent("");
    setStreamingCharts([]);
    setStreamingClarification(null);
    setStreamingFollowUp([]);
    setIsStreaming(true);

    // Use WebSocket for real-time streaming (no proxy buffering issues)
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    let currentContent = "";
    let finalSources: ChatMessage["sources"] = undefined;
    const collectedThinkingSteps: ThinkingStep[] = [];
    const collectedCharts: ChartData[] = [];
    let collectedClarification: ClarificationData | null = null;
    let collectedFollowUp: string[] = [];

    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      // Send query request (user authenticated via session cookie on server)
      ws.send(JSON.stringify({
        type: "query",
        prompt: promptToUse,
        workspaceId,
        conversationId,
        viewId: selectedViewId,
        textMatchOnly,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case "conversation":
            setConversationId(message.data.conversationId);
            break;
          case "thinking":
            console.log("[Lumi WS] Thinking:", message.data.step, message.data.status);
            const existingIdx = collectedThinkingSteps.findIndex(s => s.step === message.data.step);
            if (existingIdx >= 0) {
              collectedThinkingSteps[existingIdx] = { 
                ...collectedThinkingSteps[existingIdx], 
                status: message.data.status, 
                detail: message.data.detail 
              };
            } else {
              collectedThinkingSteps.push({ 
                step: message.data.step, 
                status: message.data.status, 
                detail: message.data.detail 
              });
            }
            setThinkingSteps([...collectedThinkingSteps]);
            break;
          case "content":
            currentContent += message.data.text;
            setStreamingContent(currentContent);
            break;
          case "chart":
            collectedCharts.push(message.data as ChartData);
            setStreamingCharts([...collectedCharts]);
            break;
          case "clarification":
            collectedClarification = message.data as ClarificationData;
            setStreamingClarification(collectedClarification);
            break;
          case "followup":
            collectedFollowUp = message.data.questions || [];
            setStreamingFollowUp(collectedFollowUp);
            break;
          case "sources":
            finalSources = message.data;
            break;
          case "complete":
            // Finalize the message
            const assistantMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: "assistant",
              content: currentContent,
              thinkingSteps: collectedThinkingSteps,
              sources: finalSources,
              charts: collectedCharts.length > 0 ? collectedCharts : undefined,
              clarification: collectedClarification || undefined,
              followUpQuestions: collectedFollowUp.length > 0 ? collectedFollowUp : undefined,
            };
            setMessages(prev => [...prev, assistantMessage]);
            setThinkingSteps([]);
            setStreamingContent("");
            setStreamingCharts([]);
            setStreamingClarification(null);
            setStreamingFollowUp([]);
            setIsStreaming(false);
            queryClient.invalidateQueries({ queryKey: ["/api/lumi/queries"] });
            ws.close();
            break;
          case "error":
            toast({ title: "Error", description: message.data.message, variant: "destructive" });
            const errorMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: "assistant",
              content: "Sorry, I encountered an error processing your request. Please try again.",
            };
            setMessages(prev => [...prev, errorMessage]);
            setThinkingSteps([]);
            setStreamingContent("");
            setIsStreaming(false);
            ws.close();
            break;
        }
      } catch (error) {
        console.error("WebSocket message parse error:", error);
      }
    };

    ws.onerror = () => {
      toast({ title: "Error", description: "Connection failed. Please try again.", variant: "destructive" });
      setIsStreaming(false);
    };

    ws.onclose = () => {
      // Ensure streaming is stopped if connection closes unexpectedly
      if (isStreaming) {
        setIsStreaming(false);
      }
    };
  };

  const handleNewConversation = () => {
    setConversationId(null);
    setMessages([]);
    setThinkingSteps([]);
    setStreamingContent("");
  };

  const loadConversation = (targetConversationId: string) => {
    // Find all queries belonging to this conversation
    const conversationQueries = queryHistory.filter((q: LumiQuery) => q.conversationId === targetConversationId);
    if (conversationQueries.length === 0) return;

    // Sort by creation date to maintain order
    const sortedQueries = [...conversationQueries].sort((a: LumiQuery, b: LumiQuery) => 
      new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    );

    // Convert queries to messages (user question + assistant response pairs)
    const loadedMessages: ChatMessage[] = [];
    sortedQueries.forEach((q: LumiQuery, idx: number) => {
      loadedMessages.push({
        id: `loaded-user-${q.id}-${idx}`,
        role: "user",
        content: q.prompt,
      });
      loadedMessages.push({
        id: `loaded-assistant-${q.id}-${idx}`,
        role: "assistant",
        content: q.response || "",
        charts: [],
        sources: q.sources as ChatMessage["sources"],
        followUpQuestions: [],
      });
    });

    setConversationId(targetConversationId);
    setMessages(loadedMessages);
    setQuery("");
  };

  const handleSubmit = () => {
    if (!query.trim()) return;
    handleStreamingQuery();
  };

  const handleSaveConversation = () => {
    if (!conversationId) {
      toast({ title: "Nothing to save", description: "Start a conversation first.", variant: "destructive" });
      return;
    }
    saveConversationMutation.mutate(conversationId);
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Ask Lumi</h1>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNewConversation}
                className="gap-2"
                data-testid="button-new-conversation"
              >
                <Plus className="w-4 h-4" />
                New Chat
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2" data-testid="button-view-selector">
                  <Filter className="w-4 h-4" />
                  {selectedView?.name || "All Data"}
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuItem
                  onClick={() => setSelectedViewId(null)}
                  className="flex flex-col items-start"
                >
                  <span className="font-medium">All Data</span>
                  <span className="text-xs text-muted-foreground">
                    Create a custom view to organize feedback around your projects or areas of ownership.
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {views.map(view => (
                  <DropdownMenuItem
                    key={view.id}
                    onClick={() => setSelectedViewId(view.id)}
                  >
                    {view.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowNewViewModal(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add new view
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Button 
              variant="outline" 
              size="icon" 
              onClick={handleSaveConversation}
              disabled={!conversationId || saveConversationMutation.isPending}
              data-testid="button-save-conversation"
            >
              {saveConversationMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
              data-testid="button-toggle-sidebar"
            >
              {rightSidebarOpen ? (
                <PanelRightClose className="w-4 h-4" />
              ) : (
                <PanelRight className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && !isStreaming ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Flashlight className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold mb-2">How can I help you today?</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Ask me anything about your guest feedback, property performance, or trends across your portfolio.
                </p>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}
                    data-testid={`message-${message.id}`}
                  >
                    {message.role === "assistant" && (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Flashlight className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2"
                          : "bg-muted/50 rounded-2xl rounded-tl-sm px-4 py-3"
                      }`}
                    >
                      <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                      
                      {message.charts && message.charts.length > 0 && (
                        <div className="mt-4 space-y-4">
                          {message.charts.map((chart, chartIdx) => (
                            <div key={chartIdx} className="bg-background rounded-lg p-4 border">
                              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-primary" />
                                {chart.title}
                              </h4>
                              <div className="h-48">
                                <ResponsiveContainer width="100%" height="100%">
                                  {chart.chartType === "bar" ? (
                                    <BarChart data={chart.data}>
                                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                                      <XAxis dataKey={chart.xAxisKey || "name"} tick={{ fontSize: 11 }} />
                                      <YAxis tick={{ fontSize: 11 }} />
                                      <Tooltip />
                                      <Bar dataKey={chart.yAxisKey || "value"} fill="#10b981" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                  ) : chart.chartType === "line" ? (
                                    <LineChart data={chart.data}>
                                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                                      <XAxis dataKey={chart.xAxisKey || "name"} tick={{ fontSize: 11 }} />
                                      <YAxis tick={{ fontSize: 11 }} />
                                      <Tooltip />
                                      <Line type="monotone" dataKey={chart.yAxisKey || "value"} stroke="#10b981" strokeWidth={2} />
                                    </LineChart>
                                  ) : chart.chartType === "pie" ? (
                                    <PieChart>
                                      <Pie
                                        data={chart.data}
                                        dataKey={chart.yAxisKey || "value"}
                                        nameKey={chart.xAxisKey || "name"}
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={60}
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                        labelLine={false}
                                      >
                                        {chart.data.map((_, idx) => (
                                          <Cell key={idx} fill={chart.colors?.[idx % (chart.colors?.length || 4)] || ["#10b981", "#ef4444", "#6b7280", "#3b82f6"][idx % 4]} />
                                        ))}
                                      </Pie>
                                      <Tooltip />
                                    </PieChart>
                                  ) : (
                                    <AreaChart data={chart.data}>
                                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                                      <XAxis dataKey={chart.xAxisKey || "name"} tick={{ fontSize: 11 }} />
                                      <YAxis tick={{ fontSize: 11 }} />
                                      <Tooltip />
                                      <Area type="monotone" dataKey={chart.yAxisKey || "value"} fill="#10b981" fillOpacity={0.3} stroke="#10b981" />
                                    </AreaChart>
                                  )}
                                </ResponsiveContainer>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {message.clarification && (
                        <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                          <p className="text-sm font-medium mb-2">{message.clarification.question}</p>
                          {message.clarification.options && (
                            <div className="flex flex-wrap gap-2">
                              {message.clarification.options.map((option, optIdx) => (
                                <Button
                                  key={optIdx}
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleStreamingQuery(option)}
                                  disabled={isStreaming}
                                  data-testid={`clarification-option-${optIdx}`}
                                >
                                  {option}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {message.followUpQuestions && message.followUpQuestions.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-border/50">
                          <p className="text-xs text-muted-foreground mb-2">Suggested follow-ups:</p>
                          <div className="flex flex-wrap gap-2">
                            {message.followUpQuestions.map((q, qIdx) => (
                              <Button
                                key={qIdx}
                                size="sm"
                                variant="ghost"
                                className="text-xs h-auto py-1.5 text-left justify-start"
                                onClick={() => handleStreamingQuery(q)}
                                disabled={isStreaming}
                                data-testid={`followup-question-${qIdx}`}
                              >
                                <Sparkles className="w-3 h-3 mr-1.5 flex-shrink-0 text-primary" />
                                {q}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {message.sources && (
                        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-border/50">
                          {(message.sources.tags ?? 0) > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {message.sources.tags} tags
                            </Badge>
                          )}
                          {(message.sources.themes ?? 0) > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {message.sources.themes} themes
                            </Badge>
                          )}
                          {(message.sources.reservations ?? 0) > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {message.sources.reservations} reservations
                            </Badge>
                          )}
                          {(message.sources.reviews ?? 0) > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {message.sources.reviews} reviews
                            </Badge>
                          )}
                          {(message.sources.listings ?? 0) > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {message.sources.listings} listings
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    {message.role === "user" && (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                ))}

                {isStreaming && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/20">
                      <Flashlight className="w-4 h-4 text-primary animate-pulse" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="relative overflow-hidden rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4">
                        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-[shimmer_2s_infinite]" />
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                          <span className="text-xs font-medium text-primary uppercase tracking-wider">Lumi is thinking</span>
                        </div>
                        <div className="space-y-2.5">
                          {thinkingSteps.length === 0 ? (
                            <div className="flex items-center gap-3 text-sm text-foreground">
                              <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                              </div>
                              <span className="font-medium">Processing your question...</span>
                            </div>
                          ) : (
                            thinkingSteps.map((step, index) => (
                              <div 
                                key={index} 
                                className={`flex items-center gap-3 text-sm transition-all duration-300 ${
                                  step.status === "in_progress" 
                                    ? "text-foreground" 
                                    : "text-muted-foreground/70"
                                }`}
                              >
                                {step.status === "in_progress" ? (
                                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                  </div>
                                ) : (
                                  <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                                    <Check className="w-3.5 h-3.5 text-green-500" />
                                  </div>
                                )}
                                <span className={step.status === "in_progress" ? "font-medium" : ""}>
                                  {step.step}
                                </span>
                                {step.detail && (
                                  <span className="text-xs text-muted-foreground ml-auto bg-muted/50 px-2 py-0.5 rounded">
                                    {step.detail}
                                  </span>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {streamingContent && (
                        <div className="bg-muted/50 rounded-2xl rounded-tl-sm px-4 py-3">
                          <p className="whitespace-pre-wrap text-sm">
                            {streamingContent}
                            <span className="inline-block w-2 h-4 bg-primary/50 animate-pulse ml-0.5" />
                          </p>
                        </div>
                      )}
                      
                      {streamingCharts.length > 0 && (
                        <div className="space-y-4">
                          {streamingCharts.map((chart, chartIdx) => (
                            <div key={chartIdx} className="bg-background rounded-lg p-4 border">
                              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-primary" />
                                {chart.title}
                              </h4>
                              <div className="h-48">
                                <ResponsiveContainer width="100%" height="100%">
                                  {chart.chartType === "bar" ? (
                                    <BarChart data={chart.data}>
                                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                                      <XAxis dataKey={chart.xAxisKey || "name"} tick={{ fontSize: 11 }} />
                                      <YAxis tick={{ fontSize: 11 }} />
                                      <Tooltip />
                                      <Bar dataKey={chart.yAxisKey || "value"} fill="#10b981" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                  ) : chart.chartType === "pie" ? (
                                    <PieChart>
                                      <Pie
                                        data={chart.data}
                                        dataKey={chart.yAxisKey || "value"}
                                        nameKey={chart.xAxisKey || "name"}
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={60}
                                        label
                                      >
                                        {chart.data.map((_, idx) => (
                                          <Cell key={idx} fill={["#10b981", "#ef4444", "#6b7280", "#3b82f6"][idx % 4]} />
                                        ))}
                                      </Pie>
                                      <Tooltip />
                                    </PieChart>
                                  ) : (
                                    <LineChart data={chart.data}>
                                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                                      <XAxis dataKey={chart.xAxisKey || "name"} tick={{ fontSize: 11 }} />
                                      <YAxis tick={{ fontSize: 11 }} />
                                      <Tooltip />
                                      <Line type="monotone" dataKey={chart.yAxisKey || "value"} stroke="#10b981" strokeWidth={2} />
                                    </LineChart>
                                  )}
                                </ResponsiveContainer>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {streamingClarification && (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg mt-4">
                          <p className="text-sm font-medium">{streamingClarification.question}</p>
                          {streamingClarification.options && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {streamingClarification.options.map((option, optIdx) => (
                                <Button
                                  key={optIdx}
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleStreamingQuery(option)}
                                  disabled={isStreaming}
                                >
                                  {option}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="p-4 border-t">
          <div className="max-w-3xl mx-auto">
            <div className="relative bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 p-1 rounded-2xl">
              <div className="bg-background rounded-xl overflow-hidden shadow-sm border border-border/50">
                <div className="relative p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1 ${isStreaming ? "animate-pulse" : ""}`}>
                      <Flashlight className={`w-4 h-4 text-primary ${isStreaming ? "animate-[glow_1.5s_ease-in-out_infinite]" : ""}`} />
                    </div>
                    <div className="flex-1 relative">
                      <textarea
                        ref={textareaRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="w-full min-h-[60px] resize-none bg-transparent border-0 focus:outline-none focus:ring-0 text-base placeholder:text-transparent"
                        placeholder=" "
                        disabled={isStreaming}
                        data-testid="textarea-query-input"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey && query.trim() && !isStreaming) {
                            e.preventDefault();
                            handleSubmit();
                          }
                        }}
                      />
                      {!query && !isStreaming && (
                        <div 
                          className="absolute top-0 left-0 pointer-events-none text-muted-foreground/60 text-base"
                          onClick={() => textareaRef.current?.focus()}
                        >
                          {messages.length > 0 ? "Ask a follow-up question..." : typedText}
                          <span className={`inline-block w-0.5 h-5 bg-muted-foreground/40 ml-0.5 align-middle ${isTyping && messages.length === 0 ? "animate-pulse" : ""}`} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 bg-muted/30">
                  <div className="flex items-center gap-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="gap-2" data-testid="button-sources">
                          <Layout className="w-4 h-4" />
                          {selectedSources.length} source{selectedSources.length !== 1 ? "s" : ""}
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-48">
                        {[
                          { id: "reservations", label: "Reservations" },
                          { id: "reviews", label: "Reviews" },
                          { id: "tags", label: "Tags" },
                          { id: "themes", label: "Themes" },
                          { id: "messages", label: "Messages" },
                        ].map((source) => (
                          <DropdownMenuItem
                            key={source.id}
                            onSelect={(e) => e.preventDefault()}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <Checkbox
                              id={`source-${source.id}`}
                              checked={selectedSources.includes(source.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedSources([...selectedSources, source.id]);
                                } else {
                                  setSelectedSources(selectedSources.filter(s => s !== source.id));
                                }
                              }}
                              data-testid={`checkbox-source-${source.id}`}
                            />
                            <Label htmlFor={`source-${source.id}`} className="cursor-pointer flex-1">
                              {source.label}
                            </Label>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="text-match"
                        checked={textMatchOnly}
                        onCheckedChange={(checked) => setTextMatchOnly(!!checked)}
                        data-testid="checkbox-text-match"
                      />
                      <Label htmlFor="text-match" className="text-sm cursor-pointer">
                        Text match only
                      </Label>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Switch
                        id="agentic-mode"
                        checked={useAgenticMode}
                        onCheckedChange={setUseAgenticMode}
                        data-testid="switch-agentic-mode"
                      />
                      <Label htmlFor="agentic-mode" className="text-sm cursor-pointer flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        Smart Mode
                      </Label>
                    </div>
                  </div>
                  
                  <Button
                    onClick={handleSubmit}
                    disabled={!query.trim() || isStreaming}
                    className="rounded-full"
                    size="icon"
                    data-testid="button-submit-query"
                  >
                    {isStreaming ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {rightSidebarOpen && (
      <div className="w-80 border-l bg-muted/30 flex flex-col">
        <div className="p-4 border-b">
          <div className="flex gap-4">
            <button
              onClick={() => setHistoryTab("history")}
              className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                historyTab === "history" 
                  ? "border-primary text-foreground" 
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid="button-history-tab"
            >
              History
            </button>
            <button
              onClick={() => setHistoryTab("saved")}
              className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                historyTab === "saved" 
                  ? "border-primary text-foreground" 
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid="button-saved-tab"
            >
              Saved
            </button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4">
            {historyTab === "history" ? (
              Object.entries(groupedHistory).length > 0 ? (
                Object.entries(groupedHistory).map(([group, items]) => (
                  <div key={group} className="mb-6">
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">{group}</h4>
                    <div className="space-y-2">
                      {items.map(item => (
                        <div
                          key={item.id}
                          className="flex items-start gap-2 p-2 rounded-md hover:bg-muted cursor-pointer group"
                          data-testid={`history-item-${item.id}`}
                        >
                          <span 
                            className="text-sm line-clamp-2 flex-1"
                            onClick={() => item.conversationId && loadConversation(item.conversationId)}
                          >
                            {item.prompt}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (item.conversationId) {
                                deleteConversationMutation.mutate(item.conversationId);
                              }
                            }}
                            data-testid={`delete-history-${item.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No query history yet</p>
                </div>
              )
            ) : (
              savedItems.length > 0 ? (
                <div className="space-y-2">
                  {savedItems.map(item => (
                    <div
                      key={item.id}
                      className="flex items-start gap-2 p-2 rounded-md hover:bg-muted cursor-pointer group"
                      data-testid={`saved-item-${item.id}`}
                    >
                      <Bookmark className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                      <span 
                        className="text-sm line-clamp-2 flex-1"
                        onClick={() => item.conversationId && loadConversation(item.conversationId)}
                      >
                        {item.prompt}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.conversationId) {
                            deleteConversationMutation.mutate(item.conversationId);
                          }
                        }}
                        data-testid={`delete-saved-${item.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Bookmark className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No saved queries</p>
                </div>
              )
            )}
          </div>
        </ScrollArea>
      </div>
      )}

      <Dialog open={showNewViewModal} onOpenChange={setShowNewViewModal}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-new-view">
          <DialogHeader>
            <DialogTitle>New view</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Create reusable filters that help you focus on the feedback that matters across your data.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="view-name">Name</Label>
              <Input
                id="view-name"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                placeholder="Name your view"
                className="mt-1.5"
                data-testid="input-view-name"
              />
            </div>

            <div>
              <Label htmlFor="view-description">Description</Label>
              <Input
                id="view-description"
                value={newViewDescription}
                onChange={(e) => setNewViewDescription(e.target.value)}
                placeholder="Add a short description"
                className="mt-1.5"
                data-testid="input-view-description"
              />
            </div>

            <Separator />

            <div>
              <Label>Add filters</Label>
              {((newViewFilters.listingIds?.length || 0) > 0 || (newViewFilters.sentiment?.length || 0) > 0) && (
                <div className="flex flex-wrap gap-2 mt-2 mb-3">
                  {newViewFilters.listingIds?.map(id => {
                    const listing = listings.find((l: any) => l.id === id);
                    return (
                      <Badge key={id} variant="secondary" className="gap-1">
                        {listing?.name?.slice(0, 25) || id}
                        <X
                          className="w-3 h-3 cursor-pointer"
                          onClick={() => setNewViewFilters({
                            ...newViewFilters,
                            listingIds: newViewFilters.listingIds?.filter(x => x !== id)
                          })}
                        />
                      </Badge>
                    );
                  })}
                  {newViewFilters.sentiment?.map(s => (
                    <Badge key={s} variant="secondary" className="gap-1">
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                      <X
                        className="w-3 h-3 cursor-pointer"
                        onClick={() => setNewViewFilters({
                          ...newViewFilters,
                          sentiment: newViewFilters.sentiment?.filter(x => x !== s)
                        })}
                      />
                    </Badge>
                  ))}
                </div>
              )}
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between mt-2" data-testid="select-filters">
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4" />
                      <span>Select filters</span>
                    </div>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64" align="start">
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Properties</div>
                  {listings.map((listing: any) => (
                    <DropdownMenuItem
                      key={listing.id}
                      onSelect={(e) => e.preventDefault()}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Checkbox
                        id={`filter-listing-${listing.id}`}
                        checked={newViewFilters.listingIds?.includes(listing.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setNewViewFilters({
                              ...newViewFilters,
                              listingIds: [...(newViewFilters.listingIds || []), listing.id]
                            });
                          } else {
                            setNewViewFilters({
                              ...newViewFilters,
                              listingIds: newViewFilters.listingIds?.filter(x => x !== listing.id)
                            });
                          }
                        }}
                      />
                      <Label htmlFor={`filter-listing-${listing.id}`} className="cursor-pointer flex-1 text-sm truncate">
                        {listing.name}
                      </Label>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Sentiment</div>
                  {["positive", "negative", "neutral"].map((sentiment) => (
                    <DropdownMenuItem
                      key={sentiment}
                      onSelect={(e) => e.preventDefault()}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Checkbox
                        id={`filter-sentiment-${sentiment}`}
                        checked={newViewFilters.sentiment?.includes(sentiment)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setNewViewFilters({
                              ...newViewFilters,
                              sentiment: [...(newViewFilters.sentiment || []), sentiment]
                            });
                          } else {
                            setNewViewFilters({
                              ...newViewFilters,
                              sentiment: newViewFilters.sentiment?.filter(x => x !== sentiment)
                            });
                          }
                        }}
                      />
                      <Label htmlFor={`filter-sentiment-${sentiment}`} className="cursor-pointer flex-1 text-sm">
                        {sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}
                      </Label>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewViewModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createViewMutation.mutate()}
              disabled={!newViewName.trim() || createViewMutation.isPending}
              data-testid="button-create-view"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
