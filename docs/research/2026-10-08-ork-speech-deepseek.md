# Mowa orka na deepseek-v4.1-flash — notatka badawcza (2026-10-08)

Eksperyment odpalony nocą na gałęzi `experiments/ork-speech-deepseek`. Narzędzie:
`experiments/ork-sim/ork-sim.py` (symulatory `session`, `matrix`, `rewrite`; metryki 1:1 z `scripts/voice-bench.mjs`).

## Streszczenie ustaleń

1. **deepseek-v4.1-flash to model rozumujący.** Każda odpowiedź na ollama cloud spala ~1500–2500 tokenów ukrytego myślenia, zanim padnie pierwsze słowo. Budżety < 2000 output zwracają `finish_reason='length'` z pustym `content`. Przy krótkich odpowiedziach Kruxa (~50–150 słów) taniość tego modelu **nie wynika z długości wyjścia** — reasoning jest nieodłączną akcyzy.

2. **Polski kosztuje ~1,8× więcej niż angielski** (tokenizer DeepSeek-V4 prawdziwy HF: 0,320 vs 0,177 tok/znak w tej samej równej treści). Persona.md = 3 296 tok, VOICE_ANCHOR = 251 tok, VOICE_SHORT = 80 tok (koszt stały w promptach).

3. **Orkowa mowa oszczędza wyjście o ~9%, ale nie gramatyką.** Pomiar na 5 parach odpowiedzi o tej samej treści: orkowa 112 tok vs ludzka 129 tok. Oszczędność pochodzi wyłącznie z **mniejszej liczby słów** (~29% w dół); per słowo orkowa forma jest droższa (2,69 vs 2,11 tok/słowo — rzadkie formy „widzieć”, „węszyć” rozbijają się drożej niż „widzę”). Potwierdza to wprost niezmiennik moda: „gramatyka orka tokenowo obojętna, oszczędza tylko krótsze zdanie”.

4. **Tani model bez kotwicy nadpisuje treść stylem.** W teście rewrite model zamienił „plik” na „robaka”, a „widzieć” na „węszyć” — czyli zmienił semantykę, byle się dopisać do słownika. To kandydat na osobne reguły „nie modyfikuj rzeczowników domenowych” (nie każde `s` → `smród`).

## Pomiary tokenizacji (DeepSeek-V4 tokenizer, transformers)

| Tekst | tokeni | słowa | tok/słowo |
|---|---:|---:|---:|
| Zwykłe zdanie PL | 24 | 9 | 2,67 |
| To samo EN | 11 | 11 | 1,00 |
| `VOICE_ANCHOR` | 251 | 95 | 2,64 |
| `VOICE_SHORT` | 80 | 35 | 2,29 |
| `persona.md` (cała) | 3 296 | 1 024 | 3,22 |
| Odpowiedź ludzka (test cache) | 116 | 55 | 2,11 |
| Odpowiedź orkowa, ta sama treść | 105 | 39 | 2,69 |

**Razem na 5 parach:** ork 112 tok vs człowiek 129 tok → **0,87 ratio** (13% oszczędności).

## Setup i replikacja

```bash
# Wymagania
export OLLAMA_API_KEY=...  # w ~/.hermes/.env
pip install tiktoken transformers    # tylko do lokalnych pomiarów tokenizerem
python experiments/ork-sim/ork-sim.py session --variant anchor-full --runs 2     # 12 tur × 2
python experiments/ork-sim/ork-sim.py matrix --runs 3        # 8 typów × 3 instrukcje
python experiments/ork-sim/ork-sim.py rewrite --runs 3      # 12 zdań ludzkich
```

Wszelkie surowe wyniki trafiają do `experiments/ork-sim/results/*.json`.

## Źródła użyte do planów eksperymentów

- Li i in. 2024 — persona drift po ~8 turach ([arXiv:2402.10962](https://arxiv.org/abs/2402.10962)) — odświeżanie kotwicy co 6 tur.
- Liu i in. 2024 TACL, *Lost in the Middle* — U-kształtna uwaga: zasady na początek i koniec, nie środek.
- Zheng i in. 2024 *When A Helpful Assistant…* ([arXiv:2311.10054](https://arxiv.org/abs/2311.10054)) — persona zmienia rejestr, nie merytorykę: głos to koszt bez zysku dokładności.
- Tokenizer Tax (arXiv:2605.24718), Bielik v3 — polski 2,2–3,3 tok/słowo; zgodne z tym pomiarem.
- TianPan 2026 *Multilingual Token Tax* — akcyza rośnie jeszcze bardziej przy reasoning, bo reasoning też jest w języku; przy tanim reasonerze miksujemy „PL na zew.", „EN w środku” — koszt rośnie, nie maleje.
- OneRuler / Marzena Karpińska — polski dobrze radzi sobie w długim kontekście, ale to samo badanie przestrzega przed wnioskiem "polski najlepszy do promptowania" (błąd medialny).
- Roleplay system prompt guide (fairgmbl) — twarde reguły na start+koniec, nie w środku. Zgodne z `VOICE_ANCHOR` na początku każdej tury.

## Warianty kotwic pod próbę (eksperymenty A/B)

| Wariant | Zawartość | Cel testu |
|---|---|---|
| `anchor-full` | pełna `VOICE_ANCHOR` z obecnego moda | baza |
| `anchor-short` | `VOICE_SHORT` | czy krótka wystarcza tanich modeli? |
| `anchor-minimal` | 22 słowa, same reguły | koszt minimalny |
| `anchor-rules` | lista numerowana 6 reguł | struktura bez par przykładowych |
| `anchor-contrast` | „Robak siedzieć, nie siedzi” — zakaz/wzór bez długich cytatów | format kontrastowy |

Metryki odpowiedzi: voice / 1000 słów, bezokoliczniki / 100 słów, copula / 100 słów, druga osoba, avg długość zdania, krótkie zdania %, tok/słowo, liczba „Krux” na odpowiedź, latencja.

## Uwaga o wykonaniu

Pierwsza seria symulacji na deepseek-v4.1-flash zawiodła z powodu mojego błędu: założyłem, że `max_tokens` 400 wystarcza. DeepSeek myśli **w tokenach wyjścia**, więc budżet musi obejmować reasoning (~1500–2500) + właściwą odpowiedź. Poprawka: 4000–6000 + retry przy pustym content.
