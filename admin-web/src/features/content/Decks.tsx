import { useState, type FormEvent } from "react";
import { useDraft, useMutation } from "../../app/contexts";
import { Dialog, Icon, QueryState, TextField } from "../../components/Ui";
import { useQuery } from "../../hooks/useQuery";
import { api } from "../../services/api";
import type { Deck, Metadata } from "../../models";
export function Decks({ navigate }: { navigate: (path: string) => void }) {
  const query = useQuery(() => api("listDecks", {})),
    mutation = useMutation(),
    draft = useDraft();
  const [create, setCreate] = useState(false),
    [metadata, setMetadata] = useState<Metadata>({ name: "", topic: "" });
  function open(deck: Deck) {
    void mutation.execute(
      (id) =>
        api("openDraft", {
          wordSetId: deck.id,
          expectedWordSetVersion: deck.version,
          commandId: id,
        }),
      (value) => {
        draft.setDraft(value);
        navigate("/draft");
      },
    );
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void mutation.execute(
      (id) => api("createDeck", { metadata, commandId: id }),
      (value) => {
        draft.setDraft(value);
        setCreate(false);
        navigate("/draft");
      },
    );
  }
  return (
    <>
      <h1>Bộ từ hệ thống</h1>
      <div className="actions">
        <button className="primary" onClick={() => setCreate(true)}>
          <Icon name="library" />
          Tạo bộ từ
        </button>
        {draft.draft && (
          <button onClick={() => navigate("/draft")}>
            <Icon name="arrow" />
            Mở bản nháp đang sửa
          </button>
        )}
        <button className="link" onClick={query.reload}>
          Tải lại
        </button>
      </div>
      <QueryState
        loading={query.loading}
        error={query.error}
        retry={query.reload}
        empty={query.data?.items.length === 0}
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Bộ từ</th>
                <th>Chủ đề</th>
                <th>Số từ</th>
                <th>Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((deck) => (
                <tr key={deck.id}>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => open(deck)}
                      disabled={mutation.phase === "saving"}
                    >
                      {deck.name || deck.draft?.name || "Bộ chưa công khai"}
                    </button>
                    <small className="block mono">{deck.id}</small>
                  </td>
                  <td>{deck.topic || deck.draft?.topic || "—"}</td>
                  <td>{deck.wordCount ?? "—"}</td>
                  <td>
                    {!deck.active
                      ? "Ngừng sử dụng"
                      : deck.publishedRevisionId
                        ? "Đang công khai"
                        : "Chưa công khai"}
                    {deck.draftRevisionId ? " · Có bản nháp" : ""}
                  </td>
                  <td>
                    <button
                      className="link"
                      onClick={() => open(deck)}
                      disabled={mutation.phase === "saving"}
                    >
                      Mở chỉnh sửa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryState>
      {create && (
        <Dialog title="Tạo bộ từ" onClose={() => setCreate(false)}>
          <form onSubmit={submit}>
            <TextField
              label="Tên bộ"
              required
              maxLength={100}
              value={metadata.name}
              onChange={(name) => setMetadata({ ...metadata, name })}
            />
            <TextField
              label="Chủ đề"
              required
              maxLength={100}
              value={metadata.topic}
              onChange={(topic) => setMetadata({ ...metadata, topic })}
            />
            <TextField
              label="Mô tả"
              multiline
              value={metadata.description || ""}
              onChange={(description) =>
                setMetadata({ ...metadata, description })
              }
            />
            <div className="actions">
              <button
                className="primary"
                disabled={mutation.phase === "saving"}
              >
                Tạo bản nháp
              </button>
              <button type="button" onClick={() => setCreate(false)}>
                Hủy
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
