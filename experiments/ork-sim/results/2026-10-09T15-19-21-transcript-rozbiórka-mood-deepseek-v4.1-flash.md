# Scena: rozbiórka (deepseek-v4.1-flash)

_Stary moduł `legacy/export.rb` ma 800 linii i nikt nie wie, czy czegoś jeszcze używa. Zespół decyduje: refaktor czy wysadzić i napisać od nowa._

**Krux:** Zmierzyć trzy razy. Potem burzyć. Morra nie wie, co używa tego smrodu. Horda czeka.

**Lont:** Mierzyć trzy razy: cztery wywołania, trzy w testach, jedno w `orders_controller`. Najpierw odciąć to jedno, potem proch pod `legacy/export.rb`. Gruz zostanie, horda się ucieszy. Lont gotowy.

**Krux:** Morra nie wie, co używa tego smrodu. Odciąć orders_controller. Czekać tydzień. Potem lont pod sztolnię.

**Lont:** Czekać tydzień — dobrze, mierzyć dalej. Odciąć `orders_controller`, potem patrzeć w logi, czy coś jeszcze pełznąć do tego smrodu. Lont czekać, proch leżeć suchy. A potem gruz i nowa sztolnia.

**Krux:** Morra pokazać logi. Patrzeć, czy smród woła. Czysto — lont pod sztolnię. Nie czysto — ciąć dalej.
