import { type Actor } from "../../shared/core.js";

export const replyCache = new Map<
  string,
  { reply: string; expiresAt: number }
>();

export function cacheKey(
  actor: Actor,
  sessionId: string,
  turnId: string,
): string {
  return `${actor.uid}/${sessionId}/${turnId}`;
}

export function pruneCache(): void {
  for (const [key, value] of replyCache)
    if (value.expiresAt < Date.now()) replyCache.delete(key);
  if (replyCache.size > 500) replyCache.delete(replyCache.keys().next().value!);
}

export function rememberReply(
  actor: Actor,
  sessionId: string,
  turnId: string,
  reply: string,
): void {
  replyCache.set(cacheKey(actor, sessionId, turnId), {
    reply,
    expiresAt: Date.now() + 10 * 60_000,
  });
}
