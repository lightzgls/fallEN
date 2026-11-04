import type { Actor } from "../../contracts/callable.js";
import type {
  AcknowledgeTurnCommand,
  TurnCommand,
} from "../../domain/chat-commands.js";
import type { ChatSession, TurnReceipt } from "../../contracts/chat/records.js";
import type { ChatStore, ReplyMemory } from "../../contracts/chat/store.js";
import { fail } from "../../shared/errors.js";
import { checkVersion } from "../../shared/validation.js";
import { hash } from "../../shared/values.js";

export function reserveTurn(
  store: ChatStore,
  memory: ReplyMemory,
  actor: Actor,
  req: TurnCommand,
  leaseId: string,
): Promise<{ chat: ChatSession } | { cached: TurnReceipt }> {
  const requestHash = hash(req);
  return store.turnTransaction(actor, true, async (tx) => {
    const chat = await tx.chat(req.sessionId),
      turn = await tx.turn(req.sessionId, req.turnId);
    if (turn) {
      if (turn.requestHash !== requestHash) fail("COMMAND_REUSED");
      if (turn.status === "REPLY_READY") {
        const reply = memory.read(actor, req.sessionId, req.turnId);
        return {
          cached: reply
            ? {
                turnId: req.turnId,
                chatVersion: turn.readyVersion ?? chat.version,
                reply,
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
        (turn.leaseExpiresAt?.getTime() ?? 0) > store.now().getTime()
      )
        fail("TURN_IN_PROGRESS");
    }
    checkVersion(chat.version, req.expectedVersion);
    if (chat.status !== "ACTIVE" || chat.completedTurns >= 15)
      fail("CHAT_ENDED");
    if (chat.pendingTurnId && chat.pendingTurnId !== req.turnId)
      fail("TURN_IN_PROGRESS");
    tx.saveTurn(req.sessionId, {
      turnId: req.turnId,
      status: "PENDING",
      requestHash,
      leaseId,
      leaseExpiresAt: new Date(store.now().getTime() + 60_000),
      turnOrder: chat.completedTurns + 1,
      learnerHash: hash(req.message),
    });
    tx.patchChat(req.sessionId, { pendingTurnId: req.turnId });
    return { chat };
  });
}
export function recordTurnFailure(
  store: ChatStore,
  actor: Actor,
  req: TurnCommand,
  leaseId: string,
): Promise<void> {
  return store.turnTransaction(actor, false, async (tx) => {
    const turn = await tx.turn(req.sessionId, req.turnId);
    if (turn?.leaseId === leaseId && turn.status === "PENDING")
      tx.patchTurn(req.sessionId, req.turnId, {
        status: "FAILED",
        errorCode: "AI_REPLY_UNAVAILABLE",
        leaseExpiresAt: new Date(0),
      });
  });
}
export function recordReadyReply(
  store: ChatStore,
  actor: Actor,
  req: TurnCommand,
  leaseId: string,
  reply: string,
): Promise<TurnReceipt> {
  return store.turnTransaction(actor, true, async (tx) => {
    const chat = await tx.chat(req.sessionId),
      turn = (await tx.turn(req.sessionId, req.turnId)) ?? fail("NOT_FOUND");
    if (turn.leaseId !== leaseId || turn.status !== "PENDING")
      fail("TURN_INTERRUPTED");
    if (chat.status !== "ACTIVE" || chat.version !== req.expectedVersion) {
      tx.patchTurn(req.sessionId, req.turnId, { status: "DISCARDED" });
      return {
        turnId: req.turnId,
        chatVersion: chat.version,
        status: "INTERRUPTED",
      };
    }
    const readyVersion = chat.version + 1;
    tx.patchTurn(req.sessionId, req.turnId, {
      status: "REPLY_READY",
      readyVersion,
      replyHash: hash(reply),
      leaseExpiresAt: new Date(0),
    });
    tx.patchChat(req.sessionId, { version: readyVersion });
    return {
      turnId: req.turnId,
      chatVersion: readyVersion,
      status: "REPLY_READY",
      reply,
    };
  });
}
export async function acknowledgeTurn(
  store: ChatStore,
  memory: ReplyMemory,
  actor: Actor,
  req: AcknowledgeTurnCommand,
) {
  const result = await store.turnTransaction(actor, true, async (tx) => {
    const chat = await tx.chat(req.sessionId),
      turn = (await tx.turn(req.sessionId, req.turnId)) ?? fail("NOT_FOUND");
    if (turn.status === "DELIVERED")
      return turn.ackReceipt ?? fail("TURN_INTERRUPTED");
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
    tx.patchTurn(req.sessionId, req.turnId, {
      status: "DELIVERED",
      acknowledgedAt: tx.now,
      ackReceipt: receipt,
    });
    tx.patchChat(req.sessionId, {
      completedTurns: receipt.completedTurns,
      version: receipt.chatVersion,
      pendingTurnId: null,
      ...(receipt.completedTurns === 15 ? { status: "ENDING" } : {}),
    });
    return receipt;
  });
  memory.remove(actor, req.sessionId, req.turnId);
  return result;
}
