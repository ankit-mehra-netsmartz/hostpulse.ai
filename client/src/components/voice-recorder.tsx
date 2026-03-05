import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, Send, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface VoiceRecorderProps {
  onTranscriptReady: (transcript: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  className?: string;
}

function AudioWaveform({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = 'rgb(15, 23, 42)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        
        // Create gradient from red to green based on volume
        const hue = (dataArray[i] / 255) * 120; // 0 = red, 120 = green
        ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
        
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser]);

  return (
    <canvas 
      ref={canvasRef} 
      width={200} 
      height={40} 
      className="rounded bg-slate-900"
    />
  );
}

export function VoiceRecorder({ 
  onTranscriptReady, 
  onCancel,
  placeholder = "Voice notes will appear here...",
  className = ""
}: VoiceRecorderProps) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [partialTranscript, setPartialTranscript] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // Set up audio analysis for waveform
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 256;
      source.connect(analyserNode);
      setAnalyser(analyserNode);
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        setAnalyser(null);
        
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
        
        if (chunksRef.current.length > 0) {
          setIsProcessing(true);
          setPartialTranscript("Transcribing audio...");
          try {
            const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
            const reader = new FileReader();
            
            reader.onloadend = async () => {
              const base64Audio = (reader.result as string).split(',')[1];
              
              try {
                const response = await apiRequest("POST", "/api/transcribe", {
                  audioBase64: base64Audio,
                  mimeType: 'audio/webm'
                });
                const data = await response.json();
                setTranscript(data.transcript || "");
                setPartialTranscript("");
              } catch (error) {
                console.error("Transcription error:", error);
                toast({
                  title: "Transcription failed",
                  description: "Could not transcribe audio. Please try again or type manually.",
                  variant: "destructive"
                });
                setPartialTranscript("");
              } finally {
                setIsProcessing(false);
              }
            };
            
            reader.readAsDataURL(audioBlob);
          } catch (error) {
            console.error("Error processing audio:", error);
            setIsProcessing(false);
            setPartialTranscript("");
          }
        }
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingDuration(0);
      setPartialTranscript("");
      
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error("Error starting recording:", error);
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to use voice notes.",
        variant: "destructive"
      });
    }
  }, [toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  const handleSubmit = () => {
    if (transcript.trim()) {
      onTranscriptReady(transcript.trim());
      setTranscript("");
      setPartialTranscript("");
    }
  };

  const handleCancel = () => {
    setTranscript("");
    setPartialTranscript("");
    setIsRecording(false);
    setIsProcessing(false);
    setAnalyser(null);
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    onCancel?.();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        {isRecording ? (
          <>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={stopRecording}
              className="gap-2"
              data-testid="button-stop-recording"
            >
              <Square className="h-4 w-4 fill-current" />
              Stop ({formatDuration(recordingDuration)})
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs text-muted-foreground">Listening...</span>
            </div>
            <AudioWaveform analyser={analyser} />
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startRecording}
            disabled={isProcessing}
            className="gap-2"
            data-testid="button-start-recording"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            {isProcessing ? "Processing..." : "Record voice note"}
          </Button>
        )}
      </div>

      {partialTranscript && (
        <div className="p-3 bg-muted/50 rounded-md border border-dashed">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground italic">{partialTranscript}</span>
          </div>
        </div>
      )}

      {(transcript || isProcessing) && !partialTranscript && (
        <div className="space-y-2">
          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={isProcessing ? "Transcribing..." : placeholder}
            disabled={isProcessing}
            className="min-h-[80px]"
            data-testid="textarea-transcript"
          />
          
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={isProcessing}
              data-testid="button-cancel-voice"
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={isProcessing || !transcript.trim()}
              data-testid="button-submit-voice"
            >
              <Send className="h-4 w-4 mr-1" />
              Save note
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
