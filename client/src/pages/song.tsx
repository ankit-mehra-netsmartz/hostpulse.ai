import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Music, Twitter, Facebook, Linkedin, Copy, Share2, Download, Sparkles, ArrowRight } from "lucide-react";
import { SiX } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";

interface SongData {
  id: string;
  title: string | null;
  lyrics: string | null;
  audioUrl: string | null;
  status: string;
  songType: string;
  createdAt: string;
}

export default function SongPage() {
  const [match, params] = useRoute("/song/:id");
  const songId = params?.id;
  const { toast } = useToast();

  const { data: song, isLoading, error } = useQuery<SongData>({
    queryKey: ["/api/songs", songId],
    enabled: !!songId,
  });

  const copyToClipboard = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({
      title: "Copied!",
      description: "Link copied to clipboard.",
    });
  };

  const downloadSong = async () => {
    if (!song?.audioUrl) return;
    try {
      const response = await fetch(song.audioUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${song.title || 'song'}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({
        title: "Download started",
        description: "Your song is being downloaded.",
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Could not download the song. Please try again.",
        variant: "destructive",
      });
    }
  };

  const shareToSocial = (platform: string) => {
    const shareUrl = window.location.href;
    const shareText = `Check out this AI-generated song about short-term rental hosting! "${song?.title}"`;
    
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
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !song) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Music className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Song Not Found</h2>
            <p className="text-muted-foreground">
              This song doesn't exist or has been removed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (song.status !== "ready") {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Song is Being Created</h2>
            <p className="text-muted-foreground">
              This song is still being generated. Please check back soon!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-primary" />
                <div>
                  <h3 className="font-semibold">See what else we can do with AI</h3>
                  <p className="text-sm text-muted-foreground">Create songs, analyze reviews, and optimize your listings</p>
                </div>
              </div>
              <Link href="/">
                <Button data-testid="button-signup-cta">
                  Sign Up for HostPulse
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10 w-fit">
              <Music className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">{song.title || "My Song"}</CardTitle>
            <CardDescription className="flex items-center justify-center gap-2">
              <Badge variant="outline">
                {song.songType === "str_journey" ? "STR Journey" : "Guest Roast"}
              </Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {song.audioUrl && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm text-muted-foreground">Listen</h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={downloadSong}
                    data-testid="button-download-public-song"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
                <audio
                  controls
                  className="w-full"
                  src={song.audioUrl}
                  data-testid="audio-public-song"
                />
              </div>
            )}

            {song.lyrics && (
              <div className="space-y-2">
                <h3 className="font-medium text-sm text-muted-foreground">Lyrics</h3>
                <div className="p-4 rounded-lg bg-muted/50">
                  <pre className="whitespace-pre-wrap text-sm font-sans">
                    {song.lyrics}
                  </pre>
                </div>
              </div>
            )}

            <div className="space-y-2 pt-4 border-t">
              <h3 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
                <Share2 className="h-4 w-4" />
                Share this song
              </h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => shareToSocial("twitter")}
                  data-testid="button-share-twitter-public"
                >
                  <SiX className="h-4 w-4 mr-2" />
                  Share on X
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => shareToSocial("facebook")}
                  data-testid="button-share-facebook-public"
                >
                  <Facebook className="h-4 w-4 mr-2" />
                  Facebook
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => shareToSocial("linkedin")}
                  data-testid="button-share-linkedin-public"
                >
                  <Linkedin className="h-4 w-4 mr-2" />
                  LinkedIn
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={copyToClipboard}
                  data-testid="button-copy-link-public"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link
                </Button>
              </div>
            </div>

            <div className="text-center pt-4 space-y-2">
              <p className="text-xs text-muted-foreground italic">
                This is a real song from a fictitious reservation.
              </p>
              <p className="text-xs text-muted-foreground">
                Created with HostPulse AI Song Creator
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
