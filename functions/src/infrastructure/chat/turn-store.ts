import { Timestamp } from "firebase-admin/firestore";
import {
  type TurnCommand,
  type AcknowledgeTurnCommand,
} from "../../domain/chat-commands.js";
import { type Actor, type Data } from "../../shared/types.js";
import { db } from "../firebase/runtime.js";
import { assertActive } from "../../shared/access.js";
import { checkVersion, requireDoc } from "../../shared/validation.js";
import { fail } from "../../shared/errors.js";
import { hash } from "../../shared/values.js";
import { cacheKey, replyCache } from "../ai/reply-cache.js";
import { chatPath } from "./refs.js";
function turnReferences(
  actor: Actor,
  req: { sessionId: string; turnId: string },
) {
  const ref = db.doc(chatPath(actor, req.sessionId));
  return { ref, turnRef: ref.collection("processedTurns").doc(req.turnId) };
}
export async function hasProcessedTurn(
  actor: Actor,
  req: TurnCommand,
): Promise<boolean> {
  return (await turnReferences(actor, req).turnRef.get()).exists;
}
export async function reserveTurn(
  actor: Actor,
  req: TurnCommand,
  leaseId: string,
): Promise<Data> {
  const { ref, turnRef } = turnReferences(actor, req),
    requestHash = hash(req);
  return db.runTransaction(async (tx) => {
    await assertActive(actor, tx);
    const [chatDoc, turnDoc] = await tx.getAll(ref, turnRef);
    const chat = requireDoc(chatDoc),
      turn = turnDoc.data();
    if (turn) {
      if (turn.requestHash !== requestHash) fail("COMMAND_REUSED");
      if (turn.status === "REPLY_READY") {
        const cached = replyCache.get(
          cacheKey(actor, req.sessionId, req.turnId),
        );
        return {
          cached: cached
            ? {
                turnId: req.turnId,
                chatVersion: turn.readyVersion,
                reply: cached.reply,
                status: "REPLY_READY",
              }
            : {
                turnId: req.turnId,
                chatVersion: chat.version,
                status: "INTERRUPTED",
              },
        };
      }
      if (["DELIVERED", "DISCARDED"].includes(turn.status))
        return {
          cached: {
            turnId: req.turnId,
            chatVersion: chat.version,
            status: "INTERRUPTED",
          },
        };
      if (
        turn.status === "PENDING" &&
        turn.leaseExpiresAt.toMillis() > Date.now()
      )
        fail("TURN_IN_PROGRESS");
    }
    checkVersion(chat.version, req.expectedVersion);
    if (chat.status !== "ACTIVE" || chat.completedTurns >= 15)
      fail("CHAT_ENDED");
    if (chat.pendingTurnId && chat.pendingTurnId !== req.turnId)
      fail("TURN_IN_PROGRESS");
    tx.set(turnRef, {
      turnId: req.turnId,
      status: "PENDING",
      requestHash,
      leaseId,
      leaseExpiresAt: Timestamp.fromMillis(Date.now() + 60_000),
      turnOrder: chat.completedTurns + 1,
      learnerHash: hash(req.message),
    });
    tx.update(ref, { pendingTurnId: req.turnId });
    return { chat };
  });
}
export async function recordTurnFailure(
  actor: Actor,
  req: TurnCommand,
  leaseId: string,
): Promise<void> {
  const { turnRef } = turnReferences(actor, req);
  await db.runTransaction(async (tx) => {
    const current = (await tx.get(turnRef)).data();
    if (current?.leaseId === leaseId && current.status === "PENDING")
      tx.update(turnRef, {
        status: "FAILED",
        errorCode: "AI_REPLY_UNAVAILABLE",
        leaseExpiresAt: Timestamp.fromMillis(0),
      });
  });
}
export async function recordReadyReply(
  actor: Actor,
  req: TurnCommand,
  leaseId: string,
  reply: string,
): Promise<Data> {
  const { ref, turnRef } = turnReferences(actor, req);
  return db.runTransaction(async (tx) => {
    await assertActive(actor, tx);
    const [chatDoc, turnDoc] = await tx.getAll(ref, turnRef);
    const chat = requireDoc(chatDoc),
      turn = requireDoc(turnDoc);
    if (turn.leaseId !== leaseId || turn.status !== "PENDING")
      fail("TURN_INTERRUPTED");
    if (chat.status !== "ACTIVE" || chat.version !== req.expectedVersion) {
      tx.update(turnRef, { status: "DISCARDED" });
      return {
        turnId: req.turnId,
        chatVersion: chat.version,
        status: "INTERRUPTED",
      };
    }
    const readyVersion = chat.version + 1;
    tx.update(turnRef, {
      status: "REPLY_READY",
      readyVersion,
      replyHash: hash(reply),
      leaseExpiresAt: Timestamp.fromMillis(0),
    });
    tx.update(ref, { version: readyVersion });
    return {
      turnId: req.turnId,
      chatVersion: readyVersion,
      status: "REPLY_READY",
      reply,
    };
  });
}
export async function acknowledgeStoredTurn(
  actor: Actor,
  req: AcknowledgeTurnCommand,
): Promise<Data> {
  return db.runTransaction(async (tx) => {
    await assertActive(actor, tx);
    const ref = db.doc(chatPath(actor, req.sessionId)),
      turnRef = ref.collection("processedTurns").doc(req.turnId);
    const [chatDoc, turnDoc] = await tx.getAll(ref, turnRef);
    const chat = requireDoc(chatDoc),
      turn = requireDoc(turnDoc);
    if (turn.status === "DELIVERED") return turn.ackReceipt;
    checkVersion(chat.version, req.expectedVersion);
    if (
      chat.status !== "ACTIVE" ||
      turn.status !== "REPLY_READY" ||
      turn.readyVersion !== req.expectedVersion ||
      chat.pendingTurnId !== req.turnId
    )
      fail("TURN_INTERRUPTED");
    const receipt = {
      turnId: req.turnId,
      completedTurns: chat.completedTurns + 1,
      chatVersion: chat.version + 1,
    };
    tx.update(turnRef, {
      status: "DELIVERED",
      acknowledgedAt: Timestamp.now(),
      ackReceipt: receipt,
    });
    tx.update(ref, {
      completedTurns: receipt.completedTurns,
      version: receipt.chatVersion,
      pendingTurnId: null,
      ...(receipt.completedTurns === 15 ? { status: "ENDING" } : {}),
    });
    replyCache.delete(cacheKey(actor, req.sessionId, req.turnId));
    return receipt;
  });
}
