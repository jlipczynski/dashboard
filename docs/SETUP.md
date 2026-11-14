# Instalacja Jan's Dashboard na nowym Macu

## Wymagania

- macOS (Intel lub Apple Silicon)
- Konto GitHub z dostepem do prywatnego repo `jlipczynski/dashboard`
- Konto Vercel polaczone z projektem `jlipczynskis-projects/jan-dashboard`

## Szybki start (skrypt)

```bash
# Pobierz i uruchom skrypt instalacyjny:
curl -fsSL https://raw.githubusercontent.com/jlipczynski/dashboard/main/scripts/setup-mac.sh -o /tmp/setup-mac.sh
chmod +x /tmp/setup-mac.sh
/tmp/setup-mac.sh
```

Skrypt sprawdzi i w razie potrzeby zainstaluje wszystko co potrzebne. Zatrzyma sie tam, gdzie wymagane jest logowanie w przegladarce (GitHub, Vercel).

Mozesz tez przejsc przez kroki recznie:

## Krok po kroku (recznie)

### 1. Homebrew
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Node.js LTS
```bash
brew install node@22
```

### 3. GitHub CLI
```bash
brew install gh
gh auth login
# Wybierz: GitHub.com > HTTPS > Login with a web browser
```

### 4. Vercel CLI
```bash
npm install -g vercel
```

### 5. Claude Code
```bash
npm install -g @anthropic-ai/claude-code
```

### 6. Klonowanie repozytorium
```bash
cd ~
gh repo clone jlipczynski/dashboard jan-dashboard
cd jan-dashboard
npm install
```

### 7. Polaczenie z Vercel i pobranie env vars
```bash
npx vercel login
# Wybierz: Log in to Vercel > Continue with GitHub

npx vercel link
# Team: jlipczynskis-projects
# Project: jan-dashboard

npx vercel env pull .env.local
# Pobiera zmienne srodowiskowe z Vercel do pliku .env.local
```

### 8. Uruchomienie lokalne
```bash
npm run dev
# Otworz http://localhost:3000
```

### 9. Claude Code
```bash
claude
# Claude Code przeczyta CLAUDE.md i docs/VISION_2029_SPEC.md automatycznie
```

---

## Zaczynam prace

```bash
cd ~/jan-dashboard
git pull --ff-only          # Pobierz najnowsze zmiany
npm install                 # Na wypadek nowych zaleznosci
```

## Koncze prace

```bash
git status                  # Sprawdz co sie zmienilo
git add <pliki>             # Dodaj zmienione pliki (NIE uzywaj git add .)
git commit -m "opis zmian"
git push                    # Wypchnij na GitHub
```

**UWAGA:** Push na galaz `claude/*` uruchamia auto-merge do main i natychmiast trafia na produkcje. Przed pushem ZAWSZE: `npm run build`.

## Gdy cos nie dziala

### `npm run dev` nie startuje
```bash
npm install                 # Moze brakuje zaleznosci
npx vercel env pull .env.local  # Moze brakuje zmiennych
```

### Blad przy `git pull`
```bash
git status                  # Sprawdz czy masz niezacommitowane zmiany
git stash                   # Schowaj zmiany tymczasowo
git pull --ff-only
git stash pop               # Przywroc schowane zmiany
```

### Blad `NEXTAUTH_URL` lub `redirect_uri_mismatch`
Sprawdz czy `.env.local` zawiera `NEXTAUTH_URL=https://jan-dashboard.vercel.app`.

### Nie moge sie zalogowac
Sprawdz czy Twoj email jest na liscie `ALLOWED_EMAILS` w ustawieniach Vercel.

### `npm run build` nie przechodzi
NIE pushuj. Przeczytaj blad, napraw, sprobuj ponownie. Jezeli nie wiesz co robic — zapytaj Claude Code.
