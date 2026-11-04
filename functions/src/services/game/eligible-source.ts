import { z } from "zod";
import { sourceSchema } from "../../domain/values.js";
import {
  assertActive,
  db,
  hash,
  parse,
  type Actor,
} from "../../shared/core.js";
import { readDeckSource, readPersonalSource } from "../dictionary.js";

export async function getEligibleGameSource(actor: Actor, raw: unknown) {
  const req = parse(
    z
      .object({
        mode: z.enum(["MATCH_MEANINGS", "LISTEN_AND_TYPE"]),
        source: sourceSchema,
      })
      .strict(),
    raw,
  );
  await assertActive(actor);
  const source =
    req.source.sourceType === "SYSTEM_DECK"
      ? await readDeckSource(req.source)
      : await readPersonalSource(actor);
  let count = 0;
  for (const word of source.words) {
    const speech = (await db.doc(`words/${word.wordId}`).get()).data()?.speech;
    if (req.mode === "MATCH_MEANINGS" || speech?.listenAllowed) count++;
  }
  return {
    count,
    sourceVersion: hash(
      source.words.map((w) => ({
        wordId: w.wordId,
        wordVersion: w.wordVersion,
      })),
    ),
    reasons:
      count < (req.mode === "MATCH_MEANINGS" ? 5 : 1)
        ? ["INSUFFICIENT_GAME_SOURCE"]
        : [],
  };
}
