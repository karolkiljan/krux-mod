#!/usr/bin/env python3
"""regap.py — dorabia pojedyncze komórki wyników: puste albo ucięte na budżecie.

Wczytuje plik wyników (matrix albo rewrite), wybiera wiersze puste (`empty`) albo
ucięte na capie (`outTok >= --cap`), przepuszcza je ponownie z większym budżetem
i zapisuje jako nowy plik `<stamp>-regap-<mode>-<model>.json`. `analyze.py` skleja
pliki per komórka: późniejszy niepusty wiersz wygrywa, pusty nigdy nie nadpisuje.

Użycie:
  python experiments/ork-sim/regap.py <plik-wynikow.json> [--max-tokens 12000] [--cap 4000]
"""
import argparse
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

spec = importlib.util.spec_from_file_location("orksim", HERE / "ork-sim.py")
orksim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(orksim)


def rebuild_content(mode, row):
    """Odtwarza dokładny prompt komórki z oryginalnego przebiegu."""
    if mode == "matrix":
        instruction = orksim.MATRIX_INSTRUCTIONS[row["instruction"]]
        prompt = orksim.MATRIX_PROMPTS[row["promptType"]]
        return f"{instruction}\n\n{prompt}" if instruction else prompt
    if mode == "rewrite":
        instruction = orksim.REWRITE_INSTRUCTIONS[row["rewrite"]]
        item = orksim.REWRITE_ITEMS[row["item"]]
        return f"{instruction}\n\n{item}"
    raise SystemExit(f"nieznany tryb: {mode}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("results_file")
    p.add_argument("--max-tokens", type=int, default=12000)
    p.add_argument("--cap", type=int, default=4000,
                   help="budżet oryginalnego przebiegu; outTok >= cap znaczy ucięte")
    args = p.parse_args()

    path = Path(args.results_file)
    if not path.exists():
        path = HERE / "results" / args.results_file
    data = json.loads(path.read_text(encoding="utf-8"))
    mode, model = data["mode"], data["model"]

    bad = [r for r in data["rows"] if r.get("empty") or r["outTok"] >= args.cap]
    print(f"{mode}/{model}: wierszy {len(data['rows'])}, do dorobienia {len(bad)}", file=sys.stderr)
    if not bad:
        print("nic do dorobienia")
        return

    stamp = orksim._stamp()
    _, note = orksim.partial_writer(stamp, f"regap-{mode}-{model}")
    fixed = []
    for r in bad:
        content = rebuild_content(mode, r)
        res = orksim.chat(None, [{"role": "user", "content": content}],
                          temperature=data.get("temperature", 0.7),
                          max_tokens=args.max_tokens, model=model)
        row = dict(r)
        row.update({"reply": res["text"], "inTok": res["inTok"], "outTok": res["outTok"],
                    "latencyMs": res["latencyMs"], "empty": res.get("empty", False),
                    "finish": res.get("finish"), "retries": res.get("retries"),
                    "error": res.get("error"), "regap": True})
        row.update(orksim.metrics_for(res["text"], source=content))
        fixed.append(row)
        note(row)
        label = r.get("instruction") or r.get("rewrite")
        cell = r.get("promptType") if mode == "matrix" else r.get("item")
        print(f"  {label}/{cell} r{r['run']}: {res['outTok']} tok, {res['latencyMs']} ms"
              f"{' EMPTY' if res.get('empty') else ''} (finish={res.get('finish')})",
              file=sys.stderr, flush=True)

    out = orksim.save(f"regap-{mode}-{model}",
                      {"mode": mode, "model": model,
                       "temperature": data.get("temperature", 0.7),
                       "regap_of": path.name, "max_tokens": args.max_tokens, "rows": fixed},
                      stamp=stamp)
    print(f"OK {out}")


if __name__ == "__main__":
    main()
