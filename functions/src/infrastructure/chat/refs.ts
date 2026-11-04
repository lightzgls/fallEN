import { type Actor } from "../../shared/core.js";

export const chatPath = (actor: Actor, sessionId: string) =>
  `users/${actor.uid}/aiSessions/${sessionId}`;
