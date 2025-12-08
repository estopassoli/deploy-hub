import { useState, useEffect, useCallback } from 'react';
import {
  StoredNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  clearAllNotifications,
  getUnreadCount,
} from '@/lib/notificationStore';

export function useNotificationHistory() {
  const [notifications, setNotifications] = useState<StoredNotification[]>(getNotifications);
  const [unreadCount, setUnreadCount] = useState(getUnreadCount);

  // Refresh notifications from storage
  const refresh = useCallback(() => {
    setNotifications(getNotifications());
    setUnreadCount(getUnreadCount());
  }, []);

  // Listen for notification events
  useEffect(() => {
    const handleUpdate = () => refresh();
    
    window.addEventListener('notification-added', handleUpdate);
    window.addEventListener('notifications-updated', handleUpdate);
    
    return () => {
      window.removeEventListener('notification-added', handleUpdate);
      window.removeEventListener('notifications-updated', handleUpdate);
    };
  }, [refresh]);

  const handleMarkAsRead = useCallback((id: string) => {
    markAsRead(id);
    refresh();
  }, [refresh]);

  const handleMarkAllAsRead = useCallback(() => {
    markAllAsRead();
    refresh();
  }, [refresh]);

  const handleClearAll = useCallback(() => {
    clearAllNotifications();
    refresh();
  }, [refresh]);

  return {
    notifications,
    unreadCount,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
    clearAll: handleClearAll,
    refresh,
  };
}
