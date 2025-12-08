#!/bin/bash

# ============================================
# DeployHub - Script de Instalação Completa
# ============================================
# 
# INSTALAÇÃO RÁPIDA (via curl):
# curl -sSL https://raw.githubusercontent.com/SEU-USUARIO/SEU-REPO/main/install.sh | sudo bash
#
# OU execute localmente após clonar:
# sudo bash backend/setup.sh
#
# ============================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Variáveis globais
FRONTEND_DOMAIN=""
BACKEND_DOMAIN=""
APPS_DIR="/root/apps"
INSTALL_USER="root"
INSTALL_DEPS=true
USE_SEPARATE_USER=false
HOME_DIR="/root"

# Detectar diretório do script (suporta execução de qualquer lugar)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYHUB_DIR="$(dirname "$SCRIPT_DIR")"

# Se estiver rodando de dentro do backend, ajustar
if [[ "$(basename "$SCRIPT_DIR")" == "backend" ]]; then
    DEPLOYHUB_DIR="$SCRIPT_DIR/.."
fi

DEPLOYHUB_DIR="$(cd "$DEPLOYHUB_DIR" && pwd)"

# Funções de utilidade
print_header() {
    echo -e "\n${CYAN}============================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}============================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Verificar se está rodando como root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "Este script precisa ser executado como root"
        exit 1
    fi
}

# Coletar informações do usuário
collect_info() {
    print_header "🚀 DeployHub - Instalação"
    
    echo -e "${CYAN}Bem-vindo ao instalador do DeployHub!${NC}"
    echo -e "Este script irá configurar todo o ambiente necessário.\n"
    
    # Domínio Frontend
    read -p "📌 Insira o domínio do frontend (ex: panel.seudominio.com): " FRONTEND_DOMAIN
    while [[ -z "$FRONTEND_DOMAIN" ]]; do
        print_warning "O domínio do frontend é obrigatório!"
        read -p "📌 Insira o domínio do frontend: " FRONTEND_DOMAIN
    done
    
    # Domínio Backend
    read -p "📌 Insira o domínio do backend (ex: api.seudominio.com): " BACKEND_DOMAIN
    while [[ -z "$BACKEND_DOMAIN" ]]; do
        print_warning "O domínio do backend é obrigatório!"
        read -p "📌 Insira o domínio do backend: " BACKEND_DOMAIN
    done
    
    # Instalar dependências
    echo ""
    read -p "📦 Deseja instalar todas as bibliotecas necessárias? (Node.js, npm, Nginx, Certbot, PM2) [S/n]: " INSTALL_DEPS_CHOICE
    if [[ "$INSTALL_DEPS_CHOICE" =~ ^[Nn]$ ]]; then
        INSTALL_DEPS=false
    fi
    
    # Caminho da pasta apps
    echo ""
    read -p "📁 Deseja personalizar o caminho da pasta apps? [s/N]: " CUSTOM_APPS_PATH
    if [[ "$CUSTOM_APPS_PATH" =~ ^[Ss]$ ]]; then
        read -p "   Insira o caminho completo (padrão: /root/apps): " APPS_DIR_INPUT
        if [[ -n "$APPS_DIR_INPUT" ]]; then
            APPS_DIR="$APPS_DIR_INPUT"
        fi
    fi
    
    # Usuário separado
    echo ""
    read -p "👤 Deseja criar um usuário separado ao invés de usar root? [s/N]: " USE_USER_CHOICE
    if [[ "$USE_USER_CHOICE" =~ ^[Ss]$ ]]; then
        USE_SEPARATE_USER=true
        read -p "   Nome do usuário (padrão: deployhub): " USER_NAME
        INSTALL_USER="${USER_NAME:-deployhub}"
    fi
    
    # Confirmar configurações
    echo ""
    print_header "📋 Resumo da Configuração"
    echo -e "  Frontend:           ${GREEN}$FRONTEND_DOMAIN${NC}"
    echo -e "  Backend:            ${GREEN}$BACKEND_DOMAIN${NC}"
    echo -e "  Pasta Apps:         ${GREEN}$APPS_DIR${NC}"
    echo -e "  Usuário:            ${GREEN}$INSTALL_USER${NC}"
    echo -e "  Instalar deps:      ${GREEN}$([ "$INSTALL_DEPS" = true ] && echo "Sim" || echo "Não")${NC}"
    echo ""
    
    read -p "Confirmar instalação? [S/n]: " CONFIRM
    if [[ "$CONFIRM" =~ ^[Nn]$ ]]; then
        print_warning "Instalação cancelada pelo usuário."
        exit 0
    fi
}

