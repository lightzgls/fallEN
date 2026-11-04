import type { ContentReport, ReportStatus } from "../../models";
import { Notice, TextField } from "../../components/Ui";
import { transitions, statusLabels } from "./labels";
import type { useReportStatus } from "./useReportStatus";
export function ReportStatusForm({
  report,
  state,
  onReload,
}: {
  report: ContentReport;
  state: ReturnType<typeof useReportStatus>;
  onReload: () => void;
}) {
  const {
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
    phase,
    submit,
  } = state;
  return (
    <section>
      <h2>Xử lý báo lỗi</h2>
      {transitions[report.status].length ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <fieldset disabled={phase === "saving" || phase === "unknown"}>
            <div className="field">
              <label htmlFor="new-status">Trạng thái tiếp theo</label>
              <select
                id="new-status"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as ReportStatus)}
              >
                {transitions[report.status].map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
            </div>
            <TextField
              label={
                newStatus === "REJECTED"
                  ? "Lý do từ chối"
                  : "Kết luận gửi người học"
              }
              required={["RESOLVED", "REJECTED"].includes(newStatus)}
              multiline
              maxLength={1000}
              value={note}
              onChange={setNote}
            />
            <small>Kết luận này sẽ hiển thị cho người gửi.</small>
            {newStatus === "RESOLVED" && (
              <>
                <div className="field">
                  <label htmlFor="resolution-kind">
                    Nguồn sửa đã lưu / phát hành
                  </label>
                  <select
                    id="resolution-kind"
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                  >
                    <option value="DECK_REVISION">
                      Revision bộ từ công khai
                    </option>
                    <option value="SPEECH">Cấu hình phát âm đã lưu</option>
                    <option value="DICTIONARY_RELEASE">
                      Release từ điển công khai
                    </option>
                  </select>
                </div>
                {kind === "DECK_REVISION" ? (
                  <>
                    <TextField
                      label="Mã bộ từ"
                      required
                      value={setId}
                      onChange={setSetId}
                    />
                    <TextField
                      label="Revision đã công khai"
                      required
                      value={revisionId}
                      onChange={setRevisionId}
                    />
                  </>
                ) : kind === "SPEECH" ? (
                  <TextField
                    label="Phiên bản Speech đã lưu"
                    type="number"
                    min={1}
                    required
                    value={speechVersion}
                    onChange={setSpeechVersion}
                  />
                ) : (
                  <TextField
                    label="Release từ điển đã công khai"
                    required
                    value={releaseId}
                    onChange={setReleaseId}
                  />
                )}
                <Notice>
                  Chỉ khi máy chủ xác nhận nguồn sửa hợp lệ và lưu thành công,
                  báo lỗi mới chuyển thành Đã xử lý.
                </Notice>
              </>
            )}
            {error && <Notice tone="error">{error}</Notice>}
            <div className="actions">
              <button className="primary">
                Xác nhận {statusLabels[newStatus].toLowerCase()}
              </button>
              <button type="button" onClick={onReload}>
                Tải lại báo lỗi
              </button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          <p>Báo lỗi đã đóng, chỉ đọc.</p>
          <Notice>
            {report.publicResolution || "Chưa có kết luận công khai."}
          </Notice>
        </>
      )}
    </section>
  );
}
