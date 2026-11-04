import { useEffect, useState } from "react";
import { useMutation } from "../../app/contexts";
import type { ContentReport, ReportStatus } from "../../models";
import { api, apiError } from "../../services/api";
import { buildReportStatusPayload } from "./resolution";
import { transitions } from "./labels";
export function useReportStatus(
  report: ContentReport | undefined,
  onSaved: () => void,
) {
  const [newStatus, setNewStatus] = useState<ReportStatus>("IN_REVIEW"),
    [note, setNote] = useState("");
  const [kind, setKind] = useState("DECK_REVISION"),
    [setId, setSetId] = useState(""),
    [revisionId, setRevisionId] = useState("");
  const [releaseId, setReleaseId] = useState(""),
    [speechVersion, setSpeechVersion] = useState(""),
    [error, setError] = useState("");
  const mutation = useMutation();
  useEffect(() => {
    if (report) {
      setNewStatus(transitions[report.status][0] || report.status);
      setSetId(report.targetRef.wordSetId || "");
      setKind(
        report.targetRef.type === "SPEECH"
          ? "SPEECH"
          : report.targetRef.type === "SET_WORD"
            ? "DECK_REVISION"
            : "DICTIONARY_RELEASE",
      );
    }
  }, [report]);
  function submit() {
    if (!report) return;
    setError("");
    try {
      const payload = buildReportStatusPayload(report, {
        newStatus,
        note,
        kind,
        setId,
        revisionId,
        releaseId,
        speechVersion,
      });
      void mutation.execute(
        (commandId) => api("updateReportStatus", { ...payload, commandId }),
        () => {
          setNote("");
          onSaved();
        },
      );
    } catch (failure) {
      setError(apiError(failure).message);
    }
  }
  return {
    newStatus,
    setNewStatus,
    note,
    setNote,
    kind,
    setKind,
    setId,
    setSetId,
    revisionId,
    setRevisionId,
    releaseId,
    setReleaseId,
    speechVersion,
    setSpeechVersion,
    error,
    setError,
    phase: mutation.phase,
    submit,
  };
}
