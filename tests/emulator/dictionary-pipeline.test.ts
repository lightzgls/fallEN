import { beforeEach, describe, expect, it } from "vitest";
import {
  publishDictionaryManifest,
  type DictionaryManifest,
} from "../../tools/dictionary/publish.js";
import { dictionaryHandlers } from "../../functions/src/services/dictionary.js";
import type { Data } from "../../functions/src/shared/core.js";
import {
  businessCode,
  publicActor,
  read,
  resetData,
  seedData,
} from "./fixtures.js";

function manifest(releaseId = "pipeline-one"): DictionaryManifest {
  const refs = (entry: string) => [
    { sourceId: "authored-pipeline", sourceEntryId: entry, sourceVersion: "1" },
  ];
  return {
    releaseId,
    sources: [
      {
        sourceId: "authored-pipeline",
        name: "Authored pipeline fixtures",
        version: "1",
        license: "CC0 test fixture",
        redistributionAllowed: true,
      },
    ],
    words: ["alpha", "beta"].map((wordId) => ({
      wordId,
      version: 1,
      spelling: wordId,
      otherSpellings: wordId === "alpha" ? ["alphas"] : [],
      meanings: [
        {
          id: `meaning-${wordId}`,
          partOfSpeech: "noun",
          text: `Nghĩa ${wordId}`,
        },
      ],
      dictionaryRefs: refs(wordId),
      active: true,
      listenAllowed: false,
    })),
    connections: [
      {
        sourceWordId: "alpha",
        sourceWordVersion: 1,
        sourceMeaningId: "meaning-alpha",
        targetWordId: "beta",
        targetWordVersion: 1,
        targetMeaningId: "meaning-beta",
        type: "SYNONYM",
        dictionaryRefs: refs("relation-one"),
      },
    ],
  };
}
beforeEach(async () => {
  await resetData();
  await seedData();
});

describe("operator-only immutable dictionary release pipeline", () => {
  it("publishes an internally verified release once and retains the old public version", async () => {
    const input = manifest();
    const first = await publishDictionaryManifest(
      input,
      1,
      "publish-pipeline-one",
    );
    expect(first).toEqual({ releaseId: input.releaseId, version: 2 });
    expect(
      await publishDictionaryManifest(input, 1, "publish-pipeline-one"),
    ).toEqual(first);
    expect(await read("config/dictionary")).toMatchObject({
      activeReleaseId: input.releaseId,
      version: 2,
    });
    expect((await read("dictionaryReleases/test-release"))?.state).toBe(
      "RETIRED",
    );
    expect((await read(`dictionaryReleases/${input.releaseId}`))?.state).toBe(
      "PUBLISHED",
    );
    const old = (await dictionaryHandlers.getWord(publicActor, {
      wordId: "book",
      releaseId: "test-release",
    })) as Data;
    expect(old.spelling).toBe("book");
    const alias = (await dictionaryHandlers.findWords(publicActor, {
      query: "alphas",
    })) as Data;
    expect(alias.items[0]).toMatchObject({ wordId: "alpha", wordVersion: 1 });
  });

  it("leaves the current public pointer unchanged when publication CAS is stale", async () => {
    expect(
      await businessCode(
        publishDictionaryManifest(manifest(), 0, "stale-config-version"),
      ),
    ).toBe("CONFLICT");
    expect(await read("config/dictionary")).toMatchObject({
      activeReleaseId: "test-release",
      version: 1,
    });
    expect((await read("dictionaryReleases/pipeline-one"))?.state).toBe(
      "READY",
    );
  });

  it("rejects duplicate semantic connections even when their provenance differs", async () => {
    const input = manifest();
    input.connections.push({
      ...input.connections[0],
      dictionaryRefs: [
        {
          sourceId: "authored-pipeline",
          sourceEntryId: "relation-two",
          sourceVersion: "1",
        },
      ],
    });
    expect(
      await businessCode(
        publishDictionaryManifest(input, 1, "duplicate-relation"),
      ),
    ).toBe("VALIDATION_FAILED");
    expect(await read("dictionaryReleases/pipeline-one")).toBeUndefined();
    expect((await read("config/dictionary"))?.activeReleaseId).toBe(
      "test-release",
    );
  });
});
