import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { 
  Search, 
  CalendarIcon, 
  Grid3X3, 
  List,
  Wrench,
  Sparkle,
  Package,
  Coffee,
  Bug,
  Shield,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Wand2,
  Loader2
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, subDays } from "date-fns";
import type { Theme, Tag } from "@shared/schema";

interface ThemeWithStats extends Theme {
  tags: Tag[];
  tagCount: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  questionCount: number;
  trend: number;
  lastUpdated: string | null;
}

const themeIcons: Record<string, typeof Wrench> = {
  "Maintenance": Wrench,
  "Cleanliness": Sparkle,
  "Supplies": Package,
  "Amenities": Coffee,
  "Pest Control": Bug,
  "Safety": Shield,
  "Communication": MessageSquare,
};

const sentimentConfig = {
  positive: { label: "Positive", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  negative: { label: "Negative", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  neutral: { label: "Neutral", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  question: { label: "Question", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
};


export default function Themes() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [sortByVolume, setSortByVolume] = useState<"asc" | "desc">("desc");
  const { toast } = useToast();

  const { data: themes = [], isLoading } = useQuery<ThemeWithStats[]>({
    queryKey: ["/api/themes/stats"],
  });

  // Mutation to promote pending themes to real themes
  const promoteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/themes/promote");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      toast({
        title: "Themes Created",
        description: `Created ${data.themesPromoted} new themes from ${data.tagsProcessed} tags.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to promote themes. Please try again.",
        variant: "destructive",
      });
    },
  });

  const totalTags = themes.reduce((sum, theme) => sum + theme.tagCount, 0);

  const filteredThemes = themes
    .filter(theme => {
      const matchesSearch = searchQuery === "" || 
        theme.name.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (sentimentFilter === "all") return matchesSearch;
      
      const counts = [
        { type: "negative", count: theme.negativeCount },
        { type: "positive", count: theme.positiveCount },
        { type: "neutral", count: theme.neutralCount },
        { type: "question", count: theme.questionCount || 0 },
      ];
      const dominantSentiment = counts.reduce((a, b) => b.count > a.count ? b : a).type;
      
      return matchesSearch && dominantSentiment === sentimentFilter;
    })
    .sort((a, b) => {
      if (sortByVolume === "asc") return a.tagCount - b.tagCount;
      return b.tagCount - a.tagCount;
    });

  const toggleVolumeSort = () => {
    if (sortByVolume === "desc") {
      setSortByVolume("asc");
    } else {
      setSortByVolume("desc");
    }
  };

  const getDominantSentiment = (theme: ThemeWithStats): keyof typeof sentimentConfig => {
    const counts = [
      { type: "negative" as const, count: theme.negativeCount },
      { type: "positive" as const, count: theme.positiveCount },
      { type: "neutral" as const, count: theme.neutralCount },
      { type: "question" as const, count: theme.questionCount || 0 },
    ];
    return counts.reduce((a, b) => b.count > a.count ? b : a).type;
  };

  const getRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    return format(date, "MMM dd, yyyy");
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="w-full space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Themes</p>
            <h1 className="text-2xl font-bold">Themes</h1>
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
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 max-w-sm relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search themes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-themes"
            />
          </div>
          <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
            <SelectTrigger className="w-40" data-testid="select-sentiment-filter">
              <SelectValue placeholder="All Sentiments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sentiments</SelectItem>
              <SelectItem value="positive">Positive</SelectItem>
              <SelectItem value="negative">Negative</SelectItem>
              <SelectItem value="neutral">Neutral</SelectItem>
              <SelectItem value="question">Question</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" data-testid="button-date-range">
                <CalendarIcon className="w-4 h-4 mr-2" />
                {format(dateRange.from, "MMM d, yyyy")} - {format(dateRange.to, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: dateRange.from, to: dateRange.to }}
                onSelect={(range) => {
                  if (range?.from && range?.to) {
                    setDateRange({ from: range.from, to: range.to });
                  }
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : themes.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Grid3X3 className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">No Themes Yet</h3>
                <p className="text-muted-foreground mt-1 mb-4">
                  Themes are created from tags when patterns emerge. Click below to generate themes from your existing tags.
                </p>
                <Button 
                  onClick={() => promoteMutation.mutate()}
                  disabled={promoteMutation.isPending}
                  data-testid="button-generate-themes"
                >
                  {promoteMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4 mr-2" />
                      Generate Themes from Tags
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-sm text-muted-foreground">Theme name</th>
                    <th className="text-left p-3 font-medium text-sm text-muted-foreground">
                      Tags - {totalTags} in total
                    </th>
                    <th 
                      className="text-left p-3 font-medium text-sm text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={toggleVolumeSort}
                      data-testid="th-tag-volume"
                    >
                      Tag Volume {sortByVolume === "asc" ? "↑" : "↓"}
                    </th>
                    <th className="text-left p-3 font-medium text-sm text-muted-foreground">Sentiment</th>
                    <th className="text-left p-3 font-medium text-sm text-muted-foreground">Trend</th>
                    <th className="text-left p-3 font-medium text-sm text-muted-foreground">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredThemes.map((theme) => {
                    const Icon = themeIcons[theme.name] || Wrench;
                    const dominantSentiment = getDominantSentiment(theme);
                    const sentimentStyle = sentimentConfig[dominantSentiment];
                    const volumePercent = totalTags > 0 ? Math.round((theme.tagCount / totalTags) * 100) : 0;
                    const sampleTags = theme.tags?.slice(0, 2) || [];
                    const remainingTags = Math.max(0, theme.tagCount - 2);
                    
                    return (
                      <tr 
                        key={theme.id} 
                        className={`border-b hover-elevate cursor-pointer ${theme.tagCount === 0 ? 'opacity-40' : ''}`}
                        onClick={() => navigate(`/themes/${theme.id}`)}
                        data-testid={`row-theme-${theme.id}`}
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {theme.icon && !theme.name.startsWith(theme.icon) ? (
                              <span className="text-base">{theme.icon}</span>
                            ) : !theme.icon && !theme.name.match(/^[\p{Emoji}]/u) ? (
                              <Icon className="w-4 h-4 text-muted-foreground" />
                            ) : null}
                            <span className="font-medium">{theme.name}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            {sampleTags.map((tag) => (
                              <Badge 
                                key={tag.id} 
                                variant="secondary"
                                className={
                                  tag.sentiment === "positive" 
                                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                    : tag.sentiment === "negative"
                                      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                      : ""
                                }
                              >
                                {tag.name}
                              </Badge>
                            ))}
                            {remainingTags > 0 && (
                              <span className="text-sm text-muted-foreground">
                                +{remainingTags} more
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="text-sm">
                            {theme.tagCount} ({volumePercent}%)
                          </span>
                        </td>
                        <td className="p-3">
                          <Badge className={sentimentStyle.color}>
                            {sentimentStyle.label}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            {theme.trend > 0 ? (
                              <>
                                <TrendingUp className="w-4 h-4 text-green-600" />
                                <span className="text-sm text-green-600">+{theme.trend}%</span>
                              </>
                            ) : theme.trend < 0 ? (
                              <>
                                <TrendingDown className="w-4 h-4 text-red-600" />
                                <span className="text-sm text-red-600">{theme.trend}%</span>
                              </>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="text-sm text-muted-foreground">
                            {getRelativeTime(theme.lastUpdated)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {filteredThemes.length === 0 && themes.length > 0 && (
              <div className="p-12 text-center text-muted-foreground">
                No themes match your search criteria.
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
