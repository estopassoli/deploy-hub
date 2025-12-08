import {
  WebSocketGateway,
  SubscribeMessage,
  WebSocketServer,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { spawn, ChildProcess } from 'child_process';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class TerminalGateway {
  @WebSocketServer()
  server: Server;

  private activeProcesses: Map<string, ChildProcess> = new Map();

  @SubscribeMessage('terminal:execute')
  async handleExecute(
    @ConnectedSocket() client: Socket,
    payload: { command: string },
  ) {
    const { command } = payload;

    if (!command || typeof command !== 'string') {
      client.emit('terminal:output', { output: 'Comando inválido', isError: true });
      client.emit('terminal:complete', { exitCode: 1 });
      return;
    }

    // Kill any existing process for this client
    this.killProcess(client.id);

    try {
      // Execute command using bash
      const childProcess = spawn('bash', ['-c', command], {
        cwd: process.env.HOME || '/root',
        env: { ...process.env, TERM: 'xterm-256color' },
      });

      this.activeProcesses.set(client.id, childProcess);

      // Handle stdout
      childProcess.stdout.on('data', (data: Buffer) => {
        client.emit('terminal:output', { output: data.toString() });
      });

      // Handle stderr
      childProcess.stderr.on('data', (data: Buffer) => {
        client.emit('terminal:output', { output: data.toString(), isError: true });
      });

      // Handle process exit
      childProcess.on('close', (code: number) => {
        this.activeProcesses.delete(client.id);
        client.emit('terminal:complete', { exitCode: code || 0 });
      });

      // Handle process error
      childProcess.on('error', (error: Error) => {
        client.emit('terminal:output', { output: `Erro: ${error.message}`, isError: true });
        client.emit('terminal:complete', { exitCode: 1 });
        this.activeProcesses.delete(client.id);
      });

    } catch (error) {
      client.emit('terminal:output', { 
        output: `Erro ao executar comando: ${error.message}`, 
        isError: true 
      });
      client.emit('terminal:complete', { exitCode: 1 });
    }
  }

  @SubscribeMessage('terminal:kill')
  handleKill(@ConnectedSocket() client: Socket) {
    this.killProcess(client.id);
  }

  private killProcess(clientId: string) {
    const proc = this.activeProcesses.get(clientId);
    if (proc) {
      proc.kill('SIGTERM');
      this.activeProcesses.delete(clientId);
    }
  }

  // Cleanup on client disconnect
  handleDisconnect(client: Socket) {
    this.killProcess(client.id);
  }
}
