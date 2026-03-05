import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ThumbsUp, ThumbsDown, Send, ArrowRight, Sparkles, Loader2, Check } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PhotoCompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalUrl: string;
  enhancedUrl: string;
  listingId: string;
  photoIndex: number;
  aiEditedPrompt?: string;
  isAlreadyPinned?: boolean;
}

export function PhotoCompareDialog({
  open,
  onOpenChange,
  originalUrl,
  enhancedUrl,
  listingId,
  photoIndex,
  aiEditedPrompt,
  isAlreadyPinned = false,
}: PhotoCompareDialogProps) {
  const { toast } = useToast();
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [isSaved, setIsSaved] = useState(false);

  const saveEditMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/listings/${listingId}/photos/${photoIndex}/save-edit`, {
        aiEditedUrl: enhancedUrl,
        aiEditedPrompt: aiEditedPrompt || "AI enhancement",
      });
      return res.json();
    },
    onSuccess: () => {
      setIsSaved(true);
      toast({
        title: "Photo saved",
        description: "AI edited photo has been pinned for action.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/listings", listingId] });
      queryClient.invalidateQueries({ queryKey: ["/api/listings", listingId, "photo-analyses"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save the edited photo. Please try again.",
        variant: "destructive",
      });
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async (data: { isPositive: boolean; feedback?: string }) => {
      const res = await apiRequest("POST", `/api/listings/${listingId}/photos/${photoIndex}/enhance-feedback`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Feedback submitted",
        description: "Thank you for your feedback!",
      });
      onOpenChange(false);
      setFeedback(null);
      setFeedbackText("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleThumbsUp = () => {
    setFeedback("up");
    feedbackMutation.mutate({ isPositive: true });
  };

  const handleThumbsDown = () => {
    setFeedback("down");
  };

  const handleSubmitNegativeFeedback = () => {
    feedbackMutation.mutate({ isPositive: false, feedback: feedbackText });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Compare Photos
          </DialogTitle>
          <DialogDescription>
            Original photo vs AI enhanced version
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6 mt-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant="secondary">Original</Badge>
            </div>
            <div className="rounded-lg overflow-hidden border bg-muted">
              <img 
                src={originalUrl} 
                alt="Original photo" 
                className="w-full h-auto object-contain max-h-[400px]"
                data-testid="compare-original-image"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Badge className="bg-purple-600">AI Enhanced</Badge>
            </div>
            <div className="rounded-lg overflow-hidden border bg-muted">
              <img 
                src={enhancedUrl} 
                alt="AI enhanced photo" 
                className="w-full h-auto object-contain max-h-[400px]"
                data-testid="compare-enhanced-image"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 mt-2 text-sm text-muted-foreground">
          <span>Original</span>
          <ArrowRight className="w-4 h-4" />
          <span className="text-purple-600 font-medium">Enhanced</span>
        </div>

        {!isAlreadyPinned && (
          <div className="flex justify-center mt-4">
            <Button
              onClick={() => saveEditMutation.mutate()}
              disabled={saveEditMutation.isPending || isSaved}
              className="bg-purple-600 hover:bg-purple-700 gap-2"
              data-testid="compare-keep-edit"
            >
              {saveEditMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isSaved ? (
                <Check className="w-4 h-4" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {isSaved ? "Saved for Action" : "Pin This Edit"}
            </Button>
          </div>
        )}

        <div className="border-t pt-4 mt-4">
          <p className="text-sm font-medium mb-3 text-center">How does the enhanced photo look?</p>
          
          {feedback === null && (
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="lg"
                onClick={handleThumbsUp}
                disabled={feedbackMutation.isPending}
                className="gap-2"
                data-testid="compare-thumbs-up"
              >
                <ThumbsUp className="w-5 h-5 text-green-600" />
                Looks Great
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={handleThumbsDown}
                disabled={feedbackMutation.isPending}
                className="gap-2"
                data-testid="compare-thumbs-down"
              >
                <ThumbsDown className="w-5 h-5 text-red-500" />
                Needs Work
              </Button>
            </div>
          )}

          {feedback === "down" && (
            <div className="space-y-3 max-w-md mx-auto">
              <p className="text-sm text-muted-foreground text-center">
                What could be improved?
              </p>
              <Textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="e.g., The colors look too saturated, lighting feels unnatural..."
                className="min-h-[80px]"
                data-testid="compare-feedback-text"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setFeedback(null)}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleSubmitNegativeFeedback}
                  disabled={feedbackMutation.isPending || !feedbackText.trim()}
                  className="flex-1 bg-purple-600 border-purple-600"
                  data-testid="compare-submit-feedback"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Submit Feedback
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
