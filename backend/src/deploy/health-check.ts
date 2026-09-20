/**
 * Verificação de saúde depois que o processo (ou container) sobe.
 *
 * ## Por que isto existe
 *
 * O deploy considerava sucesso assim que o `pm2 start` retornava. Mas o PM2 retorna
 * quando **iniciou** o processo, não quando ele está atendendo: um app que falha no
 * boot por variável de ambiente faltando, porta ocupada ou migration não aplicada sobe,
 * morre, e o PM2 reinicia em loop. O painel exibia "🚀 Deploy completed successfully!",
 * o symlink já apontava para a release nova e o domínio respondia 502.
 *
 * ## Critério
 *
 * Qualquer resposta HTTP com status < 500 conta como saudável. É deliberadamente
 * permissivo: um 404 numa rota `/` que o app não define, ou um 401 numa API que exige
 * token, significam "o processo está de pé e respondendo" — que é exatamente o que
 * queremos distinguir de "a porta não aceita conexão" e de "o app responde 500 porque
 * não conseguiu conectar no banco".
 */

export interface HealthCheckOptions {
  /** Porta em 127.0.0.1 onde o app deveria estar atendendo. */
  port: number;
  /** Caminho checado. Default `/`. */
  path?: string;
  /** Número de tentativas. Default 10. */
  attempts?: number;
  /** Espera entre tentativas, em ms. Default 3000. */
  delayMs?: number;
  /** Timeout de cada tentativa, em ms. Default 5000. */
  timeoutMs?: number;
  /** Injetáveis para teste. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Chamado a cada tentativa, para escrever no log do deploy. */
  onAttempt?: (attempt: number, total: number, detail: string) => void;
  /** Permite abortar quando o deploy é cancelado. */
  isCancelled?: () => boolean;
}

export interface HealthCheckResult {
  ok: boolean;
  attempts: number;
  status?: number;
  error?: string;
  /** Tempo total gasto tentando, em ms. */
  durationMs: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Normaliza o healthPath: sempre começa com `/`, `null`/vazio viram `/`. */
export function normalizeHealthPath(path: string | null | undefined): string {
  const value = (path || '').trim();
  if (!value) return '/';
  return value.startsWith('/') ? value : `/${value}`;
}

/** URL checada. Sempre 127.0.0.1: o alvo é o processo local, não o domínio público. */
export function healthUrl(port: number, path: string | null | undefined): string {
  return `http://127.0.0.1:${port}${normalizeHealthPath(path)}`;
}

/** Um status < 500 significa "o processo está de pé e respondendo". */
export function isHealthyStatus(status: number): boolean {
  return Number.isFinite(status) && status > 0 && status < 500;
}

export async function waitForHealthy(options: HealthCheckOptions): Promise<HealthCheckResult> {
  const {
    port,
    path,
    attempts = 10,
    delayMs = 3000,
    timeoutMs = 5000,
    fetchImpl = fetch,
    sleep = defaultSleep,
    onAttempt,
    isCancelled,
  } = options;

  const url = healthUrl(port, path);
  const startedAt = Date.now();
  let lastError = 'nenhuma tentativa realizada';
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (isCancelled?.()) {
      return {
        ok: false,
        attempts: attempt - 1,
        error: 'cancelado',
        durationMs: Date.now() - startedAt,
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          signal: controller.signal,
          // Um redirect é resposta: o processo está atendendo.
          redirect: 'manual',
        });
        lastStatus = response.status;

        if (isHealthyStatus(response.status)) {
          onAttempt?.(attempt, attempts, `HTTP ${response.status}`);
          return {
            ok: true,
            attempts: attempt,
            status: response.status,
            durationMs: Date.now() - startedAt,
          };
        }

        lastError = `HTTP ${response.status}`;
      } finally {
        clearTimeout(timer);
      }
    } catch (error: any) {
      // ECONNREFUSED é o caso normal nas primeiras tentativas: o processo ainda está
      // subindo. Só vira falha se persistir até a última tentativa.
      lastError = error?.name === 'AbortError' ? `timeout após ${timeoutMs}ms` : (error?.message ?? String(error));
    }

    onAttempt?.(attempt, attempts, lastError);

    if (attempt < attempts) await sleep(delayMs);
  }

  return {
    ok: false,
    attempts,
    status: lastStatus,
    error: lastError,
    durationMs: Date.now() - startedAt,
  };
}
