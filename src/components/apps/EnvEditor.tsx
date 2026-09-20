import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardPaste, Eye, EyeOff, FileText, Plus, Table2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  EnvEntry,
  diffEnv,
  findDuplicateKeys,
  findInvalidKeys,
  maskValue,
  parseEnv,
  requiresRebuild,
  serializeEnv,
} from '@/lib/env';

/**
 * Editor de variáveis de ambiente.
 *
 * ## Por que não é mais um `<textarea>`
 *
 * O campo era um textarea com o `.env` inteiro. Isso significa que:
 *
 *   - toda senha e chave de API do app ficava visível na tela o tempo todo, inclusive
 *     em screen share;
 *   - uma chave duplicada (`DATABASE_URL` duas vezes) passava batido — a última vence,
 *     em silêncio, e o app sobe com o valor errado;
 *   - um nome inválido para shell só dava erro no boot do app, minutos depois;
 *   - não havia como saber o que exatamente mudou antes de salvar.
 *
 * A tabela chave/valor resolve os quatro. O modo texto continua existindo para colar um
 * `.env` inteiro e para quem prefere editar assim.
 *
 * O mesmo componente é usado no app, no service de projeto e no formulário de deploy.
 */

interface EnvEditorProps {
  /** Conteúdo atual (texto de .env). */
  value: string;
  onChange: (value: string) => void;
  /** Valor salvo no servidor, para calcular o diff. Default: o valor inicial. */
  baseline?: string;
  /** Rótulo acima do editor. */
  label?: string;
  description?: string;
  className?: string;
}

type Mode = 'table' | 'text';

