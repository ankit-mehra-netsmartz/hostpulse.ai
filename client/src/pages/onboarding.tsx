import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Home, ArrowRight } from "lucide-react";
import { PROPERTY_MANAGEMENT_SOFTWARE } from "@shared/schema";
import hostpulseCrest from "@/assets/hostpulse-crest.png";

const SOFTWARE_OPTIONS = [
  { value: PROPERTY_MANAGEMENT_SOFTWARE.HOSPITABLE, label: "Hospitable" },
  { value: PROPERTY_MANAGEMENT_SOFTWARE.GUESTY, label: "Guesty" },
  { value: PROPERTY_MANAGEMENT_SOFTWARE.HOSTAWAY, label: "Hostaway" },
  { value: PROPERTY_MANAGEMENT_SOFTWARE.OWNERREZ, label: "OwnerRez" },
  { value: PROPERTY_MANAGEMENT_SOFTWARE.LODGIFY, label: "Lodgify" },
  { value: PROPERTY_MANAGEMENT_SOFTWARE.NONE, label: "None" },
  { value: PROPERTY_MANAGEMENT_SOFTWARE.OTHER, label: "Other" },
];

const LISTING_COUNT_OPTIONS = [
  { value: "1-5", label: "1-5 listings" },
  { value: "6-20", label: "6-20 listings" },
  { value: "21-50", label: "21-50 listings" },
  { value: "51-100", label: "51-100 listings" },
  { value: "100+", label: "100+ listings" },
];

export default function Onboarding() {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [software, setSoftware] = useState("");
  const [customSoftware, setCustomSoftware] = useState("");
  const [listingCount, setListingCount] = useState("");
  const [companyName, setCompanyName] = useState("");

  const createWorkspaceMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      propertyManagementSoftware: string;
      customSoftwareName?: string;
      listingCount: string;
    }) => {
      const res = await apiRequest("POST", "/api/workspaces", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      toast({
        title: "Workspace Created",
        description: "Your workspace has been set up successfully!",
      });
      window.location.href = "/";
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create workspace",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    createWorkspaceMutation.mutate({
      name: companyName,
      propertyManagementSoftware: software,
      customSoftwareName: software === "other" ? customSoftware : undefined,
      listingCount,
    });
  };

  const canProceedStep1 = software && (software !== "other" || customSoftware.trim());
  const canProceedStep2 = listingCount;
  const canProceedStep3 = companyName.trim();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center mb-3">
            <img 
              src={hostpulseCrest} 
              alt="HostPulse" 
              className="w-16 h-16 animate-pulse-heartbeat"
            />
          </div>
          <h1 className="text-xl font-bold">Welcome to HostPulse</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Let's set up your workspace to get started
          </p>
        </div>

        <div className="flex justify-center gap-2 mb-4">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`w-3 h-3 rounded-full transition-colors ${
                s === step ? "bg-primary" : s < step ? "bg-primary/50" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <Card data-testid="card-onboarding-step1">
            <CardHeader>
              <CardTitle>Property Management Software</CardTitle>
              <CardDescription>
                Which property management software do you use?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup
                value={software}
                onValueChange={setSoftware}
                className="grid grid-cols-2 gap-3"
              >
                {SOFTWARE_OPTIONS.map((option) => (
                  <div key={option.value}>
                    <RadioGroupItem
                      value={option.value}
                      id={option.value}
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor={option.value}
                      className="flex items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover-elevate cursor-pointer peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5"
                      data-testid={`radio-software-${option.value}`}
                    >
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>

              {software === "other" && (
                <div className="space-y-2 mt-4">
                  <Label htmlFor="custom-software">Software Name</Label>
                  <Input
                    id="custom-software"
                    value={customSoftware}
                    onChange={(e) => setCustomSoftware(e.target.value)}
                    placeholder="Enter your software name"
                    data-testid="input-custom-software"
                  />
                </div>
              )}

              <Button
                className="w-full mt-6"
                onClick={() => setStep(2)}
                disabled={!canProceedStep1}
                data-testid="button-next-step1"
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card data-testid="card-onboarding-step2">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Number of Listings</CardTitle>
              <CardDescription>
                How many active short-term rental listings do you manage?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <RadioGroup
                value={listingCount}
                onValueChange={setListingCount}
                className="grid grid-cols-2 gap-2"
              >
                {LISTING_COUNT_OPTIONS.map((option, index) => (
                  <div key={option.value} className={index === LISTING_COUNT_OPTIONS.length - 1 ? "col-span-2" : ""}>
                    <RadioGroupItem
                      value={option.value}
                      id={`listing-${option.value}`}
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor={`listing-${option.value}`}
                      className="flex items-center justify-center gap-2 rounded-md border-2 border-muted bg-popover py-3 px-4 hover-elevate cursor-pointer peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 text-sm"
                      data-testid={`radio-listings-${option.value}`}
                    >
                      <Home className="w-4 h-4 text-muted-foreground" />
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  data-testid="button-back-step2"
                >
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => setStep(3)}
                  disabled={!canProceedStep2}
                  data-testid="button-next-step2"
                >
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card data-testid="card-onboarding-step3">
            <CardHeader>
              <CardTitle>Company Name</CardTitle>
              <CardDescription>
                This will be the name of your workspace. You can always change it later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company-name">Workspace Name</Label>
                <Input
                  id="company-name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g., Sunset Rentals LLC"
                  data-testid="input-company-name"
                />
              </div>

              <div className="flex gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  data-testid="button-back-step3"
                >
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmit}
                  disabled={!canProceedStep3 || createWorkspaceMutation.isPending}
                  data-testid="button-create-workspace"
                >
                  {createWorkspaceMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Workspace"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
