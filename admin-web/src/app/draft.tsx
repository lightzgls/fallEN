import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, apiError, type ApiError } from "../services/api";
import type { DraftEditorData } from "../models";
interface DraftContextValue {
  draft?: DraftEditorData;
  loading: boolean;
  error?: ApiError;
  select: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  setDraft: (draft: DraftEditorData | undefined) => void;
}
const DraftContext = createContext<DraftContextValue | null>(null);
export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<DraftEditorData>(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<ApiError>();
  const generation = useRef(0);
  const select = useCallback(async (id: string) => {
    const current = ++generation.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await api("getDraft", { wordSetId: id });
      if (current === generation.current) setDraft(result);
    } catch (e) {
      if (current === generation.current) {
        setError(apiError(e));
        setDraft(undefined);
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);
  return (
    <DraftContext
      value={{
        draft,
        loading,
        error,
        select,
        refresh: async () => {
          if (draft) await select(draft.wordSet.id);
        },
        setDraft,
      }}
    >
      {children}
    </DraftContext>
  );
}
export function useDraft() {
  const value = useContext(DraftContext);
  if (!value) throw new Error("DraftProvider missing");
  return value;
}
