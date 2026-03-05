import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Bell } from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface AnalysisProgressModalProps {
  isOpen: boolean;
  listingName: string;
  analysisStats?: {
    reviewCount?: number;
    conversationCount?: number;
  };
  reviewData?: unknown[];
  conversationData?: unknown[];
  insights?: string[];
  onLeaveAndNotify?: () => void;
}

/**
 * Simple analysis progress modal. No simulated timeline - use the listing detail page
 * with the staged stream for real-time progress. This component is kept for compatibility
 * and shows a single "Analyzing..." state.
 */
export function AnalysisProgressModal({
  isOpen,
  listingName,
  onLeaveAndNotify,
}: AnalysisProgressModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={true} modal>
      <DialogContent
        className="sm:max-w-md sm:w-[400px] [&>button]:hidden flex flex-col"
        style={{ maxHeight: "80vh" }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        data-testid="modal-analysis-progress"
      >
        <VisuallyHidden>
          <DialogTitle>Analyzing {listingName}</DialogTitle>
          <DialogDescription>Please wait while we analyze your listing data</DialogDescription>
        </VisuallyHidden>

        <div className="flex flex-col flex-1 min-h-0">
          <div className="text-center space-y-2 flex-shrink-0">
            <div className="w-12 h-12 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary animate-pulse" />
            </div>
            <h2 className="text-base font-semibold leading-tight" data-testid="text-analyzing-listing">
              {listingName}
            </h2>
            <p className="text-xs text-muted-foreground">
              Analyzing your listing data. For live progress, open the listing detail page.
            </p>
          </div>

          <div className="space-y-1 mt-5 flex-shrink-0">
            <Progress value={undefined} className="h-2" data-testid="progress-analysis" />
            <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1" data-testid="text-progress-percent">
              <Loader2 className="w-3 h-3 animate-spin" />
              Analyzing...
            </p>
          </div>
        </div>

        {onLeaveAndNotify && (
          <div className="pt-4 mt-2 border-t flex-shrink-0 space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={onLeaveAndNotify}
              data-testid="button-leave-notify"
            >
              <Bell className="w-4 h-4 mr-2" />
              Leave & Notify When Complete
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Navigate away and receive a notification when done
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
