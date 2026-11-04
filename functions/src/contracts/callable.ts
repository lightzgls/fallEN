export interface Actor {
  uid: string;
  contentAdmin: boolean;
  authTime: number;
}

export type Controller<Result = unknown> = (
  actor: Actor,
  input: unknown,
) => Promise<Result>;

export type Operation<Input, Result> = (
  actor: Actor,
  input: Input,
) => Promise<Result>;
