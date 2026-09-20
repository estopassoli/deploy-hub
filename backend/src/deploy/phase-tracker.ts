/**
 * Cronometragem do deploy, fase a fase.
 *
 * O `setPhase` já existia e servia só para colorir o log em tempo real — a informação
 * era jogada fora ao final. Guardá-la responde as perguntas que aparecem quando um
 * deploy "está demorando": em qual etapa ele está há mais tempo, se o install piorou
 * depois de uma dependência nova, se o build de um service específico é o gargalo.
 *
 * O resultado vai para `Deploy.phases` como JSON e `Deploy.startedAt`/`finishedAt`.
 *
 * Módulo puro (o relógio é injetável), para ser testável pelo `node --test`.
 */

export type PhaseStatus = 'running' | 'success' | 'failed' | 'skipped' | 'cancelled';

export interface PhaseRecord {
  name: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  status: PhaseStatus;
}

export class PhaseTracker {
  private readonly phases: PhaseRecord[] = [];
  private readonly startedAtMs: number;
  /** Relógio injetável — parameter property não passa no type-stripping do Node. */
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
    this.startedAtMs = this.now();
  }

  get startedAt(): Date {
    return new Date(this.startedAtMs);
  }

  /**
   * Inicia uma fase, encerrando a anterior como sucesso.
   *
   * Reentrar na mesma fase não cria uma linha nova: o deploy de projeto chama
   * `setPhase('building')` uma vez por service, e o que interessa é o tempo total
   * da etapa, não uma linha por service.
   */
  start(name: string): void {
    const current = this.current();
    if (current?.name === name) return;
    if (current) this.finishCurrent('success');

    this.phases.push({
      name,
      startedAt: new Date(this.now()).toISOString(),
      finishedAt: null,
      durationMs: null,
      status: 'running',
    });
  }

  /** Marca a fase em andamento com um status final. */
  finishCurrent(status: PhaseStatus): void {
    const current = this.current();
    if (!current || current.status !== 'running') return;

    const finishedAtMs = this.now();
    current.finishedAt = new Date(finishedAtMs).toISOString();
    current.durationMs = finishedAtMs - Date.parse(current.startedAt);
    current.status = status;
  }

  /** Encerra o deploy inteiro; a fase em andamento herda o status final. */
  finish(status: Exclude<PhaseStatus, 'running'>): void {
    this.finishCurrent(status);
  }

  private current(): PhaseRecord | undefined {
    return this.phases[this.phases.length - 1];
  }

  /** Duração total desde a criação do tracker. */
  totalMs(): number {
    return this.now() - this.startedAtMs;
  }

  toArray(): PhaseRecord[] {
    return this.phases.map((phase) => ({ ...phase }));
  }

  /** Serialização para a coluna `Deploy.phases`. */
  toJSON(): string {
    return JSON.stringify(this.toArray());
  }
}

/** Lê a coluna `Deploy.phases` de volta, tolerando null e JSON inválido. */
export function parsePhases(raw: string | null | undefined): PhaseRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Duração formatada para a UI: `1m 12s`, `820ms`, `45s`. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;

  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
