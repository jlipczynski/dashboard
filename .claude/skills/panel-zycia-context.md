---
name: panel-zycia-context
description: |
  Kontekst architektoniczny projektu "Panel Życia" Jana (jan-dashboard.vercel.app).
  ZAWSZE używaj tego skilla gdy:
  - piszesz brief dla Claude Code dotyczący Panel Życia / jan-dashboard
  - Jan prosi o poprawkę, nową funkcję lub fix w dashboardzie
  - pytanie dotyczy backlogu głosowego, Weekly Plannera, Garmin, Supabase w tym projekcie
  - chcesz wiedzieć jakie tabele/env vars/komponenty już istnieją żeby nie duplikować
  Skill daje kompletny kontekst projektu — czytaj go PRZED pisaniem każdego briefu.
---
# Panel Życia — Kontekst projektu
## Deployment
- **URL produkcyjny**: https://jan-dashboard.vercel.app
- **Repo**: GitHub (branch main = produkcja, auto-merge przez workflow)
- **Hosting**: Vercel (jlipczynski's projects)
- **Push**: tylko na `claude/*-{SESSION_ID}` — nigdy bezpośrednio na main
## Stack technologiczny
- **Frontend**: Next.js 16 (App Router), React, TypeScript
- **Baza danych**: Supabase (Postgres) — projekt ID: `qvjvbkbgrisilvihxcsq`
- **Auth**: next-auth z Google Provider (OAuth 2.0)
- **Styl**: DM Sans + Space Mono, białe tło (#FAFAF9), light theme — **nigdy dark**
- **Deploy**: Vercel CLI + auto-merge PR workflow
## Zmienne środowiskowe (wszystkie ustawione na Vercel)
Wszystkie env vars ustawione na Vercel — patrz panel Vercel Settings > Environment Variables.
Kluczowe: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXTAUTH_URL, NEXTAUTH_SECRET,
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OPENAI_API_KEY, ANTHROPIC_API_KEY,
GOOGLE_DRIVE_BACKLOG_FOLDER_ID, DATABASE_URL, DATABASE_POOLER_URL.
## Tabele Supabase
Szczegóły schematów w `references/supabase_schema.md`.
| Tabela | Opis |
|--------|------|
| `weekly_tasks` | Zadania Weekly Plannera (priorytet ABCDE, WIG, punkty) + kolumna `backlog_item_id` |
| `backlog_items` | Backlog z nagrań głosowych (status: backlog/this_week/done/archived) |
| `backlog_audio_processed` | Śledzenie które pliki audio zostały już przetworzone i zapisane |
## Architektura aplikacji
### Strony
- `/` — główny dashboard (5 filarów życia)
- `/backlog` — backlog głosowy (Google Drive → Whisper → Claude → Supabase)
- `/health` lub analogiczne — filar Zdrowie (Garmin integration)
### Kluczowe komponenty
- **Weekly Planner** — React component z nawigacją tygodniową, ABCDE, WIG, progress ring
- **Garmin integration** — aktywności z Garmin API zasilają trackery (bieganie działa, rower do naprawy)
- **Backlog audio pipeline**: Google Drive folder "Backlog Audio" → Whisper API → Claude API → backlog_items
### API Routes
| Route | Metoda | Opis |
|-------|--------|------|
| `/api/auth/[...nextauth]` | GET/POST | Google OAuth (next-auth) |
| `/api/backlog/drive-files` | GET | Lista plików z Google Drive folder |
| `/api/backlog/process` | POST | Whisper transkrypcja + Claude klasyfikacja |
| `/api/backlog/save` | POST | Zapis do Supabase backlog_items |
| `/api/backlog/save` | PATCH | Update wpisu backlogu (+ auto-create weekly_tasks) |
| `/api/backlog/save` | DELETE | Usunięcie wpisu backlogu |
| `/api/backlog/audio-processed` | GET/POST | Tracking przetworzonych plików audio |
| `/api/migrate` | GET | Uruchamia migracje SQL |
## System 4DX i klasyfikacja
Jan używa metodologii 4DX:
- **WIG** (Wildly Important Goal) — oznaczany diamond
- **Lead/Lag measures**
- **Priorytet ABCDE**: A=krytyczne(4pkt), B=ważne(3pkt), C=przydatne(2pkt), D=deleguj(1pkt), E=eliminuj(0pkt)
- **+2pkt bonus** za zadania powiązane z WIG
## 5 Filarów życia
1. Zdrowie i Fitness
2. Rozwój Osobisty
3. Relacje i Partnerstwo
4. Praca (projekty: ovoc, plantacja, inne)
5. Duchowość
## Biznesy Jana
- **Ovoc Malinovi** — dystrybucja owoców (kontakt: Olgierd, Kacper, Szczepan)
- **Plantacja (GR Lipczyński)** — farma malinowa (kontakt: Olgierd, Pani Marlena, Kulig)
## Backlog audio — jak działa
1. iPhone Voice Memos → Udostępnij → Google Drive folder "Backlog Audio"
2. `/backlog` strona listuje pliki z Drive (folder ID: `1Yiehs2yO_LjKjd_OtH7Cc51q4OHAaeIR`)
3. Pliki posortowane + filtrowane (nowe/stare, przetworzone/nieprzetworzone)
4. Klik play przy pliku → odtwarzanie audio inline w przeglądarce
5. Klik "Przetwórz" → pobiera plik → Whisper API (model: `whisper-1`, autodetect PL)
6. Transkrypcja → Claude API (`claude-sonnet-4-20250514`) → klasyfikacja na wpisy
7. Każdy wpis: title, type (task/idea/note/goal/question), pillar (1-5), project, priority (A-E), is_wig, due_date
8. Zapis do Supabase `backlog_items` + oznaczenie pliku w `backlog_audio_processed`
9. Klik "→ Ten tydzień" → zmienia status na `this_week` + automatycznie tworzy zadanie w `weekly_tasks`
## Integracja backlog → Weekly Planner
- Kliknięcie "→ Ten tydzień" na wpisie backlogu:
  1. Ustawia `backlog_items.status = 'this_week'`
  2. Tworzy nowy rekord w `weekly_tasks` z danymi z backlog_item
  3. Ustawia `weekly_tasks.backlog_item_id` = id wpisu backlogu (nowa kolumna)
  4. Wpis pojawia się w Weekly Plannerze na bieżący tydzień
- Wpis nie znika z backlogu — zmienia badge na zielony "Ten tydzień"
## Zasady przy pisaniu briefów dla Claude Code
1. **Zakaz zmian wizualnych** — zawsze pisz to explicite
2. **Nie ruszać**: Weekly Planner komponent, tabela `weekly_tasks`, globalny layout/navbar/sidebar
3. **Branch**: Claude Code tworzy `claude/{feature}-{SESSION_ID}`, PR merguje auto-workflow
4. **Env vars**: nie musisz ich opisywać — wszystkie są już ustawione na Vercel
5. **Supabase**: używaj `SUPABASE_SERVICE_ROLE_KEY` po stronie serwera, `NEXT_PUBLIC_SUPABASE_URL` po stronie klienta
## Znane problemy / historia
- `redirect_uri_mismatch` — był spowodowany brakiem env vars na Vercel, rozwiązany
- Tabela `backlog_items` — migracje uruchamiane automatycznie przez `scripts/migrate.mjs` przy każdym buildzie
- Rower z Garmin — nie zaciąga automatycznie jak bieganie (do naprawy)
- Google Client Secret był regenerowany 6.03.2026
