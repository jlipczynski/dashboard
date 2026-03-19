# CLAUDE.md — Reguły dla Claude Code (jan-dashboard)

## ⚠️ ZASADY NIEPRZEKRACZALNE

Naruszenie którejkolwiek z poniższych zasad jest niedopuszczalne,
nawet jeśli wydaje się szybsze lub wygodniejsze.

---

## 1. Zawsze najpierw zrozum architekturę

Przed napisaniem jednej linii kodu:
- Przeczytaj cały plik który modyfikujesz (nie tylko fragment)
- Zrób `grep` żeby znaleźć wszystkie miejsca używające danej zmiennej/funkcji
- Sprawdź schemat tabeli Supabase zanim zakładasz kształt danych

```bash
# Przykład — zanim zmodyfikujesz logikę current_page:
grep -r "current_page" src/ --include="*.ts" --include="*.tsx"
```

---

## 2. Nigdy nie zgaduj wartości — zawsze sprawdzaj

❌ ZAKAZ: "zakładam że pole nazywa się X"
✅ WYMAGANE: `grep -r "nazwa_pola" src/` i weryfikacja w schemacie SQL

Dotyczy szczególnie:
- Nazw kolumn w Supabase
- Statusów i enumów (np. pillar values, projekt values)
- Kształtu obiektów zwracanych przez API

---

## 3. Console.log przed fixowaniem błędów API

Zanim napiszesz fix dla błędu w API route:
1. Dodaj `console.log` logujący rzeczywiste dane które przychodzą
2. Sprawdź logi w Vercel Dashboard
3. Dopiero wtedy pisz fix

❌ ZAKAZ: naprawiania błędu API bez zobaczenia co faktycznie zwraca

---

## 4. Weryfikacja w Supabase po każdym deploymencie

Po każdej zmianie dotykającej bazy danych — obowiązkowo:
```sql
-- Sprawdź czy dane wyglądają jak oczekujesz
SELECT * FROM [tabela] ORDER BY created_at DESC LIMIT 10;
```

Nie uważaj zadania za skończone bez weryfikacji w Supabase.

---

## 5. Zakaz modyfikowania plików poza scope briefu

Brief definiuje dokładnie które pliki wolno zmienić.
Jeśli coś "przy okazji" wydaje się do naprawienia — STOP. Zgłoś to w PR opisie.

❌ ZAKAZ: "przy okazji poprawiłem też X"
✅ WYMAGANE: osobny brief na każdy problem

---

## 6. Małe kroki, każdy weryfikowalny

Nie implementuj wszystkiego naraz. Jeśli brief ma 3 etapy — deploy po każdym etapie
i zweryfikuj że poprzedni działa.

---

## 7. Branching i deployment

```bash
# Branch naming:
git checkout -b claude/{feature}-{SESSION_ID}

# Deploy po implementacji:
vercel --prod
```

---

## Krytyczne stałe (⚠️ NIENARUSZALNE)

### Filary (pillar)
Wartości w bazie danych (weekly_tasks.pillar):
- `Zdrowie i Fitness`
- `Rozwój Osobisty`
- `Relacje i Partnerstwo`
- `Praca`
- `Duchowość`

### Projekty (project)
- `ovoc` / `plantacja` / `inne`

### Priorytety (priority/category)
- `A` / `B` / `C` / `D` / `E`

### Status backlog
- `backlog` / `this_week` / `done` / `archived`

### Status books
- `reading` / `finished`

### Area w rozwoj_entries
- `czytanie` / `sluchanie`

---

## Architektura books (moduł czytania)

### Zasada: `current_page` = `page_to` z NAJNOWSZEGO wpisu book_readings

```
books.current_page = pozycja w książce (NIE suma stron)
book_readings.pages_read = ile stron w tej sesji
book_readings.page_from / page_to = zakres stron w tej sesji
```

Po każdej operacji na book_readings (insert/update/delete):
```ts
// POPRAWNE obliczenie current_page:
const { data: latestReading } = await supabase
  .from("book_readings")
  .select("page_to")
  .eq("book_id", bookId)
  .order("date", { ascending: false })
  .order("created_at", { ascending: false })
  .limit(1)
  .single();
const newCurrentPage = latestReading?.page_to ?? 0;

// BŁĘDNE (nigdy nie rób):
// const totalRead = allReadings.reduce((sum, r) => sum + r.pages_read, 0)
// → to jest suma, nie pozycja
```

---

## Zmienne środowiskowe

Wszystkie zmienne są ustawione na Vercel. Nie opisuj ich w briefach.
Używaj:
- `SUPABASE_SERVICE_ROLE_KEY` — server-side (API routes)
- `NEXT_PUBLIC_SUPABASE_URL` — client-side

---

## Design System (NIE RUSZAĆ)

- Tło: białe / `#FAFAF9`
- Czcionki: DM Sans + Space Mono
- Theme: light (bez dark mode)
- Zakaz zmian wizualnych poza plikami w scope briefu
