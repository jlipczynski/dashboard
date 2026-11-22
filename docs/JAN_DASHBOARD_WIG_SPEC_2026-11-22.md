# JAN DASHBOARD — specyfikacja wdrożeniowa WIG Sessions v1.0
**Data decyzji:** 22.11.2026  
**Pierwszy tydzień planowania:** 23–29.11.2026 (Europe/Warsaw)  
**Wykonawca:** Claude Code, wyłącznie w istniejącym repozytorium Jan Dashboard  
**Odpowiedzialność ChatGPT:** strategia, KPI, specyfikacja i ocena wyników; bez samodzielnego kodowania aplikacji.

## 0. Zlecenie
Zaimplementuj w istniejącym `jan-dashboard.vercel.app` pełny, prosty mechanizm cotygodniowych sesji WIG, zachowując istniejący Weekly Planner, dane, działające moduły finansowe, import Erste, symulator wolności i wszystkie dotychczasowe funkcje. **Celem operacyjnym jest umożliwienie użytkownikowi jeszcze dziś utworzenia i zapisania planu na 23–29 listopada 2026 w samym dashboardzie.** Przed rozpoczęciem sprawdź repo i stan deployu. Wykonuj wdrożenie etapami, testuj, raportuj co faktycznie działa. Nie tworzyć osobnej aplikacji ani drugiego planera.

## 1. Model koncepcyjny
- Cztery stałe obszary, wagi wyniku głównego: **Rozwój osobisty i duchowy 30%, Zdrowie i fitness 30%, Praca 25%, Partnerstwo i relacje 15%**.
- **WIG** = najważniejszy cel długoterminowy dla obszaru; **LAG** = rezultat mierzony indywidualnie (odrębny widok, nie doliczany do wyniku wykonania); **LEAD** = mierzalne działanie pod kontrolą użytkownika; **ROCK** = kluczowy projekt/kamień milowy kwartalny, odrębny od tygodniowych LEAD-ów.
- **Cele miesięczne** wyznaczają kierunek i mają własny widok postępu; **tygodniowe LEAD-y** są jedynym automatycznie punktowanym składnikiem wyniku tygodnia dla obszarów liczbowych. Unikać podwójnego liczenia tej samej aktywności.
- Co tydzień użytkownik sam definiuje LEAD-y, mierniki, wartości docelowe, wagi (suma 100% w obszarze) i sposób pobierania danych. Mogą być inne w kolejnych tygodniach. Nie narzucać stałych aktywności ani sztywnych celów.
- Finansowa „Sesja WIG” przy `/finanse/przeglad` pozostaje i nie zostaje przeniesiona ani zduplikowana. Jej dane można jedynie podlinkować/wyświetlić kontekstowo w Pracy, bez drugiego naliczania wyniku.
- **Angielski (quizy i powtórki)** jest poza systemem ocen i planowania WIG.

