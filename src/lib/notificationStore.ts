// Notification history store

export type NotificationLevel = 'success' | 'error' | 'warning' | 'info';

export interface StoredNotification {
  id: string;
  type: 'deploy_failed' | 'deploy_success' | 'app_stopped' | 'system';
  title: string;
  message: string;
  level: NotificationLevel;
  appName?: string;
  timestamp: number;
  read: boolean;
}

const STORAGE_KEY = 'notification_history';
const MAX_NOTIFICATIONS = 50;

// Get all notifications from localStorage
export function getNotifications(): StoredNotification[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Add a new notification
export function addNotification(notification: Omit<StoredNotification, 'id' | 'timestamp' | 'read'>): StoredNotification {
  const notifications = getNotifications();
  
  const newNotification: StoredNotification = {
    ...notification,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    read: false,
  };
  
  // Add to beginning and limit to MAX_NOTIFICATIONS
  const updated = [newNotification, ...notifications].slice(0, MAX_NOTIFICATIONS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  
  // Dispatch custom event for real-time updates
  window.dispatchEvent(new CustomEvent('notification-added', { detail: newNotification }));
  
  return newNotification;
}

// Mark notification as read
export function markAsRead(id: string): void {
  const notifications = getNotifications();
  const updated = notifications.map(n => 
    n.id === id ? { ...n, read: true } : n
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('notifications-updated'));
}

// Mark all as read
export function markAllAsRead(): void {
  const notifications = getNotifications();
  const updated = notifications.map(n => ({ ...n, read: true }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('notifications-updated'));
}

// Clear all notifications
export function clearAllNotifications(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('notifications-updated'));
}

// Get unread count
export function getUnreadCount(): number {
  return getNotifications().filter(n => !n.read).length;
}

// Helper to add deploy notifications
export function addDeployNotification(appName: string, success: boolean, error?: string, version?: string): void {
  if (success) {
    addNotification({
      type: 'deploy_success',
      title: 'Deploy Concluído',
      message: version 
        ? `${appName} atualizado para versão ${version}`
        : `Deploy de ${appName} concluído com sucesso.`,
      level: 'success',
      appName,
    });
  } else {
    addNotification({
      type: 'deploy_failed',
      title: 'Deploy Falhou',
      message: error 
        ? `${appName}: ${error.substring(0, 100)}`
        : `O deploy de ${appName} falhou.`,
      level: 'error',
      appName,
    });
  }
}

// Helper to add app stopped notification
export function addAppStoppedNotification(appName: string, reason?: string): void {
  addNotification({
    type: 'app_stopped',
    title: 'Aplicação Parou',
    message: reason 
      ? `${appName}: ${reason.substring(0, 100)}`
      : `A aplicação ${appName} parou inesperadamente.`,
    level: 'warning',
    appName,
  });
}
