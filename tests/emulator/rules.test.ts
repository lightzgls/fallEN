import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

let environment: RulesTestEnvironment;
const projectId = "demo-fallen";

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST)
    throw new Error(
      "Run npm run test:emulator; refusing to connect to a live Firebase project.",
    );
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(
        new URL("../../firestore.rules", import.meta.url),
        "utf8",
      ),
    },
  });
});
afterAll(async () => {
  await environment?.cleanup();
});
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await Promise.all([
      setDoc(doc(database, "accountStates/alice"), {
        status: "ACTIVE",
        version: 1,
      }),
      setDoc(doc(database, "accountStates/bob"), {
        status: "ACTIVE",
        version: 1,
      }),
      setDoc(doc(database, "accountStates/deleting"), {
        status: "DELETING",
        version: 2,
      }),
      setDoc(doc(database, "users/alice"), {
        uid: "alice",
        displayName: "Alice",
        profileVersion: 1,
      }),
      setDoc(doc(database, "users/alice/personalWords/book"), {
        active: true,
        membershipVersion: 1,
      }),
      setDoc(doc(database, "users/alice/aiSummaries/chat1"), {
        completedTurns: 2,
      }),
      setDoc(doc(database, "users/alice/commands/command1"), {
        status: "SUCCEEDED",
        receipt: { private: true },
      }),
      setDoc(doc(database, "users/deleting/personalWords/book"), {
        active: true,
      }),
      setDoc(doc(database, "contentReports/report1"), {
        ownerUid: "alice",
        reviewerUid: "admin",
      }),
      setDoc(doc(database, "dictionaryReleases/staging"), { state: "STAGING" }),
      setDoc(doc(database, "dictionaryReleases/public"), {
        state: "PUBLISHED",
      }),
      setDoc(doc(database, "systemDecks/deck/revisions/draft"), {
        state: "DRAFT",
      }),
      setDoc(doc(database, "config/ai"), { maxSessionsPerDay: 3, version: 1 }),
    ]);
  });
});

describe("Firestore access boundary", () => {
  it("permits ACTIVE owner reads and owner-scoped queries", async () => {
    const database = environment.authenticatedContext("alice").firestore();
    await assertSucceeds(getDoc(doc(database, "users/alice")));
    await assertSucceeds(
      getDocs(collection(database, "users/alice/personalWords")),
    );
    await assertSucceeds(
      getDoc(doc(database, "users/alice/aiSummaries/chat1")),
    );
    await assertFails(getDoc(doc(database, "users/alice/commands/command1")));
    await assertFails(
      getDoc(
        doc(
          database,
          "users/alice/gameSessions/game1/rounds/round1/questions/question1",
        ),
      ),
    );
  });

  it("denies anonymous and cross-owner personal data, including an admin claim", async () => {
    const guest = environment.unauthenticatedContext().firestore();
    const bob = environment.authenticatedContext("bob").firestore();
    const admin = environment
      .authenticatedContext("admin", { contentAdmin: true })
      .firestore();
    await assertFails(getDoc(doc(guest, "users/alice/personalWords/book")));
    await assertFails(getDoc(doc(bob, "users/alice/personalWords/book")));
    await assertFails(getDoc(doc(admin, "users/alice/aiSummaries/chat1")));
    await assertFails(getDoc(doc(admin, "users/alice/commands/command1")));
    await assertFails(getDocs(collection(admin, "users")));
  });

  it("denies all private reads when the lifecycle gate is DELETING or absent", async () => {
    const deleting = environment.authenticatedContext("deleting").firestore();
    const missing = environment.authenticatedContext("missing").firestore();
    await assertFails(
      getDoc(doc(deleting, "users/deleting/personalWords/book")),
    );
    await assertFails(getDoc(doc(missing, "users/missing")));
  });

  it("denies direct mutation of profile, progress, receipts and summary for the owner", async () => {
    const database = environment.authenticatedContext("alice").firestore();
    for (const path of [
      "users/alice/wordProgress/book",
      "users/alice/srsSchedules/book",
      "users/alice/assessmentEvents/forged",
      "users/alice/learningDays/2026-11-04",
      "users/alice/dashboard/summary",
      "users/alice/commands/forged",
      "users/alice/gameSessions/forged",
      "users/alice/aiDailyUsage/2026-11-04",
    ])
      await assertFails(setDoc(doc(database, path), { forged: true }));
    await assertFails(
      updateDoc(doc(database, "users/alice"), {
        profileVersion: 2,
        contentAdmin: true,
      }),
    );
    await assertFails(
      deleteDoc(doc(database, "users/alice/personalWords/book")),
    );
  });

  it("routes content, raw reports, deletion status and every dictionary release through Services", async () => {
    for (const context of [
      environment.unauthenticatedContext(),
      environment.authenticatedContext("alice"),
      environment.authenticatedContext("admin", { contentAdmin: true }),
    ]) {
      const database = context.firestore();
      for (const path of [
        "dictionaryReleases/staging",
        "dictionaryReleases/public",
        "systemDecks/deck/revisions/draft",
        "config/ai",
        "contentReports/report1",
        "accountDeletionJobs/job1",
        "accountStates/alice",
      ])
        await assertFails(getDoc(doc(database, path)));
      await assertFails(
        setDoc(doc(database, "words/book/versions/99"), { spelling: "forged" }),
      );
      await assertFails(
        setDoc(doc(database, "config/ai"), { maxSessionsPerDay: 999 }),
      );
    }
  });
});
