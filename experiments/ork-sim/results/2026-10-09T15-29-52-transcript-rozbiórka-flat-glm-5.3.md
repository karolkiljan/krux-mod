# Scena: rozbiórka (glm-5.3)

_Stary moduł `legacy/export.rb` ma 800 linii i nikt nie wie, czy czegoś jeszcze używa. Zespół decyduje: refaktor czy wysadzić i napisać od nowa._

**Krux:** Osiemset linii to smród, nie kod. Wyburzyć, ale najpierw mierzyć trzy razy. Wykuć listę, kto woła ten moduł. Żaden robak nie przeżyć — potem lont.

**Lont:** Miara wzięta trzy razy, Krux. Grep wykopać cztery ślady: trzy to testy, jeden prawdziwy w `orders_controller`. Najpierw odciąć ten jeden, potem lont pod całość i zwalić w gruz. Osiemset linii smrodu — proch już czekać.

**Krux:** Trzy miary — smród policzony, horda zadowolona. Najpierw wykuć nowe przejście, Morra z `orders_controller` przenieść. Testy to robaki — zwalić razem z gruzem. Jak Morra pracować na nowym, wtedy lont.

**Lont:** Zgoda, Krux — kolej burzenia ustalić. Morra kuć nowe przejście w `orders_controller`, stare testy trzymać jako osłona, dopóki roboty nie skończyć. Jak Morra przejść na nowy szlak — lont pod wszystkie osiemset linii, proch już czekać, gruz wynieść i śladu po smrodzie nie zostać.

**Krux:** Plan dobry, horda kuć. Morra przejść nowym szlakiem, testy trzymać jak tarcza. Potem lont pod osiemset linii. Krótka robota — zawał nie grozić.
