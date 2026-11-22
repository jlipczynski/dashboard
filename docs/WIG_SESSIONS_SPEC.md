# Jan Dashboard — cotygodniowe sesje WIG
## Specyfikacja techniczna v0.1 (do zatwierdzenia, bez implementacji)

Data: 2026-11-22 · Baza: main @ 966cb05 · Źródła: AUDYT_WIG_2026-11-22.md, kod, schemat Supabase (odczyt).
Status: **zatwierdzony model A (22.11.2026)**. Wdrożenie: WIG Sessions 1.0 według `docs/JAN_DASHBOARD_WIG_SPEC_2026-11-22.md` (kod: `src/lib/wig-score.ts`, `src/lib/wig-db.ts`, migracja 033).

---

## 0. Podsumowanie w 10 punktach
1. Cztery obszary z wagami: **Rozwój osobisty i duchowy 30%**, **Zdrowie i fitness 30%**, **Praca 25%**, **Partnerstwo i relacje 15%**. Każdy ma własną sesję, WIG-i, LEAD-y, LAG-i i historię.
2. Tydzień = poniedziałek–niedziela (Europe/Warsaw, `src/lib/dates.ts`). Sesje w **niedzielę**: rozliczenie → ocena → wnioski → cele na kolejny tydzień.
3. Ocena tygodnia obszaru 1–6 wynika z **realizacji LEAD-ów** (% celu), z limitem 150% na tydzień i miarę.
4. **Wynik główny** = ważona średnia ocen obszarów z ostatnich **4 zamkniętych tygodni** (okno do zatwierdzenia).
5. **Kompensacja (propozycja A):** w oknie 4 tygodni realizacja jest sumowana per LEAD (Σ wykonanie z limitem 150% / Σ cel), więc nadwyżka jednego tygodnia pokrywa niedobór innego — tylko w tym samym LEAD-zie.
6. **LAG-i** pokazywane osobno (postęp do celu końcowego), nie wchodzą do wyniku głównego.
7. Każda wartość tygodnia jest **snapshotem** (cel i waga z chwili rozliczenia). Zmiany celów są wersjonowane, korekty po zamknięciu tworzą **nową rewizję z powodem**.
8. „Brak danych” ≠ 0. Tydzień nie zamyka się z nierozstrzygniętym brakiem bez decyzji (wpis, „0 potwierdzone” albo „usprawiedliwione”).
9. **ROCKS** = osobne priorytety kwartalne, ze statusem tygodniowym, poza wynikiem głównym.
10. Weekly Planner zostaje. Zadania mogą być powiązane z LEAD-em, ROCK-iem i obszarem; Praca liczy **wykonanie zobowiązań**, nie samo planowanie.

---

## 1. Stan obecny — co wykorzystujemy, czego nie

