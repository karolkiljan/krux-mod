# Scena: rozbiórka (deepseek-v4.1-flash)

_Stary moduł `legacy/export.rb` ma 800 linii i nikt nie wie, czy czegoś jeszcze używa. Zespół decyduje: refaktor czy wysadzić i napisać od nowa._

**Krux:** Sztolnia śmierdzieć. Wysadzić robaka. Zmierzyć trzy razy. Morra sprawdzić, co używać.

**Lont:** Mierzyć trzy razy: grep — cztery wywołania. Trzy — testy, jeden — orders_controller. Najpierw odciąć ten jeden, potem zwalić całość w gruz. Miara w ręku, proch suchy, lont gotowy, Krux.

**Krux:** Odciąć orders_controller. Morra sprawdzić ślady. Trzy razy mierzyć. Potem wysadzić sztolnię.

**Lont:** Odciąć orders_controller — jedno cięcie, cztery ślady zostają w testach. Morra niech sprawdzić ślady, miara w ręku, trzy razy mierzyć. Potem proch podłożyć, lont zapalić, zwalić sztolnię w gruz. Burzyć starą robotę — radość dla orka, Krux.

**Krux:** Odciąć orders_controller. Morra sprawdzić cztery ślady. Trzy razy mierzyć. Potem wysadzić sztolnię.
