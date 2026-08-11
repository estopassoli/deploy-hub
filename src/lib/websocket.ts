import { io, Socket } from 'socket.io-client';

const resolveWsUrl = () => {
  const explicit = import.meta.env.VITE_WS_URL?.trim();
  if (explicit) return explicit;

  const apiUrl = import.meta.env.VITE_API_URL?.trim();
  if (apiUrl) {
    try {
      const parsed = new URL(apiUrl);
      return `${parsed.protocol}//${parsed.host}`;
    } catch (error) {
      console.warn('Invalid VITE_API_URL, falling back to window location:', error);
    }
  }

  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.host}`;
  }

  // Development fallback
  return 'http://localhost:10001';
};

const WS_URL = resolveWsUrl();

class WebSocketClient {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private connectionPromise: Promise<Socket> | null = null;

  // Lazily create the socket once and attach the persistent listeners. The
  // socket auto-reconnects on its own; we never create more than one instance.
  private ensureSocket(): Socket {
    if (this.socket) return this.socket;

    const socket = io(WS_URL, {
      // Allow the polling fallback: a websocket-only handshake is fragile behind
      // proxies/CDNs (e.g. Cloudflare) and a single failure used to hang deploys.
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
    });

    socket.on('connect', () => console.log('WebSocket connected'));
    socket.on('disconnect', () => console.log('WebSocket disconnected'));
    socket.on('connect_error', (err) =>
      console.warn('WebSocket connect_error:', err?.message ?? err),
    );
    socket.on('log', (data) => this.emit('log', data));
    socket.on('log-error', (data) => this.emit('log-error', data));

    this.socket = socket;
    return socket;
  }

  connect(timeoutMs = 8000): Promise<Socket> {
    const socket = this.ensureSocket();

    if (socket.connected) {
      return Promise.resolve(socket);
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // Always settle this promise (resolve, reject, or timeout) and clear the
    // cached reference afterwards, so a failed attempt never permanently
    // "poisons" future connect() calls (the bug that silently killed deploys).
    this.connectionPromise = new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        socket.off('connect', onConnect);
        socket.off('connect_error', onError);
        this.connectionPromise = null;
      };
      const onConnect = () => {
        cleanup();
        resolve(socket);
      };
      const onError = (err: unknown) => {
        cleanup();
        reject(err instanceof Error ? err : new Error('WebSocket connection error'));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('WebSocket connection timed out'));
      }, timeoutMs);

      socket.on('connect', onConnect);
      socket.on('connect_error', onError);
    });

    return this.connectionPromise;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connectionPromise = null;
    }
  }

  subscribeLogs(appName: string) {
    this.connect()
      .then(socket => {
        socket.emit('subscribe-logs', { appName });
      })
      .catch(err => {
        console.warn('subscribeLogs: WebSocket unavailable:', err?.message ?? err);
      });
  }

  unsubscribeLogs() {
    this.socket?.emit('unsubscribe-logs');
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (data: any) => void) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach((callback) => callback(data));
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  async getConnectedSocket(): Promise<Socket> {
    return this.connect();
  }
}

export const wsClient = new WebSocketClient();
export const getSocket = () => {
  if (!wsClient.getSocket()) {
    // Fire-and-forget: swallow the rejection so a failed connect never becomes
    // an unhandled promise rejection. The socket auto-reconnects in background.
    wsClient.connect().catch(() => {});
  }
  return wsClient.getSocket()!;
};
export const getConnectedSocket = () => wsClient.getConnectedSocket();
export default wsClient;
