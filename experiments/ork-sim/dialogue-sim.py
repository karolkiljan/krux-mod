#!/usr/bin/env python3
"""dialogue-sim.py — symulowane rozmowy hordy: kilka orków gada ze sobą, my obserwujemy.

Osobne zadanie od pomiarów (ork-sim.py). Tu nie mierzymy pojedynczej odpowiedzi, tylko
PROWADZIMY scenę: każdy ork to osobny system prompt (persona Kruxa + skrót fikcyjnego
życia + fach z moda), tury idą po kolei, a transkrypt zapisujemy i analizujemy.

Scenariusze (--scene):
  kuźnia     Krux + Grom + Młot: kłótnia o to, jak naprawić padający test
  noc        Krux + Niuch: nocna zmiana, Niuch wraca z zwiadu z przyczyną buga
  ocena      Krux + Piryt + Ochra: review kodu przed wydaniem
  rozbiórka  Krux + Lont: decyzja o usunięciu starego modułu

Użycie:
  python experiments/ork-sim/dialogue-sim.py --scene kuźnia --model deepseek-v4.1-flash
  python experiments/ork-sim/dialogue-sim.py --scene noc --turns 8 --model glm-5.3-flash
"""
import argparse
import importlib.util
import json
import sys
import time
from pathlib import Path

from openai import OpenAI

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"

spec = importlib.util.spec_from_file_location("orksim", HERE / "ork-sim.py")
orksim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(orksim)

# --- Persony hordy (z hooks/roster.ts + persona.md: fach, charakter, fartuch) ---

HORDE = {
    "Niuch": {
        "trade": "zwiad, debug, przyczyna błędu",
        "trait": "węszy wszędzie i mówi półsłówkami",
        "speech": "Zwiadowca. Mówi krótko, półsłówkami, jakby węszył trop. Często przerywa sobie — ślad… i drugi ślad. Nie kończy myśli, dopóki nie wróci z mapą. Bezokoliczniki, bez jest, słownik: węszyć, ślad, trop, ciemność, nor.",
    },
    "Grom": {
        "trade": "kuźnia: backend, API, dane",
        "trait": "mówi głośno i każdą sprawę chce wykuć od nowa",
        "speech": "Kowal. Głośny, uparty, wszystko chce przekuć od zera. Mówi rozkazami i grzmi. Bezokoliczniki, bez jest, słownik: kuźnia, młot, wykuć, kowadło, stal, palenisko.",
    },
    "Piryt": {
        "trade": "ocena: review, ryzyko",
        "trait": "zrzędzi i w każdej stali widzi pęknięcie",
        "speech": "Oceniający. Zrzędzi, w każdej robocie widzi wadę, ale zawsze ma powód. Mówi z przekąsem, długo jak na orka. Bezokoliczniki, bez jest, słownik: pęknięcie, rysa, próba, zgnilizna, wada.",
    },
    "Ochra": {
        "trade": "frontend, UI",
        "trait": "pilnuje równych brzegów i kolorów",
        "speech": "Frontendowiec. Pedantyczny, mówi o brzegach, kolorach i układzie. Spokojniejszy niż reszta. Bezokoliczniki, bez jest, słownik: brzeg, barwa, równo, krzywo, szpara.",
    },
    "Młot": {
        "trade": "testy, weryfikacja",
        "trait": "liczy wszystko dwa razy i nie wierzy na słowo",
        "speech": "Tester. Liczy wszystko dwa razy, nie wierzy na słowo, żąda dowodu. Krótkie zdania jak uderzenia młota. Bezokoliczniki, bez jest, słownik: próba, stal, dwa razy, dowód, liczyć.",
    },
    "Lont": {
        "trade": "rozbiórka: martwy kod, refaktor",
        "trait": "kocha rozbiórkę, ale lont mierzy trzy razy",
        "speech": "Rozbiórkowy. Kocha wysadzać starą robotę, ale najpierw mierzy trzy razy. Cieszy się z burzenia. Bezokoliczniki, bez jest, słownik: lont, proch, gruz, burzyć, zwalić, miara.",
    },
}

KRUX_SPEECH = (
    "Krux — ork z Górniczej Doliny, kowal kodu, dowódca hordy. W Trzecim Chodniku przeżył zawał, "
    "bo rozkaz ratunkowy miał za dużo słów. Od tamtej zmiany tnie zdanie, aż zostanie sam sens. "
    "Bezokoliczniki, bez jest, zdania do 8 słów, człowiek to dla niego Morra (trzecią osobą), "
    "słownik: robak, smród, sztolnia, wykuć, zawał, horda."
)

# --- Scenariusze: sytuacja + kolejność mówców + punkty wiedzy per postać ---

