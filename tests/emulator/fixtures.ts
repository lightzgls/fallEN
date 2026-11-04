import {
  db,
  bucket,
  hash,
  type Actor,
  type Data,
} from "../../functions/src/shared/core.js";
import { Timestamp } from "firebase-admin/firestore";

export const learner: Actor = {
  uid: "learner-test",
  contentAdmin: false,
  authTime: Math.floor(Date.now() / 1000),
};
export const otherLearner: Actor = {
  uid: "other-test",
  contentAdmin: false,
  authTime: Math.floor(Date.now() / 1000),
};
export const admin: Actor = {
  uid: "admin-test",
  contentAdmin: true,
  authTime: Math.floor(Date.now() / 1000),
};
export const publicActor: Actor = { uid: "", contentAdmin: false, authTime: 0 };
export const wordIds = [
  "book",
  "journey",
  "reservation",
  "available",
  "station",
  "ticket",
  "arrival",
];
export const source = {
  sourceType: "SYSTEM_DECK" as const,
  wordSetId: "test-deck",
  revisionId: "revision-one",
};
const timestamp = Timestamp.fromDate(new Date("2026-11-04T00:00:00Z"));

export async function resetData(): Promise<void> {
  if (
    !process.env.FIRESTORE_EMULATOR_HOST ||
    !(
      process.env.STORAGE_EMULATOR_HOST ||
      process.env.FIREBASE_STORAGE_EMULATOR_HOST
    )
  ) {
    throw new Error(
      "Integration tests require Firestore and Storage emulators. Live project access is forbidden.",
    );
  }
  const response = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-fallen/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!response.ok)
    throw new Error(`Could not reset Firestore emulator: ${response.status}`);
}

export async function seedData(): Promise<void> {
  const batch = db.batch();
  for (const actor of [learner, otherLearner, admin]) {
    batch.set(db.doc(`accountStates/${actor.uid}`), {
      uid: actor.uid,
      status: "ACTIVE",
      version: 1,
      updatedAt: timestamp,
    });
    batch.set(db.doc(`users/${actor.uid}`), {
      uid: actor.uid,
      displayName: actor.uid,
      avatarMode: "DEFAULT",
      profileVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
  const indexEntries: Data[] = [];
  for (const [position, wordId] of wordIds.entries()) {
    const word = {
      wordId,
      version: 1,
      spelling: wordId,
      searchKey: wordId,
      phonetic: `/test-${wordId}/`,
      otherSpellings: wordId === "book" ? ["books"] : [],
      meanings: [
        {
          id: `meaning-${wordId}`,
          partOfSpeech: wordId === "available" ? "adjective" : "noun",
          text: `Nghĩa ${position + 1}`,
          example: `A ${wordId}.`,
          exampleTranslation: `Ví dụ ${position + 1}.`,
        },
      ],
      dictionaryRefs: [
        {
          sourceId: "authored-fixture",
          sourceEntryId: wordId,
          sourceVersion: "1",
        },
      ],
    };
    batch.set(db.doc(`words/${wordId}`), {
      speech: {
        provider: "ANDROID_TTS",
        text: wordId,
        listenAllowed: true,
        version: 1,
      },
    });
    batch.set(db.doc(`words/${wordId}/versions/1`), word);
    batch.set(db.doc(`dictionaryReleases/test-release/entries/${wordId}`), {
      wordId,
      wordVersion: 1,
      spelling: wordId,
      searchKey: wordId,
      active: true,
    });
    for (const key of [wordId, ...word.otherSpellings]) {
      batch.set(db.doc(`dictionaryReleases/test-release/keys/${hash(key)}`), {
        normalizedKey: key,
        wordId,
        wordVersion: 1,
      });
      indexEntries.push({ key, wordId, wordVersion: 1 });
    }
    batch.set(
      db.doc(`systemDecks/test-deck/revisions/revision-one/words/${wordId}`),
      {
        wordSetId: "test-deck",
        revisionId: "revision-one",
        wordId,
        wordVersion: 1,
        position,
        focusMeaningId: `meaning-${wordId}`,
      },
    );
  }
  const indexBytes = JSON.stringify({
    releaseId: "test-release",
    entries: indexEntries,
  });
  const searchIndexPath = "dictionary/test-release/search-index.json";
  await bucket
    .file(searchIndexPath)
    .save(indexBytes, { contentType: "application/json", resumable: false });
  batch.set(db.doc("dictionaryReleases/test-release"), {
    state: "PUBLISHED",
    contentHash: hash(indexBytes),
    searchIndexPath,
    searchIndexHash: hash(indexBytes),
    entryCount: wordIds.length,
    connectionCount: 0,
    createdAt: timestamp,
    publishedAt: timestamp,
  });
  batch.set(db.doc("config/dictionary"), {
    activeReleaseId: "test-release",
    version: 1,
  });
  batch.set(db.doc("systemDecks/test-deck"), {
    name: "Bộ kiểm thử",
    topic: "Kiểm thử",
    active: true,
    publishedRevisionId: "revision-one",
    version: 1,
  });
  batch.set(db.doc("systemDecks/test-deck/revisions/revision-one"), {
    id: "revision-one",
    wordSetId: "test-deck",
    name: "Bộ kiểm thử",
    topic: "Kiểm thử",
    state: "PUBLISHED",
    version: 1,
    createdBy: admin.uid,
    createdAt: timestamp,
  });
  batch.set(db.doc("aiScenarios/test-scenario"), {
    id: "test-scenario",
    name: "At the station",
    context: "Practice travel vocabulary.",
    learnerRole: "Traveler",
    aiRole: "Staff",
    goal: "Buy a ticket.",
    openingLine: "How can I help you?",
    guide: "Keep the language simple.",
    active: true,
    version: 1,
  });
  batch.set(db.doc("config/ai"), { maxSessionsPerDay: 2, version: 1 });
  await batch.commit();
}

export async function businessCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const failure = error as { details?: { code?: string }; message?: string };
    return failure.details?.code ?? failure.message ?? String(error);
  }
  throw new Error("Expected a rejected business operation.");
}

export async function read(path: string): Promise<Data | undefined> {
  return (await db.doc(path).get()).data();
}
