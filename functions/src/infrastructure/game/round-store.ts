import { Timestamp, type Transaction } from "firebase-admin/firestore";
import { type Actor, type Data } from "../../shared/core.js";
import { gameRef, roundIdFor } from "./refs.js";

export function stageRound(
  tx: Transaction,
  actor: Actor,
  game: Data,
  questions: Data[],
  now: Timestamp,
) {
  const order = game.nextRoundOrder ?? 1;
  const roundId = roundIdFor(game.id, order);
  const round = {
    id: roundId,
    sessionId: game.id,
    order,
    status: "ACTIVE",
    wordIds: questions.map((q) => q.wordId),
    createdAt: now,
  };
  const ref = gameRef(actor, game.id).collection("rounds").doc(roundId);
  tx.create(ref, round);
  for (const question of questions)
    tx.create(ref.collection("questions").doc(question.id), question);
  return { ...round, questions };
}
