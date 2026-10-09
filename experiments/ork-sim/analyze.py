#!/usr/bin/env python3
"""analyze.py — zbiera wyniki matrix/rewrite w tabele per model; skleja przebiegi i regapy.

Wiersz tej samej komórki (model, instrukcja, typ/element, runda) może wystąpić w kilku
plikach (pierwotny przebieg + późniejsze dorobienie regapem). Sklejanie: pliki w kolejności
chronologicznej, późniejszy wygrywa, ale pusty wiersz nigdy nie nadpisuje niepustego.

Użycie:
  python experiments/ork-sim/analyze.py matrix
  python experiments/ork-sim/analyze.py rewrite
  python experiments/ork-sim/analyze.py fidelity
  python experiments/ork-sim/analyze.py all
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def fmt(x, nd=2):
    if x is None:
        return "—"
    if isinstance(x, float):
        return f"{x:.{nd}f}"
    return str(x)


def cell_key(kind, row):
    if kind == "matrix":
        return (row["model"], row["instruction"], row["promptType"], row["run"])
    return (row["model"], row["rewrite"], row["item"], row["run"])


def collect(kind):
    """Wiersze danego trybu sklejone per komórka + lista plików per model (do śladu)."""
    merged = {}
    files_per_model = {}
    for p in sorted(RESULTS.glob(f"*{kind}-*.json")):
        if ".partial" in p.name:
            continue
        d = load(p)
        model = d.get("model")
        if not model or d.get("mode") != kind:
            continue
        files_per_model.setdefault(model, []).append(p.name)
        for r in d.get("rows", []):
            if r.get("model") != model:
                continue
            key = cell_key(kind, r)
            prev = merged.get(key)
            if prev is not None and not prev.get("empty") and r.get("empty"):
                continue
            merged[key] = r
    return merged, files_per_model


def aggregate(rows):
    n = len(rows)
    if not n:
        return {}
    words = sum(r["words"] for r in rows)
    return {
        "n": n,
        "outTokPerReply": round(sum(r["outTok"] for r in rows) / n, 1),
        "wordsPerReply": round(words / n, 1),
        "voiceDensityPerThousand": round(1000 * sum(r["voiceHits"] for r in rows) / words, 2) if words else 0,
        "infinitivePerHundredWords": round(100 * sum(r["infinitiveHits"] for r in rows) / words, 2) if words else 0,
        "copulaPerHundredWords": round(100 * sum(r["copulaHits"] for r in rows) / words, 2) if words else 0,
        "secondPersonTotal": sum(r["secondPersonHits"] for r in rows),
        "avgSentenceWords": round(sum(r["avgSentenceWords"] or 0 for r in rows) / n, 2),
        "tokPerWord": round(sum(r["outTok"] for r in rows) / words, 3) if words else None,
        "empty": sum(1 for r in rows if r.get("empty")),
        "invented": sum(r.get("inventedCount", 0) for r in rows),
        "dropped": sum(r.get("droppedCount", 0) for r in rows),
    }


def model_stats(kind):
    merged, files = collect(kind)
    per_model = {}
    for key, r in merged.items():
        per_model.setdefault(r["model"], []).append(r)
    return per_model, files


def analyze_matrix():
    per_model, files = model_stats("matrix")
    print("## Matrix — per model × instrukcja\n")
    hdr = ("model", "instr", "n", "out/odp", "sł/odp", "głos/1k", "bezok/100", "cop/100",
           "2os", "avgSł", "tok/sł", "wynal.", "puste")
    print("| " + " | ".join(hdr) + " |")
    print("|" + "---|" * len(hdr))
    for model in sorted(per_model):
        rows = per_model[model]
        instructions = sorted({r["instruction"] for r in rows})
        for iname in instructions:
            sel = [r for r in rows if r["instruction"] == iname]
            a = aggregate(sel)
            print("| " + " | ".join([
                model, iname, fmt(a.get("n")),
                fmt(a.get("outTokPerReply"), 0), fmt(a.get("wordsPerReply"), 1),
                fmt(a.get("voiceDensityPerThousand"), 1),
                fmt(a.get("infinitivePerHundredWords")),
                fmt(a.get("copulaPerHundredWords")),
                fmt(a.get("secondPersonTotal"), 0),
                fmt(a.get("avgSentenceWords"), 1),
                fmt(a.get("tokPerWord")),
                fmt(a.get("invented"), 0), fmt(a.get("empty"), 0),
            ]) + " |")
    print()
    for model in sorted(files):
        print(f"pliki {model}: " + ", ".join(files[model]))
    print()


def analyze_rewrite():
    per_model, files = model_stats("rewrite")
    print("## Rewrite — per model × instrukcja\n")
    hdr = ("model", "instr", "n", "out/odp", "sł/odp", "głos/1k", "bezok/100", "cop/100",
           "2os", "wynal.", "zgub.", "puste")
    print("| " + " | ".join(hdr) + " |")
    print("|" + "---|" * len(hdr))
    for model in sorted(per_model):
        rows = per_model[model]
        names = sorted({r["rewrite"] for r in rows})
        for rname in names:
            sel = [r for r in rows if r["rewrite"] == rname]
            a = aggregate(sel)
            print("| " + " | ".join([
                model, rname, fmt(a.get("n")),
                fmt(a.get("outTokPerReply"), 0), fmt(a.get("wordsPerReply"), 1),
                fmt(a.get("voiceDensityPerThousand"), 1),
                fmt(a.get("infinitivePerHundredWords")),
                fmt(a.get("copulaPerHundredWords")),
                fmt(a.get("secondPersonTotal"), 0),
                fmt(a.get("invented"), 0), fmt(a.get("dropped"), 0), fmt(a.get("empty"), 0),
            ]) + " |")
    print()

    # Per-item: wynalazki/zguby i semantyczne skręty (dla wszystkich modeli)
    print("### Rewrite per-item — pozycje z wynalazkami albo zgubami\n")
    print("| model | instr | item | wynalazki | zguby |")
    print("|---|---|---|---|---|")
    seen = False
    for model in sorted(per_model):
        for r in sorted(per_model[model], key=lambda x: (x["rewrite"], x["item"], x["run"])):
            inv, dr = r.get("inventedTokens") or [], r.get("droppedTokens") or []
            if inv or dr:
                seen = True
                print(f"| {model} | {r['rewrite']} | {r['item']} | {', '.join(inv) or '—'} | {', '.join(dr) or '—'} |")
    if not seen:
        print("| — | — | — | — | — |")
    print()
    for model in sorted(files):
        print(f"pliki {model}: " + ", ".join(files[model]))
    print()


def analyze_fidelity_examples():
    """Przykłady wynalazków w matrixie (wszystkie modele po scaleniu)."""
    per_model, _ = model_stats("matrix")
    for model in sorted(per_model):
        rows = [r for r in per_model[model] if r.get("inventedTokens")]
        print(f"### Matrix — przykłady wynalazków ({model})\n")
        if not rows:
            print("(brak)\n")
            continue
        shown = set()
        for r in rows:
            sig = (r["instruction"], r["promptType"])
            if sig in shown:
                continue
            shown.add(sig)
            print(f"- **{r['instruction']}/{r['promptType']}**: {r['inventedTokens']}")
            print(f"  > {(r['reply'] or '')[:200].replace(chr(10), ' ')}")
        print()


def analyze_barks():
    """Barks: per model × instrukcja + tabela sytuacji (rytuał, powtórzenia, słownik)."""
    per_model, files = model_stats("barks")
    if not per_model:
        print("## Barks — brak danych\n")
        return
    print("## Barks — per model × instrukcja\n")
    hdr = ("model", "instr", "n", "out/odp", "sł/odp", "głos/1k", "bezok/100", "cop/100",
           "rytuał", "powt.", "gwara", "puste")
    print("| " + " | ".join(hdr) + " |")
    print("|" + "---|" * len(hdr))
    for model in sorted(per_model):
        rows = per_model[model]
        names = sorted({r["barks"] for r in rows})
        for bname in names:
            sel = [r for r in rows if r["barks"] == bname]
            a = aggregate(sel)
            ritual = sum(r.get("ritualHits", 0) for r in sel)
            rep = sum(r.get("repetitionHits", 0) for r in sel)
            mine = sum(r.get("mineHits", 0) for r in sel)
            print("| " + " | ".join([
                model, bname, fmt(a.get("n")),
                fmt(a.get("outTokPerReply"), 0), fmt(a.get("wordsPerReply"), 1),
                fmt(a.get("voiceDensityPerThousand"), 0),
                fmt(a.get("infinitivePerHundredWords")),
                fmt(a.get("copulaPerHundredWords")),
                fmt(ritual, 0), fmt(rep, 0), fmt(mine, 0), fmt(a.get("empty"), 0),
            ]) + " |")
    print()

    # Per-sytuacja (pierwszy model, run 0): przegląd jakości
    for model in sorted(per_model):
        rows = [r for r in per_model[model] if r["barks"] == "b-ork" and r["run"] == 0]
        if not rows:
            continue
        print(f"### Barks per-sytuacja ({model}, b-ork, run 0) — 10.4 słowa/odp cel\n")
        print("| sytuacja | głos | ryt. | powt. | odpowiedź |")
        print("|---|---:|---:|---:|---|")
        for r in sorted(rows, key=lambda x: x["situation"]):
            reply = (r["reply"] or "").replace("\n", " ").replace("|", "/")[:110]
            print(f"| {r['situation']} | {r['voiceHits']} | {r.get('ritualHits', 0)} | {r.get('repetitionHits', 0)} | {reply} |")
        print()
    for model in sorted(files):
        print(f"pliki {model}: " + ", ".join(files[model]))
    print()


def analyze_sessions():
    """Sesje 12-turowe: per model × wariant — trend bezokoliczników i dryfu po turach."""
    per_model, files = model_stats("session")
    if not per_model:
        print("## Session — brak danych (nowe kotwice)\n")
        return
    print("## Session — per model × wariant (nowe kotwice)\n")
    hdr = ("model", "wariant", "n", "out/odp", "sł/odp", "głos/1k", "bezok/100", "cop/100",
           "2os", "avgSł", "krótkie%", "puste")
    print("| " + " | ".join(hdr) + " |")
    print("|" + "---|" * len(hdr))
    for model in sorted(per_model):
        rows = per_model[model]
        variants = sorted({r.get("variant") for r in rows})
        for v in variants:
            sel = [r for r in rows if r.get("variant") == v]
            a = aggregate(sel)
            short = sum(r.get("shortSentenceRatio") or 0 for r in sel) / len(sel) if sel else 0
            print("| " + " | ".join([
                model, str(v), fmt(a.get("n")),
                fmt(a.get("outTokPerReply"), 0), fmt(a.get("wordsPerReply"), 1),
                fmt(a.get("voiceDensityPerThousand"), 1),
                fmt(a.get("infinitivePerHundredWords")),
                fmt(a.get("copulaPerHundredWords")),
                fmt(a.get("secondPersonTotal"), 0),
                fmt(a.get("avgSentenceWords"), 2), f"{short:.2f}",
                fmt(a.get("empty"), 0),
            ]) + " |")
    print()

    # Trend bezokoliczników per tura — porównanie wariantów (mid-session drift)
    models = sorted(per_model)
    if models:
        print("### Bezokoliczniki per tura (pierwszy model, wszystkie warianty, run 0)\n")
        model = models[0]
        variants = sorted({r.get("variant") for r in per_model[model] if r.get("variant")})
        print("| tura | " + " | ".join(variants) + " |")
        print("|---|" + "---|" * len(variants))
        for turn in range(12):
            vals = []
            for v in variants:
                sel = [r for r in per_model[model] if r.get("variant") == v and r.get("turn") == turn and r.get("run") == 0]
                vals.append(str(sel[0]["infinitiveHits"]) if sel else "—")
            print(f"| {turn + 1} | " + " | ".join(vals) + " |")
        print()
    for model in sorted(files):
        print(f"pliki {model}: " + ", ".join(files[model]))
    print()


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which in ("matrix", "all"):
        analyze_matrix()
    if which in ("rewrite", "all"):
        analyze_rewrite()
    if which in ("barks", "all"):
        analyze_barks()
    if which in ("session", "all"):
        analyze_sessions()
    if which in ("fidelity", "all"):
        analyze_fidelity_examples()


if __name__ == "__main__":
    main()
