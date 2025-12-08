// Notification service for browser push notifications

export type NotificationType = 'deploy_failed' | 'app_stopped' | 'deploy_success';

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

const NOTIFICATION_ICON = '/logo.png';

// Request permission for notifications
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission;
  }

  return Notification.permission;
}

// Check if notifications are supported and permitted
export function canShowNotifications(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}

// Get current permission status
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

// Show a notification
export function showNotification(payload: NotificationPayload): Notification | null {
  if (!canShowNotifications()) {
    console.warn('Notifications not permitted');
    return null;
  }

  const notification = new Notification(payload.title, {
    body: payload.body,
    icon: payload.icon || NOTIFICATION_ICON,
    tag: payload.tag,
    badge: NOTIFICATION_ICON,
    data: payload.data,
    requireInteraction: true,
  });

  // Auto close after 10 seconds
  setTimeout(() => notification.close(), 10000);

  return notification;
}

// Show deploy failed notification
export function notifyDeployFailed(appName: string, error?: string): Notification | null {
  return showNotification({
    title: '❌ Deploy Falhou',
    body: error 
      ? `${appName}: ${error.substring(0, 100)}`
      : `O deploy de ${appName} falhou. Verifique os logs.`,
    tag: `deploy-failed-${appName}`,
    data: { type: 'deploy_failed', appName },
  });
}

// Show app stopped notification
export function notifyAppStopped(appName: string, reason?: string): Notification | null {
  return showNotification({
    title: '⚠️ Aplicação Parou',
    body: reason 
      ? `${appName}: ${reason.substring(0, 100)}`
      : `A aplicação ${appName} parou inesperadamente.`,
    tag: `app-stopped-${appName}`,
    data: { type: 'app_stopped', appName },
  });
}

// Show deploy success notification
export function notifyDeploySuccess(appName: string, version?: string): Notification | null {
  return showNotification({
    title: '✅ Deploy Concluído',
    body: version 
      ? `${appName} atualizado para versão ${version}`
      : `Deploy de ${appName} concluído com sucesso.`,
    tag: `deploy-success-${appName}`,
    data: { type: 'deploy_success', appName },
  });
}

// Play notification sound
export function playNotificationSound(type: 'success' | 'error' | 'warning' = 'error'): void {
  // Use Web Audio API for notification sounds
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Different frequencies for different notification types
    const frequencies = {
      success: [523.25, 659.25, 783.99], // C5, E5, G5 (major chord)
      error: [349.23, 329.63, 311.13],   // F4, E4, Eb4 (descending)
      warning: [440, 440],                // A4 (beep)
    };
    
    const freqs = frequencies[type];
    const duration = 0.15;
    
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    
    freqs.forEach((freq, index) => {
      oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + (index * duration));
    });
    
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + (freqs.length * duration));
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + (freqs.length * duration));
  } catch (e) {
    console.warn('Could not play notification sound:', e);
  }
}