| Element | Stan (zweryfikowany) | Decyzja |
|---|---|---|
| `weekly_tasks` (35 wierszy, ostatnio 16.03.2026) | project = mieszanka projektów i obszarów; `wig_id` = dowolny tekst (+2 pkt); punkty A=4…E=0 | **Zostaje**. Dodajemy kolumny nullable (`area_key`, `wig_measure_id`, `rock_id`, `commitment_week`). Algorytm punktów bez zmian. |
| `src/components/WeeklyPlanner.jsx`, `/api/weekly/*` | działa, poprawki z 22.11 (daty, mobile, błędy) | Zostaje; dochodzi wybór obszaru/LEAD-a/ROCK-a w formularzu (etap 6). |
| `src/lib/dates.ts` | jedno źródło dat Warszawy i początku tygodnia | **Obowiązkowe** dla całego modułu WIG. |
| `rehab_entries` (% dziennie), `lib/rehab.ts` | działa, testy | Źródło LEAD „Rehabilitacja”. |
| Garmin (`/api/garmin`) | aktywności pobierane na żywo, typy „strength” rozpoznawane; **nic nie zapisuje** | Źródło LEAD „Siłownia” i „Aktywność” — przy rozliczeniu zapisujemy snapshot liczby/minut (bo API nie trzyma historii). |
| `nutrition_log`, `lib/calories.ts` | działa (WIG zdrowia 70/30) | Opcjonalny LEAD (decyzja D7). Obecny „WIG zdrowia” zostaje na /zdrowie. |
| `bookly_reports` (3 raporty okresowe), `lib/reading.ts` | minuty rozkładane na dni okresu | Źródło LEAD „Czytanie”; raport może przyjść po zamknięciu tygodnia → korekta = rewizja. |
| `book_readings`, `books` | strony w sesjach | Źródło pomocnicze czytania (decyzja D5). |
| `rozwoj_entries` (słuchanie, pisanie) | 25 wpisów, ostatnio 14.04 | Słuchanie/pisanie — decyzja D6 (włączyć jako „rozwój intelektualny” czy pominąć). |
| `fitness_goals` (1 wiersz JSON, nadpisywany) | brak historii | **Nie** używamy do celów WIG (cele WIG mają własne wersjonowane tabele). |
| `work_checkins` (0 wierszy) | plan dnia / przegląd | Poza wynikiem WIG (to planowanie). Strona /praca zostaje. |
| `finance_weekly_reviews` + `/finanse/przeglad` | jedyna działająca „sesja WIG”: kreator, zobowiązanie, rozliczenie tak/częściowo/nie | **Wzorzec** UX i API. Finanse nie są w 4 obszarach — zostają osobno (D9). |
| `finance_goal_history`, `finance_goals.valid_from` | wzorzec historii celu | Wzorzec wersjonowania. |
| `lib/scores.ts` (`calcAllScores`, wynik ogólny ze średniej 4 obszarów, Relacje = 0) | stary wynik | Zostaje bez zmian na stronie głównej do etapu 7; nowy wynik WIG obok, potem decyzja D10 o zastąpieniu. |
| Msza św., Nowy Testament, rachunek sumienia, ROCKS | **nie istnieją** | Do zbudowania. Quizy / powtórki angielskiego — w kodzie nie ma, nie dodajemy. |
| `backlog_items.is_wig` | moduł do wycofania | Nie używamy. |

---

## 2. Model pojęć

```
Obszar (4, waga) ─┬─ WIG (cel główny obszaru; LAG: „od X do Y do daty”)
                  │     └─ LAG(i) — miara wyniku, pokazywana osobno
                  ├─ LEAD(y) — miary działań tygodniowych; cel tygodniowy + waga w obszarze (wersjonowane)
                  ├─ Sesja tygodniowa (niedziela) — wpisy, ocena, wnioski, zobowiązania
                  └─ Zobowiązania na tydzień → (opcjonalnie) zadania w Weekly Planner
ROCK (kwartał) — osobny priorytet, status tygodniowy, poza wynikiem
```

Obszary (stałe klucze):

| key | nazwa | waga |
|---|---|---|
| `rozwoj` | Rozwój osobisty i duchowy | 0,30 |
| `zdrowie` | Zdrowie i fitness | 0,30 |
| `praca` | Praca | 0,25 |
| `relacje` | Partnerstwo i relacje | 0,15 |

Wagi są wersjonowane (`valid_from_week`) — zmiana nie przelicza przeszłych tygodni.

---

## 3. Algorytm (czysty moduł `src/lib/wig-score.ts`, `ALGORITHM_VERSION = "wig-1"`)

### 3.1 Realizacja LEAD-a w tygodniu
- `target` > 0, `actual` ≥ 0 (dla miar „im mniej tym lepiej” — D8 — realizacja = target/actual, analogicznie z limitem).
- `r = min(actual / target, 1,50)` — **maksymalnie 150%** zaliczane.
- Status danych: `measured` | `manual` | `zero_confirmed` (actual = 0, liczy się) | `excused` (tydzień wyłączony dla tego LEAD-a z powodem, np. choroba) | `missing` (brak decyzji).

