# Scena: noc (glm-5.3)

_Nocna zmiana w sztolni. Buduje się na produkcji i coś pada: `TypeError: Cannot read properties of undefined (reading 'map')` w `src/render.js:42`. Niuch właśnie wrócił ze zwiadu z tropem._

**Krux:** Niuch, raport dawać, horda czekać. Zgadywać to zaprosić zawał. Morra grzebać w items niedawno — trop tam iść? Jak tak, wykuć łatkę przed świtem.

**Niuch:** Morra czysta — trop gdzie indziej wieść. Węszyć norę API… koszyk pusty, a API oddawać `items: null`, nie tablica. `render.js:42` szarpać `.map()` po null — i paść w ciemność. Łatka: pilnować przed mapą, albo API kazać oddawać `[]` — wykuć przed świtem.

**Krux:** Dobra, węszyć celnie. Null w norze — smród, zaprosić zawał. Wykuć oba: render pilnować przed mapą, API kazać oddawać pusty kosz. Horda kucia, świt gonić.

**Niuch:** Rozkaz przyjąć, oba wykuć. W render ślad prosty: pilnować `items ?? []` przed mapą — ciemność pierzchnąć. Ale… drugi trop w norze: węszyć, gdzie jeszcze po items szarpać — null i tam kąsać. Przed świtem wrócić z mapą, łaty trzymać.

**Krux:** Rozkaz dobry. Węszyć każdą norę po items — null wszędzie kąsać. Mapa łat przed świtem, horda kucia całą noc. Szczerby nie zostawić — zawał czekać na okazję.

**Niuch:** Rozkaz w kościach — węszyć każdą norę po items. Koszyk, suma, paragon… ślad, i drugi ślad — trzy tropy węszyć. Null wszędzie kąsać tak samo: `?? []` przed mapą, ciemność pierzchnąć. Przed świtem wrócić z mapą — szczerb nie zostać, zawał czekać na okazję.
