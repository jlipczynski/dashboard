
# Instrukcje dla Claude Code — Panel Życia

## Zasady bezwzględne

### 1. Nigdy nie zgaduj — zawsze sprawdzaj kod

Przed każdą zmianą:
```bash
# Znajdź dokładny string w kodzie zamiast zgadywać
grep -r "strength" src/ --include="*.ts" --include="*.tsx"
grep -r "activityType" src/ --include="*.ts" --include="*.tsx"
```

Jeśli nie wiesz jak coś się nazywa w kodzie — **szukaj**, nie wymyślaj.

### 2. Loguj przed naprawą

Przy problemach z danymi z API (Garmin, Google Drive, Supabase) — najpierw dodaj `console.log` i sprawdź co faktycznie przychodzi:

```typescript
console.log('Garmin activity type:', activity.activityType, activity.type, activity)
```

Dopiero po zobaczeniu realnych danych — napraw.

### 3. Testuj po każdej zmianie

Po każdym wdrożeniu sprawdź w przeglądarce czy zmiana działa. Jeśli nie możesz sprawdzić — napisz wprost w podsumowaniu: "Nie zweryfikowano działania — sprawdź ręcznie: [co i gdzie sprawdzić]".

### 4. Nie ruszaj tego czego nie ma w briefie

Zmieniaj **tylko** pliki wymienione w briefie. Jeśli musisz zmienić coś innego — napisz o tym przed zmianą.

---

## Stack i architektura

- **Framework**: Next.js App Router (nie Pages Router)
- **Baza danych**: Supabase (Postgres)
- **Auth**: next-auth z Google Provider
- **Deploy**: Vercel
- **Zmienne env**: już ustawione na Vercel — nie nadpisuj

## Design system (NIENARUSZALNY)

- Tło: białe / `#FAFAF9`
- Czcionki: DM Sans + Space Mono
- Theme: light — bez dark mode
- **Żadnych zmian wizualnych** jeśli brief tego nie wymaga

---

## Supabase — zasady

- Server-side: używaj `SUPABASE_SERVICE_ROLE_KEY`
- Client-side: używaj `NEXT_PUBLIC_SUPABASE_URL`
- Przed dodaniem kolumny: `ADD COLUMN IF NOT EXISTS`
- Przed tworzeniem tabeli: `CREATE TABLE IF NOT EXISTS`

---

## Scoring kalorii (NIENARUSZALNE)

```
deficyt 0–300 kcal   → 7/10  ✅
deficyt 300–800 kcal → 10/10 👍
deficyt > 800 kcal   → 8/10  💪
nadwyżka 0–200       → 5/10  🟡
nadwyżka 200–500     → 3/10  🟠
nadwyżka > 500       → 1/10  🔴
```

Brak symbolu ⚠️ "za mało" — duży deficyt jest **dobry**, nie karany.

---

## Garmin — typy aktywności

```typescript
const ACTIVITY_TYPES = {
  running:  ['running', 'trail_running', 'treadmill_running', 'track_running'],
  cycling:  ['cycling', 'road_cycling', 'indoor_cycling', 'mountain_biking', 'virtual_ride'],
  strength: ['strength_training', 'fitness_equipment', 'strength', 'gym_and_fitness_equipment'],
}
```

Jeśli aktywność nie trafia do licznika — **sprawdź console.log** co faktycznie zwraca Garmin API i dodaj brakujący typ do listy.

---

## Czego nigdy nie ruszać

- Komponent Weekly Planner (`/weekly`)
- Globalny layout, navbar, sidebar
- Istniejące style i theme
- Tabela `weekly_tasks` (poza dodawaniem kolumn)
