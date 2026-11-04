import type { Actor } from "../../contracts/callable.js";
import type { EligibleSourceInput } from "../../contracts/game/inputs.js";
import type { EligibleSourceStore } from "../../contracts/game/store.js";
import { hash } from "../../shared/values.js";
export function getEligibleGameSource(
  store: EligibleSourceStore,
  actor: Actor,
  req: EligibleSourceInput,
) {
  return store.read(actor, async (ctx) => {
    await ctx.requireActive();
    const source = await ctx.source(req.source);
    let count = 0;
    for (const word of source.words) {
      const speech = await ctx.speech(word.wordId);
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
  });
}
