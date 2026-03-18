import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Building2, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/contexts/notifications-context";
import type { DataSource } from "@shared/schema";

interface HospitableProperty {
  id: string;
  name: string;
  public_name?: string;
  picture?: string;
  property_type?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  listings?: Array<{
    platform?: string;
    platform_id?: string;
  }>;
}

interface ExistingListing {
  id: string;
  externalId: string | null;
  name: string;
}

interface AddListingsToAnalyzeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddListingsToAnalyzeSheet({
  open,
  onOpenChange,
}: AddListingsToAnalyzeSheetProps) {
  const [selectedProperties, setSelectedProperties] = useState<Set<string>>(new Set());
  const [isStarting, setIsStarting] = useState(false);
  const { toast } = useToast();
  const { startBackgroundAnalysis } = useNotifications();

  // Reset selections when sheet opens/closes
  useEffect(() => {
    if (!open) {
      setSelectedProperties(new Set());
    }
  }, [open]);

  const { data: dataSources, isLoading: isLoadingDataSources } = useQuery<DataSource[]>({
    queryKey: ["/api/data-sources"],
    enabled: open,
  });

  const connectedSource = dataSources?.find(
    (ds) => ds.isConnected && ds.provider === "hospitable"
  );

  const { data: propertiesResponse, isLoading: isLoadingProperties, error: propertiesError } =
    useQuery<{ data: HospitableProperty[] }>({
      queryKey: ["/api/data-sources", connectedSource?.id, "properties"],
      queryFn: async () => {
        const res = await apiRequest(
          "GET",
          `/api/data-sources/${connectedSource!.id}/properties`
        );
        return res.json();
      },
      enabled: open && !!connectedSource?.id,
    });

  const { data: existingListings } = useQuery<ExistingListing[]>({
    queryKey: ["/api/listings"],
    enabled: open,
  });

  const hospProperties: HospitableProperty[] = propertiesResponse?.data || [];

  const isAlreadyImported = (propertyId: string) =>
    (existingListings ?? []).some((l) => l.externalId === propertyId);

  const getImportedListing = (propertyId: string) =>
    (existingListings ?? []).find((l) => l.externalId === propertyId);

  const getAddressString = (address: HospitableProperty["address"]) => {
    if (!address) return "";
    const parts = [address.city, address.state, address.country].filter(Boolean);
    return parts.join(", ");
  };

  const toggleProperty = (propertyId: string) => {
    setSelectedProperties((prev) => {
      const next = new Set(prev);
      if (next.has(propertyId)) {
        next.delete(propertyId);
      } else {
        next.add(propertyId);
      }
      return next;
    });
  };

  const selectAll = () => {
    const ids = hospProperties.map((p) => p.id);
    setSelectedProperties(new Set(ids));
  };

  const clearAll = () => setSelectedProperties(new Set());

  const handleStartAnalysis = async () => {
    if (selectedProperties.size === 0 || !connectedSource) return;

    setIsStarting(true);
    try {
      const selectedProps = hospProperties.filter((p) => selectedProperties.has(p.id));

      // Split into already-imported and new properties
      const alreadyImported: Array<{ listing: ExistingListing; property: HospitableProperty }> = [];
      const newProps: HospitableProperty[] = [];

      for (const prop of selectedProps) {
        const existing = getImportedListing(prop.id);
        if (existing) {
          alreadyImported.push({ listing: existing, property: prop });
        } else {
          newProps.push(prop);
        }
      }

      // Import any new properties first
      let newlyImportedListings: ExistingListing[] = [];
      if (newProps.length > 0) {
        const importRes = await apiRequest("POST", "/api/listings/import", {
          dataSourceId: connectedSource.id,
          properties: newProps,
        });

        if (!importRes.ok) {
          const err = await importRes.json().catch(() => ({ message: "Import failed" }));
          throw new Error(err.message || "Failed to import properties");
        }

        const importData = await importRes.json();
        newlyImportedListings = importData.listings || [];
        queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      }

      // Collect all listing IDs to analyze
      const listingsToAnalyze: Array<{ id: string; name: string }> = [
        ...alreadyImported.map(({ listing, property }) => ({
          id: listing.id,
          name: property.public_name || property.name,
        })),
        ...newlyImportedListings.map((l) => ({
          id: l.id,
          name: l.name,
        })),
      ];

      if (listingsToAnalyze.length === 0) {
        toast({
          title: "Nothing to analyze",
          description: "Could not resolve listing IDs for the selected properties.",
          variant: "destructive",
        });
        setIsStarting(false);
        return;
      }

      // Register all analyses as background and fire in parallel
      const analysisPromises = listingsToAnalyze.map(async ({ id, name }) => {
        startBackgroundAnalysis(id, name);
        try {
          await apiRequest("POST", `/api/listings/${id}/analyze`, {});
        } catch {
          // Individual failures won't block others; background card polls for completion
        }
      });

      // Fire all in parallel, don't await (best-effort background)
      Promise.all(analysisPromises).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/listings/stats"] });
      });

      toast({
        title: "Analysis started",
        description: `Started analysis for ${listingsToAnalyze.length} listing${listingsToAnalyze.length !== 1 ? "s" : ""}. Progress is shown in the bottom-right corner.`,
      });

      onOpenChange(false);
    } catch (err: unknown) {
      toast({
        title: "Failed to start analysis",
        description: err instanceof Error ? err.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsStarting(false);
    }
  };

  const isLoading = isLoadingDataSources || isLoadingProperties;

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!connectedSource) {
      return (
        <div className="py-8 px-1">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No connected accounts found. Please connect your Hospitable account in{" "}
              <a href="/data-sources" className="underline font-medium">
                Data Sources
              </a>{" "}
              to add listings for analysis.
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    if (propertiesError) {
      return (
        <div className="py-8 px-1">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load properties from your connected account. Please try again.
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    if (hospProperties.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
          <Building2 className="w-10 h-10 text-muted-foreground" />
          <p className="font-medium">No properties found</p>
          <p className="text-sm text-muted-foreground">
            No properties were found in your connected Hospitable account.
          </p>
        </div>
      );
    }

    return (
      <>
        {/* Select / Clear all */}
        <div className="flex items-center justify-between py-2 mb-1">
          <span className="text-sm text-muted-foreground">
            {hospProperties.length} propert{hospProperties.length !== 1 ? "ies" : "y"} found
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={selectAll} className="h-7 text-xs">
              Select all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              disabled={selectedProperties.size === 0}
              className="h-7 text-xs"
            >
              Clear
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-280px)]">
          <div className="space-y-2 pr-2">
            {hospProperties.map((property) => {
              const alreadyImported = isAlreadyImported(property.id);
              const isSelected = selectedProperties.has(property.id);
              const address = getAddressString(property.address);
              const platform = property.listings?.[0]?.platform;

              return (
                <div
                  key={property.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/40 hover:border-border"
                  }`}
                  onClick={() => toggleProperty(property.id)}
                  data-testid={`property-item-${property.id}`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleProperty(property.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 flex-shrink-0"
                    data-testid={`checkbox-property-${property.id}`}
                  />

                  {/* Thumbnail */}
                  <div className="w-14 h-14 rounded-md overflow-hidden flex-shrink-0 bg-muted">
                    {property.picture ? (
                      <img
                        src={property.picture}
                        alt={property.public_name || property.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-medium text-sm leading-snug line-clamp-2">
                        {property.public_name || property.name}
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    </div>
                    {address && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{address}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {platform && (
                        <Badge variant="secondary" className="text-xs py-0 h-4">
                          {platform.charAt(0).toUpperCase() + platform.slice(1)}
                        </Badge>
                      )}
                      {alreadyImported && (
                        <Badge variant="outline" className="text-xs py-0 h-4 text-primary border-primary/50">
                          Already added
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="pt-4 border-t mt-3 space-y-2">
          {selectedProperties.size > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              {selectedProperties.size} propert{selectedProperties.size !== 1 ? "ies" : "y"} selected
              {Array.from(selectedProperties).some((id) => !isAlreadyImported(id)) && (
                <> &mdash; new listings will be imported automatically</>
              )}
            </p>
          )}
          <Button
            onClick={handleStartAnalysis}
            disabled={selectedProperties.size === 0 || isStarting}
            className="w-full"
            data-testid="button-start-analysis"
          >
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              `Start Analysis${selectedProperties.size > 0 ? ` (${selectedProperties.size})` : ""}`
            )}
          </Button>
        </div>
      </>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Select Properties to Analyze</SheetTitle>
          <SheetDescription>
            Choose properties from your connected accounts to run AI-powered listing analysis.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 flex flex-col mt-4 overflow-hidden">{renderContent()}</div>
      </SheetContent>
    </Sheet>
  );
}