# Criar usuário separado
create_user() {
    if [[ "$USE_SEPARATE_USER" = true ]]; then
        print_header "👤 Criando usuário $INSTALL_USER"
        
        if id "$INSTALL_USER" &>/dev/null; then
            print_warning "Usuário $INSTALL_USER já existe"
        else
            useradd -m -s /bin/bash "$INSTALL_USER"
            print_success "Usuário $INSTALL_USER criado"
        fi
        
        # Adicionar ao grupo sudo
        usermod -aG sudo "$INSTALL_USER"
        
        # Configurar sudo sem senha para comandos específicos
        echo "$INSTALL_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload nginx, /usr/bin/nginx, /usr/bin/certbot, /bin/mv, /bin/ln, /bin/rm, /bin/mkdir, /bin/cp" > /etc/sudoers.d/deployhub
        chmod 440 /etc/sudoers.d/deployhub
        
        HOME_DIR="/home/$INSTALL_USER"
        
        # Mover DeployHub para o diretório do usuário
        if [[ "$DEPLOYHUB_DIR" != "$HOME_DIR/deployhub" ]]; then
            print_info "Movendo DeployHub para $HOME_DIR/deployhub..."
            mv "$DEPLOYHUB_DIR" "$HOME_DIR/deployhub"
            DEPLOYHUB_DIR="$HOME_DIR/deployhub"
        fi
        
        chown -R "$INSTALL_USER:$INSTALL_USER" "$DEPLOYHUB_DIR"
        print_success "Permissões configuradas"
    fi
}

# Instalar dependências do sistema
install_dependencies() {
    if [[ "$INSTALL_DEPS" = false ]]; then
        print_warning "Pulando instalação de dependências..."
        return
    fi
    
    print_header "📦 Instalando Dependências"
    
    # Atualizar repositórios
    print_info "Atualizando repositórios..."
    apt-get update -y
    
    # Instalar dependências básicas
    print_info "Instalando dependências básicas..."
    apt-get install -y curl wget git build-essential software-properties-common
    
    # Instalar Node.js 20
    print_info "Instalando Node.js 20..."
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    else
        print_warning "Node.js já instalado: $(node -v)"
    fi
    
    # Instalar PM2
    print_info "Instalando PM2..."
    if ! command -v pm2 &> /dev/null; then
        npm install -g pm2
    else
        print_warning "PM2 já instalado"
    fi
    
    # Instalar Nginx
    print_info "Instalando Nginx..."
    if ! command -v nginx &> /dev/null; then
        apt-get install -y nginx
        systemctl enable nginx
        systemctl start nginx
    else
        print_warning "Nginx já instalado"
    fi
    
    # Instalar Certbot
    print_info "Instalando Certbot..."
    if ! command -v certbot &> /dev/null; then
        apt-get install -y certbot python3-certbot-nginx
    else
        print_warning "Certbot já instalado"
    fi
    
    print_success "Dependências instaladas com sucesso"
}

# Criar estrutura de diretórios
create_directories() {
    print_header "📁 Criando Estrutura de Diretórios"
    
    mkdir -p "$APPS_DIR"
    mkdir -p "$DEPLOYHUB_DIR"
    mkdir -p /var/www
    
    if [[ "$USE_SEPARATE_USER" = true ]]; then
        chown -R "$INSTALL_USER:$INSTALL_USER" "$APPS_DIR"
        chown -R "$INSTALL_USER:$INSTALL_USER" "$DEPLOYHUB_DIR"
    fi
    
    print_success "Diretórios criados"
}

# Gerar secrets
generate_secrets() {
    JWT_SECRET=$(openssl rand -hex 32)
    REGISTRATION_SECRET=$(openssl rand -hex 16)
    WEBHOOK_SECRET=$(openssl rand -hex 32)
}

