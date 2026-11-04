import {
  type ChatApi,
  type ChatContext,
  mentionedWords,
} from "../../domain/chat.js";
import type { Actor } from "../../contracts/callable.js";
import type { ChatSession } from "../../contracts/chat/records.js";
import type { ChatStore } from "../../contracts/chat/store.js";
import { deliveredContext, promptFor } from "./context.js";
import { type SummaryFeedback } from "../../domain/chat-summary.js";
export async function collectSummaryFeedback(
  store: ChatStore,
  actor: Actor,
  req: { sessionId: string; context?: ChatContext },
  chat: ChatSession,
  api: ChatApi,
): Promise<SummaryFeedback> {
  let strengths: string[] = [],
    tips: string[] = [],
    mentionedWordIds: string[] = [],
    feedbackStatus: SummaryFeedback["feedbackStatus"] = "NOT_REQUESTED";
  if (chat.completedTurns > 0) {
    feedbackStatus = "UNAVAILABLE";
    if (req.context) {
      await deliveredContext(store, actor, req.sessionId, req.context);
      mentionedWordIds = mentionedWords(
        (await promptFor(store, chat, req.context)).words,
        req.context,
      );
      try {
        const feedback = await api.giveFeedback(
          await promptFor(store, chat, req.context),
        );
        const originals = req.context.pairs.map((pair) =>
          pair.learner.toLocaleLowerCase("en"),
        );
        if (
          [...feedback.strengths, ...feedback.tips].some((item) =>
            originals.some((original) =>
              item.toLocaleLowerCase("en").includes(original),
            ),
          )
        )
          throw new Error("QUOTED_CONTENT");
        strengths = feedback.strengths;
        tips = feedback.tips;
        feedbackStatus = "AVAILABLE";
      } catch {
        feedbackStatus = "UNAVAILABLE";
      }
    }
  }

  return { strengths, tips, mentionedWordIds, feedbackStatus };
}