### 3.2 Realizacja obszaru w tygodniu
`R = Σ(w_i · r_i) / Σ(w_i)` po LEAD-ach ze statusem ≠ `excused`/`missing`.
- Jeżeli łączna waga dostępnych LEAD-ów < 50% wagi obszaru → **ocena „brak danych”** (nie 1).
- Wagi `w_i` i cele = snapshot z wpisu (nie z bieżącej konfiguracji).

### 3.3 Skala 1–6 (granice jednoznaczne, liczone na wartości niezaokrąglonej)
| realizacja R | ocena |
|---|---|
| R < 50% | 1 |
| 50% ≤ R < 70% | 2 |
| 70% ≤ R < 85% | 3 |
| 85% ≤ R < 95% | 4 |
| 95% ≤ R ≤ 110% | 5 |
| R > 110% | 6 |

(„50–69%” rozumiane jako [50; 70) itd. Przykład: 69,9% → 2; 110,0% → 5; 110,1% → 6.)

### 3.4 Relacje (jakościowe)
Rachunek sumienia: ocena 1–6 bezpośrednio dla grup **Monika, dzieci, przyjaciele, pozostali** + tekst (co dobrze, co poprawić, intencja na tydzień).
Ocena obszaru = średnia ważona grup — **proponowane wagi do zatwierdzenia (D3): Monika 40%, dzieci 35%, przyjaciele 15%, pozostali 10%**. Grupa „nie dotyczy w tym tygodniu” = `excused`.
Opcjonalnie ilościowe LEAD-y pomocnicze (np. „wieczór we dwoje”) — tylko informacyjnie, nie zmieniają oceny (D4).

### 3.5 Wynik główny i kompensacja — propozycja A (rekomendowana)
Okno: **ostatnie N = 4 zamknięte tygodnie** (bieżący tydzień pokazywany osobno jako „w toku”).

Dla obszarów ilościowych (rozwój, zdrowie, praca), per LEAD w oknie:
```
R_lead_okno = Σ_t min(actual_t, 1,5·target_t) / Σ_t target_t      (tygodnie excused/missing pominięte)
R_obszar_okno = Σ w_i · R_lead_okno_i / Σ w_i                      (wagi: z najnowszego tygodnia w oknie)
Ocena_obszar_okno = skala(R_obszar_okno)
```
Relacje: `Ocena_okno = średnia ocen tygodniowych` (bez kompensacji ilościowej).

**Wynik główny** = `Σ waga_obszaru · Ocena_obszar_okno` (skala 1,00–6,00, dwa miejsca po przecinku). Obszar „brak danych” → wagi pozostałych renormalizowane + wyraźna flaga „wynik niepełny”.

Zasady kompensacji (jednoznaczne):
1. Nadwyżka kompensuje **tylko ten sam LEAD** (np. 5 treningów nie nadrabia braku Mszy).
2. Nadwyżka liczy się **maks. do 150%** tygodniowego celu.
3. Kompensacja działa **tylko w oknie N tygodni**, w obie strony czasu (wcześniejsza nadwyżka pokrywa późniejszy niedobór i odwrotnie); tydzień wypadający z okna zabiera swoją nadwyżkę.
4. **Oceny tygodniowe nie są zmieniane** — historia pokazuje surową ocenę każdego tygodnia; kompensacja dotyczy wyłącznie wyniku okna.
5. Tygodnie `excused` nie są ani kompensowane, ani nie kompensują.

Przykład (LEAD „Siłownia”, cel 3/tydz.): wykonanie 1, 4, 3, 5 →
oceny tygodniowe: 33%→**1**, 133%→**6**, 100%→**5**, 167%→150%→**6**;
okno: (1 + 4 + 3 + 4,5) / 12 = 104,2% → **5**.

