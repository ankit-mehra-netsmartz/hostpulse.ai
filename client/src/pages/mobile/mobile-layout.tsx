import { useLocation, Link } from "wouter";
import { Home, ClipboardList, CheckSquare, User, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { path: "/mobile", label: "Dashboard", icon: Home },
  { path: "/mobile/turnovers", label: "Turnovers", icon: CalendarDays },
  { path: "/mobile/tasks", label: "Tasks", icon: ClipboardList },
  { path: "/mobile/procedures", label: "Procedures", icon: CheckSquare },
  { path: "/mobile/profile", label: "Profile", icon: User },
];

export function MobileLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex flex-col h-[100dvh] bg-background" data-testid="mobile-layout">
      <main className="flex-1 overflow-y-auto pb-[72px]">
        {children}
      </main>
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-card-border z-50 safe-area-bottom" data-testid="mobile-nav">
        <div className="flex items-center justify-around h-[64px] px-2">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.path || 
              (item.path !== "/mobile" && location.startsWith(item.path));
            return (
              <Link key={item.path} href={item.path}>
                <button
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 w-14 h-14 rounded-lg transition-colors",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground"
                  )}
                  data-testid={`mobile-nav-${item.label.toLowerCase()}`}
                >
                  <item.icon className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
