import { INestApplicationContext, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions, Socket } from 'socket.io';
import { extractHandshakeToken } from './auth-tokens';

/**
 * Adapter do Socket.IO que exige um JWT válido já no handshake.
 *
 * ## O que isto conserta
 *
 * Os três gateways (`terminal`, `logs`, `deploy`) subiam sem autenticação nenhuma e com
 * `cors: { origin: '*' }`. Qualquer cliente que alcançasse a porta do backend podia
 * emitir `terminal:init` e receber um shell interativo no usuário do backend — root, na
 * instalação padrão — sem token algum. Pelo mesmo caminho saíam todos os logs do PM2 e
 * os logs de deploy. O REST estava protegido por JWT; os WebSockets anulavam isso.
 *
 * ## Por que no adapter e não em cada gateway
 *
 * Os três gateways compartilham o mesmo servidor Socket.IO (nenhum declara porta ou
 * namespace próprio). Instalar o middleware aqui cobre todos de uma vez e garante que um
 * gateway novo já nasça protegido, em vez de depender de alguém lembrar de repetir a
 * checagem. Rejeitar no middleware também é melhor que desconectar depois: a conexão
 * nunca chega a ser estabelecida, então `handleConnection` não roda e nada é emitido
 * para um socket anônimo.
 */
export class AuthenticatedIoAdapter extends IoAdapter {
  private readonly logger = new Logger('WebSocketAuth');
  private readonly jwtService: JwtService;

  constructor(
    appContext: INestApplicationContext,
    private readonly corsOrigin: string[] | true,
  ) {
    super(appContext);
    this.jwtService = appContext.get(JwtService, { strict: false });
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server: Server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: this.corsOrigin,
        credentials: true,
      },
    });

    server.use((socket: Socket, next: (err?: Error) => void) => {
      const token = extractHandshakeToken(socket.handshake);

      if (!token) {
        this.logger.warn(`Handshake sem token recusado (${socket.handshake.address})`);
        next(new Error('unauthorized'));
        return;
      }

      try {
        const payload = this.jwtService.verify<{ sub: string; email?: string }>(token);
        socket.data.user = { userId: payload.sub, email: payload.email };
        next();
      } catch {
        // Nada de logar o token, nem em caso de falha.
        this.logger.warn(`Handshake com token inválido recusado (${socket.handshake.address})`);
        next(new Error('unauthorized'));
      }
    });

    return server;
  }
}
