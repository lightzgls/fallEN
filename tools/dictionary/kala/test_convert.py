import argparse
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from convert import REPO, ConversionError, convert, make_word, resolve_redirects, source_metadata
from lexical import normalize_key, parse_entry, utf16_length


def block(kind, text):
    return f'<div class="{kind}">{text}</div>'


def args(**overrides):
    values = dict(release_id="kala-test", source_id="kala", source_version="9.5.2", source_metadata=None,
                  identity_map=None, word_version=1, limit=None, word=None)
    values.update(overrides)
    return argparse.Namespace(**values)


class ParsingTests(unittest.TestCase):
    def test_normalization_matches_fallen_without_removing_vietnamese_accents(self):
        self.assertEqual(normalize_key("\ufeff ＢＯＯＫ\t case \n"), "book case")
        self.assertEqual(normalize_key("CHẠY"), "chạy")
        self.assertEqual(utf16_length("a😀"), 3)

    def test_inline_spaces_entities_and_ignored_scripts(self):
        html = block("m", '<span> quả </span><a>táo</a> &amp; lê<script>untrusted()</script>')
        self.assertEqual(parse_entry(html, "#;#n", "")[0].text, "quả táo & lê")

    def test_keeps_separate_senses_and_pairs_multiple_examples(self):
        html = '<div id="part_v">' + block("m", "chạy")
        html += block("e", "Ví dụ ") + block("e", "Run!") + block("em", "Chạy đi!")
        html += block("e", "Run fast.") + block("em", "Chạy nhanh.")
        html += block("m", "vận hành") + "</div>"
        senses = parse_entry(html, "", "")
        self.assertEqual([(s.pos, s.text) for s in senses], [("verb", "chạy"), ("verb", "vận hành")])
        self.assertEqual(len(senses[0].examples), 2)
        self.assertEqual(senses[1].examples, [])

    def test_expanded_translation_belongs_to_same_sense_as_short_translation(self):
        html = block("m", "học máy") + block("de", "★ machine learning definition") + block("dm", "một loại trí tuệ nhân tạo")
        senses = parse_entry(html, "#;#n", "")
        self.assertEqual(len(senses), 1)
        self.assertEqual(senses[0].text, "học máy\nmột loại trí tuệ nhân tạo")
        self.assertEqual(senses[0].glosses, ["machine learning definition"])

    def test_unpaired_example_is_retained_but_no_translation_is_invented(self):
        html = block("m", "sách") + block("e", "A book.") + block("e", "The book.") + block("em", "Cuốn sách.")
        sense = parse_entry(html, "#;#n", "")[0]
        self.assertEqual(sense.unpaired, [{"example": "A book."}])
        self.assertEqual(sense.examples, [{"example": "The book.", "exampleTranslation": "Cuốn sách."}])

    def test_preserves_idiom_label_technical_domain_and_idiom_examples(self):
        html = '<section data-section-index="0"><div id="part_idiom_n">'
        html += block("id", "apple of the eye") + block("im", "vật quý báu")
        html += block("ei", "She is the apple of his eye.") + block("eim", "Cô ấy là báu vật của anh ấy.") + "</div></section>"
        html += '<section data-section-index="2">' + block("b", "Sinh học") + block("m", "quả táo") + "</section>"
        senses = parse_entry(html, "#;#n", "")
        self.assertEqual(senses[0].pos, "idiom")
        self.assertEqual(senses[0].text, "apple of the eye: vật quý báu")
        self.assertEqual(len(senses[0].examples), 1)
        self.assertEqual(senses[1].text, "(Sinh học) quả táo")

    def test_english_only_and_family_sections_are_not_vietnamese_definitions(self):
        html = '<section data-section-index="1">' + block("m", "English definition") + "</section>"
        html += '<section data-section-index="4">' + block("m", "Family word") + "</section>"
        self.assertEqual(parse_entry(html, "", ""), [])
        self.assertEqual(parse_entry(html, "", "@book"), [])

    def test_fallback_short_definitions_do_not_assume_a_specific_part_of_speech(self):
        senses = parse_entry("", "", "nghĩa một#nghĩa hai#")
        self.assertEqual([(s.pos, s.text) for s in senses], [("other", "nghĩa một"), ("other", "nghĩa hai")])

    def test_legacy_pos_codes_and_heading_fallback_are_kept(self):
        for code, expected in [("adj_adv", "adjective / adverb"), ("p", "preposition"),
                               ("pp", "verb form"), ("pro", "pronoun")]:
            html = f'<div id="part_{code}">' + block("m", "nghĩa") + "</div>"
            self.assertEqual(parse_entry(html, "", "")[0].pos, expected)
        html = '<div id="part_unrecognized">' + block("ub", "giới từ") + block("m", "trên") + "</div>"
        self.assertEqual(parse_entry(html, "", "")[0].pos, "preposition")

    def test_repeated_sense_merges_examples_instead_of_duplicating_ids(self):
        html = block("m", "sách") + block("e", "a book") + block("em", "một cuốn sách")
        html += block("m", "sách") + block("e", "the book") + block("em", "cuốn sách đó")
        senses = parse_entry(html, "#;#n", "")
        self.assertEqual(len(senses), 1)
        self.assertEqual(len(senses[0].examples), 2)


