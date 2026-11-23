import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.request import urlopen


MODEL_ORIGIN = (
    "https://huggingface.co/mydubber-org/nllb-200-distilled-600M-ct2-int8/"
    "resolve/9e63a771e9ec358ef812d2ea149d97e16d5f8cee/"
)
MODEL_SHA = "2dd4860e679616ff223f46b7d8262d816996a7f25aea0adc39836131b1ef8558"
MODEL_FILES = ("config.json", "shared_vocabulary.json", "sentencepiece.bpe.model", "model.bin")
LANGUAGES = {
    "ar": "arb_Arab", "bg": "bul_Cyrl", "cs": "ces_Latn", "da": "dan_Latn",
    "de": "deu_Latn", "el": "ell_Grek", "en": "eng_Latn", "es": "spa_Latn",
    "fa": "pes_Arab", "fi": "fin_Latn", "fr": "fra_Latn", "he": "heb_Hebr",
    "hi": "hin_Deva", "hu": "hun_Latn", "id": "ind_Latn", "it": "ita_Latn",
    "ja": "jpn_Jpan", "ko": "kor_Hang", "nl": "nld_Latn", "no": "nob_Latn",
    "pl": "pol_Latn", "pt": "por_Latn", "ro": "ron_Latn", "ru": "rus_Cyrl",
    "sv": "swe_Latn", "th": "tha_Thai", "tr": "tur_Latn", "uk": "ukr_Cyrl",
    "vi": "vie_Latn", "zh": "zho_Hans",
}
TARGETS = {"tr": LANGUAGES["tr"], "en": LANGUAGES["en"]}
PUNCTUATION = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-"})


def log(value):
    print(value, file=sys.stderr, flush=True)


def install_runtime(path, provision):
    path.mkdir(parents=True, exist_ok=True)
    sys.path.insert(0, str(path))
    try:
        import ctranslate2  # noqa: F401
        import sentencepiece  # noqa: F401
        import langid  # noqa: F401
    except ImportError:
        if not provision:
            raise
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--disable-pip-version-check",
             "--no-cache-dir", "--target", str(path), "ctranslate2==4.9.1",
             "sentencepiece==0.2.3", "langid==1.1.6"],
            check=True, stdout=sys.stderr,
        )


def prepare_model(model, provision):
    absent = [name for name in MODEL_FILES if not (model / name).is_file()]
    if absent and not provision:
        raise FileNotFoundError(", ".join(absent))
    model.mkdir(parents=True, exist_ok=True)
    for name in absent:
        with tempfile.NamedTemporaryFile(dir=model, delete=False) as pending:
            path = Path(pending.name)
            try:
                with urlopen(MODEL_ORIGIN + name, timeout=45) as source:
                    shutil.copyfileobj(source, pending, length=1024 * 1024)
            except BaseException:
                pending.close()
                path.unlink(missing_ok=True)
                raise
        if name == "model.bin":
            with path.open("rb") as payload:
                digest = hashlib.file_digest(payload, "sha256").hexdigest()
            if digest != MODEL_SHA:
                path.unlink(missing_ok=True)
                raise ValueError("Model checksum mismatch")
        path.replace(model / name)


def detect(title, summary, source, identifier):
    sample = " ".join((title, summary))
    if re.search(r"[぀-ヿ]", sample):
        return "ja"
    if re.search(r"[가-힯]", sample):
        return "ko"
    if re.search(r"[一-鿿]", sample):
        return "zh"
    if "Anadolu Ajansı" in source or re.search(r"[şğıİ]", sample):
        return "tr"
    latin_words = re.findall(r"[A-Za-z]{2,}", sample)
    if len(latin_words) <= 2 and not re.search(r"[^\u0000-ɏ]", sample):
        return None
    detected, confidence = identifier.classify(sample)
    if detected not in LANGUAGES:
        return "en"
    if detected != "en" and confidence < 0.78 and re.fullmatch(r"[\u0000-\x7f]+", sample):
        return "en"
    return detected


def translate(records, engine, tokenizer, identifier, batch_limit):
    jobs = {}
    output = []
    done = 0
    for row in records:
        day, title, url, source = row[:4]
        summary = row[4] if len(row) > 4 else ""
        existing = row[5] if len(row) > 5 and isinstance(row[5], dict) else {}
        source_language = detect(title, summary, source, identifier)
        localized = {lang: dict(existing.get(lang, {})) for lang in TARGETS}
        output.append([day, title, url, source, summary, localized])
        for lang in TARGETS:
            for field, value in (("title", title), ("summary", summary)):
                if not value or localized[lang].get(field):
                    continue
                if not source_language or source_language == lang:
                    localized[lang][field] = value
                    continue
                route = (LANGUAGES[source_language], TARGETS[lang])
                jobs.setdefault(route, {}).setdefault(value, []).append((localized[lang], field))
    total = sum(len(values) for values in jobs.values())
    for (src, target), values in jobs.items():
        ordered = sorted(values, key=len)
        for offset in range(0, len(ordered), batch_limit):
            originals = ordered[offset:offset + batch_limit]
            tokens = [[src, *tokenizer.encode(text.translate(PUNCTUATION), out_type=str), "</s>"] for text in originals]
            decoded = engine.translate_batch(
                tokens, target_prefix=[[target]] * len(tokens), beam_size=1,
                max_batch_size=1024, batch_type="tokens", max_decoding_length=148,
            )
            for source_text, result in zip(originals, decoded, strict=True):
                words = result.hypotheses[0]
                if words and words[0] == target:
                    words = words[1:]
                clean = re.sub(r"\s+", " ", tokenizer.decode(words).replace("⁇", "")).strip()
                if target == TARGETS["tr"]:
                    clean = re.sub(r"\bAI\b", "yapay zekâ", clean)
                    if clean.startswith("yapay zekâ"):
                        clean = "Y" + clean[1:]
                if clean:
                    for item, field in values[source_text]:
                        item[field] = clean
            done += len(originals)
            if done % batch_limit == 0 or done == total:
                log(f"Translated {done}/{total} text fields")
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--runtime", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--provision", action="store_true")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    os.environ["OPENBLAS_NUM_THREADS"] = "1"
    install_runtime(args.runtime.resolve(), args.provision)
    prepare_model(args.model.resolve(), args.provision)
    import ctranslate2
    from langid.langid import LanguageIdentifier, model
    import sentencepiece

    identifier = LanguageIdentifier.from_modelstring(model, norm_probs=True)
    identifier.set_languages(list(LANGUAGES))
    source = json.loads(args.input.read_text(encoding="utf-8"))
    rows = source["items"] if isinstance(source, dict) else source
    if args.limit is not None:
        rows = rows[:args.limit]
    threads = min(12, max(1, os.cpu_count() or 1))
    engine = ctranslate2.Translator(str(args.model), device="cpu", compute_type="int8",
                                   inter_threads=2 if threads >= 8 else 1,
                                   intra_threads=threads // 2 if threads >= 8 else threads)
    tokenizer = sentencepiece.SentencePieceProcessor(model_file=str(args.model / "sentencepiece.bpe.model"))
    localized = translate(rows, engine, tokenizer, identifier, batch_limit=192)
    if isinstance(source, dict):
        source["items"] = localized
    else:
        source = localized
    final = args.output
    temporary = final.with_suffix(final.suffix + ".tmp")
    temporary.write_text(json.dumps(source, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(final)
    log(f"Localized {len(localized)} records")


if __name__ == "__main__":
    main()
