import type { Actor } from "../../contracts/callable.js";
import type { ChatStore, ReplyMemory } from "../../contracts/chat/store.js";
import type { TurnCommand } from "../../domain/chat-commands.js";
import type { ChatApi } from "../../domain/chat.js";
import { ApplicationError } from "../../shared/errors.js";
import { id } from "../../shared/values.js";
import { deliveredContext, promptFor } from "./context.js";
import { reserveTurn, recordTurnFailure, recordReadyReply } from "./turns.js";

export async function sendMessage(
  store: ChatStore,
  memory: ReplyMemory,
  api: ChatApi,
  actor: Actor,
  req: TurnCommand,
) {
  await store.assertActive(actor);
  memory.prune();
  if (!(await store.hasTurn(actor, req.sessionId, req.turnId)))
    await deliveredContext(store, actor, req.sessionId, req.context);
  const leaseId = id(),
    begun = await reserveTurn(store, memory, actor, req, leaseId);
  if ("cached" in begun) return begun.cached;
  let reply: string;
  try {
    await deliveredContext(store, actor, req.sessionId, req.context);
    reply = (
      await api.reply(
        await promptFor(store, begun.chat, req.context, req.message),
      )
    ).reply;
  } catch (error) {
    await recordTurnFailure(store, actor, req, leaseId);
    if (error instanceof ApplicationError) throw error;
    return {
      turnId: req.turnId,
      chatVersion: req.expectedVersion,
      status: "FAILED",
    };
  }
  const receipt = await recordReadyReply(store, actor, req, leaseId, reply);
  if (receipt.status === "REPLY_READY")
    memory.remember(actor, req.sessionId, req.turnId, reply);
  return receipt;
}