class ConversionTests(unittest.TestCase):
    def source(self):
        return source_metadata(args())

    def row(self, word="book", text="sách"):
        return {"word": word, "pro": "[bʊk]#;#n", "mean": text + "#", "entry_html": block("m", text)}

    def test_alias_chains_cycles_and_dangling_targets(self):
        def ref(target):
            return [{"has_body": False, "mean": "@" + target}]
        groups = {"book": [{"has_body": True, "mean": "sách"}], "books": ref("book"),
                  "bookses": ref("books"), "x": ref("y"), "y": ref("x"), "missing": ref("absent")}
        result = resolve_redirects(groups)
        self.assertEqual(result["bookses"], ("book", None))
        self.assertEqual(result["x"], (None, "redirect_cycle"))
        self.assertEqual(result["y"], (None, "redirect_cycle"))
        self.assertEqual(result["missing"], (None, "redirect_target_missing"))

    def test_stable_identity_provenance_and_existing_canonical_mapping(self):
        first, _ = make_word([self.row()], [{"word": "books"}], self.source(), {}, 1)
        second, _ = make_word([self.row()], [], self.source(), {}, 1)
        self.assertEqual(first["wordId"], second["wordId"])
        self.assertEqual(first["meanings"][0]["id"], second["meanings"][0]["id"])
        self.assertEqual(first["otherSpellings"], ["books"])
        self.assertEqual([r["sourceEntryId"] for r in first["dictionaryRefs"]], ["av:book", "av:books"])
        existing, _ = make_word([self.row()], [], self.source(), {"book": {"wordId": "book", "version": 2}}, 1)
        self.assertEqual((existing["wordId"], existing["version"]), ("book", 2))
        self.assertNotIn("#;#", existing["phonetic"])

    def test_extra_examples_survive_in_sidecar_and_overlength_pair_is_not_truncated(self):
        row = self.row()
        row["entry_html"] += block("e", "x" * 1001) + block("em", "dài")
        row["entry_html"] += block("e", "Read a book.") + block("em", "Đọc sách.")
        word, extra = make_word([row], [], self.source(), {}, 1)
        self.assertEqual(word["meanings"][0]["example"], "Read a book.")
        self.assertEqual(len(extra["meanings"][0]["allExamplePairs"][0]["example"]), 1001)

    def test_overlength_definition_rejects_word_instead_of_truncating(self):
        with self.assertRaisesRegex(ConversionError, "no_truncation"):
            make_word([self.row(text="x" * 1001)], [], self.source(), {}, 1)

    def test_long_sense_does_not_drop_other_meanings_of_the_same_word(self):
        row = self.row()
        row["entry_html"] += block("m", "x" * 1001)
        word, extra = make_word([row], [], self.source(), {}, 1)
        self.assertEqual([sense["text"] for sense in word["meanings"]], ["sách"])
        self.assertEqual(extra["meanings"][0]["overlengthDefinition"], "x" * 1001)
        self.assertTrue(extra["meanings"][0]["omittedFromManifest"])

    def test_uses_original_short_mean_if_no_detailed_sense_fits_the_contract(self):
        row = self.row()
        row["entry_html"] = block("m", "x" * 1001)
        word, extra = make_word([row], [], self.source(), {}, 1)
        self.assertEqual(word["meanings"][0]["text"], "sách")
        self.assertTrue(extra["shortMeaningFallback"])
        self.assertEqual(len(extra["meanings"][0]["overlengthDefinition"]), 1001)

    def test_unknown_redistribution_rights_are_never_automatically_asserted(self):
        self.assertIs(self.source()["redistributionAllowed"], False)

    def test_readonly_sqlite_end_to_end_merge_aliases_and_rejection_report(self):
        parent = REPO / ".local" / "kala-tests"
        parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=parent) as temp:
            root = Path(temp).resolve()
            self.assertTrue(root.is_relative_to(parent.resolve()))
            db = root / "fixture.sqlite"
            con = sqlite3.connect(db)
            con.execute("CREATE TABLE av(word TEXT, pro TEXT, mean TEXT, entry_html TEXT)")
            con.executemany("INSERT INTO av VALUES (?,?,?,?)", [
                ("book", "[bʊk]#;#n", "sách#", block("m", "sách")),
                ("ｂｏｏｋ", "", "đặt chỗ#", block("m", "đặt chỗ")),
                ("books", "", "@book", ""), ("bookses", "", "@books", ""),
                ("orphan", "", "@unknown", ""),
                ("english-only", "", "", '<section data-section-index="1">Only English</section>'),
            ])
            con.commit()
            original = db.read_bytes()
            con.close()
            with redirect_stdout(io.StringIO()):
                report = convert(args(input=str(db), output=str(root / "out")))
            manifest = json.loads((root / "out" / "manifest.review.json").read_text(encoding="utf-8"))
            self.assertEqual(len(manifest["words"]), 1)
            self.assertEqual(len(manifest["words"][0]["meanings"]), 2)
            self.assertEqual(manifest["words"][0]["otherSpellings"], ["books", "bookses"])
            self.assertEqual(len(manifest["words"][0]["dictionaryRefs"]), 4)
            self.assertEqual(report["stats"]["wordsRejected"], 1)
            self.assertEqual(report["stats"]["redirectRowsRejected"], 1)
            self.assertEqual(db.read_bytes(), original)
            with self.assertRaises(FileExistsError):
                convert(args(input=str(db), output=str(root / "out")))


if __name__ == "__main__":
    unittest.main()