Alternatywa B (do porównania): „bank nadwyżek” — nadwyżka ponad 100% (≤ 50 pp) odkładana i zużywana **tylko na przyszłe** niedobory, ważna 4 tygodnie, zużycie FIFO. Bardziej „sprawiedliwa w czasie”, ale trudniejsza do wyjaśnienia i audytu. **Rekomendacja: A.**

### 3.6 Testy algorytmu (wymagane przed UI)
Granice skali (49,99 / 50 / 69,99 / 70 / 84,99 / 85 / 94,99 / 95 / 110 / 110,01 / 150 / 200), limit 150%, excused/missing, < 50% wagi → brak danych, renormalizacja wag, przykład z 3.5, relacje z grupą excused, wersja algorytmu zapisana w wyniku.

---

## 4. Obszary — miary (propozycja startowa; cele ustawiane w sesji)

### Zdrowie i fitness (30%) — „elastyczne cele”
| LEAD | źródło | jednostka | uwagi |
|---|---|---|---|
| Rehabilitacja | `rehab_entries` (średni % dni tygodnia; `rehab.ts`) | % dni | aktywna tylko w okresie planu rehabilitacji |
| Siłownia | Garmin (typy strength) → snapshot przy rozliczeniu; korekta ręczna | treningi | |
| Aktywność | Garmin (minuty aktywności / kroki — D7) | min | |
| (opcja) Kalorie | `nutrition_log` / `calorieWeekScore` | % | D7 |

„Elastyczne cele” = w sesji ustawiasz cel na kolejny tydzień (nowa wersja celu od tego tygodnia) albo włączasz/wyłączasz LEAD (np. w fazie rehabilitacji siłownia = 0 → LEAD nieaktywny, nie `zero`).
LAG (przykłady, D2): waga ciała, zakres ruchu po rehabilitacji, VO2max (Garmin).

### Rozwój osobisty i duchowy (30%)
| LEAD | źródło | jednostka |
|---|---|---|
| Czytanie | Bookly (minuty rozkładane na dni, `reading.ts`) + ręcznie | min |
| Rozwój intelektualny | wpisy ręczne (kurs, wykład, nauka; D6: czy słuchanie audiobooków tu) | min |
| Msza św. | wpis ręczny (data) | razy |
| Nowy Testament | wpisy rozdziałów (księga + rozdziały) | rozdziały |

LAG „Nowy Testament do 31.12.2027”: 260 rozdziałów; postęp = przeczytane unikalne rozdziały / 260; **dynamiczny cel tygodniowy** = ⌈pozostałe / pozostałe tygodnie⌉ (przeliczany przy każdej sesji, zapisywany jako snapshot) — do zatwierdzenia albo stały plan (D5).
LAG czytania: książki w roku (`yearSummary`).
Bez quizów i powtórek angielskiego.

### Praca (25%) — realizacja, nie planowanie
| LEAD | źródło | definicja |
|---|---|---|
| Zobowiązania tygodnia | `weekly_tasks` oznaczone w sesji jako zobowiązanie (`commitment_week`) | actual = punkty wykonanych zobowiązań; target = punkty zobowiązań **zamrożone w niedzielę** |
| Kamienie milowe projektów / ROCKS | `wig_commitments` powiązane z ROCK-iem | wykonane / zaplanowane |

Zadania dodane w trakcie tygodnia nie zmieniają celu (nie da się „poprawić” wyniku dopisując łatwe zadania). Punkty A–E bez zmian (bez bonusu WIG w nowym liczeniu — bonus zostaje tylko w starym widoku plannera).
LAG: wynik projektów (D2), np. „OS Malinovi 1.0 wdrożony do …”.

### Partnerstwo i relacje (15%)
Rachunek sumienia (3.4). Pola: ocena 1–6 per grupa, „co było dobre”, „co zaniedbałem”, „intencja / konkret na tydzień”. Rozliczenie intencji w następnej sesji (tak / częściowo / nie — wzorzec z finansów).

---

## 5. Model danych (migracja addytywna, bez zmian istniejących tabel poza dodaniem kolumn nullable)

