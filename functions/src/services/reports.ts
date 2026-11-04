import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import {
  db,
  command,
  assertAdmin,
  assertActive,
  parse,
  fail,
  requireDoc,
  checkVersion,
  hash,
  cursorEncode,
  cursorDecode,
  type Actor,
  type Data,
} from "../shared/core.js";
import { resolveRelease, readWordVersion } from "./dictionary.js";
import { objectId, version, stableId } from "../domain/backend.js";

const categorySchema = z.enum([
  "MEANING",
  "EXAMPLE_TRANSLATION",
  "IMAGE",
  "PRONUNCIATION",
  "OTHER",
]);
const statusSchema = z.enum([
  "OPEN",
  "IN_REVIEW",
  "WAITING_RELEASE",
  "RESOLVED",
  "REJECTED",
]);
const gameTargetSchema = z
  .object({ sessionId: objectId, roundId: objectId, questionId: objectId })
  .strict();
const targetSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("WORD"),
      wordId: objectId,
      wordVersion: z.number().int().positive(),
      releaseId: objectId.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("SET_WORD"),
      wordSetId: objectId,
      revisionId: objectId,
      wordId: objectId,
      meaningId: objectId.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("SPEECH"),
      wordId: objectId,
      speechVersion: version,
      gameRef: gameTargetSchema.optional(),
    })
    .strict(),
]);
const resolutionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("DECK_REVISION"),
      wordSetId: objectId,
      revisionId: objectId,
    })
    .strict(),
  z
    .object({
      kind: z.literal("SPEECH"),
      wordId: objectId,
      speechVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({ kind: z.literal("DICTIONARY_RELEASE"), releaseId: objectId })
    .strict(),
]);
type Target = z.infer<typeof targetSchema>;
type Resolution = z.infer<typeof resolutionSchema>;
const transitions: Record<string, readonly string[]> = {
  OPEN: ["IN_REVIEW"],
  IN_REVIEW: ["WAITING_RELEASE", "RESOLVED", "REJECTED"],
  WAITING_RELEASE: ["IN_REVIEW", "RESOLVED", "REJECTED"],
  RESOLVED: [],
  REJECTED: [],
};
const reportRef = (reportId: string) => db.doc(`contentReports/${reportId}`);
async function getSnapshot(
  actor: Actor,
  target: Target,
  tx?: FirebaseFirestore.Transaction,
): Promise<Data> {
  const read = (path: string) =>
    tx ? tx.get(db.doc(path)) : db.doc(path).get();
  if (target.type === "WORD") {
    const release = await resolveRelease(target.releaseId, tx);
    const entry = requireDoc(
      await read(`dictionaryReleases/${release.id}/entries/${target.wordId}`),
    );
    if (entry.wordVersion !== target.wordVersion)
      fail("VALIDATION_FAILED", "Word version is not part of this release");
    const word = await readWordVersion(target.wordId, target.wordVersion, tx);
    return {
      wordId: target.wordId,
      wordVersion: word.version,
      releaseId: release.id,
      spelling: word.spelling,
      meanings: word.meanings,
      contentHash: hash({ spelling: word.spelling, meanings: word.meanings }),
    };
  }
  if (target.type === "SET_WORD") {
    const revision = requireDoc(
      await read(
        `systemDecks/${target.wordSetId}/revisions/${target.revisionId}`,
      ),
    );
    if (!["PUBLISHED", "RETIRED"].includes(revision.state))
      fail("PERMISSION_DENIED");
    const entry = requireDoc(
      await read(
        `systemDecks/${target.wordSetId}/revisions/${target.revisionId}/words/${target.wordId}`,
      ),
    );
    const word = await readWordVersion(target.wordId, entry.wordVersion, tx);
    if (
      target.meaningId &&
      !word.meanings.some((m: Data) => m.id === target.meaningId)
    )
      fail("VALIDATION_FAILED");
    return {
      wordSetId: target.wordSetId,
      revisionId: target.revisionId,
      wordId: target.wordId,
      wordVersion: entry.wordVersion,
      deckName: revision.name,
      spelling: word.spelling,
      entry,
      contentHash: hash(entry),
    };
  }
  if (target.gameRef) {
    const gamePath = `users/${actor.uid}/gameSessions/${target.gameRef.sessionId}`;
    const game = requireDoc(await read(gamePath));
    const round = requireDoc(
      await read(`${gamePath}/rounds/${target.gameRef.roundId}`),
    );
    const question = requireDoc(
      await read(
        `${gamePath}/rounds/${target.gameRef.roundId}/questions/${target.gameRef.questionId}`,
      ),
    );
    if (
      game.mode !== "LISTEN_AND_TYPE" ||
      question.wordId !== target.wordId ||
      question.wordCopy.speechVersion !== target.speechVersion
    )
      fail("VALIDATION_FAILED");
    const copy = question.wordCopy;
    return {
      wordId: question.wordId,
      wordVersion: question.wordVersion,
      speechVersion: copy.speechVersion,
      provider: "ANDROID_TTS",
      listenAllowed: copy.listenAllowed,
      policyHash: hash({
        provider: "ANDROID_TTS",
        listenAllowed: copy.listenAllowed,
        text: copy.text,
      }),
      meaning: copy.meaning,
      partOfSpeech: copy.partOfSpeech,
      locale: copy.locale,
      ...(round.status === "COMMITTED" ? { spelling: copy.spelling } : {}),
    };
  }
  const word = requireDoc(await read(`words/${target.wordId}`));
  if (!word.speech || word.speech.version !== target.speechVersion)
    fail("CONFLICT", "Speech configuration changed");
  return {
    wordId: target.wordId,
    speechVersion: word.speech.version,
    speech: word.speech,
  };
}
function publicReport(report: Data): Data {
  return {
    reportId: report.reportId,
    category: report.category,
    description: report.description,
    targetRef: report.targetRef,
    targetSnapshot: report.targetSnapshot,
    status: report.status,
    version: report.version,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    ...(report.publicResolution
      ? { publicResolution: report.publicResolution }
      : {}),
    ...(report.resolutionKind ? { resolutionKind: report.resolutionKind } : {}),
    ...(report.resolutionRef ? { resolutionRef: report.resolutionRef } : {}),
  };
}
function learningContent(
  word: Data,
  category: z.infer<typeof categorySchema>,
  override?: Data,
): Data {
  const meanings: Data[] = override?.focusMeaningId
    ? word.meanings.filter(
        (meaning: Data) => meaning.id === override.focusMeaningId,
      )
    : word.meanings;
  const projected = meanings
    .map((meaning) => {
      const meaningContent = {
        partOfSpeech: meaning.partOfSpeech,
        text: meaning.text,
      };
      const exampleContent = {
        meaning: meaningContent,
        example: override?.example ?? meaning.example ?? null,
        exampleTranslation: override?.example
          ? override.exampleTranslation
          : (meaning.exampleTranslation ?? null),
      };
      const imageContent = {
        meaning: meaningContent,
        imageAssetId: override?.imageAssetId ?? meaning.imageAssetId ?? null,
        imageAlt: override?.imageAssetId
          ? override.imageAlt
          : (meaning.imageAlt ?? null),
      };
      if (category === "MEANING") return meaningContent;
      if (category === "EXAMPLE_TRANSLATION") return exampleContent;
      if (category === "IMAGE") return imageContent;
      return { ...meaningContent, ...exampleContent, ...imageContent };
    })
    .sort((left, right) => hash(left).localeCompare(hash(right)));
  const pronunciation = {
    spelling: word.spelling,
    phonetic: word.phonetic ?? null,
    otherSpellings: [...(word.otherSpellings ?? [])].sort(),
  };
  if (category === "PRONUNCIATION") return pronunciation;
  return category === "OTHER"
    ? { ...pronunciation, meanings: projected }
    : { meanings: projected };
}
async function validateFix(
  report: Data,
  ref: Resolution,
  tx: FirebaseFirestore.Transaction,
) {
  const target = parse(targetSchema, report.targetRef);
  const category = parse(categorySchema, report.category);
  if (ref.kind === "DECK_REVISION") {
    if (
      target.type !== "SET_WORD" ||
      ref.wordSetId !== target.wordSetId ||
      ref.revisionId === target.revisionId
    )
      fail(
        "VALIDATION_FAILED",
        "Fix must reference a new revision of the reported deck",
      );
    const revision = requireDoc(
      await tx.get(
        db.doc(`systemDecks/${ref.wordSetId}/revisions/${ref.revisionId}`),
      ),
    );
    if (revision.state !== "PUBLISHED")
      fail("VALIDATION_FAILED", "Fix revision has not been published");
    const entry = requireDoc(
      await tx.get(
        db.doc(
          `systemDecks/${ref.wordSetId}/revisions/${ref.revisionId}/words/${target.wordId}`,
        ),
      ),
    );
    const originalEntry = report.targetSnapshot.entry;
    const originalWord = await readWordVersion(
      target.wordId,
      originalEntry.wordVersion,
      tx,
    );
    const fixedWord = await readWordVersion(
      target.wordId,
      entry.wordVersion,
      tx,
    );
    // A new revision, row position or WordVersion number is not evidence that the reported material changed.
    // Compare the category's effective learning content, including the same fallback rules as the learner sees.
    if (
      hash(learningContent(originalWord, category, originalEntry)) ===
      hash(learningContent(fixedWord, category, entry))
    ) {
      fail(
        "VALIDATION_FAILED",
        "The referenced revision has not changed the reported learning content",
      );
    }
    return;
  }
  if (ref.kind === "SPEECH") {
    if (
      target.type !== "SPEECH" ||
      ref.wordId !== target.wordId ||
      ref.speechVersion <= target.speechVersion
    )
      fail("VALIDATION_FAILED");
    const word = requireDoc(await tx.get(db.doc(`words/${ref.wordId}`)));
    if (word.speech?.version !== ref.speechVersion)
      fail(
        "VALIDATION_FAILED",
        "Speech fix is not the current saved configuration",
      );
    const oldPolicy = report.targetSnapshot.speech ?? report.targetSnapshot;
    const unchanged = report.targetSnapshot.policyHash
      ? report.targetSnapshot.policyHash ===
        hash({
          provider: word.speech.provider,
          listenAllowed: word.speech.listenAllowed,
          text: word.speech.text,
        })
      : word.speech.provider === oldPolicy.provider &&
        word.speech.listenAllowed === oldPolicy.listenAllowed &&
        word.speech.text === oldPolicy.text;
    if (unchanged) fail("VALIDATION_FAILED", "Speech policy has not changed");
    return;
  }
  if (target.type === "SPEECH") fail("VALIDATION_FAILED");
  const release = requireDoc(
    await tx.get(db.doc(`dictionaryReleases/${ref.releaseId}`)),
  );
  if (release.state !== "PUBLISHED")
    fail("VALIDATION_FAILED", "Dictionary fix has not been published");
  const entry = requireDoc(
    await tx.get(
      db.doc(`dictionaryReleases/${ref.releaseId}/entries/${target.wordId}`),
    ),
  );
  if (entry.wordVersion <= report.targetSnapshot.wordVersion)
    fail("VALIDATION_FAILED", "Dictionary word content has not changed");
  const originalWord = await readWordVersion(
    target.wordId,
    report.targetSnapshot.wordVersion,
    tx,
  );
  const fixedWord = await readWordVersion(target.wordId, entry.wordVersion, tx);
  const override =
    target.type === "SET_WORD" ? report.targetSnapshot.entry : undefined;
  if (
    hash(learningContent(originalWord, category, override)) ===
    hash(learningContent(fixedWord, category, override))
  ) {
    fail(
      "VALIDATION_FAILED",
      "The dictionary release has not changed the reported learning content",
    );
  }
}
async function submitReport(actor: Actor, raw: unknown) {
  const req = parse(
    z
      .object({
        commandId: objectId,
        targetRef: targetSchema,
        category: categorySchema,
        description: z.string().trim().min(1).max(1000),
      })
      .strict(),
    raw,
  );
  const reportId = stableId(actor.uid, "report", req.commandId);
  return command(actor, "submitReport", req, async (tx, now) => {
    const targetSnapshot = await getSnapshot(actor, req.targetRef, tx);
    const report = {
      reportId,
      ownerUid: actor.uid,
      category: req.category,
      description: req.description,
      targetRef: req.targetRef,
      targetSnapshot,
      status: "OPEN",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    tx.create(reportRef(reportId), report);
    return { report: publicReport(report) };
  });
}
async function updateReportStatus(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const req = parse(
    z
      .object({
        commandId: objectId,
        reportId: objectId,
        expectedVersion: version,
        newStatus: statusSchema,
        publicNote: z.string().trim().min(1).max(1000).optional(),
        resolutionKind: z.enum(["FIXED", "NOT_AN_ERROR"]).optional(),
        resolutionRef: resolutionSchema.optional(),
      })
      .strict(),
    raw,
  );
  return command(actor, "updateReportStatus", req, async (tx, now) => {
    const ref = reportRef(req.reportId);
    const report = requireDoc(await tx.get(ref));
    checkVersion(report.version, req.expectedVersion);
    if (!transitions[report.status]?.includes(req.newStatus))
      fail("VALIDATION_FAILED", "This report status transition is not allowed");
    if (["RESOLVED", "REJECTED"].includes(req.newStatus) && !req.publicNote)
      fail("VALIDATION_FAILED", "A public conclusion is required");
    if (req.newStatus === "RESOLVED") {
      if (req.resolutionKind !== "FIXED" || !req.resolutionRef)
        fail(
          "VALIDATION_FAILED",
          "Resolved reports need a published fix reference",
        );
      await validateFix(report, req.resolutionRef, tx);
    } else if (req.resolutionRef || req.resolutionKind)
      fail("VALIDATION_FAILED", "Only resolved reports accept a fix reference");
    const updated = {
      ...report,
      status: req.newStatus,
      version: report.version + 1,
      updatedAt: now,
      reviewerUid: actor.uid,
      ...(req.publicNote ? { publicResolution: req.publicNote } : {}),
      ...(req.resolutionKind
        ? {
            resolutionKind: req.resolutionKind,
            resolutionRef: req.resolutionRef,
          }
        : {}),
    };
    tx.set(ref, updated);
    tx.create(ref.collection("actions").doc(req.commandId), {
      actionId: req.commandId,
      commandId: req.commandId,
      actorUid: actor.uid,
      fromStatus: report.status,
      toStatus: req.newStatus,
      ...(req.publicNote ? { note: req.publicNote } : {}),
      ...(req.resolutionRef ? { resolutionRef: req.resolutionRef } : {}),
      createdAt: now,
    });
    return { report: updated };
  });
}
export const reportHandlers: Record<
  string,
  (actor: Actor, input: unknown) => Promise<unknown>
> = {
  submitReport,
  updateReportStatus,
  closeReport: updateReportStatus,
  async getReportContext(actor, raw) {
    const req = parse(z.object({ targetRef: targetSchema }).strict(), raw);
    await assertActive(actor);
    return {
      targetRef: req.targetRef,
      targetSnapshot: await getSnapshot(actor, req.targetRef),
    };
  },
  async getMyReports(actor, raw) {
    const req = parse(
      z.object({ cursor: z.string().max(2048).optional() }).strict(),
      raw,
    );
    await assertActive(actor);
    let query = db
      .collection("contentReports")
      .where("ownerUid", "==", actor.uid)
      .orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    if (req.cursor) {
      const cursor = cursorDecode(req.cursor);
      if (
        cursor.uid !== actor.uid ||
        cursor.kind !== "reports" ||
        !Number.isFinite(cursor.time)
      )
        fail("VALIDATION_FAILED");
      query = query.startAfter(
        Timestamp.fromMillis(cursor.time),
        parse(objectId, cursor.id),
      );
    }
    const result = await query.limit(21).get();
    const last = result.docs[19];
    return {
      items: result.docs.slice(0, 20).map((s) => publicReport(s.data())),
      ...(result.size > 20
        ? {
            cursor: cursorEncode({
              uid: actor.uid,
              kind: "reports",
              time: last.data().createdAt.toMillis(),
              id: last.id,
            }),
          }
        : {}),
    };
  },
  async getMyReport(actor, raw) {
    const req = parse(z.object({ reportId: objectId }).strict(), raw);
    await assertActive(actor);
    const report = requireDoc(await reportRef(req.reportId).get());
    if (report.ownerUid !== actor.uid) fail("PERMISSION_DENIED");
    return publicReport(report);
  },
  async listReports(actor, raw) {
    const req = parse(
      z
        .object({
          status: statusSchema.optional(),
          category: categorySchema.optional(),
          cursor: z.string().max(2048).optional(),
        })
        .strict(),
      raw,
    );
    assertAdmin(actor);
    await assertActive(actor);
    let query: FirebaseFirestore.Query = db.collection("contentReports");
    if (req.status) query = query.where("status", "==", req.status);
    if (req.category) query = query.where("category", "==", req.category);
    query = query.orderBy("updatedAt").orderBy(FieldPath.documentId());
    if (req.cursor) {
      const cursor = cursorDecode(req.cursor);
      if (
        cursor.filter !==
          hash({ status: req.status, category: req.category }) ||
        !Number.isFinite(cursor.time)
      )
        fail("VALIDATION_FAILED");
      query = query.startAfter(
        Timestamp.fromMillis(cursor.time),
        parse(objectId, cursor.id),
      );
    }
    const result = await query.limit(31).get();
    const last = result.docs[29];
    return {
      items: result.docs.slice(0, 30).map((s) => s.data()),
      ...(result.size > 30
        ? {
            cursor: cursorEncode({
              filter: hash({ status: req.status, category: req.category }),
              time: last.data().updatedAt.toMillis(),
              id: last.id,
            }),
          }
        : {}),
    };
  },
  async getReport(actor, raw) {
    const req = parse(z.object({ reportId: objectId }).strict(), raw);
    assertAdmin(actor);
    await assertActive(actor);
    const ref = reportRef(req.reportId);
    const report = requireDoc(await ref.get());
    const actions = await ref.collection("actions").orderBy("createdAt").get();
    return { ...report, actions: actions.docs.map((s) => s.data()) };
  },
};
