"""Convert decoded KALA av SQLite rows into a local Fallen manifest for review."""

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import sqlite3

from lexical import clean, normalize_key, parse_entry, phonetic, utf16_length

REPO = Path(__file__).resolve().parents[3]
IDENTIFIER = re.compile(r"^[A-Za-z0-9_-]{1,160}$")


def stable_id(prefix, value):
    return prefix + hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def require_identifier(value):
    if not isinstance(value, str) or not IDENTIFIER.fullmatch(value):
        raise ValueError(f"Invalid Fallen identifier: {value!r}")
    return value


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def source_metadata(args):
    source = {
        "sourceId": args.source_id,
        "name": "KALA English-Vietnamese (decoded APK assets)",
        "version": args.source_version,
        "license": "UNVERIFIED: no redistribution license supplied with this conversion.",
        "redistributionAllowed": False,
    }
    if args.source_metadata:
        source = load_json(args.source_metadata)
    if set(source) != {"sourceId", "name", "version", "license", "redistributionAllowed"}:
        raise ValueError("Source metadata must have exactly the five Fallen source fields")
    require_identifier(source["sourceId"])
    for key in ("name", "version", "license"):
        if not isinstance(source[key], str) or not source[key].strip():
            raise ValueError(f"Source {key} must be nonempty text")
    if type(source["redistributionAllowed"]) is not bool:
        raise ValueError("redistributionAllowed must be a JSON boolean")
    if utf16_length(source["version"]) > 100:
        raise ValueError("source version exceeds dictionaryRef.sourceVersion's 100-character limit")
    return source


def redirect_target(rows):
    targets = set()
    for row in rows:
        if row["has_body"] or not row["mean"].strip().startswith("@"):
            return None
        target = normalize_key(row["mean"].strip()[1:])
        if not target:
            return None
        targets.add(target)
    return next(iter(targets)) if len(targets) == 1 else None


def resolve_redirects(groups):
    targets = {key: redirect_target(rows) for key, rows in groups.items()}
    resolved = {}
    for key in groups:
        trail = []
        seen = set()
        cursor = key
        while cursor not in resolved:
            if cursor not in groups:
                result = (None, "redirect_target_missing")
                break
            if cursor in seen:
                result = (None, "redirect_cycle")
                break
            if targets[cursor] is None:
                result = (cursor, None)
                break
            seen.add(cursor)
            trail.append(cursor)
            cursor = targets[cursor]
        else:
            result = resolved[cursor]
        for item in trail or [key]:
            resolved[item] = result
        if key not in resolved:
            resolved[key] = result
    return resolved


class ConversionError(ValueError):
    pass


def make_word(rows, aliases, source, identities, word_version):
    spelling = clean(rows[0]["word"])
    key = normalize_key(spelling)
    if not spelling or utf16_length(spelling) > 200:
        raise ConversionError("spelling_outside_1_200_characters")
    identity = identities.get(key, {})
    word_id = require_identifier(identity.get("wordId", stable_id("kala_w_", key)))
    version = identity.get("version", word_version)
    if type(version) is not int or version < 1 or version > 2**53 - 1:
        raise ConversionError("word_version_must_be_a_positive_safe_integer")
    all_senses = {}
    phonetics = []
    for row in rows:
        value = phonetic(row["pro"])
        if value and value not in phonetics:
            phonetics.append(value)
        for sense in parse_entry(row["entry_html"], row["pro"], row["mean"]):
            sense_key = (sense.pos, sense.text)
            if sense_key not in all_senses:
                all_senses[sense_key] = sense
            else:
                old = all_senses[sense_key]
                for attr in ("examples", "glosses", "unpaired"):
                    values = getattr(old, attr)
                    values.extend(value for value in getattr(sense, attr) if value not in values)
    if not all_senses:
        raise ConversionError("no_structured_vietnamese_meaning")
    meanings = []
    details = []
    for sense in all_senses.values():
        meaning_id = stable_id("kala_m_", dump([key, sense.pos, sense.text]))
        detail = {
            "meaningId": meaning_id, "allExamplePairs": sense.examples,
            "englishGlosses": sense.glosses, "unpairedExamples": sense.unpaired,
        }
        if not 0 < utf16_length(sense.text) <= 1000:
            detail.update({"overlengthDefinition": sense.text, "partOfSpeech": sense.pos, "omittedFromManifest": True})
            details.append(detail)
            continue
        meaning = {"id": meaning_id, "partOfSpeech": sense.pos, "text": sense.text}
        pair = next((p for p in sense.examples if all(0 < utf16_length(value) <= 1000 for value in p.values())), None)
        if pair:
            meaning.update(pair)
        meanings.append(meaning)
        if sense.examples or sense.glosses or sense.unpaired:
            details.append(detail)
    short_fallback = False
    if not meanings:
        # Keep an original short definition if all detailed definitions are too
        # long for Fallen. Never invent a translation or cut a long paragraph.
        for row in rows:
            for sense in parse_entry("", row["pro"], row["mean"]):
                if 0 < utf16_length(sense.text) <= 1000:
                    meanings.append({"id": stable_id("kala_m_", dump([key, sense.pos, sense.text])),
                                     "partOfSpeech": sense.pos, "text": sense.text})
        meanings = list({meaning["id"]: meaning for meaning in meanings}.values())
        short_fallback = bool(meanings)
    if not meanings:
        raise ConversionError("meaning_exceeds_1000_characters_no_truncation")
    names = list(dict.fromkeys(row["word"] for row in [*rows, *aliases]))
    other_spellings = [name for name in names if normalize_key(name) != key]
    if any(not name or utf16_length(name) > 200 for name in other_spellings):
        raise ConversionError("alias_exceeds_200_characters_no_truncation")
    refs = [{"sourceId": source["sourceId"], "sourceEntryId": "av:" + name, "sourceVersion": source["version"]} for name in names]
    word = {
        "wordId": word_id, "version": version, "spelling": spelling,
        "otherSpellings": other_spellings, "meanings": meanings,
        "dictionaryRefs": refs, "active": True, "listenAllowed": False,
    }
    ipa = " ".join(phonetics)
    if ipa and utf16_length(ipa) <= 200:
        word["phonetic"] = ipa
    supplemental = {"wordId": word_id, "spelling": spelling, "meanings": details}
    if short_fallback:
        supplemental["shortMeaningFallback"] = True
    if ipa and utf16_length(ipa) > 200:
        supplemental["overlengthPhonetic"] = ipa
    return word, supplemental


