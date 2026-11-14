# Jan's Dashboard — Wizja 2029
## Specyfikacja rozwojowa dla Claude Code, wersja 1.3

Data: 2026-11-14  |  Status: wymagania biznesowe do implementacji; bez zmian produkcyjnych
Aplikacja: https://jan-dashboard.vercel.app/
Projekt strategiczny: „Moja strategia” / Visionary OS

> Zasada: zachowuj historię tej specyfikacji w repozytorium. Każda kolejna sesja może dopisać nowy punkt do changelogu i zmodyfikować wymagania. Nie zakładaj, że ten plik automatycznie aktualizuje wdrożoną aplikację. Przed kodowaniem zinwentaryzuj repozytorium, auth i bazę danych.

## 1. Wizja produktu
Jan's Dashboard to osobisty system realizacji wizji na 50. urodziny, 4 sierpnia 2029 r. Ma jednoczyć:
- osobiste cele zdrowotne, edukacyjne, rodzinne i strategiczne;
- dochód netto prywatnie dostępny, niezależność finansową i wydatki;
- planowanie czasu, pracę operacyjną i tworzenie strategii;
- zbieranie wniosków z rozmów w projekcie „Moja strategia” i przenoszenie zatwierdzonych decyzji do systemu; bez osobnego modułu nagrań głosowych;
- scenariusze przyszłości, a nie tylko odhaczanie nawyków.

Preferowana etykieta głównego filaru: **„Wizja 2029”** zamiast **„Praca”**. Dotychczasowe funkcje planowania dnia i tygodnia zachować, ale osadzić w Weekly Planner; nie usuwać danych historycznych.

## 2. Finansowe mierniki i definicje
### 2.1 Cele
- Główny: 600 000 PLN rocznie **po wszystkich podatkach, realnie do prywatnej dyspozycji** do 2029-08-04; odpowiednik 50 000 PLN/mies.
- Fundamentalny miernik bezpieczeństwa: **20 000 PLN/mies. netto z dochodu niezależnego od bieżącej pracy właściciela**; 240 000 PLN/rok. Jest to część 50 000 PLN, nie kwota dodatkowa.
- Jakość czasu: poza sezonem gospodarstwa 2–3 dni pracy operacyjnej tygodniowo. W sezonie praca może być intensywna.

### 2.2 Potwierdzony przez użytkownika obecny poziom (deklaracja rzeczywistego dochodu netto)
- spółka: 10 000 PLN/mies.;
- najem nieruchomości A (dom): 5 000 PLN/mies.;
- najem nieruchomości B: 3 000 PLN/mies.;
- plantacja malin: 30 000 PLN/mies.;
- suma: **48 000 PLN/mies.**, nominalna annualizacja **576 000 PLN/rok**.

WAŻNE: kwoty miesięczne zostały zaakceptowane przez użytkownika jako realne dostępne netto. Jednak suma rzeczywiście zaksięgowanych wpływów za ostatnie 12 miesięcy (TTM) nie została niezależnie zrekoncyliowana; nie wyświetlać 576 000 jako udokumentowane TTM. Rozdzielaj KPI `declared_monthly_net` i `verified_ttm_net`.

Dochód z akcji i spółki Plainconstruction pominięty w obecnej bazie, dopóki nie poznamy wysokości i powtarzalności. Jednorazowego odzyskania kapitału/pożyczki nie liczyć do dochodu powtarzalnego.

### 2.3 Scenariusz ryzyka najmu
- Najem domu za około 5 000 PLN/mies. ma być traktowany jako realny przez około pięć lat od listopada 2026 r., a następnie może ustać — **nie wcześniej** według obecnego założenia.
- Scenariusz referencyjny: około listopada 2031 r. (termin orientacyjny; użytkownik nie zadeklarował daty transakcji).
- Przed utratą: 48 000 PLN/mies. łącznego dochodu, 8 000 PLN/mies. bazowego najmu.
- Po utracie — przy pozostałych źródłach bez zmian: 43 000 PLN/mies. łącznego dochodu, 3 000 PLN/mies. bazowego najmu.
- Odstęp do dochodu bezpieczeństwa: obecnie 12 000 PLN/mies., po utracie najmu domu 17 000 PLN/mies., o ile nie powstaną inne pasywne źródła.
- Wymagany wariant scenariuszowy: sprzedaż/przekazanie domu i odzyskanie środków, gdzie zastosowanie — ale **nie zakładaj żadnej kwoty, własności ani mechanizmu** bez danych użytkownika.
- Nie podejmuj ponownie odkładanych spraw personalnych, terminów decyzji ani korporacyjnych bez odrębnej dyspozycji; jedynie obrazuj neutralne ryzyko strumienia dochodu.

