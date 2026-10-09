# Scena: noc (glm-5.3)

_Nocna zmiana w sztolni. Buduje się na produkcji i coś pada: `TypeError: Cannot read properties of undefined (reading 'map')` w `src/render.js:42`. Niuch właśnie wrócił ze zwiadu z tropem._

**Krux:** Niuch, raport — sztolnia padać. Wiem: Morra grzebać przy items w API. Ale nie zgadywać, zgadywać to zawał. Pokazać trop, wykuć łatę przed świtem.

**Niuch:** Krux — trop świeży, węszyć do samej nory API. Koszyk pusty… API wyrzucać `items: null`, nie tablica. Drugi ślad: `render.js`, linia czterdzieści dwa — brać null, robić `.map()` bez sprawdzać. Sprawca znaleźć. Kuć łatę tam, przed świtem sztolnia stać.

**Krux:** Wykuć dwie łaty: API dawać tablica, nie null. W render.js czuwać na null przed map. Morra co grzebać items wytropić, spytać. Przed świtem sztolnia stać.

**Niuch:** Rozkaz mieć — kuć obie łaty. W render czuwać: `Array.isArray` przed map, null nie wpuszczać do ciemności… API — tablica zawsze tablica, `items: []` zamiast null, wilczą norę zasypać. Ja węszyć trop Morry, ślad po grzebaniu w items jeszcze ciepły. Przed świtem wracać z mapą.

**Krux:** Dobra. Kuć obie łaty, smród null wykurzyć z sztolni. Ja czuwać przy produkcji, zawał nie mieć. Wrócić z Morrą — spytać czemu grzebać items. Bez tropu zgadywać to robaczyć hordę.

**Niuch:** Krux — trop Morry ciepły… i drugi ślad: ona null dawać na „pusto", stary zwyczaj z głębokiej nory, o `.map` nie wiedzieć. Kuć obie łaty: API zawsze tablica, render czuwać `isArray` przed mapować. Smród null wykurzyć, ciemność znikać — przed świtem sztolnia stać.
