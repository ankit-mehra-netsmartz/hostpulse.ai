import { useNotifications } from "@/contexts/notifications-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, Check, Sparkles, RefreshCw, X, Image } from "lucide-react";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";

export default function NotificationsPage() {
  const { notifications, markAsRead, markAllAsRead, clearNotification, unreadCount } = useNotifications();
  const [, setLocation] = useLocation();

  const handleNotificationClick = (notification: typeof notifications[0]) => {
    markAsRead(notification.id);
    if (notification.type === "analysis_complete" && notification.listingId) {
      setLocation(`/listings/${notification.listingId}?showIdp=true`);
    } else if (notification.type === "phase1_complete" && notification.listingId) {
      setLocation(`/listings/${notification.listingId}?tab=analysis`);
    } else if (notification.type === "phase2_complete" && notification.listingId) {
      setLocation(`/listings/${notification.listingId}?tab=analysis&openPhotos=true`);
    } else if (notification.type === "sync_complete") {
      setLocation("/themes");
    } else if (notification.type === "background_sync_complete") {
      setLocation("/themes");
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "analysis_complete":
      case "phase1_complete":
        return <Sparkles className="w-5 h-5 text-emerald-500" />;
      case "phase2_complete":
        return <Image className="w-5 h-5 text-purple-500" />;
      case "sync_complete":
      case "background_sync_complete":
        return <RefreshCw className="w-5 h-5 text-blue-500" />;
      default:
        return <Bell className="w-5 h-5 text-primary" />;
    }
  };

  const getNotificationBgClass = (type: string) => {
    switch (type) {
      case "analysis_complete":
      case "phase1_complete":
        return "bg-emerald-500/10";
      case "phase2_complete":
        return "bg-purple-500/10";
      case "sync_complete":
      case "background_sync_complete":
        return "bg-blue-500/10";
      default:
        return "bg-primary/10";
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-notifications-title">Notifications</h1>
              <p className="text-sm text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
              </p>
            </div>
          </div>
          {unreadCount > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={markAllAsRead}
              data-testid="button-mark-all-read"
            >
              <Check className="w-4 h-4 mr-2" />
              Mark all read
            </Button>
          )}
        </div>

        {notifications.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
                  <BellOff className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium">No notifications yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  When you run an AI analysis in the background, you'll see notifications here when they complete.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <Card 
                key={notification.id}
                className={`transition-all cursor-pointer ${
                  !notification.read ? "border-primary/50 bg-primary/5" : ""
                }`}
                onClick={() => handleNotificationClick(notification)}
                data-testid={`notification-${notification.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {notification.listingPhoto ? (
                      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                        <img 
                          src={notification.listingPhoto} 
                          alt="" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getNotificationBgClass(notification.type)}`}>
                        {getNotificationIcon(notification.type)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium">{notification.title}</h3>
                        {!notification.read && (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0">
                            New
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearNotification(notification.id);
                      }}
                      data-testid={`button-dismiss-${notification.id}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
