/**
 * Tradução de uma requisição HTTP em um registro de auditoria — e, principalmente,
 * a **redação** do que pode ser guardado.
 *
 * ## A regra que manda em tudo aqui
 *
 * Um log de auditoria que guarda segredos vira, ele mesmo, o alvo mais valioso do
 * sistema: uma tabela única com todas as senhas de banco, chaves de API e tokens que já
 * passaram pelo painel, em texto puro, fora do alcance da criptografia da Fase 2.
 *
 * Então: **nenhum valor de variável de ambiente, token, webhook ou senha entra no
 * registro.** Para `envVars`, guarda-se apenas a lista de NOMES das chaves — que é o que
 * responde "o que essa pessoa mexeu" sem entregar o conteúdo. Para tudo o mais, a
 * lista de campos permitidos é explícita (allowlist), não uma lista de proibidos: um
 * campo novo no futuro nasce redigido por padrão, em vez de vazar até alguém notar.
 *
 * Módulo puro, testável pelo `node --test`.
 */

/** Campos que podem ser guardados como estão. Tudo fora daqui é descartado. */
const SAFE_FIELDS = new Set([
  'name',
  'type',
  'port',
  'domain',
  'branch',
  'repository',
  'runtime',
  'containerPort',
  'dockerContext',
  'healthPath',
  'appDir',
  'workspacePackage',
  'generateSSL',
  'maxMemoryMb',
  'cpuLimit',
  'retentionDays',
  'autoCleanup',
  'emailEnabled',
  'uptimeEnabled',
  'notifyDeployFailed',
  'notifyDeploySuccess',
  'notifyRollback',
  'notifyAppDown',
  'notifySslExpiring',
  'installCommand',
  'buildCommand',
  'migrateCommand',
  'startCommand',
]);

/**
 * Campos cuja **existência** é registrada, mas cujo valor nunca é.
 *
 * Saber que alguém trocou o webhook do Slack é informação de auditoria legítima; saber
 * qual é a URL, não.
 */
const REDACTED_FIELDS = new Set([
  'password',
  'secret',
  'slackWebhook',
  'discordWebhook',
  'telegramBotToken',
  'telegramChatId',
  'emailRecipient',
]);

export interface AuditDescriptor {
  action: string;
  targetType: string | null;
  /** Índice do parâmetro de rota que identifica o alvo. */
  targetIdFrom?: string;
}

/**
 * Mapa de rota → ação legível.
 *
 * A chave é `MÉTODO caminho`, com os parâmetros na forma `:param`. Rotas não mapeadas
 * ainda são registradas, com uma ação derivada do caminho — o objetivo é que um
 * endpoint novo apareça na auditoria mesmo que ninguém lembre de adicioná-lo aqui.
 */
const ROUTES: Record<string, AuditDescriptor> = {
  'POST /api/deploy': { action: 'deploy.create', targetType: 'app' },
  'POST /api/deploy/:appId': { action: 'deploy.redeploy', targetType: 'app', targetIdFrom: 'appId' },
  'POST /api/deploy/cancel/:key': { action: 'deploy.cancel', targetType: 'app', targetIdFrom: 'key' },

  'POST /api/apps': { action: 'app.create', targetType: 'app' },
  'PUT /api/apps/:id': { action: 'app.update', targetType: 'app', targetIdFrom: 'id' },
  'DELETE /api/apps/:id': { action: 'app.delete', targetType: 'app', targetIdFrom: 'id' },
  'POST /api/apps/:id/start': { action: 'app.start', targetType: 'app', targetIdFrom: 'id' },
  'POST /api/apps/:id/stop': { action: 'app.stop', targetType: 'app', targetIdFrom: 'id' },
  'POST /api/apps/:id/restart': { action: 'app.restart', targetType: 'app', targetIdFrom: 'id' },
  'POST /api/apps/:id/rollback/:deployId': { action: 'app.rollback', targetType: 'app', targetIdFrom: 'id' },
  'POST /api/apps/:id/apply-env': { action: 'env.apply', targetType: 'app', targetIdFrom: 'id' },

  'POST /api/projects': { action: 'project.create', targetType: 'project' },
  'PUT /api/projects/:id': { action: 'project.update', targetType: 'project', targetIdFrom: 'id' },
  'DELETE /api/projects/:id': { action: 'project.delete', targetType: 'project', targetIdFrom: 'id' },
  'POST /api/projects/:id/redeploy': { action: 'project.redeploy', targetType: 'project', targetIdFrom: 'id' },
  'POST /api/projects/:id/rollback/:deployId': { action: 'project.rollback', targetType: 'project', targetIdFrom: 'id' },
  'POST /api/projects/:id/services': { action: 'service.add', targetType: 'project', targetIdFrom: 'id' },
  'DELETE /api/projects/:id/services/:appId': { action: 'service.remove', targetType: 'project', targetIdFrom: 'id' },
  'POST /api/projects/:id/services/:appId/deploy': { action: 'service.deploy', targetType: 'project', targetIdFrom: 'id' },
  'POST /api/projects/:id/generate-ssl': { action: 'project.ssl', targetType: 'project', targetIdFrom: 'id' },

  'PUT /api/system/settings/email': { action: 'settings.email', targetType: 'system' },
  'PUT /api/system/settings/general': { action: 'settings.general', targetType: 'system' },
  'PUT /api/system/settings/notifications': { action: 'settings.notifications', targetType: 'system' },
  'POST /api/system/logs/clear': { action: 'system.clearLogs', targetType: 'system' },

  'POST /api/webhook/regenerate-secret/:appId': { action: 'app.regenerateSecret', targetType: 'app', targetIdFrom: 'appId' },

  'POST /api/auth/login': { action: 'auth.login', targetType: 'system' },
  'POST /api/auth/register': { action: 'auth.register', targetType: 'system' },
};