### 2.4 Co uznajemy za niezależny/pasywny dochód
- Kwota po PIT/CIT oraz innych należnych podatkach, opłatach, kosztach operatora, kosztach utrzymania, rezerwie remontowej i spodziewanym pustostanie.
- Najem ujmowany według **realnego średniego cashflow**; odróżnij czynsz najemcy od wpływu dla właściciela.
- Obligacje: liczyć odsetki netto po podatku, oczekiwany harmonogram i ryzyko reinwestowania; odróżnić roczną średnią od rzeczywistego wpływu w danym miesiącu. Nie nazywać obligacji automatycznie bezryzykownymi; uwzględniać inflację i płynność.
- Aktywny dochód z zarządzania, nawet regularny, nie jest pasywny.
- Pozycje inwestycyjne o niepewnej realizacji nie zwiększają liczników bazowych, tylko scenariusze.

### 2.5 Kalkulator kapitału potrzebnego do 20 tys. zł netto miesięcznie
Wzór: required_capital = annual_target_net / assumed_sustainable_annual_net_yield; dla 240 000 PLN/rok.
Przykłady czysto modelowe:
- 3% netto: 8 000 000 PLN;
- 4% netto: 6 000 000 PLN;
- 5% netto: 4 800 000 PLN;
- 6% netto: 4 000 000 PLN.
Nie pokazywać tych procentów jako gwarantowanych stóp zwrotu ani jako bieżących ofert. Połączyć kalkulator z realnymi aktywami i ich indywidualnym yield.

## 3. Architektura ekranu „Wizja 2029”
Karty hero:
1. 600k: deklarowany netto annualizowany / zweryfikowany TTM, cel 600k; widoczne źródło, data aktualizacji, status weryfikacji.
2. Pasywne/niezależne netto: aktualne 8k/mies. z najmu (wartość deklarowana), cel 20k; luka 12k.
3. Koszty prywatne: ostatni zamknięty miesiąc, średnia 3m i 12m (początkowo brak danych, nie zero).
4. Cashflow wolny: dochód prywatny pomniejszony o koszty życia oraz osobno inwestycje/transfery; nie sumować dwukrotnie.
5. Wolność czasu: liczba dni operacyjnych poza sezonem (cel 2–3) i udział pracy strategicznej.
6. Koncentracja ryzyka: udział plantacji w dochodzie (obecnie 62,5% w przyjętej bazie).

Dolne sekcje: strumienie dochodu, mapa aktywów, rejestr decyzji, scenariusz 2029/2031, najbliższe kroki. Nie tworzyć backlogu głosowego.

Zachowaj historię aktualizacji i pochodzenie danych (`user_declared`, `bank_import`, `document_verified`, `model_assumption`), walidację i stempel daty. Nie mieszaj metryk realizacji celów z bieżącymi saldami bankowymi.

## 4. Budżet i kategoryzacja danych bankowych
### 4.1 Stan obecny aplikacji — zaobserwowany publicznie
Istnieje `/finanse` z napisem „Import z Santandera · Kategoryzacja · Eksport do Budget” i możliwością wskazania CSV. Nie nadpisuj modułu w ciemno. Najpierw zidentyfikuj parser i obecny schemat danych oraz znaczenie „Budget”.

