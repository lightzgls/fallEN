import { db } from "../../shared/core.js";

export const deckRef = (wordSetId: string) =>
  db.doc(`systemDecks/${wordSetId}`);

export const revisionRef = (wordSetId: string, revisionId: string) =>
  deckRef(wordSetId).collection("revisions").doc(revisionId);

export const importRef = (importId: string) =>
  db.doc(`contentImports/${importId}`);
