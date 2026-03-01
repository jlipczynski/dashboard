# BRIEF DLA CLAUDE CODE — Weekly Planner Integration

## ZASADA NADRZĘDNA
**NIE ZMIENIAJ DESIGNU.** Komponent `weekly-planner.jsx` ma gotowy, zatwierdzony design. Twoje zadanie to TYLKO integracja — podłączenie do projektu, bazy danych i routingu. Kolory, fonty, layouty, spacing, border-radius — WSZYSTKO zostaje dokładnie tak jak jest w pliku.

## CO MASZ ZROBIĆ

### 1. Dodaj komponent do projektu Next.js
- Skopiuj `weekly-planner.jsx` do `src/components/WeeklyPlanner.jsx`
- Dodaj stronę `src/app/weekly/page.tsx` która renderuje ten komponent
- Dodaj nawigację do weekly plannera z głównej strony dashboardu

### 2. Podłącz Supabase
Utwórz tabelę `weekly_tasks` w Supabase z następującym schematem:

```sql
create table weekly_tasks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id),
  task text not null,
  project text not null,          -- 'Ovoc Malinovi' | 'Plantacja' | 'Inne' | 'Zdrowie' | 'Rozwój' | 'Relacje' | 'Duchowość'
  priority char(1) not null,      -- 'A' | 'B' | 'C' | 'D' | 'E'
  sub_priority integer default 1,
  wig_id text default '',
  deadline date,
  person text default '',
  status text default 'todo',     -- 'todo' | 'done'
  week_start date not null,       -- poniedziałek danego tygodnia
  notes text default '',
  points integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_weekly_tasks_week on weekly_tasks(user_id, week_start);
```

### 3. Zamień useState na Supabase
- Zamień `INITIAL_TASKS` i `useState` na fetch z Supabase filtrowany po `week_start`
- `toggleStatus` → update w Supabase
- `addTask` → insert do Supabase  
- `deleteTask` → delete z Supabase
- Obliczanie `points` przy insercie: priorytet A=4, B=3, C=2, D=1, E=0, bonus +2 jeśli wig_id nie jest pusty

### 4. Fonts
Dodaj do `layout.tsx` lub `globals.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700&family=Space+Mono:wght@400;700&display=swap');
```

## CZEGO NIE ROBIĆ
- **NIE zmieniaj kolorów** — paleta jest zatwierdzona
- **NIE zmieniaj fontów** — DM Sans + Space Mono, bez zmian
- **NIE zmieniaj layoutu** — lista zadań po lewej, sidebar po prawej
- **NIE zmieniaj komponentów wizualnych** — TaskRow, StatPill, FilterChip, progress ring — zostają jak są
- **NIE dodawaj Tailwind** do tego komponentu — style inline zostają
- **NIE dodawaj "ulepszeń"** wizualnych — żadnych animacji, cieni, gradientów których nie ma w oryginale
- **NIE refaktoruj** struktury komponentu — jedyne zmiany to podmiana useState na Supabase calls

## STACK
- Next.js (App Router)
- Supabase (@supabase/supabase-js)
- Hosting: Vercel
- Baza: Supabase Postgres

## STRUKTURA PLIKÓW (docelowa)
```
src/
  app/
    weekly/
      page.tsx          ← nowa strona
    layout.tsx          ← dodaj font import
  components/
    WeeklyPlanner.jsx   ← ten komponent, BEZ ZMIAN WIZUALNYCH
  lib/
    supabase.ts         ← klient Supabase
```
