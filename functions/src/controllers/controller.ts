import type { z } from "zod";
import type { Actor, Controller, Operation } from "../contracts/callable.js";
import { parse } from "../shared/validation.js";

/** Validate once at the boundary; services receive the schema's parsed output. */
export function controller<Schema extends z.ZodType, Result>(
  schema: Schema,
  execute: Operation<z.output<Schema>, Result>,
  guard?: (actor: Actor) => void,
): Controller<Result> {
  return async (actor, raw) => {
    guard?.(actor);
    return execute(actor, parse(schema, raw));
  };
}
