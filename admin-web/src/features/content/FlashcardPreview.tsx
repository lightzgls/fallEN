import { useState } from "react";
import type { DraftEditorData } from "../../models";
import { useQuery } from "../../hooks/useQuery";
import { api } from "../../services/api";
import { StoredImage } from "../../components/StoredImage";
import { Dialog, QueryState } from "../../components/Ui";
export function FlashcardPreview({
  draft,
  onClose,
}: {
  draft: DraftEditorData;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0),
    [back, setBack] = useState(false);
  const entry = draft.entries[index];
  const word = useQuery(
    () =>
      api("getWordVersion", {
        wordId: entry.wordId,
        wordVersion: entry.wordVersion,
      }),
    [entry.wordId, entry.wordVersion],
  );
  const meaning =
    word.data?.meanings.find((x) => x.id === entry.focusMeaningId) ||
    word.data?.meanings[0];
  const example = entry.example || meaning?.example,
    translation = entry.example
      ? entry.exampleTranslation
      : meaning?.exampleTranslation;
  return (
    <Dialog title={`Xem thử · Nháp · ${draft.revision.name}`} onClose={onClose}>
      <QueryState loading={word.loading} error={word.error} retry={word.reload}>
        <div className="flashcard">
          <small>
            {index + 1}/{draft.entries.length} ·{" "}
            {back ? "Mặt sau" : "Mặt trước"}
          </small>
          <h2>{word.data?.spelling}</h2>
          <p>{word.data?.phonetic}</p>
          {!back ? (
            <>
              <StoredImage
                assetId={entry.imageAssetId || meaning?.imageAssetId}
                alt={entry.imageAlt || meaning?.imageAlt || "Ảnh từ vựng"}
                className="flashcard-image"
              />
              {example && <p>{example}</p>}
            </>
          ) : (
            <>
              <h3>{meaning?.text}</h3>
              <small>{meaning?.partOfSpeech}</small>
              {example && (
                <p>
                  {example}
                  <br />
                  {translation}
                </p>
              )}
            </>
          )}
          <button onClick={() => setBack(!back)}>Lật thẻ</button>
        </div>
        <div className="actions">
          <button
            disabled={index === 0}
            onClick={() => {
              setIndex(index - 1);
              setBack(false);
            }}
          >
            Từ trước
          </button>
          <button
            disabled={index === draft.entries.length - 1}
            onClick={() => {
              setIndex(index + 1);
              setBack(false);
            }}
          >
            Từ tiếp
          </button>
        </div>
      </QueryState>
    </Dialog>
  );
}
