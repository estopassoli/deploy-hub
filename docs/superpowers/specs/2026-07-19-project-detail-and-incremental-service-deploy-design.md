# Página de detalhes do projeto + deploy incremental de service

Data: 2026-07-19

## Problema

Um projeto monorepo criado pelo wizard (`/projects/new`) é imutável depois de criado:

- O `envVars` do projeto e o de cada service só podem ser definidos na criação. Depois disso não aparecem em lugar nenhum da UI — não há como consultar nem corrigir.
- Não há como adicionar um app do monorepo que não foi selecionado no wizard. Para deployar o `baileys-api` de um projeto que já tem `admin`, `backend` e `frontend`, é preciso excluir o projeto inteiro e refazer tudo.
- Não há como remover um único service.
- `deployProject()` é tudo-ou-nada: clone novo → install → build de todos os pacotes → troca o symlink `current` → reinicia todos os services. Qualquer ajuste em um service derruba os outros.
- No Dashboard, o card de um projeto ocupa a altura de todos os seus services, sem como recolher.

## Escopo

1. Deploy incremental de um único service, reusando o release atual.
2. Página `/projects/:id` com edição de env do projeto, edição por service, adicionar service e remover service.
3. Card de projeto no Dashboard vira collapsible.

Fora de escopo: renomear projeto (o nome vira caminho em disco e nome de processo PM2), rollback por service, deploy incremental para apps standalone.

## 1. Deploy incremental

`DeployService.deployProjectService(projectId, appId)` — usado tanto para adicionar um service novo quanto para reaplicar um existente com config nova.

Opera **dentro do release atual**. Não cria release, não move o symlink `current`, não toca nos outros processos.

```
releaseDir = realpath(~/apps/<project>/current)

1. .env do projeto → releaseDir/.env
   .env do service  → releaseDir/<appDir>/.env
2. installDependencies(releaseDir, ...)      # install na raiz, frozen + retry — puxa deps do pacote novo
3. prisma generate + migrate deploy          # só se <appDir>/prisma/schema.prisma existir, ou migrateCommand próprio
4. turbo build --filter=<workspacePackage>   # ou runScriptCmd(pm, {pkg, script:'build'}) se não houver turbo.json
5. startService(project.name, svc, currentLink, pm, projectEnv, generateSSL)
```

O passo 5 é o helper que já existe: PM2 (ou cópia para `/var/www` se `vitejs`), regeneração do vhost via `updateNginxConfig` (que já preserva o bloco 443 quando o certificado existe) e certbot opcional.

### Registro do deploy

Cria uma linha em `Deploy` com `projectId`, `path = releaseDir`, `version = <timestamp>-<svcName>` e **`isCurrent: false`**, sem alterar o `isCurrent` das outras linhas.

Isso é obrigatório: `rollbackProject` troca o symlink para o `path` de um deploy. Um deploy incremental não tem release próprio — se virasse `isCurrent`, o rollback apontaria para o mesmo diretório e viraria no-op silencioso.

### Efeito colateral conhecido

`turbo build --filter=<pkg>` também recompila os `packages/*` de que o pacote alvo depende. Os services já rodando não são afetados: são processos Node com os módulos já carregados em memória, e o código recompilado vem do mesmo commit. Aceito.

### Erros

| Situação | Resposta |
|---|---|
| Sem symlink `current` | `400` — "Projeto sem release atual. Rode Redeploy project primeiro." |
| `<appDir>` não existe no release | `400` — "`apps/x` não existe no release atual (commit `abc1234`). Rode Redeploy project para trazer o código novo." |
| Build/start falha | Deploy marcado `failed`, App marcado `error`, logs persistidos. Os outros services seguem intactos. |

Logs vão para o stream WebSocket na key `project.name`, igual ao deploy de projeto.

## 2. Endpoints

| Rota | Comportamento |
|---|---|
| `GET /projects/:id` | Já existe — projeto + apps + 10 últimos deploys. |
| `PUT /projects/:id` | Atualiza `envVars` e `branch`. Não persiste em disco: vale no próximo deploy. |
| `GET /projects/:id/available-services?source=release\|repo` | Apps do monorepo que ainda não são service. |
| `POST /projects/:id/services` | Cria o App e dispara `deployProjectService`. |
| `POST /projects/:id/services/:appId/deploy` | Deploy incremental de um service existente. |
| `DELETE /projects/:id/services/:appId` | Remove o service. |

Edição de config **por service** reusa o `PUT /apps/:id`, que já aceita `domain`, `envVars`, `installCommand`, `buildCommand`, `migrateCommand`, `startCommand`, `appDir`, `workspacePackage`. Nenhuma mudança de backend.

### `GET /projects/:id/available-services`

