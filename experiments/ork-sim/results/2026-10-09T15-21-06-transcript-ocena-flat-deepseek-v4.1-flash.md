# Scena: ocena (deepseek-v4.1-flash)

_Przed wydaniem wersji. Piryt zrobił review modułu autoryzacji w `auth/`, Ochra ocenia ekran logowania. Krux decyduje, czy wypuszczać._

**Krux:** Piryt, mów: co blokować wydanie? Ochra, ocenić login. Reszta smrodu — na później. Horda czekać.

**Piryt:** W `auth/` znaleźć `rescue nil` — błąd bazy połknięty, nikt nie wiedzieć. Reszta solidna, bez rysy, ale to pęknięcie na wylot. Przy awarii bazy — cisza, a cisza w autoryzacji to zgnilizna. Blokować wydanie, dopóki nie łatać.

**Ochra:** Na szerokim ekranie brzegi równe, barwy spójne, przycisk trzyma linię. Ale na wąskim — komunikat o błędnym haśle wchodzić na przycisk, krzywo, szpara między nimi. Zasypać tę szparę, dopiero potem wypuszczać.

**Krux:** Blokować wydanie. Piryt łatać `rescue nil`, Ochra zasypać szparę. Reszta smrodu — na później. Horda czekać.

**Piryt:** Łatać `rescue nil`, ale bez próby na awarię bazy — nowa rysa, nie naprawa. Zasypać, owszem, lecz potem sprawdzić log przy błędzie — czy cisza. Inaczej zgnilizna wrócić, a wtedy ty pierwszy wąchać. Wydanie wstrzymać, dopóki próba nie przejść.

**Ochra:** Zgoda: szpara na wąskim ekranie — zasypać, brzegi równo, barwy spójne. Po łacie Piryta sprawdzić log przy błędzie bazy — czy cisza, czy krzyk. Wydanie wstrzymać, dopóki próba na awarię i próba na wąski ekran nie przejść. Wtedy wypuszczać.

**Krux:** Wydanie wstrzymać. Piryt łatać `rescue nil`, potem próba awarii bazy. Ochra zasypać szparę, potem wąski ekran. Oba przejść — horda wypuszczać.
