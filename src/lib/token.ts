/**
 * Dono único do token JWT no navegador.
 *
 * Existe para que `api.ts` (REST) e `websocket.ts` (Socket.IO) compartilhem o mesmo
 * token sem um importar o outro — o WebSocket agora precisa do token no handshake, e
 * uma importação circular entre os dois módulos seria frágil.
 *
 * Quem se inscreve em `onTokenChange` é notificado no login e no logout, para reconectar
 * o socket com a credencial nova em vez de ficar preso à antiga.
 */

const TOKEN_KEY = 'deployhub_token';

type TokenListener = (token: string | null) => void;

const listeners = new Set<TokenListener>();

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Modo privado ou storage bloqueado: sem token, e sem quebrar a aplicação.
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* segue com o token só em memória nos listeners */
  }
  notify(token);
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nada a fazer */
  }
  notify(null);
}

export function onTokenChange(listener: TokenListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(token: string | null): void {
  listeners.forEach((listener) => {
    try {
      listener(token);
    } catch (error) {
      console.warn('Listener de token falhou:', error);
    }
  });
}
