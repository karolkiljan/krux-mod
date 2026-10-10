#!/usr/bin/env python3
# Kumpel w ostatnim zdaniu odpowiedzi w turach, w których notka o hordzie mówi
# „w środku”, i echo słowa „nastrój” z linii nastroju. `hordeClosings` benchu liczy
# ostatni akapit we wszystkich turach z hordą, także tam, gdzie notka sama każe
# „na końcu”, a odpowiedź z jednego akapitu zawsze ma kumpla w ostatnim akapicie.
#
# Notki o hordzie padają w turach 2, 5, 8 i 11 (liczone od 0: QUIET_TURNS = 2, kumpel
# w każdej turze z notką), a `pick(PLACES, tura + 1)` daje „na końcu” w 2 i 8,
# „w środku” w 5 i 11. Gdy zmieni się QUIET_TURNS albo PLACES, tury trzeba policzyć od nowa.
#
#   python3 scripts/mate-closings.py K=benchmarks/haiku-ab/K/smrod S=benchmarks/straznik/S/smrod
import glob, json, re, sys
NAMES = re.compile(r'(?<![^\W\d_])(?:Niuch(?:a|owi|em|u)?|Grom(?:a|owi|em|ie)?|Piry(?:t|ta|towi|tem|cie)|Ochr(?:a|y|ze|ę|ą|o)|Mło(?:t|ta|towi|tem|cie)|Lon(?:t|ta|towi|tem|cie))(?![^\W\d_])')
ECHO = re.compile(r'(?<![^\W\d_])nastr[oó]\w*', re.I)
def prose(t): return re.sub(r'`[^`]*`', 'X', re.sub(r'```[\s\S]*?```', ' ', t))
def text(x): return x if isinstance(x, str) else x.get('text', '')
for arg in sys.argv[1:]:
    label, path = arg.split('=', 1)
    runs = sorted(glob.glob(f'{path}/*/responses.json'))
    scenario = 'smrod' if 'smrod' in path else 'cache'
    turns = [5] if scenario == 'smrod' else [5, 11]
    out = []
    for turn in turns:
        mate = last = 0
        for f in runs:
            t = prose(text(json.load(open(f))[turn]))
            if not NAMES.search(t): continue
            mate += 1
            sentences = [s for s in re.split(r'(?<=[.!?])\s+|\n+', t.strip()) if re.search(r'[^\W\d_]', s)]
            if NAMES.search(sentences[-1]): last += 1
        out.append(f't{turn}: kumpel {mate}/{len(runs)}, w ostatnim zdaniu {last}')
    echo = sum(len(ECHO.findall(prose(text(r)))) for f in runs for r in json.load(open(f)))
    print(f'{label:3} {scenario:5} n={len(runs)}  ' + '; '.join(out) + f'; echo „nastrój”: {echo}')
