import React, { useState, useEffect, useCallback, useRef } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { NotificationsProvider } from "@/contexts/notifications-context";
import { BackgroundAnalysisCard } from "@/components/background-analysis-card";
import { BackgroundSyncCard } from "@/components/background-sync-card";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { BetaBanner } from "@/components/beta-banner";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { Loader2, GripVertical } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Workspace } from "@shared/schema";
import { WorkspaceProvider } from "@/contexts/workspace-context";

const SIDEBAR_WIDTH_KEY = "sidebar_width";
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 400;
const DEFAULT_SIDEBAR_WIDTH = 288; // 18rem - wider to show AI Agent icons

import Landing from "@/pages/landing";
import Onboarding from "@/pages/onboarding";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import ConnectDataSource from "@/pages/connect-data-source";
import PropertySelection from "@/pages/property-selection";
import ListingAnalysisPage from "@/pages/listing-analysis";
import ListingDetailPage from "@/pages/listing-detail";
import ReservationsPage from "@/pages/reservations";
import TagsPage from "@/pages/tags";
import ThemesPage from "@/pages/themes";
import ThemeDetailPage from "@/pages/theme-detail";
import TasksPage from "@/pages/tasks";
import ProceduresPage from "@/pages/procedures";
import ModulesPage from "@/pages/modules";
import FoldersPage from "@/pages/folders";
import TeamsPage from "@/pages/teams";
import TeamDetailPage from "@/pages/team-detail";
import ReviewsPage from "@/pages/reviews";
import Admin from "@/pages/admin";
import NotificationsPage from "@/pages/notifications";
import AskLumi from "@/pages/ask-lumi";
import ProfilePage from "@/pages/profile";
import SongPage from "@/pages/song";
import Changelog from "@/pages/changelog";
import ReportsPage from "@/pages/reports";
import NudgePage from "@/pages/nudge";
import ReviewRemovalPage from "@/pages/review-removal";
import InboxPage from "@/pages/inbox";
import CleanersPage from "@/pages/cleaners";
import CleaningChecklistPage from "@/pages/cleaning-checklist";
import PrivacyPolicy from "@/pages/privacy-policy";
import InvitePage from "@/pages/invite";
import CleanerInvitePage from "@/pages/cleaner-invite";
import NotFound from "@/pages/not-found";
import { MobileLayout } from "@/pages/mobile/mobile-layout";
import MobileDashboard from "@/pages/mobile/mobile-dashboard";
import MobileTasks from "@/pages/mobile/mobile-tasks";
import MobileTaskDetail from "@/pages/mobile/mobile-task-detail";
import MobileProcedures from "@/pages/mobile/mobile-procedures";
import MobileProcedureChecklist from "@/pages/mobile/mobile-procedure-checklist";
import MobileProfile from "@/pages/mobile/mobile-profile";
import MobileCompany from "@/pages/mobile/mobile-company";
import MobileTurnovers from "@/pages/mobile/mobile-turnovers";

class PageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("PageErrorBoundary", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Something went wrong loading this page.
            </p>
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  // Load saved sidebar width from localStorage
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_SIDEBAR_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);

  // Save sidebar width to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.min(
        Math.max(e.clientX, MIN_SIDEBAR_WIDTH),
        MAX_SIDEBAR_WIDTH,
      );
      setSidebarWidth(newWidth);
    },
    [isResizing],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Add/remove mouse event listeners for resize
  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    } else {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const sidebarStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
    "--sidebar-width-icon": "3rem",
  } as React.CSSProperties;

  return (
    <WorkspaceProvider>
      <SidebarProvider style={sidebarStyle}>
        <div className="flex flex-col h-screen w-full relative">
          <BetaBanner />
          <div className="flex flex-1 overflow-hidden">
            <AppSidebar />
            {/* Resize handle */}
            <div
              ref={resizeRef}
              onMouseDown={handleMouseDown}
              className="hidden md:flex w-1 hover:w-1.5 bg-transparent hover:bg-primary/20 cursor-col-resize items-center justify-center group transition-all flex-shrink-0 z-10"
              data-testid="sidebar-resize-handle"
            >
              <div className="h-8 w-1 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
            </div>
            <SidebarInset className="flex flex-col flex-1 overflow-hidden">
              <header className="flex items-center gap-2 p-2 border-b h-14 flex-shrink-0">
                <SidebarTrigger
                  data-testid="button-sidebar-toggle"
                  className="md:hidden"
                />
                <ThemeToggle />
                <div className="flex-1" />
              </header>
              <main className="flex-1 overflow-hidden flex flex-col relative">
                <PageErrorBoundary key={location}>{children}</PageErrorBoundary>
                <BackgroundAnalysisCard />
                <BackgroundSyncCard />
              </main>
            </SidebarInset>
          </div>
        </div>
      </SidebarProvider>
    </WorkspaceProvider>
  );
}

