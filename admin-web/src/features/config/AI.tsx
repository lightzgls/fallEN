import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "../../app/contexts";
import { Icon, Notice, QueryState, TextField } from "../../components/ui";
import { useQuery } from "../../hooks/useQuery";
import { api } from "../../services/api";
import type { Topic } from "../../models";
const emptyTopic: Topic = {
  id: "",
  name: "",
  context: "",
  learnerRole: "",
  aiRole: "",
  goal: "",
  openingLine: "",
  guide: "",
  active: true,
  version: 0,
};
export function Topics({ onDirty }: { onDirty: (dirty: boolean) => void }) {
  const list = useQuery(() => api("listTopics", {}));
  const [topic, setTopic] = useState<Topic>(emptyTopic),
    [baseline, setBaseline] = useState<Topic>(emptyTopic);
  const m = useMutation();
  const dirty = JSON.stringify(topic) !== JSON.stringify(baseline);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  function choose(value: Topic) {
    if (dirty && !window.confirm("Bỏ thay đổi tình huống chưa lưu?")) return;
    setTopic(value);
    setBaseline(value);
  }
  function save(event: FormEvent) {
    event.preventDefault();
    const { id, version, ...fields } = topic;
    const payload = {
      ...fields,
      ...(id ? { topicId: id } : {}),
      expectedVersion: version,
    };
    void m.execute(
      (commandId) => api("saveTopic", { ...payload, commandId }),
      (value) => {
        setTopic(value);
        setBaseline(value);
        list.reload();
      },
    );
  }
  return (
    <>
      <div className="heading-row">
        <h1>Tình huống hội thoại AI</h1>
        <button onClick={() => choose(emptyTopic)}>Tạo tình huống</button>
      </div>
      <QueryState loading={list.loading} error={list.error} retry={list.reload}>
        <div className="field">
          <label htmlFor="scenario-picker">Tình huống đã lưu</label>
          <select
            id="scenario-picker"
            value={topic.id}
            onChange={(e) => {
              const value = list.data?.items.find(
                (x) => x.id === e.target.value,
              );
              if (value) choose(value);
            }}
          >
            <option value="">Tình huống mới</option>
            {list.data?.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.active ? "" : " · Ngừng sử dụng"}
              </option>
            ))}
          </select>
        </div>
      </QueryState>
      <form data-dirty-form onSubmit={save}>
        <fieldset disabled={m.phase === "saving" || m.phase === "unknown"}>
          <div className="columns two">
            <TextField
              label="Tên tình huống"
              required
              maxLength={100}
              value={topic.name}
              onChange={(name) => setTopic({ ...topic, name })}
            />
            <TextField
              label="Vai của AI"
              required
              value={topic.aiRole}
              onChange={(aiRole) => setTopic({ ...topic, aiRole })}
            />
          </div>
          <TextField
            label="Nội dung tình huống"
            required
            value={topic.context}
            onChange={(context) => setTopic({ ...topic, context })}
          />
          <div className="columns three">
            <TextField
              label="Vai người học"
              required
              value={topic.learnerRole}
              onChange={(learnerRole) => setTopic({ ...topic, learnerRole })}
            />
            <TextField
              label="Nhiệm vụ"
              required
              value={topic.goal}
              onChange={(goal) => setTopic({ ...topic, goal })}
            />
            <div className="field">
              <label htmlFor="topic-active">Trạng thái</label>
              <select
                id="topic-active"
                value={topic.active ? "active" : "inactive"}
                onChange={(e) =>
                  setTopic({ ...topic, active: e.target.value === "active" })
                }
              >
                <option value="active">Khả dụng</option>
                <option value="inactive">Ngừng sử dụng</option>
              </select>
            </div>
          </div>
          <TextField
            label="Hướng dẫn hội thoại"
            required
            multiline
            value={topic.guide}
            onChange={(guide) => setTopic({ ...topic, guide })}
          />
          <TextField
            label="Lời mở đầu mẫu"
            required
            value={topic.openingLine}
            onChange={(openingLine) => setTopic({ ...topic, openingLine })}
          />
          <div className="actions">
            <button className="primary" disabled={!dirty}>
              <Icon name="save" />
              Lưu tình huống
            </button>
            <small>
              Lời mở đầu mẫu không tính là một cặp hội thoại. Phiên đang có giữ
              cấu hình cũ.
            </small>
          </div>
        </fieldset>
      </form>
    </>
  );
}
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