export function EnvEditor({ value, onChange, baseline, label, description, className }: EnvEditorProps) {
  const [mode, setMode] = useState<Mode>('table');
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [revealAll, setRevealAll] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // Estado da tabela. Mantido separado do texto porque uma linha pode existir com a
  // chave ainda em branco enquanto a pessoa digita — algo que não tem representação
  // possível no texto serializado.
  const [entries, setEntries] = useState<EnvEntry[]>(() => parseEnv(value));

  // Quando o valor externo muda (carregou do servidor, ou o modo texto foi editado),
  // a tabela é reconstruída. A comparação evita um laço infinito de sincronização.
  useEffect(() => {
    if (mode !== 'table') return;
    if (serializeEnv(entries) === value) return;
    setEntries(parseEnv(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, mode]);

  const original = baseline ?? '';
  const diff = useMemo(() => diffEnv(original, value), [original, value]);
  const duplicates = useMemo(() => findDuplicateKeys(entries), [entries]);
  const invalids = useMemo(() => findInvalidKeys(entries), [entries]);

  const commit = (next: EnvEntry[]) => {
    setEntries(next);
    onChange(serializeEnv(next));
  };

  const updateEntry = (index: number, patch: Partial<EnvEntry>) => {
    commit(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  };

  const removeEntry = (index: number) => {
    commit(entries.filter((_, i) => i !== index));
    setRevealed((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => next.add(i > index ? i - 1 : i));
      next.delete(index);
      return next;
    });
  };

  const addEntry = () => commit([...entries, { key: '', value: '' }]);

  const toggleReveal = (index: number) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  /** Cola um `.env` inteiro, somando com o que já existe (o colado vence). */
  const applyPaste = () => {
    const colado = parseEnv(pasteText);
    if (colado.length === 0) {
      setShowPaste(false);
      return;
    }

    const mapa = new Map(entries.map((entry) => [entry.key, entry.value]));
    for (const { key, value: v } of colado) mapa.set(key, v);
    commit([...mapa].map(([key, v]) => ({ key, value: v })));
    setPasteText('');
    setShowPaste(false);
  };

  const isRevealed = (index: number) => revealAll || revealed.has(index);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {label && <Label className="text-sm font-medium">{label}</Label>}
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
           
            variant={mode === 'table' ? 'secondary' : 'ghost'}
            onClick={() => setMode('table')}
          >
            <Table2 className="h-4 w-4" />
            Tabela
          </Button>
          <Button
            type="button"
           
            variant={mode === 'text' ? 'secondary' : 'ghost'}
            onClick={() => setMode('text')}
          >
            <FileText className="h-4 w-4" />
            Texto
          </Button>
        </div>
      </div>

      {/* Avisos: chave duplicada e nome inválido, antes de salvar em vez de no boot. */}
      {(duplicates.length > 0 || invalids.length > 0) && (
        <div className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
          {duplicates.length > 0 && (
            <p className="flex items-start gap-2 text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Chave repetida: <span className="font-mono">{duplicates.join(', ')}</span>. Só o
                último valor é usado.
              </span>
            </p>
          )}
          {invalids.length > 0 && (
            <p className="flex items-start gap-2 text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Nome inválido: <span className="font-mono">{invalids.join(', ')}</span>. Use letras,
                números e <span className="font-mono">_</span>, começando por letra.
              </span>
            </p>
          )}
        </div>
      )}

      {mode === 'table' ? (
        <div className="space-y-2">
          {entries.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              Nenhuma variável. Adicione uma ou cole um <span className="font-mono">.env</span>.
            </p>
          )}

          {entries.map((entry, index) => {
            const duplicada = duplicates.includes(entry.key.trim());
            const invalida = entry.key.trim().length > 0 && invalids.includes(entry.key.trim());
            const alterada = diff.changed.includes(entry.key) || diff.added.includes(entry.key);

            return (
              <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative sm:w-2/5">
                  <Input
                    value={entry.key}
                    onChange={(e) => updateEntry(index, { key: e.target.value })}
                    placeholder="NOME_DA_VARIAVEL"
                    className={cn(
                      'font-mono text-sm',
                      (duplicada || invalida) && 'border-warning',
                      alterada && 'border-primary/60',
                    )}
                  />
                  {requiresRebuild(entry.key) && (
                    <span
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[4px] border border-amber/28 bg-amber/12 px-1.5 text-2xs font-medium leading-4 text-amber"
                      title="Embutida no bundle durante o build — mudar exige redeploy, não só reiniciar"
                    >
                      build
                    </span>
                  )}
                </div>

                <div className="flex flex-1 items-center gap-1">
                  <Input
                    value={isRevealed(index) ? entry.value : maskValue(entry.value)}
                    onChange={(e) => updateEntry(index, { value: e.target.value })}
                    onFocus={() => !isRevealed(index) && toggleReveal(index)}
                    placeholder="valor"
                    className={cn('font-mono text-sm', alterada && 'border-primary/60')}
                  />
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => toggleReveal(index)}
                    title={isRevealed(index) ? 'Ocultar valor' : 'Revelar valor'}
                  >
                    {isRevealed(index) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeEntry(index)}
                    title="Remover variável"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={addEntry}>
              <Plus className="h-4 w-4" />
              Adicionar variável
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowPaste((v) => !v)}>
              <ClipboardPaste className="h-4 w-4" />
              Colar .env
            </Button>
            {entries.length > 0 && (
              <Button type="button" variant="ghost" onClick={() => setRevealAll((v) => !v)}>
                {revealAll ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {revealAll ? 'Ocultar todos' : 'Revelar todos'}
              </Button>
            )}
          </div>

          {showPaste && (
            <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
              <Label className="text-xs">Cole o conteúdo de um .env</Label>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={'DATABASE_URL=postgres://...\nAPI_KEY=...'}
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setShowPaste(false)}>
                  Cancelar
                </Button>
                <Button type="button" onClick={applyPaste}>
                  Adicionar {parseEnv(pasteText).length || ''} variável(is)
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={'DATABASE_URL=postgres://...\nNODE_ENV=production'}
          className="flex min-h-[220px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
        />
      )}

      {/* Diff antes de salvar: o que exatamente vai mudar. */}
      {!diff.isEmpty && (
        <div className="space-y-1 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
          <p className="font-medium text-foreground">Alterações não salvas</p>
          {diff.added.length > 0 && (
            <p className="text-success">
              + {diff.added.length} adicionada(s): <span className="font-mono">{diff.added.join(', ')}</span>
            </p>
          )}
          {diff.changed.length > 0 && (
            <p className="text-primary">
              ~ {diff.changed.length} alterada(s): <span className="font-mono">{diff.changed.join(', ')}</span>
            </p>
          )}
          {diff.removed.length > 0 && (
            <p className="text-destructive">
              − {diff.removed.length} removida(s): <span className="font-mono">{diff.removed.join(', ')}</span>
            </p>
          )}
          {diff.buildRequired.length > 0 && (
            <p className="flex items-start gap-2 pt-1 text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-mono">{diff.buildRequired.join(', ')}</span> são embutidas no
                build — só valem com <strong>Salvar e fazer redeploy</strong>. Reiniciar não muda o
                que o navegador recebe.
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