# Clonar e configurar o DeployHub
setup_deployhub() {
    print_header "🔧 Configurando DeployHub"
    
    cd "$DEPLOYHUB_DIR"
    
    # Criar arquivo .env do backend
    print_info "Criando arquivo de configuração..."
    
    generate_secrets
    
    cat > "$DEPLOYHUB_DIR/backend/.env" << EOF
# DeployHub Backend Environment Variables
# Gerado automaticamente em $(date)

# Server
PORT=10001
NODE_ENV=production

# Database (SQLite)
DATABASE_URL="file:./prisma/deployhub.db"

# JWT Secret
JWT_SECRET=$JWT_SECRET

# Apps directory
APPS_DIR=$APPS_DIR

# Registration Secret (necessário para registrar novos usuários)
REGISTRATION_SECRET=$REGISTRATION_SECRET

# Webhook Secret (para validação HMAC do GitHub)
WEBHOOK_SECRET=$WEBHOOK_SECRET

# Email (Resend) - Opcional
# RESEND_API_KEY=sua-chave-resend-aqui
EOF
    
    print_success "Arquivo .env criado"
    
    # Instalar dependências do backend
    print_info "Instalando dependências do backend..."
    cd "$DEPLOYHUB_DIR/backend"
    npm install
    
    # Gerar cliente Prisma e rodar migrations
    print_info "Configurando banco de dados..."
    npx prisma generate
    npx prisma migrate deploy 2>/dev/null || npx prisma migrate dev --name init
    
    # Criar usuário admin
    print_info "Criando usuário admin..."
    ADMIN_PASSWORD=$(openssl rand -base64 12)
    
    node -e "
    const { PrismaClient } = require('@prisma/client');
    const bcrypt = require('bcryptjs');
    
    async function main() {
        const prisma = new PrismaClient();
        const hashedPassword = await bcrypt.hash('$ADMIN_PASSWORD', 10);
        
        try {
            await prisma.user.upsert({
                where: { email: 'admin@deployhub.local' },
                update: { password: hashedPassword },
                create: {
                    email: 'admin@deployhub.local',
                    password: hashedPassword,
                    name: 'Admin'
                }
            });
            console.log('Usuário admin criado/atualizado');
        } catch (e) {
            console.error('Erro ao criar usuário:', e.message);
        }
        
        await prisma.\$disconnect();
    }
    
    main();
    "
    
    # Build do backend
    print_info "Compilando backend..."
    npm run build
    
    # Instalar e buildar frontend
    print_info "Instalando dependências do frontend..."
    cd "$DEPLOYHUB_DIR"
    npm install
    
    # Criar arquivo de configuração do frontend
    cat > "$DEPLOYHUB_DIR/.env" << EOF
VITE_API_URL=https://$BACKEND_DOMAIN/api
EOF
    
    print_info "Compilando frontend..."
    npm run build
    
    # Copiar frontend para /var/www
    mkdir -p /var/www/deployhub-panel
    cp -r "$DEPLOYHUB_DIR/dist/"* /var/www/deployhub-panel/
    
    print_success "DeployHub configurado"
}

