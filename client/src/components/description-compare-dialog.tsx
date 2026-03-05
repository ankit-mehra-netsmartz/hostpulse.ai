import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ThumbsUp, ThumbsDown, Send, X, Copy, Check } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface GeneratedDescription {
  aboutThisSpace?: { content: string; charCount: number };
  theSpace?: { content: string; charCount: number };
  keySellingPoints?: string[];
}

interface DescriptionCompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDescription: string;
  generatedDescription: GeneratedDescription;
  listingId: string;
}

export function DescriptionCompareDialog({
  open,
  onOpenChange,
  currentDescription,
  generatedDescription,
  listingId,
}: DescriptionCompareDialogProps) {
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const { toast } = useToast();

  const suggestedContent = [
    generatedDescription.aboutThisSpace?.content,
    generatedDescription.theSpace?.content,
  ].filter(Boolean).join("\n\n");

  const feedbackMutation = useMutation({
    mutationFn: async (data: { rating: "up" | "down"; feedback?: string }) => {
      const res = await apiRequest("POST", `/api/listings/${listingId}/description-feedback`, data);
      return res.json();
    },
    onSuccess: () => {
      setFeedbackSubmitted(true);
      toast({
        title: "Thank you for your feedback!",
        description: "Your input helps us improve our AI suggestions.",
      });
    },
    onError: () => {
      toast({
        title: "Feedback could not be submitted",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleThumbsUp = () => {
    setFeedback("up");
    feedbackMutation.mutate({ rating: "up" });
  };

  const handleThumbsDown = () => {
    setFeedback("down");
  };

  const handleSubmitFeedback = () => {
    if (feedbackText.trim()) {
      feedbackMutation.mutate({ rating: "down", feedback: feedbackText });
    }
  };

  const handleCopy = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    toast({ title: "Copied!", description: `${section} copied to clipboard.` });
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const handleClose = () => {
    setFeedback(null);
    setFeedbackText("");
    setFeedbackSubmitted(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Compare Descriptions
            <Badge variant="secondary" className="bg-purple-500/10 text-purple-600">
              AI Generated
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-sm">Current Description</h3>
              <Badge variant="outline" className="text-xs">
                {currentDescription.length} chars
              </Badge>
            </div>
            <ScrollArea className="flex-1 border rounded-lg p-4 bg-muted/30">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {currentDescription || "No description available"}
              </p>
            </ScrollArea>
          </div>

          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-sm">AI Suggested Description</h3>
              <Badge variant="outline" className="text-xs">
                {suggestedContent.length} chars
              </Badge>
            </div>
            <ScrollArea className="flex-1 border rounded-lg p-4 bg-purple-500/5 border-purple-500/20">
              <div className="space-y-4">
                {generatedDescription.aboutThisSpace && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-purple-600">About This Space</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleCopy(generatedDescription.aboutThisSpace!.content, "About This Space")}
                        data-testid="button-copy-about-compare"
                      >
                        {copiedSection === "About This Space" ? (
                          <Check className="w-3 h-3 text-green-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {generatedDescription.aboutThisSpace.content}
                    </p>
                  </div>
                )}
                {generatedDescription.theSpace && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-purple-600">The Space</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleCopy(generatedDescription.theSpace!.content, "The Space")}
                        data-testid="button-copy-space-compare"
                      >
                        {copiedSection === "The Space" ? (
                          <Check className="w-3 h-3 text-green-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {generatedDescription.theSpace.content}
                    </p>
                  </div>
                )}
                {generatedDescription.keySellingPoints && generatedDescription.keySellingPoints.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-purple-600 block mb-2">Key Selling Points</span>
                    <div className="flex flex-wrap gap-1">
                      {generatedDescription.keySellingPoints.map((point, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {point}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="border-t pt-4 mt-4">
          {!feedbackSubmitted ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Was this suggestion helpful?</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant={feedback === "up" ? "default" : "outline"}
                    size="sm"
                    onClick={handleThumbsUp}
                    disabled={feedbackMutation.isPending}
                    className={feedback === "up" ? "bg-green-600 hover:bg-green-700" : ""}
                    data-testid="button-thumbs-up"
                  >
                    <ThumbsUp className="w-4 h-4 mr-1" />
                    Helpful
                  </Button>
                  <Button
                    variant={feedback === "down" ? "default" : "outline"}
                    size="sm"
                    onClick={handleThumbsDown}
                    disabled={feedbackMutation.isPending}
                    className={feedback === "down" ? "bg-red-600 hover:bg-red-700" : ""}
                    data-testid="button-thumbs-down"
                  >
                    <ThumbsDown className="w-4 h-4 mr-1" />
                    Not Helpful
                  </Button>
                </div>
              </div>

              {feedback === "down" && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                  <label className="text-sm font-medium">What could be improved?</label>
                  <Textarea
                    placeholder="Tell us why this suggestion wasn't helpful..."
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    className="min-h-[80px]"
                    data-testid="textarea-feedback"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFeedback(null)}
                      data-testid="button-cancel-feedback"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSubmitFeedback}
                      disabled={!feedbackText.trim() || feedbackMutation.isPending}
                      data-testid="button-submit-feedback"
                    >
                      <Send className="w-4 h-4 mr-1" />
                      Submit Feedback
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-2 text-sm text-muted-foreground">
              <Check className="w-4 h-4 mr-2 text-green-500" />
              Thank you for your feedback!
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