```sql
wig_areas            (key PK, name, sort_order)                                   -- 4 wiersze
wig_area_weights     (id, area_key, weight numeric, valid_from_week date, created_at, note)
wig_goals            (id, area_key, title, lag_unit, lag_from, lag_to, deadline, status, created_at)
wig_goal_versions    (id, goal_id, version, title, lag_from, lag_to, deadline, valid_from_week, reason, created_at)
wig_measures         (id, area_key, goal_id NULL, kind 'lead'|'lag', name, unit, source, direction, active, created_at)
wig_measure_targets  (id, measure_id, weekly_target numeric, weight numeric, valid_from_week, reason, created_at)
wig_logs             (id, measure_id, date, value numeric, payload jsonb, note, created_at, deleted_at)
                       -- wpisy ręczne: Msza, rozdziały NT {book,chapters[]}, minuty rozwoju
wig_weeks            (week_start PK date, status 'open'|'closed'|'reopened', closed_at, revision int)
wig_sessions         (id, week_start, area_key, started_at, completed_at, conclusions, next_focus,
                      UNIQUE(week_start, area_key))
wig_entries          (id, week_start, measure_id, revision int, actual numeric NULL, target_snapshot numeric,
                      weight_snapshot numeric, data_status, source_detail jsonb, reason, created_at,
                      UNIQUE(week_start, measure_id, revision))                     -- append-only
wig_relation_reviews (id, week_start, person_group, revision, rating smallint 1..6 NULL, excused bool,
                      went_well, to_improve, intention, created_at)
wig_area_results     (id, week_start, area_key, revision, realization numeric NULL, rating smallint NULL,
                      status 'ok'|'no_data'|'partial', algorithm_version, computed_at)  -- snapshot przy zamknięciu
wig_commitments      (id, week_start, area_key, text, measure_id NULL, rock_id NULL, weekly_task_id NULL,
                      outcome 'kept'|'partial'|'not' NULL, outcome_note, created_at)
rocks                (id, quarter text '2027-Q1', area_key NULL, title, done_definition, due_date,
                      status 'on_track'|'off_track'|'done'|'dropped', created_at)
rock_updates         (id, rock_id, week_start, status, progress_pct, note, created_at)

ALTER TABLE weekly_tasks ADD COLUMN area_key text NULL, wig_measure_id uuid NULL,
                         rock_id uuid NULL, commitment_week date NULL;   -- wszystkie nullable
```
Zasady:
- RLS włączone, 0 polityk (jak reszta), dostęp tylko przez API (service role, middleware).
- `wig_entries`, `wig_relation_reviews`, `wig_area_results` — **append-only**; bieżący stan = najwyższa rewizja (widok `wig_entries_current`).
- Daty tygodni zawsze poniedziałek (CHECK `extract(isodow from week_start) = 1`).
- `weekly_tasks.wig_id` zostaje nietknięte (stare dane: 1× „wig1”).

---

## 6. Cykl tygodnia, zamykanie i korekty

1. **Pon–sob**: wpisy ręczne (`wig_logs`), dane automatyczne liczone na żywo (podgląd „w toku”).
2. **Niedziela — sesja obszaru** (4 osobne, kolejność dowolna; kreator jak `/finanse/przeglad`):
   1. Rozliczenie zobowiązań z poprzedniej sesji (tak/częściowo/nie).
   2. Dane LEAD-ów: wartości automatyczne + ręczne; każdy `missing` wymaga decyzji (wpisz / 0 potwierdzone / usprawiedliwione z powodem).
   3. Podgląd realizacji i oceny 1–6 (z wyjaśnieniem: która miara ile dała).
   4. LAG-i (osobny panel, trend).
   5. Wnioski.
   6. Cele na kolejny tydzień: zmiana celów/wag LEAD-ów (nowa wersja od następnego tygodnia, wymagany powód), zobowiązania → opcjonalnie tworzenie zadań w Weekly Planner (obszar/LEAD/ROCK przypisane).
