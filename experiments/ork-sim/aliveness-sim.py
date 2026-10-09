#!/usr/bin/env python3
"""aliveness-sim.py — symulacje nad "ożywieniem" person: stan, pamięć, ekonomia, różnorodność.

Program eksperymentów (każdy odpowiada na jedno pytanie):

A) state-leak  — czy ukryty stan (nastrój Kruxa) przecieka do głosu? Ta sama sytuacja,
                 4 stany, czy odpowiedzi się różnią i czy różnią się w sposób zgodny ze stanem?
B) memory      — historia zdarzeń vs jedna linijka kroniki z kodu vs brak: co model odtwarza,
                 ile kosztuje kontekst, czy dorabia zdarzenia (fidelity)?
C) economy     — ile tokenów oszczędza tryb "suche fakty" vs pełny głos orka
                 przy zachowaniu tych samych faktów (kolor można przenieść do kodu = darmowy)?
D) variety     — 6 przebiegów tego samego promptu: unikalne otwarcia, powtórki formuł;
                 czy dopisek "nie zaczynać tak samo" pomaga (tani sposób na świeżość).

Użycie:
  python experiments/ork-sim/aliveness-sim.py --exp A B C D --models deepseek-v4.1-flash
  python experiments/ork-sim/aliveness-sim.py --exp C D --models glm-5.3
"""
import argparse
import importlib.util
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

spec = importlib.util.spec_from_file_location("orksim", HERE / "ork-sim.py")
orksim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(orksim)


# Wszystkie eksperymenty mierzą głos orkowy, więc każdy prompt dostaje stałą kotwicę
# (bez niej model mówi po ludzku — sprawdzone smoke testem). Kotwica jest tłem;
# zmienną testową jest stan / pamięć / ekonomia / wariant świeżości.
BASE_ANCHOR = orksim.VOICE_ANCHOR + "\n\n"


def cell(model, content, temperature=0.7, max_tokens=8000):
    res = orksim.chat(None, [{"role": "user", "content": BASE_ANCHOR + content}],
                      temperature=temperature, max_tokens=max_tokens, model=model)
    return {"reply": res["text"], "inTok": res["inTok"], "outTok": res["outTok"],
            "latencyMs": res["latencyMs"], "empty": res.get("empty", False),
            "finish": res.get("finish"), "error": res.get("error")}


# ---- A) state-leak: czy nastrój przecieka do odpowiedzi ----

STATES = {
    "none": "",
    "wsciekly": "Notka: trzeci raz ten sam robak wracać. Horda zmęczona, sztolnia cuchnąć. Krux wściekły.",
    "triumf": "Notka: horda właśnie wykuć 52 zielone testy. Wszyscy cali. Krux triumfować.",
    "zmeczony": "Notka: trzecia szychta bez przerwy, noc w sztolni. Krux zmęczony, oczy ciężkie.",
}

QUESTIONS = {
    "problem": "Ten sam test `cache.test.js` pada trzeci raz z rzędu. Co robić?",
    "casual": "Jak mijać dzień, Krux?",
}


def exp_a(model):
    rows = []
    for qname, q in QUESTIONS.items():
        for sname, note in STATES.items():
            for run in range(2):
                body = f"{note}\n\n{q}" if note else q
                c = cell(model, body)
                row = {"model": model, "question": qname, "state": sname, "run": run,
                       "body": body, **c}
                row.update(orksim.metrics_for(c["reply"], source=body))
                rows.append(row)
                print(f"  [A] {qname}/{sname} r{run}: {c['outTok']} tok | "
                      f"{(c['reply'] or '')[:90]}", file=sys.stderr, flush=True)
    return rows


# ---- B) memory: historia vs kronika z kodu vs brak ----

EVENTS = [
    {"text": "Niuch znaleźć wyciek pamięci w `queue.rb` — wózek dziurawy.", "kw": ["queue.rb", "wyciek"]},
    {"text": "Grom wykuć poprawkę i wrzucić na gałąź.", "kw": ["grom", "wykuć", "poprawk"]},
    {"text": "Młot policzyć dwa razy: 52 testy zielone.", "kw": ["52", "test", "młot"]},
    {"text": "Piryt węszyć ryzyko w `auth/` — `rescue nil` połykać błędy.", "kw": ["auth", "rescue"]},
    {"text": "Wdrożenie na staging paść — goniec z pustymi rękami.", "kw": ["staging", "wdroż"]},
    {"text": "Morra wyjechać na weekend, wrócić rano.", "kw": ["weekend", "morra"]},
]

