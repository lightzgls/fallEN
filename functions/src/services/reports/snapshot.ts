import type { Actor } from "../../contracts/callable.js";
import type {
  ReportReader,
  ReportTarget,
} from "../../contracts/reports/store.js";
import type { RecordData } from "../../contracts/content/records.js";
import type { Data } from "../../shared/types.js";
import { fail } from "../../shared/errors.js";
import { hash } from "../../shared/values.js";
import { required } from "../content/required.js";
export async function getSnapshot(
  reader: ReportReader,
  actor: Actor,
  target: ReportTarget,
): Promise<RecordData> {
  if (target.type === "WORD") {
    const release = await reader.publicRelease(target.releaseId),
      entry = required(await reader.releaseEntry(release.id, target.wordId));
    if (entry.wordVersion !== target.wordVersion)
      fail("VALIDATION_FAILED", "Word version is not part of this release");
    const word = await reader.wordVersion(target.wordId, target.wordVersion);
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
    const revision = required(
      await reader.revision(target.wordSetId, target.revisionId),
    );
    if (!["PUBLISHED", "RETIRED"].includes(revision.state))
      fail("PERMISSION_DENIED");
    const entry = required(
        await reader.entry(target.wordSetId, target.revisionId, target.wordId),
      ),
      word = await reader.wordVersion(target.wordId, entry.wordVersion);
    if (
      target.meaningId &&
      !word.meanings.some((meaning: Data) => meaning.id === target.meaningId)
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
    const game = await reader.listeningContext(actor.uid, target.gameRef),
      copy = game.copy;
    if (
      game.mode !== "LISTEN_AND_TYPE" ||
      game.wordId !== target.wordId ||
      copy.speechVersion !== target.speechVersion
    )
      fail("VALIDATION_FAILED");
    return {
      wordId: game.wordId,
      wordVersion: game.wordVersion,
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
      ...(game.roundStatus === "COMMITTED" ? { spelling: copy.spelling } : {}),
    };
  }
  const speech = await reader.speech(target.wordId);
  if (!speech || speech.version !== target.speechVersion)
    fail("CONFLICT", "Speech configuration changed");
  return { wordId: target.wordId, speechVersion: speech.version, speech };
}
