#!/bin/bash

# =====================================================
# DeployHub - Script de Atualização
# =====================================================
# Este script atualiza uma instalação existente do DeployHub
# Uso: sudo bash update.sh
# =====================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Detectar diretório do DeployHub
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYHUB_DIR="$SCRIPT_DIR"

# Verificar se estamos no diretório correto
if [ ! -f "$DEPLOYHUB_DIR/package.json" ] || [ ! -d "$DEPLOYHUB_DIR/backend" ]; then
    print_error "Este script deve ser executado no diretório raiz do DeployHub"
    exit 1
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           DeployHub - Atualização do Sistema             ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

print_status "Diretório do DeployHub: $DEPLOYHUB_DIR"

# 1. Git Pull
print_status "Baixando atualizações do repositório..."
cd "$DEPLOYHUB_DIR"
git fetch --all
git pull origin $(git rev-parse --abbrev-ref HEAD)
print_success "Repositório atualizado"

# 1.1 Pré-flight de configuração
# A partir desta versão o backend recusa subir sem JWT_SECRET (antes havia um segredo
# padrão publicado no repositório, que permitia forjar tokens). A checagem acontece aqui,
# ANTES de qualquer build ou restart: assim uma instalação mal configurada para o update
# com o painel ainda no ar, em vez de derrubar o serviço e só então falhar.
print_status "Verificando configuração obrigatória..."
BACKEND_ENV="$DEPLOYHUB_DIR/backend/.env"

if [ ! -f "$BACKEND_ENV" ]; then
    print_error "backend/.env não encontrado. Rode 'sudo bash backend/setup.sh' antes de atualizar."
    exit 1
fi

if ! grep -qE '^[[:space:]]*JWT_SECRET=.+' "$BACKEND_ENV"; then
    print_error "JWT_SECRET não está definido em backend/.env"
    echo ""
    echo "  O backend não sobe mais sem ele: o valor padrão antigo estava no repositório,"
    echo "  ou seja, qualquer pessoa podia forjar um token de acesso ao painel."
    echo ""
    echo "  Gere e adicione com:"
    echo "    echo \"JWT_SECRET=\$(openssl rand -hex 32)\" >> $BACKEND_ENV"
    echo ""
    echo "  Atenção: mudar o JWT_SECRET invalida as sessões abertas — todo mundo"
    echo "  precisará fazer login de novo. Nenhum dado é perdido."
    echo ""
    print_error "Atualização interrompida. Nada foi alterado no serviço em execução."
    exit 1
fi
print_success "Configuração obrigatória presente"

if ! grep -qE '^[[:space:]]*CORS_ORIGINS=.+' "$BACKEND_ENV"; then
    print_warning "CORS_ORIGINS não definido — a API aceita requisições de qualquer origem."
    print_warning "Recomendado: echo \"CORS_ORIGINS=https://SEU-PAINEL\" >> $BACKEND_ENV"
fi

# 1.2 Chave de criptografia das variáveis de ambiente
#
# App.envVars e Project.envVars guardam o .env inteiro de cada aplicação (senha de
# banco, chave de API) e ficavam em texto puro dentro do arquivo SQLite. A partir desta
# versão eles são criptografados com AES-256-GCM.
#
# A chave é gerada automaticamente quando falta, porque exigir ação manual deixaria os
# segredos em texto puro por tempo indeterminado. Instalações sem a chave continuam
# funcionando (a criptografia fica desligada), mas sem proteção nenhuma.
ENV_KEY_GERADA=false
if ! grep -qE '^[[:space:]]*ENV_ENCRYPTION_KEY=.+' "$BACKEND_ENV"; then
    print_status "Gerando ENV_ENCRYPTION_KEY (criptografia das variáveis de ambiente)..."
    printf '\n# Criptografia de App.envVars e Project.envVars (AES-256-GCM)\n' >> "$BACKEND_ENV"
    printf 'ENV_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)" >> "$BACKEND_ENV"
    ENV_KEY_GERADA=true
    print_success "ENV_ENCRYPTION_KEY criada em backend/.env"
    echo ""
    print_warning "GUARDE O backend/.env JUNTO COM O BACKUP DO BANCO."
    print_warning "Sem essa chave as variáveis de ambiente dos apps não são recuperáveis."
    echo ""
fi

