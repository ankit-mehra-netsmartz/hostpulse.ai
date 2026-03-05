import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  ThumbsUp, 
  ThumbsDown, 
  Minus,
  Building2,
  Sparkles,
  Loader2
} from "lucide-react";
import { SiNotion } from "react-icons/si";
import { TagDetailSheet } from "@/components/tag-detail-sheet";
import { TagFrequencyChart } from "@/components/tag-frequency-chart";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { format, parseISO, isSameDay } from "date-fns";
import { useNotionSync } from "@/hooks/use-notion-sync";
import { useSearch, useLocation } from "wouter";
import type { Tag, Theme, Listing, Reservation } from "@shared/schema";

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
}

interface TagWithRelations extends Tag {
  listing?: Listing;
  theme?: Theme;
  reservation?: Reservation;
}

interface ChartDataPoint {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
  question: number;
}

const sentimentConfig = {
  positive: { label: "Positive", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: ThumbsUp },
  negative: { label: "Negative", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: ThumbsDown },
  neutral: { label: "Neutral", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: Minus },
  question: { label: "Question", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: Minus },
};

export default function Tags() {
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const searchParams = new URLSearchParams(searchString);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [selectedTag, setSelectedTag] = useState<TagWithRelations | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sortField, setSortField] = useState<"name" | "createdAt">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const { canSync, syncToNotion, isSyncing } = useNotionSync();
  
  const getInitialDates = () => {
    // Use window.location.search directly to ensure we get the actual URL params
    // wouter's useSearch may not have the updated value immediately after navigation
    const params = new URLSearchParams(window.location.search);
    const datesParam = params.get("dates");
    return datesParam ? datesParam.split(",").filter(Boolean) : [];
  };
  
  const [selectedDates, setSelectedDates] = useState<string[]>(getInitialDates);
  const lastSyncedUrlRef = useRef<string>("");
  
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Sync URL -> State when searchString changes (handles browser back/forward)
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const datesParam = params.get("dates");
    const urlDates = datesParam ? datesParam.split(",").filter(Boolean) : [];
    const urlDatesStr = urlDates.join(",");
    const currentDatesStr = selectedDates.join(",");
    
    // Only update if URL is different from current state
    if (urlDatesStr !== currentDatesStr) {
      setSelectedDates(urlDates);
      lastSyncedUrlRef.current = urlDatesStr;
    }
  }, [searchString]);

  // Sync State -> URL when selectedDates changes (from chart clicks)
  useEffect(() => {
    const newDatesParam = selectedDates.join(",");
    
    // Skip if this was just synced from URL
    if (newDatesParam === lastSyncedUrlRef.current) {
      return;
    }
    
    const params = new URLSearchParams(searchString);
    const currentUrlDates = params.get("dates") || "";
    
    if (currentUrlDates === newDatesParam) return;
    
    if (selectedDates.length > 0) {
      params.set("dates", newDatesParam);
    } else {
      params.delete("dates");
    }
    const newSearch = params.toString();
    navigate(`/tags${newSearch ? `?${newSearch}` : ""}`, { replace: true });
  }, [selectedDates, navigate, searchString]);

  const { data: chartResponse, isLoading: chartLoading } = useQuery<{
    chartData: ChartDataPoint[];
    listings: { id: string; name: string }[];
  }>({
    queryKey: ["/api/tags/chart-data", "365"],
    queryFn: async () => {
      const res = await fetch(`/api/tags/chart-data?days=365`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch chart data");
      return res.json();
    },
  });

  const {
    data: tagsData,
    isLoading: isLoadingTags,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<PaginatedResponse<TagWithRelations>>({
    queryKey: ["/api/tags", selectedDates.join(",")],
    queryFn: async ({ pageParam = 0 }) => {
      const datesParam = selectedDates.length > 0 ? `&dates=${selectedDates.join(",")}` : "";
      const res = await fetch(`/api/tags?limit=50&offset=${pageParam}${datesParam}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch tags");
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextOffset : undefined,
    staleTime: 0,
  });

  const tags = tagsData?.pages.flatMap(page => page.items) ?? [];
  const totalCount = tagsData?.pages[0]?.total ?? 0;

  useEffect(() => {
    const currentRef = loadMoreRef.current;
    if (!currentRef) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(currentRef);

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, tags.length]);

  const { data: themes = [] } = useQuery<Theme[]>({
    queryKey: ["/api/themes"],
  });

  const filteredTags = useMemo(() => {
    return tags
      .filter(tag => {
        const matchesSearch = searchQuery === "" || 
          tag.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          tag.theme?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          tag.listing?.name?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSentiment = sentimentFilter === "all" || tag.sentiment === sentimentFilter;
        
        return matchesSearch && matchesSentiment;
      })
      .sort((a, b) => {
        const aVal = sortField === "name" ? a.name : new Date(a.createdAt || 0).getTime();
        const bVal = sortField === "name" ? b.name : new Date(b.createdAt || 0).getTime();
        if (sortOrder === "asc") {
          return aVal < bVal ? -1 : 1;
        }
        return aVal > bVal ? -1 : 1;
      });
  }, [tags, searchQuery, sentimentFilter, sortField, sortOrder]);

  const handleTagClick = (tag: TagWithRelations) => {
    setSelectedTag(tag);
    setIsSheetOpen(true);
  };

  const toggleSort = (field: "name" | "createdAt") => {
    if (sortField === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleDateClick = (date: string) => {
    setSelectedDates(prev => {
      if (prev.includes(date)) {
        return prev.filter(d => d !== date);
      }
      return [...prev, date];
    });
  };

  const handleClearDate = (date: string) => {
    setSelectedDates(prev => prev.filter(d => d !== date));
  };

  const handleClearAllDates = () => {
    setSelectedDates([]);
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="w-full space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Tags</h1>
            <p className="text-muted-foreground">Manage all your tags</p>
          </div>
        </div>

        <TagFrequencyChart
          data={chartResponse?.chartData || []}
          selectedDates={selectedDates}
          onDateClick={handleDateClick}
          onClearDate={handleClearDate}
          onClearAll={handleClearAllDates}
          isLoading={chartLoading}
        />

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 max-w-sm relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by tag name"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-tags"
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
          {canSync && filteredTags.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const tagIds = filteredTags.map(t => t.id);
                syncToNotion(tagIds);
              }}
              disabled={isSyncing}
              data-testid="button-sync-all-to-notion"
            >
              {isSyncing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <SiNotion className="w-4 h-4 mr-2" />
              )}
              Sync {filteredTags.length} to Notion
            </Button>
          )}
        </div>

        {isLoadingTags ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tags.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">No Tags Yet</h3>
                <p className="text-muted-foreground mt-1">
                  Tags are automatically created when you sync and analyze reservations.
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th 
                      className="text-left p-3 font-medium text-sm text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("name")}
                      data-testid="th-name"
                    >
                      Name {sortField === "name" && (sortOrder === "asc" ? "↑" : "↓")}
                    </th>
                    <th className="text-left p-3 font-medium text-sm text-muted-foreground">Theme</th>
                    <th className="text-left p-3 font-medium text-sm text-muted-foreground">Sentiment</th>
                    <th className="text-left p-3 font-medium text-sm text-muted-foreground">Property</th>
                    <th className="text-left p-3 font-medium text-sm text-muted-foreground">Platform</th>
                    <th 
                      className="text-left p-3 font-medium text-sm text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("createdAt")}
                      data-testid="th-created"
                    >
                      Created {sortField === "createdAt" && (sortOrder === "asc" ? "↑" : "↓")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTags.map((tag) => {
                    const sentiment = sentimentConfig[tag.sentiment as keyof typeof sentimentConfig] || sentimentConfig.neutral;
                    const SentimentIcon = sentiment.icon;
                    
                    return (
                      <tr 
                        key={tag.id} 
                        className="border-b hover-elevate cursor-pointer"
                        onClick={() => handleTagClick(tag)}
                        data-testid={`row-tag-${tag.id}`}
                      >
                        <td className="p-3">
                          <span className="font-medium">{tag.name}</span>
                        </td>
                        <td className="p-3">
                          {tag.theme ? (
                            <Badge variant="secondary">{tag.theme.name}</Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          <Badge className={sentiment.color}>
                            <SentimentIcon className="w-3 h-3 mr-1" />
                            {sentiment.label}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {tag.listing?.imageUrl ? (
                              <img 
                                src={tag.listing.imageUrl} 
                                alt={tag.listing.name}
                                className="w-8 h-6 rounded object-cover"
                              />
                            ) : (
                              <div className="w-8 h-6 rounded bg-muted flex items-center justify-center">
                                <Building2 className="w-3 h-3 text-muted-foreground" />
                              </div>
                            )}
                            <span className="text-sm truncate max-w-[150px]">
                              {tag.listing?.name || "—"}
                            </span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="text-sm">
                            {tag.reservation?.platform || "Airbnb"}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="text-sm text-muted-foreground">
                            {tag.createdAt ? format(new Date(tag.createdAt), "MM/dd/yy") : "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {filteredTags.length === 0 && tags.length > 0 && (
              <div className="p-12 text-center text-muted-foreground">
                No tags match your search criteria.
              </div>
            )}
          </Card>
          
          <div className="py-4 flex justify-center">
            {isFetchingNextPage && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading more tags...</span>
              </div>
            )}
            {!hasNextPage && tags.length > 0 && (
              <span className="text-sm text-muted-foreground">
                Showing {filteredTags.length} of {totalCount} tags
              </span>
            )}
            {hasNextPage && !isFetchingNextPage && (
              <span className="text-sm text-muted-foreground">
                Showing {tags.length} of {totalCount} tags
              </span>
            )}
          </div>
          </>
        )}
        
        <div ref={loadMoreRef} className="h-1" />
      </div>

      <TagDetailSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        tag={selectedTag}
      />
    </div>
  );
}
