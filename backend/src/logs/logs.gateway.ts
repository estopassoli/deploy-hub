import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { spawn } from 'child_process';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: "*",
    credentials: true,
  },
})
export class LogsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logProcesses: Map<string, any> = new Map();

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
    this.startLogStream(client);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    this.stopLogStream(client.id);
  }

  private startLogStream(client: Socket) {
    try {
      const logProcess = spawn('pm2', ['logs', '--raw', '--lines', '0'], {
        shell: true,
      });

      logProcess.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          const logEntry = this.parseLogLine(line);
          client.emit('log', logEntry);
          client.emit('pm2:log', logEntry);
        });
      });

      logProcess.stderr.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          client.emit('log', {
            timestamp: new Date().toISOString(),
            level: 'error',
            app: 'system',
            message: line,
          });
        });
      });

      this.logProcesses.set(client.id, logProcess);
    } catch (error) {
      console.error('Failed to start log stream:', error);
    }
  }

  private stopLogStream(clientId: string) {
    const process = this.logProcesses.get(clientId);
    if (process) {
      process.kill();
      this.logProcesses.delete(clientId);
    }
  }

  private parseLogLine(line: string): any {
    let level = 'info';
    let app = 'system';

    const pm2Match = line.match(/^(\d+)\|([^|]+)\|/);
    if (pm2Match) {
      app = pm2Match[2].trim();
      line = line.substring(pm2Match[0].length);
    }

    if (line.toLowerCase().includes('error')) level = 'error';
    else if (line.toLowerCase().includes('warn')) level = 'warn';
    else if (line.toLowerCase().includes('debug')) level = 'debug';

    return {
      timestamp: new Date().toISOString(),
      level,
      app,
      message: line.trim(),
    };
  }

  broadcastLog(log: any) {
    this.server.emit('log', log);
  }
}