# 2. Atualizar dependências do Frontend
print_status "Atualizando dependências do frontend..."
npm install
print_success "Dependências do frontend atualizadas"

# 3. Build do Frontend
print_status "Compilando frontend..."
npm run build
print_success "Frontend compilado"

# 4. Copiar build para /var/www
print_status "Atualizando arquivos em /var/www/deployhub-panel..."
sudo rm -rf /var/www/deployhub-panel/*
sudo cp -r dist/* /var/www/deployhub-panel/
print_success "Arquivos do frontend atualizados"

# 4. Atualizar dependências do Backend
print_status "Atualizando dependências do backend..."
cd "$DEPLOYHUB_DIR/backend"
npm install
print_success "Dependências do backend atualizadas"

# 5. Gerar Prisma Client
print_status "Gerando Prisma Client..."
npx prisma generate
print_success "Prisma Client gerado"

# 6. Backup do banco antes de qualquer migração
# O banco inteiro do painel é um arquivo SQLite: apps, projetos, histórico de deploys,
# métricas e usuários. Copiar antes de migrar custa milissegundos e é a diferença entre
# um susto e uma perda de dados.
DB_FILE="$DEPLOYHUB_DIR/backend/prisma/deployhub.db"
DB_BACKUP=""
if [ -f "$DB_FILE" ]; then
    DB_BACKUP="${DB_FILE}.bak-$(date +%Y%m%d-%H%M%S)"
    print_status "Fazendo backup do banco..."
    cp "$DB_FILE" "$DB_BACKUP"
    print_success "Backup em $DB_BACKUP"
else
    print_warning "Banco não encontrado em $DB_FILE (primeira instalação?)"
fi

# 7. Executar migrações do banco
#
# `prisma migrate deploy` e NUNCA `db push`:
#
#   - `migrate deploy` aplica só as migrations pendentes, em ordem, registrando-as em
#     _prisma_migrations. É a única forma suportada em produção e nunca reseta o banco.
#   - `db push` (que este script usava antes) ignora o histórico de migrations e força o
#     banco a virar o schema atual. Para conseguir isso em SQLite ele recria tabelas, e
#     pode descartar colunas e dados para "reconciliar". Ele também deixa o histórico
#     dessincronizado — foi exatamente essa a origem da migration
#     20260716200000_reconcile_app_drift deste repositório.
#
# Se a migração falhar, o script PARA. Não existe fallback automático para `db push` nem
# para `migrate reset`: os dois podem destruir dados, e uma falha aqui quase sempre
# significa drift que precisa de decisão humana.
# 7.1 Baseline do histórico de migrations (acontece no máximo uma vez)
#
# Bancos criados pelo setup.sh antigo nasceram de `prisma db push`, que deixa o schema
# certo mas não registra nada em _prisma_migrations. Sem baseline, o primeiro
# `migrate deploy` tentaria recriar tabelas que já existem e falharia.
#
# `migrate resolve --applied` grava SÓ uma linha de metadado por migration: não executa
# SQL de schema e não altera nenhum dado. A lista é fixa e contém apenas as migrations
# anteriores à adoção do migrate deploy — migration nova nunca é marcada sem rodar.
print_status "Verificando histórico de migrations..."
if BASELINE_LIST=$(node scripts/migration-baseline.mjs 2>/dev/null) && [ -n "$BASELINE_LIST" ]; then
    print_warning "Banco sem histórico de migrations (criado por 'prisma db push')."
    print_status "Registrando as migrations já refletidas no banco — só metadados, nenhum dado é alterado:"
    for MIGRATION in $BASELINE_LIST; do
        if npx prisma migrate resolve --applied "$MIGRATION" > /dev/null 2>&1; then
            print_success "  registrada: $MIGRATION"
        else
            print_error "Falha ao registrar $MIGRATION"
            if [ -n "$DB_BACKUP" ]; then
                echo "  Backup íntegro deste momento: $DB_BACKUP"
            fi
            echo "  O banco NÃO foi alterado e o serviço não foi reiniciado."
            exit 1
        fi
    done
    print_success "Histórico de migrations sincronizado"
else
    print_success "Histórico de migrations já consistente"
fi

print_status "Aplicando migrações do banco de dados..."
if npx prisma migrate deploy; then
    print_success "Migrações aplicadas"
else
    echo ""
    print_error "Falha ao aplicar as migrações. O banco NÃO foi resetado."
    echo ""
    echo "  O serviço em execução não foi reiniciado e continua no código antigo."
    if [ -n "$DB_BACKUP" ]; then
        echo "  Backup íntegro deste momento: $DB_BACKUP"
    fi
    echo ""
    echo "  O baseline automático acima já cobre o caso de banco vindo de 'db push'."
    echo "  Se ainda assim falhou, veja qual migration está pendente e por quê:"
    echo ""
    echo "    cd $DEPLOYHUB_DIR/backend"
    echo "    npx prisma migrate status"
    echo ""
    echo "  Se a migration pendente já estiver refletida no banco, marque-a como"
    echo "  aplicada (grava só metadados, não toca em dados):"
    echo ""
    echo "    npx prisma migrate resolve --applied <nome_da_migration>"
    echo "    npx prisma migrate deploy"
    echo ""
    echo "  NÃO rode 'prisma migrate reset' nem 'db push --accept-data-loss':"
    echo "  os dois apagam dados."
    echo ""
    exit 1
fi

# 8. Build do Backend
print_status "Compilando backend..."
npm run build
print_success "Backend compilado"

# 8.1 Criptografar as variáveis de ambiente que ainda estiverem em texto puro
#
# A migração também acontece sozinha no próximo save de cada app, mas "o próximo save"
# pode nunca chegar para um app que ninguém edita — e é justamente o .env dele que
# continuaria legível num backup. Fazer aqui fecha a janela de uma vez.
if [ -f scripts/encrypt-env-vars.mjs ]; then
    print_status "Criptografando variáveis de ambiente ainda em texto puro..."
    set -a; . "$BACKEND_ENV"; set +a
    if node scripts/encrypt-env-vars.mjs; then
        print_success "Variáveis de ambiente protegidas"
    else
        print_warning "Não foi possível criptografar agora — os valores seguem funcionando em texto puro."
        print_warning "Rode manualmente depois: cd backend && node scripts/encrypt-env-vars.mjs"
    fi
fi

# 8.2 Avisar sobre apps que ficariam com o webhook quebrado
#
# O webhook agora recusa (401) uma requisição que não pode autenticar, em vez de
# deployar sem credencial. Todo app criado pelo painel tem segredo; linhas antigas podem
# não ter, e para essas o deploy automático pararia sem nenhum sinal visível.
#
# Este aviso existe para que a descoberta aconteça aqui, e não num deploy que não veio.
if [ -f scripts/check-webhook-secrets.mjs ]; then
    set -a; . "$BACKEND_ENV"; set +a
    if APPS_SEM_SEGREDO=$(node scripts/check-webhook-secrets.mjs 2>/dev/null) && [ -n "$APPS_SEM_SEGREDO" ]; then
        print_warning "Estes apps não têm segredo de webhook e terão o webhook RECUSADO (401):"
        echo "$APPS_SEM_SEGREDO" | while read -r app_sem_segredo; do
            [ -n "$app_sem_segredo" ] && echo "    - $app_sem_segredo"
        done
        echo ""
        echo "  Para cada um: abra o app no painel, gere o segredo e configure-o no"
        echo "  webhook do GitHub (Settings > Webhooks > Secret)."
        echo ""
        echo "  Se precisar de uma janela de transição, WEBHOOK_ALLOW_UNSIGNED=true em"
        echo "  backend/.env restaura o comportamento antigo — mas qualquer um que saiba"
        echo "  o nome do app poderá disparar deploys enquanto estiver ligado."
    fi
fi

# 9. Reiniciar serviço via PM2
print_status "Reiniciando serviço do backend..."
if pm2 describe deployhub-backend > /dev/null 2>&1; then
    pm2 restart deployhub-backend
    print_success "Backend reiniciado"
else
    print_warning "Processo 'deployhub-backend' não encontrado no PM2"
    print_status "Tentando iniciar o backend..."
    pm2 start dist/main.js --name deployhub-backend
    pm2 save
    print_success "Backend iniciado"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Atualização concluída com sucesso!              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
print_status "Frontend: arquivos em $DEPLOYHUB_DIR/dist"
print_status "Backend: PM2 process 'deployhub-backend'"
echo ""
