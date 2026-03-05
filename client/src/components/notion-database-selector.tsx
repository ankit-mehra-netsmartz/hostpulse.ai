import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Database, Loader2, Check, Plus, FileText, ArrowLeft } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface NotionDatabase {
  id: string;
  name: string;
  icon?: string;
}

interface NotionPage {
  id: string;
  name: string;
  icon?: string;
}

interface NotionDatabaseSelectorProps {
  currentDatabaseId?: string;
  currentDatabaseName?: string;
  trigger?: React.ReactNode;
  onSelect?: (databaseId: string, databaseName: string) => void;
  title?: string;
  description?: string;
  databaseType?: "tags" | "reservations" | "tasks";
}

export function NotionDatabaseSelector({
  currentDatabaseId,
  currentDatabaseName,
  trigger,
  onSelect,
  title = "Select Notion Database",
  description = "Choose a database to sync data to.",
  databaseType = "tags",
}: NotionDatabaseSelectorProps) {
  const [open, setOpen] = useState(false);
  const [selectedDb, setSelectedDb] = useState<NotionDatabase | null>(null);
  const [mode, setMode] = useState<"select" | "create">("select");
  const [selectedPage, setSelectedPage] = useState<NotionPage | null>(null);
  const [newDbName, setNewDbName] = useState("");
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<{ databases: NotionDatabase[] }>({
    queryKey: ["/api/notion/databases"],
    enabled: open && mode === "select",
  });

  const { data: pagesData, isLoading: pagesLoading } = useQuery<{ pages: NotionPage[] }>({
    queryKey: ["/api/notion/pages"],
    enabled: open && mode === "create",
  });

  const selectMutation = useMutation({
    mutationFn: async (db: NotionDatabase) => {
      await apiRequest("POST", "/api/notion/database", {
        databaseId: db.id,
        databaseName: db.name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notion/connection"] });
      toast({
        title: "Database Selected",
        description: `Data will now sync to ${selectedDb?.name || "the selected database"}.`,
      });
      setOpen(false);
      resetState();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to select database. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async ({ parentPageId, databaseName }: { parentPageId: string; databaseName: string }) => {
      return apiRequest("POST", "/api/notion/create-database", {
        parentPageId,
        databaseType,
        databaseName,
      });
    },
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/notion/connection"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notion/databases"] });
      toast({
        title: "Database Created",
        description: `"${data.database?.name}" has been created and selected for syncing.`,
      });
      setOpen(false);
      resetState();
    },
    onError: (error: Error) => {
      toast({
        title: "Error Creating Database",
        description: error.message || "Failed to create database in Notion. Make sure the integration has access to the selected page.",
        variant: "destructive",
      });
    },
  });

  const resetState = () => {
    setMode("select");
    setSelectedDb(null);
    setSelectedPage(null);
    setNewDbName("");
  };

  const handleSelect = (db: NotionDatabase) => {
    setSelectedDb(db);
  };

  const handleConfirm = () => {
    if (selectedDb) {
      if (onSelect) {
        onSelect(selectedDb.id, selectedDb.name);
        setOpen(false);
        resetState();
      } else {
        selectMutation.mutate(selectedDb);
      }
    }
  };

  const handleCreateDatabase = () => {
    if (selectedPage) {
      const defaultNames = {
        tags: "HostPulse Tags",
        reservations: "HostPulse Reservations",
        tasks: "HostPulse Tasks",
      };
      createMutation.mutate({
        parentPageId: selectedPage.id,
        databaseName: newDbName || defaultNames[databaseType],
      });
    }
  };

  const getDefaultDbName = () => {
    const names = {
      tags: "HostPulse Tags",
      reservations: "HostPulse Reservations",
      tasks: "HostPulse Tasks",
    };
    return names[databaseType];
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetState();
    }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" data-testid="button-select-notion-database">
            <Database className="w-4 h-4 mr-2" />
            {currentDatabaseName ? "Change Database" : "Select Database"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? (
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={() => setMode("select")}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                Create New Database
              </div>
            ) : (
              title
            )}
          </DialogTitle>
          <DialogDescription>
            {mode === "create" 
              ? "Select a page where the new database will be created."
              : description
            }
          </DialogDescription>
        </DialogHeader>
        
        {mode === "select" ? (
          <>
            <div className="py-4">
              <button
                onClick={() => setMode("create")}
                className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors mb-3 border-2 border-dashed border-primary/30 hover:border-primary/50 hover:bg-primary/5"
                data-testid="button-create-new-database"
              >
                <div className="w-8 h-8 rounded flex items-center justify-center bg-primary/10">
                  <Plus className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1">
                  <span className="font-medium">Create New Database</span>
                  <p className="text-xs text-muted-foreground">Auto-configured with the right columns</p>
                </div>
              </button>
              
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : error ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Failed to load databases.</p>
                  <p className="text-sm">Make sure you have databases shared with the integration.</p>
                </div>
              ) : data?.databases.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <p className="text-sm">No existing databases found.</p>
                  <p className="text-sm mt-1">Click "Create New Database" above to get started.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  <p className="text-xs text-muted-foreground px-1 mb-2">Or select an existing database:</p>
                  {data?.databases.map((db) => (
                    <button
                      key={db.id}
                      onClick={() => handleSelect(db)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                        "hover-elevate",
                        selectedDb?.id === db.id
                          ? "bg-primary/10 border border-primary/20"
                          : "bg-muted/50 border border-transparent"
                      )}
                      data-testid={`button-select-database-${db.id}`}
                    >
                      <div className="w-8 h-8 rounded flex items-center justify-center bg-background">
                        {db.icon ? (
                          <span className="text-lg">{db.icon}</span>
                        ) : (
                          <Database className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <span className="flex-1 font-medium">{db.name}</span>
                      {(selectedDb?.id === db.id || currentDatabaseId === db.id) && (
                        <Check className="w-4 h-4 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!selectedDb || selectMutation.isPending}
              >
                {selectMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Confirm"
                )}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="db-name">Database Name</Label>
                <Input
                  id="db-name"
                  placeholder={getDefaultDbName()}
                  value={newDbName}
                  onChange={(e) => setNewDbName(e.target.value)}
                  data-testid="input-new-database-name"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Select Parent Page</Label>
                {pagesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : pagesData?.pages.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground border rounded-lg">
                    <p className="text-sm">No pages found.</p>
                    <p className="text-xs mt-1">Share a page with the HostPulse integration in Notion first.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {pagesData?.pages.map((page) => (
                      <button
                        key={page.id}
                        onClick={() => setSelectedPage(page)}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                          "hover-elevate",
                          selectedPage?.id === page.id
                            ? "bg-primary/10 border border-primary/20"
                            : "bg-muted/50 border border-transparent"
                        )}
                        data-testid={`button-select-page-${page.id}`}
                      >
                        <div className="w-8 h-8 rounded flex items-center justify-center bg-background">
                          {page.icon ? (
                            <span className="text-lg">{page.icon}</span>
                          ) : (
                            <FileText className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <span className="flex-1 font-medium">{page.name}</span>
                        {selectedPage?.id === page.id && (
                          <Check className="w-4 h-4 text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setMode("select")}>
                Back
              </Button>
              <Button
                onClick={handleCreateDatabase}
                disabled={!selectedPage || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Database
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
