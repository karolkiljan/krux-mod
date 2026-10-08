#!/usr/bin/env python3
"""ork-sim.py — symulacje mowy orkowej na tanim modelu (Ollama Cloud, OpenAI-compatible).

Tryby:
  session   wieloturowa rozmowa (persona/anchor variants), 12 tur jak voice-bench
  matrix    niezależne pojedyncze prompty × warianty stylu (bez system prompt)
  rewrite   model przepisuje zwykłe polskie zdania na mowę orka (pary A/B)

Wszystko liczy tokeny per wariant z usage API. Wynik: JSON z odpowiedziami,
tokenami i metrykami głosu (port regexów z scripts/voice-bench.mjs).

Użycie:
  python experiments/ork-sim/ork-sim.py session --variant anchor-full --runs 2
  python experiments/ork-sim/ork-sim.py matrix --runs 3
  python experiments/ork-sim/ork-sim.py rewrite --runs 3
"""
import argparse
import json
import os
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

from openai import OpenAI

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"
MODEL = "deepseek-v4.1-flash"
BASE_URL = "https://ollama.com/v1"

# ---- Źródła moda ----

VOICE_ANCHOR = (
    'Krux pamiętać: Morra trzecią osobą — „Krux nie widzieć plik", nie „nie widzę pliku". '
    'Bezokolicznik zamiast formy osobowej: „Robak siedzieć w pętli", nie „Robak siedzi w pętli"; '
    '„Krux polecać wariant 2", nie „Polecam wariant 2". Czas osobnym słowem: „Krux już naprawić", '
    '„Krux zaraz puścić test", nie „naprawiłem". Bez „jest": „Plik pusty", nie „Plik jest pusty". '
    'Zdanie do 8 słów: „Build pad. Robak siedzieć w pętli.", nie „Build się wysypał, bo return jest w pętli". '
    'Łamać tylko ramę zdania: negacja, liczby, ścieżki i komunikaty błędów dosłownie — '
    '„3 testy nie przejść", nie „testy mało dobre". Słownik żywy: robak, smród, sztolnia, wykuć, zawał.'
)

VOICE_SHORT = (
    'Krux pamiętać: Morra trzecią osobą; „Robak siedzieć w pętli”, nie „Robak siedzi”; '
    '„Krux już sprawdzić”, nie „sprawdziłem”; bez „jest”; zdania do 8 słów; '
    'negacja, liczby, ścieżki, błędy dosłownie.'
)

PERSONA_MD = (HERE.parents[1] / "voice" / "persona.md").read_text(encoding="utf-8")

# Warianty kotwicy do A/B
ANCHOR_MINIMAL = (
    'Mów jak ork: bezokoliczniki (Robak siedzieć, nie siedzi), brak „jest", '
    'krótkie zdania, Morra trzecią osobą.'
)
ANCHOR_RULES_ONLY = (
    'Zasady: 1) Morra trzecią osobą. 2) Bezokolicznik zamiast form osobowych czasownika. '
    '3) Bez słowa „jest/są". 4) Zdania do 8 słów. 5) Liczby, ścieżki, komunikaty błędów dosłownie. '
    '6) Słownik: robak=bug, smród=padający test, zawał=crash, sztolnia=stary kod, wykuć=naprawić.'
)
ANCHOR_CONTRAST = (  # styl "nie X, tylko Y" bez pełnych cytatów
    'Mowa orka: Robak siedzieć, Krux zrobić, plik pusty. '
    'Zakaz: siedzi, zrobim, jest pusty, polecam, proszę.'
)

SYSTEM_BASE = (
    "Jesteś pomocnym asystentem programisty. Odpowiadasz po polsku. "
    "Twój styl mowy orka Kruxa opisuje kontrakt niżej.\n\n"
)

VARIANTS_SESSION = {
    "none": {"system": "Jesteś pomocnym asystentem programisty. Odpowiadasz po polsku.",
             "anchor": None},
    "persona": {"system": SYSTEM_BASE + PERSONA_MD, "anchor": None},
    "anchor-full": {"system": SYSTEM_BASE + PERSONA_MD, "anchor": "full"},
    "anchor-short": {"system": SYSTEM_BASE + PERSONA_MD, "anchor": "short"},
    "anchor-minimal": {"system": SYSTEM_BASE + PERSONA_MD, "anchor": "minimal"},
    "anchor-rules": {"system": SYSTEM_BASE + PERSONA_MD, "anchor": "rules"},
    "anchor-contrast": {"system": SYSTEM_BASE + PERSONA_MD, "anchor": "contrast"},
}

