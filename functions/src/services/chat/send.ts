import { ApplicationError } from "../../shared/errors.js";
import { turnSchema } from "../../domain/chat-commands.js";
import { type ChatApi } from "../../domain/chat.js";
import { type Actor, type Data } from "../../shared/types.js";
import { assertActive } from "../../shared/access.js";
import { parse } from "../../shared/validation.js";
import { id } from "../../shared/values.js";
import {
  pruneCache,
  rememberReply,
} from "../../infrastructure/ai/reply-cache.js";
import {
  hasProcessedTurn,
  reserveTurn,
  recordTurnFailure,
  recordReadyReply,
} from "../../infrastructure/chat/turn-store.js";
import { deliveredContext, promptFor } from "./context.js";
export async function sendMessage(
  actor: Actor,
  raw: unknown,
  api: ChatApi,
): Promise<Data> {
  const req = parse(turnSchema, raw);
  await assertActive(actor);
  pruneCache();
  if (!(await hasProcessedTurn(actor, req)))
    await deliveredContext(actor, req.sessionId, req.context);
  const leaseId = id(),
    begun = await reserveTurn(actor, req, leaseId);
  if (begun.cached) return begun.cached;
  let reply: string;
  try {
    await deliveredContext(actor, req.sessionId, req.context);
    reply = (
      await api.reply(await promptFor(begun.chat, req.context, req.message))
    ).reply;
  } catch (error) {
    await recordTurnFailure(actor, req, leaseId);
    if (error instanceof ApplicationError) throw error;
    return {
      turnId: req.turnId,
      chatVersion: req.expectedVersion,
      status: "FAILED",
    };
  }
  const receipt = await recordReadyReply(actor, req, leaseId, reply);
  if (receipt.status === "REPLY_READY")
    rememberReply(actor, req.sessionId, req.turnId, reply);
  return receipt;
}
