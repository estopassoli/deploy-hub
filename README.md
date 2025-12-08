# DeployHub (App Commander Hub)

> Painel único para administrar deploys, monitorar apps e reagir a incidentes em servidores Linux.

## Qual problema resolvemos

Equipes que mantêm vários serviços auto-hospedados normalmente espalham operações entre scripts soltos, conexões SSH manuais, PM2 e planilhas para registrar deploys. O DeployHub centraliza esse fluxo: oferece uma UI única para registrar aplicações, disparar deploys versionados, acompanhar métricas em tempo real, consultar logs/eventos e até abrir um terminal remoto, tudo autenticado via JWT e respaldado por um backend NestJS com Prisma.

## Principais funcionalidades

- Cadastro de apps (NestJS/Next.js/Vite) com comandos de build/start customizados.
- Pipelines de deploy versionados, com histórico e logs persistidos.
- Coletores de métricas, relatórios de uso e alertas em tempo real via websockets.
- Consolidação de logs e atividades recentes do sistema.
- Gateway de terminal remoto e webhook GitHub para disparar deploys automatizados.
- Painel React responsivo com autenticação protegida por rota.

## Arquitetura em alto nível

```
app-commander-hub/
├─ src/                # Frontend Vite + React + shadcn-ui
├─ backend/            # NestJS + Prisma + WebSockets + PM2
│  ├─ prisma/          # Schema, migrations e seeds
│  └─ src/             # Módulos de apps, deploy, logs, metrics etc.
├─ install.sh          # Instalador rápido (frontend + backend)
└─ update.sh           # Roteiro oficial de atualização
```

Frontend e backend rodam desacoplados, comunicando-se via REST e WebSocket (`/api` e `/ws`). A autenticação usa JWT e o banco padrão é SQLite (facilmente trocável via `DATABASE_URL`).

## Stack principal

- **Frontend:** Vite, React 18, TypeScript, TailwindCSS, shadcn-ui, TanStack Query, Socket.IO client.
- **Backend:** NestJS 10, Prisma 6, SQLite (ou qualquer DB suportado pelo Prisma), Socket.IO, Passport JWT, PM2.
- **Infra auxiliar:** Scripts Bash (`install.sh`, `backend/setup.sh`, `update.sh`) para provisionamento, Nginx + Certbot sugeridos para produção.

## Getting Started

### Pré-requisitos

- Node.js 20+ e npm
- SQLite (instalado automaticamente pelo Prisma) ou outro banco configurado via `DATABASE_URL`
- Git, PM2 e Nginx (apenas para o fluxo de produção sugerido)

### Ambiente local de desenvolvimento

1. **Clonar o repositório**
	```bash
	git clone https://github.com/<seu-usuario>/app-commander-hub.git
	cd app-commander-hub
	```
2. **Instalar dependências do frontend** (raiz do projeto)
	```bash
	npm install
	```
3. **Configurar variáveis do frontend**
	```bash
	cat > .env <<'EOF'
	VITE_API_URL=http://localhost:10001/api
	VITE_WS_URL=http://localhost:10001
	EOF
	```
4. **Preparar o backend**
	```bash
	cd backend
	npm install
	cp .env.example .env # se existir; caso contrário copie o bloco abaixo
	```
	Exemplo de `.env` mínimo:
	```bash
	PORT=10001
	NODE_ENV=development
	DATABASE_URL="file:./prisma/deployhub.db"
	JWT_SECRET=local-secret
	REGISTRATION_SECRET=local-registration-secret
	WEBHOOK_SECRET=local-webhook-secret
	APPS_DIR=/root/apps
	```
5. **Criar banco e usuário admin**
	```bash
	npx prisma migrate dev --name init
	npm run seed    # executa prisma/seed.ts
	```
6. **Rodar ambos os serviços**
	```bash
	# backend
	npm run start:dev

	# em outro terminal (pasta raiz)
	npm run dev
	```
	O painel ficará disponível em `http://localhost:5173` e consumirá a API `http://localhost:10001`.

### Provisionamento rápido em produção

- Execute `curl -sSL https://raw.githubusercontent.com/<seu-usuario>/<seu-repo>/main/install.sh | sudo bash` para seguir o wizard que clona o projeto, prepara Node/PM2/Nginx, gera `.env` e publica o build do frontend em `/var/www/deployhub-panel`.
- O script delega ao `backend/setup.sh`, que pergunta domínios de frontend/backend, diretório dos apps, cria secrets, roda migrações e configura PM2 automaticamente.

## Guia de atualização

### 1. Usando `update.sh` (recomendado)

```bash
cd /caminho/do/deployhub
sudo bash update.sh
```

O script realiza `git pull`, reinstala dependências do frontend/backend, recompila, copia o build para `/var/www/deployhub-panel`, aplica migrações Prisma e reinicia o processo `deployhub-backend` via PM2.

### 2. Fluxo manual (caso precise auditar mudanças)

1. `git fetch --all && git pull origin <branch>`
2. Frontend: `npm install && npm run build && sudo rsync -av dist/ /var/www/deployhub-panel/`
3. Backend: `cd backend && npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
4. Reinicie o serviço `pm2 restart deployhub-backend && pm2 save`

## Variáveis de ambiente

### Backend (`backend/.env`)

| Variável | Descrição | Default / Exemplo |
| --- | --- | --- |
| `PORT` | Porta HTTP da API NestJS | `10001` |
| `NODE_ENV` | `development` ou `production` | `production` |
| `DATABASE_URL` | String Prisma (SQLite, Postgres, etc.) | `file:./prisma/deployhub.db` |
| `JWT_SECRET` | Segredo usado para assinar tokens JWT | `deployhub-secret-key-change-in-production` |
| `REGISTRATION_SECRET` | Token exigido para criar novos usuários via API | `deployhub-secret-2024` |
| `WEBHOOK_SECRET` | Segredo HMAC para validar webhooks GitHub | gerado pelo `setup.sh` |
| `APPS_DIR` | Diretório onde os apps são provisionados/clonados | `/root/apps` |
| `API_URL` | URL base usada pelo serviço de webhook para chamar a API interna | `https://api-panel.auraai.chat` (ajuste para seu host) |
| `SSH_HOST` | Host/IP acessado pelo controlador de webhooks para executar comandos remotos | _(obrigatório para deploy remoto)_ |
| `SSH_USER` | Usuário SSH (default `root`) | `root` |
| `RESEND_API_KEY` | Chave opcional para envio de emails via Resend | _(opcional)_ |

### Frontend (`.env`)

| Variável | Descrição | Default / Exemplo |
| --- | --- | --- |
| `VITE_API_URL` | Base URL para chamadas REST | `http://localhost:10001/api` |
| `VITE_WS_URL` | Endpoint WebSocket (Socket.IO) | `http://localhost:10001` |

> Sempre reinicie o servidor correspondente após alterar o `.env`.

## Scripts úteis

- `npm run dev` – executa o frontend Vite.
- `npm run build` – gera o build de produção do painel.
- `npm run start:dev` (backend) – inicia NestJS com watch.
- `npm run seed` (backend) – popula usuário admin padrão.
- `npx prisma studio` – inspeciona o banco localmente.

## Próximos passos

- Configurar HTTPS via Nginx + Certbot após o setup automatizado.
- Alterar imediatamente a senha do usuário admin criado pelo seed (`admin@deployhub.local`).
- Automatizar webhooks GitHub apontando para o domínio configurado no backend.
