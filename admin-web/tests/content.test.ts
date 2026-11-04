import { describe, expect, it } from "vitest";
import { cleanEntry, entryError } from "../src/utils/content";

describe("draft learning material validation", () => {
  it("rejects incomplete example translation pairs and images without alt text", () => {
    expect(
      entryError({
        wordId: "station",
        wordVersion: 1,
        position: 0,
        example: "A train station.",
      }),
    ).toContain("bản dịch");
    expect(
      entryError({
        wordId: "station",
        wordVersion: 1,
        position: 0,
        imageAssetId: "asset",
      }),
    ).toContain("mô tả");
  });
  it("omits empty optional values and never sends read-model fields back to saveDraft", () => {
    expect(
      cleanEntry({
        wordId: "station",
        wordVersion: 4,
        position: 0,
        spelling: "station",
        example: "",
        exampleTranslation: "",
      }),
    ).toEqual({ wordId: "station", wordVersion: 4, position: 0 });
  });
});