## 2. Ocena tygodniowa i wynik główny
**LEAD-y ilościowe:**
- Realizacja LEAD-a = wykonanie / cel; do obliczeń maksymalnie **150%** na LEAD / tydzień. Zachować także rzeczywistą wartość (np. 200%) jako historię.
- Waga poszczególnych LEAD-ów w obszarze = 100%; wynik realizacji obszaru liczbowego = suma iloczynów ograniczonej realizacji LEAD-a i jego wagi.
- Skala prezentacji: poniżej 50% = **1**, 50–<70% = **2**, 70–<85% = **3**, 85–<95% = **4**, 95–110% włącznie = **5**, powyżej 110% = **6**. Nie zaokrąglać przed porównaniem progów.
- Oceny tygodniowe obszarów zapisuje się jako niezmienne migawki wraz z planem, wagami, dowodami, źródłami danych i datą zamknięcia. Korekta = nowa wersja z uzasadnieniem i zachowaniem poprzedniej.
- Wynik główny na stronie głównej: **jedna dominująca liczba w skali 1–6, z jednym miejscem po przecinku**, niżej 4 oceny obszarów i wejście do szczegółów. Nie mieszać z dziennym performance, finansowym LAG ani dawnym 0–100. Rzeczywiste LAG-i w widoku szczegółowym.
- **Okno wyniku = ostatnie 4 zakończone tygodnie**. Nadwyżki kompensują braki tylko w tym samym porównywalnym LEAD-zie (model A z raportu Claude); tygodniowych zapisanych ocen nie nadpisujemy. W LEAD-ach, których definicja/jednostka lub charakter się zmienia, **nie przenosić kompensacji automatycznie**. Wtedy obliczać wyłącznie ze zgodnych okresów, z oznaczeniem niepełnego pokrycia. Ustalanie nowego LEAD-a nie powinno wstecz tworzyć celów. Używaj stabilnego identyfikatora LEAD-a.
- Ponieważ wynik szkolny jest nieliniową funkcją wykonania, **nie uśredniać samych ocen 1–6 w celu wyliczenia wyniku z LEAD-ów liczbowych**: najpierw policz realizację w oknie 4 tygodni, następnie zamień na ocenę. Należy formalnie opisać i przetestować agregację przy zmieniających się co tydzień wagach i zestawach LEAD-ów. Priorytetem jest porównywalność i transparentność. Jeśli nie da się obliczyć prawidłowego wyniku, pokazać 'brak danych', nie fikcyjne zero.
- **Relacje**: cztery jakościowe oceny 1–6 po refleksji: Monika 40%, Dzieci 35%, Przyjaciele 15%, Pozostali 10% (wagi wewnętrzne, edytowalne w przyszłości). Wynik tygodniowy = ważona średnia ocen subobszarów, bez sztucznego przerabiania refleksji na procent LEAD. W oknie 4 tygodni: uśrednianie z większą wagą nowszych tygodni, np. 10/20/30/40 od najstarszego do najnowszego; metodę zapisać i pokazać użytkownikowi. **Nie przenosić nadwyżek i nie kompensować jakościowej oceny relacji tak jak treningów.** To samoocena działań i refleksja, nie pomiar wartości człowieka ani ocena partnerki/dzieci.
- **Brak danych ≠ 0**. Umożliwić potwierdzenie zera, uzupełnienie wpisu albo oznaczenie usprawiedliwionego braku; nie zamykać sesji, jeśli istotne braki pozostały nierozstrzygnięte. Nie wyłączać po cichu brakujących obszarów z mianownika i nie pokazywać pełnej oceny głównej, jeśli pokrycie danych nie wystarcza. Wyświetlać status/zakres danych.
- **Pierwsze 4 tygodnie**: pokazywać wynik prowizoryczny z dostępnych zamkniętych tygodni z wyraźnym oznaczeniem `1/4`, `2/4` itd.; nie sugerować, że to pełny wynik 4-tygodniowy.

## 3. Sesje niedzielne WIG
Kreator krok po kroku, oparty na istniejącej finansowej sesji WIG:
1. **Review**: cele poprzedniego tygodnia (zamrożony plan), dane automatyczne i ręczne, rozstrzygnięcie braków, rzeczywiste wykonanie, ocena 1–6.
2. **Refleksja**: co działało, co nie działało, jedna korekta na następny tydzień. W Relacjach osobna, jakościowa refleksja w 4 podobszarach, możliwość zapisania faktów, interpretacji, zastrzeżeń i zobowiązania.
3. **Plan**: cele na nadchodzący tydzień, LEAD-y, wartości, wagi, źródła; link do WIG, opcjonalnie ROCK, i miesiąca.
4. **Potwierdzenie**: przegląd planu i zapis/migawka. Tydzień odniesienia liczyć od poniedziałku do niedzieli w Europe/Warsaw.
- Niedziela jest sugerowanym terminem sesji, ale umożliwić późniejsze zamknięcie zaległego tygodnia z historią dat i rewizji.
- Zapisywanie po każdym kroku / autosave szkicu; jasny stan `robocza`, `zamknięta`, `skorygowana`.
- Możliwość wejścia do sesji z **ekranu głównego**, **sekcji obszaru** i **Weekly Plannera** — jedno i to samo źródło danych, bez kopii sesji.
- Rozdzielić WIG, LEAD, LAG i zwykłe zadanie. Obecny bonus `+2` za tekst WIG w zadaniu może zostać w legacy scoring, ale NIE może wpływać na nowy wynik 1–6.

