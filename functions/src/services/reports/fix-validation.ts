import type {
  ReportReader,
  ReportRecord,
  ReportResolution,
} from "../../contracts/reports/store.js";
import { learningContent } from "../../domain/reports/material.js";
import { fail } from "../../shared/errors.js";
import { hash } from "../../shared/values.js";
import { required } from "../content/required.js";
export async function validateFix(
  reader: ReportReader,
  report: ReportRecord,
  ref: ReportResolution,
) {
  const target = report.targetRef,
    category = report.category;
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
    const revision = required(
      await reader.revision(ref.wordSetId, ref.revisionId),
    );
    if (revision.state !== "PUBLISHED")
      fail("VALIDATION_FAILED", "Fix revision has not been published");
    const entry = required(
      await reader.entry(ref.wordSetId, ref.revisionId, target.wordId),
    );
    const originalEntry = report.targetSnapshot.entry,
      originalWord = await reader.wordVersion(
        target.wordId,
        originalEntry.wordVersion,
      ),
      fixedWord = await reader.wordVersion(target.wordId, entry.wordVersion);
    if (
      hash(learningContent(originalWord, category, originalEntry)) ===
      hash(learningContent(fixedWord, category, entry))
    )
      fail(
        "VALIDATION_FAILED",
        "The referenced revision has not changed the reported learning content",
      );
    return;
  }
  if (ref.kind === "SPEECH") {
    if (
      target.type !== "SPEECH" ||
      ref.wordId !== target.wordId ||
      ref.speechVersion <= target.speechVersion
    )
      fail("VALIDATION_FAILED");
    const speech = await reader.speech(ref.wordId);
    if (speech?.version !== ref.speechVersion)
      fail(
        "VALIDATION_FAILED",
        "Speech fix is not the current saved configuration",
      );
    const oldPolicy = report.targetSnapshot.speech ?? report.targetSnapshot;
    const unchanged = report.targetSnapshot.policyHash
      ? report.targetSnapshot.policyHash ===
        hash({
          provider: speech.provider,
          listenAllowed: speech.listenAllowed,
          text: speech.text,
        })
      : speech.provider === oldPolicy.provider &&
        speech.listenAllowed === oldPolicy.listenAllowed &&
        speech.text === oldPolicy.text;
    if (unchanged) fail("VALIDATION_FAILED", "Speech policy has not changed");
    return;
  }
  if (target.type === "SPEECH") fail("VALIDATION_FAILED");
  const release = required(await reader.release(ref.releaseId));
  if (release.state !== "PUBLISHED")
    fail("VALIDATION_FAILED", "Dictionary fix has not been published");
  const entry = required(
    await reader.releaseEntry(ref.releaseId, target.wordId),
  );
  if (entry.wordVersion <= report.targetSnapshot.wordVersion)
    fail("VALIDATION_FAILED", "Dictionary word content has not changed");
  const originalWord = await reader.wordVersion(
      target.wordId,
      report.targetSnapshot.wordVersion,
    ),
    fixedWord = await reader.wordVersion(target.wordId, entry.wordVersion),
    override =
      target.type === "SET_WORD" ? report.targetSnapshot.entry : undefined;
  if (
    hash(learningContent(originalWord, category, override)) ===
    hash(learningContent(fixedWord, category, override))
  )
    fail(
      "VALIDATION_FAILED",
      "The dictionary release has not changed the reported learning content",
    );
}
