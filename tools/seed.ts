import { getAuth } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import { db, type Data } from "../functions/src/shared/core.js";
import {
  publishDictionaryManifest,
  type DictionaryManifest,
} from "./dictionary/publish.js";

if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.STORAGE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== "demo-fallen"
)
  throw new Error(
    "Seed is restricted to demo-fallen emulators. Set emulator variables; never run against live data.",
  );
const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@fallen.local",
  learnerEmail = process.env.SEED_LEARNER_EMAIL || "learner@fallen.local";
const password = process.env.SEED_PASSWORD || "Local-demo-2026!";
for (const [uid, email, contentAdmin] of [
  ["demo-admin", adminEmail, true],
  ["demo-learner", learnerEmail, false],
] as const) {
  let user;
  try {
    user = await getAuth().getUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found")
      throw error;
    user = await getAuth().createUser({
      uid,
      email,
      password,
      displayName: contentAdmin ? "Content Admin" : "Người học",
    });
  }
  await getAuth().setCustomUserClaims(uid, { contentAdmin });
  if (!(await db.doc(`accountStates/${uid}`).get()).exists) {
    await db
      .doc(`accountStates/${uid}`)
      .set({ uid, status: "ACTIVE", version: 1, updatedAt: Timestamp.now() });
    await db
      .doc(`users/${uid}`)
      .set({
        uid,
        displayName: user.displayName,
        avatarMode: "DEFAULT",
        profileVersion: 1,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
  }
}
const authored = [
  ["journey", "hành trình", "noun"],
  ["reservation", "sự đặt trước", "noun"],
  ["available", "có sẵn", "adjective"],
  ["station", "nhà ga", "noun"],
  ["ticket", "vé", "noun"],
  ["arrival", "sự đến nơi", "noun"],
  ["depart", "khởi hành", "verb"],
  ["return", "trở về", "verb"],
  ["luggage", "hành lý", "noun"],
  ["platform", "sân ga", "noun"],
  ["book", "đặt chỗ", "verb"],
  ["request", "yêu cầu", "verb"],
] as const;
const manifest: DictionaryManifest = {
  releaseId: "demo-authored-v1",
  sources: [
    {
      sourceId: "fallen-authored-demo",
      name: "fallEN authored local examples",
      version: "1",
      license:
        "Original demonstration text; not a dictionary provider dataset.",
      redistributionAllowed: true,
    },
  ],
  words: authored.map(([spelling, text, partOfSpeech]) => ({
    wordId: spelling,
    version: 1,
    spelling,
    otherSpellings: [],
    meanings: [{ id: `${spelling}-meaning`, text, partOfSpeech }],
    dictionaryRefs: [
      {
        sourceId: "fallen-authored-demo",
        sourceEntryId: spelling,
        sourceVersion: "1",
      },
    ],
    active: true,
    listenAllowed: true,
  })),
  connections: [],
};
await publishDictionaryManifest(manifest, 0, "demo-publish-v1");
if (!(await db.doc("systemDecks/travel").get()).exists) {
  const batch = db.batch(),
    now = Timestamp.now();
  batch.create(db.doc("systemDecks/travel"), {
    id: "travel",
    name: "Đi đây, đi đó",
    topic: "Du lịch",
    description: "Từ mẫu tự soạn cho chuyến đi.",
    active: true,
    version: 1,
    publishedRevisionId: "travel-v1",
  });
  batch.create(db.doc("systemDecks/travel/revisions/travel-v1"), {
    id: "travel-v1",
    wordSetId: "travel",
    name: "Đi đây, đi đó",
    topic: "Du lịch",
    description: "Từ mẫu tự soạn cho chuyến đi.",
    state: "PUBLISHED",
    version: 1,
    createdBy: "demo-admin",
    createdAt: now,
  });
  for (const [wordIndex, word] of manifest.words.entries())
    batch.create(
      db.doc(`systemDecks/travel/revisions/travel-v1/words/${word.wordId}`),
      {
        wordSetId: "travel",
        revisionId: "travel-v1",
        wordId: word.wordId,
        wordVersion: 1,
        position: wordIndex,
        focusMeaningId: word.meanings[0].id,
      },
    );
  const topic: Data = {
    id: "station",
    name: "Ở nhà ga",
    context: "A traveler is buying a train ticket.",
    learnerRole: "Traveler",
    aiRole: "Station staff",
    goal: "Ask for a ticket and platform.",
    openingLine: "Hello! Where would you like to travel?",
    guide: "Use simple English and encourage the reference vocabulary.",
    active: true,
    version: 1,
  };
  batch.set(db.doc("aiScenarios/station"), topic);
  batch.set(db.doc("config/ai"), { maxSessionsPerDay: 3, version: 1 });
  await batch.commit();
}
console.log(
  `Seed ready. Admin: ${adminEmail}; learner: ${learnerEmail}. Password is SEED_PASSWORD or the documented local-only default.`,
);
