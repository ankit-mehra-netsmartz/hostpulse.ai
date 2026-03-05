import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Folder,
  MoreVertical,
  Pencil,
  Trash2,
  FileText,
  Image,
  Video,
  Link as LinkIcon,
  Upload,
  ExternalLink,
  ArrowLeft,
  Loader2,
  FolderOpen,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Folder as FolderType, FolderItem, FolderWithItems } from "@shared/schema";

const ITEM_TYPE_ICONS: Record<string, React.ReactNode> = {
  pdf: <FileText className="h-4 w-4 text-red-500" />,
  image: <Image className="h-4 w-4 text-blue-500" />,
  video: <Video className="h-4 w-4 text-purple-500" />,
  link: <LinkIcon className="h-4 w-4 text-green-500" />,
};

export default function FoldersPage() {
  const { toast } = useToast();
  const [selectedFolder, setSelectedFolder] = useState<FolderWithItems | null>(null);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addItemType, setAddItemType] = useState<"file" | "link">("link");
  const [editingFolder, setEditingFolder] = useState<FolderType | null>(null);

  const [newFolder, setNewFolder] = useState({ name: "", description: "" });
  const [newItem, setNewItem] = useState({
    name: "",
    description: "",
    linkUrl: "",
    linkType: "video",
    fileUrl: "",
    fileType: "",
  });

  const { data: folders = [], isLoading } = useQuery<FolderType[]>({
    queryKey: ["/api/folders"],
  });

  const { data: folderDetails } = useQuery<FolderWithItems>({
    queryKey: ["/api/folders", selectedFolder?.id],
    enabled: !!selectedFolder?.id,
  });

  const createFolderMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      return apiRequest("POST", "/api/folders", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setCreateFolderOpen(false);
      setNewFolder({ name: "", description: "" });
      toast({ title: "Folder created", description: "Your new folder has been created." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create folder", variant: "destructive" });
    },
  });

  const updateFolderMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<FolderType> }) => {
      return apiRequest("PATCH", `/api/folders/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setEditingFolder(null);
      toast({ title: "Folder updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update folder", variant: "destructive" });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/folders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      if (selectedFolder) setSelectedFolder(null);
      toast({ title: "Folder deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete folder", variant: "destructive" });
    },
  });

  const createItemMutation = useMutation({
    mutationFn: async ({ folderId, data }: { folderId: string; data: any }) => {
      return apiRequest("POST", `/api/folders/${folderId}/items`, data);
    },
    onSuccess: () => {
      if (selectedFolder) {
        queryClient.invalidateQueries({ queryKey: ["/api/folders", selectedFolder.id] });
      }
      setAddItemOpen(false);
      setNewItem({ name: "", description: "", linkUrl: "", linkType: "video", fileUrl: "", fileType: "" });
      toast({ title: "Item added", description: "Your item has been added to the folder." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add item", variant: "destructive" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/folder-items/${id}`);
    },
    onSuccess: () => {
      if (selectedFolder) {
        queryClient.invalidateQueries({ queryKey: ["/api/folders", selectedFolder.id] });
      }
      toast({ title: "Item deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete item", variant: "destructive" });
    },
  });

  const handleAddItem = () => {
    if (!selectedFolder) return;
    
    const data = {
      type: addItemType,
      name: newItem.name,
      description: newItem.description || undefined,
      ...(addItemType === "link" ? {
        linkUrl: newItem.linkUrl,
        linkType: newItem.linkType,
      } : {
        fileUrl: newItem.fileUrl,
        fileType: newItem.fileType,
      }),
    };

    createItemMutation.mutate({ folderId: selectedFolder.id, data });
  };

  const getItemIcon = (item: FolderItem) => {
    if (item.type === "link") {
      return ITEM_TYPE_ICONS.link;
    }
    if (item.fileType === "pdf") {
      return ITEM_TYPE_ICONS.pdf;
    }
    if (item.mimeType?.startsWith("image/")) {
      return ITEM_TYPE_ICONS.image;
    }
    if (item.mimeType?.startsWith("video/")) {
      return ITEM_TYPE_ICONS.video;
    }
    return <FileText className="h-4 w-4 text-muted-foreground" />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Folder Detail View
  if (selectedFolder) {
    const currentFolder = folderDetails || selectedFolder;
    
    return (
      <div className="flex-1 overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedFolder(null)}
            data-testid="button-back-to-folders"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Assets
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FolderOpen className="h-6 w-6 text-primary" />
              {currentFolder.name}
            </h1>
            {currentFolder.description && (
              <p className="text-muted-foreground mt-1">{currentFolder.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => { setAddItemType("link"); setAddItemOpen(true); }} data-testid="button-add-link">
              <LinkIcon className="h-4 w-4 mr-2" />
              Add Link
            </Button>
            <Button variant="outline" onClick={() => { setAddItemType("file"); setAddItemOpen(true); }} data-testid="button-add-file">
              <Upload className="h-4 w-4 mr-2" />
              Add File
            </Button>
          </div>
        </div>

        {currentFolder.items && currentFolder.items.length > 0 ? (
          <div className="grid gap-3">
            {currentFolder.items.map((item) => (
              <Card key={item.id} className="hover-elevate" data-testid={`card-item-${item.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-muted rounded-md">
                        {getItemIcon(item)}
                      </div>
                      <div>
                        <h3 className="font-medium" data-testid={`text-item-name-${item.id}`}>{item.name}</h3>
                        {item.description && (
                          <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className="text-xs">
                            {item.type === "link" ? item.linkType : item.fileType}
                          </Badge>
                          {item.type === "link" && item.linkUrl && (
                            <a 
                              href={item.linkUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-xs text-primary flex items-center gap-1 hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Open Link
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-item-menu-${item.id}`}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          onClick={() => deleteItemMutation.mutate(item.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center border-dashed">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">No items yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add links to videos, documents, or upload files to this folder.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button onClick={() => { setAddItemType("link"); setAddItemOpen(true); }}>
                <LinkIcon className="h-4 w-4 mr-2" />
                Add Link
              </Button>
              <Button variant="outline" onClick={() => { setAddItemType("file"); setAddItemOpen(true); }}>
                <Upload className="h-4 w-4 mr-2" />
                Add File
              </Button>
            </div>
          </Card>
        )}

        {/* Add Item Dialog */}
        <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {addItemType === "link" ? "Add Link" : "Add File"}
              </DialogTitle>
              <DialogDescription>
                {addItemType === "link" 
                  ? "Add a link to a video, document, or external resource."
                  : "Upload a PDF or image file."
                }
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="item-name">Name</Label>
                <Input
                  id="item-name"
                  placeholder="Item name"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  data-testid="input-item-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-description">Description (optional)</Label>
                <Textarea
                  id="item-description"
                  placeholder="Brief description"
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  data-testid="input-item-description"
                />
              </div>
              {addItemType === "link" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="link-url">URL</Label>
                    <Input
                      id="link-url"
                      placeholder="https://..."
                      value={newItem.linkUrl}
                      onChange={(e) => setNewItem({ ...newItem, linkUrl: e.target.value })}
                      data-testid="input-link-url"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="link-type">Type</Label>
                    <select
                      id="link-type"
                      value={newItem.linkType}
                      onChange={(e) => setNewItem({ ...newItem, linkType: e.target.value })}
                      className="w-full p-2 border rounded-md bg-background"
                      data-testid="select-link-type"
                    >
                      <option value="video">Video</option>
                      <option value="document">Document</option>
                      <option value="website">Website</option>
                      <option value="training">Training Material</option>
                    </select>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="file-url">File URL</Label>
                  <Input
                    id="file-url"
                    placeholder="Paste file URL or upload..."
                    value={newItem.fileUrl}
                    onChange={(e) => setNewItem({ ...newItem, fileUrl: e.target.value })}
                    data-testid="input-file-url"
                  />
                  <p className="text-xs text-muted-foreground">
                    File upload integration coming soon. For now, paste the URL of your file.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddItemOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAddItem}
                disabled={!newItem.name || (addItemType === "link" ? !newItem.linkUrl : !newItem.fileUrl) || createItemMutation.isPending}
                data-testid="button-submit-item"
              >
                {createItemMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Item
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      </div>
    );
  }

  // Assets List View
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Assets</h1>
          <p className="text-muted-foreground">Organize files, documents, and links for your team.</p>
        </div>
        <Button onClick={() => setCreateFolderOpen(true)} data-testid="button-create-folder">
          <Plus className="h-4 w-4 mr-2" />
          Create Folder
        </Button>
      </div>

      {folders.length === 0 ? (
        <Card className="p-8 text-center">
          <Folder className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-medium mb-2">No folders yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create folders to organize your training materials, documents, and links.
          </p>
          <Button onClick={() => setCreateFolderOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Folder
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {folders.map((folder) => (
            <Card 
              key={folder.id} 
              className="hover-elevate cursor-pointer"
              onClick={() => setSelectedFolder(folder as FolderWithItems)}
              data-testid={`card-folder-${folder.id}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-primary/10 rounded-md">
                      <Folder className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg" data-testid={`text-folder-name-${folder.id}`}>
                      {folder.name}
                    </CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" data-testid={`button-folder-menu-${folder.id}`}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingFolder(folder); }}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={(e) => { e.stopPropagation(); deleteFolderMutation.mutate(folder.id); }}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                {folder.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{folder.description}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Folder Dialog */}
      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
            <DialogDescription>
              Create a new folder to organize your files and links.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="folder-name">Folder Name</Label>
              <Input
                id="folder-name"
                placeholder="e.g., Training Videos, Property Guides"
                value={newFolder.name}
                onChange={(e) => setNewFolder({ ...newFolder, name: e.target.value })}
                data-testid="input-folder-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="folder-description">Description (optional)</Label>
              <Textarea
                id="folder-description"
                placeholder="What's in this folder?"
                value={newFolder.description}
                onChange={(e) => setNewFolder({ ...newFolder, description: e.target.value })}
                data-testid="input-folder-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateFolderOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => createFolderMutation.mutate(newFolder)}
              disabled={!newFolder.name.trim() || createFolderMutation.isPending}
              data-testid="button-submit-folder"
            >
              {createFolderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Folder Dialog */}
      <Dialog open={!!editingFolder} onOpenChange={(open) => !open && setEditingFolder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Folder</DialogTitle>
          </DialogHeader>
          {editingFolder && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-folder-name">Folder Name</Label>
                <Input
                  id="edit-folder-name"
                  value={editingFolder.name}
                  onChange={(e) => setEditingFolder({ ...editingFolder, name: e.target.value })}
                  data-testid="input-edit-folder-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-folder-description">Description</Label>
                <Textarea
                  id="edit-folder-description"
                  value={editingFolder.description || ""}
                  onChange={(e) => setEditingFolder({ ...editingFolder, description: e.target.value })}
                  data-testid="input-edit-folder-description"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingFolder(null)}>
              Cancel
            </Button>
            <Button 
              onClick={() => editingFolder && updateFolderMutation.mutate({ id: editingFolder.id, data: editingFolder })}
              disabled={updateFolderMutation.isPending}
              data-testid="button-update-folder"
            >
              {updateFolderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
