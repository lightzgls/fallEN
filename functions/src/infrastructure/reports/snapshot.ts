import { type Target } from "../../domain/reports/contracts.js";
import { readWordVersion, resolveRelease } from "../../services/dictionary.js";
import {
  db,
  fail,
  hash,
  requireDoc,
  type Actor,
  type Data,
} from "../../shared/core.js";

export async function getSnapshot(
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