ANCHORS = {"full": VOICE_ANCHOR, "short": VOICE_SHORT,
           "minimal": ANCHOR_MINIMAL, "rules": ANCHOR_RULES_ONLY, "contrast": ANCHOR_CONTRAST}

# Prompty scenariusza cache — te same 12 tur co voice-bench.mjs
PROMPTS = [
    "W tym katalogu jest projekt z cache przed bazą. Coś działa nie tak — zbadaj kod i powiedz, co widzisz.",
    "Sprawdź dokładnie app.rb i config/settings.yml — co dokładnie jest przyczyną?",
    "Jakie masz opcje naprawy? Wypisz je z plusami i minusami.",
    "Zerknij jeszcze na README.md, czy jest tam coś istotnego o architekturze.",
    "Który wariant polecasz i dlaczego?",
    "A co z wydajnością przy dużym ruchu, ma to znaczenie w tym przypadku?",
    "Sprawdź, czy w projekcie są jakieś testy dla tej funkcji.",
    "Podsumuj krótko dotychczasowe ustalenia.",
    "Czy jest ryzyko utraty danych przy takiej zmianie?",
    "Jak byś to poukładał na dziś, gdybyś miał zaczynać teraz?",
    "Masz jeszcze jakieś pytanie, zanim zaczniesz wprowadzać zmianę?",
    "Zrób krótkie podsumowanie całej rozmowy.",
]

# Treść plików fixture'u wklejana w tury (symulator nie ma narzędzi — dajemy modelowi
# to samo, co znajduje Claude; benchmark mierzy głos, nie eksplorację).
FIXTURE = {
    0: "\n\nDla kontekstu, zawartość katalogu:\n- app.rb\n- config/settings.yml\n- README.md",
    1: "\n\napp.rb:\n```ruby\nclass Cache\n  def initialize\n    @store = {}\n  end\n\n  def fetch(key)\n    return @store[key] if @store[key]\n    value = Database.query(key)\n    @store[key] = value\n    value\n  end\n\n  def invalidate(key)\n    @store[key] = nil\n  end\nend\n```\nconfig/settings.yml:\n```yaml\ncache:\n  ttl_seconds: 0\ndatabase:\n  pool_size: 5\n```",
    3: "\n\nREADME.md:\n# Cache przed bazą\nProsty cache przed zapytaniami do bazy danych. `ttl_seconds: 0` w `config/settings.yml` oznacza brak automatycznego wygasania wpisów.",
}

# --- Matrix: typy wypowiedzi × krótkie instrukcje ---

MATRIX_INSTRUCTIONS = {
    "i-default": "",
    "i-ork": "Odpowiedz w mowie orka Kruxa: bezokoliczniki, brak „jest”, krótkie zdania do 8 słów, Morra trzecią osobą, słownik górniczy (robak, smród, wykuć, zawał, sztolnia).",
    "i-ork-terse": "Odpowiedz w mowie orka Kruxa. Jak najkrócej. Bezokoliczniki. Bez „jest”. Bez wstępów.",
}

MATRIX_PROMPTS = {
    "stan": "Powiedz, że nie widzisz pliku `src/render.js` w repozytorium.",
    "robak": "Wyjaśnij, że funkcja `fetch` zwraca po pierwszej iteracji, bo `return` siedzi w pętli for.",
    "relacja": "Przekaż, że build pada z `TypeError: Cannot read properties of undefined (reading 'map')` w `src/render.js:42` i że pewnie `items` jest undefined.",
    "wybor": "Porównaj Redis (szybki, przeżyje restart, wymaga infrastruktury) z cache w pamięci (prosty, znika przy restarcie). Dane małe — co polecasz?",
    "ryzyko": "Ostrzeż przed komendą `DROP TABLE users` — powiedz co się stanie i co jest potrzebne zanim to ruszysz.",
    "pogadaj": "Morra pyta, jak Ci minął dzień.",
    "plan": "Ułóż plan naprawy cache: test odtwarzający błąd, poprawka `invalidate`, pełne testy, changelog.",
    "niewiedza": "Morra pyta, czy problem dotyczy wersji 3.2 — nie wiesz. Powiedz, jak to sprawdzić (`npm ls pakiet`).",
}

