import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, GitCompare, Pin, ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { PhotoCompareDialog } from "./photo-compare-dialog";

interface PinnedPhotoViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  photoIndex: number;
  originalUrl: string;
  enhancedUrl: string;
  prompt?: string;
}

export function PinnedPhotoViewer({
  open,
  onOpenChange,
  listingId,
  photoIndex,
  originalUrl,
  enhancedUrl,
  prompt,
}: PinnedPhotoViewerProps) {
  const { toast } = useToast();
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = enhancedUrl;
    link.download = `enhanced-photo-${photoIndex + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({
      title: "Downloaded!",
      description: "Enhanced photo saved to your downloads.",
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-emerald-500" />
            Pinned Photo
          </SheetTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
              <Pin className="w-3 h-3 mr-1" />
              Saved Enhancement
            </Badge>
            <span>Photo {photoIndex + 1}</span>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Original</p>
              <div className="relative rounded-lg overflow-hidden border">
                <img 
                  src={originalUrl} 
                  alt="Original Photo" 
                  className="w-full h-auto object-cover aspect-[4/3]"
                  data-testid="pinned-viewer-original"
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-emerald-600">Enhanced</p>
              <div className="relative rounded-lg overflow-hidden border border-emerald-500/50">
                <img 
                  src={enhancedUrl} 
                  alt="Enhanced Photo" 
                  className="w-full h-auto object-cover aspect-[4/3]"
                  data-testid="pinned-viewer-enhanced"
                />
                <div className="absolute top-2 right-2">
                  <Badge className="bg-emerald-600">
                    <Pin className="w-3 h-3 mr-1" />
                    Pinned
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {prompt && (
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-xs font-medium text-muted-foreground mb-1">Enhancement prompt used:</p>
              <p className="text-sm">{prompt}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Button 
              variant="outline"
              className="flex-1"
              onClick={() => setCompareDialogOpen(true)}
              data-testid="pinned-viewer-compare"
            >
              <GitCompare className="w-4 h-4 mr-2" />
              Compare
            </Button>
            <Button 
              className="flex-1 bg-emerald-600 border-emerald-600"
              onClick={handleDownload}
              data-testid="pinned-viewer-download"
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
        </div>

        <PhotoCompareDialog
          open={compareDialogOpen}
          onOpenChange={setCompareDialogOpen}
          originalUrl={originalUrl}
          enhancedUrl={enhancedUrl}
          listingId={listingId}
          photoIndex={photoIndex}
          aiEditedPrompt={prompt}
          isAlreadyPinned={true}
        />
      </SheetContent>
    </Sheet>
  );
}
