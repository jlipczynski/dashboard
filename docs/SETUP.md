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

Skrypt sprawdzi i w razie potrzeby zainstaluje wszystko co potrzebne. Zatrzyma sie tam, gdzie wymagane jest logowanie w przegladarce (GitHub, Vercel) oraz przy `sudo` (haslo do Maca przy instalacji Vercel CLI).

Skrypt dziala niezaleznie od tego, czy Twoj shell to **zsh** (domyslny na macOS) czy **bash** — wpisy do PATH dopisuje do `~/.zshrc` i `~/.bash_profile`. Po zakonczeniu **otworz nowe okno terminala**, zeby PATH sie odswiezyl.

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
`node@22` jest "keg-only" — Homebrew nie dodaje go do PATH. Jesli `node -v` nie dziala, dopisz:
```bash
# zsh:
echo "export PATH=\"$(brew --prefix node@22)/bin:\$PATH\"" >> ~/.zshrc
# bash:
echo "export PATH=\"$(brew --prefix node@22)/bin:\$PATH\"" >> ~/.bash_profile
```

### 3. GitHub CLI
```bash
brew install gh
gh auth login
# Wybierz: GitHub.com > HTTPS > Login with a web browser
```

### 4. Vercel CLI (globalnie)
```bash
sudo npm install -g vercel
vercel login
# Wybierz: Continue with GitHub
```
**Nie uzywaj `npx vercel`** — `npx vercel login` konczy sie bez zalogowania, a `npx` potrafi
czekac na niewidoczne pytanie "Ok to proceed? (y)".

### 5. Claude Code
```bash
curl -fsSL https://claude.ai/install.sh | bash
```
Instalator kladzie `claude` w `~/.local/bin`. Dopisz ten katalog do PATH — w zaleznosci od shella:
```bash
# zsh (domyslny na macOS):
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
# bash:
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bash_profile
```
Sprawdz swoj shell: `echo $SHELL`. Potem otworz nowe okno terminala.

### 6. Klonowanie repozytorium
```bash
cd ~
gh repo clone jlipczynski/dashboard jan-dashboard
cd jan-dashboard
npm install

# Nowy npm (11.x) blokuje skrypty instalacyjne zaleznosci — zatwierdz je i przebuduj:
npm install-scripts approve esbuild fsevents sharp unrs-resolver
npm rebuild
```
Bez tego `esbuild`, `sharp` i `unrs-resolver` nie maja natywnych binarek i `npm run build` / `npm run dev` pada.
Zatwierdzenia sa juz zapisane w `package.json` (sekcja `allowScripts`, wspolna dla wszystkich Macow). Jesli zmieni sie wersja ktorejs z tych paczek, uruchom `approve` ponownie i zacommituj zmiane `package.json`.

### 7. Polaczenie z Vercel i pobranie env vars
```bash
vercel link
# Team: jlipczynskis-projects
# Project: jan-dashboard

vercel env pull .env.local
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
vercel env pull .env.local  # Moze brakuje zmiennych
```

### Blad natywnych modulow (esbuild / sharp / unrs-resolver)
```bash
npm install-scripts approve esbuild fsevents sharp unrs-resolver
npm rebuild
```

### `claude: command not found`
```bash
export PATH="$HOME/.local/bin:$PATH"   # i dopisz to do ~/.zshrc albo ~/.bash_profile
```

### Skrypt instalacyjny wisi bez komunikatu
Prawdopodobnie czeka na niewidoczne pytanie (np. `npx`). Przerwij `Ctrl+C`, pobierz najnowsza wersje skryptu i uruchom ponownie — jest idempotentny, pominie to co juz zainstalowane.

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
