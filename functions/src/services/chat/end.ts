import { endChatSchema } from "../../domain/chat-commands.js";
import { type ChatApi } from "../../domain/chat.js";
import { type Actor, type Data } from "../../shared/types.js";
import { assertActive } from "../../shared/access.js";
import { parse } from "../../shared/validation.js";
import {
  beginChatEnding,
  commitChatSummary,
} from "../../infrastructure/chat/summary-store.js";
import { deliveredContext } from "./context.js";
import { collectSummaryFeedback } from "./feedback.js";
export async function endChat(
  actor: Actor,
  raw: unknown,
  api: ChatApi,
): Promise<Data> {
  const req = parse(endChatSchema, raw);
  await assertActive(actor);
  if (req.context) await deliveredContext(actor, req.sessionId, req.context);
  const begun = await beginChatEnding(actor, req);
  if (begun.summary) return begun.summary;
  const feedback = await collectSummaryFeedback(actor, req, begun.chat, api);
  return commitChatSummary(actor, req, begun.chat, feedback);
}
