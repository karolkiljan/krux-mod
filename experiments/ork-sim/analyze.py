#!/usr/bin/env python3
"""analyze.py — zbiera wyniki matrix/rewrite z results/*.json w tabele porównawcze.

Użycie:
  python experiments/ork-sim/analyze.py matrix
  python experiments/ork-sim/analyze.py rewrite
  python experiments/ork-sim/analyze.py all
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"


def latest(pattern):
    """Najnowszy plik (bez .partial.jsonl) pasujący do wzorca."""
    files = [p for p in RESULTS.glob(pattern) if p.suffix == ".json"]
    if not files:
        return None
    return max(files, key=lambda p: p.name)


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def fmt(x, nd=2):
    if x is None:
        return "—"
    if isinstance(x, float):
        return f"{x:.{nd}f}"
    return str(x)


def analyze_matrix():
    """Tabela: model × instrukcja — metryki ze wszystkich plików matrix-<model>.json."""
    models = {}
    for p in RESULTS.glob("*matrix-*.json"):
        if ".partial" in p.name:
            continue
        d = load(p)
        model = d.get("model", "?")
        # bierz najnowszy per model
        if model not in models or p.name > models[model][0].name:
            models[model] = (p, d)
    print("## Matrix — per model × instrukcja\n")
    hdr = ("model", "instr", "n", "out/odp", "głos/1k", "bezok/100", "cop/100", "2os", "avgSł", "tok/sł", "wynalazki")
    print("| " + " | ".join(hdr) + " |")
    print("|" + "---|" * len(hdr))
    for model, (p, d) in sorted(models.items()):
        for iname, agg in d.get("agg", {}).items():
            rows_m = [r for r in d["rows"] if r["instruction"] == iname]
            invented = sum(r.get("inventedCount", 0) for r in rows_m)
            print("| " + " | ".join([
                model, iname, fmt(agg.get("n")),
                fmt(agg.get("outTokPerReply"), 0),
                fmt(agg.get("voiceDensityPerThousand"), 1),
                fmt(agg.get("infinitivePerHundredWords")),
                fmt(agg.get("copulaPerHundredWords")),
                fmt(agg.get("secondPersonTotal"), 0),
                fmt(agg.get("avgSentenceWords"), 1),
                fmt(agg.get("tokPerWord")),
                fmt(invented, 0),
            ]) + " |")
    print()


def analyze_rewrite():
    """Tabela: model × instrukcja + per-item fidelity (wynalazki/zguby)."""
    models = {}
    for p in RESULTS.glob("*rewrite-*.json"):
        if ".partial" in p.name:
            continue
        d = load(p)
        model = d.get("model", "?")
        if model not in models or p.name > models[model][0].name:
            models[model] = (p, d)
    print("## Rewrite — per model × instrukcja\n")
    hdr = ("model", "instr", "n", "out/odp", "głos/1k", "bezok/100", "cop/100", "2os", "wynal.", "zgub.", "puste")
    print("| " + " | ".join(hdr) + " |")
    print("|" + "---|" * len(hdr))
    for model, (p, d) in sorted(models.items()):
        for rname, agg in d.get("agg", {}).items():
            rows_m = [r for r in d["rows"] if r["rewrite"] == rname]
            invented = sum(r.get("inventedCount", 0) for r in rows_m)
            dropped = sum(r.get("droppedCount", 0) for r in rows_m)
            empty = sum(1 for r in rows_m if r.get("empty"))
            print("| " + " | ".join([
                model, rname, fmt(agg.get("n")),
                fmt(agg.get("outTokPerReply"), 0),
                fmt(agg.get("voiceDensityPerThousand"), 1),
                fmt(agg.get("infinitivePerHundredWords")),
                fmt(agg.get("copulaPerHundredWords")),
                fmt(agg.get("secondPersonTotal"), 0),
                fmt(invented, 0),
                fmt(dropped, 0),
                fmt(empty, 0),
            ]) + " |")
    print()

    # Per-item: gdzie wynalazki/zguby (dla modelu z najnowszym plikiem)
    if models:
        model, (p, d) = max(models.items(), key=lambda kv: kv[1][0].name)
        print(f"### Rewrite per-item ({model}) — pozycje z wynalazkami albo zgubami\n")
        print("| instr | item | wynalazki | zguby |")
        print("|---|---|---|---|")
        for r in d["rows"]:
            inv, dr = r.get("inventedTokens") or [], r.get("droppedTokens") or []
            if inv or dr:
                print(f"| {r['rewrite']} | {r['item']} | {', '.join(inv) or '—'} | {', '.join(dr) or '—'} |")
        print()


def analyze_fidelity_examples():
    """Najciekawsze odpowiedzi: pokaż fragmenty z wynalazkami."""
    p, d, model = None, None, None
    for pp in sorted(RESULTS.glob("*matrix-*.json")):
        if ".partial" in pp.name:
            continue
        if p is None or pp.name > p.name:
            p, d = pp, load(pp)
            model = d.get("model")
    if not d:
        print("### Matrix — brak plików z wynikami\n")
        return
    print(f"### Matrix — przykłady wynalazków ({model})\n")
    shown = 0
    for r in d["rows"]:
        if r.get("inventedTokens") and shown < 6:
            print(f"- **{r['instruction']}/{r['promptType']}**: wynalazki {r['inventedTokens']}")
            print(f"  > {r['reply'][:200].replace(chr(10), ' ')}")
            shown += 1
    print()


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which in ("matrix", "all"):
        analyze_matrix()
    if which in ("rewrite", "all"):
        analyze_rewrite()
    if which in ("fidelity", "all"):
        analyze_fidelity_examples()


if __name__ == "__main__":
    main()
