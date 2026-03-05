import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Home, 
  Star, 
  MessageSquare, 
  Building2, 
  BarChart3, 
  Tags, 
  Palette,
  Wrench,
  Bell,
  FileText,
  Users,
  ChevronDown,
  PanelLeftClose,
  PanelRightClose,
  LogOut,
  Settings,
  User,
  Trash2,
  Cog,
  BellDot,
  Database,
  GripVertical,
  Calendar,
  ClipboardList,
  Folder,
  LucideIcon,
  AlertTriangle,
  Sparkles,
  ScanSearch,
  Ban,
  Send,
  Pointer,
  Inbox,
  Blocks,
  SprayCan
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNotifications } from "@/contexts/notifications-context";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAppVersion } from "@/lib/app-version";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavItem {
  id: string;
  title: string;
  url: string;
  icon: LucideIcon;
  disabled?: boolean;
  hasSubmenu?: boolean;
  subItems?: NavItem[];
}

const defaultNavItems: NavItem[] = [
  { id: "home", title: "Home", url: "/", icon: Home },
  { id: "inbox", title: "Inbox", url: "/inbox", icon: Inbox },
  { id: "ask-lumi", title: "Ask Lumi", url: "/ask-lumi", icon: MessageSquare },
  { 
    id: "insights", 
    title: "Insights", 
    url: "/tags", 
    icon: BarChart3, 
    hasSubmenu: true,
    subItems: [
      { id: "tags", title: "Tags", url: "/tags", icon: Tags },
      { id: "themes", title: "Themes", url: "/themes", icon: Palette },
      { id: "reservations", title: "Reservations", url: "/reservations", icon: Calendar },
      { id: "reviews", title: "Reviews", url: "/reviews", icon: Star },
    ]
  },
  { 
    id: "operations", 
    title: "Operations", 
    url: "/tasks", 
    icon: Wrench,
    hasSubmenu: true,
    subItems: [
      { id: "tasks", title: "Tasks", url: "/tasks", icon: Wrench },
      { id: "procedures", title: "Procedures", url: "/procedures", icon: ClipboardList },
      { id: "modules", title: "Modules", url: "/modules", icon: Blocks },
      { id: "cleaners", title: "Cleaners", url: "/cleaners", icon: SprayCan },
      { id: "assets", title: "Assets", url: "/folders", icon: Folder },
    ]
  },
  { id: "reports", title: "Reports", url: "/reports", icon: FileText },
  { id: "teams", title: "Teams", url: "/teams", icon: Users },
  { 
    id: "data-sources", 
    title: "Data Sources", 
    url: "/data-sources", 
    icon: Database,
    hasSubmenu: true,
    subItems: [
      { id: "data-sources-main", title: "Data Sources", url: "/data-sources", icon: Database },
      { id: "properties", title: "Properties", url: "/properties", icon: Building2 },
    ]
  },
  { 
    id: "ai-agents", 
    title: "AI Agents", 
    url: "/listing-analysis", 
    icon: Sparkles,
    hasSubmenu: true,
    subItems: [
      { id: "listing-analysis", title: "Listing Analysis", url: "/listing-analysis", icon: ScanSearch },
      { id: "appeal", title: "Resolution Appeal", url: "/resolution-appeal", icon: AlertTriangle, disabled: true },
      { id: "review-removal", title: "Review Removal", url: "/review-removal", icon: Ban },
      { id: "nudge", title: "Nudge", url: "/nudge", icon: Pointer },
    ]
  },
];

const NAV_ORDER_KEY = "hostpulse-nav-order-v3";

function loadNavOrder(): string[] | null {
  try {
    const stored = localStorage.getItem(NAV_ORDER_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Failed to load nav order:", e);
  }
  return null;
}

function saveNavOrder(order: string[]) {
  try {
    localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(order));
  } catch (e) {
    console.error("Failed to save nav order:", e);
  }
}

function reorderItems(items: NavItem[], order: string[]): NavItem[] {
  const itemMap = new Map(items.map(item => [item.id, item]));
  const ordered: NavItem[] = [];
  for (const id of order) {
    const item = itemMap.get(id);
    if (item) {
      ordered.push(item);
      itemMap.delete(id);
    }
  }
  itemMap.forEach(item => ordered.push(item));
  return ordered;
}