/** Métodos que alteram estado. GET nunca é auditado — seria ruído puro. */
export function isAuditableMethod(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

/**
 * Descreve a requisição.
 *
 * `routePath` é o padrão do Nest (`/api/apps/:id`), não a URL concreta — é o que
 * permite agrupar por ação em vez de ter uma linha distinta por id.
 */
export function describeRequest(method: string, routePath: string): AuditDescriptor {
  const chave = `${method.toUpperCase()} ${routePath}`;
  const conhecida = ROUTES[chave];
  if (conhecida) return conhecida;

  // Endpoint não mapeado: registra assim mesmo, com uma ação derivada do caminho.
  // Auditar de menos é pior que auditar com um rótulo feio.
  const limpo = routePath
    .replace(/^\/api\//, '')
    .split('/')
    .filter((parte) => parte && !parte.startsWith(':'))
    .join('.');

  return { action: `${limpo || 'desconhecido'}.${method.toLowerCase()}`, targetType: null };
}

/**
 * Redige o corpo da requisição para guardar no log.
 *
 * - `envVars` vira `{ envKeys: [...] }`: só os nomes das chaves.
 * - Campos da allowlist passam como estão.
 * - Campos sensíveis conhecidos viram `'[redigido]'` — registra-se que mudaram.
 * - Todo o resto é **descartado**.
 */
export function redactBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

  const resultado: Record<string, unknown> = {};

  for (const [chave, valor] of Object.entries(body as Record<string, unknown>)) {
    if (chave === 'envVars') {
      const nomes = extractEnvKeys(valor);
      if (nomes.length > 0) resultado.envKeys = nomes;
      else resultado.envKeys = [];
      continue;
    }

    if (REDACTED_FIELDS.has(chave)) {
      // Só registra que o campo veio, nunca o valor.
      resultado[chave] = valor === '' || valor === null ? '[removido]' : '[redigido]';
      continue;
    }

    if (!SAFE_FIELDS.has(chave)) continue;

    // Mesmo num campo da allowlist, objeto aninhado não entra: `services: [...]` de um
    // create de projeto carrega o envVars de cada service.
    if (valor !== null && typeof valor === 'object') continue;

    resultado[chave] = valor;
  }

  return Object.keys(resultado).length > 0 ? resultado : null;
}

/** Nomes das chaves de um texto de .env. Nunca os valores. */
export function extractEnvKeys(envVars: unknown): string[] {
  if (typeof envVars !== 'string' || !envVars) return [];

  const nomes: string[] = [];
  for (const rawLine of envVars.split('\n')) {
    const linha = rawLine.trim();
    if (!linha || linha.startsWith('#')) continue;
    const eq = linha.indexOf('=');
    if (eq <= 0) continue;
    nomes.push(linha.slice(0, eq).trim());
  }
  return nomes;
}

/** Rótulo em português para a UI. */
export const ACTION_LABELS: Record<string, string> = {
  'deploy.create': 'Novo deploy',
  'deploy.redeploy': 'Redeploy',
  'deploy.cancel': 'Deploy cancelado',
  'app.create': 'App criado',
  'app.update': 'App configurado',
  'app.delete': 'App excluído',
  'app.start': 'App iniciado',
  'app.stop': 'App parado',
  'app.restart': 'App reiniciado',
  'app.rollback': 'Rollback',
  'app.regenerateSecret': 'Webhook secret regenerado',
  'env.apply': 'Variáveis aplicadas',
  'project.create': 'Projeto criado',
  'project.update': 'Projeto configurado',
  'project.delete': 'Projeto excluído',
  'project.redeploy': 'Redeploy do projeto',
  'project.rollback': 'Rollback do projeto',
  'project.ssl': 'SSL gerado',
  'service.add': 'Service adicionado',
  'service.remove': 'Service removido',
  'service.deploy': 'Deploy de service',
  'settings.email': 'Configuração de email',
  'settings.general': 'Configuração de retenção',
  'settings.notifications': 'Configuração de notificações',
  'system.clearLogs': 'Logs apagados',
  'auth.login': 'Login',
  'auth.register': 'Conta criada',
  'terminal.open': 'Terminal aberto',
  'terminal.close': 'Terminal fechado',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