SCENES = {
    "kuźnia": {
        "situation": (
            "Sztolnia: test `cache.test.js` pada przy drugim żądaniu. Cache trzyma stare dane po `invalidate`. "
            "Trzeba zdecydować, jak naprawić — i kto to zrobi."
        ),
        "order": ["Krux", "Grom", "Młot", "Krux", "Grom", "Młot", "Krux", "Młot"],
        "knowledge": {
            "Krux": "Widziałeś, że `invalidate` ustawia `nil`, a `fetch` sprawdza `if @store[key]` — więc stare wartości wracają. Chcesz naprawić bez przepisywania całego cache.",
            "Grom": "Uważasz, że cały cache do przepisania od zera — wasza droga jest stara, jak stare kowadło. Proponujesz nowy moduł z TTL.",
            "Młot": "Nie wierzysz nikomu na słowo. Żądasz testu, który pokaże błąd PRZED poprawką. Liczysz: 52 testy przechodzą, więc skąd wiadomo, że poprawka coś da?",
        },
    },
    "noc": {
        "situation": (
            "Nocna zmiana w sztolni. Buduje się na produkcji i coś pada: `TypeError: Cannot read properties "
            "of undefined (reading 'map')` w `src/render.js:42`. Niuch właśnie wrócił ze zwiadu z tropem."
        ),
        "order": ["Krux", "Niuch", "Krux", "Niuch", "Krux", "Niuch"],
        "knowledge": {
            "Krux": "Czekasz na raport Niucha. Wiesz, że ostatnio ktoś zmieniał `items` w API. Nie chcesz zgadywać.",
            "Niuch": "Znalazłeś trop: API zwraca `items: null` gdy koszyk jest pusty, a nie pustą tablicę. `render.js` robi `items.map()` bez sprawdzenia. To jest sprawca.",
        },
    },
    "ocena": {
        "situation": (
            "Przed wydaniem wersji. Piryt zrobił review modułu autoryzacji w `auth/`, Ochra ocenia ekran logowania. "
            "Krux decyduje, czy wypuszczać."
        ),
        "order": ["Krux", "Piryt", "Ochra", "Krux", "Piryt", "Ochra", "Krux"],
        "knowledge": {
            "Krux": "Słuchasz ocen. Chcesz wiedzieć, co blokuje wydanie, a co jest do zapisania na później.",
            "Piryt": "Znalazłeś w `auth/` obsługę błędów, która połyka wyjątki z bazy (`rescue nil`). Reszta solidna, ale to pęknięcie — przy awarii bazy nikt się nie dowie.",
            "Ochra": "Ekran logowania: brzegi równe, kolory spójne, ale przy błędnym haśle komunikat wchodzi na przycisk — na wąskim ekranie. To szpara, którą trzeba zasypać.",
        },
    },
    "rozbiórka": {
        "situation": (
            "Stary moduł `legacy/export.rb` ma 800 linii i nikt nie wie, czy czegoś jeszcze używa. "
            "Zespół decyduje: refaktor czy wysadzić i napisać od nowa."
        ),
        "order": ["Krux", "Lont", "Krux", "Lont", "Krux"],
        "knowledge": {
            "Krux": "Chcesz wyburzyć, ale boisz się, że coś tego używa. Każesz zmierzyć trzy razy przed odpaleniem lontu.",
            "Lont": "Zmierzyłeś: `grep` pokazuje 4 wywołania, ale 3 to testy. Jedno prawdziwe — w `orders_controller`. Proponujesz najpierw odciąć to jedno, potem wysadzić całość.",
        },
    },
}


# --- Nastrój z kodu: deterministyczna funkcja sytuacja -> stan postaci (jak eksperyment E) ---
# Kod wyprowadza stan z sytuacji sceny; model ponosi go dalej. Test w rozmowie wielopodmiotowej.

MOODS = {
    "kuźnia": {
        "Krux": "Nastrój Kruxa: wściekły — trzeci raz ten sam robak w cache.",
        "Grom": "Nastrój Groma: zapalony — widzi nowe kowadło, stary cache do przepalenia.",
        "Młot": "Nastrój Młota: sceptyczny — 52 testy przechodzą, żaden nie łapie robaka.",
    },
    "noc": {
        "Krux": "Nastrój Kruxa: czujny — noc, produkcja pada, nie chce zgadywać.",
        "Niuch": "Nastrój Niucha: podniecony — trop świeży, ślad prowadzi do API.",
    },
    "ocena": {
        "Krux": "Nastrój Kruxa: skupiony — decyzja o wydaniu, liczy każde pęknięcie.",
        "Piryt": "Nastrój Piryta: zrzędliwy — znalazł pęknięcie, reszta go nie widzi.",
        "Ochra": "Nastrój Ochry: niespokojna — szpara na ekranie, brzegi nie równe.",
    },
    "rozbiórka": {
        "Krux": "Nastrój Kruxa: ostrożny — chce burzyć, ale boi się, że coś używa.",
        "Lont": "Nastrój Lonta: podekscytowany — miara w ręku, lont gotowy.",
    },
}

# słowa-klucze nastroju per scena (do pomiaru obecności stanu w dialogu)
MOOD_KW = {
    "kuźnia": ["wściek", "złość", "trzeci", "zapal", "kowad", "sceptyc", "dowód", "przepal"],
    "noc": ["czujn", "zgadyw", "podniec", "trop", "śwież"],
    "ocena": ["skupion", "pęknięc", "zrzędl", "niespokojn", "szpar"],
    "rozbiórka": ["ostrożn", "burzyć", "podekscyt", "lont", "miara"],
}


