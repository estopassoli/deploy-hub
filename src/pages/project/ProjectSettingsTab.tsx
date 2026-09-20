import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Callout, KeyValue, KeyValueList } from '@/components/ds';
import { ConfirmDeleteDialog } from '@/components/apps/ConfirmDeleteDialog';
import { useProject } from './ProjectContext';

/** Configurações do projeto: origem, escopo e exclusão. */
export default function ProjectSettingsTab() {
  const { project } = useProject();
  const navigate = useNavigate();
  const services = project.apps ?? project.services ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Origem</CardTitle>
        </CardHeader>
        <CardContent>
          <KeyValueList>
            <KeyValue label="Repositório" title={project.repository}>
              <span className="block truncate">{project.repository}</span>
            </KeyValue>
            <KeyValue label="Branch">{project.branch || 'main'}</KeyValue>
            <KeyValue label="Services">{services.length}</KeyValue>
            <KeyValue label="Diretório">~/apps/{project.name}</KeyValue>
          </KeyValueList>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3 pt-2">
        <Callout tone="red" title={`Excluir ${project.name}`}>
          Remove o projeto e os {services.length} services: processos, containers, vhosts do Nginx e
          o diretório <span className="font-mono">~/apps/{project.name}</span> inteiro, com todas as
          releases. Não tem volta.
        </Callout>
        <div className="flex justify-end">
          <ConfirmDeleteDialog
            name={project.name}
            description={
              <>
                <p>Esta ação é irreversível e derruba {services.length} apps em produção de uma vez.</p>
                <p>Todas as releases do projeto serão apagadas.</p>
              </>
            }
            confirmLabel={`Excluir ${project.name}`}
            onConfirm={async () => {
              await api.deleteProject(project.id);
              toast.success(`${project.name} excluído`);
              navigate('/');
            }}
            trigger={
              <Button variant="destructive">
                <Trash2 aria-hidden />
                Excluir projeto
              </Button>
            }
          />
        </div>
      </section>
    </div>
  );
}
