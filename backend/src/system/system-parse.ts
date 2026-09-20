/**
 * Parsers da saída de `df` e `top`.
 *
 * Antes isso era feito por pipeline de shell:
 *
 *     execAsync("df -h / | tail -1 | awk '{print $5}'")
 *     execAsync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'")
 *
 * Trazer o parsing para cá tira as duas últimas invocações de `/bin/sh` do backend e,
 * de quebra, torna o comportamento testável — inclusive o caso em que a saída não é a
 * esperada, que antes virava `NaN` silencioso e aparecia como 0% no Dashboard.
 *
 * Módulo puro: sem Nest, sem decorator, importável pelo `node --test`.
 */

/**
 * Percentual de uso do disco a partir da saída de `df -P <ponto>`.
 *
 * `-P` (POSIX) garante uma linha por sistema de arquivos, mesmo com nome de device
 * longo — sem ele o `df` quebra a linha e a coluna 5 some.
 *
 *     Filesystem     1024-blocks      Used Available Capacity Mounted on
 *     /dev/sda1        102687672  48260228  49168476      50% /
 */
export function parseDiskUsage(dfOutput: string): number | null {
  const lines = dfOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  // A primeira linha é o cabeçalho; a informação está na última linha com dados.
  for (let i = lines.length - 1; i >= 1; i--) {
    const match = lines[i].match(/(\d+)%/);
    if (match) {
      const value = parseInt(match[1], 10);
      if (Number.isFinite(value) && value >= 0 && value <= 100) return value;
    }
  }

  return null;
}

/**
 * Percentual de CPU em uso a partir da saída de `top -bn1`.
 *
 * O formato da linha varia por locale e por versão do procps:
 *
 *     %Cpu(s):  3,4 us,  1,2 sy,  0,0 ni, 94,9 id, ...
 *     Cpu(s):  3.4%us,  1.2%sy,  0.0%ni, 94.9%id, ...
 *
 * Em vez de somar `us`+`sy`+..., lê-se o **idle** e subtrai de 100: é o único campo
 * presente em todas as variações, e a vírgula decimal do locale pt_BR é tratada.
 */
export function parseCpuUsage(topOutput: string): number | null {
  const line = topOutput.split('\n').find((l) => /cpu\(s\)/i.test(l));
  if (!line) return null;

  /*
   * Aceita "94,9 id", "94.9 id" e "94.9%id".
   *
   * O número **não pode** começar com vírgula. A versão anterior usava `[\d.,]+`, que
   * engolia o separador de campo do `top`: numa máquina ociosa a linha é
   * `0.0 ni,100.0 id` — sem espaço depois da vírgula —, a captura virava ",100.0",
   * `parseFloat(".100.0")` dava 0,1 e o painel anunciava **CPU 100%** justamente
   * quando não havia carga nenhuma. Com carga, a linha é `ni, 99.1 id`, com espaço, e
   * o bug não aparecia: por isso passava despercebido.
   */
  const match = line.match(/(?:^|[\s,])(\d+(?:[.,]\d+)?)\s*%?\s*id\b/i);
  if (!match) return null;

  const idle = parseFloat(match[1].replace(',', '.'));
  if (!Number.isFinite(idle) || idle < 0 || idle > 100) return null;

  return Math.round(100 - idle);
}

/**
 * Uso de CPU a partir de duas leituras de `/proc/stat`.
 *
 * É a medição correta no Linux: a primeira linha do `/proc/stat` é **acumulada desde o
 * boot**, então um valor absoluto não diz nada sobre agora. O que importa é a variação
 * entre duas amostras — e é isso que `top -bn1` não entrega, porque com uma iteração só
 * ele também reporta o acumulado.
 *
 * Devolve `null` quando as amostras não fazem sentido (relógio andou para trás,
 * contadores reiniciados), para o chamador cair no fallback em vez de mostrar lixo.
 */
export function cpuUsageFromProcStat(antes: string, depois: string): number | null {
  const a = parseProcStatCpu(antes);
  const b = parseProcStatCpu(depois);
  if (!a || !b) return null;

  const totalDelta = b.total - a.total;
  const idleDelta = b.idle - a.idle;
  if (totalDelta <= 0 || idleDelta < 0 || idleDelta > totalDelta) return null;

  return Math.round(100 - (idleDelta / totalDelta) * 100);
}

/** Primeira linha `cpu  ...` do /proc/stat, somada em total e ocioso. */
function parseProcStatCpu(conteudo: string): { total: number; idle: number } | null {
  const linha = conteudo.split('\n').find((l) => /^cpu\s/.test(l));
  if (!linha) return null;

  const campos = linha.trim().split(/\s+/).slice(1).map(Number);
  if (campos.length < 5 || campos.some((n) => !Number.isFinite(n))) return null;

  // user nice system idle iowait irq softirq steal guest guest_nice
  const total = campos.reduce((acc, n) => acc + n, 0);
  // `iowait` conta como ocioso: a CPU não estava fazendo trabalho.
  const idle = campos[3] + (campos[4] ?? 0);
  return { total, idle };
}
