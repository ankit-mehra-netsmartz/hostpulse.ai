import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Loader2 } from "lucide-react";

interface NoAnalysisYetProps {
  onAnalyze: () => void;
  isAnalyzing: boolean;
  listingName?: string;
}

export function NoAnalysisYet({ onAnalyze, isAnalyzing, listingName }: NoAnalysisYetProps) {
  return (
    <Card>
      <CardContent className="py-12">
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-16 h-16 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-purple-500" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">No Analysis Yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Click the Analyze button to get AI-powered insights about 
              {listingName ? ` ${listingName}'s` : " this listing's"} performance across multiple categories.
            </p>
          </div>
          <Button 
            onClick={onAnalyze} 
            disabled={isAnalyzing} 
            data-testid="button-analyze-empty"
          >
            {isAnalyzing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Start Analysis
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