### 4.2 Workflow docelowy
- Użytkownik eksportuje CSV/XLSX z banku co 14–21 dni (na początek Santander, docelowo wiele kont).
- Parser wykrywa format źródła, okres, walutę, datę operacji i księgowania, kontrahenta/opis, kwotę ze znakiem, identyfikator źródła.
- Import idempotentny: powtórny import identycznych operacji nie dubluje wydatków. Preferowany identyfikator bankowy; fallback kombinacja rachunek + data + kwota + tytuł + kolejność, z ostrożnym obchodzeniem się z prawdziwie identycznymi transakcjami.
- Użytkownik ma podgląd przed zatwierdzeniem: liczba nowych pozycji, duplikatów, transakcji nierozpoznanych.
- Reguły kategoryzacji deterministyczne i edytowalne (merchant keywords, rachunek, typ transakcji), klasyfikacja AI tylko z potwierdzeniem przy niskiej pewności.
- 10 kategorii nadrzędnych: nieruchomości i utrzymanie; żywność/restauracje; transport i samochody; dzieci/rodzina; zdrowie/sport; podróże; zakupy/styl życia; subskrypcje/usługi; podatki/zobowiązania; transfery/inwestycje.
- Dodatkowo tagi `business_or_private`, `one_off`, `needs_review`, `reimbursed`, `asset_purchase`, `internal_transfer`.
- Zewnętrzne przepływy działalności/plantacji oddzielić od prywatnych. Refundacje i anulacje wiązać z pierwotnymi operacjami.
- Spłata kredytu: rozdzielić odsetki (koszt) oraz spłatę kapitału (przepływ, nie koszt konsumpcji). Zakup aktywa nie jest kosztem życia.
- Sumy miesięczne, 3m rolling, 12m rolling; średnia/mediana; wydatki niecykliczne; alarmy odchylenia od planu; stan miesiąca `open/closed`.
- Eksport agregatów do Dashboardu i raportu CSV/JSON; możliwość ręcznej korekty i audyt zmian.

### 4.3 Bezpieczeństwo
- Żadnych haseł bankowych w plikach projektu i w repozytorium.
- Pseudonimizacja nazw kont, brak pełnych rachunków i danych wrażliwych, maskowanie przy imporcie.
- Założenie privacy-first: wrażliwe transakcje przechowywać prywatnie, ograniczyć logi, szyfrować dane at rest/in transit, minimalizować telemetrię i dostęp; role auth i oddzielenie danych per-user.
- Nie wdrażać automatycznego przekazywania danych bankowych do usług trzecich bez świadomej decyzji użytkownika.

## 5. Integracje i praca głosowa
- ChatGPT: projekt „Moja strategia” służy refleksji i decyzjom. Techniczny eksport ustaleń do systemu danych (CSV/JSON) lub API tylko jeśli uprawnienia i bezpieczeństwo to umożliwią.
- Miro: mapa wizji i scenariuszy, a nie druga księga finansowa.
- Dashboard: jedno źródło prawdy dla wskaźników i historii finansowej.
- **Anulowano backlog głosowy na życzenie właściciela.** Usunąć z nawigacji i produktu `/backlog` oraz UI połączenia Google Drive służący wyłącznie nagraniom, po uprzednim rozpoznaniu zależności i wykonaniu kopii zapasowej; nie usuwać danych historycznych bez odrębnej zgody. Pomysły omawiamy w ChatGPT, a zatwierdzone zadania mogą trafiać do Weekly Planner.
- Najpierw manualny import pliku/rezultatów, później API; żaden system nie powinien samodzielnie wysyłać wiadomości lub podejmować finansowych decyzji.

## 6. Problemy i pytania z pierwszego audytu publicznego
- `/praca` używa nazwy „Praca”, mierzy plan dnia i cele tygodniowe; proponowana zmiana nazwy z zachowaniem metryk w Weekly.
- `/finanse` istnieje; nie potwierdzono poprawności importu pliku, bo nie wysyłano żadnych danych.
- `/weekly` w pojedynczym wstępnym odczycie pokazał zakres „19 października – 25 października”, natomiast podczas późniejszego testu nawigacyjnego pokazał prawidłowy tydzień 9–15 listopada 2026. Najprawdopodobniej wpływa na to stan początkowy, filtr lub asynchroniczne ładowanie: zweryfikować stabilność i stan ładowania przed uznaniem za błąd.
- `/zdrowie` w odczycie pojawiają się „Dzień 2/123” i odniesienia do 19.10.2026; do weryfikacji mechanizm daty i dostęp użytkownika.
- `/rozwoj` tekst może wskazywać na ujemne wartości „do nadrobienia” i puste pola celu „książek do 31.12.2026”; sprawdzić walidację pustych celów.
- `/relacje` pokazuje „w przygotowaniu”; nie trzeba teraz przebudowywać.
- `/backlog` wymaga połączenia Google Drive, ale **właściciel zdecydował o wyłączeniu i usunięciu tego modułu z aplikacji**. Najpierw zbadać, czy zasoby/połączenie są używane również przez inne funkcje.
- **PILNE / P0 — prywatność:** test strony anonimowo potwierdził, że strona główna oraz sekcje `/finanse`, `/praca`, `/weekly`, `/zdrowie`, `/rozwoj`, `/relacje` i `/backlog` są dostępne bez logowania. Widoczne były cele i struktura finansów, ale nie potwierdzono ekspozycji konkretnych transakcji (historia listopadowa pusta). Przed importem danych bankowych należy wdrożyć skuteczne uwierzytelnianie i autoryzację po stronie serwera, albo pozostawić całą historię lokalnie na urządzeniu; dostęp do statycznej strony nie dowodzi sam w sobie luki w bazie danych. Nie wystawiać prywatnych danych na publicznych trasach, nawet jeśli UI ma ukryty przycisk.

