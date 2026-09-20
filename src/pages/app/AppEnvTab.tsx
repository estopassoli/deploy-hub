import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Callout, EnvTable, SaveBar, type EnvRow } from '@/components/ds';
import { parseEnv, serializeEnv } from '@/lib/env';
import { useApp } from './AppContext';

/**
 * Ambiente e build.
 *
 * O `.env` deixou de ser um `<textarea>`: havia seis deles espalhados pelo painel
 * mostrando segredo em texto puro na tela, no DOM e em qualquer captura. Aqui o valor é
 * mascarado, revelar é ação explícita e copiar funciona sem revelar.
 *
 * A `SaveBar` só aparece quando há alteração, e diz quantos campos mudaram — o painel
 * perdia alteração em silêncio, e "Deploy service" rodava com a configuração antiga.
 */
export default function AppEnvTab() {
  const { app, reload, openDeploySheet } = useApp();

  const [rows, setRows] = useState<EnvRow[]>([]);
  const [base, setBase] = useState<EnvRow[]>([]);
  const [comandos, setComandos] = useState({
    installCommand: '',
    buildCommand: '',
    migrateCommand: '',
    startCommand: '',
  });
  const [comandosBase, setComandosBase] = useState(comandos);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const lista = parseEnv(app.envVars || '').map(({ key, value }) => ({ key, value, origin: 'App' }));
    setRows(lista);
    setBase(lista);
    const cmd = {
      installCommand: app.installCommand || '',
      buildCommand: app.buildCommand || '',
      migrateCommand: app.migrateCommand || '',
      startCommand: app.startCommand || '',
    };
    setComandos(cmd);
    setComandosBase(cmd);
  }, [app]);

  const sujos = useMemo(() => {
    let n = 0;
    if (serializeEnv(rows) !== serializeEnv(base)) n++;
    for (const chave of Object.keys(comandos) as (keyof typeof comandos)[]) {
      if (comandos[chave] !== comandosBase[chave]) n++;
    }
    return n;
  }, [rows, base, comandos, comandosBase]);

  const salvar = async (redeploy: boolean) => {
    setSalvando(true);
    try {
      await api.updateApp(app.id, { ...comandos, envVars: serializeEnv(rows) });
      if (redeploy) {
        openDeploySheet();
        await api.redeploy(app.id);
      } else {
        toast.success('Salvo — aplica no próximo deploy');
      }
      setBase(rows);
      setComandosBase(comandos);
      await reload();
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {app.project && (
        <Callout tone="blue" title={`Este app é um service de ${app.project.name}`}>
          Variáveis compartilhadas do projeto não são expostas por service pela API — o painel não
          consegue listá-las aqui.
        </Callout>
      )}

      <EnvTable
        rows={rows}
        onAdd={() => {
          const chave = window.prompt('Nome da variável (ex.: DATABASE_URL)')?.trim().toUpperCase();
          if (!chave) return;
          if (rows.some((r) => r.key === chave)) return toast.error(`${chave} já existe`);
          const valor = window.prompt(`Valor de ${chave}`) ?? '';
          setRows([...rows, { key: chave, value: valor, origin: 'App' }]);
        }}
        onPaste={() => {
          const texto = window.prompt('Cole o conteúdo do .env');
          if (!texto) return;
          const novas = parseEnv(texto).map(({ key, value }) => ({ key, value, origin: 'App' }));
          const mapa = new Map(rows.map((r) => [r.key, r]));
          for (const nova of novas) mapa.set(nova.key, nova);
          setRows([...mapa.values()]);
          toast.success(`${novas.length} variáveis coladas`);
        }}
        onRemove={(key) => setRows(rows.filter((r) => r.key !== key))}
        onCopy={async (row) => {
          await navigator.clipboard.writeText(row.value);
          toast.success(`${row.key} copiada`);
        }}
        note={
          <>
            O <span className="font-mono">.env</span> é reescrito no próximo deploy. Variáveis{' '}
            <span className="font-mono">NEXT_PUBLIC_</span> e <span className="font-mono">VITE_</span> entram no
            bundle, então exigem build — reiniciar não basta.
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Comandos de build</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 @[700px]:grid-cols-2">
          <Campo label="Install" value={comandos.installCommand} onChange={(v) => setComandos({ ...comandos, installCommand: v })} placeholder="pnpm install" />
          <Campo label="Build" value={comandos.buildCommand} onChange={(v) => setComandos({ ...comandos, buildCommand: v })} placeholder="pnpm build" />
          <Campo label="Migrate" value={comandos.migrateCommand} onChange={(v) => setComandos({ ...comandos, migrateCommand: v })} placeholder="pnpm prisma migrate deploy" />
          <Campo label="Start" value={comandos.startCommand} onChange={(v) => setComandos({ ...comandos, startCommand: v })} placeholder="node dist/main.js" />
        </CardContent>
      </Card>

      <SaveBar
        dirtyCount={sujos}
        saving={salvando}
        onDiscard={() => {
          setRows(base);
          setComandos(comandosBase);
        }}
        onSave={() => salvar(true)}
        saveLabel="Salvar e fazer redeploy"
        secondary={
          <Button variant="secondary" disabled={salvando} onClick={() => salvar(false)} className="max-xl:h-11">
            Salvar
          </Button>
        }
      />
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = `cmd-${label.toLowerCase()}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="font-mono tabular-nums text-[12.5px]"
      />
    </div>
  );
}
