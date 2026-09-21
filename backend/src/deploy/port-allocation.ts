/**
 * Escolha de portas livres para novos apps.
 *
 * ## O que "livre" precisa significar
 *
 * `checkPort` só consultava a tabela `App`. Uma porta pode estar livre no banco e
 * ocupada por outro processo do servidor — Postgres, Redis, um container — e aí o
 * deploy passa pela validação e falha no start, com o app já clonado e buildado.
 *
 * Aqui "livre" é: fora da faixa reservada, não usada por nenhum app cadastrado, e
 * **sem ninguém escutando** nela agora.
 *
 * Módulo puro, testável pelo `node --test`.
 */

/** Abaixo disto é território de serviço de sistema. */
export const PRIMEIRA_PORTA_LIVRE = 1024;
export const ULTIMA_PORTA = 65535;

/** Onde a busca começa quando o chamador não diz. Acima do ruído de dev comum. */
export const INICIO_PADRAO = 3000;

/**
 * Portas que o painel nunca entrega, mesmo que ninguém esteja escutando.
 *
 * 10000/10001 são o próprio DeployHub: entregá-las a um app deployado derrubaria o
 * painel no meio do deploy — e quem está olhando perderia justamente a tela que
 * mostraria o que aconteceu.
 */
export const RESERVADAS = new Set([10000, 10001]);

export function isReserved(port: number): boolean {
  return port < PRIMEIRA_PORTA_LIVRE || port > ULTIMA_PORTA || RESERVADAS.has(port);
}

export interface AllocationInput {
  /** Portas já cadastradas em apps. */
  usedByApps: Iterable<number>;
  /** Portas com alguém escutando agora, lidas do sistema. */
  listening: Iterable<number>;
  /** Portas já escolhidas nesta mesma sessão (formulário aberto, lote em curso). */
  alsoAvoid?: Iterable<number>;
  start?: number;
  end?: number;
}

/**
 * Devolve `count` portas livres, em ordem crescente.
 *
 * Devolve menos que `count` — ou uma lista vazia — quando a faixa acaba. Quem chama
 * transforma isso numa mensagem clara, em vez de entregar porta repetida ou ocupada.
 */
export function allocatePorts(count: number, input: AllocationInput): number[] {
  if (!Number.isInteger(count) || count <= 0) return [];

  const ocupadas = new Set<number>([
    ...input.usedByApps,
    ...input.listening,
    ...(input.alsoAvoid ?? []),
  ]);

  const inicio = Math.max(input.start ?? INICIO_PADRAO, PRIMEIRA_PORTA_LIVRE);
  const fim = Math.min(input.end ?? ULTIMA_PORTA, ULTIMA_PORTA);

  const livres: number[] = [];
  for (let porta = inicio; porta <= fim && livres.length < count; porta++) {
    if (isReserved(porta) || ocupadas.has(porta)) continue;
    livres.push(porta);
    // Entra no conjunto para que a próxima iteração não a repita — importante quando
    // `count` > 1, que é o caso de um monorepo com N services.
    ocupadas.add(porta);
  }

  return livres;
}

/**
 * Portas em LISTEN, lidas do conteúdo de `/proc/net/tcp` (ou `tcp6`).
 *
 * O formato é `sl local_address rem_address st ...`, com endereço e porta em
 * hexadecimal separados por `:` e o estado `0A` significando LISTEN. Ler o arquivo
 * evita depender de `ss`/`netstat` estarem instalados e evita um pipeline de shell.
 */
export function parseListeningPorts(procNetTcp: string): number[] {
  const portas = new Set<number>();

  for (const linha of procNetTcp.split('\n').slice(1)) {
    const campos = linha.trim().split(/\s+/);
    if (campos.length < 4) continue;

    const [, local, , estado] = campos;
    if (estado !== '0A') continue; // 0A = TCP_LISTEN

    const porta = parseInt(local.split(':')[1] ?? '', 16);
    if (Number.isInteger(porta) && porta > 0) portas.add(porta);
  }

  return [...portas].sort((a, b) => a - b);
}
