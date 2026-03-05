import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Calendar, X, Info } from "lucide-react";
import { 
  Star, 
  TrendingUp, 
  TrendingDown, 
  Sparkles,
  MessageSquare,
  Brain,
  Lock,
  ThumbsUp,
  ThumbsDown,
  Droplets,
  MapPin,
  Key,
  Target,
  DollarSign,
  ArrowDown,
  Building2,
  ChevronDown,
  Check,
  RefreshCw,
  Minimize2
} from "lucide-react";
import { format, subMonths, subDays } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/contexts/notifications-context";
import type { Reservation, Listing, CategoryRatings } from "@shared/schema";

interface ReviewStats {
  totalReviews: number;
  averageRating: number;
  reviewRate: number;
  aiSentimentScore: number;
  totalReservations: number;
  mutualReviewsPublic: number;
  reviewReplies: number;
  periodChange: {
    totalReviews: number;
    averageRating: number;
    reviewRate: number;
    aiSentimentScore: number;
  };
  strengths: string[];
  areasToImprove: string[];
  performanceInsight: string;
  ratingDistribution: {
    rating5: number;
    rating4: number;
    rating3: number;
    rating2: number;
    rating1: number;
  };
  aiSentimentRatingDistribution: {
    rating5: number;
    rating4: number;
    rating3: number;
    rating2: number;
    rating1: number;
  };
  sentimentDistribution: {
    excellent: number;
    good: number;
    poor: number;
  };
  hasCachedSummary?: boolean;
  summaryGeneratedAt?: string;
  needsRegeneration?: boolean;
}

interface ReviewWithListing extends Reservation {
  listing?: Listing;
}

const dateRangeOptions = [
  { value: "7", label: "Last 7 Days" },
  { value: "30", label: "Last 30 Days" },
  { value: "90", label: "Last 3 Months" },
  { value: "180", label: "Last 6 Months" },
  { value: "365", label: "Last Year" },
];