# Configurar Nginx
setup_nginx() {
    print_header "🌐 Configurando Nginx"
    
    # Configuração do Frontend
    cat > /etc/nginx/sites-available/deployhub-frontend << EOF
server {
    listen 80;
    server_name $FRONTEND_DOMAIN;
    
    root /var/www/deployhub-panel;
    index index.html;
    
    location / {
        try_files \$uri \$uri/ /index.html;
    }
    
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF
    
    # Configuração do Backend
    cat > /etc/nginx/sites-available/deployhub-backend << EOF
server {
    listen 80;
    server_name $BACKEND_DOMAIN;
    
    location / {
        proxy_pass http://127.0.0.1:10001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }
}
EOF
    
    # Ativar sites
    ln -sf /etc/nginx/sites-available/deployhub-frontend /etc/nginx/sites-enabled/
    ln -sf /etc/nginx/sites-available/deployhub-backend /etc/nginx/sites-enabled/
    
    # Remover configuração default se existir
    rm -f /etc/nginx/sites-enabled/default
    
    # Testar e recarregar
    nginx -t
    systemctl reload nginx
    
    print_success "Nginx configurado"
}

# Configurar SSL
setup_ssl() {
    print_header "🔒 Configurando SSL"
    
    read -p "Deseja configurar SSL com Let's Encrypt agora? [S/n]: " SETUP_SSL
    if [[ "$SETUP_SSL" =~ ^[Nn]$ ]]; then
        print_warning "SSL não configurado. Execute manualmente depois:"
        echo "  certbot --nginx -d $FRONTEND_DOMAIN -d $BACKEND_DOMAIN"
        return
    fi
    
    read -p "Insira seu email para o Let's Encrypt: " SSL_EMAIL
    
    certbot --nginx -d "$FRONTEND_DOMAIN" -d "$BACKEND_DOMAIN" --non-interactive --agree-tos --email "$SSL_EMAIL" || {
        print_warning "Erro ao configurar SSL. Verifique se os domínios estão apontando para este servidor."
        print_info "Execute manualmente depois: certbot --nginx -d $FRONTEND_DOMAIN -d $BACKEND_DOMAIN"
    }
    
    print_success "SSL configurado"
}

# Configurar PM2
setup_pm2() {
    print_header "⚡ Configurando PM2"
    
    cd "$DEPLOYHUB_DIR/backend"
    
    # Iniciar aplicação
    if [[ "$USE_SEPARATE_USER" = true ]]; then
        sudo -u "$INSTALL_USER" pm2 start dist/main.js --name deployhub-backend
        sudo -u "$INSTALL_USER" pm2 save
        
        # Configurar startup
        pm2 startup systemd -u "$INSTALL_USER" --hp "$HOME_DIR"
    else
        pm2 start dist/main.js --name deployhub-backend
        pm2 save
        pm2 startup
    fi
    
    print_success "PM2 configurado"
}

# Configurar firewall
setup_firewall() {
    print_header "🔥 Configurando Firewall"
    
    if command -v ufw &> /dev/null; then
        ufw allow 22/tcp
        ufw allow 80/tcp
        ufw allow 443/tcp
        ufw --force enable
        print_success "Firewall configurado"
    else
        print_warning "UFW não encontrado, pulando configuração do firewall"
    fi
}

# Mostrar resumo final
show_summary() {
    print_header "✅ Instalação Concluída!"
    
    echo -e "${GREEN}DeployHub foi instalado com sucesso!${NC}\n"
    
    echo -e "${CYAN}📍 URLs de Acesso:${NC}"
    echo -e "   Frontend: ${GREEN}https://$FRONTEND_DOMAIN${NC}"
    echo -e "   Backend:  ${GREEN}https://$BACKEND_DOMAIN${NC}"
    echo ""
    
    echo -e "${CYAN}🔐 Credenciais de Acesso:${NC}"
    echo -e "   Email:    ${GREEN}admin@deployhub.local${NC}"
    echo -e "   Senha:    ${GREEN}$ADMIN_PASSWORD${NC}"
    echo ""
    
    echo -e "${CYAN}🔑 Secrets (guarde em local seguro):${NC}"
    echo -e "   JWT Secret:          ${YELLOW}$JWT_SECRET${NC}"
    echo -e "   Registration Secret: ${YELLOW}$REGISTRATION_SECRET${NC}"
    echo -e "   Webhook Secret:      ${YELLOW}$WEBHOOK_SECRET${NC}"
    echo ""
    
    echo -e "${CYAN}📁 Diretórios:${NC}"
    echo -e "   Apps:      ${GREEN}$APPS_DIR${NC}"
    echo -e "   DeployHub: ${GREEN}$DEPLOYHUB_DIR${NC}"
    echo ""
    
    echo -e "${CYAN}🛠️ Comandos Úteis:${NC}"
    echo -e "   Ver logs:     ${YELLOW}pm2 logs deployhub-backend${NC}"
    echo -e "   Reiniciar:    ${YELLOW}pm2 restart deployhub-backend${NC}"
    echo -e "   Status:       ${YELLOW}pm2 status${NC}"
    echo ""
    
    echo -e "${RED}⚠️  IMPORTANTE:${NC}"
    echo -e "   1. Altere a senha padrão após o primeiro login!"
    echo -e "   2. Guarde os secrets em local seguro!"
    echo -e "   3. Configure o RESEND_API_KEY no .env para emails"
    echo ""
    
    # Salvar informações em arquivo
    cat > "$DEPLOYHUB_DIR/install-info.txt" << EOF
DeployHub - Informações de Instalação
======================================
Data: $(date)

URLs:
- Frontend: https://$FRONTEND_DOMAIN
- Backend: https://$BACKEND_DOMAIN

Credenciais:
- Email: admin@deployhub.local
- Senha: $ADMIN_PASSWORD

Secrets:
- JWT Secret: $JWT_SECRET
- Registration Secret: $REGISTRATION_SECRET
- Webhook Secret: $WEBHOOK_SECRET

Diretórios:
- Apps: $APPS_DIR
- DeployHub: $DEPLOYHUB_DIR
- Frontend: /var/www/deployhub-panel

Configuração:
- Usuário: $INSTALL_USER
EOF
    
    chmod 600 "$DEPLOYHUB_DIR/install-info.txt"
    
    print_info "Informações salvas em: $DEPLOYHUB_DIR/install-info.txt"
}

# Função principal
main() {
    check_root
    collect_info
    create_user
    install_dependencies
    create_directories
    
    # Clonar repositório (ou copiar arquivos se já existirem)
    if [[ ! -d "$DEPLOYHUB_DIR/backend" ]]; then
        print_header "📥 Preparando Arquivos"
        print_warning "Por favor, copie os arquivos do DeployHub para: $DEPLOYHUB_DIR"
        print_info "Ou clone o repositório: git clone <seu-repo> $DEPLOYHUB_DIR"
        read -p "Pressione ENTER quando os arquivos estiverem prontos..."
    fi
    
    setup_deployhub
    setup_nginx
    setup_ssl
    setup_pm2
    setup_firewall
    show_summary
}

# Executar
main
