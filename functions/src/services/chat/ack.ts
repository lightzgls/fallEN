import { acknowledgeTurnSchema } from "../../domain/chat-commands.js";
import { type Actor, type Data } from "../../shared/types.js";
import { parse } from "../../shared/validation.js";
import { acknowledgeStoredTurn } from "../../infrastructure/chat/turn-store.js";
export async function acknowledgeTurn(
  actor: Actor,
  raw: unknown,
): Promise<Data> {
  return acknowledgeStoredTurn(actor, parse(acknowledgeTurnSchema, raw));
}