function StatCard({ 
  title, 
  value, 
  change, 
  icon: Icon 
}: { 
  title: string; 
  value: string | number; 
  change?: number; 
  icon?: typeof Star;
}) {
  const testId = `stat-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-1" data-testid={`${testId}-value`}>{value}</p>
            {change !== undefined && (
              <div className={`flex items-center gap-1 mt-1 text-sm ${
                change > 0 ? "text-green-600 dark:text-green-400" : change < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
              }`}>
                {change > 0 ? <TrendingUp className="w-3 h-3" /> : change < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                <span>{change > 0 ? "+" : ""}{change}% vs. last period</span>
              </div>
            )}
          </div>
          {Icon && <Icon className="w-8 h-8 text-muted-foreground" />}
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewFunnel({ stats }: { stats: ReviewStats }) {
  const publicRate = stats.totalReviews > 0 
    ? Math.round((stats.mutualReviewsPublic / stats.totalReviews) * 100) 
    : 0;
  const replyRate = stats.mutualReviewsPublic > 0 
    ? Math.round((stats.reviewReplies / stats.mutualReviewsPublic) * 100) 
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Review rate summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center space-y-3">
          <div className="border-2 border-primary rounded-lg px-8 py-4 text-center">
            <p className="text-sm text-muted-foreground">Total Reservations</p>
            <p className="text-2xl font-bold">{stats.totalReservations}</p>
          </div>
          <ArrowDown className="w-4 h-4 text-muted-foreground" />
          <div className="border-2 border-yellow-500 rounded-lg px-8 py-4 text-center">
            <p className="text-sm text-muted-foreground">Reviews received</p>
            <p className="text-2xl font-bold">{stats.totalReviews}</p>
          </div>
          <p className="text-sm text-green-600 dark:text-green-400 font-medium">{stats.reviewRate}% review rate</p>
          <ArrowDown className="w-4 h-4 text-muted-foreground" />
          <div className="border-2 border-green-500 dark:border-green-600 rounded-lg px-8 py-4 text-center">
            <p className="text-sm text-muted-foreground">Mutual reviews public</p>
            <p className="text-2xl font-bold">{stats.mutualReviewsPublic}</p>
          </div>
          <p className="text-sm text-green-600 dark:text-green-400 font-medium">{publicRate}% public rate</p>
          <ArrowDown className="w-4 h-4 text-muted-foreground" />
          <div className="border-2 border-blue-500 dark:border-blue-600 rounded-lg px-8 py-4 text-center">
            <p className="text-sm text-muted-foreground">Review replies</p>
            <p className="text-2xl font-bold">{stats.reviewReplies}</p>
          </div>
          <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">{replyRate}% reply rate</p>
        </div>

        <div className="grid grid-cols-4 gap-4 pt-4 border-t">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Total Reservations</p>
            <p className="text-lg font-bold text-primary">{stats.totalReservations}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Review rate</p>
            <p className="text-lg font-bold text-green-600 dark:text-green-400">{stats.reviewRate}%</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Public rate</p>
            <p className="text-lg font-bold text-green-600 dark:text-green-400">{publicRate}%</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Reply rate</p>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{replyRate}%</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RatingDistributionChart({ stats }: { stats: ReviewStats }) {
  // Ratings from 5 to 1 (left to right)
  const ratings = [5, 4, 3, 2, 1];
  
  const publicDistribution = {
    5: { count: stats.ratingDistribution.rating5, color: "bg-green-500" },
    4: { count: stats.ratingDistribution.rating4, color: "bg-yellow-500" },
    3: { count: stats.ratingDistribution.rating3, color: "bg-orange-500" },
    2: { count: stats.ratingDistribution.rating2, color: "bg-red-400" },
    1: { count: stats.ratingDistribution.rating1, color: "bg-red-600" },
  };

  const aiDistribution = {
    5: { count: stats.aiSentimentRatingDistribution.rating5, color: "bg-green-500" },
    4: { count: stats.aiSentimentRatingDistribution.rating4, color: "bg-yellow-500" },
    3: { count: stats.aiSentimentRatingDistribution.rating3, color: "bg-orange-500" },
    2: { count: stats.aiSentimentRatingDistribution.rating2, color: "bg-red-400" },
    1: { count: stats.aiSentimentRatingDistribution.rating1, color: "bg-red-600" },
  };

  const publicMaxCount = Math.max(...Object.values(publicDistribution).map(d => d.count), 1);
  const publicTotal = Object.values(publicDistribution).reduce((sum, d) => sum + d.count, 0);
  
  const aiMaxCount = Math.max(...Object.values(aiDistribution).map(d => d.count), 1);
  const aiTotal = Object.values(aiDistribution).reduce((sum, d) => sum + d.count, 0);

  // Use the same max for both to keep proportions comparable
  const overallMax = Math.max(publicMaxCount, aiMaxCount);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Rating distribution</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Public Review Score label (top) */}
        <div className="flex items-center gap-2 mb-3 text-sm">
          <Star className="w-4 h-4 fill-current text-yellow-500" />
          <span className="font-medium">Public Review Score</span>
          <span className="text-muted-foreground">({publicTotal})</span>
        </div>

        {/* Mirrored bar chart */}
        <div className="flex gap-2">
          {ratings.map((rating) => {
            const publicData = publicDistribution[rating as keyof typeof publicDistribution];
            const aiData = aiDistribution[rating as keyof typeof aiDistribution];
            const publicHeight = overallMax > 0 ? (publicData.count / overallMax) * 100 : 0;
            const aiHeight = overallMax > 0 ? (aiData.count / overallMax) * 100 : 0;

            return (
              <div key={rating} className="flex-1 flex flex-col items-center">
                {/* Public review bars (grow upward) */}
                <div className="h-20 w-full flex flex-col justify-end items-center">
                  <div 
                    className={`w-full ${publicData.color} rounded-t transition-all flex items-center justify-center`}
                    style={{ height: `${publicHeight}%`, minHeight: publicData.count > 0 ? '18px' : '0' }}
                  >
                    {publicData.count > 0 && (
                      <span className="text-white text-xs font-medium">{publicData.count}</span>
                    )}
                  </div>
                </div>

                {/* Star rating row (center) */}
                <div className="py-2 flex items-center justify-center border-y border-border w-full bg-muted/30">
                  <div className="flex items-center gap-0.5">
                    <span className="text-sm font-medium">{rating}</span>
                  </div>
                </div>

                {/* AI sentiment bars (grow downward) */}
                <div className="h-20 w-full flex flex-col justify-start items-center">
                  <div 
                    className={`w-full ${aiData.color} rounded-b transition-all flex items-center justify-center`}
                    style={{ height: `${aiHeight}%`, minHeight: aiData.count > 0 ? '18px' : '0' }}
                  >
                    {aiData.count > 0 && (
                      <span className="text-white text-xs font-medium">{aiData.count}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* AI Sentiment Score label (bottom) */}
        <div className="flex items-center gap-2 mt-3 mb-3 text-sm">
          <Brain className="w-4 h-4 text-primary" />
          <span className="font-medium">AI Sentiment Score</span>
          <span className="text-muted-foreground">({aiTotal})</span>
        </div>

      </CardContent>
    </Card>
  );
}

function ReviewSummaryView({ 
  stats, 
  onGenerateSummary,
  isGenerating 
}: { 
  stats: ReviewStats; 
  onGenerateSummary: () => void;
  isGenerating: boolean;
}) {
  const needsSummary = !stats.hasCachedSummary || stats.needsRegeneration;
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-lg">Reviews Summary</CardTitle>
          <div className="flex flex-col items-end gap-1">
            {stats.hasCachedSummary && stats.summaryGeneratedAt && (
              <span className="text-xs text-muted-foreground">
                Last run: {format(new Date(stats.summaryGeneratedAt), "MMM d, yyyy 'at' h:mm a")}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onGenerateSummary}
              disabled={isGenerating}
              data-testid="button-generate-summary"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {stats.hasCachedSummary ? "Re-Create AI Summary" : "Create AI Summary of Filter Selected Reviews"}
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {needsSummary && !stats.performanceInsight && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {stats.hasCachedSummary && stats.needsRegeneration
                  ? "This property combination doesn't have a combined summary yet. Click 'Generate Summary' to create AI-powered insights."
                  : "No AI summary available for this selection. Click 'Generate Summary' to analyze reviews and generate performance insights, strengths, and areas to improve."}
              </p>
            </div>
          )}
          <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="font-medium">Performance insights</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {stats.performanceInsight || "No performance insights available yet. Generate a summary to get AI-powered insights."}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <h4 className="font-medium text-green-700 dark:text-green-400 mb-3 flex items-center gap-2">
                <ThumbsUp className="w-4 h-4" />
                Strengths
              </h4>
              {stats.strengths.length > 0 ? (
                <ul className="space-y-2">
                  {stats.strengths.map((strength, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-green-600">•</span>
                      {strength}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No strengths identified yet.</p>
              )}
            </div>

            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
              <h4 className="font-medium text-red-700 dark:text-red-400 mb-3 flex items-center gap-2">
                <ThumbsDown className="w-4 h-4" />
                Areas to improve
              </h4>
              {stats.areasToImprove.length > 0 ? (
                <ul className="space-y-2">
                  {stats.areasToImprove.map((area, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-red-600">•</span>
                      {area}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No areas to improve identified yet.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <ReviewFunnel stats={stats} />
        <RatingDistributionChart stats={stats} />
      </div>
    </div>
  );
}

function ReviewCard({ 
  review, 
  onClick 
}: { 
  review: ReviewWithListing; 
  onClick: () => void;
}) {
  const initials = review.guestName
    ?.split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "G";

  // Determine sentiment color based on score
  const getSentimentColor = (score: number | null) => {
    if (!score) return "bg-muted/50";
    if (score >= 4) return "bg-green-500/10 border-green-500/30";
    if (score >= 3) return "bg-yellow-500/10 border-yellow-500/30";
    return "bg-red-500/10 border-red-500/30";
  };

  return (
    <Card 
      className="hover-elevate cursor-pointer"
      onClick={onClick}
      data-testid={`review-card-${review.id}`}
    >
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              {review.guestProfilePicture && (
                <AvatarImage src={review.guestProfilePicture} alt={review.guestName || "Guest"} />
              )}
              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{review.guestName || "Guest"}</span>
                <Badge variant="secondary" className="text-xs">{review.platform}</Badge>
                <span className="text-sm text-primary font-mono">{review.confirmationCode || review.externalId}</span>
                {review.guestRating ? (
                  <Badge className="bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30">
                    <Star className="w-3 h-3 fill-current mr-1" />
                    {review.guestRating}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">
                    No guest rating
                  </Badge>
                )}
                {review.aiSentimentScore !== null && review.aiSentimentScore !== undefined && (
                  <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                    <Sparkles className="w-3 h-3 mr-1" />
                    {review.aiSentimentScore.toFixed(1)}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {review.checkOutDate ? format(new Date(review.checkOutDate), "MM/dd/yy") : "—"}
          </span>
        </div>

        {review.aiGuestSummary && (
          <div className={`mt-3 p-3 rounded-lg border ${getSentimentColor(review.aiSentimentScore)}`}>
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-sm">
                {review.aiGuestSummary}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewDetailSheet({ 
  review, 
  open, 
  onOpenChange 
}: { 
  review: ReviewWithListing | null; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  if (!review) return null;

  const initials = review.guestName
    ?.split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "G";

  const categoryRatings = review.categoryRatings as CategoryRatings | undefined;

  const categories = [
    { key: "cleanliness", label: "Cleanliness", icon: "🧹", value: categoryRatings?.cleanliness, comment: categoryRatings?.cleanlinessComment },
    { key: "communication", label: "Communication", icon: "💬", value: categoryRatings?.communication, comment: categoryRatings?.communicationComment },
    { key: "location", label: "Location", icon: "📍", value: categoryRatings?.location, comment: categoryRatings?.locationComment },
    { key: "checkIn", label: "Check-in", icon: "🔑", value: categoryRatings?.checkIn, comment: categoryRatings?.checkInComment },
    { key: "accuracy", label: "Accuracy", icon: "📋", value: categoryRatings?.accuracy, comment: categoryRatings?.accuracyComment },
    { key: "value", label: "Value", icon: "💰", value: categoryRatings?.value, comment: categoryRatings?.valueComment },
  ];

  // Get progress bar color based on score
  const getProgressColor = (score: number | null | undefined) => {
    if (!score) return "bg-muted";
    if (score >= 4) return "bg-emerald-500";
    if (score >= 3) return "bg-yellow-500";
    return "bg-red-500";
  };

  const isAirbnb = review.platform?.toLowerCase() === "airbnb";
  const hasAnyScore = review.aiPublicReviewScore != null || review.aiPrivateRemarksScore != null || review.aiConversationScore != null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[450px] sm:max-w-[450px] overflow-y-auto">
        {/* Header with guest info */}
        <SheetHeader className="border-b pb-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 border-2 border-primary/20">
              {review.guestProfilePicture && (
                <AvatarImage src={review.guestProfilePicture} alt={review.guestName || "Guest"} />
              )}
              <AvatarFallback className="bg-primary/10 text-primary font-medium text-lg">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <SheetTitle className="flex items-center gap-2 flex-wrap">
                {review.guestName || "Guest"}
                <Badge variant="secondary" className="text-xs">{review.platform}</Badge>
              </SheetTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                <span className="font-mono text-primary">{review.confirmationCode || review.externalId}</span>
                {review.checkInDate && review.checkOutDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(review.checkInDate), "MM/dd/yy")} - {format(new Date(review.checkOutDate), "MM/dd/yy")}
                  </span>
                )}
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute top-4 right-4"
              onClick={() => onOpenChange(false)}
              data-testid="button-close-sheet"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="py-6 space-y-6">
          {/* Guest Rating & AI Sentiment Score - Side by Side */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-muted/30 border-muted">
              <CardContent className="pt-4 text-center">
                <div className="flex justify-center mb-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star 
                      key={star} 
                      className={`w-4 h-4 ${
                        (review.guestRating || 0) >= star 
                          ? "fill-yellow-400 text-yellow-400" 
                          : "text-muted-foreground/30"
                      }`} 
                    />
                  ))}
                </div>
                <p className="text-3xl font-bold text-emerald-500">{review.guestRating || "—"}</p>
                <p className="text-xs text-muted-foreground">Guest rating</p>
              </CardContent>
            </Card>
            <Card className="bg-primary/10 border-primary/30">
              <CardContent className="pt-4 text-center">
                <Sparkles className="w-5 h-5 mx-auto mb-2 text-primary" />
                <p className="text-3xl font-bold text-primary">
                  {review.aiSentimentScore != null 
                    ? review.aiSentimentScore.toFixed(0) 
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">AI sentiment score</p>
              </CardContent>
            </Card>
          </div>

          {/* AI Sentiment Analysis - Always show all three with progress bars */}
          <div className="space-y-4">
            <h4 className="font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              AI Sentiment Analysis
            </h4>
            <div className="space-y-4">
              {/* Public Review */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Public review</span>
                  <span className="font-semibold">
                    {review.aiPublicReviewScore != null ? `${review.aiPublicReviewScore}/5` : "—"}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getProgressColor(review.aiPublicReviewScore)} transition-all`}
                    style={{ width: `${(review.aiPublicReviewScore || 0) * 20}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Analysis of review comment</p>
              </div>
              
              {/* Private Remarks */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Private remarks</span>
                  <span className="font-semibold">
                    {review.aiPrivateRemarksScore != null ? `${review.aiPrivateRemarksScore}/5` : "—"}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getProgressColor(review.aiPrivateRemarksScore)} transition-all`}
                    style={{ width: `${(review.aiPrivateRemarksScore || 0) * 20}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Internal notes and feedback</p>
              </div>
              
              {/* Conversation */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Conversation</span>
                  <span className="font-semibold">
                    {review.aiConversationScore != null ? `${review.aiConversationScore}/5` : "—"}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getProgressColor(review.aiConversationScore)} transition-all`}
                    style={{ width: `${(review.aiConversationScore || 0) * 20}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Message exchanges with guest</p>
              </div>
            </div>
          </div>

          {/* AI Guest Summary - Always show */}
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              AI Guest summary
            </h4>
            <div className="bg-primary/5 p-4 rounded-lg border border-primary/20">
              <p className="text-sm">
                {review.aiGuestSummary || "No summary provided"}
              </p>
            </div>
          </div>

          {/* AI Public Review - Always show */}
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <Star className="w-4 h-4" />
              AI Public review
            </h4>
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm">
                {review.publicReview || "No public review provided"}
              </p>
            </div>
          </div>

          {/* Private Remarks - Always show */}
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Private remarks
            </h4>
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm">
                {review.privateRemarks || "No summary provided"}
              </p>
            </div>
          </div>

          {/* Category Ratings - Airbnb only */}
          {isAirbnb && (
            <TooltipProvider>
              <div className="space-y-3">
                <h4 className="font-medium">Category rating</h4>
                <div className="grid grid-cols-3 gap-3">
                  {categories.map(({ key, label, icon, value, comment }) => (
                    <Tooltip key={key}>
                      <TooltipTrigger asChild>
                        <Card className={`bg-muted/30 ${comment ? 'cursor-pointer' : ''}`} data-testid={`category-${key}`}>
                          <CardContent className="p-3 text-center relative">
                            <span className="text-lg block mb-1">{icon}</span>
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <div className="flex items-center justify-center gap-1 text-yellow-500">
                              <Star className="w-3 h-3 fill-current" />
                              <span className="font-medium">{value ?? "—"}</span>
                            </div>
                            {comment && (
                              <Info className="w-3 h-3 absolute top-2 right-2 text-primary" />
                            )}
                          </CardContent>
                        </Card>
                      </TooltipTrigger>
                      {comment && (
                        <TooltipContent side="top" className="max-w-[250px]">
                          <p className="text-sm">{comment}</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  ))}
                </div>
              </div>
            </TooltipProvider>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function ReviewsPage() {
  const [dateRange, setDateRange] = useState("90");
  const [activeTab, setActiveTab] = useState<string>("summary");
  const [selectedReview, setSelectedReview] = useState<ReviewWithListing | null>(null);
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([]);
  const [propertyFilterOpen, setPropertyFilterOpen] = useState(false);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [analysisMinimized, setAnalysisMinimized] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const { toast } = useToast();
  const { addNotification, backgroundSentimentInProgress, clearBackgroundSentiment } = useNotifications();

  const { data: listings = [] } = useQuery<Listing[]>({
    queryKey: ["/api/listings"],
  });

  const listingIdsParam = selectedListingIds.length > 0 ? selectedListingIds.join(",") : "";

  const pendingAnalysisUrl = listingIdsParam 
    ? `/api/reviews/pending-analysis-count?listingIds=${listingIdsParam}` 
    : "/api/reviews/pending-analysis-count";
  
  const { data: pendingAnalysis } = useQuery<{
    pending: number;
    total: number;
    analyzed: number;
    totalReservations: number;
    tagsProcessed: number;
  }>({
    queryKey: ["/api/reviews/pending-analysis-count", listingIdsParam],
    queryFn: async () => {
      const res = await fetch(pendingAnalysisUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pending count");
      return res.json();
    },
    refetchInterval: backgroundSentimentInProgress ? 5000 : false, // Poll while sentiment is running
  });

  // Clear background sentiment indicator when pending count drops to 0 (and tags have been processed)
  useEffect(() => {
    if (backgroundSentimentInProgress && pendingAnalysis?.pending === 0 && (pendingAnalysis?.total ?? 0) > 0) {
      clearBackgroundSentiment();
      queryClient.invalidateQueries({ queryKey: ["/api/reviews/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
    }
  }, [backgroundSentimentInProgress, pendingAnalysis?.pending, pendingAnalysis?.total, clearBackgroundSentiment]);

  const analyzeSentimentMutation = useMutation({
    mutationFn: async () => {
      setAnalysisProgress(10);
      const result = await apiRequest("POST", "/api/reviews/analyze-sentiment", {
        listingIds: selectedListingIds.length > 0 ? selectedListingIds : undefined,
      });
      return result.json();
    },
    onMutate: () => {
      setAnalysisModalOpen(true);
      setAnalysisMinimized(false);
      setAnalysisProgress(20);
    },
    onSuccess: (data: { analyzed: number; total: number }) => {
      setAnalysisProgress(100);
      setTimeout(() => {
        setAnalysisModalOpen(false);
        setAnalysisProgress(0);
        queryClient.invalidateQueries({ queryKey: ["/api/reviews/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
        queryClient.invalidateQueries({ queryKey: ["/api/reviews/pending-analysis-count"] });
        
        if (analysisMinimized) {
          addNotification({
            title: "Review Analysis Complete",
            message: `Analyzed ${data.analyzed} of ${data.total} reservations`,
            type: "analysis_complete",
          });
        } else {
          toast({ 
            title: "Analysis Complete", 
            description: `Analyzed ${data.analyzed} of ${data.total} reservations` 
          });
        }
      }, 500);
    },
    onError: () => {
      setAnalysisProgress(0);
      setAnalysisModalOpen(false);
      toast({ title: "Analysis failed", variant: "destructive" });
    },
  });

  const minimizeAnalysis = () => {
    setAnalysisMinimized(true);
    setAnalysisModalOpen(false);
    toast({
      title: "Analysis Running",
      description: "You'll be notified when complete",
    });
  };

  const { data: stats, isLoading: statsLoading } = useQuery<ReviewStats>({
    queryKey: ["/api/reviews/stats", dateRange, listingIdsParam],
  });

  const { data: reviews = [], isLoading: reviewsLoading } = useQuery<ReviewWithListing[]>({
    queryKey: ["/api/reviews", dateRange, listingIdsParam],
    enabled: activeTab === "individual",
  });

  const generateSummaryMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/reviews/generate-summary", {
        listingIds: selectedListingIds.length > 0 ? selectedListingIds : listings.map(l => l.id),
        days: parseInt(dateRange),
      });
    },
    onSuccess: () => {
      toast({ title: "Summary generated successfully" });
      // Invalidate stats with exact key parameters to ensure UI refresh
      queryClient.invalidateQueries({ queryKey: ["/api/reviews/stats", dateRange, listingIdsParam] });
    },
    onError: () => {
      toast({ title: "Failed to generate summary", variant: "destructive" });
    },
  });

  const toggleListing = (listingId: string) => {
    setSelectedListingIds(prev =>
      prev.includes(listingId)
        ? prev.filter(id => id !== listingId)
        : [...prev, listingId]
    );
  };

  const clearPropertyFilter = () => {
    setSelectedListingIds([]);
  };

  const selectedListingsLabel = selectedListingIds.length === 0
    ? "All Properties"
    : selectedListingIds.length === 1
      ? listings.find(l => l.id === selectedListingIds[0])?.name || "1 Property"
      : `${selectedListingIds.length} Properties`;

  const defaultStats: ReviewStats = {
    totalReviews: 0,
    averageRating: 0,
    reviewRate: 0,
    aiSentimentScore: 0,
    totalReservations: 0,
    mutualReviewsPublic: 0,
    reviewReplies: 0,
    periodChange: { totalReviews: 0, averageRating: 0, reviewRate: 0, aiSentimentScore: 0 },
    strengths: [],
    areasToImprove: [],
    performanceInsight: "",
    ratingDistribution: { rating5: 0, rating4: 0, rating3: 0, rating2: 0, rating1: 0 },
    aiSentimentRatingDistribution: { rating5: 0, rating4: 0, rating3: 0, rating2: 0, rating1: 0 },
    sentimentDistribution: { excellent: 0, good: 0, poor: 0 },
  };

  const displayStats = stats || defaultStats;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="w-full space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm text-muted-foreground">Reviews</p>
            <h1 className="text-2xl font-bold">Reviews Analysis</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Popover open={propertyFilterOpen} onOpenChange={setPropertyFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="min-w-[180px] justify-between"
                  data-testid="button-property-filter"
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    <span className="truncate max-w-[120px]">{selectedListingsLabel}</span>
                  </div>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="end">
                <Command>
                  <CommandInput placeholder="Search properties..." />
                  <CommandList>
                    <CommandEmpty>No properties found.</CommandEmpty>
                    <CommandGroup>
                      {listings.length > 0 && (
                        <CommandItem
                          onSelect={clearPropertyFilter}
                          className="flex items-center gap-2"
                        >
                          <div className={`flex h-4 w-4 items-center justify-center rounded border ${
                            selectedListingIds.length === 0 ? "bg-primary border-primary" : "border-muted-foreground"
                          }`}>
                            {selectedListingIds.length === 0 && <Check className="h-3 w-3 text-primary-foreground" />}
                          </div>
                          <span>All Properties</span>
                        </CommandItem>
                      )}
                      {listings.map((listing) => (
                        <CommandItem
                          key={listing.id}
                          onSelect={() => toggleListing(listing.id)}
                          className="flex items-center gap-2"
                        >
                          <div className={`flex h-4 w-4 items-center justify-center rounded border ${
                            selectedListingIds.includes(listing.id) ? "bg-primary border-primary" : "border-muted-foreground"
                          }`}>
                            {selectedListingIds.includes(listing.id) && <Check className="h-3 w-3 text-primary-foreground" />}
                          </div>
                          <span className="truncate">{listing.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-40" data-testid="select-date-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dateRangeOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {backgroundSentimentInProgress ? (
              <div 
                className="relative overflow-hidden inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/25"
                data-testid="button-analyze-reviews"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                <Sparkles className="w-4 h-4 animate-spin" style={{ animationDuration: '3s' }} />
                <span className="relative">
                  {pendingAnalysis
                    ? <>AI Scoring {pendingAnalysis.analyzed}/{pendingAnalysis.totalReservations}</>
                    : <>AI Analysis Running</>
                  }
                </span>
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            ) : (
              <Button
                onClick={() => analyzeSentimentMutation.mutate()}
                disabled={analyzeSentimentMutation.isPending || (pendingAnalysis?.pending === 0)}
                data-testid="button-analyze-reviews"
              >
                <Brain className="w-4 h-4 mr-2" />
                Analyze Reviews
                {pendingAnalysis && pendingAnalysis.pending > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {pendingAnalysis.pending}
                  </Badge>
                )}
              </Button>
            )}
          </div>
        </div>

        {statsLoading ? (
          <div className="grid md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-4 gap-4">
            <StatCard
              title="Total Reviews"
              value={displayStats.totalReviews}
              change={displayStats.periodChange.totalReviews}
            />
            <StatCard
              title="Average Rating"
              value={displayStats.averageRating.toFixed(1)}
              change={displayStats.periodChange.averageRating}
            />
            <StatCard
              title="Review rate"
              value={`${displayStats.reviewRate}%`}
              change={displayStats.periodChange.reviewRate}
            />
            <StatCard
              title="AI Sentiment Score"
              value={displayStats.aiSentimentScore.toFixed(1)}
              change={displayStats.periodChange.aiSentimentScore}
            />
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Reviews analysis</h2>
            <TabsList className="grid w-auto grid-cols-2" data-testid="reviews-tabs">
              <TabsTrigger 
                value="summary" 
                className="px-6"
                data-testid="tab-summary"
              >
                Summary
              </TabsTrigger>
              <TabsTrigger 
                value="individual" 
                className="px-6"
                data-testid="tab-individual"
              >
                Individual Reviews
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="summary" className="mt-0">
            <ReviewSummaryView 
              stats={displayStats} 
              onGenerateSummary={() => generateSummaryMutation.mutate()}
              isGenerating={generateSummaryMutation.isPending}
            />
          </TabsContent>

          <TabsContent value="individual" className="mt-0">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">AI Reviews Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  {reviewsLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-24" />
                      ))}
                    </div>
                  ) : reviews.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Star className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No reviews found for the selected period.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {reviews.map(review => (
                        <ReviewCard 
                          key={review.id} 
                          review={review} 
                          onClick={() => setSelectedReview(review)}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <ReviewDetailSheet
          review={selectedReview}
          open={!!selectedReview}
          onOpenChange={(open) => !open && setSelectedReview(null)}
        />

        <Dialog open={analysisModalOpen} onOpenChange={setAnalysisModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-primary" />
                Analyzing Reviews
              </DialogTitle>
              <DialogDescription>
                AI is analyzing guest conversations, reviews, and feedback to generate sentiment scores.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{analysisProgress}%</span>
                </div>
                <Progress value={analysisProgress} className="h-2" />
              </div>
              <p className="text-sm text-muted-foreground">
                {pendingAnalysis?.pending || 0} reservations pending analysis...
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={minimizeAnalysis}
                data-testid="button-minimize-analysis"
              >
                <Minimize2 className="w-4 h-4 mr-2" />
                Minimize
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
