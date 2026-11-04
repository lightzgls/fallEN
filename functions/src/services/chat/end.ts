import type { Actor } from "../../contracts/callable.js";
import type { ChatStore, ReplyMemory } from "../../contracts/chat/store.js";
import type { EndChatCommand } from "../../domain/chat-commands.js";
import type { ChatApi } from "../../domain/chat.js";
import { deliveredContext } from "./context.js";
import { collectSummaryFeedback } from "./feedback.js";
import { beginChatEnding, commitChatSummary } from "./ending.js";

export async function endChat(
  store: ChatStore,
  memory: ReplyMemory,
  api: ChatApi,
  actor: Actor,
  req: EndChatCommand,
) {
  await store.assertActive(actor);
  if (req.context)
    await deliveredContext(store, actor, req.sessionId, req.context);
  const begun = await beginChatEnding(store, actor, req);
  if ("summary" in begun) return begun.summary;
  const feedback = await collectSummaryFeedback(
    store,
    actor,
    req,
    begun.chat,
    api,
  );
  const summary = await commitChatSummary(
    store,
    actor,
    req,
    begun.chat,
    feedback,
  );
  memory.clearSession(actor, req.sessionId);
  return summary;
}
