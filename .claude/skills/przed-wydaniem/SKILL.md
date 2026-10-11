---
name: przed-wydaniem
description: Checki przed wydaniem moda Krux: validate, test, testy skryptów, tsc, diff check i zrzut ekranu TUI. Użyj przed wydaniem, przy release albo gdy Morra pyta, co uruchomić przed publikacją.
---

# Przed wydaniem

Uruchom z korzenia repo, w tej kolejności:

```bash
claude plugin validate .
claude plugin test .
node --test tests/scripts-regression.mjs
tsc -p .
git diff --check
```

Wygląd (ramki, kolory, układ) `claude plugin test` nie widzi: testy sprawdzają drzewo, nie farbę silnika. Zrzut prawdziwego ekranu, z modem z tego folderu i tanim modelem (transkrypt sesji dziecka się nie zapisuje):

```bash
python3 -m venv .venv && .venv/bin/pip install pyte
.venv/bin/python scripts/tui-shot.py --cols 120 --rows 40 --cmd 'claude --model haiku' \
  'until:Try:30' 'type:Powiedz: tak.' 'key:enter' 'until:done:120' 'wait:4' 'shot' 'fg:⚒ Krux'
```

Szerokość pod 144 kolumny pokazuje pas bez panelu Sztolni, 180 z panelem. Przy podpowiedzi komend `key:esc` przed `key:enter`, inaczej Enter bierze podświetloną. Sesja dziecka dzieli `$.store` z prawdziwymi: przełączony tryb trzeba przełączyć z powrotem i sprawdzić `/krux status`. Odrzucone drzewo `ui.render` silnik zgłasza w transkrypcie tylko przy `--plugin-dir .` (`--cmd 'claude --model haiku --plugin-dir .'`); bez tego cicho rysuje swoje. Sesja z `--plugin-dir` ma osobny `$.store`, więc tryby trzeba w niej włączyć.

Typy (`tsc`) — po pierwszym załadowaniu z `--plugin-dir` silnik kładzie deklaracje w `.claude-plugin/types/`, wtedy `npx -p typescript@5 tsc -p .`.
