# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Was das ist

**Essensplaner** – eine PWA (vanilla HTML/CSS/JavaScript, kein Framework, kein Build-Tool) für persönliche Mahlzeitenplanung: zielbasierter Auto-Plan (Protein-/Kalorienziele inkl. Bedarfsrechner), eigene Rezepte mit automatischer Nährwert-Schätzung, Meal Prep, Einkaufsliste (CH/DE-Preisvergleich), Vorrat, Entdecken (Spoonacular) und Fahrkostenrechner. Backend ist Supabase (Auth + Postgres mit RLS); Hosting ist GitHub Pages (`LeFortix/essensplaner`).

## Befehle

Es gibt **kein Build-System, keinen Linter, keine Test-Suite**. Die App ist statisch.

- **Lokal testen:** Aus dem Projektordner einen statischen Server starten – Service Worker und `fetch` brauchen `http(s)`, nicht `file://`:
  `python -m http.server 8000` → dann `http://localhost:8000` öffnen.
- **Schnelltest ohne Server:** `index.html` direkt im Browser öffnen. Funktioniert, aber Service Worker registriert sich nicht.
- **Supabase-Schema einspielen:** Inhalt von `sql/schema.sql` im Supabase-Dashboard → SQL Editor ausführen.
- **Deploy:** Repo-Inhalt auf GitHub Pages (relative Pfade, läuft auch im Unterpfad `…/essensplaner/`).

## Architektur

**Datenfluss – die wichtigste Regel:** Seiten mutieren das globale `DB`-Objekt direkt und rufen danach `Data.persist('<collection>')` bzw. `Data.persistSettings()` auf. Seiten schreiben **niemals** selbst in `localStorage` oder Supabase.

