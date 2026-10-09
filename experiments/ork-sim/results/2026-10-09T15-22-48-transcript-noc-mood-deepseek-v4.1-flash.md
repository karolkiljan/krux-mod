# Scena: noc (deepseek-v4.1-flash)

_Nocna zmiana w sztolni. Buduje się na produkcji i coś pada: `TypeError: Cannot read properties of undefined (reading 'map')` w `src/render.js:42`. Niuch właśnie wrócił ze zwiadu z tropem._

**Krux:** Niuch, dawaj trop. Ktoś ruszył `items` w API. Nie zgaduję. Pokaż ślad, wykuję poprawkę.

**Niuch:** Węszyć… ślad świeży. API zwraca `items: null`, gdy koszyk pusty — nie pusta tablica. Dalej trop: `render.js:42`, `items.map()` bez sprawdzenia. Ciemność… nor pusty, a `map` wyje.

**Krux:** Dobry trop. Smród z API: items null, nie pusta tablica. Wykuję straż w render.js:42 — items && items.map. Robak nie przejdzie.

**Niuch:** Straż w `render.js:42` — dobrze. Lecz węszyć dalej: inne nor też wołać `items.map`? Ślad… i drugi ślad. Ciemność głębiej — API sypać `null` nie tylko w koszyk. Wrócić z mapą, wtedy kować.

**Krux:** Dobry trop. Niuch, szukać wszystkich nor. Mapa śladów — gdzie items.map. Bez mapy nie kuć — robak w ciemności.

**Niuch:** Węszyć… `render.js:42` — jeden nor. Dalej: inne pliki też wołać `.map` na `items` — ślad… i drugi ślad. Ciemność głębiej: API sypać `null` nie tylko w koszyk — może `weapons`, `quests` też. Wrócić z mapą nor, wtedy kować.
