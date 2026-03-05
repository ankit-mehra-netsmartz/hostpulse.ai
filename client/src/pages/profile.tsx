import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import {
  User,
  Camera,
  Save,
  Loader2,
  Sparkles,
  Music,
  Share2,
  Twitter,
  Facebook,
  Linkedin,
  Copy,
  CheckCircle2,
  Play,
  Pause,
  AlertTriangle,
  Lock,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Wand2,
  Upload,
  Dice5,
  RefreshCw,
  Check,
  History,
  ChevronDown,
  ChevronUp,
  Download,
  Trash2,
  Clock,
  Building2,
  ImageIcon,
  Maximize2,
  Pencil,
  Move,
  ZoomIn,
  ZoomOut,
  Undo2,
  RotateCcw,
  X,
} from "lucide-react";
import { useWorkspace } from "@/contexts/workspace-context";
import { SiX } from "react-icons/si";

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  profileImageUrl: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface UserSong {
  id: string;
  userId: string;
  workspaceId: string | null;
  songType: string;
  status: string;
  title: string | null;
  lyrics: string | null;
  audioUrl: string | null;
  prompt: string | null;
  musicStyle: string | null;
  voiceStyle: string | null;
  reservationId: string | null;
  sharedOnSocial: string;
  createdAt: string;
}

interface WorstGuest {
  reservationId: string;
  guestName: string;
  listingName: string;
  negativeTagCount: number;
  summary: string;
}

interface ProfilePhotoHistory {
  id: string;
  userId: string;
  imageUrl: string;
  createdAt: string;
}

type MusicStyle = "pop" | "country" | "rock" | "jazz" | "hip_hop" | "spoken_word";
type VoiceStyle = "serious" | "playful" | "dramatic" | "chill";

const musicStyleOptions = [
  { value: "pop", label: "Pop", description: "Catchy and upbeat" },
  { value: "country", label: "Country", description: "Storytelling vibes" },
  { value: "rock", label: "Rock", description: "Bold and energetic" },
  { value: "jazz", label: "Jazz", description: "Smooth and sophisticated" },
  { value: "hip_hop", label: "Hip Hop", description: "Rhythmic and expressive" },
  { value: "spoken_word", label: "Spoken Word", description: "Poetic narration" },
] as const;

