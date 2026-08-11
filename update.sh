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

# 6. Executar migrações do banco
print_status "Executando migrações do banco de dados..."
npx prisma db push
print_success "Migrações aplicadas"

# 7. Build do Backend
print_status "Compilando backend..."
npm run build
print_success "Backend compilado"

# 8. Reiniciar serviço via PM2
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
