import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { sessionSchema } from "../../domain/chat-commands.js";
import {
  type Actor,
  assertActive,
  cursorDecode,
  cursorEncode,
  db,
  empty,
  fail,
  identifier,
  parse,
  requireDoc,
} from "../../shared/core.js";
import { candidates } from "./context.js";

export async function getChatWords(actor: Actor, raw: unknown) {
  const input = parse(z.object({ wordSetId: identifier }).strict(), raw);
  await assertActive(actor);
  return candidates(actor, input.wordSetId);
}

export async function getTopics(actor: Actor, raw: unknown) {
  parse(empty, raw);
  await assertActive(actor);
  return {
    items: (
      await db.collection("aiScenarios").where("active", "==", true).get()
    ).docs.map((doc) => ({ ...doc.data(), id: doc.id })),
  };
}

export async function getChatHistory(actor: Actor, raw: unknown) {
  const input = parse(
    z.object({ cursor: z.string().max(4096).optional() }).strict(),
    raw,
  );
  await assertActive(actor);
  let query = db
    .collection(`users/${actor.uid}/aiSummaries`)
    .orderBy("endedAt", "desc")
    .orderBy("__name__", "desc")
    .limit(21);
  if (input.cursor) {
    const cursor = cursorDecode(input.cursor);
    if (cursor.uid !== actor.uid) fail("VALIDATION_FAILED");
    query = query.startAfter(Timestamp.fromMillis(cursor.time), cursor.id);
  }
  const docs = await query.get(),
    items = docs.docs
      .slice(0, 20)
      .map((doc) => ({ ...doc.data(), id: doc.id })),
    last = docs.docs[19];
  return {
    items,
    cursor:
      docs.size > 20
        ? cursorEncode({
            uid: actor.uid,
            time: last.data().endedAt.toMillis(),
            id: last.id,
          })
        : undefined,
  };
}

export async function getChatSummary(actor: Actor, raw: unknown) {
  const input = parse(sessionSchema.strict(), raw);
  await assertActive(actor);
  return requireDoc(
    await db.doc(`users/${actor.uid}/aiSummaries/${input.sessionId}`).get(),
  );
}
