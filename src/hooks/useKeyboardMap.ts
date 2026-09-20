import { useEffect, useRef } from 'react';

/**
 * Handler global de teclado. **Um só listener**, montado pelo shell, só no desktop.
 *
 * Quatro guardas que impedem o atalho de brigar com o app:
 *
 * 1. Ignora quando o foco está num campo (`input`, `textarea`, `select`,
 *    `contenteditable`) ou dentro do terminal — exceto `Esc` e `⌘K`. Sem isso, digitar
 *    "novo" numa busca dispara N e navega para `/new` no meio da frase.
 * 2. Ignora quando há modificador (Alt/Ctrl/Meta) numa tecla simples, para não roubar
 *    atalho do navegador.
 * 3. A sequência `G` guarda a primeira tecla por 1200ms e resolve na seguinte; passado
 *    o prazo, esquece — um `g` solto não pode deixar o app num estado à espera.
 * 4. As teclas de contexto de app só valem quando há app em foco; quem decide isso é o
 *    chamador, passando ou não os bindings.
 */
export interface KeyboardMapOptions {
  enabled: boolean;
  onPalette?: () => void;
  /** Chave = tecla em minúsculas, ou `'g v'` para sequência. */
  bindings: Record<string, () => void>;
}

const SEQUENCE_MS = 1200;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable) return true;
  // O xterm captura o teclado inteiro; um atalho do painel ali seria roubado do shell.
  return Boolean(target.closest('.xterm'));
}

export function useKeyboardMap({ enabled, onPalette, bindings }: KeyboardMapOptions) {
  // Ref para que trocar os bindings não remonte o listener.
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const paletteRef = useRef(onPalette);
  paletteRef.current = onPalette;

  useEffect(() => {
    if (!enabled) return;

    let pendente: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const limpar = () => {
      pendente = null;
      if (timer) clearTimeout(timer);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const tecla = e.key.toLowerCase();

      if (tecla === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        paletteRef.current?.();
        return;
      }

      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (pendente) {
        const combo = `${pendente} ${tecla}`;
        limpar();
        const acao = bindingsRef.current[combo];
        if (acao) {
          e.preventDefault();
          acao();
        }
        return;
      }

      // Uma tecla que só existe como prefixo de sequência não dispara nada sozinha.
      const ehPrefixo = Object.keys(bindingsRef.current).some((k) => k.startsWith(`${tecla} `));
      if (ehPrefixo) {
        pendente = tecla;
        timer = setTimeout(limpar, SEQUENCE_MS);
        return;
      }

      const chave = e.shiftKey ? `shift+${tecla}` : tecla;
      const acao = bindingsRef.current[chave];
      if (acao) {
        e.preventDefault();
        acao();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      limpar();
    };
  }, [enabled]);
}