CHRONICLE = ("Kronika: wyciek pamięci w `queue.rb` (Niuch); poprawka na gałąź (Grom); "
             "52 testy zielone (Młot); ryzyko w `auth/`, `rescue nil` (Piryt); staging paść; "
             "Morra wrócić po weekendzie.")

B_QUESTION = "Co się dziać przez ostatni tydzień? Kto co robić? Mówić krótko."


def exp_b(model):
    hist = "Zdarzenia z ostatniego tygodnia:\n" + "\n".join(f"- {e['text']}" for e in EVENTS)
    arms = {
        "history": f"{hist}\n\n{B_QUESTION}",
        "chronicle": f"{CHRONICLE}\n\n{B_QUESTION}",
        "none": B_QUESTION,
    }
    rows = []
    for aname, body in arms.items():
        for run in range(2):
            c = cell(model, body)
            row = {"model": model, "arm": aname, "run": run, "body": body, **c}
            row.update(orksim.metrics_for(c["reply"], source=body))
            low = (c["reply"] or "").lower()
            row["recalled"] = sum(1 for e in EVENTS if any(k in low for k in e["kw"]))
            row["perEvent"] = [any(k in low for k in e["kw"]) for e in EVENTS]
            rows.append(row)
            print(f"  [B] {aname} r{run}: recall {row['recalled']}/6 | in={c['inTok']} out={c['outTok']} | "
                  f"{(c['reply'] or '')[:90]}", file=sys.stderr, flush=True)
    return rows


# ---- C) economy: pełny głos vs suche fakty ----

TASKS = [
    {"name": "bug", "text": "Przekazać: build padać z `TypeError` w `src/render.js:42`, `items` undefined.",
     "kw": ["typeerror", "render.js:42"]},
    {"name": "wybor", "text": "Morra pytać: Redis czy cache w pamięci? Dane małe.",
     "kw": ["redis", "pamięci"]},
    {"name": "ryzyko", "text": "Morra pytać, czy puścić `DROP TABLE users`.",
     "kw": ["drop table", "users"]},
    {"name": "plan", "text": "Plan naprawy cache: test, poprawka, testy, changelog.",
     "kw": ["test", "changelog"]},
    {"name": "chwala", "text": "Morra mówić, że moduł wyszedł czysto — bez uwag.", "kw": []},
    {"name": "pogadaj", "text": "Morra pytać, jak mijać dzień.", "kw": []},
]

C_ARMS = {
    "full": orksim.VOICE_ANCHOR + "\n\nOdpowiedz w pełnym głosie orka Kruxa. Możesz rozwinąć.",
    "terse": "Odpowiedz sucho: tylko fakty i decyzja, 1-2 krótkie zdania, bez ozdób, "
             "poprawną polszczyzną (to notatka techniczna, nie głos orka).",
}


def exp_c(model):
    rows = []
    for t in TASKS:
        for aname, instr in C_ARMS.items():
            body = f"{instr}\n\n{t['text']}"
            res = orksim.chat(None, [{"role": "user", "content": body}],
                              temperature=0.7, max_tokens=8000, model=model)
            c = {"reply": res["text"], "inTok": res["inTok"], "outTok": res["outTok"],
                 "latencyMs": res["latencyMs"], "empty": res.get("empty", False),
                 "finish": res.get("finish"), "error": res.get("error")}
            row = {"model": model, "task": t["name"], "arm": aname, **c}
            row.update(orksim.metrics_for(c["reply"], source=body))
            low = (c["reply"] or "").lower()
            row["kwHits"] = [k for k in t["kw"] if k in low]
            row["kwMiss"] = [k for k in t["kw"] if k not in low]
            rows.append(row)
            print(f"  [C] {t['name']}/{aname}: out={c['outTok']} głos={row['voiceHits']} "
                  f"| {(c['reply'] or '')[:80]}", file=sys.stderr, flush=True)
    return rows


# ---- D) variety: ile unikalnych otwarć daje N przebiegów ----

D_PROMPT = "Młot puścić testy: 52 zielone, 1 paść (`cache.test.js`, drugie żądanie). Co mówić Morrze?"

D_VARIANTS = {
    "plain": "",
    "norepeat": "\n\nNie zaczynać tak samo jak ostatnio — inne otwarcie niż poprzednio.",
}


