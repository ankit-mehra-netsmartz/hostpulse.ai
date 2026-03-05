import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PawPrint, Loader2, Wand2, RefreshCw, Download, ImageIcon, ArrowRight, GitCompare, Check, Pin, Dog } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PhotoCompareDialog } from "./photo-compare-dialog";

interface PetPhotoEnhanceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  photoIndex: number;
  photoUrl: string;
  existingEnhancedUrl?: string | null;
  existingPrompt?: string | null;
}

export function PetPhotoEnhanceSheet({
  open,
  onOpenChange,
  listingId,
  photoIndex,
  photoUrl,
  existingEnhancedUrl,
  existingPrompt,
}: PetPhotoEnhanceSheetProps) {
  const { toast } = useToast();
  
  const [editPrompt, setEditPrompt] = useState("");
  const [suggestedImprovements, setSuggestedImprovements] = useState<string[]>([]);
  const [hasFetchedSuggestions, setHasFetchedSuggestions] = useState(false);
  const [editResult, setEditResult] = useState<{
    enhancedPrompt?: string;
    editApplied?: string;
    editedUrl?: string | null;
  } | null>(null);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize with existing enhanced photo if available, or reset when opening different photo
  useEffect(() => {
    if (open) {
      if (existingEnhancedUrl) {
        setEditResult({
          editedUrl: existingEnhancedUrl,
          editApplied: "Previously enhanced photo",
        });
        setIsPinned(true);
        if (existingPrompt) {
          setEditPrompt(existingPrompt);
          setHasFetchedSuggestions(true);
        }
      } else {
        // Reset when opening a photo without existing enhancement
        setEditResult(null);
        setIsPinned(false);
      }
    }
  }, [open, existingEnhancedUrl, existingPrompt, photoIndex]);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      setEditPrompt("");
      setSuggestedImprovements([]);
      setHasFetchedSuggestions(false);
      setEditResult(null);
      setCompareDialogOpen(false);
      setIsPinned(false);
      setGenerationProgress(0);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }
  }, [open]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, []);

  const suggestPetEditMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/listings/${listingId}/photos/${photoIndex}/suggest-pet-edit`);
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
        description: "Failed to generate pet edit suggestion. Please try again.",
        variant: "destructive",
      });
    },
  });

  const startProgressAnimation = () => {
    setGenerationProgress(0);
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    progressIntervalRef.current = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev >= 95) return prev;
        const increment = Math.random() * 5 + 1;
        return Math.min(prev + increment, 95);
      });
    }, 500);
  };

  const stopProgressAnimation = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setGenerationProgress(100);
    setTimeout(() => setGenerationProgress(0), 500);
  };

  const generatePetEditMutation = useMutation({
    mutationFn: async () => {
      startProgressAnimation();
      const res = await apiRequest("POST", `/api/listings/${listingId}/photos/${photoIndex}/edit`, {
        prompt: editPrompt,
        petEdit: true,
      });
      return res.json();
    },
    onSuccess: (data) => {
      stopProgressAnimation();
      setEditResult(data);
      toast({
        title: "Pet Photo Created",
        description: data.editedUrl ? "Your pet-friendly photo is ready!" : "Enhancement prompt created.",
      });
    },
    onError: () => {
      stopProgressAnimation();
      toast({
        title: "Error",
        description: "Failed to generate pet photo. Please try again.",
        variant: "destructive",
      });
    },
  });

  const savePetEditMutation = useMutation({
    mutationFn: async (editedUrl: string) => {
      const res = await apiRequest("POST", `/api/listings/${listingId}/photos/${photoIndex}/save-edit`, {
        aiEditedUrl: editedUrl,
        aiEditedPrompt: editPrompt,
        petEdit: true,
      });
      return res.json();
    },
    onSuccess: () => {
      setIsPinned(true);
      queryClient.invalidateQueries({ queryKey: ["/api/listings", listingId, "photo-analyses"] });
      toast({
        title: "Pinned!",
        description: "Pet photo saved to your collection.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save the pet photo. Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (open && !hasFetchedSuggestions && !suggestPetEditMutation.isPending) {
      suggestPetEditMutation.mutate();
    }
  }, [open, hasFetchedSuggestions, suggestPetEditMutation.isPending]);

  const handleDownload = () => {
    if (!editResult?.editedUrl) return;
    const link = document.createElement('a');
    link.href = editResult.editedUrl;
    link.download = `pet-photo-${photoIndex + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({
      title: "Downloaded!",
      description: "Pet photo saved to your downloads.",
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-4xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <PawPrint className="w-5 h-5 text-amber-500" />
            {isPinned ? "Pet Photo Enhancement" : "Add Pet to Photo"}
          </SheetTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {isPinned ? (
              <>
                <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/30">
                  <Pin className="w-3 h-3 mr-1" />
                  Pinned Photo
                </Badge>
                <span>View your AI-enhanced pet-friendly photo</span>
              </>
            ) : (
              <>
                <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                  <Dog className="w-3 h-3 mr-1" />
                  Pet-Friendly Editor
                </Badge>
                <span>Add a dog to show guests your property is pet-friendly</span>
              </>
            )}
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-4">
            <div className="relative rounded-lg overflow-hidden bg-muted border">
              <img 
                src={photoUrl} 
                alt={`Original Photo ${photoIndex + 1}`}
                className="w-full h-auto object-cover max-h-[250px]"
                data-testid="pet-enhance-original-image"
              />
              <div className="absolute bottom-2 left-2">
                <Badge variant="secondary" className="bg-black/70 text-white border-0">
                  Original • Photo {photoIndex + 1}
                </Badge>
              </div>
            </div>
          </div>

          {/* Only show editing controls when not viewing a pinned photo */}
          {!isPinned && (
            <>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <PawPrint className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  AI will analyze your photo and suggest the best way to add a friendly dog to showcase your property as pet-welcoming. You can customize the prompt before generating.
                </p>
              </div>

              {suggestPetEditMutation.isPending ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                  <span className="text-sm text-muted-foreground">Analyzing photo for pet placement...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {suggestedImprovements.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">AI suggestions for pet placement:</p>
                      <div className="flex flex-wrap gap-1">
                        {suggestedImprovements.map((improvement, i) => (
                          <Badge key={i} variant="secondary" className="text-xs bg-amber-500/10 text-amber-600">
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
                      placeholder="Describe how you want the dog to appear in the photo..."
                      className="min-h-[100px] text-sm"
                      data-testid="pet-enhance-textarea-prompt"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    {generatePetEditMutation.isPending && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-2">
                            <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                            Creating your pet-friendly photo...
                          </span>
                          <span>{Math.round(generationProgress)}%</span>
                        </div>
                        <Progress value={generationProgress} className="h-2" />
                        <p className="text-xs text-muted-foreground text-center">
                          This may take 15-30 seconds
                        </p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button 
                        onClick={() => generatePetEditMutation.mutate()}
                        disabled={!editPrompt.trim() || generatePetEditMutation.isPending}
                        className="flex-1 bg-amber-600 border-amber-600"
                        data-testid="pet-enhance-button-apply"
                      >
                        {generatePetEditMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <PawPrint className="w-4 h-4 mr-2" />
                            Add Pet to Photo
                          </>
                        )}
                      </Button>
                    <Button 
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(editPrompt);
                        toast({
                          title: "Copied!",
                          description: "Pet edit prompt copied to clipboard.",
                        });
                      }}
                      disabled={!editPrompt.trim()}
                      data-testid="pet-enhance-button-copy"
                    >
                      Copy
                    </Button>
                      <Button 
                        variant="outline"
                        onClick={() => suggestPetEditMutation.mutate()}
                        disabled={suggestPetEditMutation.isPending}
                        size="icon"
                        data-testid="pet-enhance-button-refresh"
                      >
                        <RefreshCw className={`w-4 h-4 ${suggestPetEditMutation.isPending ? "animate-spin" : ""}`} />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
              
          {editResult && (
                <Card className="border-amber-500/30 bg-amber-500/5">
                  <CardContent className="pt-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <PawPrint className="w-4 h-4 text-amber-500" />
                      <h4 className="text-sm font-medium">Pet Photo Result</h4>
                      {editResult.editedUrl && (
                        <Badge className="bg-green-500/20 text-green-600 border-green-500/30">
                          Image Generated
                        </Badge>
                      )}
                      {isPinned && (
                        <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30">
                          <Pin className="w-3 h-3 mr-1" />
                          Pinned
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
                          <span className="text-amber-600 font-medium">With Pet</span>
                        </div>
                        
                        {/* Side-by-side comparison view */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="relative rounded-lg overflow-hidden border">
                            <img 
                              src={photoUrl} 
                              alt="Original Photo" 
                              className="w-full h-auto object-cover aspect-[4/3]"
                              data-testid="pet-enhance-img-original"
                            />
                            <div className="absolute top-2 left-2">
                              <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">
                                Original
                              </Badge>
                            </div>
                          </div>
                          <div className="relative rounded-lg overflow-hidden border">
                            <img 
                              src={editResult.editedUrl} 
                              alt="Photo with Pet Added" 
                              className="w-full h-auto object-cover aspect-[4/3]"
                              data-testid="pet-enhance-img-result"
                            />
                            <div className="absolute top-2 left-2">
                              <Badge className="bg-amber-600">
                                <PawPrint className="w-3 h-3 mr-1" />
                                Enhanced
                              </Badge>
                            </div>
                            {isPinned && (
                              <div className="absolute top-2 right-2">
                                <Badge className="bg-green-600">
                                  <Pin className="w-3 h-3 mr-1" />
                                  Pinned
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button 
                            variant="outline"
                            className="flex-1 min-w-[120px]"
                            onClick={() => setCompareDialogOpen(true)}
                            data-testid="pet-enhance-button-compare"
                          >
                            <GitCompare className="w-4 h-4 mr-2" />
                            Compare
                          </Button>
                          <Button 
                            variant="outline"
                            className="flex-1 min-w-[120px]"
                            onClick={handleDownload}
                            data-testid="pet-enhance-button-download"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download
                          </Button>
                          <Button 
                            className={`w-full ${isPinned ? "bg-green-600 border-green-600" : "bg-amber-600 border-amber-600"}`}
                            onClick={() => savePetEditMutation.mutate(editResult.editedUrl!)}
                            disabled={savePetEditMutation.isPending || isPinned}
                            data-testid="pet-enhance-button-pin"
                          >
                            {savePetEditMutation.isPending ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : isPinned ? (
                              <Check className="w-4 h-4 mr-2" />
                            ) : (
                              <Pin className="w-4 h-4 mr-2" />
                            )}
                            {isPinned ? "Pinned to Collection" : "Pin This Photo"}
                          </Button>
                        </div>
                      </div>
                    )}
                    
                    {!editResult.editedUrl && editResult.enhancedPrompt && (
                      <div className="p-3 rounded bg-muted/50 border">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Detailed prompt for external tools:</p>
                        <p className="text-xs text-foreground">{editResult.enhancedPrompt}</p>
                        <Button 
                          variant="outline"
                          size="sm"
                          className="mt-2 w-full"
                          onClick={() => {
                            navigator.clipboard.writeText(editResult.enhancedPrompt || "");
                            toast({
                              title: "Copied!",
                              description: "Use this prompt in tools like Midjourney or DALL-E.",
                            });
                          }}
                          data-testid="pet-enhance-button-copy-prompt"
                        >
                          Copy Prompt for External Tools
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
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
            isAlreadyPinned={isPinned}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
