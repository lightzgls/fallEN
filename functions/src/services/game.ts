import { type Actor } from "../shared/types.js";
import { startGame } from "./game/preparation.js";
import { endGame } from "./game/results.js";
import { saveRound } from "./game/round-commit.js";
import { createRound } from "./game/round-start.js";
import { getEligibleGameSource } from "./game/source-query.js";

export { prepareGame } from "./game/preparation.js";

/** Public Callable registry; each operation is implemented in its feature module. */
export const gameHandlers: Record<
  string,
  (actor: Actor, input: unknown) => Promise<unknown>
> = {
  startGame,
  createRound,
  saveRound,
  endGame,
  getEligibleGameSource,
};
