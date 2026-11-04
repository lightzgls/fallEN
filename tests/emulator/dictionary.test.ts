import { beforeEach, describe, expect, it } from "vitest";
import { db, type Data } from "../../functions/src/shared/core.js";
import { dictionaryHandlers } from "../../functions/src/services/dictionary.js";
import { businessCode, publicActor, resetData, seedData } from "./fixtures.js";

const search = async (input: Data): Promise<Data> =>
  (await dictionaryHandlers.findWords(publicActor, input)) as Data;
beforeEach(async () => {
  await resetData();
  await seedData();
});

describe("public dictionary release contract", () => {
  it("resolves aliases to one canonical word with exact, prefix and fuzzy search", async () => {
    const alias = await search({ query: "BOOKS" });
    expect(alias.releaseId).toBe("test-release");
    expect(alias.items[0]).toMatchObject({
      wordId: "book",
      wordVersion: 1,
      matchType: "EXACT",
    });
    const prefix = await search({ query: "boo" });
    expect(
      prefix.items.filter((item: Data) => item.wordId === "book"),
    ).toHaveLength(1);
    expect(prefix.items[0].matchType).toBe("PREFIX");
    expect((await search({ query: "boook" })).items[0]).toMatchObject({
      wordId: "book",
      matchType: "FUZZY",
    });
  });

  it("rejects a cursor reused with another query instead of mixing result sets", async () => {
    const first = await search({ query: "a", pageSize: 1 });
    expect(first.cursor).toBeTypeOf("string");
    expect(
      await businessCode(search({ query: "b", cursor: first.cursor })),
    ).toBe("VALIDATION_FAILED");
    const next = await search({
      query: "a",
      cursor: first.cursor,
      pageSize: 1,
    });
    expect(next.releaseId).toBe(first.releaseId);
    expect(next.items[0].wordId).not.toBe(first.items[0].wordId);
  });

  it("rejects non-public and unavailable releases for guests", async () => {
    await db.doc("dictionaryReleases/private-release").set({ state: "READY" });
    expect(
      await businessCode(
        dictionaryHandlers.getWord(publicActor, {
          wordId: "book",
          releaseId: "private-release",
        }),
      ),
    ).toBe("RELEASE_UNAVAILABLE");
    expect(
      await businessCode(
        dictionaryHandlers.getWord(publicActor, {
          wordId: "book",
          releaseId: "missing-release",
        }),
      ),
    ).toBe("RELEASE_UNAVAILABLE");
    await db.doc("config/dictionary").delete();
    expect(await businessCode(search({ query: "book" }))).toBe(
      "DICTIONARY_NOT_READY",
    );
  });

  it("does not turn a missing or inactive dictionary into a successful empty result", async () => {
    await db
      .doc("dictionaryReleases/test-release/entries/book")
      .update({ active: false });
    const word = dictionaryHandlers.getWord(publicActor, {
      wordId: "book",
      releaseId: "test-release",
    });
    expect(await businessCode(word)).toBe("WORD_UNAVAILABLE");
  });

  it("filters inactive search matches before paging without failing other matches", async () => {
    await db
      .doc("dictionaryReleases/test-release/entries/arrival")
      .update({ active: false });
    const result = await search({ query: "a", pageSize: 1 });
    expect(result.items.map((item: Data) => item.wordId)).toEqual([
      "available",
    ]);
    expect(result.cursor).toBeUndefined();
  });

  it("applies the admin part-of-speech filter before building the paginated result set", async () => {
    const result = await search({
      query: "a",
      partOfSpeech: "noun",
      pageSize: 1,
    });
    expect(result.items.map((item: Data) => item.wordId)).toEqual(["arrival"]);
    expect(result.cursor).toBeUndefined();
  });
});