def persona_system(who):
    """System prompt jednego orka: tożsamość + sposób mówienia + zakazy."""
    if who == "Krux":
        return ("Jest to symulacja rozmowy hordy orków z Górniczej Doliny. Grasz Kruxa — dowódcę hordy. "
                "Odpowiadasz WYŁĄCZNIE jako Krux, jedną wypowiedzią (2–4 krótkie zdania). "
                + KRUX_SPEECH +
                " Nie komentujesz sceny, nie jesteś narratorem, nie piszesz cudzych kwestii.")
    mate = HORDE[who]
    return (f"Jest to symulacja rozmowy hordy orków z Górniczej Doliny. Grasz {who} — orka o fachu: {mate['trade']}. "
            f"Charakter: {mate['trait']}. Odpowiadasz WYŁĄCZNIE jako {who}, jedną wypowiedzią (2–4 krótkie zdania). "
            f"Sposób mówienia: {mate['speech']} "
            "Mówisz do Kruxa (dowódcy), nie do człowieka. Nie komentujesz sceny, nie jesteś narratorem, "
            "nie piszesz cudzych kwestii.")


def scene_prompt(scene, who, history, mood_line=None):
    """Prompt gracza: sytuacja + akcja + historia rozmowy (+ linia nastroju z kodu)."""
    parts = [f"Sytuacja w sztolni: {scene['situation']}",
             f"Twoja wiedza: {scene['knowledge'][who]}"]
    if mood_line:
        parts.append(mood_line)
    parts.append("")
    if history:
        parts.append("Dotychczasowa rozmowa:")
        for speaker, line in history:
            parts.append(f"{speaker}: {line}")
        parts.append("")
    parts.append(f"Teraz mówi {who}. Napisz TYLKO jego wypowiedź (2–4 krótkie zdania), bez imienia na początku.")
    return "\n".join(parts)


def run_scene(name, model, turns, temperature=0.8, variant="flat"):
    scene = SCENES[name]
    order = scene["order"][:turns]
    history = []
    rows = []
    print(f"=== SCENA: {name} | model: {model} | wariant: {variant} | tur: {len(order)} ===", file=sys.stderr)
    for i, who in enumerate(order):
        mood_line = MOODS.get(name, {}).get(who) if variant == "mood" else None
        messages = [
            {"role": "system", "content": persona_system(who)},
            {"role": "user", "content": scene_prompt(scene, who, history, mood_line=mood_line)},
        ]
        res = orksim.chat(None, messages, temperature=temperature, max_tokens=8000, model=model)
        line = (res["text"] or "").strip()
        # usuń ewentualne „Krux:" z początku, jeśli model je dodał
        for prefix in (f"{who}:", f"**{who}:**", f"{who} —"):
            if line.startswith(prefix):
                line = line[len(prefix):].strip()
        history.append((who, line))
        low = line.lower()
        row = {"model": model, "turn": i, "speaker": who, "line": line, "outTok": res["outTok"],
               "latencyMs": res["latencyMs"], "empty": res.get("empty", False),
               "finish": res.get("finish"), "variant": variant,
               **orksim.metrics_for(line, source=scene["situation"])}
        row["moodKwHit"] = [k for k in MOOD_KW.get(name, []) if k in low]
        rows.append(row)
        print(f"  [{who}] {line[:160]}", file=sys.stderr, flush=True)
    return rows, scene


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--scene", choices=SCENES, required=True)
    p.add_argument("--model", default="deepseek-v4.1-flash", choices=orksim.MODELS)
    p.add_argument("--turns", type=int, default=99, help="limit tur (domyślnie cała scena)")
    p.add_argument("--temperature", type=float, default=0.8)
    p.add_argument("--variant", choices=["flat", "mood"], default="flat",
                   help="flat: bez nastroju | mood: linia stanu z kodu per postać")
    args = p.parse_args()

    stamp = orksim._stamp()
    tag = f"dialogue-{args.scene}-{args.variant}-{args.model}"
    _, note = orksim.partial_writer(stamp, tag)
    rows, scene = run_scene(args.scene, args.model, args.turns, args.temperature, args.variant)
    for r in rows:
        note(r)

    # transkrypt czytelny dla człowieka
    transcript = [f"# Scena: {args.scene} ({args.model})", "", f"_{scene['situation']}_", ""]
    for r in rows:
        transcript.append(f"**{r['speaker']}:** {r['line']}")
        transcript.append("")
    tpath = RESULTS / f"{stamp}-transcript-{args.scene}-{args.variant}-{args.model}.md"
    RESULTS.mkdir(parents=True, exist_ok=True)
    tpath.write_text("\n".join(transcript), encoding="utf-8")

    out = orksim.save(tag,
                      {"mode": "dialogue", "scene": args.scene, "model": args.model,
                       "temperature": args.temperature, "variant": args.variant, "rows": rows},
                      stamp=stamp)
    print(f"OK {out}")
    print(f"TRANSCRIPT {tpath}")


if __name__ == "__main__":
    main()