- `js/config.js` – `window.EP`-Namespace mit Konstanten. Supabase-URL/Key werden aus `localStorage` gelesen, **nie hier hartcodiert**.
- `js/supabase.js` – Datenlayer. Das globale `DB` hält die In-Memory-Arbeitskopie (`settings`, `recipes`, `mealplan`, `groceries`, `pantry`). `Data` kapselt Persistenz: arbeitet im Modus `'cloud'` (Supabase + eingeloggt) oder `'local'` (nur `localStorage`). Bei jedem Save wird zuerst lokal gespiegelt; schlägt der Cloud-Push fehl oder ist offline, landet die Collection in der Offline-Queue (`Data.flushQueue()` reicht beim Reconnect nach). Enthält auch alle Standard-/Beispieldaten (`defaultRecipes()` etc.). `migrateData()` läuft bei **jedem** Laden und normalisiert Altdaten: altes Vorrat-Objekt `{fresh,dry}` → flaches Array, Laden-Kürzel `ch/de` → `home/comp`, alle IDs → Strings, fehlende Arrays werden ergänzt.
- `js/auth.js` – `Auth.boot()` entscheidet den Startfluss anhand von `localStorage['ep_setup_done']` (`'cloud'` | `'local'` | leer): Setup-Screen → Login/Registrierung → Onboarding (4 Schritte) → App. Rendert Vollbild-Screens in `#auth-screen`.
- `js/app.js` – Navigation, Dashboard und geteilte Helfer (`toast`, `modal`, `recipeCard`, `esc`, `barChart`) sowie das Länder-/Währungsmodell: `COUNTRY_INFO`, `homeInfo()`/`compInfo()` (aus `settings.homeCC`/`compCC`), `hasComparison()`, `fmtMoney()`, `planCost()`/`mealCost()`/`mealKcal()`/`dayKcal()`/`budgetForWindow()`. `initApp()` startet die App nach erfolgreichem Auth.
- `js/mealplan.js`, `groceries.js`, `pantry.js`, `recipes.js`, `discover.js`, `settings.js` – je eine Seite. Jede stellt eine `render*`-Funktion bereit, die `navigate()` in `app.js` aufruft.
- **Auto-Plan-Optimierer** (`mealplan.js`): `autoGeneratePlan()` öffnet einen Vorlieben-Dialog (`openAutoPlanModal` → `runAutoPlan`). `generatePlan(extraRecipes?)` baut über `buildPlanGreedy` mehrere Plan-Varianten und wählt per `scorePlan` die beste – Ziel ist, Protein-/kcal-Ziel zu treffen und das Budget zu halten (Protein hat Vorrang). Meal-Prep-Blöcke bleiben erhalten. `applyPortionScaling()` rechnet anschließend die Portionsmengen je Mahlzeit hoch (`meal.mult`), bis Protein- und kcal-Ziel erreicht sind – ein einzelnes Gericht deckt z. B. 3500 kcal/Tag nicht ab. `planTargetReport()` liefert den Ziel-Abgleich; `showPlanIssues()` meldet unerreichbare Ziele. Mit Spoonacular-Key kann `fetchSpoonPlanRecipes()` zusätzliche Rezepte einspeisen; genutzte Online-Rezepte landen über `syncPlanSpoonRecipes()` als `fromPlan`-Rezepte in `DB.recipes`. Mahlzeiten-Objekte tragen `protein`, `kcal`, `cost`, `cuisine`, `rid`. `regeneratePlanForSettings()` ist der Einstieg aus den Einstellungen. Bei aktivem Kohlenhydrat-Timing (`carbTimingActive()` – explizit per Auto-Plan-Dialog oder automatisch an für das Ziel „Muskelaufbau") bevorzugt `fillSlotGreedy` morgens kohlenhydratarme, mittags moderate und abends kohlenhydratreiche Gerichte.
- **Bedarfsrechner** (`settings.js`): `openGoalCalculator()` → `computeNutritionGoals()` berechnet Protein-/kcal-Ziel nach Mifflin-St-Jeor (Grundumsatz × Aktivitätsfaktor aus Beruf+Sport, angepasst an Abnehmen/Halten/Aufbau).
- **Entdecken** (`discover.js`): lokale Vorschläge + Online-Suche via Spoonacular. `searchOnline()` arbeitet mit Suchbegriff **oder** – für Inspiration – nur mit gewählter Küche (dann `sort=random`, 10 Rezepte). `spoonToRecipe()` rechnet Cup-/Unzen-Mengen um (`convertSpoonAmount`) und übersetzt Zutatennamen ins Deutsche.
- **Rezept-Erstellung** (`recipes.js`): `openAddRecipeModal()` – Zutaten als dynamische Zeilen (Name mit tippfehler-toleranter Autovervollständigung `fuzzyFoodMatches()` aus `pantry.js`; Menge + Einheit aus `RECIPE_UNITS`), Mengen **für 1 Portion** (`perPortion: true`). Nährwerte werden über `estimateRecipeMacros()` automatisch aus den Zutaten geschätzt (`FOOD_NUTRITION`/`PIECE_GRAMS`/`UNIT_GRAMS`, je 100 g); die Felder bleiben überschreibbar (`_recipeNutriLocked`, Button „🔄 Aus Zutaten schätzen"). Optionaler Block „In den Mahlzeitenplan eintragen": `scheduleRecipeIntoPlan()` setzt das Rezept als gewählte Mahlzeit über N Tage ein (Startpunkt, Portionen/Mahlzeit, Meal-Prep, Überschreiben). `updateRecipeNutriCheck()` warnt, wenn das Rezept für die Mahlzeit zu proteinarm ist. Zutaten werden über `addRecipeIngredientsScaled()` (mit `scaleAmount()` aus `app.js`) hochgerechnet in die Einkaufsliste übernommen.
- `js/offline.js` – Service-Worker-Registrierung, Online/Offline-Erkennung, löst `Data.flushQueue()` aus.
- `sw.js` / `manifest.json` / `icons/` – PWA. `sw.js` cacht die App-Shell (cache-first); API-Hosts werden bewusst nicht gecacht.

**Datenmodell (Supabase):** Pro Nutzer genau **eine Zeile je Tabelle** (`profiles`, `recipes`, `meal_plans`, `grocery_items`, `pantry_items`); der Inhalt liegt als JSON-Array/-Objekt in der Spalte `data` bzw. `settings`. RLS schränkt jede Zeile auf `auth.uid()` ein. Das hält die Synchronisation als simples „ganze Collection upserten" einfach – kein Item-Level-Diffing.

**Skript-Ladereihenfolge** (in `index.html`): Supabase-SDK von jsDelivr → `window._SupabaseLib = window.supabase` (Namenskonflikt vermeiden) → `config.js` → `supabase.js` → restliche Module → am Ende `Auth.boot()`.

## Sicherheitsmodell

- Der Supabase **`anon`-Key ist öffentlich** (per Design im Client); seine Sicherheit kommt ausschließlich von **RLS**. RLS muss auf jeder Tabelle aktiv bleiben.
- Der **`service_role`-Key** darf nirgends auftauchen – nicht im Code, nicht in Commits.
- Keys leben nur im `localStorage` des Nutzers, eingegeben über den Setup-Screen. Nie im Repo committen (`.gitignore`: `.env`, `*.env`, `config.local.js`).
- Persönliche Dokumente (`*.docx`, `*.pdf`) stehen in `.gitignore` und dürfen **nicht** ins öffentliche Repo. Bei Web-Upload (ohne Git) von Hand auslassen.

## Konventionen

- Sprache der App und der Kommentare: Deutsch.
- IDs für Datensätze: `uid()` aus `supabase.js` (offline-stabil); IDs sind immer Strings.
- `defaultRecipes()` in `supabase.js` hat stabile IDs (`r1`…`r33`). Bestehende Nutzer holen fehlende Beispielrezepte über `loadStarterRecipes()` (Button in „Meine Rezepte") nach – Abgleich per ID.
- Rezepte mit `perPortion: true` (über den Rezept-Dialog erstellt) speichern Zutatenmengen **pro Portion**; beim Einkauf werden sie per `scaleAmount()` auf die Portionszahl hochgerechnet. Standardrezepte (`r1`…`r33`) sind Batch-Rezepte ohne dieses Flag.
- Küchen-Schlüssel: `european`, `italian`, `asian`, `indian`, `mediterranean`, `mexican`, `oriental`, `german`. Bei einer neuen Küche `cuisineLabel()`/`cuisineEmoji()` (app.js), `.cuisine-*` (app.css) und die Auswahllisten in `recipes.js`/`discover.js` ergänzen.
- Zutatennamen: `translateFoodName()` (`groceries.js`) übersetzt englische Namen (Spoonacular) ins Deutsche. `foodKey()` ist der kanonische Schlüssel der Einkaufsliste – er fasst Schreibvarianten zusammen (Zwiebel/Zwiebeln → *ein* Posten, ebenso „eggs"/„Eier"), hält aber Farbe (rote vs. weiße Zwiebeln) sowie Dose/TK/Pulver getrennt. Zwiebel-/Knoblauchpulver wird von `translateFoodName()` durch die frische Zutat ersetzt (andere Pulver wie Paprikapulver bleiben eigene Posten). Beim Hinzufügen addiert `mergeAmounts()` die Mengen gleicher Zutaten. `migrateData()` deutscht bestehende Listen nach und führt Dubletten zusammen. Unbekanntes bleibt bewusst unübersetzt.
- Neue persistente Felder gehören ins JSON (`DB.settings` bzw. die Collection-Arrays) – kein Schema-Migrationsschritt nötig, da die DB-Spalten generisches JSONB sind. Datenformat-Änderungen stattdessen in `migrateData()` abfangen.
- **Orte nie hartcodieren:** Wohnort/Vergleichsort sind frei wählbar. Einkaufsartikel haben `store: 'home' | 'comp'`; Land, Flagge und Währung kommen aus `homeInfo()`/`compInfo()`. Ohne Vergleichsort (`hasComparison()` false) zählt nur der Wohnort. Preise werden bei Bedarf via `estimatePrice()` (Tabelle `FOOD_PRICES` in `groceries.js`) geschätzt.