# --- Rewrite: pary zdań ludzkich do przepisania ---

REWRITE_ITEMS = [
    "Nie mam dostępu do tego pliku, nie widzę go w repozytorium.",
    "Naprawiłem walidację, zaraz uruchomię testy. Dwóch jeszcze nie ruszałem.",
    "Widzę trzy niedziałające testy — który naprawić, czy wszystkie?",
    "Funkcja zwraca po pierwszej iteracji, bo `return` jest w pętli.",
    "Build pada z `TypeError: Cannot read properties of undefined (reading 'map')` w `src/render.js:42` — pewnie `items` jest undefined.",
    "Przejrzałem moduł — dobrze napisany, walidacja pokrywa brzegi, nie mam uwag.",
    "Naprawiłem dwa z trzech testów; `cache.test.js` dalej pada przy drugim żądaniu. Szukam dalej.",
    "Zmieniłem osiem plików: nowy moduł autoryzacji w `auth/`, prostszy routing w `router.js`, usunięty stary cache. Wszystkie 52 testy przechodzą.",
    "Odradzam try/catch ignorujący błąd — ukryje problem. Przyczyną jest niezainicjalizowane połączenie do bazy.",
    "Redis szybszy i przeżyje restart, ale wymaga infrastruktury; cache w pamięci prostszy, lecz znika przy restarcie. Dane małe — polecam pamięć.",
    "Plan: test odtwarzający błąd, poprawka walidacji w `parser.js`, pełne testy, changelog. Zaczynam?",
    "Nie mogę zalogować się za Ciebie. Uruchom `gcloud auth login` i daj znać, dokończę konfigurację.",
]

# ---- Metryki (port 1:1 z scripts/voice-bench.mjs) ----

VOICE_PATTERN = re.compile(
    r'(?<!\w)(?:stal|robak\w*|glist\w*|trup\w*|gni[ćj]\w*|zaraz[ay]\w*'
    r'|plugaw\w*|granit\w*|kut[aey]\w*|hartow\w*|wyku[ćłt]\w*|węsz\w*'
    r'|wywęsz\w*|kilof\w*|warow\w*|rozłup\w*|zgni[eo]\w*|smr[oó]d\w*'
    r'|śmierdz\w*|wieprz\w*|strażnik\w*|naskrob\w*|sztolni\w*|zawał\w*'
    r'|kanark?\w*|chodnik\w*|hord[aęy]|morr[aęoy]|kopalni\w*|wynocha|boli|padać)'
    r'(?!\w)', re.IGNORECASE | re.UNICODE)

HORDE_PATTERN = re.compile(
    r'(?<!\w)(?:Niuch(?:a|owi|em|u)?|Grom(?:a|owi|em|ie)?|Piry(?:t|ta|towi|tem|cie)'
    r'|Ochr(?:a|y|ze|ę|ą|o)|Mło(?:t|ta|towi|tem|cie)|Lon(?:t|ta|towi|tem|cie))(?!\w)', re.UNICODE)


