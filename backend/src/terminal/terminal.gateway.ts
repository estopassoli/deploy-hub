import {
    ConnectedSocket,
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { IPty, spawn } from 'node-pty';
import { Server, Socket } from 'socket.io';
import { getSocketUser } from '../auth/auth-tokens';
import { AuditService } from '../audit/audit.service';

// O CORS e a autenticação do handshake vêm do AuthenticatedIoAdapter (main.ts), que
// cobre os três gateways de uma vez. Um socket sem JWT válido nunca chega aqui.
@WebSocketGateway()
export class TerminalGateway {
  @WebSocketServer()
  server: Server;

  // O terminal dá shell no usuário do backend — root, na instalação padrão. É a ação
  // mais sensível do painel e a que menos deixa rastro: os comandos digitados ficam
  // só no histórico do shell. Registrar quem abriu e quando é o mínimo.
  constructor(private audit: AuditService) {}

  private terminals: Map<string, IPty> = new Map();
  /** userId -> clientId do terminal vivo desse usuário. Um terminal por usuário. */
  private terminalOwners: Map<string, string> = new Map();

  @SubscribeMessage('terminal:init')
  handleInit(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: { cols?: number; rows?: number },
  ) {
    // Defesa em profundidade: o middleware do adapter já recusa o handshake anônimo,
    // mas este handler abre um shell — ele não roda sem usuário resolvido, ponto.
    const user = getSocketUser(client);
    if (!user) {
      client.emit('terminal:error', 'Não autenticado');
      client.disconnect(true);
      return;
    }

    this.killProcess(client.id);

    // Um terminal por usuário: derruba o anterior, mesmo que esteja em outro socket
    // (aba antiga, janela destacada, reconexão que deixou o PTY órfão). Sem isto, cada
    // reload acumulava um processo de shell vivo no servidor.
    const previousClientId = this.terminalOwners.get(user.userId);
    if (previousClientId && previousClientId !== client.id) {
      this.server.sockets.sockets
        .get(previousClientId)
        ?.emit('terminal:exit', { exitCode: 0 });
      this.killProcess(previousClientId);
    }

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
    this.terminalOwners.set(user.userId, client.id);

    void this.audit.record({
      userId: user.userId,
      userEmail: user.email,
      action: 'terminal.open',
      targetType: 'terminal',
      ip: client.handshake.address,
      metadata: { shell, cols, rows },
    });

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
    if (!getSocketUser(client)) {
      client.disconnect(true);
      return;
    }

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

    for (const [userId, ownedClientId] of this.terminalOwners) {
      if (ownedClientId === clientId) this.terminalOwners.delete(userId);
    }
  }
}
