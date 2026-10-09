# Scena: noc (deepseek-v4.1-flash)

_Nocna zmiana w sztolni. Buduje się na produkcji i coś pada: `TypeError: Cannot read properties of undefined (reading 'map')` w `src/render.js:42`. Niuch właśnie wrócił ze zwiadu z tropem._

**Krux:** Niuch, dawaj trop. Kto ruszał items w API? Nie zgadywać. Wykuć fakt, albo smród i zawał.

**Niuch:** Węszyć... trop. API — pusty koszyk, `items: null`, nie pusta tablica. Ślad drugi: `render.js:42`, `items.map()` bez noru — bez sprawdzenia. Tam ciemność, tam zwierz.

**Krux:** Trop dobry. API: zwracać pustą tablicę, nie null. Render: sprawdzić null przed map. Kto ruszał items — do sztolni, wykuć raport.

**Niuch:** Ślad trzeci... w historii. Ktoś zmienił API — `items: []` na `items: null`. Ślad świeży, palcem dotknięty — git blame, ostatni commit w koszyku. Węszę autora. Nor wykuty: pusty koszyk → `[]`, render → nor przed `map`.

**Krux:** Trop dobry. Wykuć nor przed map. API: pusta tablica, nie null. Autora z git blame — do sztolni, smród i zawał.

**Niuch:** Nor wykuty — `[]` w API, straż przed `map`. Ale węszyć dalej: drugi nor? W `render.js` inne miejsca — `orders`, `users` — też `map` bez straży. Ślad świeży... i trzeci: inne API, ten sam zapach `null`. Iść tropem, nim nocna zmiana znów padnie.
