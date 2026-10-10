# Zakaz ruchów nieodwracalnych u Lonta stoi w prompcie, nie w blokadzie

Lont (`agents/lont.md`) ma Bash, a zakaz `git reset --hard`, `git clean`, `rm -rf` i podobnych stoi tylko w jego prompcie; zgodę na każde wywołanie daje silnik, tak samo jak w głównej pętli. Mod nie blokuje narzędzi sam, bo Lont nie może więcej niż Krux w tej samej sesji (te same zgody, `permissionMode` rodzica): blokada tylko u kumpla chroniłaby wąski przypadek, a obok zgód silnika stawiałaby drugą ścieżkę, której testy moda nie widzą.

## Rozważone opcje

- **`tool.check` w `register.ts` z `isDestructive`**: odrzucone. Łamie niezmiennik „zgody na narzędzia obsługuje wyłącznie silnik”, blokowałby też Kruxa, a `isDestructive` celowo zawyża — fałszywy alarm ma kosztować turę pełnych zdań, nie zatrzymaną robotę.
- **`hooks.PreToolUse` w pliku agenta** (pole `hooks` definicji agenta w typach silnika): odrzucone na teraz. Wejście hooka i ścieżka do skryptu to kontrakt silnika, którego `claude plugin test` nie uruchamia, więc zepsuta blokada albo milczałaby, albo zatrzymałaby Lonta przy każdym `git grep`.
- **`disallowedTools`**: zabiera narzędzie po nazwie, czyli cały Bash, a Lont potrzebuje `git grep`, `git ls-files` i testów.

## Konsekwencje

Sesja bez pytań o zgodę (`bypassPermissions`) przepuści u Lonta to samo, co u Kruxa. Gdy Lont ma pracować bez nadzoru człowieka, wracamy do hooka w pliku agenta, z testem na prawdziwym silniku (`scripts/tui-shot.py`).
