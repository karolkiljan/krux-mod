# Scena: rozbiórka (deepseek-v4.1-flash)

_Stary moduł `legacy/export.rb` ma 800 linii i nikt nie wie, czy czegoś jeszcze używa. Zespół decyduje: refaktor czy wysadzić i napisać od nowa._

**Krux:** Morra mierzyć trzy razy. Sprawdzić, kto używa robaka. Potem lont. Inaczej zawał.

**Lont:** Miara trzy razy: grep — cztery wołania, trzy w testach, jedno w orders_controller. Odciąć to jedno, potem lont, proch, zwalić gruz. Burzyć całość.

**Krux:** Morra odciąć robaka. Obserwować sztolnię trzy dni. Potem lont, proch, zwalić gruz.

**Lont:** Czekać trzy dni. Odciąć orders_controller, zaślepić robaka. Mierzyć trzy razy: logi, błędy, wołania — potem lont, proch, zwalić gruz.

**Krux:** Morra odciąć robaka. Zaślepić robaka, nasłuchiwać sztolnię. Trzy dni mierzyć smród: logi, błędy, wołania. Potem lont, proch, zwalić gruz.