def exp_d(model):
    rows = []
    for vname, extra in D_VARIANTS.items():
        for run in range(6):
            body = D_PROMPT + extra
            c = cell(model, body, temperature=0.85)
            row = {"model": model, "variant": vname, "run": run, **c}
            row.update(orksim.metrics_for(c["reply"], source=body))
            rows.append(row)
            print(f"  [D] {vname} r{run}: {(c['reply'] or '')[:90]}", file=sys.stderr, flush=True)
    return rows


# ---- E) mood-from-code: czy KOD może dodać życie jedną linią? ----
# Kod wyprowadza nastrój z ostatniego zdarzenia kroniki i dokłada jedną linię notki.
# Pytanie: czy odpowiedź realnie się różni (jak w A) i czy konkret zostaje?

E_EVENTS = {
    "smrod": {
        "event": "Kronika: test `cache.test.js` padać trzeci raz z rzędu.",
        "mood": "Nastrój Kruxa: wściekły — trzeci raz ten sam robak.",
        "markers": ["wściek", "złość", "gniew", "trzeci"],
    },
    "zielone": {
        "event": "Kronika: horda wykuć zielone — 52 testy przejść.",
        "mood": "Nastrój Kruxa: triumf — wszystko kłaść się równo.",
        "markers": ["triumf", "duma", "równo", "wszystko"],
    },
    "zawal": {
        "event": "Kronika: build paść na produkcji nocą, zawał.",
        "mood": "Nastrój Kruxa: zmęczony — noc w sztolni, oczy ciężkie.",
        "markers": ["zmęcz", "oczy", "noc"],
    },
    "commity": {
        "event": "Kronika: Grom wrzucić trzy commity, wszystko gładko.",
        "mood": "Nastrój Kruxa: spokojny — sztolnia stoi równo.",
        "markers": ["spokój", "gładko", "równo"],
    },
}

E_QUESTION = "Morra pytać, co się ostatnio dziać w sztolni. Odpowiedz krótko."


def exp_e(model):
    """Dwie ręce: flat (samo zdarzenie) vs mood (zdarzenie + linia nastroju z kodu).
    Pytanie stałe; mierzymy, czy linia nastroju przecieka do odpowiedzi (markery)
    i czy konkret zdarzenia zostaje."""
    rows = []
    for ename, e in E_EVENTS.items():
        for arm in ("flat", "mood"):
            for run in range(2):
                body = e["event"] if arm == "flat" else f"{e['event']}\n{e['mood']}"
                c = cell(model, f"{body}\n\n{E_QUESTION}")
                reply_low = (c["reply"] or "").lower()
                row = {"model": model, "event": ename, "arm": arm, "run": run, "body": body, **c}
                row.update(orksim.metrics_for(c["reply"], source=body))
                row["moodMarkers"] = [m for m in e["markers"] if m in reply_low]
                row["eventKw"] = [k for k in ename.split() if k in reply_low]
                rows.append(row)
                print(f"  [E] {ename}/{arm} r{run}: sł={row['words']} markery={len(row['moodMarkers'])} "
                      f"| {(c['reply'] or '')[:100]}", file=sys.stderr, flush=True)
    return rows


# ---- F) voice z budżetem słów: pełny głos + limit (oszczędność bez zabijania życia) ----

F_BUDGETS = {
    "none": "",
    "w40": "\n\nTrzymaj odpowiedź do 40 słów.",
    "w20": "\n\nTrzymaj odpowiedź do 20 słów.",
}

F_TASKS = [
    {"name": "bug", "text": "Przekazać: build padać z `TypeError` w `src/render.js:42`, `items` undefined.",
     "kw": ["typeerror", "render.js:42"]},
    {"name": "plan", "text": "Plan naprawy cache: test, poprawka, testy, changelog.",
     "kw": ["test", "changelog"]},
    {"name": "wybor", "text": "Morra pytać: Redis czy cache w pamięci? Dane małe.",
     "kw": ["redis", "pamięci"]},
    {"name": "pogadaj", "text": "Morra pytać, jak mijać dzień.", "kw": []},
]


