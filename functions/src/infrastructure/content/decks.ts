import { fail, requireDoc, type Data } from "../../shared/core.js";
import { deckRef, revisionRef } from "./refs.js";

export function publicItem(s: FirebaseFirestore.DocumentSnapshot): Data {
  return { ...s.data(), id: s.id };
}

export async function getDraftData(wordSetId: string): Promise<Data> {
  const wordSet = requireDoc(await deckRef(wordSetId).get(), "DECK_NOT_FOUND");
  if (!wordSet.draftRevisionId) fail("DRAFT_NOT_FOUND");
  const ref = revisionRef(wordSetId, wordSet.draftRevisionId);
  const revision = requireDoc(await ref.get(), "DRAFT_NOT_FOUND");
  const words = await ref.collection("words").orderBy("position").get();
  return {
    wordSet: { ...wordSet, id: wordSetId },
    revision: { ...revision, id: ref.id },
    entries: words.docs.map((s) => ({ ...s.data(), wordId: s.id })),
  };
}
