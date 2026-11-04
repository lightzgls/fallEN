import { describe, expect, it } from "vitest";
import {
  availableSourceEntries,
  deckRevision,
  publicRelease,
  readableRevision,
  releaseKey,
} from "../../functions/src/domain/dictionary/policy.js";

describe("public dictionary source policy", () => {
  it.each([undefined, "", false, 0])(
    "treats a missing active release pointer as not configured: %s",
    (active) => {
      expect(() => releaseKey(undefined, active)).toThrowError(
        expect.objectContaining({ details: { code: "DICTIONARY_NOT_READY" } }),
      );
    },
  );
  it("allows a retained public release and blocks a draft release", () => {
    expect(publicRelease("release-1", { state: "RETIRED" })).toMatchObject({
      id: "release-1",
      releaseId: "release-1",
    });
    expect(() => publicRelease("draft", { state: "DRAFT" })).toThrowError(
      expect.objectContaining({ details: { code: "RELEASE_UNAVAILABLE" } }),
    );
  });
  it("keeps an explicitly pinned retained deck revision", () => {
    expect(
      deckRevision(
        { sourceType: "SYSTEM_DECK", wordSetId: "deck", revisionId: "old" },
        { active: true, publishedRevisionId: "new" },
      ),
    ).toEqual({ wordSetId: "deck", revisionId: "old" });
    expect(() => readableRevision({ state: "RETIRED" })).not.toThrow();
  });
  it("filters current availability without replacing the pinned word version", () => {
    const pinned = {
      wordId: "book",
      entry: { wordVersion: 1 },
      live: { active: true, wordVersion: 4 },
    };
    expect(
      availableSourceEntries([
        pinned,
        {
          wordId: "hidden",
          entry: { wordVersion: 2 },
          live: { active: false },
        },
      ]),
    ).toEqual([pinned]);
  });
});
