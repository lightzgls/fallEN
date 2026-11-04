import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import type { ChatStore } from "../../contracts/chat/store.js";
import { chatRecord } from "../../contracts/chat/records.js";
import { db } from "../firebase/runtime.js";
import { plainValue } from "../firebase/records.js";
import { assertActive } from "../firebase/access.js";
import { command } from "../firebase/commands.js";
import { parse } from "../../shared/validation.js";
import { readWordVersion } from "../dictionary/word-reader.js";
import {
  sourceReader,
  startContext,
  turnContext,
  endContext,
} from "./transactions.js";
import { stored, storedScenario, storedSummary } from "./codecs.js";
import { chatPath } from "./refs.js";

export const chatStore: ChatStore = {
  now: () => new Date(),
  assertActive,
  sourceReader,
  async startReceipt(actor, id) {
    return stored(
      z.object({
        kind: z.string(),
        requestHash: z.string(),
        receipt: z.unknown().optional(),
      }),
      await db.doc(`users/${actor.uid}/commands/${id}`).get(),
    );
  },
  decodeStartReceipt: (receipt) => parse(chatRecord, plainValue(receipt)),
  async startCommand(actor, input, work) {
    const result = await command(actor, "startChat", input, (tx, now) =>
      work(startContext(actor, tx, now.toDate())),
    );
    return parse(chatRecord, plainValue(result));
  },
  async delivered(actor, id) {
    const page = await db
      .collection(`${chatPath(actor, id)}/processedTurns`)
      .where("status", "==", "DELIVERED")
      .orderBy("turnOrder")
      .get();
    const shape = z.object({
      learnerHash: z.string().optional(),
      replyHash: z.string().optional(),
    });
    return page.docs.map((doc) => ({
      ...parse(shape, doc.data()),
      turnId: doc.id,
    }));
  },
  wordVersion: readWordVersion,
  async hasTurn(actor, id, turnId) {
    return (
      await db.doc(`${chatPath(actor, id)}/processedTurns/${turnId}`).get()
    ).exists;
  },
  turnTransaction(actor, active, work) {
    return db.runTransaction(async (tx) => {
      if (active) await assertActive(actor, tx);
      return work(turnContext(actor, tx, new Date()));
    });
  },
  endTransaction(actor, work) {
    return db.runTransaction(async (tx) => {
      await assertActive(actor, tx);
      return work(endContext(actor, tx, new Date()));
    });
  },
  async topics() {
    const page = await db
      .collection("aiScenarios")
      .where("active", "==", true)
      .get();
    return page.docs.map((doc) => ({ ...storedScenario(doc), id: doc.id }));
  },
  async history(actor, after) {
    let query = db
      .collection(`users/${actor.uid}/aiSummaries`)
      .orderBy("endedAt", "desc")
      .orderBy("__name__", "desc")
      .limit(21);
    if (after)
      query = query.startAfter(Timestamp.fromDate(after.time), after.id);
    const page = await query.get();
    return {
      items: page.docs
        .slice(0, 20)
        .map((doc) => ({ ...storedSummary(doc)!, id: doc.id })),
      hasMore: page.size > 20,
    };
  },
  async summary(actor, id) {
    return storedSummary(
      await db.doc(`users/${actor.uid}/aiSummaries/${id}`).get(),
    );
  },
};
