---
name: przed-wydaniem
description: Checki przed wydaniem moda Krux: validate --strict, test, testy skryptów, tsc, diff check, próba tagu, instalacja z marketplace i zrzut ekranu TUI. Użyj przed wydaniem, przy release albo gdy Morra pyta, co uruchomić przed publikacją.
---

# Przed wydaniem

Uruchom z korzenia repo, w tej kolejności:

```bash
claude plugin validate --strict .
claude plugin test .
node --test tests/scripts-regression.mjs
npx -p typescript@5 tsc -p .
git diff --check
claude plugin tag --dry-run .
```

`--strict` traktuje ostrzeżenia jak błędy, tak jak każe krok „Validate” w docs publikacji. `plugin tag --dry-run` (po commicie wydania, bo brudne drzewo odrzuca) sprawdza, że drzewo jest czyste, tag jeszcze nie istnieje, a wersja z `plugin.json` zgadza się z wpisem marketplace (wpis wersji nie ma, więc rozstrzyga manifest). Sam tag (`claude plugin tag . --push`, nazwa `krux-mod--v<wersja>`) jest potrzebny dopiero wtedy, gdy inny plugin zadeklaruje zakres wersji na ten; do tego czasu wystarcza próba.

## Wersja i instalacja

Wersję podbija się tylko w `.claude-plugin/plugin.json`. Użytkownicy instalują przez marketplace, więc przed wydaniem trzeba sprawdzić tę ścieżkę, nie tylko `--plugin-dir`:

```bash
claude plugin marketplace add ./
claude plugin install krux-mod@krux-mod-marketplace
claude plugin list
```

Marketplace dodany ze ścieżki lokalnej czyta plugin w miejscu: `claude plugin list` pokazuje `Read from:` z katalogiem repo. Potem sesja w terminalu i `/krux status`. Instalacja z GitHuba kopiuje plugin do cache wersji; Desktop bierze nową wersję po `claude plugin update krux-mod@krux-mod-marketplace` i restarcie sesji.

Wygląd (ramki, kolory, układ) `claude plugin test` nie widzi: testy sprawdzają drzewo, nie farbę silnika. Zrzut prawdziwego ekranu, z modem z tego folderu i tanim modelem (transkrypt sesji dziecka się nie zapisuje):

```bash
python3 -m venv .venv && .venv/bin/pip install pyte
.venv/bin/python scripts/tui-shot.py --cols 120 --rows 40 --cmd 'claude --model haiku' \
  'until:Try:30' 'type:Powiedz: tak.' 'key:enter' 'until:done:120' 'wait:4' 'shot' 'fg:⚒ Krux'
```

Szerokość pod 144 kolumny pokazuje pas bez panelu Sztolni, 180 z panelem. Przy podpowiedzi komend `key:esc` przed `key:enter`, inaczej Enter bierze podświetloną. Sesja dziecka dzieli `$.store` z prawdziwymi: przełączony tryb trzeba przełączyć z powrotem i sprawdzić `/krux status`. Odrzucone drzewo `ui.render` silnik zgłasza w transkrypcie tylko przy `--plugin-dir .` (`--cmd 'claude --model haiku --plugin-dir .'`); bez tego cicho rysuje swoje. Sesja z `--plugin-dir` ma osobny `$.store`, więc tryby trzeba w niej włączyć.

Typy (`tsc`) wymagają deklaracji w `.claude-plugin/types/`: silnik kładzie je po pierwszym załadowaniu z `--plugin-dir`, a `tsconfig.json` je rozszerza.
