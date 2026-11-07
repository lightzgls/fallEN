"""Read KALA's HTML into meanings without executing embedded content."""

from dataclasses import dataclass, field
from html.parser import HTMLParser
import re
import unicodedata


# Match JavaScript /\s/ and Fallen's normalizeKey, including BOM whitespace.
SPACE = re.compile(r"[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+")
POS = {
    "n": "noun", "noun": "noun", "danh từ": "noun",
    "v": "verb", "verb": "verb", "động từ": "verb",
    "adj": "adjective", "adjective": "adjective", "tính từ": "adjective",
    "adv": "adverb", "adverb": "adverb", "phó từ": "adverb", "trạng từ": "adverb",
    "prep": "preposition", "preposition": "preposition", "giới từ": "preposition",
    "pron": "pronoun", "pronoun": "pronoun", "đại từ": "pronoun",
    "conj": "conjunction", "conjunction": "conjunction", "liên từ": "conjunction",
    "interject": "interjection", "interjection": "interjection", "thán từ": "interjection",
    "exclam": "interjection", "det": "determiner", "determiner": "determiner",
    "article": "article", "mạo từ": "article", "num": "numeral", "số từ": "numeral",
    "abbr": "abbreviation", "abbreviation": "abbreviation", "viết tắt": "abbreviation",
    "phrv": "phrasal verb", "phrasal verb": "phrasal verb",
    "phrase": "phrase", "cụm từ": "phrase", "idiom": "idiom", "thành ngữ": "idiom",
    "prefix": "prefix", "suffix": "suffix", "other": "other",
    "adj_adv": "adjective / adverb", "p": "preposition", "pp": "verb form",
    "pro": "pronoun", "pro_ask": "pronoun", "pro_relation": "pronoun",
    "a": "adjective", "conjun": "conjunction", "phr": "phrase",
    "v phr": "verb phrase", "vph": "verb phrase", "phr v": "verb phrase",
    "n phr": "noun phrase", "combining form": "combining form", "comb": "combining form",
    "modal verb": "modal verb", "exclamation": "interjection",
}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr", "img_s"}


def clean(value):
    return SPACE.sub(" ", value).strip(" ")


def normalize_key(value):
    return clean(unicodedata.normalize("NFKC", value)).lower()


def utf16_length(value):
    return len(value.encode("utf-16-le")) // 2


def part_of_speech(value):
    key = normalize_key(value)
    if key.startswith("idiom_"):
        return "idiom"
    key = re.sub(r"\d+$", "", key)
    if key in POS:
        return POS[key]
    # A heading may include conjugations after the actual part-of-speech label.
    for label in sorted(POS, key=len, reverse=True):
        if len(label) > 3 and key.startswith(label + " "):
            return POS[label]
    return "other"


def metadata_pos(pro):
    codes = pro.split("#;#", 1)[1] if "#;#" in pro else ""
    values = list(dict.fromkeys(part_of_speech(code) for code in codes.split(",")))
    return " / ".join(value for value in values if value != "other") or "other"


def phonetic(pro):
    return clean(pro.split("#;#", 1)[0])


@dataclass
class Node:
    tag: str
    attrs: dict = field(default_factory=dict)
    children: list = field(default_factory=list)

    def text(self):
        def render(node):
            if isinstance(node, str):
                return node
            if node.tag in {"script", "style"}:
                return ""
            if node.tag in {"br", "hr"}:
                return " "
            return "".join(render(child) for child in node.children)
        return clean(render(self))


class Tree(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node("root")
        self.stack = [self.root]
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attrs):
        node = Node(tag, dict(attrs))
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def blocks(node, section="0", part=""):
    if node.tag in {"script", "style"}:
        return
    section = node.attrs.get("data-section-index", section)
    ident = node.attrs.get("id", "")
    if ident.startswith("part_"):
        part = ident[5:]
    if section not in {"0", "2"}:
        return
    if node.tag == "div":
        classes = set(node.attrs.get("class", "").split())
        semantic = classes & {"m", "dm", "im", "de", "e", "em", "ei", "eim", "ub", "b", "id"}
        if semantic:
            yield section, part, sorted(semantic)[0], node.text()
        elif "class" in node.attrs and not classes and node.text().lower().startswith("xem "):
            yield section, part, "m", node.text()
    for child in node.children:
        if isinstance(child, Node):
            yield from blocks(child, section, part)


@dataclass
class Sense:
    pos: str
    text: str
    examples: list = field(default_factory=list)
    glosses: list = field(default_factory=list)
    unpaired: list = field(default_factory=list)


def parse_entry(html, pro, short_mean):
    senses = []
    current = None
    scope = None
    pos = metadata_pos(pro)
    domain = idiom = pending_example = ""
    pending_glosses = []
    append_translation = False
    last_kind = ""

    def flush_example():
        nonlocal pending_example
        if current and pending_example:
            current.unpaired.append({"example": pending_example})
        pending_example = ""

    def flush():
        nonlocal current
        flush_example()
        if current:
            senses.append(current)
        current = None

    for section, part, kind, text in blocks(Tree(html).root):
        if not text:
            continue
        if scope != (section, part):
            flush()
            scope = (section, part)
            pos = part_of_speech(part) if part else metadata_pos(pro)
            domain = idiom = ""
            pending_glosses = []
        if kind in {"ub", "b", "id"}:
            flush()
            pending_glosses = []
            if kind == "ub":
                pos = part_of_speech(part) if part else part_of_speech(text)
                if pos == "other":
                    pos = part_of_speech(text)
                idiom = domain = ""
            elif kind == "b":
                domain = text
            else:
                idiom = text
        elif kind == "de":
            flush_example()
            append_translation = current is not None and last_kind == "m"
            if not append_translation:
                flush()
            pending_glosses = [text.lstrip("★ ")]
            if current:
                current.glosses.extend(pending_glosses)
        elif kind in {"m", "dm", "im"}:
            if kind == "dm" and append_translation and current:
                if text != current.text:
                    current.text += "\n" + text
            else:
                flush()
                label = (f"({domain}) " if domain else "") + (f"{idiom}: " if kind == "im" and idiom else "")
                current = Sense("idiom" if kind == "im" else pos, label + text, glosses=pending_glosses[:])
            pending_glosses = []
            append_translation = False
        elif kind in {"e", "ei"} and normalize_key(text).rstrip(":") not in {"ví dụ", "example", "examples"}:
            flush_example()
            pending_example = text
        elif kind in {"em", "eim"}:
            if current and pending_example:
                current.examples.append({"example": pending_example, "exampleTranslation": text})
            elif current:
                current.unpaired.append({"exampleTranslation": text})
            pending_example = ""
        last_kind = kind
    flush()
    if not senses and short_mean and not short_mean.strip().startswith("@"):
        senses = [Sense(metadata_pos(pro), clean(text)) for text in short_mean.split("#") if clean(text)]
    # Merge identical senses, preserving every distinct example in the sidecar.
    unique = {}
    for sense in senses:
        key = (sense.pos, sense.text)
        if key not in unique:
            unique[key] = sense
            continue
        old = unique[key]
        for attr in ("examples", "glosses", "unpaired"):
            target = getattr(old, attr)
            target.extend(value for value in getattr(sense, attr) if value not in target)
    return list(unique.values())
