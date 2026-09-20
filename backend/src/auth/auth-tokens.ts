/**
 * Helpers puros de autenticação, sem Nest e sem decorators, para poderem ser testados
 * pelo `node --test` (veja o cabeçalho de `apps/apps.dto.ts`).
 */

import { createHash, timingSafeEqual } from 'crypto';

/** Formato mínimo do handshake do Socket.IO que nos interessa. */
export interface HandshakeLike {
  auth?: { token?: unknown } | null;
  headers?: { authorization?: unknown } | null;
  query?: Record<string, unknown> | null;
}

/** Extrai o token de um header `Authorization: Bearer <token>`. */
export function extractBearerToken(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  return token || null;
}

/**
 * Token de um handshake de WebSocket.
 *
 * `handshake.auth` é o caminho principal: o cliente manda em `io(url, { auth })` e ele
 * viaja tanto no transporte websocket quanto no polling, sem aparecer na URL. O header
 * `Authorization` é aceito como alternativa para clientes que não usam o socket.io-client
 * (curl, testes). A query string **não** é aceita de propósito: ela acaba em log de
 * acesso do nginx e em `Referer`.
 */
export function extractHandshakeToken(handshake: HandshakeLike | null | undefined): string | null {
  if (!handshake) return null;

  const authToken = handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim();
  }

  return extractBearerToken(handshake.headers?.authorization);
}

/**
 * Compara dois segredos em tempo constante.
 *
 * Os valores passam por SHA-256 antes do `timingSafeEqual` porque ele exige buffers do
 * mesmo tamanho — comparar os textos crus vazaria o comprimento do segredo e lançaria
 * exceção quando os tamanhos diferissem.
 */
export function safeCompareSecret(received: unknown, expected: unknown): boolean {
  if (typeof received !== 'string' || typeof expected !== 'string') return false;
  if (expected.length === 0) return false;

  const a = createHash('sha256').update(received, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/** Usuário resolvido no handshake e anexado em `socket.data.user`. */
export interface SocketUser {
  userId: string;
  email?: string;
}

/**
 * Usuário autenticado de um socket, ou `null` se o socket não passou pelo middleware
 * de autenticação. Os gateways usam isto como defesa em profundidade: mesmo que o
 * middleware deixe de ser instalado por engano, nenhum handler roda sem usuário.
 */
export function getSocketUser(client: unknown): SocketUser | null {
  const data = (client as { data?: { user?: unknown } } | null)?.data;
  const user = data?.user as SocketUser | undefined;
  if (!user || typeof user.userId !== 'string' || !user.userId) return null;
  return user;
}
