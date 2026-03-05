import { useState } from "react";
import { X, MessageSquare, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { LifeBuoy, Lightbulb, Bug } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export function BetaBanner() {
  const [minimized, setMinimized] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<string>("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!feedbackType || !message.trim()) {
      toast({
        title: "Please complete all fields",
        description: "Select a type and enter your message",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest("POST", "/api/feedback", {
        type: feedbackType,
        message: message.trim(),
      });

      toast({
        title: "Thank you for your feedback!",
        description: "We'll review your message and get back to you if needed.",
      });

      setModalOpen(false);
      setFeedbackType("");
      setMessage("");
    } catch (error) {
      toast({
        title: "Failed to submit feedback",
        description: "Please try again later",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {!minimized ? (
        <div 
          className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm font-medium text-center"
          data-testid="beta-banner"
        >
          <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider">
            Private BETA
          </span>
          <span className="whitespace-nowrap">HostPulse is currently in private BETA.</span>
          <button
            onClick={() => setModalOpen(true)}
            className="underline underline-offset-2 hover:no-underline cursor-pointer font-semibold whitespace-nowrap"
            data-testid="button-feedback-open"
          >
            Share feedback or report issues
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-white hover:bg-white/20"
            onClick={() => setMinimized(true)}
            data-testid="button-beta-banner-dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setModalOpen(true)}
          className="fixed right-0 top-2 z-50 flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-3 py-1.5 rounded-l-lg shadow-lg hover:from-amber-600 hover:to-orange-600 transition-all"
          data-testid="button-feedback-pinned"
        >
          <Megaphone className="h-4 w-4" />
          <span className="text-sm font-medium">Feedback</span>
        </button>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md" data-testid="feedback-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Send us a message
            </DialogTitle>
            <DialogDescription>
              We'd love to hear from you! Let us know if you need support or have feedback about HostPulse.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>What would you like to share?</Label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setFeedbackType("support")}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all hover-elevate",
                    feedbackType === "support"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                  data-testid="tile-support"
                >
                  <LifeBuoy className={cn(
                    "h-6 w-6",
                    feedbackType === "support" ? "text-primary" : "text-muted-foreground"
                  )} />
                  <span className={cn(
                    "text-sm font-medium text-center",
                    feedbackType === "support" ? "text-primary" : "text-foreground"
                  )}>Support</span>
                  <span className="text-xs text-muted-foreground text-center">I need help</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFeedbackType("feedback")}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all hover-elevate",
                    feedbackType === "feedback"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                  data-testid="tile-feedback"
                >
                  <Lightbulb className={cn(
                    "h-6 w-6",
                    feedbackType === "feedback" ? "text-primary" : "text-muted-foreground"
                  )} />
                  <span className={cn(
                    "text-sm font-medium text-center",
                    feedbackType === "feedback" ? "text-primary" : "text-foreground"
                  )}>Feedback</span>
                  <span className="text-xs text-muted-foreground text-center">I have an idea</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFeedbackType("bug")}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all hover-elevate",
                    feedbackType === "bug"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                  data-testid="tile-bug"
                >
                  <Bug className={cn(
                    "h-6 w-6",
                    feedbackType === "bug" ? "text-primary" : "text-muted-foreground"
                  )} />
                  <span className={cn(
                    "text-sm font-medium text-center",
                    feedbackType === "bug" ? "text-primary" : "text-foreground"
                  )}>Bug Report</span>
                  <span className="text-xs text-muted-foreground text-center">Something's wrong</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-message">Your message</Label>
              <Textarea
                id="feedback-message"
                placeholder="Tell us what's on your mind..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[120px]"
                data-testid="input-feedback-message"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setModalOpen(false)}
                data-testid="button-feedback-cancel"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                data-testid="button-feedback-submit"
              >
                {isSubmitting ? "Sending..." : "Send Message"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
