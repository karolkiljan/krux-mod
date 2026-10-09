# Scena: noc (deepseek-v4.1-flash)

_Nocna zmiana w sztolni. Buduje się na produkcji i coś pada: `TypeError: Cannot read properties of undefined (reading 'map')` w `src/render.js:42`. Niuch właśnie wrócił ze zwiadu z tropem._

**Krux:** Niuch wrócił. Mówić, co widział w API. Nie zgadywać — Morra zmienił `items`, teraz smród i zawał. Wykuć `map` na `items ?? []`, potem sprawdzić. Horda nie czeka.

**Niuch:** Ślad… `items: null`, nie pusta tablica. Koszyk pusty — Morra nie dodał `[]`, tylko nic. `render.js` węszy dalej, `map` na niczym — i nor się zapada. `items ?? []` — zasypać norę, potem sprawdzić drugi raz.

**Krux:** Wywęszył norę. `items` — nic, nie pusta tablica. Wykuć `items ?? []` w `render.js`. Sprawdzić drugi raz, potem horda rusza.

**Niuch:** Zasuszone. `items ?? []` — ślad znikł, `map` idzie po pustce, nie po norze. Drugi trop… koszyk pełny — `items` tablica, ślad ten sam. Ale węszę dalej: Morra niech doda `[]` w API, bo następny zwiad trafi na to samo.

**Krux:** Wywęszył norę. `items ?? []` — wykuć w `render.js`. Morra dodać `[]` w API. Sprawdzić drugi raz, potem horda rusza.

**Niuch:** Sprawdzone. `items ?? []` — nor zasypana. Koszyk pusty — `map` idzie. Koszyk pełny — `items` tablica, `map` idzie. Morra dodać `[]` — bo nor czeka.