3. **Zamknięcie tygodnia**: gdy 4 sesje mają `completed_at` → przycisk „Zamknij tydzień” zapisuje `wig_area_results` (rewizja 1) i status `closed`. Można zamknąć z brakującym obszarem tylko świadomie (obszar = „brak danych”).
4. **Przypomnienie**: tydzień niezamknięty do środy → baner na stronie głównej. **Brak automatycznej oceny 1** za niezamknięty tydzień — tydzień „niezamknięty” jest poza oknem wyniku i oznaczony.
5. **Korekta po zamknięciu** (np. spóźniony raport Bookly): nowa rewizja wpisu z powodem → przeliczenie → nowa rewizja `wig_area_results`; widok historii pokazuje „było → jest, kiedy, dlaczego”. Wynik główny zawsze z najnowszych rewizji; raporty archiwalne mogą pokazać stan „na dzień”.

---

## 7. API (wszystkie za middleware; logika obliczeń tylko po stronie serwera, w `lib/wig-*.ts`)

| Metoda | Ścieżka | Cel |
|---|---|---|
| GET | `/api/wig/overview?weeks=4` | wynik główny, oceny obszarów w oknie, bieżący tydzień „w toku”, LAG-i, ROCKS |
| GET | `/api/wig/weeks/:week` | stan tygodnia: sesje, wpisy (bieżące rewizje), wyniki |
| GET | `/api/wig/weeks/:week/areas/:area/draft` | dane do sesji: miary, cele (snapshot), wartości automatyczne, poprzednie zobowiązania |
| POST | `/api/wig/weeks/:week/areas/:area/session` | zapis sesji (wpisy, oceny relacji, wnioski, zobowiązania) — idempotentny |
| POST | `/api/wig/weeks/:week/close` | zamknięcie tygodnia (snapshot wyników) |
| POST | `/api/wig/entries/:id/revise` | korekta po zamknięciu (wymagany `reason`) |
| GET/POST | `/api/wig/measures`, `/api/wig/measures/:id/targets` | konfiguracja miar i wersji celów |
| GET/POST | `/api/wig/logs` | wpisy ręczne (Msza, NT, rozwój) |
| GET/POST | `/api/wig/goals`, `/api/wig/goals/:id/versions` | WIG-i i historia zmian |
| GET/POST | `/api/wig/rocks`, `/api/wig/rocks/:id/updates` | ROCKS |
| GET | `/api/wig/history?area=&from=&to=` | historia ocen, wersji celów i korekt |

Adaptery źródeł (czyste funkcje + odczyt): `wig-sources/rehab.ts`, `garmin.ts` (zapis snapshotu przy sesji), `bookly.ts`, `weekly-tasks.ts`, `logs.ts`.

---

## 8. UI (bez zmian systemu wizualnego: białe tło / #FAFAF9, DM Sans + Space Mono, komponenty z `components/finanse/ui.tsx`)

- **/wig** — przegląd: wynik główny (1,00–6,00) + 4 karty obszarów (ocena okna, ocena ostatniego tygodnia, trend 8–12 tygodni), osobny panel LAG-ów, ROCKS kwartału, status tygodnia (otwarty / do zamknięcia / zamknięty).
- **/wig/sesja/[week]/[area]** — kreator 6 kroków (sekcja 6), mobile-first (≤ 390 px).
- **/wig/historia** — tabela tygodni × obszary, rewizje z powodami, wersje celów.
- **/wig/rocks** — lista kwartalna.
- Strona główna: nowy kafel „Wynik WIG” (etap 7); stare kafle bez zmian do decyzji D10.
- Weekly Planner: w formularzu zadania opcjonalne pola obszar / LEAD / ROCK; filtr „zobowiązania tygodnia”.

---

## 9. Plan wdrożenia (małe etapy, każdy z weryfikacją wg CLAUDE.md: SELECT przed, SELECT po z oczekiwanymi wartościami, test UI)

