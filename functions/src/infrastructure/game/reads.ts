import { type Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import type { Actor } from "../../contracts/callable.js";
import type { GameReader } from "../../contracts/game/store.js";
import * as records from "../../contracts/game/records.js";
import { assertActive } from "../firebase/access.js";
import { db } from "../firebase/runtime.js";
import { plain, record } from "../learning/codec.js";
import { createLearningReads } from "../learning/reads.js";
import { readWordVersion } from "../dictionary/word-reader.js";
export function createGameReads(actor: Actor, tx?: Transaction): GameReader {
  const personal = createLearningReads(actor, tx);
  const gameRef = (id: string) =>
    db.doc(`users/${actor.uid}/gameSessions/${id}`);
  const read = (ref: FirebaseFirestore.DocumentReference) =>
    tx ? tx.get(ref) : ref.get();
  const list = async <S extends z.ZodType>(
    query: FirebaseFirestore.Query,
    schema: S,
  ) =>
    (await (tx ? tx.get(query) : query.get())).docs.map((doc) =>
      schema.parse(plain({ ...doc.data(), id: doc.id })),
    );
  return {
    requireActive: () => assertActive(actor, tx),
    async game(id) {
      return record(await read(gameRef(id)), records.gameRecord);
    },
    async command(id) {
      return record(
        await read(db.doc(`users/${actor.uid}/commands/${id}`)),
        records.commandRecord,
      );
    },
    source: personal.source,
    async sourceWords(id) {
      return (
        await (tx
          ? tx.get(gameRef(id).collection("sourceWords").orderBy("position"))
          : gameRef(id).collection("sourceWords").orderBy("position").get())
      ).docs.map((doc) => records.sourceWordRecord.parse(plain(doc.data())));
    },
    async rounds(id) {
      return list(gameRef(id).collection("rounds"), records.roundRecord);
    },
    async round(sessionId, roundId) {
      return record(
        await read(gameRef(sessionId).collection("rounds").doc(roundId)),
        records.roundRecord,
      );
    },
    async questions(sessionId, roundId) {
      return list(
        gameRef(sessionId)
          .collection("rounds")
          .doc(roundId)
          .collection("questions"),
        records.questionRecord,
      );
    },
    async deckActive(id) {
      const doc = await read(db.doc(`systemDecks/${id}`));
      return doc.exists
        ? z.object({ active: z.boolean() }).parse(doc.data()).active
        : undefined;
    },
    releaseId: personal.releaseId,
    entry: personal.entry,
    wordVersion: (id, version) => readWordVersion(id, version, tx),
    async speech(id) {
      const doc = await read(db.doc(`words/${id}`));
      return doc.data()?.speech
        ? records.speechRecord.parse(doc.data()!.speech)
        : undefined;
    },
    day: personal.day,
    summary: personal.summary,
  };
}
