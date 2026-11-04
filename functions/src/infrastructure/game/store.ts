import type { GameStore } from "../../contracts/game/store.js";
import { db } from "../firebase/runtime.js";
import { command } from "../firebase/commands.js";
import { plain } from "../learning/codec.js";
import { createGameReads } from "./reads.js";
import { createGameWrites } from "./writes.js";
export function createFirebaseGameStore(): GameStore {
  const context = (
    actor: Parameters<GameStore["read"]>[0],
    tx: FirebaseFirestore.Transaction,
  ) => ({ ...createGameReads(actor, tx), ...createGameWrites(actor, tx) });
  return {
    transaction: (actor, execute) =>
      db.runTransaction((tx) => execute(context(actor, tx))),
    async command(actor, kind, input, execute) {
      const value = await command(actor, kind, input, (tx, now) =>
        execute(context(actor, tx), now.toDate()),
      );
      return plain(value);
    },
    read: (actor, execute) => execute(createGameReads(actor)),
    now: () => new Date(),
  };
}