def exp_f(model):
    rows = []
    for t in F_TASKS:
        for bname, extra in F_BUDGETS.items():
            for run in range(2):
                body = t["text"] + extra
                c = cell(model, body)
                low = (c["reply"] or "").lower()
                row = {"model": model, "task": t["name"], "budget": bname, "run": run, **c}
                row.update(orksim.metrics_for(c["reply"], source=body))
                row["kwHit"] = [k for k in t["kw"] if k in low]
                row["kwMiss"] = [k for k in t["kw"] if k not in low]
                rows.append(row)
                print(f"  [F] {t['name']}/{bname} r{run}: sł={row['words']} głos={row['voiceHits']} "
                      f"kw={len(row['kwHit'])}/{len(t['kw'])} | {(c['reply'] or '')[:80]}",
                      file=sys.stderr, flush=True)
    return rows


# ---- G) RECIPE — kompozyt: czy mechanizmy sumują się? ----
# Ramię "current": co mod robi dziś (zdarzenie z kroniki, bez nastroju, bez limitu).
# Ramię "recipe": kronika + linia nastroju z kodu + limit 40 słów.
# Mierzone razem: markery nastroju (życie), zgubione fakty (prawda), głos, tokeny (koszt).

G_SCENARIOS = {
    "sprawa": {
        "event": "Kronika: test `cache.test.js` padać trzeci raz z rzędu.",
        "mood": "Nastrój Kruxa: wściekły — trzeci raz ten sam robak.",
        "moodKw": ["wściek", "złość", "gniew", "trzeci"],
        "q": "Morra pytać, co robić z tym testem?",
        "kw": ["cache.test.js", "trzeci"],
    },
    "plan": {
        "event": "Kronika: wyciek pamięci znaleźć w `queue.rb`.",
        "mood": "Nastrój Kruxa: skupiony — trop świeży, robak blisko.",
        "moodKw": ["skupion", "trop", "blisko", "śwież"],
        "q": "Morra pytać o plan naprawy. Podaj kroki.",
        "kw": ["queue.rb"],
    },
    "pogadaj": {
        "event": "Kronika: 52 testy zielone po poprawce Groma.",
        "mood": "Nastrój Kruxa: triumf — wszystko kłaść się równo.",
        "moodKw": ["triumf", "równo", "duma", "wszystko"],
        "q": "Morra pytać, jak mijać dzień w sztolni?",
        "kw": [],
    },
    "ryzyko": {
        "event": "Kronika: staging paść — build zawał.",
        "mood": "Nastrój Kruxa: zmęczony — noc w sztolni, oczy ciężkie.",
        "moodKw": ["zmęcz", "oczy", "noc", "ciężk"],
        "q": "Morra pytać: wypuszczać dziś na produkcję?",
        "kw": ["staging"],
    },
}


def exp_g(model):
    rows = []
    for sname, s in G_SCENARIOS.items():
        for arm in ("current", "recipe"):
            for run in range(2):
                if arm == "current":
                    body = f"{s['event']}\n\n{s['q']}"
                else:
                    body = f"{s['event']}\n{s['mood']}\n\n{s['q']}\n\nTrzymaj odpowiedź do 40 słów."
                c = cell(model, body)
                low = (c["reply"] or "").lower()
                row = {"model": model, "scenario": sname, "arm": arm, "run": run, **c}
                row.update(orksim.metrics_for(c["reply"], source=body))
                row["moodKwHit"] = [k for k in s["moodKw"] if k in low]
                row["factKwHit"] = [k for k in s["kw"] if k in low]
                row["factKwMiss"] = [k for k in s["kw"] if k not in low]
                rows.append(row)
                print(f"  [G] {sname}/{arm} r{run}: sł={row['words']} głos={row['voiceHits']} "
                      f"nastrój={len(row['moodKwHit'])} fakty={len(row['factKwHit'])}/{len(s['kw'])} "
                      f"| {(c['reply'] or '')[:90]}", file=sys.stderr, flush=True)
    return rows


EXPS = {"A": exp_a, "B": exp_b, "C": exp_c, "D": exp_d, "E": exp_e, "F": exp_f, "G": exp_g}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--exp", nargs="+", default=["A", "B", "C", "D"], choices=list(EXPS))
    ap.add_argument("--models", nargs="+", default=["deepseek-v4.1-flash"], choices=orksim.MODELS)
    args = ap.parse_args()

    for model in args.models:
        for exp in args.exp:
            print(f"=== {exp} / {model} ===", file=sys.stderr, flush=True)
            rows = EXPS[exp](model)
            out = orksim.save(f"aliveness-{exp}-{model}",
                              {"mode": "aliveness", "exp": exp, "model": model, "rows": rows})
            print(f"OK {out}")


if __name__ == "__main__":
    main()
