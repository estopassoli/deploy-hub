/**
 * Configurações operacionais guardadas na tabela `Setting` (chave/valor).
 *
 * ## Contexto
 *
 * O modelo `Setting` existia desde a primeira migration, era populado pelo seed com
 * `apps_dir` e `retention_days`... e **nunca era lido em lugar nenhum**. Ao mesmo tempo,
 * a tela `/settings` mostrava campos de "Retention Period" e "Automatic Cleanup" cujo
 * `handleSave` só disparava um toast de sucesso — nada era persistido, e a limpeza
 * diária usava uma constante `RETENTION_DAYS = 30` fixa no código.
 *
 * O resultado é o pior dos dois mundos: o operador acreditava ter configurado a
 * retenção, e o servidor seguia apagando releases com a regra antiga.
 *
 * Este módulo liga as duas pontas. Os parsers ficam puros para serem testáveis.
 */

export const SETTING_KEYS = {
  retentionDays: 'retention_days',
  autoCleanup: 'auto_cleanup',
  backupEnabled: 'backup_enabled',
  backupRetentionDays: 'backup_retention_days',
  backupApps: 'backup_apps',
  previewEnabled: 'preview_enabled',
  previewBranchPattern: 'preview_branch_pattern',
  previewTtlDays: 'preview_ttl_days',
} as const;

export const RETENTION_DAYS_DEFAULT = 30;
export const RETENTION_DAYS_MIN = 1;
export const RETENTION_DAYS_MAX = 365;

export interface GeneralSettings {
  retentionDays: number;
  autoCleanup: boolean;
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  retentionDays: RETENTION_DAYS_DEFAULT,
  autoCleanup: true,
};

/**
 * Lê `retention_days` de um valor de texto do banco.
 *
 * Um valor ausente, vazio ou fora da faixa cai no default em vez de virar `NaN` — um
 * NaN aqui significaria comparar datas contra `Invalid Date` e **não apagar nada**, ou
 * pior, apagar tudo, dependendo da comparação.
 */
export function parseRetentionDays(raw: string | null | undefined): number {
  const value = parseInt((raw || '').trim(), 10);
  if (!Number.isFinite(value)) return RETENTION_DAYS_DEFAULT;
  if (value < RETENTION_DAYS_MIN || value > RETENTION_DAYS_MAX) return RETENTION_DAYS_DEFAULT;
  return value;
}

/** Lê `auto_cleanup`. Qualquer coisa fora de 'false'/'0'/'no' é considerada ligada. */
export function parseAutoCleanup(raw: string | null | undefined): boolean {
  const value = (raw || '').trim().toLowerCase();
  if (!value) return DEFAULT_GENERAL_SETTINGS.autoCleanup;
  return !['false', '0', 'no', 'off'].includes(value);
}

/** Valida o que a UI manda antes de gravar. Lança com mensagem legível. */
export function validateRetentionDays(value: unknown): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed < RETENTION_DAYS_MIN || parsed > RETENTION_DAYS_MAX) {
    throw new Error(
      `Retenção deve ser um número inteiro entre ${RETENTION_DAYS_MIN} e ${RETENTION_DAYS_MAX} dias`,
    );
  }
  return parsed;
}

/** Converte as linhas chave/valor em um objeto tipado. */
export function toGeneralSettings(rows: Array<{ key: string; value: string }>): GeneralSettings {
  const map = new Map(rows.map((row) => [row.key, row.value]));
  return {
    retentionDays: parseRetentionDays(map.get(SETTING_KEYS.retentionDays)),
    autoCleanup: parseAutoCleanup(map.get(SETTING_KEYS.autoCleanup)),
  };
}

// --- backup (Fase 6.6) --------------------------------------------------------

export const BACKUP_RETENTION_DEFAULT = 14;
export const BACKUP_RETENTION_MIN = 1;
export const BACKUP_RETENTION_MAX = 365;

export interface BackupSettings {
  backupEnabled: boolean;
  backupRetentionDays: number;
  /** Também dumpar os bancos Postgres/MySQL declarados no .env de cada app. */
  backupApps: boolean;
}

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  // Ligado por padrão: o banco do painel guarda o estado inteiro da operação, e o
  // custo de um VACUUM INTO diário é desprezível.
  backupEnabled: true,
  backupRetentionDays: BACKUP_RETENTION_DEFAULT,
  // Desligado por padrão: dumpar o banco de uma aplicação em produção é uma decisão
  // consciente, não algo que deva começar a acontecer sozinho depois de um update.
  backupApps: false,
};