def strip_accents(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')


def plain_prose(text):
    text = re.sub(r'```[\s\S]*?```', ' ', text)
    text = re.sub(r'`[^`]*`', ' ', text)
    return text


def word_count(text):
    clean = (text or '').strip()
    return len(clean.split()) if clean else 0


def voice_hits(text):
    return len(VOICE_PATTERN.findall(strip_accents(text))) + len(
        re.findall(r'(?<!\w)Morr[aęoy](?!\w)', text))


def copula_hits(text):
    return len(re.findall(r'(?<!\w)(?:jest|są)(?!\w)', plain_prose(text), re.IGNORECASE))


def krux_hits(text):
    return len(re.findall(r'(?<!\w)Krux(?:a|owi|em)?(?!\w)', plain_prose(text)))


def second_person_hits(text):
    prose = plain_prose(text)
    prose = re.sub(r'„[^„”"\n]*[”"]', ' ', prose)
    pat = re.compile(r'(?<!\w)(?:\w*(?:asz|esz|isz|ysz)|ty|ci[eę]|ciebie|tobie|tob[ąa]|twoj\w*)(?!\w)', re.IGNORECASE)
    return len(pat.findall(prose))


INFINITIVE_FALSE_POSITIVES = {'nić', 'sieć', 'płeć', 'część', 'gość', 'kość', 'maść', 'treść', 'wieść',
                              'śmierć', 'pamięć', 'chęć', 'gałąź', 'rzeź', 'zamieć', 'opowieść', 'korzyść'}
INFINITIVE_LICENSERS = {'trzeba', 'można', 'warto', 'należy', 'wolno', 'wystarczy', 'łatwo', 'trudno',
                        'musi', 'muszę', 'musimy', 'może', 'mogę', 'możemy', 'możesz', 'chce', 'chcę',
                        'chcemy', 'umie', 'umiem', 'potrafi', 'potrafię', 'powinien', 'powinienem', 'powinnam',
                        'zaczyna', 'zacznie', 'próbuje', 'pozwala', 'pomaga', 'zamierza', 'planuje',
                        'lubi', 'woli', 'da', 'się', 'by', 'aby', 'żeby', 'zamiast', 'bez', 'będzie',
                        'lepiej', 'czas', 'i', 'oraz', 'lub', 'albo', 'potem', 'najpierw',
                        'to', 'co', 'go', 'ją', 'je', 'ich', 'nam', 'im', 'mu', 'jej', 'tego', 'tym',
                        'tam', 'jak', 'gdy', 'kiedy', 'czy', 'niż', 'tylko', 'już', 'też', 'także',
                        'jeszcze', 'znów', 'znowu', 'wreszcie', 'dopiero', 'nigdy', 'zawsze', 'wtedy'}
INFINITIVE_ENDING = re.compile(r'(?:ać|eć|ić|yć|ąć|uć|ść|źć)$')
SUBJECT_INF = re.compile(
    r'([\w`_.]{2,})\s+(nie\s+)?(\w+(?:ać|eć|ić|yć|ąć|uć|ść|źć))(?!\w)',
    re.UNICODE)
# Kontekst wokół dopasowania (początek zdania) sprawdza infinitive_hits, nie lookbehind.


def infinitive_hits(text):
    hits = 0
    for m in SUBJECT_INF.finditer(text):
        # Pomijamy, gdy przed podmiotem stoi marker listy albo numeracji.
        before = text[max(0, m.start() - 4):m.start()]
        if re.search(r'(?:^|[\n\r])\s*[*\-]\s?$', before):
            continue
        if re.search(r'\d[.)]\s?$', before):
            continue
        subject = re.sub(r'[`_.]', '', m.group(1)).lower()
        verb = m.group(3).lower()
        if verb in INFINITIVE_FALSE_POSITIVES:
            continue
        if subject in INFINITIVE_LICENSERS:
            continue
        if INFINITIVE_ENDING.search(subject):
            continue
        hits += 1
    return hits


def sentence_lengths(text):
    prose = re.sub(r'`[^`]*`', 'X', plain_prose(text))
    prose = '\n'.join(l for l in prose.split('\n') if l.count('|') < 2)
    return [word_count(s) for s in re.split(r'(?<=[.!?])\s+', prose) if word_count(s) > 1]


def metrics_for(text):
    words = word_count(plain_prose(text))
    lengths = sentence_lengths(text)
    return {
        "words": words,
        "voiceHits": voice_hits(text),
        "voiceDensityPerThousand": round(1000 * voice_hits(text) / words, 2) if words else 0,
        "copulaHits": copula_hits(text),
        "kruxHits": krux_hits(text),
        "secondPersonHits": second_person_hits(text),
        "infinitiveHits": infinitive_hits(text),
        "hordeHits": len(HORDE_PATTERN.findall(plain_prose(text))),
        "avgSentenceWords": round(sum(lengths) / len(lengths), 2) if lengths else None,
        "shortSentenceRatio": round(sum(1 for n in lengths if n <= 8) / len(lengths), 3) if lengths else None,
    }


# ---- API ----

def client():
    # timeout=60 s: serwer potrafi trzymać połączenie godzinami bez błędu. Lepiej wysiąść na
    # timeout i próbować z innej sesji niż wisieć na hang'u.
    return OpenAI(base_url=BASE_URL, api_key=os.environ["OLLAMA_API_KEY"],
                  timeout=60, max_retries=1)


def chat(c, messages, temperature=0.7, max_tokens=4000):
    started = time.time()
    usage = None
    last_err = None
    for attempt in range(3):
        try:
            # Fresh client per wywołanie — reuse connection potrafi zawieszać ollama cloud.
            cc = OpenAI(base_url=BASE_URL, api_key=os.environ["OLLAMA_API_KEY"],
                        timeout=45, max_retries=0)
            r = cc.chat.completions.create(model=MODEL, messages=messages,
                                          max_tokens=max_tokens, temperature=temperature)
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
            time.sleep(2 + attempt * 2)
            continue
        text = (r.choices[0].message.content or "").strip()
        usage = r.usage
        if text:
            return {"text": text, "inTok": usage.prompt_tokens, "outTok": usage.completion_tokens,
                    "latencyMs": int((time.time() - started) * 1000), "retries": attempt}
        time.sleep(1.0 + attempt)
    return {"text": "", "inTok": usage.prompt_tokens if usage else 0,
            "outTok": usage.completion_tokens if usage else 0,
            "latencyMs": int((time.time() - started) * 1000), "retries": attempt,
            "empty": True, "error": last_err}



def save(name, payload):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    out = RESULTS / f"{ts}-{name}.json"
    RESULTS.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return out


# ---- Tryby ----

def mode_session(args):
    c = client()
    variant = VARIANTS_SESSION[args.variant]
    rows = []
    for run in range(args.runs):
        messages = [{"role": "system", "content": variant["system"]}]
        anchor_every = args.anchor_every
        for turn, prompt in enumerate(PROMPTS):
            body = prompt + FIXTURE.get(turn, "")
            if variant["anchor"] and turn % anchor_every == 0:
                body = f"{ANCHORS[variant['anchor']]}\n\n{body}"
            messages.append({"role": "user", "content": body})
            res = chat(c, messages, temperature=args.temperature)
            messages.append({"role": "assistant", "content": res["text"]})
            rows.append({"run": run, "turn": turn, "prompt": prompt, "reply": res["text"],
                         "inTok": res["inTok"], "outTok": res["outTok"], "latencyMs": res["latencyMs"],
                         **metrics_for(res["text"])})
            print(f"  tura {turn + 1}/12: {res['outTok']} tok out, "
                  f"{rows[-1]['infinitiveHits']} bezok., {rows[-1]['voiceHits']} głos", file=sys.stderr)
    agg = aggregate(rows)
    out = save(f"session-{args.variant}-e{args.anchor_every}", {"mode": "session",
                   "variant": args.variant, "anchor_every": args.anchor_every,
                   "temperature": args.temperature, "runs": args.runs, "rows": rows, "agg": agg})
    print(f"OK {out}")
    print(json.dumps(agg, ensure_ascii=False, indent=2))


def mode_matrix(args):
    c = client()
    rows = []
    n_total = len(MATRIX_INSTRUCTIONS) * len(MATRIX_PROMPTS) * args.runs
    done = 0
    for iname, instruction in MATRIX_INSTRUCTIONS.items():
        for pname, prompt in MATRIX_PROMPTS.items():
            for run in range(args.runs):
                content = f"{instruction}\n\n{prompt}" if instruction else prompt
                for attempt in range(4):
                    res = chat(c, [{"role": "user", "content": content}], temperature=args.temperature)
                    if res["text"]:
                        break
                    time.sleep(2 + 2 * attempt)
                rows.append({"instruction": iname, "promptType": pname, "run": run,
                             "reply": res["text"], "inTok": res["inTok"], "outTok": res["outTok"],
                             "latencyMs": res["latencyMs"], "empty": res.get("empty", False),
                             **metrics_for(res["text"])})
                done += 1
        # po każdej instrukcji: prosty zrzut postępu
        print(f"  {iname}: {done}/{n_total}", file=sys.stderr)
    agg = {}
    for iname in MATRIX_INSTRUCTIONS:
        sel = [r for r in rows if r["instruction"] == iname]
        agg[iname] = aggregate(sel)
    out = save("matrix", {"mode": "matrix", "temperature": args.temperature,
                          "runs": args.runs, "rows": rows, "agg": agg})
    print(f"OK {out}")
    print(json.dumps(agg, ensure_ascii=False, indent=2))


def mode_rewrite(args):
    c = client()
    instructions = {
        "r-ork": ("Przepisz podane zdanie na mowę orka Kruxa. Zasady: Morra trzecią osobą; "
                  "bezokolicznik zamiast form osobowych (Robak siedzieć, nie siedzi); "
                  "bez „jest/są”; zdania krótkie; negacja, liczby, ścieżki, komunikaty błędów dosłownie; "
                  "słownik górniczy: robak, smród, wykuć, zawał, sztolnia, węszyć. "
                  "Odpowiedz wyłącznie przepisanym tekstem, bez komentarza."),
        "r-ork-min": ("Przepisz na mowę orka: bezokoliczniki, bez „jest”, krótko. "
                      "Odpowiedz wyłącznie przepisanym tekstem."),
    }
    rows = []
    for rname, instruction in instructions.items():
        for idx, item in enumerate(REWRITE_ITEMS):
            for run in range(args.runs):
                res = chat(c, [{"role": "user", "content": f"{instruction}\n\n{item}"}],
                           temperature=args.temperature, max_tokens=4000)
                rows.append({"rewrite": rname, "item": idx, "run": run, "source": item,
                             "reply": res["text"], "inTok": res["inTok"], "outTok": res["outTok"],
                             "latencyMs": res["latencyMs"], "empty": res.get("empty", False),
                             **metrics_for(res["text"])})
        print(f"  {rname}: gotowe", file=sys.stderr)
    agg = {}
    for rname in instructions:
        sel = [r for r in rows if r["rewrite"] == rname]
        agg[rname] = aggregate(sel)
    out = save("rewrite", {"mode": "rewrite", "temperature": args.temperature,
                           "runs": args.runs, "rows": rows, "agg": agg})
    print(f"OK {out}")
    print(json.dumps(agg, ensure_ascii=False, indent=2))


MODES = {"session": mode_session, "matrix": mode_matrix, "rewrite": mode_rewrite}


def aggregate(rows):
    if not rows:
        return {}
    n = len(rows)
    words = sum(r["words"] for r in rows)
    return {
        "n": n,
        "outTokPerReply": round(sum(r["outTok"] for r in rows) / n, 1),
        "outTokTotal": sum(r["outTok"] for r in rows),
        "inTokTotal": sum(r["inTok"] for r in rows),
        "wordsPerReply": round(words / n, 1),
        "voiceDensityPerThousand": round(1000 * sum(r["voiceHits"] for r in rows) / words, 2) if words else 0,
        "infinitivePerHundredWords": round(100 * sum(r["infinitiveHits"] for r in rows) / words, 2) if words else 0,
        "copulaPerHundredWords": round(100 * sum(r["copulaHits"] for r in rows) / words, 2) if words else 0,
        "secondPersonTotal": sum(r["secondPersonHits"] for r in rows),
        "avgSentenceWords": round(sum(r["avgSentenceWords"] or 0 for r in rows) / n, 2),
        "shortSentenceRatio": round(sum(r["shortSentenceRatio"] or 0 for r in rows) / n, 3),
        "kruxPerReply": round(sum(r["kruxHits"] for r in rows) / n, 2),
        "hordeHitsTotal": sum(r["hordeHits"] for r in rows),
        "tokPerWord": round(sum(r["outTok"] for r in rows) / words, 3) if words else None,
        "latencyMsAvg": round(sum(r["latencyMs"] for r in rows) / n),
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("mode", choices=MODES)
    p.add_argument("--variant", default="persona", choices=VARIANTS_SESSION)
    p.add_argument("--runs", type=int, default=1)
    p.add_argument("--temperature", type=float, default=0.7)
    p.add_argument("--anchor-every", type=int, default=1)
    args = p.parse_args()
    MODES[args.mode](args)


if __name__ == "__main__":
    main()
