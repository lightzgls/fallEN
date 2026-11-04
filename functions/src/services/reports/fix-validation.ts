import {
  categorySchema,
  targetSchema,
  type Resolution,
} from "../../domain/reports/contracts.js";
import { learningContent } from "../../domain/reports/material.js";
import {
  db,
  fail,
  hash,
  parse,
  requireDoc,
  type Data,
} from "../../shared/core.js";
import { readWordVersion } from "../dictionary.js";

export async function validateFix(
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
