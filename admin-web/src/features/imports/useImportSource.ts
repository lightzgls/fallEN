import { useState } from "react";
import { apiError } from "../../services/api";
import {
  defaultMapping,
  readSourceTable,
  uploadImageFiles,
  type ColumnMapping,
  type SourceTable,
} from "../../services/import-files";
import { downloadText } from "../../utils/content";

export function useImportSource(
  onDirty: (dirty: boolean) => void,
  onSourceChanged: () => void,
  setError: (message: string) => void,
  setMessage: (message: string) => void,
) {
  const [pasted, setPasted] = useState("");
  const [table, setTable] = useState<SourceTable>();
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [filename, setFilename] = useState("");
  const [images, setImages] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  async function source(file?: File) {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const parsed = await readSourceTable(file);
      setTable(parsed);
      setMapping(defaultMapping(parsed.headers));
      setFilename(file.name);
      onSourceChanged();
      onDirty(true);
    } catch (failure) {
      setError(apiError(failure).message);
    } finally {
      setUploading(false);
    }
  }
  async function imageFiles(files: FileList | null) {
    if (!files) return;
    setError("");
    setUploading(true);
    try {
      const added = await uploadImageFiles(Array.from(files), setMessage);
      setImages({ ...images, ...added });
      setMessage(`Đã kiểm tra ${Object.keys(added).length} ảnh.`);
    } catch (failure) {
      setError(apiError(failure).message);
    } finally {
      setUploading(false);
    }
  }
  function changePasted(value: string) {
    setPasted(value);
    onDirty(!!value);
  }
  function dropSourceFile() {
    setTable(undefined);
    setFilename("");
  }
  function downloadTemplate() {
    downloadText(
      "fallen-import.csv",
      "word,partOfSpeech,focusMeaningId,example,exampleTranslation,position,imagePath,imageAlt\n",
      "text/csv;charset=utf-8",
    );
  }
  return {
    pasted,
    table,
    mapping,
    setMapping,
    filename,
    images,
    uploading,
    source,
    imageFiles,
    changePasted,
    dropSourceFile,
    downloadTemplate,
  };
}
