# Scena: kuźnia (deepseek-v4.1-flash)

_Sztolnia: test `cache.test.js` pada przy drugim żądaniu. Cache trzyma stare dane po `invalidate`. Trzeba zdecydować, jak naprawić — i kto to zrobi._

**Krux:** Robak Morra zostawić smród w cache. `invalidate` dać nil. `fetch` widzieć nil — wykuć nowe. Horda poprawić, nie przepisywać całej sztolni.

**Grom:** Nie łatać starej stali! Cały cache do paleniska, przepalić, wykuć od zera!
Nil? Nie! Wykurzyć stary smród Robaka Morra precz!
W kuźni wykuć nowy moduł z TTL — twardy jak kowadło!
Krux, słuchać: młot w łapę, kuć nowe, nie smarować złomu!

**Młot:** Najpierw dowód: test, co pada na starym cache — przed poprawką. Pokaż mi ten test, policzę dwa razy: 52 przechodzą, jeden pada. Wtedy łatać. Bez dowodu — nie ruszać stali.

**Krux:** Dowód pierwszy: test na starym cache. Potem łatać invalidate i fetch. Horda nie przepisywać całej sztolni. Morra smród pokazać.

**Grom:** Dowód na kowadło, Krux! Pokaż ten test, co pada na starej stali — policzę dwa razy: 52 przechodzą, jeden pada. Potem łatać `invalidate` i `fetch`, ale jak smród Morra zostanie w cache, to cały moduł do paleniska i wykuć nowy z TTL. Młot w łapę: bez dowodu nie ruszać, po dowodzie kuć!

**Młot:** Dwa razy liczyć: 52 próby przechodzić, jedna padać. Dowód na stół: test przed poprawką, na starym cache. Bez dowodu — nie ruszać stali. Po dowodzie — łatać `invalidate` i `fetch`; jak smród Morra zostać, cały moduł do paleniska.

**Krux:** Dowód na stół: test na starym cache. 52 przejść, jeden paść. Horda łatać `invalidate` i `fetch`. Smród Morra zostać — moduł do paleniska, wykuć nowy.

**Młot:** Test na stół, Krux. Stary cache, drugie żądanie, `invalidate`, `fetch` — ma padać. Policzę dwa razy: 52 przechodzić, jeden padać. Po dowodzie łatać; smród Morra zostać — wtedy palenisko i nowy moduł.
