import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  GripVertical,
  Package,
  Camera,
  MapPin,
  Loader2,
  Star,
  ChevronRight,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TaskModule, TaskModuleWithItems, TaskModuleItem } from "@shared/schema";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ItemFormData {
  label: string;
  description: string;
  photoVerificationMode: string;
  requiresPhotoVerification: boolean;
  requiresGpsVerification: boolean;
}

interface SortableItemProps {
  item: TaskModuleItem;
  onEdit: (item: TaskModuleItem) => void;
  onDelete: (itemId: string) => void;
}

function SortableItem({ item, onEdit, onDelete }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-3 border rounded-md bg-background hover-elevate"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{item.label}</p>
        {item.description && (
          <p className="text-xs text-muted-foreground truncate">{item.description}</p>
        )}
        <div className="flex gap-1 mt-1">
          {(() => {
            const mode = (item as any).photoVerificationMode || (item.requiresPhotoVerification ? 'required' : 'none');
            if (mode === 'required') return (
              <Badge variant="outline" className="text-xs">
                <Camera className="h-3 w-3 mr-1" />
                Photo Required
              </Badge>
            );
            if (mode === 'optional') return (
              <Badge variant="outline" className="text-xs">
                <Camera className="h-3 w-3 mr-1" />
                Photo Allowed
              </Badge>
            );
            return null;
          })()}
          {item.requiresGpsVerification && (
            <Badge variant="outline" className="text-xs">
              <MapPin className="h-3 w-3 mr-1" />
              GPS
            </Badge>
          )}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(item)}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDelete(item.id)} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function ModulesPage() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedModule, setSelectedModule] = useState<TaskModuleWithItems | null>(null);
  const [editingItem, setEditingItem] = useState<TaskModuleItem | null>(null);
  const [addItemFocused, setAddItemFocused] = useState(false);

  const [newModule, setNewModule] = useState({ name: "", description: "", category: "", isRecommended: false });
  const [newItem, setNewItem] = useState<ItemFormData>({
    label: "",
    description: "",
    photoVerificationMode: "none",
    requiresPhotoVerification: false,
    requiresGpsVerification: false,
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { data: modules = [], isLoading } = useQuery<TaskModule[]>({
    queryKey: ["/api/task-modules"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; category: string; isRecommended: boolean }) => {
      const res = await apiRequest("POST", "/api/task-modules", data);
      return res.json();
    },
    onSuccess: async (data: TaskModule) => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-modules"] });
      setCreateDialogOpen(false);
      setNewModule({ name: "", description: "", category: "", isRecommended: false });
      const moduleWithItems = await fetch(`/api/task-modules/${data.id}`).then(r => r.json());
      setSelectedModule(moduleWithItems);
      toast({ title: "Module created", description: "Now add items to your module." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create module", variant: "destructive" });
    },
  });

  const updateModuleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TaskModule> }) => {
      const res = await apiRequest("PATCH", `/api/task-modules/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-modules"] });
      toast({ title: "Module updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update module", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/task-modules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-modules"] });
      setSelectedModule(null);
      toast({ title: "Module deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete module", variant: "destructive" });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async ({ moduleId, data }: { moduleId: string; data: ItemFormData }) => {
      const res = await apiRequest("POST", `/api/task-modules/${moduleId}/items`, data);
      return res.json();
    },
    onSuccess: async () => {
      if (selectedModule) {
        const updated = await fetch(`/api/task-modules/${selectedModule.id}`).then(r => r.json());
        setSelectedModule(updated);
      }
      resetNewItem();
      setAddItemFocused(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add item", variant: "destructive" });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ moduleId, itemId, data }: { moduleId: string; itemId: string; data: Partial<ItemFormData> }) => {
      const res = await apiRequest("PATCH", `/api/task-modules/${moduleId}/items/${itemId}`, data);
      return res.json();
    },
    onSuccess: async () => {
      if (selectedModule) {
        const updated = await fetch(`/api/task-modules/${selectedModule.id}`).then(r => r.json());
        setSelectedModule(updated);
      }
      setEditingItem(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update item", variant: "destructive" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async ({ moduleId, itemId }: { moduleId: string; itemId: string }) => {
      return apiRequest("DELETE", `/api/task-modules/${moduleId}/items/${itemId}`);
    },
    onSuccess: async () => {
      if (selectedModule) {
        const updated = await fetch(`/api/task-modules/${selectedModule.id}`).then(r => r.json());
        setSelectedModule(updated);
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete item", variant: "destructive" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ moduleId, itemIds }: { moduleId: string; itemIds: string[] }) => {
      const res = await apiRequest("POST", `/api/task-modules/${moduleId}/reorder`, { itemIds });
      return res.json();
    },
    onSuccess: (data: TaskModuleWithItems) => {
      setSelectedModule(data);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reorder items", variant: "destructive" });
    },
  });

  const resetNewItem = () => {
    setNewItem({
      label: "",
      description: "",
      photoVerificationMode: "none",
      requiresPhotoVerification: false,
      requiresGpsVerification: false,
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !selectedModule) return;

    if (active.id !== over.id) {
      const oldIndex = selectedModule.items.findIndex(i => i.id === active.id);
      const newIndex = selectedModule.items.findIndex(i => i.id === over.id);
      
      const newItems = arrayMove(selectedModule.items, oldIndex, newIndex);
      setSelectedModule({ ...selectedModule, items: newItems });
      
      reorderMutation.mutate({
        moduleId: selectedModule.id,
        itemIds: newItems.map(i => i.id),
      });
    }
  };

  const handleSelectModule = async (module: TaskModule) => {
    const moduleWithItems = await fetch(`/api/task-modules/${module.id}`).then(r => r.json());
    setSelectedModule(moduleWithItems);
  };

  return (
    <div className="flex-1 p-4 md:p-6 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Modules</h1>
          <p className="text-muted-foreground">
            Create reusable step groups to quickly add common tasks to procedures
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-module">
          <Plus className="h-4 w-4 mr-2" />
          New Module
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : modules.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No modules yet</h3>
            <p className="text-muted-foreground mb-4">
              Create reusable modules to speed up procedure creation
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-module">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Module
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {modules.map((module) => (
            <Card 
              key={module.id} 
              className="cursor-pointer hover-elevate"
              onClick={() => handleSelectModule(module)}
              data-testid={`card-module-${module.id}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-base">{module.name}</CardTitle>
                  </div>
                  {module.isRecommended && (
                    <Badge variant="default" className="flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      Recommended
                    </Badge>
                  )}
                </div>
                {module.description && (
                  <CardDescription className="mt-2">{module.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  {module.category && (
                    <Badge variant="outline">{module.category}</Badge>
                  )}
                  <div className="flex items-center gap-1">
                    <span>View details</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Module Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Module</DialogTitle>
            <DialogDescription>
              Modules are reusable groups of steps that can be added to any procedure.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="module-name">Name</Label>
              <Input
                id="module-name"
                value={newModule.name}
                onChange={(e) => setNewModule(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Check-In Setup"
                data-testid="input-module-name"
              />
            </div>
            <div>
              <Label htmlFor="module-description">Description</Label>
              <Textarea
                id="module-description"
                value={newModule.description}
                onChange={(e) => setNewModule(prev => ({ ...prev, description: e.target.value }))}
                placeholder="What this module is used for..."
                data-testid="input-module-description"
              />
            </div>
            <div>
              <Label htmlFor="module-category">Category (optional)</Label>
              <Input
                id="module-category"
                value={newModule.category}
                onChange={(e) => setNewModule(prev => ({ ...prev, category: e.target.value }))}
                placeholder="e.g., Housekeeping, Maintenance"
                data-testid="input-module-category"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="module-recommended">Recommended</Label>
                <p className="text-xs text-muted-foreground">
                  Show this module in the quick-add panel
                </p>
              </div>
              <Switch
                id="module-recommended"
                checked={newModule.isRecommended}
                onCheckedChange={(checked) => setNewModule(prev => ({ ...prev, isRecommended: checked }))}
                data-testid="switch-module-recommended"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(newModule)}
              disabled={!newModule.name.trim() || createMutation.isPending}
              data-testid="button-save-module"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Module
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Module Editor Sheet */}
      <Sheet open={!!selectedModule} onOpenChange={(open) => !open && setSelectedModule(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {selectedModule?.name}
            </SheetTitle>
            <SheetDescription>
              {selectedModule?.description || "Configure the items in this module"}
            </SheetDescription>
          </SheetHeader>

          {selectedModule && (
            <div className="mt-6 space-y-6">
              {/* Module Settings */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {selectedModule.isRecommended && (
                    <Badge variant="default" className="flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      Recommended
                    </Badge>
                  )}
                  {selectedModule.category && (
                    <Badge variant="outline">{selectedModule.category}</Badge>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem 
                      onClick={() => {
                        updateModuleMutation.mutate({
                          id: selectedModule.id,
                          data: { isRecommended: !selectedModule.isRecommended }
                        });
                        setSelectedModule({ ...selectedModule, isRecommended: !selectedModule.isRecommended });
                      }}
                    >
                      <Star className="h-4 w-4 mr-2" />
                      {selectedModule.isRecommended ? "Remove from Recommended" : "Add to Recommended"}
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => deleteMutation.mutate(selectedModule.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Module
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Items List */}
              <div className="border-t pt-6">
                <h3 className="font-medium mb-4">Items ({selectedModule.items?.length || 0})</h3>

                {selectedModule.items && selectedModule.items.length > 0 ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={selectedModule.items.map(i => i.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {selectedModule.items.map((item) => (
                          <SortableItem
                            key={item.id}
                            item={item}
                            onEdit={setEditingItem}
                            onDelete={(itemId) => deleteItemMutation.mutate({
                              moduleId: selectedModule.id,
                              itemId,
                            })}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    No items yet. Add your first item below.
                  </div>
                )}

                {/* Inline Add Item */}
                <div className="mt-4 flex items-start gap-2">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground/60 flex-shrink-0 mt-1">
                    <Plus className="h-3 w-3" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Add item..."
                      value={newItem.label}
                      onChange={(e) => setNewItem(prev => ({ ...prev, label: e.target.value }))}
                      onFocus={() => setAddItemFocused(true)}
                      onBlur={(e) => {
                        if (!e.relatedTarget?.closest('[data-item-form]')) {
                          setTimeout(() => {
                            if (!newItem.label.trim()) {
                              setAddItemFocused(false);
                            }
                          }, 150);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newItem.label.trim() && selectedModule) {
                          e.preventDefault();
                          addItemMutation.mutate({
                            moduleId: selectedModule.id,
                            data: newItem,
                          });
                        }
                        if (e.key === 'Escape') {
                          setAddItemFocused(false);
                          resetNewItem();
                        }
                      }}
                      className="border-0 shadow-none px-0 h-8 focus-visible:ring-0 placeholder:text-muted-foreground/60"
                      data-testid="input-item-label"
                    />
                    {addItemFocused && (
                      <div data-item-form className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
                        <Textarea
                          placeholder="Description (optional)"
                          value={newItem.description}
                          onChange={(e) => setNewItem(prev => ({ ...prev, description: e.target.value }))}
                          className="min-h-[50px] text-sm"
                          data-testid="input-item-description"
                        />
                        <div className="flex items-center justify-between">
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => setNewItem(prev => {
                                const cycle = { none: 'optional', optional: 'required', required: 'none' } as Record<string, string>;
                                const nextMode = cycle[prev.photoVerificationMode] || 'optional';
                                return { ...prev, photoVerificationMode: nextMode, requiresPhotoVerification: nextMode === 'required' };
                              })}
                              className={`flex items-center gap-1 text-xs ${newItem.photoVerificationMode === 'required' ? 'text-blue-600' : newItem.photoVerificationMode === 'optional' ? 'text-cyan-600' : 'text-muted-foreground'}`}
                              data-testid="button-item-photo-toggle"
                            >
                              <Camera className="h-3 w-3" />
                              {newItem.photoVerificationMode === 'required' ? 'Photo Required' : newItem.photoVerificationMode === 'optional' ? 'Photo Allowed' : 'Photo'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setNewItem(prev => ({ ...prev, requiresGpsVerification: !prev.requiresGpsVerification }))}
                              className={`flex items-center gap-1 text-xs ${newItem.requiresGpsVerification ? 'text-primary' : 'text-muted-foreground'}`}
                              data-testid="button-item-gps-toggle"
                            >
                              <MapPin className="h-3 w-3" />
                              GPS
                            </button>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => {
                              if (newItem.label.trim() && selectedModule) {
                                addItemMutation.mutate({
                                  moduleId: selectedModule.id,
                                  data: newItem,
                                });
                              }
                            }}
                            disabled={!newItem.label.trim() || addItemMutation.isPending}
                            data-testid="button-add-item"
                          >
                            {addItemMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Add"
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Item Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-item-label">Label</Label>
                <Input
                  id="edit-item-label"
                  value={editingItem.label}
                  onChange={(e) => setEditingItem({ ...editingItem, label: e.target.value })}
                  data-testid="input-edit-item-label"
                />
              </div>
              <div>
                <Label htmlFor="edit-item-description">Description</Label>
                <Textarea
                  id="edit-item-description"
                  value={editingItem.description || ""}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  data-testid="input-edit-item-description"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1">
                  <Camera className="h-4 w-4" />
                  Photo Verification
                </Label>
                <div className="flex gap-1">
                  {(['none', 'optional', 'required'] as const).map((mode) => {
                    const currentMode = (editingItem as any).photoVerificationMode || (editingItem.requiresPhotoVerification ? 'required' : 'none');
                    return (
                      <Button key={mode} type="button" size="sm"
                        variant={currentMode === mode ? 'default' : 'outline'}
                        className={currentMode === mode ? mode === 'required' ? 'bg-blue-600 text-white' : mode === 'optional' ? 'bg-cyan-600 text-white' : '' : ''}
                        onClick={() => setEditingItem({ ...editingItem, photoVerificationMode: mode, requiresPhotoVerification: mode === 'required' } as any)}
                        data-testid={`button-edit-photo-${mode}`}
                      >
                        {mode === 'none' ? 'Off' : mode === 'optional' ? 'Allowed' : 'Required'}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    id="edit-item-gps"
                    checked={editingItem.requiresGpsVerification}
                    onCheckedChange={(checked) => setEditingItem({ ...editingItem, requiresGpsVerification: checked })}
                    data-testid="switch-edit-item-gps"
                  />
                  <Label htmlFor="edit-item-gps" className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    Requires GPS
                  </Label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingItem && selectedModule) {
                  updateItemMutation.mutate({
                    moduleId: selectedModule.id,
                    itemId: editingItem.id,
                    data: {
                      label: editingItem.label,
                      description: editingItem.description || undefined,
                      photoVerificationMode: (editingItem as any).photoVerificationMode || (editingItem.requiresPhotoVerification ? 'required' : 'none'),
                      requiresPhotoVerification: editingItem.requiresPhotoVerification,
                      requiresGpsVerification: editingItem.requiresGpsVerification,
                    },
                  });
                }
              }}
              disabled={updateItemMutation.isPending}
              data-testid="button-save-item"
            >
              {updateItemMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