## 7. Plan implementacji dla Claude Code
### P0 — audyt i bezpieczeństwo
1. W repozytorium znaleźć stack, routing, data stores, auth, API, import Santander, eksport Budget, Weekly Planner i stan celu.
2. Zmapować kontrakty API, model dostępu do danych i istniejące testy; nie uruchamiać migracji produkcyjnych.
3. Naprawić podstawowe problemy dat po odtworzeniu i testach, bez kasowania historii.
4. Przygotować diagram modelu danych i propozycję migracji wstecznie kompatybilnej.
5. **Priorytet bezpieczeństwa:** zablokować anonimowy odczyt danych personalnych i finansowych; zweryfikować, że kontrola dostępu działa także na API i endpointach. Wykonać test w trybie incognito przed umieszczeniem wyciągów bankowych.

### P1 — Wizja 2029 MVP
0. Wycofać z menu i routingu backlog głosowy, po upewnieniu się, że nie usunie innych integracji i bez kasowania danych.
1. Etykieta/nawigacja Praca -> Wizja 2029; bez usunięcia istniejących danych.
2. Karty KPI na podstawie zdefiniowanych liczb i statusów (brak danych różny od zera).
3. Osobny cel 20k niezależnego netto, w tym aktywa, czynsze, prognoza utraty 5k ok. 2031 r.
4. Scenariusze i kalkulator stopy netto do kapitału.
5. Testy jednostkowe agregacji, brak podwójnego liczenia i poprawność dat.

### P2 — prywatne wydatki
1. Rozbudowa istniejącego parsera `/finanse`, nie duplikacja.
2. Idempotentny import, podgląd, reguły kategoryzacji, korekty i eksport JSON/CSV.
3. Przekrojowe wykresy wydatków oraz miesięczne zamknięcia.

### P3 — automatyzacje i integracje
1. Zdefiniowane API import/export, opcjonalna synchronizacja zatwierdzonych KPI.
2. Nie rozwijać ani nie odtwarzać backlogu głosowego. Ewentualny eksport zatwierdzonych zadań bezpośrednio do Weekly Planner, po osobnej akceptacji.
3. Integracja Miro jako link/mapa strategiczna; bez duplikacji danych.

## 8. Testy akceptacyjne
- Celem jest 600k netto rocznie. 48k miesięcznie daje 576k *annualizowane*, ale pole zweryfikowane TTM pozostaje „Brak danych” bez rozliczeń.
- Cel bezpieczeństwa 20k, obecne niezależne 8k, luka 12k, odpowiednia wizualizacja.
- Po wyłączeniu domu: 3k niezależne, luka 17k, 43k całości przy niezmienionej reszcie.
- Import dwukrotnie identycznego pliku nie zmienia sumy kosztów drugą operacją.
- Transfer własny 5k pomiędzy bankami nie zwiększa kosztów życia.
- Zakup lokalu nie powiększa kosztów konsumpcji.
- Dzień bez danych pokazuje brak danych zgodnie z regułą konkretnej metryki, a nie wszędzie automatycznie 0.
- Routing `/praca` zachowuje kompatybilność (redirect/alias) po zmianie nazwy.
- Daty zgodne z Europe/Warsaw i poprawne dla starej i bieżącej perspektywy czasowej.

## 9. Do ustalenia z użytkownikiem
- Dokładny model finansowania/profil ryzyka 20k niezależnego dochodu.
- Dokładne wydatki prywatne po analizie pierwszego wyciągu (obecne ~40k to stary szacunek, nie przyjęty wynik).
- Gdzie istnieje repozytorium i jaki rodzaj bazy danych wykorzystuje aplikacja.
- Zachować istniejący kod i architekturę, bez nowej aplikacji; weryfikować zmiany przez gałęzie i pull requests.
- Czy dane finansowe mają być przechowywane w bazie czy importowane statycznie bez serwera.

