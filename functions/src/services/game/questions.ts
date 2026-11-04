import { type Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import {
  selectRoundWords,
  type RoundWordCandidate,
} from "../../domain/round-words.js";
import { gameRef } from "../../infrastructure/game/refs.js";
import {
  db,
  fail,
  requireDoc,
  type Actor,
  type Data,
} from "../../shared/core.js";
import { readWordVersion, resolveRelease } from "../dictionary.js";
import { ttsSchema } from "./schemas.js";

export async function chooseQuestions(
  actor: Actor,
  game: Data,
  tx: Transaction,
  ttsConfig?: z.infer<typeof ttsSchema>,
) {
  if (game.source.sourceType === "SYSTEM_DECK") {
    const deck = requireDoc(
      await tx.get(db.doc(`systemDecks/${game.source.wordSetId}`)),
    );
    if (!deck.active) fail("DECK_UNAVAILABLE");
  }
  const source = await tx.get(
    gameRef(actor, game.id).collection("sourceWords").orderBy("position"),
  );
  const rounds = await tx.get(gameRef(actor, game.id).collection("rounds"));
  const seen = new Set<string>(
    rounds.docs.flatMap((s) => s.data().wordIds ?? []),
  );
  const release = await resolveRelease(undefined, tx);
  const candidates: RoundWordCandidate[] = [];
  for (const item of source.docs) {
    const active = (
      await tx.get(
        db.doc(`dictionaryReleases/${release.id}/entries/${item.id}`),
      )
    ).data();
    if (!active?.active) continue;
    const word = await readWordVersion(item.id, item.data().wordVersion, tx);
    const operational = (await tx.get(db.doc(`words/${item.id}`))).data();
    const meaning =
      word.meanings.find((m: Data) => m.id === item.data().focusMeaningId) ??
      word.meanings[0];
    if (!meaning?.text || !meaning.partOfSpeech) continue;
    if (
      game.mode === "LISTEN_AND_TYPE" &&
      (!operational?.speech?.listenAllowed || !ttsConfig)
    )
      continue;
    candidates.push({
      wordId: item.id,
      version: word.version,
      spelling: word.spelling,
      otherSpellings: word.otherSpellings ?? [],
      meaningId: meaning.id,
      meaning: meaning.text,
      partOfSpeech: meaning.partOfSpeech,
      ...(game.mode === "LISTEN_AND_TYPE"
        ? {
            text: word.spelling,
            speechVersion: operational!.speech.version,
            listenAllowed: operational!.speech.listenAllowed,
            ...ttsConfig,
          }
        : {}),
    });
  }
  const needed = game.mode === "MATCH_MEANINGS" ? 5 : 1;
  const selected = selectRoundWords(candidates, seen, needed);
  if (selected.status === "EXHAUSTED")
    fail(
      "SOURCE_EXHAUSTED",
      "All suitable words in this source have been used",
    );
  if (selected.status === "INSUFFICIENT")
    fail(
      "INSUFFICIENT_GAME_SOURCE",
      `This mode requires ${needed} distinct usable words and meanings`,
    );
  return selected.words.map((wordCopy, i) => ({
    id: `q_${i + 1}`,
    wordId: wordCopy.wordId,
    wordVersion: wordCopy.version,
    wordCopy,
    hintLevel: 0,
  }));
}