## 4. Zdrowie i fitness — elastyczne źródła i zasady
- LEAD-y wybierane przez użytkownika co tydzień: **kalorie**, rehabilitacja, siłownia, rower, bieganie, spacer/aktywność, fizjoterapia, inne własne. Żaden LEAD nie jest obowiązkowy co tydzień.
- **Kalorie mają być dostępnym cotygodniowym LEAD-em**, jeśli użytkownik go wybierze, z własnym celem i wagą. Dla limitu kalorii nie używać naiwnie `wykonanie / cel` (większe spożycie nie może polepszać wyniku). Zdefiniować jawny kierunek miary (minimum, maksimum, zakres, liczba sesji), zasady braku logowania i bilans tygodniowy. Wykorzystać istniejącą logikę `/zdrowie` tam, gdzie pasuje; nie zmieniać jej bez analizy.
- Rehabilitacja z `rehab_entries`, siłownia/rower/aktywność z Garmin, jeśli źródło rzeczywiście jest dostępne i poprawne; podczas zamknięcia tygodnia zapisać migawkę z datą, liczbą i źródłem. Dopuścić ręczną korektę z uzasadnieniem. Nie twierdzić, że import działa, dopóki nie jest przetestowany.
- **Miesięczne cele** (np. 12 siłowni) to raport postępu, a nie drugi składnik oceny. Tygodniowe cele można dopasowywać do stanu zdrowia i zaleceń, bez wymuszania nadmiernej aktywności.

## 5. Rozwój osobisty i duchowy
- Jeden obszar, z celami z obu dziedzin: czytanie, audiobooki, pisanie (opcjonalnie), edukacja, Msza św., Nowy Testament.
- **Msza św.**: prosty, ręczny wpis uczestnictwa i wybieralny cel tygodniowy; nie wyciągać ocen duchowości z danych automatycznie.
- **Nowy Testament: ukończenie czytania do 31.12.2027**, LAG = postęp w przeczytaniu NT (jednostka np. rozdziały / rozdziały ogółem zgodnie z wybraną przez użytkownika edycją), LEAD tygodniowy = plan rozdziałów lub minut czytania. Użytkownik sam zatwierdza plan; nie narzucać automatycznie rosnącego nadganiania.
- Bookly: wykorzystać istniejące dane o czytaniu, bez podwójnego naliczania tego samego czasu. Audiobooki można wybrać jako odrębny LEAD. Pisanie tylko przy celu wybranym przez użytkownika.
- Quizy i powtórki angielskiego: **wyłączone**.

## 6. Praca
- Wynik nie może nagradzać samego `zaplanowałem dzień`; mierzyć rzeczywiste wykonanie istotnych zobowiązań.
- Przy zamykaniu sesji niedzielnej zamrozić pulę zobowiązań tygodnia i ich wagę. Nowe zadania dodane w środku tygodnia są dozwolone w planerze, ale nie mogą automatycznie zwiększać ani obniżać zamrożonego mianownika oceny; rewizja planu tylko jawnie, z uzasadnieniem.
- Używać istniejącego Weekly Plannera i priorytetów A–E, linkować zadania do odpowiedniego obszaru/LEAD/ROCK. Projekty (plantacja, Ovoc itd.) nie są obszarami życia.
- ROCKS: rejestr kwartalny, właściciel, kamień milowy, status, powiązanie z WIG i tygodniowymi zadaniami.

## 7. Partnerstwo i relacje
- Cotygodniowy **rachunek sumienia**, nie mechaniczna punktacja spotkań.
- Podobszary: **Monika, Dzieci, Przyjaciele, Pozostali**.
- Dla każdego: `co zrobiłem dobrze`, `co zrobiłem źle / co mogłem poprawić`, `jaki wpływ to mogło mieć`, `co zrobię inaczej`, samoocena 1–6. Zapis ograniczony dostępem jak prywatne dane użytkownika; nie udostępniać innym domyślnie.
- AI może w przyszłości wspierać refleksję pytaniami, lecz nie wystawiać lub zapisywać ocen autonomicznie. W wersji 1 wystarczy formularz i historia. Nie tworzyć teraz czterech osobnych agentów.

## 8. Architektura i dane
- Rozbuduj istniejące repo i bazę **addytywnie**: tabele / kolumny na WIG, LAG, LEAD, cele miesięczne, sesje, wyniki, dowody, migawki oraz wersje. Zachować stare tabele i historię.
- `weekly_tasks`: opcjonalne FK/identyfikatory dla obszaru, LEAD, ROCK, zobowiązania. Poprawić niespójność `pillar` vs `project` opisaną w audycie. Migracje z testami kompatybilności.
- Oddziel logikę liczenia (deterministyczną, wersjonowaną) od integracji i od interfejsu. Nie używać AI do arytmetyki ani jako źródła prawdy.
- Właściwa strefa: `Europe/Warsaw`; wspólny moduł dat dodany w commit `966cb05`.
- Ochrona sesji Google i danych — nie ujawniać sesji, tokenów czy treści refleksji.
- Rozważ dostępność integracji i brak danych. Źródło automatyczne nie może zastępować możliwości korekty ręcznej i zatwierdzenia przez użytkownika.

