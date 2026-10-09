# Scena: kuźnia (glm-5.3)

_Sztolnia: test `cache.test.js` pada przy drugim żądaniu. Cache trzyma stare dane po `invalidate`. Trzeba zdecydować, jak naprawić — i kto to zrobi._

**Krux:** Widzieć robaka: `fetch` wąchać `if @store[key]`. Po `invalidate` smród wracać do sztolni. Wykuć `key?` zamiast `if` — przepisywać całość to zawał. Horda kuć, Morra patrzeć.

**Grom:** Krux, łatać robaka to chuchać na zimne palenisko! Stary cache — stare kowadło, rdza zjadać stal. Kuć nowy moduł z TTL od podstaw, młot raz trzasnąć, nie dziesięć razy kleić! Dać mi hordę, do zmierzchu całość wykuć!

**Młot:** Krux kuć łatę, Grom kuć nowy — oba gadać, żaden dać dowód. Liczyć dwa razy: 52 próby świecić, robak gryźć — próby omijać tę stal. Kuć próbę czerwoną przed poprawką: invalidate, drugie żądanie, stare śmieci wracać. Próba krwawić, dopiero decydować kto kuć.

**Krux:** Młot kuć czerwoną próbę — smród krwawić na oczy. Próba rozsądzić spór, nie dwa pyski. Łata wykuć szybciej, nowy moduł to zawał. Horda czekać, sztolnia nie czekać.

**Grom:** Czerwona próba — dobra stal, niech Młot kuć! Ale jak robak krwawić na oczy, rdza nie znikać sama — kuć nowy moduł z TTL, nie kleić stare kowadło. Łata wytrzymać jedno uderzenie młota, nowa stal — sto zim. Horda do mojej kuźni, do zmierzchu wszystko wykuć!

**Młot:** Krux, Młot kuć czerwoną próbę — invalidate, drugie żądanie, próba krwawić na oczy: dowód, nie gadanie. Łatka Kruxa kuć pierwszy — próba świecić zielono, spór skończony. Grom nowa stal — liczyć dwa razy: 52 plus jedna, 53 próby świecić, inaczej zero. Kto dać zielono, ten kuć.

**Krux:** Młot kuć czerwoną próbę, potem moja łata. Wykuć `key?`, nie `if` — smród znikać jednym uderzeniem. Próba świecić zielono, spór skończony, horda kuć dalej. Grom nowa stal — 53 próby świecić, inaczej zero.

**Młot:** Krux, Młot kuć czerwoną próbę: invalidate, drugie żądanie, stare śmieci wracać. Krwawić czerwono dwa razy — dopiero łata, nie wcześniej. Łatka Kruxa kuć pierwszy, zielono świecić, liczyć 53 — liczyć dwa razy. Grom nowa stal — ta sama próba sądzić, jeden dowód dla obu.