def convert(args):
    require_identifier(args.release_id)
    if args.limit is not None and args.limit < 1:
        raise ValueError("--limit must be positive")
    source = source_metadata(args)
    identities = load_json(args.identity_map) if args.identity_map else {}
    if not isinstance(identities, dict):
        raise ValueError("Identity map must be an object keyed by normalized spelling")
    # Normalize map keys too, and refuse conflicting identities.
    normalized_identities = {}
    for spelling, identity in identities.items():
        key = normalize_key(spelling)
        if not isinstance(identity, dict) or set(identity) != {"wordId", "version"}:
            raise ValueError("Each identity must have exactly wordId and version")
        if key in normalized_identities and normalized_identities[key] != identity:
            raise ValueError(f"Conflicting identities for {spelling!r}")
        normalized_identities[key] = identity
    path = Path(args.input).resolve(strict=True)
    output = Path(args.output).resolve()
    if output.exists():
        raise FileExistsError(f"Output already exists; choose a new directory: {output}")
    con = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        columns = {row["name"] for row in con.execute("PRAGMA table_info(av)")}
        if not {"word", "pro", "mean", "entry_html"}.issubset(columns):
            raise ValueError("Input must be the decoded dictionary-full.sqlite, with av.entry_html")
        groups = defaultdict(list)
        for row in con.execute("SELECT word, coalesce(mean,'') AS mean, length(coalesce(entry_html,'')) > 0 AS has_body FROM av ORDER BY word COLLATE BINARY"):
            groups[normalize_key(row["word"])].append(dict(row))
        resolved = resolve_redirects(groups)
        aliases = defaultdict(list)
        for key, (root, error) in resolved.items():
            if not error and root != key:
                aliases[root].extend(groups[key])
        selected = None
        if args.word:
            selected = set()
            for spelling in args.word:
                key = normalize_key(spelling)
                if key not in groups or resolved[key][0] is None:
                    raise ValueError(f"Selected word is absent or an unresolved redirect: {spelling}")
                selected.add(resolved[key][0])
        output.mkdir(parents=True)
        stats = Counter(sourceRows=sum(map(len, groups.values())), canonicalCandidates=sum(root == key for key, (root, _) in resolved.items()))
        represented = set()
        used_ids = set()
        with (output / "manifest.review.json.tmp").open("x", encoding="utf-8", newline="\n") as manifest, (output / "supplemental.jsonl").open("x", encoding="utf-8", newline="\n") as extra, (output / "rejected.jsonl").open("x", encoding="utf-8", newline="\n") as rejected:
            manifest.write('{"releaseId":' + dump(args.release_id) + ',"sources":' + dump([source]) + ',"words":[\n')
            for key in sorted(groups):
                if resolved[key][0] != key or (selected is not None and key not in selected):
                    continue
                if args.limit is not None and stats["wordsConverted"] >= args.limit:
                    break
                rows = [dict(con.execute("SELECT word, coalesce(pro,'') AS pro, coalesce(mean,'') AS mean, coalesce(entry_html,'') AS entry_html FROM av WHERE word=?", (r["word"],)).fetchone()) for r in groups[key]]
                try:
                    word, supplemental = make_word(rows, aliases[key], source, normalized_identities, args.word_version)
                except ConversionError as error:
                    stats["wordsRejected"] += 1
                    rejected.write(dump({"sourceEntries": [r["word"] for r in groups[key]], "reason": str(error)}) + "\n")
                    continue
                if word["wordId"] in used_ids:
                    raise ValueError(f"Identity map reuses canonical wordId: {word['wordId']}")
                used_ids.add(word["wordId"])
                if stats["wordsConverted"]:
                    manifest.write(',\n')
                manifest.write(dump(word))
                if supplemental["meanings"] or "overlengthPhonetic" in supplemental:
                    extra.write(dump(supplemental) + "\n")
                represented.add(key)
                stats["wordsConverted"] += 1
                stats["meaningsConverted"] += len(word["meanings"])
                stats["aliasesAttached"] += len(word["otherSpellings"])
                stats["sourceRowsRepresented"] += len(word["dictionaryRefs"])
                stats["manifestExamplePairs"] += sum("example" in sense for sense in word["meanings"])
                stats["allExamplePairs"] += sum(len(s["allExamplePairs"]) for s in supplemental["meanings"])
                stats["unpairedExamples"] += sum(len(s["unpairedExamples"]) for s in supplemental["meanings"])
                stats["longDefinitionsInSupplemental"] += sum("overlengthDefinition" in s for s in supplemental["meanings"])
                stats["wordsUsingShortMeaningFallback"] += bool(supplemental.get("shortMeaningFallback"))
                if stats["wordsConverted"] % 10000 == 0:
                    print(f"Converted {stats['wordsConverted']:,} canonical words", flush=True)
            manifest.write('\n],"connections":[]}\n')
            if selected is None and args.limit is None:
                for key, (root, error) in sorted(resolved.items()):
                    if root == key:
                        continue
                    if error or root not in represented:
                        stats["redirectRowsRejected"] += len(groups[key])
                        rejected.write(dump({"sourceEntries": [r["word"] for r in groups[key]], "reason": error or "redirect_target_not_converted"}) + "\n")
        if not stats["wordsConverted"]:
            raise ValueError("No convertible words; inspect rejected.jsonl")
        manifest_path = output / "manifest.review.json"
        (output / "manifest.review.json.tmp").rename(manifest_path)
        with path.open("rb") as input_file:
            input_hash = hashlib.file_digest(input_file, "sha256").hexdigest()
        report = {
            "input": str(path), "inputSha256": input_hash,
            "source": source, "releaseId": args.release_id, "stats": dict(stats),
            "scope": "av (English-to-Vietnamese) only; va is a separate translation direction",
            "selection": {"words": args.word, "limit": args.limit},
            "rightsMetadataVerifiedByConverter": False,
            "notes": [
                "No Firebase access or publication is performed.",
                "Fallen stores one example pair per meaning; all extracted pairs are in supplemental.jsonl.",
                "English-only, relations, and inflection HTML sections stay in the original SQLite; no semantic connections are invented.",
                "Overlength definitions stay in supplemental.jsonl; valid meanings of the same word are still exported. Rejected rows are reported; no text is truncated.",
                "A true redistributionAllowed value is only read from explicitly supplied source metadata, never inferred from APK access.",
            ],
        }
        (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(dump({"manifest": str(manifest_path), "stats": dict(stats), "redistributionAllowed": source["redistributionAllowed"]}), flush=True)
        return report
    finally:
        con.close()


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default=str(REPO.parent / "kala-dictionary" / "dictionary-full.sqlite"))
    parser.add_argument("--output", default=str(REPO / ".local" / "kala-converted"))
    parser.add_argument("--release-id", default="kala-9-5-2-review-v1")
    parser.add_argument("--source-id", default="kala-english-vietnamese")
    parser.add_argument("--source-version", default="9.5.2")
    parser.add_argument("--word-version", type=int, default=1)
    parser.add_argument("--source-metadata", help="JSON with Fallen source fields, supplied by the operator")
    parser.add_argument("--identity-map", help="JSON: normalized spelling -> {wordId, version} for an existing release")
    parser.add_argument("--word", action="append", help="Convert only this word (repeatable); resolves aliases")
    parser.add_argument("--limit", type=int, help="Limit accepted canonical words for a local sample")
    return parser.parse_args()


if __name__ == "__main__":
    convert(arguments())