export function parseBackupRetentionDays(raw: string | null | undefined): number {
  const value = parseInt((raw || '').trim(), 10);
  if (!Number.isFinite(value)) return BACKUP_RETENTION_DEFAULT;
  if (value < BACKUP_RETENTION_MIN || value > BACKUP_RETENTION_MAX) return BACKUP_RETENTION_DEFAULT;
  return value;
}

export function validateBackupRetentionDays(value: unknown): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed < BACKUP_RETENTION_MIN || parsed > BACKUP_RETENTION_MAX) {
    throw new Error(
      `Retenção de backup deve ser um inteiro entre ${BACKUP_RETENTION_MIN} e ${BACKUP_RETENTION_MAX} dias`,
    );
  }
  return parsed;
}

/** `false`/`0`/`no`/`off` desligam; ausência usa o default de cada chave. */
function parseFlag(raw: string | null | undefined, fallback: boolean): boolean {
  const value = (raw || '').trim().toLowerCase();
  if (!value) return fallback;
  return !['false', '0', 'no', 'off'].includes(value);
}

export function toBackupSettings(rows: Array<{ key: string; value: string }>): BackupSettings {
  const map = new Map(rows.map((row) => [row.key, row.value]));
  return {
    backupEnabled: parseFlag(map.get(SETTING_KEYS.backupEnabled), DEFAULT_BACKUP_SETTINGS.backupEnabled),
    backupRetentionDays: parseBackupRetentionDays(map.get(SETTING_KEYS.backupRetentionDays)),
    backupApps: parseFlag(map.get(SETTING_KEYS.backupApps), DEFAULT_BACKUP_SETTINGS.backupApps),
  };
}

// --- preview por branch (Fase 6.7) --------------------------------------------

export const PREVIEW_TTL_DEFAULT = 7;
export const PREVIEW_TTL_MIN = 1;
export const PREVIEW_TTL_MAX = 90;

export interface PreviewSettings {
  previewEnabled: boolean;
  /**
   * Lista separada por vírgula, com `*` como curinga: `feat/*,fix/*`.
   * Vazio significa nenhuma branch — ver `branchMatchesPattern`.
   */
  previewBranchPattern: string;
  /** Dias sem push até o preview ser removido. Zero desliga a expiração. */
  previewTtlDays: number;
}

export const DEFAULT_PREVIEW_SETTINGS: PreviewSettings = {
  // Desligado por padrão. Preview cria apps, consome portas e gasta emissões de
  // certificado; nada disso pode começar a acontecer sozinho depois de um update.
  previewEnabled: false,
  previewBranchPattern: '',
  previewTtlDays: PREVIEW_TTL_DEFAULT,
};

export function parsePreviewTtlDays(raw: string | null | undefined): number {
  const value = parseInt((raw || '').trim(), 10);
  if (!Number.isFinite(value)) return PREVIEW_TTL_DEFAULT;
  if (value < 0 || value > PREVIEW_TTL_MAX) return PREVIEW_TTL_DEFAULT;
  return value;
}

export function validatePreviewTtlDays(value: unknown): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  // Zero é válido e significa "nunca expira" — é uma escolha, não um valor inválido.
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > PREVIEW_TTL_MAX) {
    throw new Error(`TTL de preview deve ser um inteiro entre 0 e ${PREVIEW_TTL_MAX} dias (0 desliga a expiração)`);
  }
  return parsed;
}

/**
 * Valida o padrão de branch.
 *
 * Recusa caracteres que não aparecem em nome de branch do git — o padrão vira regex em
 * `branchMatchesPattern`, e é melhor barrar a entrada do que confiar no escape.
 */
export function validateBranchPattern(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw.length > 200) throw new Error('Padrão de branch muito longo (máximo 200 caracteres)');
  if (!/^[A-Za-z0-9._/*,\- ]+$/.test(raw)) {
    throw new Error('Padrão de branch aceita apenas letras, números, . _ - / * e vírgula');
  }
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .join(',');
}

export function toPreviewSettings(rows: Array<{ key: string; value: string }>): PreviewSettings {
  const map = new Map(rows.map((row) => [row.key, row.value]));
  return {
    previewEnabled: parseFlag(map.get(SETTING_KEYS.previewEnabled), DEFAULT_PREVIEW_SETTINGS.previewEnabled),
    previewBranchPattern: (map.get(SETTING_KEYS.previewBranchPattern) || '').trim(),
    previewTtlDays: parsePreviewTtlDays(map.get(SETTING_KEYS.previewTtlDays)),
  };
}
