import { Timestamp } from "firebase-admin/firestore";
import { type EndChatCommand } from "../../domain/chat-commands.js";
import { type Actor, type Data } from "../../shared/types.js";
import { type SummaryFeedback } from "../../domain/chat-summary.js";
import { db } from "../firebase/runtime.js";
import { assertActive } from "../../shared/access.js";
import { checkVersion, requireDoc } from "../../shared/validation.js";
import { fail } from "../../shared/errors.js";
import { hash } from "../../shared/values.js";
import { replyCache } from "../ai/reply-cache.js";
import { chatPath } from "./refs.js";
function endingReferences(actor: Actor, req: EndChatCommand) {
  return {
    ref: db.doc(chatPath(actor, req.sessionId)),
    summaryRef: db.doc(`users/${actor.uid}/aiSummaries/${req.sessionId}`),
    commandRef: db.doc(`users/${actor.uid}/commands/${req.commandId}`),
  };
}
export async function beginChatEnding(
  actor: Actor,
  req: EndChatCommand,
): Promise<Data> {
  const { ref, summaryRef, commandRef } = endingReferences(actor, req);
  const requestHash = hash({
    kind: "endChat",
    input: {
      sessionId: req.sessionId,
      expectedVersion: req.expectedVersion,
      commandId: req.commandId,
      contextHash: req.context ? hash(req.context) : null,
    },
  });
  return db.runTransaction(async (tx) => {
    await assertActive(actor, tx);
    const [chatDoc, summaryDoc, commandDoc] = await tx.getAll(
      ref,
      summaryRef,
      commandRef,
    );
    const chat = requireDoc(chatDoc),
      previous = commandDoc.data();
    if (previous && previous.requestHash !== requestHash)
      fail("COMMAND_REUSED");
    if (summaryDoc.exists) return { summary: summaryDoc.data()! };
    if (previous?.status !== "IN_PROGRESS") {
      checkVersion(chat.version, req.expectedVersion);
      if (!["ACTIVE", "ENDING", "INTERRUPTED"].includes(chat.status))
        fail("CHAT_ENDED");
    }
    if (chat.endingCommandId && chat.endingCommandId !== req.commandId)
      fail("CONFLICT");
    tx.update(ref, { status: "ENDING", endingCommandId: req.commandId });
    tx.set(commandRef, {
      kind: "endChat",
      requestHash,
      status: "IN_PROGRESS",
      createdAt: Timestamp.now(),
    });
    return { chat };
  });
}
export async function commitChatSummary(
  actor: Actor,
  req: EndChatCommand,
  chat: Data,
  feedback: SummaryFeedback,
): Promise<Data> {
  const { ref, summaryRef, commandRef } = endingReferences(actor, req),
    { strengths, tips, mentionedWordIds, feedbackStatus } = feedback;
  return db.runTransaction(async (tx) => {
    await assertActive(actor, tx);
    const [chatDoc, existing] = await tx.getAll(ref, summaryRef);
    if (existing.exists) return existing.data()!;
    const current = requireDoc(chatDoc);
    if (current.endingCommandId !== req.commandId) fail("CONFLICT");
    const summary = {
      sessionId: req.sessionId,
      wordSetId: chat.wordSetId,
      scenarioId: chat.scenarioId,
      completedTurns: chat.completedTurns,
      mentionedWordIds,
      strengths,
      tips,
      feedbackStatus,
      endedAt: Timestamp.now(),
    };
    tx.create(summaryRef, summary);
    tx.update(ref, {
      status: req.context || !chat.completedTurns ? "FINISHED" : "INTERRUPTED",
      version: current.version + 1,
      pendingTurnId: null,
    });
    tx.update(commandRef, { status: "SUCCEEDED", receipt: summary });
    for (const key of replyCache.keys())
      if (key.startsWith(`${actor.uid}/${req.sessionId}/`))
        replyCache.delete(key);
    return summary;
  });
}