| Etap | Zakres | Weryfikacja |
|---|---|---|
| 0 | Decyzje D1–D10 (sekcja 10) | — |
| 1 | `lib/wig-score.ts` + testy jednostkowe (bez bazy, bez UI) | tabela przypadków z 3.6 |
| 2 | Migracja 033 (tabele z sekcji 5 + kolumny nullable w `weekly_tasks`), seed obszarów i wag | SQL + backup; SELECT: 4 obszary, suma wag = 1,00; `weekly_tasks` = 35 wierszy bez zmian |
| 3 | API konfiguracji (miary, cele, wersje) + seed miar startowych | SELECT wersji celów |
| 4 | Sesja **Relacje** (najprostsza, ręczna) + zamykanie tygodnia + historia rewizji | test UI na telefonie; SELECT `wig_relation_reviews`, `wig_area_results` |
| 5 | Wpisy ręczne (Msza, NT, rozwój) + sesja **Rozwój** (Bookly) | oczekiwane wartości z raportów Bookly |
| 6 | Sesja **Zdrowie** (rehab, Garmin snapshot) + sesja **Praca** (zobowiązania z Weekly Planner, pola w plannerze) | porównanie z /zdrowie i plannerem |
| 7 | /wig przegląd, wynik główny, kompensacja, LAG-i; kafel na stronie głównej | ręcznie przeliczony przykład 4 tygodni |
| 8 | ROCKS | — |
| 9 | Pierwsza prawdziwa niedziela → przegląd po 4 tygodniach (kalibracja progów/wag) | — |

Testy: vitest (algorytm, adaptery, API z mockiem), Playwright (desktop + 390 px + 320 px; zapisy przechwytywane), przy migracjach — test SQL na PGlite przed produkcją.

---

## 10. Decyzje do zatwierdzenia

| # | Pytanie | Propozycja |
|---|---|---|
| D1 | Model kompensacji | **A — zatwierdzone przez Jana 22.11.2026** (sumowanie w oknie per LEAD, limit 150%) |
| D2 | WIG-i i LAG-i startowe w każdym obszarze | do ustalenia w pierwszej sesji |
| D3 | Wagi grup w relacjach | Monika 40 / dzieci 35 / przyjaciele 15 / pozostali 10 |
| D4 | Ilościowe LEAD-y w relacjach | tylko informacyjnie |
| D5 | Nowy Testament: cel dynamiczny czy stały plan; liczenie rozdziałów vs dni | dynamiczny ⌈pozostałe/tygodnie⌉ |
| D6 | Słuchanie (audiobooki) i pisanie — część „rozwoju intelektualnego”? | słuchanie: tak; pisanie: decyzja |
| D7 | Zdrowie: kalorie jako LEAD? Aktywność: minuty czy kroki? | kalorie: nie (zostają na /zdrowie); aktywność: minuty |
| D8 | Miary „im mniej, tym lepiej” | na start brak |
| D9 | Finanse: osobna sesja jak dziś | tak, bez wpływu na wynik WIG |
| D10 | Czy nowy wynik WIG zastępuje stary wynik ogólny na stronie głównej | po 4 tygodniach równoległego działania |
| D11 | Okno wyniku głównego | 4 tygodnie |
| D12 | Czy można zamknąć tydzień bez wszystkich 4 sesji | tak, świadomie; obszar = „brak danych” |

---

## 11. Ryzyka
- Garmin nie przechowuje historii → bez snapshotu przy sesji przeszłe tygodnie są niepowtarzalne (snapshot obowiązkowy).
- Bookly przychodzi z opóźnieniem → korekty po zamknięciu będą częste (rewizje muszą być tanie i czytelne).
- „Gaming” Pracy przez małe plany → cel zamrożony w niedzielę + osobny wgląd w liczbę zobowiązań.
- Weekly Planner nieużywany od marca → bez nawyku niedzielnej sesji wynik będzie pusty; dlatego etap 4 (Relacje) jako szybki, ręczny start.
