import type { LearningStore } from "../../contracts/learning/store.js";
import { command } from "../firebase/commands.js";
import { assertActive } from "../firebase/access.js";
import { plain } from "./codec.js";
import { createLearningReads } from "./reads.js";
import { createLearningWrites } from "./writes.js";
export function createFirebaseLearningStore(): LearningStore {
  return {
    async command(actor, kind, input, execute) {
      const result = await command(actor, kind, input, async (tx, now) =>
        execute(
          {
            ...createLearningReads(actor, tx),
            ...createLearningWrites(actor, tx),
          },
          now.toDate(),
        ),
      );
      return plain(result);
    },
    async read(actor, execute) {
      await assertActive(actor);
      return execute(createLearningReads(actor));
    },
    now: () => new Date(),
  };
}
