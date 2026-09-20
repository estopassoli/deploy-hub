/**
 * Trava de deploy, uma por app ou projeto.
 *
 * ## O problema
 *
 * Nada impedia dois deploys simultâneos do mesmo app. Os gatilhos são banais:
 *
 *   - duplo clique em "Redeploy";
 *   - um push no GitHub enquanto alguém clicava Redeploy no painel;
 *   - dois pushes seguidos, com o webhook disparando duas vezes.
 *
 * Os dois deploys clonam para diretórios de release diferentes, mas disputam tudo o
 * que é global: o symlink `current`, o processo PM2 com o mesmo nome, a porta, o vhost
 * do nginx e o `/var/www/<app>`. O resultado típico é o segundo deploy trocar o symlink
 * enquanto o primeiro ainda constrói, e o app acabar rodando código de um release com
 * o `.env` de outro.
 *
 * ## Escopo desta trava
 *
 * Em memória, no processo. É suficiente porque o painel é um processo PM2 único, que é
 * o que o instalador monta. Num cenário com réplicas isso precisaria virar trava no
 * banco — anotado, não implementado, porque hoje não existe esse cenário.
 */

export interface DeployLockInfo {
  /** Chave travada: nome do app ou do projeto. */
  key: string;
  startedAt: Date;
  /** Id da linha Deploy, quando já foi criada. */
  deployId?: string;
  /** Quem disparou: 'ui', 'webhook', 'api'. Só para a mensagem de erro. */
  source?: string;
}

export class DeployLock {
  private readonly active = new Map<string, DeployLockInfo>();

  /**
   * Tenta travar. Devolve `null` quando já existe um deploy em andamento para a chave —
   * o chamador transforma isso num 409 com a informação de quem está segurando.
   */
  acquire(key: string, options: { deployId?: string; source?: string } = {}): DeployLockInfo | null {
    const existing = this.active.get(key);
    if (existing) return null;

    const info: DeployLockInfo = {
      key,
      startedAt: new Date(),
      deployId: options.deployId,
      source: options.source,
    };
    this.active.set(key, info);
    return info;
  }

  /** Libera a trava. Idempotente. */
  release(key: string): void {
    this.active.delete(key);
  }

  isLocked(key: string): boolean {
    return this.active.has(key);
  }

  info(key: string): DeployLockInfo | null {
    return this.active.get(key) ?? null;
  }

  /** Associa o id do Deploy à trava depois que a linha é criada. */
  attachDeployId(key: string, deployId: string): void {
    const info = this.active.get(key);
    if (info) info.deployId = deployId;
  }

  /** Chaves travadas agora — usado pelo endpoint de status e pelos testes. */
  keys(): string[] {
    return [...this.active.keys()];
  }
}

/** Mensagem do 409, com há quanto tempo o outro deploy está rodando. */
export function lockedMessage(info: DeployLockInfo): string {
  const seconds = Math.max(0, Math.round((Date.now() - info.startedAt.getTime()) / 1000));
  const decorrido = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}min`;
  const origem = info.source ? ` (iniciado via ${info.source})` : '';
  return `Já existe um deploy de "${info.key}" em andamento há ${decorrido}${origem}. Aguarde terminar ou cancele-o.`;
}
