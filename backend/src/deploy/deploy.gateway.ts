import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
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

  emitDeployLog(appName: string, message: string) {
    this.server.to(`deploy:${appName}`).emit('deploy:log', { appName, message });
  }

  emitDeployComplete(appName: string, success: boolean, data?: any) {
    this.server.to(`deploy:${appName}`).emit('deploy:complete', { appName, success, data });
  }

  handleDisconnect(client: Socket) {
    this.deploySubscribers.forEach((subscribers) => {
      subscribers.delete(client.id);
    });
  }
}