## 10. Changelog
- 2026-11-14 v1.0: pierwszy audyt odczytowy witryny i wymagania Vision 2029, 20k dochodu niezależnego, budżetu i integracji z istniejącym importem Santander. Zmiany w kodzie: brak.
- 2026-11-14 v1.1: test nawigacyjny anonimowej sesji potwierdził dostęp bez logowania, poprawny bieżący tydzień po załadowaniu oraz krytyczny wymóg ochrony prywatnych danych; aktualizacja P0.

- 2026-11-14 v1.2: użytkownik zdecydował, że Jan's Dashboard jest aplikacją tylko dla niego; anulowano backlog głosowy i jego dalszy rozwój. Dodano rekomendowany workflow GitHub + Claude Code na wielu komputerach.

- 2026-11-14 v1.3: sesja bezpieczeństwa i porządków (Claude Code). Zmiany produkcyjne:
  - **Instalacja:** `scripts/setup-mac.sh` naprawiony (zawieszanie na `npx vercel`, globalny `vercel`, natywny instalator Claude Code, PATH dla bash i zsh, `node@22`); `allowScripts` w `package.json`.
  - **/weekly:** dostęp do danych przeniesiony z klienta anon na `/api/weekly/tasks` (service role, za middleware) — po RLS lista była pusta, a zapisy cicho się nie udawały. Usunięto `src/lib/supabase.ts`. Bez zmian w wyglądzie i punktacji.
  - **Keepalive:** `CRON_SECRET` ustawiony w Production (Sensitive); `/api/keepalive` 401 bez nagłówka, 200 z sekretem.
  - **Dostęp Claude do bazy:** MCP Supabase tylko do odczytu (`.mcp.json`), `scripts/db-query.mjs` (domyślnie READ ONLY), reguła w `CLAUDE.md` (SELECT samodzielnie; każda zmiana: SQL + kopia w `backups/` + „OK” Jana).
  - **Hasło bazy:** `DATABASE_POOLER_URL` miał nieaktualne hasło (Production/Preview/Development) — trasy przez pg (`/api/praca`, dawne `src/lib/db.ts`) i migracje przy buildzie nie łączyły się. Poprawione.
  - **Jedna ścieżka migracji:** build nie uruchamia migracji; `/api/migrate` zwraca 410; usunięto `src/lib/migrations.ts`, `src/lib/db.ts` i DDL wykonywane w runtime (`/api/goals`, `/api/rozwoj`, `/api/mfp`, `lib/finanse-db.ts`); jedyne źródło: `supabase/migrations/*.sql`, uruchamiane ręcznie `node --env-file=.env.local scripts/migrate.mjs` po „OK”. Z wszystkich migracji usunięto polityki „Allow all” (RLS włączone).
  - **Migracje wykonane (za zgodą):** 012–015 (backlog: `backlog_audio_processed`, `weekly_tasks.backlog_item_id`), 017 (`finance_subcategories` + `subcategory_id`), 021 (`finance_transactions.merchant`, `notes`). Stan: 20 tabel, wszystkie z RLS, 0 polityk; `_migrations` = 25. Dane bez zmian (weekly_tasks 35, finance_transactions 449).
  - **Usunięto** funkcję `run_migration(text, text)` (SECURITY DEFINER, wykonywała dowolny SQL; dostępna dla roli `authenticated`) oraz `supabase/bootstrap.sql`.
  - **/api/praca:** zamiast nieistniejącej `weekly_goals` (zastąpionej przez `weekly_tasks`) odpytuje `weekly_tasks`; bez zmian w UI.
  - Incydenty: dwa pushe z niekompletnym kodem — Vercel odrzucił oba deploye (Error), produkcja pozostała na poprzedniej wersji; poprawki wdrożone tego samego dnia.

  **Otwarte sprawy na następną sesję:**
  1. Supabase → Authentication → Sign In / Providers: sprawdzić „Allow new users to sign up”; aplikacja loguje przez NextAuth, więc rejestracja w Supabase Auth powinna być wyłączona.
  2. MCP Supabase: zatwierdzić serwer w `/mcp` i zalogować; potwierdzić listę tabel przez MCP.
  3. Keepalive: po 05:00 UTC 2026-11-15 sprawdzić w logach Vercel, że cron dostał 200 (wartości `CRON_SECRET` nie da się odczytać z Vercel).
  4. Test w UI na produkcji: `/weekly` (dodaj/odhacz/edytuj/usuń zadanie testowe, nawigacja tygodni) oraz `/rozwoj`, `/cele`, `/praca`, `/finanse` — potem kontrola logów Vercel.
  5. `/weekly`: błędy odhaczania i usuwania są ignorowane bez komunikatu (zachowane 1:1 — osobna decyzja).
  6. Wartości `weekly_tasks.project` w UI („Ovoc Malinovi”, „Plantacja”, „Zdrowie”…) nie zgadzają się ze stałymi w `CLAUDE.md` (`ovoc`/`plantacja`/`inne`) — ustalić, które są obowiązujące.
  7. `_migrations` zawiera `001_weekly_goals.sql`, choć tabela świadomie nie istnieje — oznaczyć migrację 001 jako przestarzałą, żeby nie myliła przy nowej bazie.
  8. `SUPABASE_ACCESS_TOKEN` (w `.env.example` opisany jako fallback `/api/migrate`) — sprawdzić, czy jest jeszcze używany; jeśli nie, usunąć z Vercel i unieważnić token.
  9. Next.js zgłasza, że konwencja `middleware` jest przestarzała (`proxy`) — zaplanować migrację.

