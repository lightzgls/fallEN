import { useEffect, useState, type FormEvent } from "react";
import { useDraft, useMutation } from "../../app/contexts";
import { Notice, QueryState, TextField } from "../../components/ui";
import { useQuery } from "../../hooks/useQuery";
import { api, apiError } from "../../services/api";
import type {
  ContentReport,
  ReportCategory,
  ReportPage,
  ReportStatus,
} from "../../models";

const statusLabels: Record<ReportStatus, string> = {
  OPEN: "Đã tiếp nhận",
  IN_REVIEW: "Đang xử lý",
  WAITING_RELEASE: "Chờ phát hành",
  RESOLVED: "Đã xử lý",
  REJECTED: "Từ chối",
};
const categoryLabels: Record<ReportCategory, string> = {
  MEANING: "Nghĩa từ",
  EXAMPLE_TRANSLATION: "Ví dụ / bản dịch",
  IMAGE: "Ảnh minh họa",
  PRONUNCIATION: "Phát âm",
  OTHER: "Khác",
};
const transitions: Record<ReportStatus, ReportStatus[]> = {
  OPEN: ["IN_REVIEW"],
  IN_REVIEW: ["WAITING_RELEASE", "RESOLVED", "REJECTED"],
  WAITING_RELEASE: ["IN_REVIEW", "RESOLVED", "REJECTED"],
  RESOLVED: [],
  REJECTED: [],
};
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}
export function Reports({
  reportId,
  navigate,
}: {
  reportId?: string;
  navigate: (path: string) => void;
}) {
  return reportId ? (
    <ReportDetail reportId={reportId} navigate={navigate} />
  ) : (
    <ReportList navigate={navigate} />
  );
}
function ReportList({ navigate }: { navigate: (path: string) => void }) {
  const [status, setStatus] = useState<ReportStatus | "">(""),
    [category, setCategory] = useState<ReportCategory | "">("");
  const query = useQuery(
    () =>
      api("listReports", {
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
      }),
    [status, category],
  );
  const [page, setPage] = useState<ReportPage>(),
    [loadingMore, setLoadingMore] = useState(false),
    [error, setError] = useState("");
  useEffect(() => setPage(query.data), [query.data]);
  async function more() {
    if (!page?.cursor) return;
    setLoadingMore(true);
    setError("");
    try {
      const next = await api("listReports", {
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
        cursor: page.cursor,
      });
      setPage({ ...next, items: [...page.items, ...next.items] });
    } catch (e) {
      setError(apiError(e).message);
    } finally {
      setLoadingMore(false);
    }
  }
  return (
    <>
      <h1>Báo lỗi học liệu</h1>
      <div className="columns three">
        <div className="field">
          <label htmlFor="report-status">Trạng thái</label>
          <select
            id="report-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ReportStatus | "")}
          >
            <option value="">Tất cả</option>
            {Object.entries(statusLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="report-category">Loại báo lỗi</label>
          <select
            id="report-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as ReportCategory | "")}
          >
            <option value="">Tất cả</option>
            {Object.entries(categoryLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button className="link" onClick={query.reload}>
          Tải lại báo lỗi
        </button>
      </div>
      <QueryState
        loading={query.loading}
        error={query.error}
        retry={query.reload}
        empty={page?.items.length === 0}
      >
        <div className="table-scroll">
          <table className="report-table">
            <thead>
              <tr>
                <th>Mã báo lỗi</th>
                <th>Mục / ngữ cảnh</th>
                <th>Loại</th>
                <th>Trạng thái</th>
                <th>Ngày gửi</th>
              </tr>
            </thead>
            <tbody>
              {page?.items.map((report) => (
                <tr key={report.reportId}>
                  <td>
                    <button
                      className="text-button"
                      onClick={() =>
                        navigate(
                          `/reports/${encodeURIComponent(report.reportId)}`,
                        )
                      }
                    >
                      {report.reportId}
                    </button>
                  </td>
                  <td>
                    {String(
                      report.targetSnapshot.spelling || report.targetRef.wordId,
                    )}
                    <small className="block">
                      {report.targetRef.type === "SET_WORD"
                        ? report.targetRef.wordSetId
                        : "Mục từ"}
                    </small>
                  </td>
                  <td>{categoryLabels[report.category]}</td>
                  <td>{statusLabels[report.status]}</td>
                  <td>{dateLabel(report.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <button
          onClick={() => void more()}
          disabled={!page?.cursor || loadingMore}
        >
          {loadingMore ? "Đang tải…" : "Tải thêm báo lỗi"}
        </button>
      </QueryState>
    </>
  );
}
function ReportDetail({
  reportId,
  navigate,
}: {
  reportId: string;
  navigate: (path: string) => void;
}) {
  const query = useQuery(() => api("getReport", { reportId }), [reportId]);
  const [newStatus, setNewStatus] = useState<ReportStatus>("IN_REVIEW"),
    [note, setNote] = useState(""),
    [kind, setKind] = useState("DECK_REVISION"),
    [setId, setSetId] = useState(""),
    [revisionId, setRevisionId] = useState(""),
    [releaseId, setReleaseId] = useState(""),
    [speechVersion, setSpeechVersion] = useState(""),
    [error, setError] = useState("");
  const m = useMutation(),
    draft = useDraft();
  useEffect(() => {
    if (query.data) {
      setNewStatus(transitions[query.data.status][0] || query.data.status);
      setSetId(query.data.targetRef.wordSetId || "");
      setKind(
        query.data.targetRef.type === "SPEECH"
          ? "SPEECH"
          : query.data.targetRef.type === "SET_WORD"
            ? "DECK_REVISION"
            : "DICTIONARY_RELEASE",
      );
    }
  }, [query.data]);
  async function openSource(report: ContentReport) {
    if (report.targetRef.type === "SPEECH") {
      navigate(`/speech/${encodeURIComponent(report.targetRef.wordId)}`);
      return;
    }
    if (report.targetRef.type !== "SET_WORD") return;
    setError("");
    try {
      const deck = (await api("listDecks", {})).items.find(
        (x) => x.id === report.targetRef.wordSetId,
      );
      if (!deck) {
        setError("Không tìm thấy bộ từ đích.");
        return;
      }
      const payload = {
        wordSetId: deck.id,
        expectedWordSetVersion: deck.version,
      };
      void m.execute(
        (commandId) => api("openDraft", { ...payload, commandId }),
        (value) => {
          draft.setDraft(value);
          navigate("/draft");
        },
      );
    } catch (e) {
      setError(apiError(e).message);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.data) return;
    setError("");
    let resolutionRef: Record<string, unknown> | undefined;
    if (newStatus === "RESOLVED") {
      if (kind === "DECK_REVISION") {
        if (!setId.trim() || !revisionId.trim()) {
          setError("Cần mã bộ và revision đã công khai.");
          return;
        }
        resolutionRef = {
          kind,
          wordSetId: setId.trim(),
          revisionId: revisionId.trim(),
        };
      } else if (kind === "SPEECH") {
        const version = Number(speechVersion);
        if (!Number.isSafeInteger(version) || version < 1) {
          setError("Nhập phiên bản Speech đã lưu.");
          return;
        }
        resolutionRef = {
          kind,
          wordId: query.data.targetRef.wordId,
          speechVersion: version,
        };
      } else {
        if (!releaseId.trim()) {
          setError("Nhập mã release đã công khai.");
          return;
        }
        resolutionRef = { kind, releaseId: releaseId.trim() };
      }
    }
    const payload = {
      reportId,
      expectedVersion: query.data.version,
      newStatus,
      ...(note.trim() ? { publicNote: note.trim() } : {}),
      ...(newStatus === "RESOLVED"
        ? { resolutionKind: "FIXED", resolutionRef }
        : {}),
    };
    void m.execute(
      (commandId) => api("updateReportStatus", { ...payload, commandId }),
      () => {
        setNote("");
        query.reload();
      },
    );
  }
  return (
    <>
      <div className="heading-row">
        <h1>Báo lỗi · {reportId}</h1>
        <button onClick={() => navigate("/reports")}>Về danh sách</button>
      </div>
      <QueryState
        loading={query.loading}
        error={query.error}
        retry={query.reload}
      >
        {query.data && (
          <>
            <Notice>
              {statusLabels[query.data.status]} · Phiên bản {query.data.version}{" "}
              · {categoryLabels[query.data.category]}
            </Notice>
            <div className="columns two">
              <section>
                <h2>Nội dung người học đã gửi</h2>
                <p className="preserve-lines">{query.data.description}</p>
                <h3>Ngữ cảnh học liệu</h3>
                <dl>
                  <dt>Mục từ</dt>
                  <dd>
                    {String(
                      query.data.targetSnapshot.spelling ||
                        query.data.targetRef.wordId,
                    )}
                  </dd>
                  <dt>Bản từ</dt>
                  <dd>
                    {query.data.targetRef.wordVersion ||
                      String(query.data.targetSnapshot.wordVersion || "—")}
                  </dd>
                  {query.data.targetRef.revisionId && (
                    <>
                      <dt>Bộ / revision</dt>
                      <dd>
                        {query.data.targetRef.wordSetId} /{" "}
                        {query.data.targetRef.revisionId}
                      </dd>
                    </>
                  )}
                  {query.data.targetRef.speechVersion && (
                    <>
                      <dt>Speech</dt>
                      <dd>{query.data.targetRef.speechVersion}</dd>
                    </>
                  )}
                  <dt>Ngày gửi</dt>
                  <dd>{dateLabel(query.data.createdAt)}</dd>
                </dl>
                {["SET_WORD", "SPEECH"].includes(query.data.targetRef.type) ? (
                  <button onClick={() => void openSource(query.data!)}>
                    Mở nguồn sửa
                  </button>
                ) : (
                  <Notice>
                    Nghĩa từ điển gốc chỉ đọc. Chuyển Chờ phát hành để người vận
                    hành xử lý danh mục.
                  </Notice>
                )}
              </section>
              <section>
                <h2>Xử lý báo lỗi</h2>
                {transitions[query.data.status].length ? (
                  <form onSubmit={submit}>
                    <fieldset
                      disabled={m.phase === "saving" || m.phase === "unknown"}
                    >
                      <div className="field">
                        <label htmlFor="new-status">Trạng thái tiếp theo</label>
                        <select
                          id="new-status"
                          value={newStatus}
                          onChange={(e) =>
                            setNewStatus(e.target.value as ReportStatus)
                          }
                        >
                          {transitions[query.data.status].map((status) => (
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
                              <option value="SPEECH">
                                Cấu hình phát âm đã lưu
                              </option>
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
                            Chỉ khi máy chủ xác nhận nguồn sửa hợp lệ và lưu
                            thành công, báo lỗi mới chuyển thành Đã xử lý.
                          </Notice>
                        </>
                      )}
                      {error && <Notice tone="error">{error}</Notice>}
                      <div className="actions">
                        <button className="primary">
                          Xác nhận {statusLabels[newStatus].toLowerCase()}
                        </button>
                        <button type="button" onClick={query.reload}>
                          Tải lại báo lỗi
                        </button>
                      </div>
                    </fieldset>
                  </form>
                ) : (
                  <>
                    <p>Báo lỗi đã đóng, chỉ đọc.</p>
                    <Notice>
                      {query.data.publicResolution ||
                        "Chưa có kết luận công khai."}
                    </Notice>
                  </>
                )}
              </section>
            </div>
            {query.data.actions && (
              <section>
                <h2>Lịch sử xử lý</h2>
                <ol className="audit-list">
                  {query.data.actions.map((action, index) => (
                    <li key={action.actionId || index}>
                      <strong>
                        {statusLabels[action.fromStatus]} →{" "}
                        {statusLabels[action.toStatus]}
                      </strong>
                      <small> · {dateLabel(action.createdAt)}</small>
                      {action.note && <p>{action.note}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </QueryState>
    </>
  );
}
