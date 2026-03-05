import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Sparkles, MapPin, Heart } from "lucide-react";

interface ChangelogEntry {
  id: string;
  title: string;
  description: string;
  location?: string | null;
  hostBenefit?: string | null;
  sentAt?: string | null;
  createdAt?: string | null;
}

export default function Changelog() {
  const { data: entries = [], isLoading } = useQuery<ChangelogEntry[]>({
    queryKey: ["/api/changelog"],
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <Skeleton className="h-10 w-64 mb-8" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const groupedByDate = entries.reduce((groups: Record<string, ChangelogEntry[]>, entry) => {
    const date = entry.sentAt ? format(new Date(entry.sentAt), "MMMM d, yyyy") : "Recent";
    if (!groups[date]) groups[date] = [];
    groups[date].push(entry);
    return groups;
  }, {});

  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-red-400 to-orange-400 mb-4">
          <Sparkles className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold mb-2" data-testid="text-changelog-title">What's New</h1>
        <p className="text-muted-foreground">The latest updates and improvements to HostPulse</p>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">No updates yet. Check back soon!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedByDate).map(([date, dateEntries]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-border" />
                <Badge variant="secondary" className="text-xs font-medium">
                  {date}
                </Badge>
                <div className="h-px flex-1 bg-border" />
              </div>
              
              <div className="space-y-4">
                {dateEntries.map(entry => (
                  <Card key={entry.id} className="overflow-hidden" data-testid={`changelog-entry-${entry.id}`}>
                    <CardContent className="pt-6">
                      <h3 className="text-lg font-semibold mb-2">{entry.title}</h3>
                      <p className="text-muted-foreground mb-4">{entry.description}</p>
                      
                      <div className="flex flex-wrap items-center gap-3">
                        {entry.location && (
                          <Badge variant="outline" className="text-xs">
                            <MapPin className="h-3 w-3 mr-1" />
                            {entry.location}
                          </Badge>
                        )}
                        {entry.hostBenefit && (
                          <span className="text-xs text-green-600 flex items-center gap-1">
                            <Heart className="h-3 w-3" />
                            {entry.hostBenefit}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
