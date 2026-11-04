import { useDraft, useMutation } from "../../app/contexts";
import type { ContentReport } from "../../models";
import { api, apiError } from "../../services/api";
export function useReportSource(
  navigate: (path: string) => void,
  setError: (message: string) => void,
) {
  const draft = useDraft(),
    mutation = useMutation();
  async function openSource(report: ContentReport) {
    if (report.targetRef.type === "SPEECH") {
      navigate(`/speech/${encodeURIComponent(report.targetRef.wordId)}`);
      return;
    }
    if (report.targetRef.type !== "SET_WORD") return;
    setError("");
    try {
      const deck = (await api("listDecks", {})).items.find(
        (item) => item.id === report.targetRef.wordSetId,
      );
      if (!deck) {
        setError("Không tìm thấy bộ từ đích.");
        return;
      }
      const payload = {
        wordSetId: deck.id,
        expectedWordSetVersion: deck.version,
      };
      void mutation.execute(
        (commandId) => api("openDraft", { ...payload, commandId }),
        (value) => {
          draft.setDraft(value);
          navigate("/draft");
        },
      );
    } catch (failure) {
      setError(apiError(failure).message);
    }
  }
  return openSource;
}
