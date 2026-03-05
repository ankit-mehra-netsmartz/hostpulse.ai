import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Sparkles, Loader2, Wand2, RefreshCw, Info, Download, ImageIcon, ArrowRight, GitCompare, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PhotoCompareDialog } from "./photo-compare-dialog";

interface PhotoEnhanceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  photoIndex: number;
  photoUrl: string;
  recommendation?: string | null;
}

export function PhotoEnhanceSheet({
  open,
  onOpenChange,
  listingId,
  photoIndex,
  photoUrl,
  recommendation,
}: PhotoEnhanceSheetProps) {
  const { toast } = useToast();
  const prevPhotoIndexRef = useRef(photoIndex);
  
  const [editPrompt, setEditPrompt] = useState("");
  const [suggestedImprovements, setSuggestedImprovements] = useState<string[]>([]);
  const [hasFetchedSuggestions, setHasFetchedSuggestions] = useState(false);
  const [editResult, setEditResult] = useState<{
    enhancedPrompt?: string;
    editApplied?: string;
    editedUrl?: string | null;
  } | null>(null);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);

  useEffect(() => {
    if (prevPhotoIndexRef.current !== photoIndex) {
      prevPhotoIndexRef.current = photoIndex;
      setEditPrompt("");
      setSuggestedImprovements([]);
      setHasFetchedSuggestions(false);
      setEditResult(null);
      setCompareDialogOpen(false);
    }
  }, [photoIndex]);

  const suggestEditMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/listings/${listingId}/photos/${photoIndex}/suggest-edit`);
      return res.json();
    },
    onSuccess: (data) => {
      setEditPrompt(data.suggestedPrompt || "");
      setSuggestedImprovements(data.improvements || []);
      setHasFetchedSuggestions(true);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate edit suggestion. Please try again.",
        variant: "destructive",
      });
    },
  });

  const generateEditMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/listings/${listingId}/photos/${photoIndex}/edit`, {
        prompt: editPrompt,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setEditResult(data);
      toast({
        title: "Enhancement Complete",
        description: data.editedUrl ? "Your enhanced photo is ready!" : "Enhancement prompt created.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate photo enhancement. Please try again.",
        variant: "destructive",
      });
    },
  });

  const saveEditMutation = useMutation({
    mutationFn: async (editedUrl: string) => {
      const res = await apiRequest("POST", `/api/listings/${listingId}/photos/${photoIndex}/save-edit`, {
        aiEditedUrl: editedUrl,
        aiEditedPrompt: editPrompt,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings", listingId, "photo-analyses"] });
      toast({
        title: "Saved!",
        description: "AI edited photo saved to your collection.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save the edited photo. Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (open && !hasFetchedSuggestions && !suggestEditMutation.isPending) {
      suggestEditMutation.mutate();
    }
  }, [open, hasFetchedSuggestions, suggestEditMutation.isPending]);

  const isWorking = suggestEditMutation.isPending || generateEditMutation.isPending || saveEditMutation.isPending;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isWorking) {
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-4xl overflow-y-auto" onPointerDownOutside={(e) => { if (isWorking) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (isWorking) e.preventDefault(); }}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-purple-500" />
            AI Photo Enhancement
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-purple-500/10 text-purple-600 border-purple-500/30">
              Nano Banana Pro
            </Badge>
            <span>Powered by Gemini AI</span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-4">
            <div className="relative rounded-lg overflow-hidden bg-muted border">
              <img 
                src={photoUrl} 
                alt={`Original Photo ${photoIndex + 1}`}
                className="w-full h-auto object-cover max-h-[250px]"
                data-testid="enhance-original-image"
              />
              <div className="absolute bottom-2 left-2">
                <Badge variant="secondary" className="bg-black/70 text-white border-0">
                  Original • Photo {photoIndex + 1}
                </Badge>
              </div>
            </div>
          </div>

          {recommendation && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">
                AI Analysis Recommendation:
              </p>
              <p className="text-sm text-muted-foreground">{recommendation}</p>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
            <Sparkles className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              AI generates an enhanced version of your photo using Nano Banana Pro. Improvements like lighting balance, color temperature, and atmosphere enhancements are applied while keeping the same room, furniture, and layout.
            </p>
          </div>

          {suggestEditMutation.isPending ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
              <span className="text-sm text-muted-foreground">Generating suggestions...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {suggestedImprovements.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Suggested improvements:</p>
                  <div className="flex flex-wrap gap-1">
                    {suggestedImprovements.map((improvement, i) => (
                      <Badge key={i} variant="secondary" className="text-xs bg-purple-500/10 text-purple-600">
                        {improvement}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Edit prompt (customize as needed):</p>
                <Textarea
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  placeholder="Describe the enhancements you want to apply..."
                  className="min-h-[100px] text-sm"
                  data-testid="enhance-textarea-prompt"
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={() => generateEditMutation.mutate()}
                  disabled={!editPrompt.trim() || generateEditMutation.isPending}
                  className="flex-1 bg-purple-600 border-purple-600"
                  data-testid="enhance-button-apply"
                >
                  {generateEditMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating Image...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Apply Enhancement
                    </>
                  )}
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(editPrompt);
                    toast({
                      title: "Copied!",
                      description: "Edit prompt copied to clipboard.",
                    });
                  }}
                  disabled={!editPrompt.trim()}
                  data-testid="enhance-button-copy"
                >
                  Copy
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => suggestEditMutation.mutate()}
                  disabled={suggestEditMutation.isPending}
                  size="icon"
                  data-testid="enhance-button-refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${suggestEditMutation.isPending ? "animate-spin" : ""}`} />
                </Button>
              </div>
              
              {editResult && (
                <Card className="border-purple-500/30 bg-purple-500/5">
                  <CardContent className="pt-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-500" />
                      <h4 className="text-sm font-medium">Enhancement Result</h4>
                      {editResult.editedUrl && (
                        <Badge className="bg-green-500/20 text-green-600 border-green-500/30">
                          Image Generated
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {editResult.editApplied}
                    </p>
                    
                    {editResult.editedUrl && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>Original</span>
                          <ArrowRight className="w-4 h-4" />
                          <span className="text-purple-600 font-medium">Enhanced</span>
                        </div>
                        <div className="relative rounded-lg overflow-hidden border">
                          <img 
                            src={editResult.editedUrl} 
                            alt="AI Enhanced Photo" 
                            className="w-full h-auto"
                            data-testid="enhance-img-result"
                          />
                          <div className="absolute top-2 left-2">
                            <Badge className="bg-purple-600">
                              <ImageIcon className="w-3 h-3 mr-1" />
                              AI Enhanced
                            </Badge>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button 
                            variant="outline"
                            className="flex-1 min-w-[120px]"
                            onClick={() => setCompareDialogOpen(true)}
                            data-testid="enhance-button-compare"
                          >
                            <GitCompare className="w-4 h-4 mr-2" />
                            Compare
                          </Button>
                          <Button 
                            variant="outline"
                            className="flex-1 min-w-[120px]"
                            onClick={() => {
                              const link = document.createElement('a');
                              link.href = editResult.editedUrl!;
                              link.download = `enhanced-photo-${photoIndex + 1}.png`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              toast({
                                title: "Downloaded!",
                                description: "Enhanced photo saved to your downloads.",
                              });
                            }}
                            data-testid="enhance-button-download"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download
                          </Button>
                          <Button 
                            className="w-full bg-emerald-600 border-emerald-600"
                            onClick={() => saveEditMutation.mutate(editResult.editedUrl!)}
                            disabled={saveEditMutation.isPending}
                            data-testid="enhance-button-save"
                          >
                            {saveEditMutation.isPending ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4 mr-2" />
                            )}
                            Keep This Edit
                          </Button>
                        </div>
                      </div>
                    )}
                    
                    {!editResult.editedUrl && editResult.enhancedPrompt && (
                      <div className="p-3 rounded bg-muted/50 border">
                        <div className="flex items-start gap-2 mb-2">
                          <Info className="w-4 h-4 text-amber-500 mt-0.5" />
                          <p className="text-xs text-muted-foreground">
                            Image generation is temporarily unavailable. Copy the prompt below to use with external AI tools.
                          </p>
                        </div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Detailed prompt:</p>
                        <p className="text-xs text-foreground">{editResult.enhancedPrompt}</p>
                        <Button 
                          variant="outline"
                          size="sm"
                          className="mt-2 w-full"
                          onClick={() => {
                            navigator.clipboard.writeText(editResult.enhancedPrompt || "");
                            toast({
                              title: "Copied!",
                              description: "Use this prompt in tools like Midjourney, DALL-E, or Photoshop AI.",
                            });
                          }}
                          data-testid="enhance-button-copy-prompt"
                        >
                          Copy Prompt for External Tools
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>

        {editResult?.editedUrl && (
          <PhotoCompareDialog
            open={compareDialogOpen}
            onOpenChange={setCompareDialogOpen}
            originalUrl={photoUrl}
            enhancedUrl={editResult.editedUrl}
            listingId={listingId}
            photoIndex={photoIndex}
            aiEditedPrompt={editPrompt}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
