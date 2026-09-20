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
