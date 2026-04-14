import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
};

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifications((data as Notification[]) || []);
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;
    for (const id of unreadIds) {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    }
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-md hover:bg-muted transition-colors">
          <Bell className="h-4 w-4 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-primary text-primary-foreground rounded-full text-[10px] flex items-center justify-center font-medium">
              {unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="text-sm font-medium">Notifications</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-auto py-1 px-2 text-xs" onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">No notifications</p>
          ) : notifications.map(n => (
            <div key={n.id} className={`p-3 border-b border-border text-sm ${!n.read ? "bg-primary/5" : ""}`}>
              <p className="font-medium text-xs">{n.title}</p>
              <p className="text-muted-foreground text-xs mt-0.5">{n.message}</p>
              <p className="text-muted-foreground text-[10px] mt-1">
                {new Date(n.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
