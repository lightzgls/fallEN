import { useDraft, useMutation } from "../../app/contexts";
import type { DraftEditorData } from "../../models";
import { api, completeResult } from "../../services/api";

export function useDeckPublication(
  draft: DraftEditorData | undefined,
  navigate: (path: string) => void,
  onPublished: () => void,
  onActivationChanged: () => void,
) {
  const context = useDraft(),
    mutation = useMutation();
  function publishNow() {
    if (!draft) return;
    const payload = {
      wordSetId: draft.wordSet.id,
      revisionId: draft.revision.id,
      expectedWordSetVersion: draft.wordSet.version,
      expectedDraftVersion: draft.revision.version,
    };
    void mutation.execute(
      async (commandId) =>
        completeResult(
          await api("publishSet", { ...payload, commandId }),
          commandId,
        ),
      () => {
        onPublished();
        context.setDraft(undefined);
        navigate("/decks");
      },
    );
  }
  function setActive() {
    if (!draft) return;
    const payload = {
      wordSetId: draft.wordSet.id,
      active: !draft.wordSet.active,
      expectedVersion: draft.wordSet.version,
    };
    void mutation.execute(
      (commandId) => api("setDeckActive", { ...payload, commandId }),
      () => {
        onActivationChanged();
        void context.refresh();
      },
    );
  }
  return { publishNow, setActive };
}
