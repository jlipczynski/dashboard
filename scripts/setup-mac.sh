#!/bin/bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }
fail() { echo -e "${RED}[BLAD]${NC} $1"; exit 1; }
need() { echo -e "${YELLOW}[WYMAGANE]${NC} $1"; }

echo ""
echo "====================================="
echo "  Jan's Dashboard — instalacja Maca"
echo "====================================="
echo ""

# --- Homebrew ---
if command -v brew &>/dev/null; then
  ok "Homebrew zainstalowany"
else
  info "Instaluje Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add to PATH for Apple Silicon
  if [[ -f /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
  ok "Homebrew zainstalowany"
fi

# --- Node.js ---
if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  ok "Node.js $NODE_VER"
else
  info "Instaluje Node.js LTS..."
  brew install node@22
  ok "Node.js zainstalowany"
fi

# --- Git ---
if command -v git &>/dev/null; then
  ok "Git zainstalowany"
else
  info "Instaluje Git..."
  brew install git
  ok "Git zainstalowany"
fi

# --- GitHub CLI ---
if command -v gh &>/dev/null; then
  ok "GitHub CLI zainstalowany"
else
  info "Instaluje GitHub CLI..."
  brew install gh
  ok "GitHub CLI zainstalowany"
fi

# --- GitHub auth ---
if gh auth status &>/dev/null; then
  ok "GitHub zalogowany"
else
  need "Logowanie do GitHub (otworzy przegladarke)..."
  gh auth login -h github.com -p https -w
  ok "GitHub zalogowany"
fi

# --- Vercel CLI ---
if command -v vercel &>/dev/null || npx vercel --version &>/dev/null 2>&1; then
  ok "Vercel CLI dostepne"
else
  info "Instaluje Vercel CLI..."
  npm install -g vercel
  ok "Vercel CLI zainstalowany"
fi

# --- Claude Code ---
if command -v claude &>/dev/null; then
  ok "Claude Code zainstalowany"
else
  info "Instaluje Claude Code..."
  npm install -g @anthropic-ai/claude-code
  ok "Claude Code zainstalowany"
fi

# --- Clone repo ---
REPO_DIR="$HOME/jan-dashboard"
if [[ -d "$REPO_DIR/.git" ]]; then
  ok "Repozytorium juz sklonowane: $REPO_DIR"
  cd "$REPO_DIR"
  git pull --ff-only || info "Nie udalo sie git pull — moze masz lokalne zmiany"
else
  info "Klonuje repozytorium..."
  gh repo clone jlipczynski/dashboard "$REPO_DIR"
  cd "$REPO_DIR"
  ok "Repozytorium sklonowane do $REPO_DIR"
fi

# --- npm install ---
info "Instaluje zaleznosci (npm install)..."
npm install
ok "Zaleznosci zainstalowane"

# --- Vercel link ---
if [[ -d "$REPO_DIR/.vercel" ]]; then
  ok "Projekt polaczony z Vercel"
else
  need "Laczenie z Vercel (moze otworzyc przegladarke)..."
  echo "  Team: jlipczynskis-projects"
  echo "  Project: jan-dashboard"
  npx vercel link
fi

# --- Pull env vars ---
if [[ -f "$REPO_DIR/.env.local" ]]; then
  ok "Plik .env.local istnieje"
else
  info "Pobieram zmienne srodowiskowe z Vercel..."
  npx vercel env pull .env.local
  ok "Zmienne pobrane do .env.local"
fi

echo ""
echo "====================================="
echo -e "${GREEN}  Gotowe!${NC}"
echo "====================================="
echo ""
echo "Uruchom aplikacje lokalnie:"
echo "  cd ~/jan-dashboard"
echo "  npm run dev"
echo ""
echo "Uruchom Claude Code:"
echo "  cd ~/jan-dashboard"
echo "  claude"
echo ""