interface UserPermissions {
  fullAccess: boolean;
  disabledNavItems: string[];
}

export function AppSidebar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const { toast } = useToast();
  const { unreadCount } = useNotifications();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";

  const [navItems, setNavItems] = useState<NavItem[]>(defaultNavItems);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [showClearDataDialog, setShowClearDataDialog] = useState(false);
  const [clearDataConfirmText, setClearDataConfirmText] = useState("");

  // Fetch user permissions
  const { data: permissions } = useQuery<UserPermissions>({
    queryKey: ["/api/user/permissions"],
    enabled: !!user,
  });

  useEffect(() => {
    const savedOrder = loadNavOrder();
    if (savedOrder) {
      setNavItems(reorderItems(defaultNavItems, savedOrder));
    }
  }, []);

  // Filter nav items based on permissions
  const filteredNavItems = useMemo(() => {
    if (!permissions || permissions.fullAccess) {
      return navItems;
    }

    const disabledSet = new Set(permissions.disabledNavItems);
    
    return navItems
      .filter(item => !disabledSet.has(item.id))
      .map(item => {
        if (item.subItems) {
          const filteredSubItems = item.subItems.filter(sub => !disabledSet.has(sub.id));
          return { ...item, subItems: filteredSubItems };
        }
        return item;
      })
      .filter(item => !item.hasSubmenu || (item.subItems && item.subItems.length > 0));
  }, [navItems, permissions]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItemId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedItemId && draggedItemId !== id) {
      setDragOverItemId(id);
    }
  };

  const handleDragLeave = () => {
    setDragOverItemId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedItemId || draggedItemId === targetId) return;

    const dragIndex = navItems.findIndex(i => i.id === draggedItemId);
    const targetIndex = navItems.findIndex(i => i.id === targetId);

    if (dragIndex !== -1 && targetIndex !== -1) {
      const newItems = [...navItems];
      const [removed] = newItems.splice(dragIndex, 1);
      newItems.splice(targetIndex, 0, removed);
      setNavItems(newItems);
      saveNavOrder(newItems.map(i => i.id));
    }

    setDraggedItemId(null);
    setDragOverItemId(null);
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
    setDragOverItemId(null);
  };

  const clearDataMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/user/data");
    },
    onSuccess: () => {
      // Clear localStorage items (notifications, background analyses, syncs)
      localStorage.removeItem("hostpulse-notifications");
      localStorage.removeItem("hostpulse-background-analyses");
      localStorage.removeItem("hostpulse-background-syncs");
      
      // Clear all react-query cache to remove stale data
      queryClient.clear();
      
      // Close dialog and reset state
      setShowClearDataDialog(false);
      setClearDataConfirmText("");
      
      // Hard refresh the browser to clear any cached data and navigate to home
      window.location.href = "/";
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to clear data. Please try again.",
        variant: "destructive",
      });
    },
  });

  const isActive = (url: string) => {
    if (location === url) return true;
    if (location.startsWith("/listings/")) {
      const searchParams = new URLSearchParams(window.location.search);
      const from = searchParams.get("from");
      if (from === "analysis" && url === "/listing-analysis") return true;
      if (from !== "analysis" && url === "/properties") return true;
    }
    return false;
  };

  const getUserInitials = () => {
    if (!user) return "U";
    const first = user.firstName?.[0] || "";
    const last = user.lastName?.[0] || "";
    return (first + last).toUpperCase() || user.email?.[0]?.toUpperCase() || "U";
  };

  const getUserName = () => {
    if (!user) return "User";
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }
    return user.email || "User";
  };

  const renderDraggableItem = (item: NavItem) => {
    const isDragging = draggedItemId === item.id;
    const isDragOver = dragOverItemId === item.id;

    if (item.hasSubmenu && item.subItems) {
      if (isCollapsed) {
        return item.subItems
          .filter((subItem) => !subItem.disabled)
          .map((subItem) => (
            <SidebarMenuItem key={subItem.id}>
              <SidebarMenuButton
                asChild
                isActive={isActive(subItem.url)}
                tooltip={subItem.title}
                data-testid={`nav-${subItem.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <Link href={subItem.url}>
                  <subItem.icon className="w-4 h-4" />
                  <span>{subItem.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ));
      }

      return (
        <div
          key={item.id}
          className={`relative ${isDragging ? 'opacity-50' : ''}`}
          onDragOver={(e) => handleDragOver(e, item.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, item.id)}
        >
          {isDragOver && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-10" />
          )}
          <Collapsible className="group/collapsible">
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}-menu`}>
                  <span 
                    draggable
                    onDragStart={(e) => handleDragStart(e, item.id)}
                    onDragEnd={handleDragEnd}
                    onClick={(e) => e.preventDefault()}
                    className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                  >
                    <GripVertical className="w-3 h-3" />
                  </span>
                  <item.icon className="w-4 h-4" />
                  <span>{item.title}</span>
                  <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {item.subItems.map((subItem) => {
                    const IconComponent = subItem.icon;
                    // Nudge is only fully available to app_admin, others see "Soon" badge
                    const isNudgeForNonAdmin = subItem.id === "nudge" && user?.role !== "app_admin";
                    const isDisabled = subItem.disabled || isNudgeForNonAdmin;
                    return (
                      <SidebarMenuSubItem key={subItem.id}>
                        <SidebarMenuSubButton
                          asChild={!isDisabled}
                          isActive={isActive(subItem.url)}
                          className={isDisabled ? "opacity-50 cursor-not-allowed" : ""}
                          data-testid={`nav-${subItem.title.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          {isDisabled ? (
                            <span className="flex items-center gap-2">
                              {subItem.id === "appeal" ? (
                                <AlertTriangle className="w-4 h-4" />
                              ) : (
                                <IconComponent className="w-4 h-4" />
                              )}
                              <span>{subItem.title}</span>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-auto">Soon</Badge>
                            </span>
                          ) : (
                            <Link href={subItem.url}>
                              <IconComponent className="w-4 h-4" />
                              <span>{subItem.title}</span>
                            </Link>
                          )}
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    );
                  })}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        </div>
      );
    }

    return (
      <SidebarMenuItem 
        key={item.id}
        className={`relative ${isDragging ? 'opacity-50' : ''}`}
        onDragOver={(e) => handleDragOver(e, item.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, item.id)}
      >
        {isDragOver && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-10" />
        )}
        <SidebarMenuButton 
          asChild 
          isActive={isActive(item.url)}
          disabled={item.disabled}
          tooltip={item.title}
          data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <Link href={item.disabled ? "#" : item.url}>
            {!isCollapsed && (
              <span 
                draggable
                onDragStart={(e) => handleDragStart(e, item.id)}
                onDragEnd={handleDragEnd}
                onClick={(e) => e.preventDefault()}
                className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
              >
                <GripVertical className="w-3 h-3" />
              </span>
            )}
            <item.icon className="w-4 h-4" />
            <span>{item.title}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border h-14 flex items-center justify-center px-2">
        {isCollapsed ? (
          <div className="flex flex-col items-center justify-center w-full gap-1">
            <img 
              src="/favicon.png" 
              alt="HostPulse" 
              className="h-5 w-5" 
              data-testid="logo-icon"
            />
            <button
              onClick={toggleSidebar}
              className="h-5 w-5 flex items-center justify-center rounded-full border border-sidebar-border bg-sidebar-accent hover-elevate"
              data-testid="button-toggle-sidebar"
              title="Expand sidebar"
            >
              <PanelRightClose className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full px-2">
            <div className="flex items-center gap-2">
              <img 
                src="/logo-light.png" 
                alt="HostPulse" 
                className="h-7 dark:hidden" 
                data-testid="logo-light"
              />
              <img 
                src="/favicon.png" 
                alt="HostPulse" 
                className="h-7 hidden dark:block" 
                data-testid="logo-dark"
              />
              <span className="text-lg font-semibold dark:block hidden">HostPulse</span>
            </div>
            <button
              onClick={toggleSidebar}
              className="h-6 w-6 flex items-center justify-center rounded-full border border-sidebar-border bg-sidebar-accent hover-elevate"
              data-testid="button-toggle-sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="border-b border-sidebar-border pb-2">
          <SidebarGroupContent>
            <WorkspaceSwitcher />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredNavItems.map((item) => renderDraggableItem(item))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              asChild 
              isActive={isActive("/notifications")}
              tooltip="Notifications"
              data-testid="nav-notifications"
            >
              <Link href="/notifications">
                <div className="relative">
                  {unreadCount > 0 ? (
                    <BellDot className="h-4 w-4 text-primary" />
                  ) : (
                    <Bell className="h-4 w-4" />
                  )}
                </div>
                <span className="flex-1">Notifications</span>
                {unreadCount > 0 && !isCollapsed && (
                  <Badge variant="default" className="h-5 min-w-5 px-1.5 text-[10px]">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Badge>
                )}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {user?.role === "app_admin" && (
            <SidebarMenuItem>
              <SidebarMenuButton 
                asChild 
                isActive={isActive("/admin")}
                tooltip="Admin Portal"
                data-testid="button-admin"
              >
                <Link href="/admin">
                  <Cog className="h-4 w-4 text-primary" />
                  <span>Admin</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button 
              className={`flex items-center gap-3 w-full p-2 rounded-lg hover-elevate text-left ${isCollapsed ? 'justify-center' : ''}`}
              data-testid="button-user-menu"
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={user?.profileImageUrl || undefined} alt={getUserName()} />
                <AvatarFallback>{getUserInitials()}</AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{getUserName()}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem asChild data-testid="menu-profile">
              <Link href="/profile" className="flex items-center w-full">
                <User className="mr-2 h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem disabled data-testid="menu-settings">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => setShowClearDataDialog(true)} 
              data-testid="menu-clear-data"
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear My Data
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => logout()} data-testid="menu-logout">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`mt-1.5 flex items-center justify-center text-[10px] font-mono text-muted-foreground/70 tabular-nums ${isCollapsed ? "px-0" : "px-2"}`}
              data-testid="app-version"
            >
              {isCollapsed ? (
                <span className="truncate" title={getAppVersion()}>
                  {getAppVersion().slice(0, 5)}
                </span>
              ) : (
                <span className="truncate">{getAppVersion()}</span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            <p className="font-mono text-xs tabular-nums">
              Deploy: {getAppVersion().startsWith("R") ? "Replit" : "Cursor"} · {getAppVersion().slice(1)}
            </p>
          </TooltipContent>
        </Tooltip>
      </SidebarFooter>

      <AlertDialog open={showClearDataDialog} onOpenChange={(open) => {
        setShowClearDataDialog(open);
        if (!open) setClearDataConfirmText("");
      }}>
        <AlertDialogContent data-testid="clear-data-dialog">
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <AlertDialogTitle>Clear All Data</AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p>
                  This will delete <strong>all data stored in HostPulse</strong>, including:
                </p>
                <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                  <li>All listings and property information</li>
                  <li>All reservations and guest data</li>
                  <li>All reviews and messages</li>
                  <li>All tags, themes, and tasks</li>
                  <li>All analysis results and reports</li>
                </ul>
                <div className="bg-muted/50 border rounded-md p-3 text-sm">
                  <p className="font-medium text-foreground">Your source data is safe</p>
                  <p className="text-muted-foreground mt-1">
                    This only removes data from HostPulse. Your original data in Hospitable (or other connected sources) will not be affected and can be re-synced anytime.
                  </p>
                </div>
                <p className="text-destructive font-medium">
                  This action cannot be undone within HostPulse.
                </p>
                <div className="pt-2">
                  <Label htmlFor="confirm-delete" className="text-sm font-medium">
                    Type <span className="font-mono bg-muted px-1 rounded">delete</span> to confirm:
                  </Label>
                  <Input
                    id="confirm-delete"
                    data-testid="input-confirm-delete"
                    value={clearDataConfirmText}
                    onChange={(e) => setClearDataConfirmText(e.target.value)}
                    placeholder="delete"
                    className="mt-2"
                    autoComplete="off"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              data-testid="button-cancel-clear-data"
              disabled={clearDataMutation.isPending}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-clear-data"
              disabled={clearDataConfirmText.toLowerCase() !== "delete" || clearDataMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                clearDataMutation.mutate();
              }}
              className="bg-destructive text-destructive-foreground"
            >
              {clearDataMutation.isPending ? "Deleting..." : "Irreversibly Delete All Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
