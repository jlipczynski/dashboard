#!/bin/bash
# Skrypt instalacyjny Jan's Dashboard na nowym Macu.
# Dziala niezaleznie od tego, czy domyslny shell to bash czy zsh
# (sam skrypt zawsze uruchamia sie w /bin/bash).
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }
fail() { echo -e "${RED}[BLAD]${NC} $1"; exit 1; }
need() { echo -e "${YELLOW}[WYMAGANE]${NC} $1"; }

# Pliki startowe obu shelli — zsh (domyslny na macOS) i bash.
# macOS Terminal uruchamia bash jako login shell, wiec czyta ~/.bash_profile.
SHELL_RC_FILES=("$HOME/.zshrc" "$HOME/.bash_profile")
if [[ -f "$HOME/.bashrc" ]]; then
  SHELL_RC_FILES+=("$HOME/.bashrc")
fi

# Dopisuje linie do plikow startowych bash i zsh (jesli jeszcze jej tam nie ma).
add_to_shell_rc() {
  local line="$1"
  local rc
  for rc in "${SHELL_RC_FILES[@]}"; do
    touch "$rc"
    if ! grep -qsF "$line" "$rc"; then
      printf '\n%s\n' "$line" >> "$rc"
      info "Dopisano do $(basename "$rc"): $line"
    fi
  done
}

echo ""
echo "====================================="
echo "  Jan's Dashboard — instalacja Maca"
echo "====================================="
echo ""
info "Domyslny shell: ${SHELL:-nieznany}"

# --- Homebrew ---
if command -v brew &>/dev/null; then
  ok "Homebrew zainstalowany"
else
  info "Instaluje Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Apple Silicon: brew w /opt/homebrew nie jest domyslnie w PATH
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    add_to_shell_rc 'eval "$(/opt/homebrew/bin/brew shellenv)"'
  fi
  ok "Homebrew zainstalowany"
fi

# --- Node.js ---
if command -v node &>/dev/null; then
  ok "Node.js $(node -v), npm $(npm -v)"
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

# --- Vercel CLI (globalnie) ---
# UWAGA: NIE uzywamy `npx vercel ...`. Gdy vercel nie jest zainstalowany,
# npx pyta "Ok to proceed? (y)" — przy wyjsciu przekierowanym do /dev/null
# pytanie jest niewidoczne i skrypt wisi (tak zawiesil sie po "GitHub zalogowany").
# Do tego `npx vercel login` konczy sie bez zalogowania.
if command -v vercel &>/dev/null; then
  ok "Vercel CLI zainstalowany ($(vercel --version </dev/null 2>/dev/null | tail -1))"
else
  need "Instaluje Vercel CLI globalnie (sudo — podaj haslo do Maca)..."
  sudo npm install -g vercel
  hash -r
  command -v vercel &>/dev/null || fail "vercel nie jest w PATH po instalacji"
  ok "Vercel CLI zainstalowany"
fi

# --- Vercel auth ---
if vercel whoami </dev/null &>/dev/null; then
  ok "Vercel zalogowany"
else
  need "Logowanie do Vercel (wybierz: Continue with GitHub)..."
  vercel login
  vercel whoami </dev/null &>/dev/null || fail "Logowanie do Vercel nie powiodlo sie — uruchom 'vercel login' recznie"
  ok "Vercel zalogowany"
fi

# --- Claude Code (natywny instalator) ---
# Instalator kladzie binarke w ~/.local/bin — dopisujemy ja do PATH dla bash i zsh.
export PATH="$HOME/.local/bin:$PATH"
add_to_shell_rc 'export PATH="$HOME/.local/bin:$PATH"'
if command -v claude &>/dev/null; then
  ok "Claude Code zainstalowany"
else
  info "Instaluje Claude Code..."
  curl -fsSL https://claude.ai/install.sh | bash
  hash -r
  command -v claude &>/dev/null || fail "claude nie jest w PATH po instalacji (sprawdz ~/.local/bin)"
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

# Nowy npm blokuje skrypty instalacyjne zaleznosci, dopoki ich nie zatwierdzisz.
# Bez tego esbuild / sharp / unrs-resolver nie maja natywnych binarek i build pada.
if npm install-scripts --help &>/dev/null; then
  info "Zatwierdzam skrypty instalacyjne (esbuild, fsevents, sharp, unrs-resolver)..."
  npm install-scripts approve esbuild fsevents sharp unrs-resolver
  npm rebuild
  ok "Skrypty instalacyjne zatwierdzone, zaleznosci przebudowane"
else
  info "Ten npm nie blokuje skryptow instalacyjnych — pomijam zatwierdzanie"
fi

# --- Vercel link ---
if [[ -d "$REPO_DIR/.vercel" ]]; then
  ok "Projekt polaczony z Vercel"
else
  need "Laczenie z Vercel..."
  echo "  Team: jlipczynskis-projects"
  echo "  Project: jan-dashboard"
  vercel link
fi

# --- Pull env vars ---
if [[ -f "$REPO_DIR/.env.local" ]]; then
  ok "Plik .env.local istnieje"
else
  info "Pobieram zmienne srodowiskowe z Vercel..."
  vercel env pull .env.local
  ok "Zmienne pobrane do .env.local"
fi

echo ""
echo "====================================="
echo -e "${GREEN}  Gotowe!${NC}"
echo "====================================="
echo ""
echo "Otworz NOWE okno terminala (zeby PATH sie odswiezyl), potem:"
echo ""
echo "Uruchom aplikacje lokalnie:"
echo "  cd ~/jan-dashboard"
echo "  npm run dev"
echo ""
echo "Uruchom Claude Code:"
echo "  cd ~/jan-dashboard"
echo "  claude"
echo ""
