import { io, Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || 'https://api-panel.auraai.chat';

class WebSocketClient {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private connectionPromise: Promise<Socket> | null = null;

  connect(): Promise<Socket> {
    if (this.socket?.connected) {
      return Promise.resolve(this.socket);
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve) => {
      this.socket = io(WS_URL, {
        transports: ['websocket'],
        autoConnect: true,
      });

      this.socket.on('connect', () => {
        console.log('WebSocket connected');
        resolve(this.socket!);
      });

      this.socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
        this.connectionPromise = null;
      });

      this.socket.on('log', (data) => {
        this.emit('log', data);
      });

      this.socket.on('log-error', (data) => {
        this.emit('log-error', data);
      });

      // If already connected (edge case)
      if (this.socket.connected) {
        resolve(this.socket);
      }
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
    this.connect().then(socket => {
      socket.emit('subscribe-logs', { appName });
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
    wsClient.connect();
  }
  return wsClient.getSocket()!;
};
export const getConnectedSocket = () => wsClient.getConnectedSocket();
export default wsClient;
