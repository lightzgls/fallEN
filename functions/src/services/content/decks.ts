import type { Actor } from "../../contracts/callable.js";
import type { DeckQueryStore } from "../../contracts/content/ports.js";
import type {
  GetDraftInput,
  ListDecksInput,
} from "../../contracts/content/drafts-inputs.js";
import { fail } from "../../shared/errors.js";
import { required } from "./required.js";
export function createDeckQueries(store: DeckQueryStore) {
  return {
    listDecks: async (actor: Actor, _input: ListDecksInput) => {
      await store.active(actor);
      const items = await Promise.all(
        (await store.decks()).map(async (deck) => {
          const draft = deck.draftRevisionId
            ? required(await store.revision(deck.id, deck.draftRevisionId))
            : undefined;
          const selected = deck.publishedRevisionId ?? deck.draftRevisionId;
          return {
            ...deck,
            ...(draft ? { draft } : {}),
            wordCount: selected
              ? (await store.entries(deck.id, selected)).length
              : 0,
          };
        }),
      );
      return { items };
    },
    getDraft: async (actor: Actor, req: GetDraftInput) => {
      await store.active(actor);
      const wordSet = required(
        await store.deck(req.wordSetId),
        "DECK_NOT_FOUND",
      );
      if (!wordSet.draftRevisionId) fail("DRAFT_NOT_FOUND");
      const revision = required(
        await store.revision(req.wordSetId, wordSet.draftRevisionId),
        "DRAFT_NOT_FOUND",
      );
      return {
        wordSet,
        revision,
        entries: await store.entries(req.wordSetId, wordSet.draftRevisionId),
      };
    },
  };
}
