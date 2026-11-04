import { z } from "zod";
import { empty, objectId } from "../../domain/backend.js";
import {
  getDraftData,
  publicItem,
} from "../../infrastructure/content/deck-reads.js";
import { revisionRef } from "../../infrastructure/content/references.js";
import { db, parse, requireDoc, type Actor } from "../../shared/core.js";
import { admin } from "./access.js";

export async function listDecks(actor: Actor, raw: unknown) {
  parse(empty, raw);
  await admin(actor);
  const decks = await db.collection("systemDecks").orderBy("__name__").get();
  const items = await Promise.all(
    decks.docs.map(async (document) => {
      const deck = publicItem(document);
      if (deck.draftRevisionId)
        deck.draft = requireDoc(
          await revisionRef(document.id, deck.draftRevisionId).get(),
        );
      const selectedRevisionId =
        deck.publishedRevisionId ?? deck.draftRevisionId;
      deck.wordCount = selectedRevisionId
        ? (
            await revisionRef(document.id, selectedRevisionId)
              .collection("words")
              .count()
              .get()
          ).data().count
        : 0;
      return deck;
    }),
  );
  return { items };
}

export async function getDraft(actor: Actor, raw: unknown) {
  const req = parse(z.object({ wordSetId: objectId }).strict(), raw);
  await admin(actor);
  return getDraftData(req.wordSetId);
}
