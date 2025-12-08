import { useEffect, useState, useCallback } from 'react';
import { getSocket } from '@/lib/websocket';
import {
  requestNotificationPermission,
  getNotificationPermission,
  notifyDeployFailed,
  notifyDeploySuccess,
  notifyAppStopped,
  playNotificationSound,
} from '@/lib/notifications';

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    getNotificationPermission()
  );
  const [isEnabled, setIsEnabled] = useState(() => {
    return localStorage.getItem('notifications_enabled') === 'true';
  });

  const requestPermission = useCallback(async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'granted') {
      setIsEnabled(true);
      localStorage.setItem('notifications_enabled', 'true');
    }
    return result;
  }, []);

  const toggleNotifications = useCallback((enabled: boolean) => {
    setIsEnabled(enabled);
    localStorage.setItem('notifications_enabled', enabled ? 'true' : 'false');
  }, []);

  // Listen for deploy events via WebSocket
  useEffect(() => {
    if (!isEnabled || permission !== 'granted') return;

    const socket = getSocket();

    const handleDeployComplete = (data: { appName: string; success: boolean; error?: string; version?: string }) => {
      if (data.success) {
        notifyDeploySuccess(data.appName, data.version);
        playNotificationSound('success');
      } else {
        notifyDeployFailed(data.appName, data.error);
        playNotificationSound('error');
      }
    };

    const handleAppStopped = (data: { appName: string; reason?: string }) => {
      notifyAppStopped(data.appName, data.reason);
      playNotificationSound('warning');
    };

    socket.on('deploy:complete', handleDeployComplete);
    socket.on('app:stopped', handleAppStopped);

    return () => {
      socket.off('deploy:complete', handleDeployComplete);
      socket.off('app:stopped', handleAppStopped);
    };
  }, [isEnabled, permission]);

  return {
    permission,
    isEnabled,
    requestPermission,
    toggleNotifications,
    isSupported: permission !== 'unsupported',
  };
}
