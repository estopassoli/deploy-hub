/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class DeployGateway {
  @WebSocketServer()
  server: Server;

  private deploySubscribers: Map<string, Set<string>> = new Map();

  @SubscribeMessage('subscribe-deploy')
  handleSubscribeDeploy(
    @MessageBody() data: { appName: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { appName } = data;
    if (!this.deploySubscribers.has(appName)) {
      this.deploySubscribers.set(appName, new Set());
    }
    this.deploySubscribers.get(appName)!.add(client.id);
    client.join(`deploy:${appName}`);
    console.log(`Client ${client.id} subscribed to deploy logs for ${appName}`);
  }

  @SubscribeMessage('unsubscribe-deploy')
  handleUnsubscribeDeploy(@ConnectedSocket() client: Socket) {
    this.deploySubscribers.forEach((subscribers, appName) => {
      subscribers.delete(client.id);
      client.leave(`deploy:${appName}`);
    });
  }

  emitDeployLog(appName: string, message: string, phase?: string) {
    this.server.to(`deploy:${appName}`).emit('deploy:log', { appName, message, phase });
  }

  emitDeployComplete(appName: string, success: boolean, data?: any) {
    // Emit to specific room and broadcast globally for notifications
    this.server.to(`deploy:${appName}`).emit('deploy:complete', { 
      appName, 
      success, 
      version: data?.version,
      error: data?.error,
    });
    
    // Also emit to all connected clients for push notifications
    this.server.emit('deploy:complete', { 
      appName, 
      success, 
      version: data?.version,
      error: data?.error,
    });
  }

  emitAppStopped(appName: string, reason?: string) {
    this.server.emit('app:stopped', { appName, reason });
  }

  handleDisconnect(client: Socket) {
    this.deploySubscribers.forEach((subscribers) => {
      subscribers.delete(client.id);
    });
  }
}