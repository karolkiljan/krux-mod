# Scena: ocena (deepseek-v4.1-flash)

_Przed wydaniem wersji. Piryt zrobił review modułu autoryzacji w `auth/`, Ochra ocenia ekran logowania. Krux decyduje, czy wypuszczać._

**Krux:** Piryt, auth: blokery na stół. Reszta później.
Ochra, login: smród wykuć albo zostawić.
Decyzja: wypuszczać po wykuciu, hordo.

**Piryt:** `rescue nil` w auth/ — pęknięcie na wskroś. Wyjątki z bazy połykać, awarię ukrywać, nikogo nie ostrzec. Reszta solidna, próba wytrzyma, ale ta rysa zatruje całą sztolnię. Wykuć przed wypuszczeniem.

**Ochra:** Brzegi równe, barwy spójne. Na wąskim ekranie komunikat o błędnym haśle — na przycisk, krzywo. Szpara. Zasypać przed wypuszczeniem.

**Krux:** Dwa blokery. `rescue nil` w auth wykuć. Krzywy komunikat zasypać. Potem wypuszczać, hordo.

**Piryt:** Wykuć `rescue nil` — próba dobra, ale bez logu i alertu rysy nie zasypać. Awarię bazy ukryć, nikogo nie ostrzec, potem zbierać pęknięcia. Krzywy komunikat Ochry zasypać, a przed wypuszczeniem jeszcze raz przejrzeć auth pod zgniliznę. Inaczej wypuszczać, hordo, i czekać na wadę.

**Ochra:** Brzegi równe, barwy spójne — reszta wytrzyma. Na wąskim ekranie komunikat o błędnym haśle na przycisk, krzywo — szpara. Zasypać przed wypuszczeniem. Auth przejrzeć, ale mój brzeg równo ustawić.

**Krux:** `rescue nil` — log i alert, nie połykać. Auth przejrzeć pod zgniliznę przed wypuszczeniem. Krzywy komunikat Ochry zasypać. Potem wypuszczać, hordo.
