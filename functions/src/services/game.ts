import { type Actor } from "../shared/types.js";
import { startGame } from "./game/prepare.js";
import { endGame } from "./game/results.js";
import { saveRound } from "./game/save-round.js";
import { createRound } from "./game/start-round.js";
import { getEligibleGameSource } from "./game/eligible-source.js";

export { prepareGame } from "./game/prepare.js";

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