## 11. Aplikacja jednoosobowa i organizacja pracy na kilku komputerach
- Aplikacja jest **wyłącznie prywatna**: jeden właściciel, bez kont rodzinnych, udostępniania paneli, multi-tenancy, uprawnień zespołowych czy funkcji SaaS. Jednocześnie wymaga realnego logowania i kontroli autoryzacji do prywatnych danych.
- Kod źródłowy należy trzymać w **prywatnym repozytorium GitHub** podłączonym do Vercel. Claude Code uruchamiany lokalnie na różnych komputerach działa na tym samym repozytorium, w osobnych klonach.
- Na każdym komputerze: `git clone <PRYWATNY_ADRES_REPO>`, `git pull --ff-only` przed pracą, po zmianach `git status`, testy, `git add` wybranych plików, `git commit`, `git push`. Preferować gałąź funkcjonalną i PR dla zmian wrażliwych. W razie konfliktów nie używać `git push --force` i nie nadpisywać zmian z innej maszyny.
- W repozytorium trzymać ten plik np. `docs/VISION_2029_SPEC.md` oraz `CLAUDE.md` z odsyłaczem do niego. Zawsze zlecać Claude Code odczyt specyfikacji i potwierdzenie aktualnego stanu repozytorium przed zmianami.
- **Ważne:** Git synchronizuje kod i specyfikację, **nie** prywatne transakcje, bazę danych, pliki `.env` czy sekrety. Produkcyjna baza danych powinna być zarządzana osobno, z backupami, a lokalna konfiguracja odtwarzana przez bezpieczny manager sekretów / ustawienia Vercel.
- Nie commitować: `.env*` (poza bezpiecznym `.env.example`), `.vercel`, `.next`, `node_modules`, bankowych CSV, tokenów, haseł, eksportów zawierających dane prywatne. Przed pierwszym `git push` przeprowadzić audyt historii i repozytorium pod kątem sekretów. Samo dodanie `.gitignore` nie usuwa sekretów z historii.
- Jeśli repozytorium już istnieje, użyć go, nie tworzyć drugiego. Najpierw sprawdzić `git remote -v`, GitHub i ustawienia projektu Vercel → Git; upewnić się, że środowisko produkcyjne jest podłączone do właściwej gałęzi.
- Wycofanie backlogu: najpierw usunięcie elementu menu i stanu nawigacji, ewentualnie przekierowanie `/backlog` → `/weekly`; fizyczne usunięcie danych/kluczy/plików wymaga analizy i osobnej decyzji.

## 12. Pierwsze zlecenie dla Claude Code
1. Odczytaj `docs/VISION_2029_SPEC.md` i zrób audyt bieżącej aplikacji bez wprowadzania zmian produkcyjnych.
2. Sprawdź Git remote, integrację Vercel, sposób przechowywania danych, auth i parser finansów.
3. Zidentyfikuj wszystkie zależności modułu Backlog głosowy i przygotuj plan jego wycofania bez utraty danych.
4. Zaproponuj wydzieloną gałąź i listę zmian P0/P1. Pokaż plan i poczekaj na zgodę przed migracjami bazodanowymi oraz wdrożeniem.