const voiceStyleOptions = [
  { value: "serious", label: "Serious", description: "Thoughtful delivery" },
  { value: "playful", label: "Playful", description: "Fun and lighthearted" },
  { value: "dramatic", label: "Dramatic", description: "Theatrical flair" },
  { value: "chill", label: "Chill", description: "Relaxed and mellow" },
] as const;

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showSongDialog, setShowSongDialog] = useState(false);
  const [songType, setSongType] = useState<"str_journey" | "worst_guest">("str_journey");
  const [selectedGuest, setSelectedGuest] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [hasShared, setHasShared] = useState(false);
  
  // New song creation state - Karen's Farewell Song flow
  const [dialogStep, setDialogStep] = useState<"karen" | "style" | "lyrics" | "create">("karen");
  const [musicStyle, setMusicStyle] = useState<MusicStyle>("pop");
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyle>("playful");
  const [songPrompt, setSongPrompt] = useState("");
  const [songTitle, setSongTitle] = useState("");
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [showSongHistory, setShowSongHistory] = useState(false);

  // Profile image upload/crop state
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [imageDialogMode, setImageDialogMode] = useState<"upload" | "ai-edit" | "ai-generate">("upload");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop>();
  const [photoZoom, setPhotoZoom] = useState(1);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiEditFileInputRef = useRef<HTMLInputElement>(null);

  // AI Edit multi-step flow state: upload → prompt → review (3 options) → crop → save
  const [aiEditStep, setAiEditStep] = useState<"upload" | "prompt" | "review" | "crop">("upload");
  const [aiEditOriginalImage, setAiEditOriginalImage] = useState<string | null>(null);
  const [aiEditPrompt, setAiEditPrompt] = useState("");
  const [aiEditResults, setAiEditResults] = useState<string[]>([]);
  const [aiEditSelectedIndex, setAiEditSelectedIndex] = useState<number | null>(null);
  const [aiEditIsProcessing, setAiEditIsProcessing] = useState(false);
  const [aiEditExpandedImage, setAiEditExpandedImage] = useState<number | null>(null);
  const [aiEditCropImage, setAiEditCropImage] = useState<string | null>(null);
  const [aiEditCropZoom, setAiEditCropZoom] = useState(1);
  const [aiEditCropPosition, setAiEditCropPosition] = useState({ x: 0, y: 0 });
  const [aiEditSaving, setAiEditSaving] = useState(false);
  
  // Legacy AI Headshot state (for simple mode)
  const [aiGender, setAiGender] = useState<"male" | "female" | "random">("random");
  const [aiAvatarMode, setAiAvatarMode] = useState<"random" | "prompt">("random");
  const [aiAvatarPrompt, setAiAvatarPrompt] = useState("");
  const [generatedHeadshot, setGeneratedHeadshot] = useState<{ base64: string; mimeType: string; characterName: string } | null>(null);

  // Workspace settings state
  const { activeWorkspace } = useWorkspace();
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceLogoPreview, setWorkspaceLogoPreview] = useState<string | null>(null);
  const [workspaceSquareLogoPreview, setWorkspaceSquareLogoPreview] = useState<string | null>(null);
  const workspaceLogoInputRef = useRef<HTMLInputElement>(null);
  
  // Undo state for logo changes
  const [previousLogoState, setPreviousLogoState] = useState<{
    logoUrl: string | null;
    squareLogoUrl: string | null;
  } | null>(null);
  
  // Logo generation dialog state
  const [showLogoDialog, setShowLogoDialog] = useState(false);
  const [logoCompanyName, setLogoCompanyName] = useState("");
  const [logoDescription, setLogoDescription] = useState("modern wordmark, 2-tone, flat design with no drop shadow");
  // Step 1: 3 horizontal logo options to choose from
  const [logoOptions, setLogoOptions] = useState<Array<{ base64: string; mimeType: string; conceptStyle?: string; conceptLabel?: string }>>([]);
  const [selectedLogoIndex, setSelectedLogoIndex] = useState<number | null>(null);
  // Remix state
  const [remixIndex, setRemixIndex] = useState<number | null>(null);
  const [remixPrompt, setRemixPrompt] = useState("");
  // Step 2: Generated square icon from selected logo
  const [generatedLogos, setGeneratedLogos] = useState<{
    horizontal: { base64: string; mimeType: string } | null;
    square: { base64: string; mimeType: string } | null;
  } | null>(null);
  const [expandedLogo, setExpandedLogo] = useState<'horizontal' | 'square' | null>(null);
  const [editLogoType, setEditLogoType] = useState<'horizontal' | 'square' | null>(null);
  const [editLogoPrompt, setEditLogoPrompt] = useState("");
  const [cropLogoType, setCropLogoType] = useState<'horizontal' | 'square' | null>(null);
  const [cropLogoSource, setCropLogoSource] = useState<'generated' | 'saved'>('generated');
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropScale, setCropScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [croppedLogos, setCroppedLogos] = useState<{
    horizontal?: string;
    square?: string;
  }>({});
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      profileImageUrl: user?.profileImageUrl || "",
    },
  });

  const { data: userProfile, isLoading: profileLoading } = useQuery<any>({
    queryKey: ["/api/user/profile"],
    enabled: !!user,
  });

  // Load profile data into form when it becomes available
  useEffect(() => {
    if (userProfile) {
      form.reset({
        firstName: userProfile.firstName || "",
        lastName: userProfile.lastName || "",
        profileImageUrl: userProfile.profileImageUrl || "",
      });
    }
  }, [userProfile, form]);

  // Load workspace name when activeWorkspace changes
  useEffect(() => {
    if (activeWorkspace) {
      setWorkspaceName(activeWorkspace.name);
      setWorkspaceLogoPreview(activeWorkspace.logoUrl || null);
      setWorkspaceSquareLogoPreview((activeWorkspace as any).squareLogoUrl || null);
      setLogoCompanyName(activeWorkspace.name);
    }
  }, [activeWorkspace]);

  // Query to get current user's role in active workspace
  const { data: workspaceMembers } = useQuery<any[]>({
    queryKey: ["/api/workspaces", activeWorkspace?.id, "members"],
    enabled: !!activeWorkspace?.id,
  });

  const currentUserRole = workspaceMembers?.find((m: any) => m.userId === user?.id)?.role;
  const canEditWorkspace = currentUserRole === "owner" || currentUserRole === "admin";

  const updateWorkspaceMutation = useMutation({
    mutationFn: async (data: { name?: string; logoUrl?: string; squareLogoUrl?: string }) => {
      if (!activeWorkspace?.id) throw new Error("No active workspace");
      return apiRequest("PATCH", `/api/workspaces/${activeWorkspace.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      toast({
        title: "Workspace updated",
        description: "Your workspace settings have been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update workspace.",
        variant: "destructive",
      });
    },
  });

  // Step 1: Generate 3 logo options
  const generateLogoOptionsMutation = useMutation({
    mutationFn: async (params: { companyName: string; description: string }) => {
      if (!activeWorkspace?.id) throw new Error("No active workspace");
      const res = await apiRequest("POST", `/api/workspaces/${activeWorkspace.id}/generate-logo-options`, params);
      return res.json();
    },
    onSuccess: (data: { logos: Array<{ base64: string; mimeType: string }> }) => {
      setLogoOptions(data.logos);
      setSelectedLogoIndex(null);
      setGeneratedLogos(null);
      toast({
        title: "Logo options generated",
        description: "Select your preferred logo design below.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate logo options.",
        variant: "destructive",
      });
    },
  });

  // Step 2: Generate square icon from selected logo
  const generateSquareIconMutation = useMutation({
    mutationFn: async (params: { horizontalLogoBase64: string; horizontalLogoMimeType: string; companyName: string; description: string }) => {
      if (!activeWorkspace?.id) throw new Error("No active workspace");
      const res = await apiRequest("POST", `/api/workspaces/${activeWorkspace.id}/generate-square-icon`, params);
      return res.json();
    },
    onSuccess: (data: { base64: string; mimeType: string }) => {
      if (selectedLogoIndex !== null && logoOptions[selectedLogoIndex]) {
        const selectedLogo = logoOptions[selectedLogoIndex];
        setGeneratedLogos({
          horizontal: selectedLogo,
          square: data,
        });
        const horizontalUrl = `data:${selectedLogo.mimeType};base64,${selectedLogo.base64}`;
        const squareUrl = `data:${data.mimeType};base64,${data.base64}`;
        setWorkspaceLogoPreview(horizontalUrl);
        setWorkspaceSquareLogoPreview(squareUrl);
        toast({
          title: "Logos ready",
          description: "Review your logos below. Click 'Use These Logos' to apply them.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate square icon.",
        variant: "destructive",
      });
    },
  });

  // Legacy mutation for backwards compatibility
  const generateLogoMutation = useMutation({
    mutationFn: async (params: { companyName: string; description: string }) => {
      if (!activeWorkspace?.id) throw new Error("No active workspace");
      const res = await apiRequest("POST", `/api/workspaces/${activeWorkspace.id}/generate-logo`, params);
      return res.json();
    },
    onSuccess: (data: { horizontal: { base64: string; mimeType: string }; square: { base64: string; mimeType: string } }) => {
      setGeneratedLogos(data);
      const horizontalUrl = `data:${data.horizontal.mimeType};base64,${data.horizontal.base64}`;
      const squareUrl = `data:${data.square.mimeType};base64,${data.square.base64}`;
      setWorkspaceLogoPreview(horizontalUrl);
      setWorkspaceSquareLogoPreview(squareUrl);
      toast({
        title: "Logos generated",
        description: "Review your logos below. Click 'Use These Logos' to apply them.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate logos.",
        variant: "destructive",
      });
    },
  });

  // Remix logo mutation
  const remixLogoMutation = useMutation({
    mutationFn: async (params: { companyName: string; conceptStyle: string; editInstructions: string }) => {
      if (!activeWorkspace?.id) throw new Error("No active workspace");
      const res = await apiRequest("POST", `/api/workspaces/${activeWorkspace.id}/remix-logo`, params);
      return res.json();
    },
    onSuccess: (data: { base64: string; mimeType: string; conceptStyle?: string; conceptLabel?: string }) => {
      if (remixIndex !== null) {
        // Replace the remixed logo in the options array
        setLogoOptions(prev => {
          const newOptions = [...prev];
          newOptions[remixIndex] = {
            base64: data.base64,
            mimeType: data.mimeType,
            conceptStyle: data.conceptStyle,
            conceptLabel: data.conceptLabel,
          };
          return newOptions;
        });
        setRemixIndex(null);
        setRemixPrompt("");
        toast({
          title: "Logo remixed",
          description: "Your remixed logo is ready. Select it or remix again.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remix logo.",
        variant: "destructive",
      });
    },
  });

  // Handle remix submission
  const handleRemixSubmit = () => {
    if (remixIndex === null || !remixPrompt.trim()) return;
    const logo = logoOptions[remixIndex];
    remixLogoMutation.mutate({
      companyName: logoCompanyName,
      conceptStyle: logo.conceptStyle || logoDescription,
      editInstructions: remixPrompt.trim(),
    });
  };

  // Handle logo selection
  const handleSelectLogo = (index: number) => {
    setSelectedLogoIndex(index);
    const logo = logoOptions[index];
    // Generate square icon from selected logo
    generateSquareIconMutation.mutate({
      horizontalLogoBase64: logo.base64,
      horizontalLogoMimeType: logo.mimeType,
      companyName: logoCompanyName,
      description: logoDescription,
    });
  };

  const handleWorkspaceLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setWorkspaceLogoPreview(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveWorkspaceSettings = async () => {
    const updates: { name?: string; logoUrl?: string; squareLogoUrl?: string } = {};
    if (workspaceName !== activeWorkspace?.name) {
      updates.name = workspaceName;
    }
    if (workspaceLogoPreview !== activeWorkspace?.logoUrl) {
      updates.logoUrl = workspaceLogoPreview || undefined;
    }
    if (workspaceSquareLogoPreview !== (activeWorkspace as any)?.squareLogoUrl) {
      updates.squareLogoUrl = workspaceSquareLogoPreview || undefined;
    }
    if (Object.keys(updates).length > 0) {
      await updateWorkspaceMutation.mutateAsync(updates);
      setShowLogoDialog(false);
      setGeneratedLogos(null);
    }
  };
  
  const handleDownloadLogo = (dataUrl: string, filename: string) => {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openCropDialog = (type: 'horizontal' | 'square', source: 'generated' | 'saved' = 'generated') => {
    setCropLogoType(type);
    setCropLogoSource(source);
    setCropPosition({ x: 0, y: 0 });
    setCropScale(1);
  };

  const handleCropMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - cropPosition.x, y: e.clientY - cropPosition.y });
  };

  const handleCropMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setCropPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleCropMouseUp = () => {
    setIsDragging(false);
  };

  const saveCroppedLogo = () => {
    if (!cropLogoType) return;
    
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let logoSrc: string | null = null;
    
    if (cropLogoSource === 'generated' && generatedLogos) {
      const logoData = cropLogoType === 'horizontal' ? generatedLogos.horizontal : generatedLogos.square;
      if (logoData) {
        logoSrc = `data:${logoData.mimeType};base64,${logoData.base64}`;
      }
    } else if (cropLogoSource === 'saved') {
      logoSrc = cropLogoType === 'horizontal' ? workspaceLogoPreview : workspaceSquareLogoPreview;
    }
    
    if (!logoSrc) return;
    
    // Save previous state for undo (before making changes)
    if (cropLogoSource === 'saved') {
      setPreviousLogoState({
        logoUrl: workspaceLogoPreview,
        squareLogoUrl: workspaceSquareLogoPreview,
      });
    }
    
    const img = new Image();
    img.onload = () => {
      // Output canvas dimensions
      const cropWidth = cropLogoType === 'horizontal' ? 400 : 200;
      const cropHeight = cropLogoType === 'horizontal' ? 100 : 200;
      
      // Preview container dimensions (must match the CSS in the dialog)
      const previewWidth = cropLogoType === 'horizontal' ? 400 : 192; // w-full (approx 400) or w-48 (192px)
      const previewHeight = cropLogoType === 'horizontal' ? 96 : 192; // h-24 (96px) or h-48 (192px)
      
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cropWidth, cropHeight);
      
      // Calculate the base scale that makes the image fit in the preview container
      // This matches how the CSS displays the image with object-contain behavior
      const baseScaleX = previewWidth / img.width;
      const baseScaleY = previewHeight / img.height;
      const baseScale = Math.min(baseScaleX, baseScaleY);
      
      // Apply user's zoom on top of the base scale
      const finalScale = baseScale * cropScale;
      
      // Scale position from preview coordinates to output canvas coordinates
      const scaleRatio = cropWidth / previewWidth;
      
      const scaledWidth = img.width * finalScale * scaleRatio;
      const scaledHeight = img.height * finalScale * scaleRatio;
      const drawX = (cropWidth - scaledWidth) / 2 + (cropPosition.x * scaleRatio);
      const drawY = (cropHeight - scaledHeight) / 2 + (cropPosition.y * scaleRatio);
      
      ctx.drawImage(img, drawX, drawY, scaledWidth, scaledHeight);
      
      const croppedDataUrl = canvas.toDataURL('image/png');
      
      if (cropLogoSource === 'generated') {
        setCroppedLogos(prev => ({
          ...prev,
          [cropLogoType]: croppedDataUrl,
        }));
        setCropLogoType(null);
      } else {
        // For saved logos, update state and auto-save to database
        if (cropLogoType === 'horizontal') {
          setWorkspaceLogoPreview(croppedDataUrl);
          // Auto-save horizontal logo to database
          if (activeWorkspace?.id) {
            updateWorkspaceMutation.mutate({ logoUrl: croppedDataUrl });
          }
        } else {
          setWorkspaceSquareLogoPreview(croppedDataUrl);
          // Auto-save square logo to database - this will invalidate the workspaces query
          // so the sidebar icon updates immediately
          if (activeWorkspace?.id) {
            updateWorkspaceMutation.mutate({ squareLogoUrl: croppedDataUrl });
          }
        }
        setCropLogoType(null);
      }
    };
    img.src = logoSrc;
  };
  
  // Undo last logo changes
  const handleUndoLogoChanges = () => {
    if (!previousLogoState || !activeWorkspace?.id) return;
    
    // Restore the previous state
    setWorkspaceLogoPreview(previousLogoState.logoUrl);
    setWorkspaceSquareLogoPreview(previousLogoState.squareLogoUrl);
    
    // Save to database
    updateWorkspaceMutation.mutate({
      logoUrl: previousLogoState.logoUrl || undefined,
      squareLogoUrl: previousLogoState.squareLogoUrl || undefined,
    });
    
    // Clear undo state
    setPreviousLogoState(null);
    
    toast({
      title: "Changes undone",
      description: "Logo changes have been reverted.",
    });
  };

  const { data: songs, isLoading: songsLoading } = useQuery<UserSong[]>({
    queryKey: ["/api/user/songs"],
    enabled: !!user,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && data.some((song: UserSong) => song.status === "generating")) {
        return 3000;
      }
      return false;
    },
  });

  const { data: worstGuests, isLoading: worstGuestsLoading } = useQuery<WorstGuest[]>({
    queryKey: ["/api/user/worst-guests"],
    enabled: !!user && showSongDialog,
  });

  // Profile photo history
  const [showPhotoHistory, setShowPhotoHistory] = useState(false);
  const { data: photoHistory, isLoading: photoHistoryLoading } = useQuery<ProfilePhotoHistory[]>({
    queryKey: ["/api/user/photo-history"],
    enabled: !!user,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      return apiRequest("PATCH", "/api/user/profile", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/photo-history"] });
      toast({
        title: "Profile updated",
        description: "Your profile has been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createSongMutation = useMutation({
    mutationFn: async (data: { 
      songType: string; 
      reservationId?: string;
      prompt: string;
      musicStyle: string;
      voiceStyle: string;
      title: string;
    }) => {
      return apiRequest("POST", "/api/user/songs", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/songs"] });
      setShowSongDialog(false);
      resetSongDialog();
      toast({
        title: "Song is being created!",
        description: "We're generating your personalized song. This may take a minute.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create song. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Generate AI summary of guest issues
  const generatePromptMutation = useMutation({
    mutationFn: async (data: { songType: string; reservationId?: string }) => {
      const res = await apiRequest("POST", "/api/user/summarize-guest-issues", data);
      return res.json();
    },
    onSuccess: (data: { summary: string; suggestedTitle: string; firstName?: string }) => {
      setSongPrompt(data.summary);
      setSongTitle(data.suggestedTitle);
      setDialogStep("create");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to summon the songwriters. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetSongDialog = () => {
    setDialogStep("karen");
    setSongType("worst_guest");
    setSelectedGuest(null);
    setMusicStyle("pop");
    setVoiceStyle("playful");
    setSongPrompt("");
    setSongTitle("");
  };

  const shareSongMutation = useMutation({
    mutationFn: async (songId: string) => {
      return apiRequest("POST", `/api/user/songs/${songId}/share`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/songs"] });
      setHasShared(true);
      toast({
        title: "Thanks for sharing!",
        description: "Your song is now unlocked for playback.",
      });
    },
  });

  const deleteSongMutation = useMutation({
    mutationFn: async (songId: string) => {
      return apiRequest("DELETE", `/api/user/songs/${songId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/songs"] });
      toast({
        title: "Song deleted",
        description: "The song has been removed from your history.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete song. Please try again.",
        variant: "destructive",
      });
    },
  });

  const downloadSong = (song: UserSong) => {
    if (!song.audioUrl) {
      toast({
        title: "No audio available",
        description: "This song doesn't have audio to download.",
        variant: "destructive",
      });
      return;
    }
    
    const link = document.createElement('a');
    link.href = song.audioUrl;
    link.download = `${song.title || 'song'}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Download started",
      description: "Your song is being downloaded.",
    });
  };

  // AI Avatar generation mutation - supports random characters or custom prompts
  const generateHeadshotMutation = useMutation({
    mutationFn: async (data: { gender?: "male" | "female" | "random"; customPrompt?: string }) => {
      const res = await apiRequest("POST", "/api/user/generate-headshot", data);
      return res.json();
    },
    onSuccess: (data: { success: boolean; characterName: string; gender: string; image: { base64: string; mimeType: string } }) => {
      setGeneratedHeadshot({
        base64: data.image.base64,
        mimeType: data.image.mimeType,
        characterName: data.characterName,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate avatar. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Lock headshot mutation - locks choice for 30 days
  const lockHeadshotMutation = useMutation({
    mutationFn: async (data: { profileImageUrl: string; originalSelfieUrl?: string }) => {
      const res = await apiRequest("POST", "/api/user/lock-headshot", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/headshot-status"] });
      setShowImageDialog(false);
      resetImageDialog();
      toast({
        title: "Headshot Locked!",
        description: "Your headshot is now set for the next 30 days.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to lock headshot. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Check headshot lock status
  const { data: headshotStatus } = useQuery<{ isLocked: boolean; daysRemaining: number; unlockDate: string; originalSelfieUrl: string | null }>({
    queryKey: ["/api/user/headshot-status"],
    enabled: !!user,
  });

  // Image upload and crop helper functions
  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height, naturalWidth, naturalHeight } = e.currentTarget;
    const newCrop = centerCrop(
      makeAspectCrop({ unit: "%", width: 90 }, 1, width, height),
      width,
      height
    );
    setCrop(newCrop);
    // Also set completedCrop so Apply button is enabled immediately
    const pixelCrop: PixelCrop = {
      unit: "px",
      x: (newCrop.x / 100) * width,
      y: (newCrop.y / 100) * height,
      width: (newCrop.width / 100) * width,
      height: (newCrop.height / 100) * height,
    };
    setCompletedCrop(pixelCrop);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setUploadedImage(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAiEditFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setAiEditOriginalImage(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const getCroppedImage = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!imageRef.current || !completedCrop) {
        reject(new Error("No image or crop data"));
        return;
      }

      const canvas = document.createElement("canvas");
      const scaleX = imageRef.current.naturalWidth / imageRef.current.width;
      const scaleY = imageRef.current.naturalHeight / imageRef.current.height;
      
      const cropWidth = completedCrop.width * scaleX;
      const cropHeight = completedCrop.height * scaleY;
      
      canvas.width = cropWidth;
      canvas.height = cropHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      ctx.drawImage(
        imageRef.current,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight
      );

      resolve(canvas.toDataURL("image/jpeg", 0.9));
    });
  }, [completedCrop]);

  const handleApplyUploadedImage = async () => {
    try {
      const croppedDataUrl = await getCroppedImage();
      form.setValue("profileImageUrl", croppedDataUrl);
      setShowImageDialog(false);
      setUploadedImage(null);
      setCrop(undefined);
      setCompletedCrop(undefined);
      setPhotoZoom(1);
      toast({
        title: "Image applied",
        description: "Don't forget to save your profile to keep this image.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to crop image. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleApplyAiHeadshot = () => {
    if (generatedHeadshot) {
      const dataUrl = `data:${generatedHeadshot.mimeType};base64,${generatedHeadshot.base64}`;
      form.setValue("profileImageUrl", dataUrl);
      setShowImageDialog(false);
      setGeneratedHeadshot(null);
      toast({
        title: "Headshot applied",
        description: `Your ${generatedHeadshot.characterName} headshot is set! Save your profile to keep it.`,
      });
    }
  };

  const resetImageDialog = () => {
    setUploadedImage(null);
    setCrop(undefined);
    setCompletedCrop(undefined);
    setPhotoZoom(1);
    setGeneratedHeadshot(null);
    setAiGender("random");
    setAiAvatarMode("random");
    setAiAvatarPrompt("");
    // Reset AI Edit multi-step flow
    setAiEditStep("upload");
    setAiEditOriginalImage(null);
    setAiEditPrompt("");
    setAiEditResults([]);
    setAiEditSelectedIndex(null);
    setAiEditExpandedImage(null);
    setAiEditCropImage(null);
    setAiEditCropZoom(1);
    setAiEditCropPosition({ x: 0, y: 0 });
    setAiEditSaving(false);
  };

  const onSubmit = (data: ProfileFormData) => {
    updateProfileMutation.mutate(data);
  };

  const handleNextStep = () => {
    if (dialogStep === "karen") {
      // Validate Karen selection
      if (!selectedGuest) {
        toast({
          title: "Select a Karen",
          description: "Please select your top Karen to proceed.",
          variant: "destructive",
        });
        return;
      }
      setDialogStep("style");
    } else if (dialogStep === "style") {
      setDialogStep("lyrics");
    }
  };

  const handleSummonSongwriters = () => {
    // Generate AI prompt / lyrics
    generatePromptMutation.mutate({
      songType: "worst_guest",
      reservationId: selectedGuest || undefined,
    });
  };

  const handleCreateSong = () => {
    if (!songPrompt || songPrompt.length < 10) {
      toast({
        title: "Lyrics too short",
        description: "Please wait for the songwriters to generate lyrics.",
        variant: "destructive",
      });
      return;
    }
    
    createSongMutation.mutate({
      songType: "worst_guest",
      reservationId: selectedGuest || undefined,
      prompt: songPrompt,
      musicStyle,
      voiceStyle,
      title: songTitle,
    });
  };

  const handleBackStep = () => {
    if (dialogStep === "style") {
      setDialogStep("karen");
    } else if (dialogStep === "lyrics") {
      setDialogStep("style");
    } else if (dialogStep === "create") {
      setDialogStep("lyrics");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Link copied to clipboard.",
    });
  };

  const shareToSocial = (platform: string, song: UserSong) => {
    const shareUrl = `${window.location.origin}/song/${song.id}`;
    const shareText = `Listen to my AI-generated song about my short-term rental journey! "${song.title}"`;
    
    let url = "";
    switch (platform) {
      case "twitter":
        url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
        break;
      case "facebook":
        url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
        break;
      case "linkedin":
        url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
        break;
    }
    
    if (url) {
      window.open(url, "_blank", "width=600,height=400");
      shareSongMutation.mutate(song.id);
    }
  };

  const latestSong = songs?.[0];
  const canPlay = true; // No share requirement - users can play immediately
  
  // Track previous song status to detect completion
  const previousSongStatusRef = useRef<string | undefined>(undefined);
  
  useEffect(() => {
    const currentStatus = latestSong?.status;
    const previousStatus = previousSongStatusRef.current;
    
    // Show toast when song transitions from "generating" to "ready"
    if (previousStatus === "generating" && currentStatus === "ready") {
      toast({
        title: "Your song is ready!",
        description: latestSong?.title || "Your personalized song has been generated.",
      });
    }
    
    // Update the ref with current status
    previousSongStatusRef.current = currentStatus;
  }, [latestSong?.status, latestSong?.title, toast]);

  if (!user) {
    return null;
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Profile Settings</h1>
          <p className="text-muted-foreground">Manage your account and preferences</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Personal Information
            </CardTitle>
            <CardDescription>
              Update your profile details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                  <div className="relative group">
                    <Avatar className="h-24 w-24">
                      <AvatarImage src={form.watch("profileImageUrl") || user.profileImageUrl || ""} />
                      <AvatarFallback className="text-2xl">
                        {(user.firstName?.[0] || "") + (user.lastName?.[0] || "")}
                      </AvatarFallback>
                    </Avatar>
                    {(form.watch("profileImageUrl") || user.profileImageUrl) && (
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="absolute bottom-0 right-0 h-8 w-8 rounded-full shadow-md"
                        onClick={() => {
                          const imageUrl = form.watch("profileImageUrl") || user.profileImageUrl;
                          if (!imageUrl) return;
                          const link = document.createElement("a");
                          link.href = imageUrl;
                          link.download = `profile-photo-${user.firstName || "user"}.png`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          toast({
                            title: "Downloaded",
                            description: "Your profile photo has been downloaded.",
                          });
                        }}
                        data-testid="button-download-avatar"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="flex-1 space-y-4">
                    <div>
                      <Label className="text-sm font-medium">Profile Picture</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Choose how you'd like to update your profile picture
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div 
                        className={`border rounded-lg p-3 cursor-pointer hover-elevate ${showImageDialog && imageDialogMode === "upload" ? "border-primary bg-primary/5" : ""}`}
                        onClick={() => {
                          setImageDialogMode("upload");
                          setShowImageDialog(true);
                        }}
                        data-testid="button-upload-photo"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Upload className={`h-4 w-4 ${showImageDialog && imageDialogMode === "upload" ? "text-primary" : "text-primary"}`} />
                          <span className="text-sm font-medium">Upload</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Upload & crop your photo
                        </p>
                      </div>
                      <div 
                        className={`border rounded-lg p-3 cursor-pointer hover-elevate ${showImageDialog && imageDialogMode === "ai-edit" ? "border-primary bg-primary/5" : ""}`}
                        onClick={() => {
                          setImageDialogMode("ai-edit");
                          setShowImageDialog(true);
                        }}
                        data-testid="button-ai-edit"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Wand2 className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">AI Edit</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Upload photo, AI edits it
                        </p>
                      </div>
                      <div 
                        className={`border rounded-lg p-3 cursor-pointer hover-elevate ${showImageDialog && imageDialogMode === "ai-generate" ? "border-primary bg-primary/5" : ""}`}
                        onClick={() => {
                          setImageDialogMode("ai-generate");
                          setShowImageDialog(true);
                        }}
                        data-testid="button-ai-generate"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">AI Avatar</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          AI creates from prompt
                        </p>
                      </div>
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      accept="image/*"
                      className="hidden"
                    />
                    
                    {/* Photo History Toggle */}
                    {photoHistory && photoHistory.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowPhotoHistory(!showPhotoHistory)}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2"
                        data-testid="button-toggle-photo-history"
                      >
                        <History className="h-4 w-4" />
                        <span>Photo History ({photoHistory.length})</span>
                        {showPhotoHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    )}
                    
                    {/* Photo History Grid */}
                    {showPhotoHistory && photoHistory && photoHistory.length > 0 && (
                      <div className="mt-3 border rounded-lg p-3 bg-muted/30">
                        <div className="grid grid-cols-4 gap-2">
                          {photoHistory.map((photo) => (
                            <div key={photo.id} className="relative group">
                              <div className="aspect-square rounded-md overflow-hidden border bg-background">
                                <img 
                                  src={photo.imageUrl} 
                                  alt="Previous photo"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex flex-col items-center justify-center gap-1">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="secondary"
                                  className="h-7 w-7"
                                  onClick={() => {
                                    const link = document.createElement("a");
                                    link.href = photo.imageUrl;
                                    link.download = `profile-photo-${new Date(photo.createdAt).toISOString().split('T')[0]}.png`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    toast({
                                      title: "Downloaded",
                                      description: "Photo has been downloaded.",
                                    });
                                  }}
                                  data-testid={`button-download-history-${photo.id}`}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                                <span className="text-[10px] text-white/80 text-center px-1">
                                  {new Date(photo.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Hidden form field for profile image URL */}
                <FormField
                  control={form.control}
                  name="profileImageUrl"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input {...field} data-testid="input-profile-image-url" />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-first-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-last-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={updateProfileMutation.isPending}
                    data-testid="button-save-profile"
                  >
                    {updateProfileMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Changes
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Timezone Settings
            </CardTitle>
            <CardDescription>
              Set your preferred timezone for displaying message times
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="timezone-select">Timezone</Label>
                <Select
                  value={user?.timezone || "America/New_York"}
                  onValueChange={async (value) => {
                    try {
                      await apiRequest("PATCH", "/api/user/profile", { timezone: value });
                      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
                      toast({
                        title: "Timezone updated",
                        description: `Your timezone has been set to ${value.replace(/_/g, " ")}`,
                      });
                    } catch (error) {
                      toast({
                        title: "Error",
                        description: "Failed to update timezone",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <SelectTrigger id="timezone-select" data-testid="select-timezone">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pacific/Honolulu">Hawaii (HST)</SelectItem>
                    <SelectItem value="America/Anchorage">Alaska (AKST)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific (PST)</SelectItem>
                    <SelectItem value="America/Phoenix">Arizona (MST)</SelectItem>
                    <SelectItem value="America/Denver">Mountain (MST)</SelectItem>
                    <SelectItem value="America/Chicago">Central (CST)</SelectItem>
                    <SelectItem value="America/New_York">Eastern (EST)</SelectItem>
                    <SelectItem value="America/Puerto_Rico">Atlantic (AST)</SelectItem>
                    <SelectItem value="Europe/London">London (GMT)</SelectItem>
                    <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
                    <SelectItem value="Europe/Berlin">Berlin (CET)</SelectItem>
                    <SelectItem value="Asia/Dubai">Dubai (GST)</SelectItem>
                    <SelectItem value="Asia/Singapore">Singapore (SGT)</SelectItem>
                    <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                    <SelectItem value="Australia/Sydney">Sydney (AEDT)</SelectItem>
                    <SelectItem value="Pacific/Auckland">Auckland (NZDT)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Message times in the Inbox will be displayed in this timezone
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {activeWorkspace && canEditWorkspace && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Workspace Settings
              </CardTitle>
              <CardDescription>
                Customize your workspace name and logo (admin only)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="workspace-name">Workspace Name</Label>
                  <Input
                    id="workspace-name"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    placeholder="Enter workspace name"
                    data-testid="input-workspace-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Workspace Logos</Label>
                  <div className="flex flex-col gap-4">
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Standard Logo (click to adjust)</p>
                      {workspaceLogoPreview ? (
                        <div 
                          className="relative group cursor-pointer inline-block"
                          onClick={() => openCropDialog('horizontal', 'saved')}
                        >
                          <img
                            src={workspaceLogoPreview}
                            alt="Workspace logo"
                            className="h-12 w-auto max-w-[200px] rounded-lg object-contain border bg-muted/20"
                            data-testid="img-workspace-logo"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                            <Move className="h-5 w-5 text-white" />
                          </div>
                          <Button
                            variant="secondary"
                            size="icon"
                            className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadLogo(workspaceLogoPreview, `${workspaceName}-logo.png`);
                            }}
                            data-testid="button-download-horizontal-logo"
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="h-12 w-32 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center bg-muted/50" data-testid="placeholder-workspace-logo">
                          <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Square Icon (click to adjust)</p>
                      {workspaceSquareLogoPreview ? (
                        <div 
                          className="relative group cursor-pointer inline-block"
                          onClick={() => openCropDialog('square', 'saved')}
                        >
                          <img
                            src={workspaceSquareLogoPreview}
                            alt="Square logo"
                            className="h-12 w-12 rounded-lg object-cover border"
                            data-testid="img-workspace-square-logo"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                            <Move className="h-5 w-5 text-white" />
                          </div>
                          <Button
                            variant="secondary"
                            size="icon"
                            className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadLogo(workspaceSquareLogoPreview, `${workspaceName}-icon.png`);
                            }}
                            data-testid="button-download-square-logo"
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="h-12 w-12 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center bg-muted/50" data-testid="placeholder-workspace-square-logo">
                          <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <input
                      type="file"
                      ref={workspaceLogoInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={handleWorkspaceLogoUpload}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => workspaceLogoInputRef.current?.click()}
                      data-testid="button-upload-logo"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Logo
                    </Button>
                    <Dialog open={showLogoDialog} onOpenChange={(open) => {
                      setShowLogoDialog(open);
                      if (!open) {
                        // Reset all state when dialog closes
                        setLogoOptions([]);
                        setSelectedLogoIndex(null);
                        setGeneratedLogos(null);
                        setCroppedLogos({});
                      }
                    }}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid="button-open-logo-dialog"
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          AI Generate Logos
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Generate AI Logos</DialogTitle>
                          <DialogDescription>
                            Create custom logos for your workspace. We'll generate both a standard horizontal logo and a square icon.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="logo-company-name">Company Name</Label>
                            <Input
                              id="logo-company-name"
                              value={logoCompanyName}
                              onChange={(e) => setLogoCompanyName(e.target.value)}
                              placeholder="e.g., Coast to Coast Getaways"
                              data-testid="input-logo-company-name"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="logo-description">Logo Style Description</Label>
                            <Textarea
                              id="logo-description"
                              value={logoDescription}
                              onChange={(e) => setLogoDescription(e.target.value)}
                              placeholder="e.g., modern and minimalist with ocean blue colors, featuring a wave or beach theme"
                              rows={3}
                              data-testid="input-logo-description"
                            />
                            <p className="text-xs text-muted-foreground">
                              Describe the style, colors, and theme you'd like for your logo
                            </p>
                          </div>
                          
                          {/* Step 1: Show 3 logo options to choose from */}
                          {logoOptions.length > 0 && !generatedLogos && (
                            <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
                              <p className="text-sm font-medium">Select your preferred logo or remix to customize:</p>
                              <div className="grid grid-cols-1 gap-3">
                                {logoOptions.map((logo, index) => (
                                  <div
                                    key={index}
                                    className={`relative rounded-lg border-2 p-3 transition-all ${
                                      selectedLogoIndex === index
                                        ? 'border-primary bg-primary/5'
                                        : 'border-muted hover:border-muted-foreground/30'
                                    }`}
                                    data-testid={`logo-option-${index}`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div 
                                        className="flex-1 cursor-pointer"
                                        onClick={() => handleSelectLogo(index)}
                                      >
                                        <img
                                          src={`data:${logo.mimeType};base64,${logo.base64}`}
                                          alt={`Logo option ${index + 1}`}
                                          className="h-14 w-auto rounded border bg-background object-contain"
                                        />
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        {logo.conceptLabel && (
                                          <span className="text-xs text-muted-foreground">{logo.conceptLabel}</span>
                                        )}
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-xs"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setRemixIndex(index);
                                            setRemixPrompt("");
                                          }}
                                          disabled={remixLogoMutation.isPending}
                                          data-testid={`button-remix-logo-${index}`}
                                        >
                                          <RefreshCw className="h-3 w-3 mr-1" />
                                          Remix
                                        </Button>
                                        <Button
                                          variant="default"
                                          size="sm"
                                          className="h-7 text-xs"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSelectLogo(index);
                                          }}
                                          disabled={generateSquareIconMutation.isPending}
                                          data-testid={`button-use-logo-${index}`}
                                        >
                                          <Check className="h-3 w-3 mr-1" />
                                          Use
                                        </Button>
                                      </div>
                                    </div>
                                    {selectedLogoIndex === index && (
                                      <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-1">
                                        <Check className="h-3 w-3" />
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                              
                              {/* Remix dialog inline */}
                              {remixIndex !== null && (
                                <div className="border rounded-lg p-4 bg-background space-y-3">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium">Remix Logo {remixIndex + 1}</p>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={() => {
                                        setRemixIndex(null);
                                        setRemixPrompt("");
                                      }}
                                      data-testid="button-close-remix"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Describe what changes you'd like (e.g., "make the colors brighter", "use a house icon", "more modern font")
                                  </p>
                                  <Textarea
                                    value={remixPrompt}
                                    onChange={(e) => setRemixPrompt(e.target.value)}
                                    placeholder="Describe your changes..."
                                    className="min-h-[60px]"
                                    data-testid="input-remix-prompt"
                                  />
                                  <div className="flex gap-2 justify-end">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setRemixIndex(null);
                                        setRemixPrompt("");
                                      }}
                                      disabled={remixLogoMutation.isPending}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={handleRemixSubmit}
                                      disabled={!remixPrompt.trim() || remixLogoMutation.isPending}
                                      data-testid="button-submit-remix"
                                    >
                                      {remixLogoMutation.isPending ? (
                                        <>
                                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                          Generating...
                                        </>
                                      ) : (
                                        <>
                                          <RefreshCw className="h-3 w-3 mr-1" />
                                          Generate Remix
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              )}
                              
                              {generateSquareIconMutation.isPending && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Generating square icon...
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Step 2: Show final logos after selection */}
                          {generatedLogos && (
                            <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
                              <p className="text-sm font-medium">Generated Logos</p>
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between flex-wrap gap-1">
                                    <p className="text-xs text-muted-foreground">Standard Logo (Horizontal)</p>
                                    <div className="flex gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-xs"
                                        onClick={() => setExpandedLogo('horizontal')}
                                        data-testid="button-expand-horizontal"
                                      >
                                        <Maximize2 className="h-3 w-3 mr-1" />
                                        View
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-xs"
                                        onClick={() => openCropDialog('horizontal')}
                                        data-testid="button-crop-horizontal"
                                      >
                                        <Move className="h-3 w-3 mr-1" />
                                        Crop
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-xs"
                                        onClick={() => {
                                          setEditLogoType('horizontal');
                                          setEditLogoPrompt("");
                                        }}
                                        data-testid="button-edit-horizontal"
                                      >
                                        <Pencil className="h-3 w-3 mr-1" />
                                        Edit
                                      </Button>
                                    </div>
                                  </div>
                                  <div 
                                    className="relative group cursor-pointer inline-block"
                                    onClick={() => setExpandedLogo('horizontal')}
                                  >
                                    <img
                                      src={croppedLogos.horizontal || `data:${generatedLogos.horizontal?.mimeType};base64,${generatedLogos.horizontal?.base64}`}
                                      alt="Generated horizontal logo"
                                      className="h-16 w-auto rounded-lg border bg-background object-contain"
                                    />
                                    <Button
                                      variant="secondary"
                                      size="icon"
                                      className="absolute bottom-1 right-1 h-7 w-7"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDownloadLogo(croppedLogos.horizontal || `data:${generatedLogos.horizontal?.mimeType};base64,${generatedLogos.horizontal?.base64}`, `${logoCompanyName}-logo.png`);
                                      }}
                                      data-testid="button-download-generated-horizontal"
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                  </div>
                                  {croppedLogos.horizontal && (
                                    <p className="text-xs text-green-600 dark:text-green-400">Cropped version saved</p>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between flex-wrap gap-1">
                                    <p className="text-xs text-muted-foreground">Square Icon</p>
                                    <div className="flex gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-xs"
                                        onClick={() => setExpandedLogo('square')}
                                        data-testid="button-expand-square"
                                      >
                                        <Maximize2 className="h-3 w-3 mr-1" />
                                        View
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-xs"
                                        onClick={() => openCropDialog('square')}
                                        data-testid="button-crop-square"
                                      >
                                        <Move className="h-3 w-3 mr-1" />
                                        Crop
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-xs"
                                        onClick={() => {
                                          setEditLogoType('square');
                                          setEditLogoPrompt("");
                                        }}
                                        data-testid="button-edit-square"
                                      >
                                        <Pencil className="h-3 w-3 mr-1" />
                                        Edit
                                      </Button>
                                    </div>
                                  </div>
                                  <div 
                                    className="relative group cursor-pointer w-20 h-20 rounded-lg border bg-background flex items-center justify-center overflow-hidden"
                                    onClick={() => setExpandedLogo('square')}
                                  >
                                    <img
                                      src={croppedLogos.square || `data:${generatedLogos.square?.mimeType};base64,${generatedLogos.square?.base64}`}
                                      alt="Generated square logo"
                                      className="h-full w-full object-cover"
                                    />
                                    <Button
                                      variant="secondary"
                                      size="icon"
                                      className="absolute bottom-1 right-1 h-7 w-7"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDownloadLogo(croppedLogos.square || `data:${generatedLogos.square?.mimeType};base64,${generatedLogos.square?.base64}`, `${logoCompanyName}-icon.png`);
                                      }}
                                      data-testid="button-download-generated-square"
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                  </div>
                                  {croppedLogos.square && (
                                    <p className="text-xs text-green-600 dark:text-green-400">Cropped version saved</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Expanded Logo View Dialog */}
                          <Dialog open={expandedLogo !== null} onOpenChange={() => setExpandedLogo(null)}>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>
                                  {expandedLogo === 'horizontal' ? 'Standard Logo (Horizontal)' : 'Square Icon'}
                                </DialogTitle>
                              </DialogHeader>
                              <div className="flex items-center justify-center p-4 bg-muted/30 rounded-lg min-h-[200px]">
                                {expandedLogo === 'horizontal' && generatedLogos?.horizontal && (
                                  <img
                                    src={`data:${generatedLogos.horizontal.mimeType};base64,${generatedLogos.horizontal.base64}`}
                                    alt="Expanded horizontal logo"
                                    className="max-w-full max-h-[400px] object-contain"
                                    data-testid="img-expanded-horizontal"
                                  />
                                )}
                                {expandedLogo === 'square' && generatedLogos?.square && (
                                  <img
                                    src={`data:${generatedLogos.square.mimeType};base64,${generatedLogos.square.base64}`}
                                    alt="Expanded square logo"
                                    className="max-w-full max-h-[400px] object-contain"
                                    data-testid="img-expanded-square"
                                  />
                                )}
                              </div>
                              <DialogFooter>
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    if (expandedLogo === 'horizontal' && generatedLogos?.horizontal) {
                                      handleDownloadLogo(`data:${generatedLogos.horizontal.mimeType};base64,${generatedLogos.horizontal.base64}`, `${logoCompanyName}-logo.png`);
                                    } else if (expandedLogo === 'square' && generatedLogos?.square) {
                                      handleDownloadLogo(`data:${generatedLogos.square.mimeType};base64,${generatedLogos.square.base64}`, `${logoCompanyName}-icon.png`);
                                    }
                                  }}
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Download
                                </Button>
                                <Button onClick={() => setExpandedLogo(null)}>
                                  Close
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                          
                          {/* Edit Logo Dialog */}
                          <Dialog open={editLogoType !== null} onOpenChange={() => setEditLogoType(null)}>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>
                                  Edit {editLogoType === 'horizontal' ? 'Standard Logo' : 'Square Icon'}
                                </DialogTitle>
                                <DialogDescription>
                                  Describe how you'd like to modify this logo
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="flex justify-center p-4 bg-muted/30 rounded-lg">
                                  {editLogoType === 'horizontal' && generatedLogos?.horizontal && (
                                    <img
                                      src={`data:${generatedLogos.horizontal.mimeType};base64,${generatedLogos.horizontal.base64}`}
                                      alt="Current horizontal logo"
                                      className="max-w-full max-h-[150px] object-contain"
                                    />
                                  )}
                                  {editLogoType === 'square' && generatedLogos?.square && (
                                    <img
                                      src={`data:${generatedLogos.square.mimeType};base64,${generatedLogos.square.base64}`}
                                      alt="Current square logo"
                                      className="max-w-full max-h-[150px] object-contain"
                                    />
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="edit-prompt">Edit Instructions</Label>
                                  <Textarea
                                    id="edit-prompt"
                                    placeholder="e.g., Make the colors more vibrant, add a wave element, use a different font..."
                                    value={editLogoPrompt}
                                    onChange={(e) => setEditLogoPrompt(e.target.value)}
                                    rows={3}
                                    data-testid="input-edit-logo-prompt"
                                  />
                                </div>
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setEditLogoType(null)}>
                                  Cancel
                                </Button>
                                <Button
                                  onClick={() => {
                                    const newDescription = `${logoDescription}. ${editLogoPrompt}`.trim();
                                    setLogoDescription(newDescription);
                                    setEditLogoType(null);
                                    setGeneratedLogos(null);
                                    setLogoOptions([]);
                                    setSelectedLogoIndex(null);
                                    generateLogoOptionsMutation.mutate({ companyName: logoCompanyName, description: newDescription });
                                  }}
                                  disabled={!editLogoPrompt.trim() || generateLogoOptionsMutation.isPending}
                                  data-testid="button-apply-edit"
                                >
                                  {generateLogoOptionsMutation.isPending ? (
                                    <>
                                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                      Regenerating...
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles className="h-4 w-4 mr-2" />
                                      Apply & Regenerate
                                    </>
                                  )}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                          
                        </div>
                        <DialogFooter className="gap-2">
                          {logoOptions.length === 0 && !generatedLogos ? (
                            // Initial state: Generate 3 options button
                            <Button
                              onClick={() => generateLogoOptionsMutation.mutate({ companyName: logoCompanyName, description: logoDescription })}
                              disabled={generateLogoOptionsMutation.isPending || !logoCompanyName.trim()}
                              data-testid="button-generate-logos"
                            >
                              {generateLogoOptionsMutation.isPending ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  Generating 3 options...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-4 w-4 mr-2" />
                                  Generate Logos
                                </>
                              )}
                            </Button>
                          ) : logoOptions.length > 0 && !generatedLogos ? (
                            // Step 1: Selection state - regenerate options button
                            <Button
                              variant="outline"
                              onClick={() => {
                                setLogoOptions([]);
                                setSelectedLogoIndex(null);
                                generateLogoOptionsMutation.mutate({ companyName: logoCompanyName, description: logoDescription });
                              }}
                              disabled={generateLogoOptionsMutation.isPending || generateSquareIconMutation.isPending}
                              data-testid="button-regenerate-logos"
                            >
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Regenerate Options
                            </Button>
                          ) : (
                            // Step 2: Final logos ready
                            <>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setGeneratedLogos(null);
                                  setLogoOptions([]);
                                  setSelectedLogoIndex(null);
                                  generateLogoOptionsMutation.mutate({ companyName: logoCompanyName, description: logoDescription });
                                }}
                                disabled={generateLogoOptionsMutation.isPending}
                                data-testid="button-regenerate-logos"
                              >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Start Over
                              </Button>
                              <Button
                                onClick={handleSaveWorkspaceSettings}
                                disabled={updateWorkspaceMutation.isPending}
                                data-testid="button-use-logos"
                              >
                                {updateWorkspaceMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                  <Check className="h-4 w-4 mr-2" />
                                )}
                                Use These Logos
                              </Button>
                            </>
                          )}
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    {previousLogoState && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleUndoLogoChanges}
                        disabled={updateWorkspaceMutation.isPending}
                        data-testid="button-undo-logo-changes"
                      >
                        <Undo2 className="h-4 w-4 mr-2" />
                        Undo
                      </Button>
                    )}
                    {(workspaceLogoPreview || workspaceSquareLogoPreview) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // Save state for undo before removing
                          setPreviousLogoState({
                            logoUrl: workspaceLogoPreview,
                            squareLogoUrl: workspaceSquareLogoPreview,
                          });
                          setWorkspaceLogoPreview(null);
                          setWorkspaceSquareLogoPreview(null);
                          setGeneratedLogos(null);
                        }}
                        data-testid="button-remove-logos"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Upload your own logo or generate AI logos. The square icon appears in the sidebar navigation.
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveWorkspaceSettings}
                    disabled={
                      updateWorkspaceMutation.isPending ||
                      (workspaceName === activeWorkspace?.name && 
                       workspaceLogoPreview === activeWorkspace?.logoUrl &&
                       workspaceSquareLogoPreview === (activeWorkspace as any)?.squareLogoUrl)
                    }
                    data-testid="button-save-workspace"
                  >
                    {updateWorkspaceMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Changes
                  </Button>
                </div>
                
                {/* Crop Logo Dialog - at workspace settings level for accessibility */}
                <Dialog open={cropLogoType !== null} onOpenChange={() => setCropLogoType(null)}>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>
                        Crop {cropLogoType === 'horizontal' ? 'Standard Logo' : 'Square Icon'}
                      </DialogTitle>
                      <DialogDescription>
                        Drag to position and use zoom to adjust the logo within the frame
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div 
                        className={`relative border-2 border-dashed border-primary/50 rounded-lg overflow-hidden bg-muted/30 mx-auto ${
                          cropLogoType === 'horizontal' ? 'w-full h-24' : 'w-48 h-48'
                        }`}
                        onMouseDown={handleCropMouseDown}
                        onMouseMove={handleCropMouseMove}
                        onMouseUp={handleCropMouseUp}
                        onMouseLeave={handleCropMouseUp}
                        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                      >
                        {cropLogoType === 'horizontal' && (
                          <img
                            src={
                              cropLogoSource === 'generated' && generatedLogos?.horizontal
                                ? `data:${generatedLogos.horizontal.mimeType};base64,${generatedLogos.horizontal.base64}`
                                : workspaceLogoPreview || ''
                            }
                            alt="Crop horizontal logo"
                            className="absolute select-none pointer-events-none"
                            style={{
                              maxWidth: '100%',
                              maxHeight: '100%',
                              objectFit: 'contain',
                              transform: `translate(calc(-50% + ${cropPosition.x}px), calc(-50% + ${cropPosition.y}px)) scale(${cropScale})`,
                              transformOrigin: 'center center',
                              left: '50%',
                              top: '50%',
                            }}
                            draggable={false}
                          />
                        )}
                        {cropLogoType === 'square' && (
                          <img
                            src={
                              cropLogoSource === 'generated' && generatedLogos?.square
                                ? `data:${generatedLogos.square.mimeType};base64,${generatedLogos.square.base64}`
                                : workspaceSquareLogoPreview || ''
                            }
                            alt="Crop square logo"
                            className="absolute select-none pointer-events-none"
                            style={{
                              maxWidth: '100%',
                              maxHeight: '100%',
                              objectFit: 'contain',
                              transform: `translate(calc(-50% + ${cropPosition.x}px), calc(-50% + ${cropPosition.y}px)) scale(${cropScale})`,
                              transformOrigin: 'center center',
                              left: '50%',
                              top: '50%',
                            }}
                            draggable={false}
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground">Zoom:</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setCropScale(s => Math.max(0.5, s - 0.1))}
                          data-testid="button-zoom-out"
                        >
                          <ZoomOut className="h-4 w-4" />
                        </Button>
                        <input
                          type="range"
                          min="0.5"
                          max="2"
                          step="0.1"
                          value={cropScale}
                          onChange={(e) => setCropScale(parseFloat(e.target.value))}
                          className="flex-1"
                          data-testid="input-zoom-slider"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setCropScale(s => Math.min(2, s + 0.1))}
                          data-testid="button-zoom-in"
                        >
                          <ZoomIn className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCropPosition({ x: 0, y: 0 });
                            setCropScale(1);
                          }}
                          data-testid="button-reset-crop"
                        >
                          Reset
                        </Button>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCropLogoType(null)}>
                        Cancel
                      </Button>
                      <Button onClick={saveCroppedLogo} data-testid="button-save-crop">
                        <Check className="h-4 w-4 mr-2" />
                        Save Cropped Version
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                
                {/* Hidden canvas for crop saving */}
                <canvas ref={cropCanvasRef} className="hidden" />
              </div>
            </CardContent>
          </Card>
        )}

        <Separator />

        <Card className="border-dashed border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-background">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Easter Eggs</CardTitle>
            </div>
            <CardDescription>
              Hidden features just for you. Shhh... don't tell anyone!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start gap-4 p-4 rounded-lg bg-card border">
              <div className="p-3 rounded-full bg-primary/10">
                <Music className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="font-semibold">Karen's Farewell Song</h3>
                <p className="text-sm text-muted-foreground">
                  Create a personalized song to bid farewell to your most challenging guests!
                </p>
                
                {latestSong && latestSong.status === "ready" ? (
                  <div className="space-y-4 mt-4">
                    <div className="p-4 rounded-lg bg-muted/50">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <h4 className="font-medium">{latestSong.title}</h4>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              const shareUrl = `${window.location.origin}/song/${latestSong.id}`;
                              navigator.clipboard.writeText(shareUrl);
                              toast({
                                title: "Link copied!",
                                description: "Share this link with anyone - no login required.",
                              });
                              shareSongMutation.mutate(latestSong.id);
                            }}
                            title="Copy shareable link"
                            data-testid="button-share-latest-song"
                          >
                            <Share2 className="h-4 w-4" />
                          </Button>
                          {latestSong.audioUrl && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => downloadSong(latestSong)}
                              title="Download song"
                              data-testid="button-download-latest-song"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {canPlay ? (
                        <div className="space-y-3">
                          {latestSong.audioUrl ? (
                            <audio
                              controls
                              className="w-full"
                              src={latestSong.audioUrl}
                              data-testid="audio-song-player"
                            />
                          ) : (
                            <div className="text-sm text-muted-foreground italic">
                              Audio generation is in progress or unavailable. Lyrics are shown below.
                            </div>
                          )}
                          <details className="text-sm" open={!latestSong.audioUrl}>
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                              {latestSong.audioUrl ? "View Lyrics" : "Lyrics"}
                            </summary>
                            <pre className="mt-2 whitespace-pre-wrap text-muted-foreground p-3 bg-background rounded">
                              {latestSong.lyrics}
                            </pre>
                          </details>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                            <Lock className="h-4 w-4" />
                            <span className="text-sm font-medium">Share to unlock your song!</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Share your song on social media to unlock playback and hear your creation.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => shareToSocial("twitter", latestSong)}
                              data-testid="button-share-twitter"
                            >
                              <SiX className="h-4 w-4 mr-2" />
                              Share on X
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => shareToSocial("facebook", latestSong)}
                              data-testid="button-share-facebook"
                            >
                              <Facebook className="h-4 w-4 mr-2" />
                              Facebook
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => shareToSocial("linkedin", latestSong)}
                              data-testid="button-share-linkedin"
                            >
                              <Linkedin className="h-4 w-4 mr-2" />
                              LinkedIn
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyToClipboard(`${window.location.origin}/song/${latestSong.id}`)}
                              data-testid="button-copy-link"
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Copy Link
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : latestSong && latestSong.status === "generating" ? (
                  <div className="flex items-center gap-2 mt-4 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Your song is being created...</span>
                  </div>
                ) : latestSong && latestSong.status === "failed" ? (
                  <div className="flex items-center gap-2 mt-4 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm">Song generation failed. Try again!</span>
                  </div>
                ) : null}

                <Dialog open={showSongDialog} onOpenChange={(open) => {
                  setShowSongDialog(open);
                  if (!open) resetSongDialog();
                }}>
                  <DialogTrigger asChild>
                    <Button
                      className="mt-2"
                      variant={latestSong ? "outline" : "default"}
                      data-testid="button-create-song"
                    >
                      <Music className="h-4 w-4 mr-2" />
                      {latestSong ? "Create Another Song" : "Confirm My Top Karen"}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>
                        {dialogStep === "karen" && "Karen's Farewell Song"}
                        {dialogStep === "style" && "Choose Your Style"}
                        {dialogStep === "lyrics" && "Summon the Songwriters"}
                        {dialogStep === "create" && "Studio Time"}
                      </DialogTitle>
                      <DialogDescription>
                        {dialogStep === "karen" && "Step 1: Select your top Karen to serenade"}
                        {dialogStep === "style" && "Step 2: Pick the perfect sound for your farewell"}
                        {dialogStep === "lyrics" && "Step 3: Let our AI songwriters craft the perfect lyrics"}
                        {dialogStep === "create" && "Step 4: Record your masterpiece"}
                      </DialogDescription>
                    </DialogHeader>
                    
                    {/* Step 1: Karen Selection */}
                    {dialogStep === "karen" && (
                      <div className="space-y-4 py-4">
                        <p className="text-sm text-muted-foreground">
                          Our AI analyzed your reservations and found your top Karens. Select one to create their farewell song:
                        </p>
                        {worstGuestsLoading ? (
                          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span className="text-sm">Finding your top Karens...</span>
                          </div>
                        ) : worstGuests && worstGuests.length > 0 ? (
                          <div className="space-y-3">
                            {worstGuests.slice(0, 3).map((guest, index) => (
                              <div
                                key={guest.reservationId}
                                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                                  selectedGuest === guest.reservationId
                                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                    : "hover-elevate"
                                }`}
                                onClick={() => setSelectedGuest(guest.reservationId)}
                                data-testid={`karen-option-${guest.reservationId}`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Badge variant={index === 0 ? "default" : "outline"} className="text-xs">
                                      #{index + 1}
                                    </Badge>
                                    <span className="font-semibold">{guest.guestName.split(" ")[0]}</span>
                                  </div>
                                  <Badge variant="destructive" className="text-xs">
                                    {guest.negativeTagCount} issues
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mb-2">
                                  at {guest.listingName}
                                </p>
                                <ul className="text-sm text-muted-foreground space-y-1">
                                  {guest.summary.split(". ").slice(0, 3).map((point, i) => (
                                    <li key={i} className="flex items-start gap-2">
                                      <span className="text-muted-foreground/60">•</span>
                                      <span>{point.replace(/\.$/, "")}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <p className="text-muted-foreground">
                              No Karens found! Your guests have all been wonderful.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Step 2: Style Selection with Tiles */}
                    {dialogStep === "style" && (
                      <div className="space-y-6 py-4">
                        <div className="space-y-3">
                          <Label className="text-base font-medium">Music Style</Label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {musicStyleOptions.map((option) => (
                              <div
                                key={option.value}
                                className={`p-3 rounded-lg border cursor-pointer text-center transition-all ${
                                  musicStyle === option.value
                                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                    : "hover-elevate"
                                }`}
                                onClick={() => setMusicStyle(option.value as MusicStyle)}
                                data-testid={`tile-music-${option.value}`}
                              >
                                <p className="font-medium text-sm">{option.label}</p>
                                <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-base font-medium">Voice Style</Label>
                          <div className="grid grid-cols-2 gap-2">
                            {voiceStyleOptions.map((option) => (
                              <div
                                key={option.value}
                                className={`p-3 rounded-lg border cursor-pointer text-center transition-all ${
                                  voiceStyle === option.value
                                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                    : "hover-elevate"
                                }`}
                                onClick={() => setVoiceStyle(option.value as VoiceStyle)}
                                data-testid={`tile-voice-${option.value}`}
                              >
                                <p className="font-medium text-sm">{option.label}</p>
                                <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 3: Summon Songwriters */}
                    {dialogStep === "lyrics" && (
                      <div className="space-y-6 py-4">
                        <div className="p-4 rounded-lg bg-muted/50 text-center">
                          <Music className="h-12 w-12 mx-auto text-primary mb-3" />
                          <h3 className="font-semibold mb-2">Ready to Write Your Song</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Our AI songwriters will analyze your Karen's reservation and craft the perfect farewell lyrics.
                          </p>
                          <div className="flex flex-wrap gap-2 justify-center text-xs">
                            <Badge variant="outline">
                              {musicStyleOptions.find(s => s.value === musicStyle)?.label}
                            </Badge>
                            <Badge variant="outline">
                              {voiceStyleOptions.find(s => s.value === voiceStyle)?.label}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 4: Studio Time - Create */}
                    {dialogStep === "create" && (
                      <div className="space-y-6 py-4">
                        <div className="space-y-3">
                          <Label>Song Title</Label>
                          <Input
                            value={songTitle}
                            onChange={(e) => setSongTitle(e.target.value)}
                            placeholder="Enter song title"
                            data-testid="input-song-title"
                          />
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label>Lyrics</Label>
                            <Badge variant="outline" className="text-xs">
                              <Wand2 className="h-3 w-3 mr-1" />
                              AI Generated
                            </Badge>
                          </div>
                          <Textarea
                            value={songPrompt}
                            onChange={(e) => setSongPrompt(e.target.value)}
                            placeholder="Your AI-generated lyrics..."
                            className="min-h-[180px] resize-none"
                            data-testid="textarea-song-prompt"
                          />
                          <p className="text-xs text-muted-foreground">
                            Feel free to edit the lyrics before recording!
                          </p>
                        </div>

                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-sm text-muted-foreground">
                            <strong>Style:</strong> {musicStyleOptions.find(s => s.value === musicStyle)?.label} / {voiceStyleOptions.find(s => s.value === voiceStyle)?.label}
                          </p>
                        </div>
                      </div>
                    )}

                    <DialogFooter className="flex justify-between gap-2">
                      {dialogStep !== "karen" ? (
                        <Button variant="outline" onClick={handleBackStep} data-testid="button-back">
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          Back
                        </Button>
                      ) : (
                        <Button variant="outline" onClick={() => setShowSongDialog(false)}>
                          Cancel
                        </Button>
                      )}
                      
                      {dialogStep === "karen" && (
                        <Button
                          onClick={handleNextStep}
                          disabled={!selectedGuest}
                          data-testid="button-next"
                        >
                          <ArrowRight className="h-4 w-4 mr-2" />
                          Next
                        </Button>
                      )}
                      
                      {dialogStep === "style" && (
                        <Button
                          onClick={handleNextStep}
                          data-testid="button-next"
                        >
                          <ArrowRight className="h-4 w-4 mr-2" />
                          Next
                        </Button>
                      )}
                      
                      {dialogStep === "lyrics" && (
                        <Button
                          onClick={handleSummonSongwriters}
                          disabled={generatePromptMutation.isPending}
                          data-testid="button-summon-songwriters"
                        >
                          {generatePromptMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Wand2 className="h-4 w-4 mr-2" />
                          )}
                          Summon the Songwriters
                        </Button>
                      )}
                      
                      {dialogStep === "create" && (
                        <Button
                          onClick={handleCreateSong}
                          disabled={createSongMutation.isPending || !songPrompt || songPrompt.length < 10}
                          data-testid="button-studio-time"
                        >
                          {createSongMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Sparkles className="h-4 w-4 mr-2" />
                          )}
                          Studio Time - Create Song
                        </Button>
                      )}
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Song History Section */}
            {songs && songs.length > 0 && (
              <div className="border-t pt-6">
                <button
                  onClick={() => setShowSongHistory(!showSongHistory)}
                  className="flex items-center justify-between w-full text-left group"
                  data-testid="button-toggle-song-history"
                >
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-semibold">Song History</h3>
                    <Badge variant="secondary" className="ml-2">
                      {songs.filter(s => s.status === "ready").length}
                    </Badge>
                  </div>
                  {showSongHistory ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                
                {showSongHistory && (
                  <div className="mt-4 space-y-4 max-h-[400px] overflow-y-auto">
                    {songs.filter(s => s.status === "ready").map((song) => (
                      <div
                        key={song.id}
                        className="p-4 rounded-lg bg-muted/50 border"
                        data-testid={`song-history-item-${song.id}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium truncate">{song.title || "Untitled Song"}</h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(song.createdAt).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {song.musicStyle && (
                                <Badge variant="outline" className="text-xs">
                                  {musicStyleOptions.find(s => s.value === song.musicStyle)?.label || song.musicStyle}
                                </Badge>
                              )}
                              {song.voiceStyle && (
                                <Badge variant="outline" className="text-xs">
                                  {voiceStyleOptions.find(s => s.value === song.voiceStyle)?.label || song.voiceStyle}
                                </Badge>
                              )}
                              {song.sharedOnSocial === "true" && (
                                <Badge variant="secondary" className="text-xs">
                                  <Share2 className="h-3 w-3 mr-1" />
                                  Shared
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                const shareUrl = `${window.location.origin}/song/${song.id}`;
                                navigator.clipboard.writeText(shareUrl);
                                toast({
                                  title: "Link copied!",
                                  description: "Share this link with anyone - no login required.",
                                });
                                shareSongMutation.mutate(song.id);
                              }}
                              title="Copy shareable link"
                              data-testid={`button-share-song-${song.id}`}
                            >
                              <Share2 className="h-4 w-4" />
                            </Button>
                            {song.audioUrl && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => downloadSong(song)}
                                title="Download song"
                                data-testid={`button-download-song-${song.id}`}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this song?")) {
                                  deleteSongMutation.mutate(song.id);
                                }
                              }}
                              disabled={deleteSongMutation.isPending}
                              title="Delete song"
                              data-testid={`button-delete-song-${song.id}`}
                            >
                              {deleteSongMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-destructive" />
                              )}
                            </Button>
                          </div>
                        </div>
                        
                        {/* Audio Player */}
                        {song.audioUrl ? (
                          <div className="mt-3">
                            <audio
                              controls
                              className="w-full h-8"
                              src={song.audioUrl}
                              data-testid={`audio-player-${song.id}`}
                            />
                          </div>
                        ) : (
                          <div className="mt-3 text-xs text-muted-foreground italic">
                            Audio unavailable
                          </div>
                        )}
                        
                        {/* Lyrics */}
                        {song.lyrics && (
                          <details className="text-sm mt-3">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground text-xs">
                              View Lyrics
                            </summary>
                            <pre className="mt-2 whitespace-pre-wrap text-muted-foreground p-3 bg-background rounded text-xs">
                              {song.lyrics}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                    
                    {songs.filter(s => s.status === "ready").length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No completed songs yet. Create your first song above!
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Image Upload/Crop and AI Headshot Dialog */}
      <Dialog open={showImageDialog} onOpenChange={(open) => {
        if (!open) {
          const hasUnsavedAiEditWork = imageDialogMode === "ai-edit" && (aiEditOriginalImage || aiEditResults.length > 0 || aiEditPrompt);
          const hasUnsavedUploadWork = imageDialogMode === "upload" && uploadedImage;
          const hasUnsavedGenerateWork = imageDialogMode === "ai-generate" && (generatedHeadshot || aiAvatarPrompt.trim());
          
          if (hasUnsavedAiEditWork || hasUnsavedUploadWork || hasUnsavedGenerateWork) {
            const confirmed = window.confirm("You have unsaved changes. Are you sure you want to close? Your work will be lost.");
            if (!confirmed) return;
          }
        }
        setShowImageDialog(open);
        if (!open) resetImageDialog();
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {imageDialogMode === "upload" && "Upload Photo"}
              {imageDialogMode === "ai-edit" && "AI Edit Photo"}
              {imageDialogMode === "ai-generate" && "AI Avatar"}
            </DialogTitle>
            <DialogDescription>
              {imageDialogMode === "upload" && "Upload your photo and crop it to a centered headshot"}
              {imageDialogMode === "ai-edit" && "Upload a photo or selfie, then give AI instructions to edit it as a professional headshot"}
              {imageDialogMode === "ai-generate" && "Describe what you want and AI will create your avatar from scratch - no photo needed"}
            </DialogDescription>
          </DialogHeader>


          {/* Upload Mode */}
          {imageDialogMode === "upload" && (
            <div className="space-y-4">
              {!uploadedImage ? (
                <div 
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover-elevate"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">Click to upload an image</p>
                  <p className="text-xs text-muted-foreground mt-1">JPG, PNG, GIF up to 10MB</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="max-h-96 overflow-auto rounded-lg border flex items-center justify-center bg-muted/30 p-2">
                    <ReactCrop
                      crop={crop}
                      onChange={(c) => setCrop(c)}
                      onComplete={(c) => setCompletedCrop(c)}
                      aspect={1}
                      circularCrop
                    >
                      <img
                        ref={imageRef}
                        src={uploadedImage}
                        alt="Upload preview"
                        onLoad={onImageLoad}
                        style={{ 
                          maxWidth: `${Math.round(400 * photoZoom)}px`,
                          maxHeight: `${Math.round(400 * photoZoom)}px`,
                          width: 'auto',
                          height: 'auto'
                        }}
                      />
                    </ReactCrop>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Label className="text-xs text-muted-foreground w-12">Size</Label>
                      <Slider
                        value={[photoZoom]}
                        onValueChange={([val]) => setPhotoZoom(val)}
                        min={0.5}
                        max={2}
                        step={0.1}
                        className="flex-1"
                        data-testid="slider-photo-zoom"
                      />
                      <span className="text-xs text-muted-foreground w-10 text-right">{Math.round(photoZoom * 100)}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Adjust image size, then drag to position the crop circle</p>
                  </div>
                  <div className="flex justify-between gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setUploadedImage(null);
                        setCrop(undefined);
                        setCompletedCrop(undefined);
                        setPhotoZoom(1);
                      }}
                    >
                      Choose Different
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleApplyUploadedImage}
                      disabled={!completedCrop}
                      data-testid="button-apply-crop"
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Apply
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI Edit Mode - Simple 3-step flow: Upload → Prompt → Review */}
          {imageDialogMode === "ai-edit" && (
            <div className="space-y-4">
              <input
                type="file"
                ref={aiEditFileInputRef}
                onChange={handleAiEditFileSelect}
                accept="image/*"
                className="hidden"
              />
              
              {/* Step indicator */}
              <div className="flex items-center justify-center gap-2 mb-4">
                {["upload", "prompt", "review"].map((step, index) => (
                  <div key={step} className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      aiEditStep === step 
                        ? "bg-primary text-primary-foreground" 
                        : ["upload", "prompt", "review"].indexOf(aiEditStep) > index
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                    }`}>
                      {index + 1}
                    </div>
                    {index < 2 && <div className="w-8 h-0.5 bg-muted" />}
                  </div>
                ))}
              </div>

              {/* Step 1: Upload Photo */}
              {aiEditStep === "upload" && (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <h3 className="font-semibold">Upload Your Photo</h3>
                    <p className="text-sm text-muted-foreground">
                      Upload a photo you'd like AI to edit
                    </p>
                  </div>
                  
                  {!aiEditOriginalImage ? (
                    <div 
                      className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover-elevate"
                      onClick={() => aiEditFileInputRef.current?.click()}
                    >
                      <Camera className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm font-medium">Click to upload your photo</p>
                      <p className="text-xs text-muted-foreground mt-1">JPG, PNG up to 10MB</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex justify-center">
                        <img 
                          src={aiEditOriginalImage} 
                          alt="Your photo" 
                          className="w-40 h-40 rounded-full object-cover border-4 border-primary/20"
                        />
                      </div>
                      <div className="flex justify-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAiEditOriginalImage(null);
                            aiEditFileInputRef.current?.click();
                          }}
                        >
                          Change Photo
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setAiEditStep("prompt")}
                          data-testid="button-next-step"
                        >
                          <ArrowRight className="h-4 w-4 mr-2" />
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Prompt for Edit */}
              {aiEditStep === "prompt" && (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <h3 className="font-semibold">Describe Your Edit</h3>
                    <p className="text-sm text-muted-foreground">
                      Tell AI how to edit your photo
                    </p>
                  </div>
                  
                  <div className="flex justify-center mb-4">
                    <img 
                      src={aiEditOriginalImage || ""} 
                      alt="Your photo" 
                      className="w-24 h-24 rounded-full object-cover border-2 border-muted"
                    />
                  </div>
                  
                  <Textarea
                    value={aiEditPrompt}
                    onChange={(e) => setAiEditPrompt(e.target.value)}
                    placeholder="e.g., 'make it a professional headshot with clean background', 'enhance lighting and make background neutral', 'crop as portrait with soft focus background'..."
                    className="min-h-[100px]"
                    data-testid="textarea-edit-prompt"
                  />
                  
                  <div className="flex justify-between gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setAiEditStep("upload")}
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button
                      onClick={async () => {
                        if (!aiEditOriginalImage) return;
                        setAiEditIsProcessing(true);
                        setAiEditResults([]);
                        try {
                          const prompt = aiEditPrompt || "Make this a professional headshot with a clean, neutral background";
                          const requests = [1, 2, 3].map(() =>
                            fetch("/api/ai/edit-image", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                imageBase64: aiEditOriginalImage,
                                prompt,
                              }),
                            }).then(r => r.json())
                          );
                          const results = await Promise.all(requests);
                          const validResults = results
                            .filter(data => data.success && data.image?.base64)
                            .map(data => `data:${data.image.mimeType || "image/png"};base64,${data.image.base64}`);
                          
                          if (validResults.length > 0) {
                            setAiEditResults(validResults);
                            setAiEditSelectedIndex(null);
                            setAiEditStep("review");
                          } else {
                            toast({
                              title: "Edit failed",
                              description: "Failed to generate edits. Please try again.",
                              variant: "destructive",
                            });
                          }
                        } catch (error) {
                          toast({
                            title: "Error",
                            description: "Failed to process image",
                            variant: "destructive",
                          });
                        } finally {
                          setAiEditIsProcessing(false);
                        }
                      }}
                      disabled={aiEditIsProcessing || !aiEditPrompt.trim()}
                      data-testid="button-generate-edit"
                    >
                      {aiEditIsProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      {aiEditIsProcessing ? "Generating 3 options..." : "Generate 3 Options"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Review - Choose from 3 options */}
              {aiEditStep === "review" && aiEditResults.length > 0 && (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <h3 className="font-semibold">Choose Your Favorite</h3>
                    <p className="text-sm text-muted-foreground">
                      Click an image to view larger, then select your choice
                    </p>
                  </div>
                  
                  {/* Original + 3 options grid */}
                  <div className="grid grid-cols-4 gap-2">
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => setAiEditExpandedImage(-1)}
                        className="focus:outline-none rounded-lg transition-transform hover:scale-105"
                        data-testid="button-expand-original"
                      >
                        <img 
                          src={aiEditOriginalImage || ""} 
                          alt="Original" 
                          className="w-full aspect-square rounded-lg object-cover border-2 border-muted cursor-pointer"
                        />
                      </button>
                      <p className="text-xs text-muted-foreground mt-1">Original</p>
                    </div>
                    {aiEditResults.map((result, index) => (
                      <div key={index} className="text-center">
                        <button
                          type="button"
                          onClick={() => setAiEditExpandedImage(index)}
                          className={`focus:outline-none rounded-lg transition-transform hover:scale-105 ${
                            aiEditSelectedIndex === index ? "ring-2 ring-primary ring-offset-2" : ""
                          }`}
                          data-testid={`button-expand-option-${index + 1}`}
                        >
                          <img 
                            src={result} 
                            alt={`Option ${index + 1}`} 
                            className={`w-full aspect-square rounded-lg object-cover border-2 cursor-pointer ${
                              aiEditSelectedIndex === index ? "border-primary" : "border-muted"
                            }`}
                          />
                        </button>
                        <p className={`text-xs mt-1 ${aiEditSelectedIndex === index ? "text-primary font-medium" : "text-muted-foreground"}`}>
                          Option {index + 1}
                        </p>
                      </div>
                    ))}
                  </div>
                  
                  {/* Expanded image overlay with selection */}
                  {aiEditExpandedImage !== null && (
                    <div 
                      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
                      onClick={() => setAiEditExpandedImage(null)}
                    >
                      <div className="relative max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setAiEditExpandedImage(null)}
                          className="absolute -top-10 right-0 text-white hover:text-gray-300"
                          data-testid="button-close-expanded"
                        >
                          <X className="h-6 w-6" />
                        </button>
                        <div className="bg-card rounded-lg p-4 space-y-3">
                          <div className="flex justify-center gap-1 flex-wrap">
                            <Button
                              variant={aiEditExpandedImage === -1 ? "default" : "outline"}
                              size="sm"
                              onClick={() => setAiEditExpandedImage(-1)}
                            >
                              Original
                            </Button>
                            {aiEditResults.map((_, index) => (
                              <Button
                                key={index}
                                variant={aiEditExpandedImage === index ? "default" : "outline"}
                                size="sm"
                                onClick={() => setAiEditExpandedImage(index)}
                              >
                                Option {index + 1}
                              </Button>
                            ))}
                          </div>
                          <img 
                            src={aiEditExpandedImage === -1 ? (aiEditOriginalImage || "") : aiEditResults[aiEditExpandedImage]} 
                            alt={aiEditExpandedImage === -1 ? "Original" : `Option ${aiEditExpandedImage + 1}`}
                            className="w-full max-h-[50vh] object-contain rounded-lg"
                          />
                          {aiEditExpandedImage !== -1 && (
                            <Button
                              className="w-full"
                              onClick={() => {
                                setAiEditSelectedIndex(aiEditExpandedImage);
                                setAiEditExpandedImage(null);
                              }}
                              data-testid={`button-select-option-${aiEditExpandedImage + 1}`}
                            >
                              <Check className="h-4 w-4 mr-2" />
                              Select Option {aiEditExpandedImage + 1}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Selection indicator */}
                  {aiEditSelectedIndex !== null && (
                    <div className="text-center p-2 bg-primary/10 rounded-lg">
                      <p className="text-sm text-primary font-medium">
                        Option {aiEditSelectedIndex + 1} selected
                      </p>
                    </div>
                  )}
                  
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setAiEditResults([]);
                        setAiEditSelectedIndex(null);
                        setAiEditStep("upload");
                      }}
                      data-testid="button-start-over"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Start Over
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setAiEditResults([]);
                        setAiEditSelectedIndex(null);
                        setAiEditPrompt("");
                        setAiEditStep("prompt");
                      }}
                      data-testid="button-regenerate"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Regenerate
                    </Button>
                    <Button
                      disabled={aiEditSelectedIndex === null}
                      onClick={() => {
                        if (aiEditSelectedIndex !== null) {
                          setAiEditCropImage(aiEditResults[aiEditSelectedIndex]);
                          setAiEditCropZoom(1);
                          setAiEditCropPosition({ x: 0, y: 0 });
                          setAiEditStep("crop");
                        }
                      }}
                      data-testid="button-continue-crop"
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Continue to Crop
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 4: Crop selected image */}
              {aiEditStep === "crop" && aiEditCropImage && (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <h3 className="font-semibold">Preview & Save</h3>
                    <p className="text-sm text-muted-foreground">
                      This is how your profile photo will look
                    </p>
                  </div>
                  
                  {/* Clean circular preview - single circle showing final result */}
                  <div className="flex justify-center">
                    <div className="relative w-48 h-48 rounded-full overflow-hidden border-4 border-primary/20 bg-muted">
                      <img 
                        src={aiEditCropImage} 
                        alt="Profile preview" 
                        className="w-full h-full object-cover"
                        style={{
                          transform: `scale(${aiEditCropZoom}) translate(${aiEditCropPosition.x}px, ${aiEditCropPosition.y}px)`,
                          transformOrigin: "center center",
                        }}
                        draggable={false}
                      />
                    </div>
                  </div>
                  
                  {/* Zoom control */}
                  <div className="flex items-center gap-4 px-4">
                    <ZoomOut className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <input
                      type="range"
                      min="1"
                      max="2"
                      step="0.05"
                      value={aiEditCropZoom}
                      onChange={(e) => setAiEditCropZoom(parseFloat(e.target.value))}
                      className="flex-1"
                      data-testid="slider-zoom"
                    />
                    <ZoomIn className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </div>
                  
                  {/* Position controls - simplified 2x2 grid */}
                  <div className="flex justify-center">
                    <div className="inline-grid grid-cols-3 gap-1">
                      <div />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setAiEditCropPosition(p => ({ ...p, y: p.y + 5 }))}
                        data-testid="button-move-up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <div />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setAiEditCropPosition(p => ({ ...p, x: p.x + 5 }))}
                        data-testid="button-move-left"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setAiEditCropZoom(1);
                          setAiEditCropPosition({ x: 0, y: 0 });
                        }}
                        data-testid="button-reset-position"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setAiEditCropPosition(p => ({ ...p, x: p.x - 5 }))}
                        data-testid="button-move-right"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                      <div />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setAiEditCropPosition(p => ({ ...p, y: p.y - 5 }))}
                        data-testid="button-move-down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <div />
                    </div>
                  </div>
                  
                  <div className="flex justify-between gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setAiEditStep("review")}
                      data-testid="button-back-to-review"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button
                      disabled={aiEditSaving}
                      onClick={async () => {
                        if (!aiEditCropImage || aiEditSaving) return;
                        setAiEditSaving(true);
                        try {
                          // Apply zoom/position transforms to canvas and generate cropped image
                          const img = new Image();
                          img.crossOrigin = "anonymous";
                          await new Promise<void>((resolve, reject) => {
                            img.onload = () => resolve();
                            img.onerror = reject;
                            img.src = aiEditCropImage;
                          });
                          
                          // Create a square canvas for the circular profile photo
                          const canvasSize = 400; // Output size in pixels
                          const previewSize = 192; // Preview size (w-48 = 12rem = 192px)
                          const sizeRatio = canvasSize / previewSize; // Scale factor from preview to canvas
                          
                          const canvas = document.createElement("canvas");
                          canvas.width = canvasSize;
                          canvas.height = canvasSize;
                          const ctx = canvas.getContext("2d");
                          if (!ctx) throw new Error("Failed to get canvas context");
                          
                          // Create circular clipping mask
                          ctx.beginPath();
                          ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
                          ctx.closePath();
                          ctx.clip();
                          
                          // Calculate scaled dimensions to fill the circle (object-cover behavior)
                          const scale = aiEditCropZoom;
                          const aspectRatio = img.width / img.height;
                          let drawWidth, drawHeight;
                          if (aspectRatio > 1) {
                            // Landscape: height fills canvas, width extends
                            drawHeight = canvasSize * scale;
                            drawWidth = drawHeight * aspectRatio;
                          } else {
                            // Portrait: width fills canvas, height extends
                            drawWidth = canvasSize * scale;
                            drawHeight = drawWidth / aspectRatio;
                          }
                          
                          // Center the image with position offset, scaled from preview coordinates to canvas coordinates
                          const offsetX = (canvasSize - drawWidth) / 2 + (aiEditCropPosition.x * sizeRatio * scale);
                          const offsetY = (canvasSize - drawHeight) / 2 + (aiEditCropPosition.y * sizeRatio * scale);
                          
                          ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
                          
                          const croppedDataUrl = canvas.toDataURL("image/png");
                          
                          const response = await fetch("/api/user/profile", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ profileImageUrl: croppedDataUrl }),
                          });
                          if (response.ok) {
                            // Update the form field so the avatar shows the new photo immediately
                            form.setValue("profileImageUrl", croppedDataUrl);
                            await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
                            resetImageDialog();
                            setShowImageDialog(false);
                            toast({
                              title: "Photo saved!",
                              description: "Your profile photo has been updated.",
                            });
                          } else {
                            throw new Error("Failed to save");
                          }
                        } catch (error) {
                          toast({
                            title: "Error",
                            description: "Failed to save photo. Please try again.",
                            variant: "destructive",
                          });
                        } finally {
                          setAiEditSaving(false);
                        }
                      }}
                      data-testid="button-save-photo"
                    >
                      {aiEditSaving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 mr-2" />
                      )}
                      {aiEditSaving ? "Saving..." : "Save Photo"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI Avatar Mode - Create avatar from prompt or random */}
          {imageDialogMode === "ai-generate" && (
            <div className="space-y-4">
              {/* Mode Selection */}
              <div className="grid grid-cols-2 gap-2">
                <div
                  className={`border rounded-lg p-3 cursor-pointer hover-elevate ${aiAvatarMode === "prompt" ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => setAiAvatarMode("prompt")}
                  data-testid="button-avatar-prompt-mode"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Pencil className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Custom Prompt</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Describe your avatar
                  </p>
                </div>
                <div
                  className={`border rounded-lg p-3 cursor-pointer hover-elevate ${aiAvatarMode === "random" ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => setAiAvatarMode("random")}
                  data-testid="button-avatar-random-mode"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Dice5 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Random Character</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Roll the dice
                  </p>
                </div>
              </div>

              {/* Custom Prompt Mode */}
              {aiAvatarMode === "prompt" && (
                <div className="space-y-3">
                  <Label>Describe your avatar</Label>
                  <Textarea
                    value={aiAvatarPrompt}
                    onChange={(e) => setAiAvatarPrompt(e.target.value)}
                    placeholder="e.g., A friendly cartoon dog with glasses, a superhero with a cape, a wise wizard..."
                    className="resize-none"
                    rows={3}
                    data-testid="input-avatar-prompt"
                  />
                </div>
              )}

              {/* Random Mode - Gender Selection */}
              {aiAvatarMode === "random" && (
                <div className="space-y-3">
                  <Label>Character Style</Label>
                  <RadioGroup 
                    value={aiGender} 
                    onValueChange={(val) => setAiGender(val as "male" | "female" | "random")}
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="male" id="gen-male" />
                      <Label htmlFor="gen-male" className="font-normal cursor-pointer">Male</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="female" id="gen-female" />
                      <Label htmlFor="gen-female" className="font-normal cursor-pointer">Female</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="random" id="gen-random" />
                      <Label htmlFor="gen-random" className="font-normal cursor-pointer">
                        <Dice5 className="h-4 w-4 inline mr-1" />
                        Surprise me
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              {/* Generated Result */}
              {generatedHeadshot && (
                <div className="flex justify-center">
                  <div className="relative">
                    <img 
                      src={`data:${generatedHeadshot.mimeType};base64,${generatedHeadshot.base64}`}
                      alt="Generated avatar"
                      className="w-40 h-40 rounded-full object-cover border-4 border-primary/20"
                    />
                    <Badge className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-xs">
                      {generatedHeadshot.characterName}
                    </Badge>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    if (aiAvatarMode === "prompt") {
                      generateHeadshotMutation.mutate({ customPrompt: aiAvatarPrompt });
                    } else {
                      generateHeadshotMutation.mutate({ gender: aiGender });
                    }
                  }}
                  disabled={generateHeadshotMutation.isPending || (aiAvatarMode === "prompt" && !aiAvatarPrompt.trim())}
                  className="flex-1"
                  data-testid="button-generate-avatar"
                >
                  {generateHeadshotMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      {aiAvatarMode === "prompt" ? (
                        <Sparkles className="h-4 w-4 mr-2" />
                      ) : (
                        <Dice5 className="h-4 w-4 mr-2" />
                      )}
                      {generatedHeadshot ? "Try Another" : "Generate Avatar"}
                    </>
                  )}
                </Button>
                {generatedHeadshot && (
                  <Button
                    onClick={handleApplyAiHeadshot}
                    variant="default"
                    data-testid="button-use-generated"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Use This
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
