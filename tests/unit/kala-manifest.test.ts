import { describe, expect, it } from "vitest";
import { checkLocalManifest } from "../../tools/dictionary/check-local.js";

function fixture(redistributionAllowed = false) {
  return {
    releaseId: "local-kala-review",
    sources: [
      {
        sourceId: "kala",
        name: "Local conversion fixture",
        version: "1",
        license: "Unverified fixture source",
        redistributionAllowed,
      },
    ],
    words: [
      {
        wordId: "book",
        version: 1,
        spelling: "book",
        otherSpellings: ["books"],
        meanings: [{ id: "book-noun", partOfSpeech: "noun", text: "sách" }],
        dictionaryRefs: [
          { sourceId: "kala", sourceEntryId: "av:book", sourceVersion: "1" },
        ],
        active: true,
        listenAllowed: false,
      },
    ],
    connections: [],
  };
}

describe("local KALA manifest checks against the actual Fallen contract", () => {
  it("accepts lexical review data without claiming publication rights", () => {
    expect(checkLocalManifest(fixture())).toEqual({
      words: 1,
      meanings: 1,
      searchKeys: 2,
      publicationSchemaValid: false,
    });
    expect(checkLocalManifest(fixture(true)).publicationSchemaValid).toBe(true);
  });

  it("rejects search aliases assigned to different canonical words", () => {
    const input = fixture();
    input.words.push({
      ...input.words[0],
      wordId: "different-book",
      spelling: "BOOK",
      otherSpellings: [],
    });
    expect(() => checkLocalManifest(input)).toThrow("Alias collision");
  });

  it("enforces the real schema's paired examples and text length limits", () => {
    const input = fixture();
    Object.assign(input.words[0].meanings[0], { example: "A book." });
    expect(() => checkLocalManifest(input)).toThrow();
    const long = fixture();
    long.words[0].meanings[0].text = "x".repeat(1001);
    expect(() => checkLocalManifest(long)).toThrow();
  });

  it("rejects missing provenance sources and duplicate meaning identities", () => {
    const input = fixture();
    input.words[0].dictionaryRefs[0].sourceId = "missing";
    expect(() => checkLocalManifest(input)).toThrow("Unknown sourceId");
    const repeated = fixture();
    repeated.words[0].meanings.push({ ...repeated.words[0].meanings[0] });
    expect(() => checkLocalManifest(repeated)).toThrow("Duplicate meaningId");
  });
});
