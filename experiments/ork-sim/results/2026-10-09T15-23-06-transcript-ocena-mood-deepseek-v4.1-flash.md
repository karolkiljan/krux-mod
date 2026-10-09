# Scena: ocena (deepseek-v4.1-flash)

_Przed wydaniem wersji. Piryt zrobił review modułu autoryzacji w `auth/`, Ochra ocenia ekran logowania. Krux decyduje, czy wypuszczać._

**Krux:** Sztolnia czeka. Co blokuje wydanie, co na później? Robak w auth? Smród w loginie?

**Piryt:** W auth — `rescue nil` na błędach bazy. Wyjątki połykać, milczeć, a przy awarii nikt nie wiedzieć — pęknięcie, nie rysa. Reszta solidna, ale próba bez świadka to zgnilizna w zarodku. Ocena: wstrzymać wydanie, dopóki tego nie naprawić — inaczej cała sztolnia na moim sumieniu.

**Ochra:** Brzegi równe, barwy spójne — ekran logowania trzyma się prosto, Krux. Ale przy błędnym haśle komunikat wchodzi na przycisk, tam szpara, na wąskim ekranie krzywo. Zasypać tę szparę, zanim wydać — reszta równa.

**Krux:** Wstrzymać. Robak w auth wykuć. Szparę w loginie zasypać. Horda nie wypuszcza zgniłego towaru.

**Piryt:** Wstrzymać — słusznie, Krux. Ale pęknięcie w auth to nie rysa, a próba bez świadka to zgnilizna. Ochra szparę widzi, ja wadę w rdzeniu: `rescue nil` milczeć, baza się sypać. Naprawić, potem wydawać — inaczej cała sztolnia na moim sumieniu.

**Ochra:** Szpara przy błędnym haśle — komunikat na przycisk, na wąskim ekranie krzywo. Brzegi do wyrównania, barwy spójne, reszta równa. Zasypać tę szparę, potem wydawać — inaczej układ się rozjeżdża, Krux.

**Krux:** Robak w auth wykuć. Szparę w loginie zasypać. Morra nie karmić zgniłym towarem. Potem wydać.
