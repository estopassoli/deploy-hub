#!/bin/bash

# ============================================
# DeployHub - Instalação Rápida
# ============================================
# Execute: curl -sSL https://raw.githubusercontent.com/SEU-USUARIO/SEU-REPO/main/install.sh | sudo bash
# ============================================

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║   ██████╗ ███████╗██████╗ ██╗      ██████╗ ██╗   ██╗     ║"
echo "║   ██╔══██╗██╔════╝██╔══██╗██║     ██╔═══██╗╚██╗ ██╔╝     ║"
echo "║   ██║  ██║█████╗  ██████╔╝██║     ██║   ██║ ╚████╔╝      ║"
echo "║   ██║  ██║██╔══╝  ██╔═══╝ ██║     ██║   ██║  ╚██╔╝       ║"
echo "║   ██████╔╝███████╗██║     ███████╗╚██████╔╝   ██║        ║"
echo "║   ╚═════╝ ╚══════╝╚═╝     ╚══════╝ ╚═════╝    ╚═╝        ║"
echo "║                                                           ║"
echo "║                    HUB - DevOps Panel                     ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Verificar root
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}✗ Este script precisa ser executado como root (sudo)${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Executando como root${NC}"

# Verificar se git está instalado
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}⚠ Git não encontrado. Instalando...${NC}"
    apt-get update -y && apt-get install -y git
fi

echo -e "${GREEN}✓ Git disponível${NC}"

# Definir diretório de instalação
INSTALL_DIR="/root/deployhub"

# Perguntar URL do repositório
echo ""
echo -e "${CYAN}📦 Configuração do Repositório${NC}"
echo ""
read -p "Insira a URL do repositório Git (ex: https://github.com/usuario/deployhub.git): " REPO_URL

while [[ -z "$REPO_URL" ]]; do
    echo -e "${YELLOW}⚠ A URL do repositório é obrigatória!${NC}"
    read -p "Insira a URL do repositório Git: " REPO_URL
done

# Perguntar branch
read -p "Branch a ser usado (padrão: main): " BRANCH
BRANCH="${BRANCH:-main}"

# Limpar instalação anterior se existir
if [[ -d "$INSTALL_DIR" ]]; then
    echo ""
    read -p "⚠ Diretório $INSTALL_DIR já existe. Deseja sobrescrever? [s/N]: " OVERWRITE
    if [[ "$OVERWRITE" =~ ^[Ss]$ ]]; then
        echo -e "${YELLOW}Removendo instalação anterior...${NC}"
        rm -rf "$INSTALL_DIR"
    else
        echo -e "${RED}Instalação cancelada.${NC}"
        exit 1
    fi
fi

# Clonar repositório
echo ""
echo -e "${CYAN}📥 Clonando repositório...${NC}"
git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$INSTALL_DIR"

if [[ ! -f "$INSTALL_DIR/backend/setup.sh" ]]; then
    echo -e "${RED}✗ Arquivo setup.sh não encontrado no repositório!${NC}"
    echo -e "${RED}  Verifique se o repositório contém a pasta backend/setup.sh${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Repositório clonado com sucesso${NC}"

# Executar script de instalação principal
echo ""
echo -e "${CYAN}🚀 Iniciando instalação do DeployHub...${NC}"
echo ""

cd "$INSTALL_DIR"
chmod +x backend/setup.sh
bash backend/setup.sh

echo ""
echo -e "${GREEN}✓ Instalação concluída!${NC}"