- `source=release` (padrão): `scanWorkspaceApps(realpath(~/apps/<name>/current))`, removendo os `appDir` que já são service do projeto. Instantâneo, sem clone, e garante que só aparece o que dá para buildar incrementalmente.
- `source=repo`: clone `--depth 1` num tmp (mesma mecânica do `detect()` existente), mesmo filtro. Mostra o estado atual da branch.
- Sem release em disco: `200 { source: 'release', services: [], reason: 'no-release' }` — a UI usa isso para sugerir o fallback em vez de mostrar erro.

Resposta: `{ source, services: DetectedService[], reason?: string }`.

### `POST /projects/:id/services`

Body igual ao `ServiceDto` do wizard: `name`, `appDir`, `workspacePackage?`, `type`, `port`, `domain?`, `envVars?`, `migrateCommand?`, `startCommand?`.

Validações, todas antes de criar o App:

- `409` se `name` já existe (App.name é unique global).
- `409` se a `port` já está em uso por outro app.
- `409` se o `appDir` já é service **deste** projeto.

Cria o App com `projectId` e `webhookSecret` próprio, depois dispara `deployProjectService` em fire-and-forget (os logs chegam pelo WebSocket, como no `create()`).

### `DELETE /projects/:id/services/:appId`

`pm2 delete` → remove `/etc/nginx/sites-{available,enabled}/<name>.conf` → `rm -rf /var/www/<name>` → `pm2 save` → `systemctl reload nginx` → apaga o App. Cada passo tolera falha, igual ao `remove()` do projeto.

`400` se for o último service do projeto — nesse caso o certo é excluir o projeto.

## 3. Página `/projects/:id`

Arquivo novo `src/pages/ProjectDetail.tsx`, rota em `src/App.tsx`. No Dashboard, o nome do projeto vira `Link` para ela.

**Header** — nome, repositório, branch, package manager, status. Ações: `Redeploy project`, `Gerar SSL`, `Excluir projeto` (mesmos handlers do Dashboard).

**Env do projeto** — textarea com `envVars` + `Salvar`, com aviso *"aplica no próximo deploy"*.

**Services** — um card por service com `porta`, `domínio`, `env`, `startCommand`, `migrateCommand` editáveis. Ações por card:

- `Salvar` → `PUT /apps/:id` (só grava).
- `Deploy service` → deploy incremental. É o que faz env/domínio novo valer sem derrubar os outros.
- `Remover` → `AlertDialog` de confirmação → `DELETE`.

**Adicionar service** — lista de `available-services` do release, marcando quais já são service. Escolhe um, preenche nome/porta/domínio/env, `Adicionar e deployar`. Link *"não achou o app? buscar no repositório"* refaz a chamada com `source=repo` e avisa que um app que só existe na branch vai exigir `Redeploy project`.

**Logs** — painel com o stream WebSocket na key `project.name`, reusando o padrão de `Project.tsx`.

Métodos novos em `src/lib/api.ts`: `getProject`, `updateProject`, `getAvailableServices`, `addProjectService`, `deployProjectService`, `removeProjectService`.

## 4. Collapsible no Dashboard

O card de projeto usa `@/components/ui/collapsible` (Radix, já no repo). Escolhido em vez de `accordion.tsx` porque cada projeto abre e fecha de forma independente.

- Aberto por padrão.
- Estado persistido em `localStorage`, chave `deployhub:project-collapsed:<projectId>`.
- Recolhido, o header mostra `branch · packageManager · N services · N running · N erro`. Os botões de ação continuam no header, acessíveis nos dois estados.
- Chevron indica o estado e o header inteiro é o gatilho, exceto a área dos botões.

## 5. Testes

O deploy incremental é fs + exec, então o teste automatizado cobre a parte pura:

- `filterAvailableServices(detected, existingAppDirs)` extraído para `workspace-scan.ts`, com teste próprio em `workspace-scan.test.ts`: exclui os já usados, mantém a ordem, lida com lista vazia dos dois lados.
- A seleção de comandos (`turboBuildCmd`, `execCmd`, `runScriptCmd`) já tem cobertura em `package-manager.test.ts`.

Verificação restante: `tsc --noEmit` no backend e no frontend, suíte `node --test` completa, `npm run build` do frontend, e aceitação manual no servidor — adicionar o `baileys-api` ao projeto `blurp` e confirmar pelo `pm2 list` que o uptime de `blurp-admin`, `blurp-backend` e `blurp-frontend` não zerou.

## Dependência

Depende do PR #6 (`feat/project-generate-ssl`), que mexe na mesma região do `Dashboard.tsx`. Fazer o merge do #6 antes de ramificar, ou ramificar a partir dele.
