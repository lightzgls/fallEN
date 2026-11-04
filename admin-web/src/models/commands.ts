export interface CommandStatus<T = unknown> {
  status: "ABSENT" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED";
  receipt?: T;
  error?: { code?: string; message?: string };
  progress?: unknown;
}