function AuthenticatedRouter() {
  return (
    <AuthenticatedLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/listing-analysis-home" component={Home} />
        <Route path="/connect" component={ConnectDataSource} />
        <Route path="/data-sources" component={ConnectDataSource} />
        <Route path="/properties" component={PropertySelection} />
        <Route path="/reservations" component={ReservationsPage} />
        <Route path="/inbox" component={InboxPage} />
        <Route path="/listing-analysis" component={ListingAnalysisPage} />
        <Route path="/listings/:id" component={ListingDetailPage} />
        <Route path="/tags" component={TagsPage} />
        <Route path="/themes" component={ThemesPage} />
        <Route path="/themes/:id" component={ThemeDetailPage} />
        <Route path="/tasks" component={TasksPage} />
        <Route path="/procedures" component={ProceduresPage} />
        <Route path="/modules" component={ModulesPage} />
        <Route path="/folders" component={FoldersPage} />
        <Route path="/teams" component={TeamsPage} />
        <Route path="/teams/:teamId" component={TeamDetailPage} />
        <Route path="/reviews" component={ReviewsPage} />
        <Route path="/notifications" component={NotificationsPage} />
        <Route path="/ask-lumi" component={AskLumi} />
        <Route path="/profile" component={ProfilePage} />
        <Route path="/song/:id" component={SongPage} />
        <Route path="/admin" component={Admin} />
        <Route path="/changelog" component={Changelog} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/nudge" component={NudgePage} />
        <Route path="/review-removal" component={ReviewRemovalPage} />
        <Route path="/cleaners" component={CleanersPage} />
        <Route path="/invite/:token" component={InvitePage} />
        <Route path="/cleaner-invite/:token" component={CleanerInvitePage} />
        <Route component={NotFound} />
      </Switch>
    </AuthenticatedLayout>
  );
}

function Router() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  const { data: workspaces, isLoading: workspacesLoading } = useQuery<
    Workspace[]
  >({
    queryKey: ["/api/workspaces"],
    enabled: !!user,
  });

  if (isLoading || (user && workspacesLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/invite/:token" component={InvitePage} />
        <Route path="/cleaner-invite/:token" component={CleanerInvitePage} />
        <Route path="/changelog" component={Changelog} />
        <Route path="/privacy-policy" component={PrivacyPolicy} />
        <Route path="/song/:id" component={SongPage} />
        <Route path="/checklist/:token" component={CleaningChecklistPage} />
        <Route component={Landing} />
      </Switch>
    );
  }

  if (user.accountType === "email" && user.emailVerified === false) {
    return <EmailVerificationBanner user={user} />;
  }

  // Allow invite page to bypass onboarding for users accepting invitations
  // They'll be added to a workspace after accepting, so they don't need to create one
  const isOnInvitePage =
    location.startsWith("/invite/") || location.startsWith("/cleaner-invite/");

  if ((!workspaces || workspaces.length === 0) && !isOnInvitePage) {
    return <Onboarding />;
  }

  // For invite pages with no workspaces, render invite page directly
  if (isOnInvitePage && (!workspaces || workspaces.length === 0)) {
    return (
      <Switch>
        <Route path="/invite/:token" component={InvitePage} />
        <Route path="/cleaner-invite/:token" component={CleanerInvitePage} />
      </Switch>
    );
  }

  if (location.startsWith("/mobile")) {
    return (
      <WorkspaceProvider>
        <MobileLayout>
          <Switch>
            <Route path="/mobile" component={MobileDashboard} />
            <Route path="/mobile/turnovers" component={MobileTurnovers} />
            <Route path="/mobile/tasks" component={MobileTasks} />
            <Route path="/mobile/tasks/:id" component={MobileTaskDetail} />
            <Route path="/mobile/procedures" component={MobileProcedures} />
            <Route
              path="/mobile/procedures/:id"
              component={MobileProcedureChecklist}
            />
            <Route path="/mobile/profile" component={MobileProfile} />
            <Route path="/mobile/company" component={MobileCompany} />
            <Route component={MobileDashboard} />
          </Switch>
        </MobileLayout>
      </WorkspaceProvider>
    );
  }

  return <AuthenticatedRouter />;
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="hostpulse-theme">
      <QueryClientProvider client={queryClient}>
        <NotificationsProvider>
          <TooltipProvider>
            <ImpersonationBanner />
            <Toaster />
            <Router />
          </TooltipProvider>
        </NotificationsProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
