import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { parseEnv, serializeEnv } from '@/lib/env';
import { Callout, EnvTable, SaveBar, type EnvRow } from '@/components/ds';
import { useProject } from './ProjectContext';

/**
 * Variáveis compartilhadas do projeto.
 *
 * Elas descem para todos os services no próximo deploy — por isso o aviso é explícito:
 * salvar aqui é uma mudança que afeta N apps de produção de uma vez.
 */
export default function ProjectEnvTab() {
  const { project, reload } = useProject();
  const [rows, setRows] = useState<EnvRow[]>([]);
  const [base, setBase] = useState<EnvRow[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const lista = parseEnv(project.envVars || '').map(({ key, value }) => ({ key, value, origin: 'Project' }));
    setRows(lista);
    setBase(lista);
  }, [project]);

  const sujos = useMemo(() => (serializeEnv(rows) !== serializeEnv(base) ? 1 : 0), [rows, base]);
  const services = project.apps ?? project.services ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Callout tone="blue" title={`Estas variáveis descem para os ${services.length} services`}>
        A mudança vale a partir do próximo deploy de cada service — salvar aqui não reescreve o{' '}
        <span className="font-mono">.env</span> de quem já está no ar.
      </Callout>

      <EnvTable
        rows={rows}
        onAdd={() => {
          const chave = window.prompt('Nome da variável')?.trim().toUpperCase();
          if (!chave) return;
          if (rows.some((r) => r.key === chave)) return toast.error(`${chave} já existe`);
          setRows([...rows, { key: chave, value: window.prompt(`Valor de ${chave}`) ?? '', origin: 'Project' }]);
        }}
        onPaste={() => {
          const texto = window.prompt('Cole o conteúdo do .env');
          if (!texto) return;
          const mapa = new Map(rows.map((r) => [r.key, r]));
          for (const { key, value } of parseEnv(texto)) mapa.set(key, { key, value, origin: 'Project' });
          setRows([...mapa.values()]);
        }}
        onRemove={(key) => setRows(rows.filter((r) => r.key !== key))}
        onCopy={async (row) => {
          await navigator.clipboard.writeText(row.value);
          toast.success(`${row.key} copiada`);
        }}
      />

      <SaveBar
        dirtyCount={sujos}
        saving={salvando}
        onDiscard={() => setRows(base)}
        onSave={async () => {
          setSalvando(true);
          try {
            await api.updateProject(project.id, { envVars: serializeEnv(rows) });
            toast.success('Env do projeto salvo — aplica no próximo deploy');
            setBase(rows);
            await reload();
          } catch (e: any) {
            toast.error(e?.message || 'Não foi possível salvar');
          } finally {
            setSalvando(false);
          }
        }}
      />
    </div>
  );
}
