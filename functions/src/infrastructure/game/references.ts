import { db, type Actor } from "../../shared/core.js";

export const gameRef = (actor: Actor, sessionId: string) =>
  db.doc(`users/${actor.uid}/gameSessions/${sessionId}`);

export const roundIdFor = (sessionId: string, order: number) =>
  `${sessionId}_${order}`;