## 9. UI — minimalistyczny, istniejący design
- Główna strona: **jedna duża centralna ocena /6**, krótki trend, **4 klikalne obszary z oceną**. Reszta dopiero po wejściu w obszar. Bez przeładowania ekranów.
- Widok obszaru: WIG i LAG (kontekst), cel miesięczny, lista tygodniowych LEAD-ów z wykonaniem, przycisk `Sesja WIG`, historia ocen i wniosków. Jeden wyraźny przycisk `Zaplanuj tydzień`.
- Pierwsze użycie: nie zmuszać do konfiguracji wszystkich WIG/LAG przed wpisaniem LEAD-ów. **Możliwość stworzenia od razu planu na 23–29.11.2026**.
- Na telefonie 320–390 px bez poziomego przewijania, ergonomiczne pola, zgodność z istniejącą nawigacją.
- Historyczne oceny i zmiany transparentne; brak danych widoczny i zrozumiały.

## 10. Warunek użyteczności — plan 23–29 listopada 2026
Po wdrożeniu uruchom prawdziwy ekran planowania tego tygodnia, z łatwymi do edycji **propozycjami**, a nie samodzielnie zatwierdzonymi celami:
- **Zdrowie:** rehabilitacja, siłownia, kalorie i ewentualnie inne aktywności — użytkownik ustala liczbę, limit, wagę. Nie wpisuj biegania bez potwierdzenia.
- **Rozwój:** czytanie, Msza św., Nowy Testament (i ewentualnie audiobooki) — wartości i wagi do zatwierdzenia; żadnego angielskiego.
- **Praca:** 1–3 konkretne, mierzalne zobowiązania tygodniowe z projektów, wybierane przez użytkownika; nie traktuj samych analiz jako wykonania decyzji.
- **Relacje:** 4 podobszary + jedna zamierzona poprawa / działanie w każdym (opcjonalnie); niedzielna ocena jakościowa.
Po zatwierdzeniu zapis ma być widoczny w Weekly Plannerze i na ekranach obszarów. Nie twórz żadnych fikcyjnych danych wykonania ani retrospektywnych ocen.

## 11. Testy i definicja ukończenia
- Testy jednostkowe: progi 49,99/50/69,99/70/84,99/85/94,99/95/110/110,01; limit 150%; odwrotne miary kalorii; 4-tygodniowe okno, kompensacja tylko porównywalnych LEAD-ów; zmiana celu/wagi; brak danych; wersjonowanie korekt; strefy czasu i przejścia DST.
- Testy integracyjne: migracje bez utraty danych, relacja weekly_tasks–WIG, zamrożone cele, odczyty i sesje bez konfliktu z finansami.
- Playwright: pełny przepływ plan → zapis → wykonanie → niedzielna sesja → korekta → historia; desktop i 390/360/320 px, bez poziomego przewijania. Jeśli WebKit nie zainstalowany, jawnie raportuj brak testu Safari.
- Istniejące testy muszą nadal przejść. Nie ruszać importu Erste, alertów, symulatora wolności, innych funkcji finansów.
- Po wdrożeniu i pomyślnych testach: potwierdź commit, deploy Ready, działający link oraz **konkretnie jak Jan w aplikacji ma zaplanować 23–29.11.2026**.
- Jeżeli istnieją otwarte decyzje algorytmiczne (np. agregacja LEAD-ów przy skrajnie zmiennych planach), dokumentuj je i przedstaw **przed** wdrożeniem nieodwracalnych zmian; nie wymyślaj samodzielnie norm biznesowych.

## 12. Kolejność prac
1. Potwierdź stan repo po commit `966cb05` i zestaw z dokumentem audytu `AUDYT_WIG_2026-11-22.md` i istniejącym `WIG_SESSIONS_SPEC.md`.
2. Dopracuj deterministyczne zasady liczenia i testy.
3. Migracje addytywne / API sesji i planów.
4. Minimalny kreator tygodniowych LEAD-ów działający dla wszystkich czterech obszarów.
5. Zamykanie tygodnia, historia, oceny i refleksja relacyjna.
6. Strona główna z oceną 1–6, oceny obszarów i szczegóły.
7. ROCKS i integracje źródeł danych tam, gdzie zweryfikowane.
8. Testy regresyjne, Playwright, build, deploy i weryfikacja produkcyjna.

**Nie rozbudowuj zadania o autonomicznych agentów AI.** Wspólny moduł WIG + ewentualne cztery profile pytań na późniejszym etapie są wystarczające.
