import {
    ConnectedSocket,
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { IPty, spawn } from 'node-pty';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class TerminalGateway {
  @WebSocketServer()
  server: Server;

  private terminals: Map<string, IPty> = new Map();

  @SubscribeMessage('terminal:init')
  handleInit(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: { cols?: number; rows?: number },
  ) {
    this.killProcess(client.id);

    const shell = process.env.SHELL || '/bin/bash';
    const cols = payload?.cols ?? 80;
    const rows = payload?.rows ?? 24;

    const ptyProcess = spawn(shell, ['-i'], {
      name: 'xterm-color',
      cols,
      rows,
      cwd: process.env.HOME || '/root',
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    this.terminals.set(client.id, ptyProcess);

    ptyProcess.onData((data) => {
      client.emit('terminal:data', data);
    });

    ptyProcess.onExit(({ exitCode }) => {
      client.emit('terminal:exit', { exitCode });
      this.killProcess(client.id);
    });
  }

  @SubscribeMessage('terminal:input')
  handleInput(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { data: string },
  ) {
    const terminal = this.terminals.get(client.id);
    if (!terminal) {
      client.emit('terminal:error', 'Terminal não inicializado');
      return;
    }

    if (typeof payload?.data === 'string') {
      terminal.write(payload.data);
    }
  }

  @SubscribeMessage('terminal:resize')
  handleResize(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { cols: number; rows: number },
  ) {
    const terminal = this.terminals.get(client.id);
    if (!terminal) return;

    const cols = Math.max(2, Math.floor(payload?.cols ?? 0));
    const rows = Math.max(1, Math.floor(payload?.rows ?? 0));

    if (cols && rows) {
      terminal.resize(cols, rows);
    }
  }

  @SubscribeMessage('terminal:kill')
  handleKill(@ConnectedSocket() client: Socket) {
    this.killProcess(client.id);
  }

  handleDisconnect(client: Socket) {
    this.killProcess(client.id);
  }

  private killProcess(clientId: string) {
    const terminal = this.terminals.get(clientId);
    if (terminal) {
      try {
        terminal.kill();
      } catch (error) {
        console.error('Erro ao finalizar terminal:', error);
      }
      this.terminals.delete(clientId);
    }
  }
}
