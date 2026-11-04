import type { Metadata, Revision, SetWord } from "../models";
export function metadataOf(value: Metadata | Revision): Metadata {
  return {
    name: value.name.trim(),
    topic: value.topic.trim(),
    ...(value.description?.trim()
      ? { description: value.description.trim() }
      : {}),
    ...(value.coverImageAssetId
      ? { coverImageAssetId: value.coverImageAssetId }
      : {}),
  };
}
export function cleanEntry(entry: SetWord): SetWord {
  return {
    wordId: entry.wordId,
    wordVersion: entry.wordVersion,
    position: entry.position,
    ...(entry.focusMeaningId ? { focusMeaningId: entry.focusMeaningId } : {}),
    ...(entry.example?.trim() ? { example: entry.example.trim() } : {}),
    ...(entry.exampleTranslation?.trim()
      ? { exampleTranslation: entry.exampleTranslation.trim() }
      : {}),
    ...(entry.imageAssetId ? { imageAssetId: entry.imageAssetId } : {}),
    ...(entry.imageAlt?.trim() ? { imageAlt: entry.imageAlt.trim() } : {}),
  };
}
export function entryError(entry: SetWord) {
  if (!!entry.example?.trim() !== !!entry.exampleTranslation?.trim())
    return "Ví dụ và bản dịch phải cùng có hoặc cùng để trống.";
  if (entry.imageAssetId && !entry.imageAlt?.trim()) return "Ảnh cần mô tả.";
  if ((entry.example || entry.imageAssetId) && !entry.focusMeaningId)
    return "Chọn nghĩa trọng tâm cho học liệu.";
  if (!Number.isInteger(entry.position) || entry.position < 0)
    return "Vị trí phải là số nguyên không âm.";
  return undefined;
}
export function downloadText(
  name: string,
  text: string,
  type = "text/plain;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
