import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "../../app/contexts";
import { Icon, Notice, QueryState, TextField } from "../../components/Ui";
import { useQuery } from "../../hooks/useQuery";
import { api } from "../../services/api";

export function Limit({ onDirty }: { onDirty: (dirty: boolean) => void }) {
  const q = useQuery(() => api("getLimit", {}));
  const [value, setValue] = useState(""),
    [error, setError] = useState("");
  const m = useMutation();
  useEffect(() => {
    if (q.data) setValue(String(q.data.maxSessionsPerDay));
  }, [q.data]);
  const dirty = !!q.data && value !== String(q.data.maxSessionsPerDay);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  function save(event: FormEvent) {
    event.preventDefault();
    const maximum = Number(value);
    if (value === "" || !Number.isSafeInteger(maximum) || maximum < 0) {
      setError("Hạn mức phải là số nguyên không âm.");
      return;
    }
    if (!q.data) return;
    setError("");
    const payload = {
      maxSessionsPerDay: maximum,
      expectedVersion: q.data.version,
    };
    void m.execute(
      (commandId) => api("saveLimit", { ...payload, commandId }),
      () => q.reload(),
    );
  }
  return (
    <>
      <h1>Hạn mức phiên AI</h1>
      <QueryState loading={q.loading} error={q.error} retry={q.reload}>
        <form data-dirty-form onSubmit={save}>
          <div className="quota-field">
            <TextField
              label="Số phiên tối đa / người học / ngày"
              type="number"
              min={0}
              required
              value={value}
              onChange={setValue}
            />
          </div>
          <p className="muted">
            Ngày mới tính theo giờ Việt Nam (UTC+7). Chỉ phiên khởi tạo thành
            công mới tiêu hạn mức.
          </p>
          {error && <Notice tone="error">{error}</Notice>}
          <button
            className="primary"
            disabled={!dirty || m.phase === "saving" || m.phase === "unknown"}
          >
            <Icon name="save" />
            Lưu hạn mức
          </button>
        </form>
        <Notice>
          Mỗi phiên tối đa 15 cặp: một tin nhắn người học và một phản hồi AI
          nhận thành công.
        </Notice>
        <Notice>
          Chỉ nhận số nguyên không âm. Giá trị 0 chặn tạo phiên mới. Đổi hạn mức
          không đặt lại số phiên đã dùng trong ngày và không kết thúc phiên đang
          diễn ra.
        </Notice>
        <small>Phiên bản cấu hình {q.data?.version}</small>
        <button className="link" onClick={q.reload}>
          Tải bản mới
        </button>
      </QueryState>
    </>
  );
}
