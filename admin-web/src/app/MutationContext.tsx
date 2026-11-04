import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { auth } from "../services/firebase";
import { apiError, pollCommand, retryPendingCommand } from "../services/api";
import {
  clearPendingCommand,
  readPendingCommand,
} from "../services/command-journal";
interface MutationState {
  phase: "idle" | "saving" | "succeeded" | "failed" | "conflict" | "unknown";
  message?: string;
  commandId?: string;
}
interface MutationContextValue extends MutationState {
  execute: <T>(
    request: (commandId: string) => Promise<T>,
    onSuccess?: (value: T) => void,
  ) => Promise<T | undefined>;
  retry: () => void;
  check: () => void;
  clear: () => void;
}
const MutationContext = createContext<MutationContextValue | null>(null);
export function MutationProvider({ children }: { children: ReactNode }) {
  const recovered = useRef(
    auth.currentUser ? readPendingCommand(auth.currentUser.uid) : undefined,
  );
  const [state, setState] = useState<MutationState>(
    recovered.current
      ? {
          phase: "unknown",
          commandId: recovered.current.commandId,
          message:
            "Có lệnh chưa xác nhận từ lần mở trước. Kiểm tra kết quả trước khi tiếp tục.",
        }
      : { phase: "idle" },
  );
  const pending = useRef<
    | {
        id: string;
        uid: string;
        request: (id: string) => Promise<unknown>;
        success?: (value: unknown) => void;
      }
    | undefined
  >(
    recovered.current
      ? {
          id: recovered.current.commandId,
          uid: recovered.current.uid,
          request: () => retryPendingCommand(recovered.current!),
        }
      : undefined,
  );
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const perform = useCallback(async (checkOnly = false) => {
    const task = pending.current;
    if (!task || auth.currentUser?.uid !== task.uid) return;
    setState({
      phase: "saving",
      commandId: task.id,
      message: checkOnly ? "Đang kiểm tra kết quả…" : "Đang lưu…",
    });
    try {
      const result = checkOnly
        ? await pollCommand(task.id)
        : await task.request(task.id);
      if (auth.currentUser?.uid !== task.uid || !mounted.current) return;
      pending.current = undefined;
      clearPendingCommand(task.uid, task.id);
      task.success?.(result);
      if (!task.success)
        window.dispatchEvent(new Event("fallen-command-complete"));
      setState({ phase: "succeeded", message: "Đã lưu thành công." });
      return result;
    } catch (error) {
      if (!mounted.current) return;
      const e = apiError(error);
      setState({
        phase: e.uncertain
          ? "unknown"
          : ["CONFLICT", "IMPORT_STALE"].includes(e.code)
            ? "conflict"
            : "failed",
        commandId: task.id,
        message: e.message,
      });
      if (!e.uncertain) {
        pending.current = undefined;
        clearPendingCommand(task.uid, task.id);
      }
      if (
        ["PERMISSION_DENIED", "permission-denied", "ACCOUNT_DELETING"].includes(
          e.code,
        )
      )
        window.dispatchEvent(new Event("fallen-access-denied"));
      return undefined;
    }
  }, []);
  const execute = useCallback(
    async <T,>(
      request: (id: string) => Promise<T>,
      onSuccess?: (value: T) => void,
    ) => {
      if (pending.current || !auth.currentUser) return undefined;
      pending.current = {
        id: crypto.randomUUID(),
        uid: auth.currentUser.uid,
        request,
        success: onSuccess as ((value: unknown) => void) | undefined,
      };
      return (await perform()) as T | undefined;
    },
    [perform],
  );
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (pending.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  return (
    <MutationContext
      value={{
        ...state,
        execute,
        retry: () => {
          void perform();
        },
        check: () => {
          void perform(true);
        },
        clear: () => {
          if (!pending.current) setState({ phase: "idle" });
        },
      }}
    >
      {children}
    </MutationContext>
  );
}
export function useMutation() {
  const value = useContext(MutationContext);
  if (!value) throw new Error("MutationProvider missing");
  return value;
}
