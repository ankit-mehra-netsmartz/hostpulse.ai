import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ExternalLink } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface HospitableProperty {
  id: string;
  name: string;
  public_name: string;
  picture: string;
  address: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  capacity: {
    max?: number;
    bedrooms?: number;
    bathrooms?: number;
  };
  property_type: string;
  listings?: Array<{
    platform: string;
    platform_id: string;
  }>;
}

interface ExistingListing {
  id: string;
  externalId: string | null;
  name: string;
}

interface PropertySelectorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  properties: HospitableProperty[];
  dataSourceId: string;
  isLoading?: boolean;
  existingListings?: ExistingListing[];
}

export function PropertySelectorSheet({
  open,
  onOpenChange,
  properties,
  dataSourceId,
  isLoading = false,
  existingListings = [],
}: PropertySelectorSheetProps) {
  const [selectedProperties, setSelectedProperties] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const isAlreadyAdded = (propertyId: string) => {
    return existingListings.some(listing => listing.externalId === propertyId);
  };

  const importMutation = useMutation({
    mutationFn: async (propertyIds: string[]) => {
      const selectedProps = properties.filter(p => propertyIds.includes(p.id));
      const response = await apiRequest("POST", "/api/listings/import", {
        dataSourceId,
        properties: selectedProps,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Properties imported",
        description: `Successfully imported ${data.imported} properties for analysis.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/data-sources"] });
      setSelectedProperties(new Set());
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Import failed",
        description: "Failed to import properties. Please try again.",
        variant: "destructive",
      });
    },
  });

  const toggleProperty = (propertyId: string) => {
    const newSelected = new Set(selectedProperties);
    if (newSelected.has(propertyId)) {
      newSelected.delete(propertyId);
    } else {
      newSelected.add(propertyId);
    }
    setSelectedProperties(newSelected);
  };

  const handleImport = () => {
    if (selectedProperties.size === 0) return;
    importMutation.mutate(Array.from(selectedProperties));
  };

  const getPlatformBadge = (property: HospitableProperty) => {
    if (!property.listings || property.listings.length === 0) {
      return null;
    }
    const platform = property.listings[0].platform;
    return (
      <Badge variant="secondary" className="text-xs">
        {platform.charAt(0).toUpperCase() + platform.slice(1)}
      </Badge>
    );
  };

  const getAddressString = (address: HospitableProperty["address"]) => {
    const parts = [address.city, address.state, address.country].filter(Boolean);
    return parts.join(", ") || "No address";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add Listings to Analyze</SheetTitle>
          <SheetDescription>
            Select properties from your connected accounts to run listing analysis.
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <ScrollArea className="h-[calc(100vh-200px)] mt-6">
              <div className="space-y-3 pr-4">
                {properties.map((property) => {
                  const alreadyAdded = isAlreadyAdded(property.id);
                  return (
                    <div
                      key={property.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${alreadyAdded ? 'opacity-70' : 'hover-elevate cursor-pointer'}`}
                      onClick={() => !alreadyAdded && toggleProperty(property.id)}
                      data-testid={`property-item-${property.id}`}
                    >
                      {!alreadyAdded && (
                        <Checkbox
                          checked={selectedProperties.has(property.id)}
                          onCheckedChange={() => toggleProperty(property.id)}
                          className="mt-1"
                          data-testid={`checkbox-property-${property.id}`}
                        />
                      )}
                      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                        {property.picture ? (
                          <img
                            src={property.picture}
                            alt={property.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-medium text-sm leading-tight line-clamp-2">
                            {property.public_name || property.name}
                          </h4>
                          <a
                            href="#"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground flex-shrink-0"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {getPlatformBadge(property)}
                          {alreadyAdded && (
                            <Badge variant="outline" className="text-xs text-primary border-primary">
                              Analysis Connected
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {properties.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No properties found in your Hospitable account.
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="pt-4 border-t mt-4">
              <Button
                onClick={handleImport}
                disabled={selectedProperties.size === 0 || importMutation.isPending}
                className="w-full"
                data-testid="button-import-properties"
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  `Import ${selectedProperties.size} ${selectedProperties.size === 1 ? "Property" : "Properties"}`
                )}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
