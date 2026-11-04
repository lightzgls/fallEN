import Papa from "papaparse";
import type { JSZipObject } from "jszip";
import type { ImportInputRow } from "../models";
import { uploadAsset } from "./api";

export interface SourceTable {
  headers: string[];
  rows: Record<string, string>[];
}
export type ImportColumn = keyof ImportInputRow | "imagePath";
export type ColumnMapping = Partial<Record<ImportColumn, string>>;
const MAX_FILE = 5 * 1024 * 1024,
  MAX_ROWS = 1000;
export async function readSourceTable(file: File): Promise<SourceTable> {
  if (file.size > MAX_FILE) throw new Error("Tệp nguồn vượt quá 5 MiB.");
  let rows: Record<string, string>[];
  if (file.name.toLowerCase().endsWith(".csv")) {
    const parsed = Papa.parse<Record<string, string>>(await file.text(), {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim(),
    });
    if (parsed.errors.length)
      throw new Error(`CSV không hợp lệ: ${parsed.errors[0].message}`);
    rows = parsed.data;
  } else if (file.name.toLowerCase().endsWith(".xlsx")) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellFormula: true,
      bookVBA: false,
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("Tệp không có trang tính.");
    for (const [key, cell] of Object.entries(sheet)) {
      if (
        !key.startsWith("!") &&
        typeof cell === "object" &&
        cell &&
        "f" in cell &&
        cell.f
      )
        throw new Error(
          "Không nhận ô công thức. Hãy chuyển thành giá trị văn bản.",
        );
    }
    rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
      raw: false,
      defval: "",
    });
  } else throw new Error("Chỉ nhận CSV hoặc XLSX.");
  if (!rows.length) throw new Error("Tệp không có dòng dữ liệu.");
  if (rows.length > MAX_ROWS) throw new Error("Mỗi lô tối đa 1.000 dòng.");
  return { headers: Object.keys(rows[0]), rows };
}
export function defaultMapping(headers: string[]): ColumnMapping {
  const result: ColumnMapping = {};
  for (const key of [
    "word",
    "partOfSpeech",
    "focusMeaningId",
    "example",
    "exampleTranslation",
    "position",
    "imagePath",
    "imageAlt",
  ] as ImportColumn[]) {
    const header = headers.find((x) => x.toLowerCase() === key.toLowerCase());
    if (header) result[key] = header;
  }
  return result;
}
export function mapImportRows(
  table: SourceTable | undefined,
  pasted: string,
  mapping: ColumnMapping,
  images: Record<string, string>,
): ImportInputRow[] {
  if (!table) {
    const words = pasted
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (words.length > MAX_ROWS) throw new Error("Mỗi lô tối đa 1.000 dòng.");
    return words.map((word) => ({ word }));
  }
  if (!mapping.word) throw new Error("Chọn cột word bắt buộc.");
  return table.rows.map((row, index) => {
    const result: ImportInputRow = { word: row[mapping.word!]?.trim() || "" };
    for (const key of [
      "partOfSpeech",
      "focusMeaningId",
      "example",
      "exampleTranslation",
      "imageAlt",
    ] as const) {
      const value = mapping[key] ? row[mapping[key]!] : " ";
      if (value?.trim()) result[key] = value.trim();
    }
    if (mapping.position && row[mapping.position]?.trim()) {
      const number = Number(row[mapping.position]);
      if (!Number.isInteger(number) || number < 0)
        throw new Error(
          `Dòng ${index + 2}: vị trí phải là số nguyên không âm.`,
        );
      result.position = number;
    }
    if (mapping.imagePath && row[mapping.imagePath]?.trim()) {
      const name = row[mapping.imagePath].trim();
      const assetId = images[name];
      if (!assetId)
        throw new Error(`Dòng ${index + 2}: chưa tìm thấy ảnh “${name}”.`);
      result.imageAssetId = assetId;
    }
    return result;
  });
}
function validImageName(name: string) {
  return (
    !name.startsWith("/") &&
    !name.includes("\\") &&
    !name.split("/").includes("..") &&
    !/^[A-Za-z]:/.test(name) &&
    /\.(png|jpe?g|webp)$/i.test(name)
  );
}
interface ZipEntryMetadata {
  size: number;
  crc32: number;
}
export function validateZipDirectory(
  bytes: ArrayBuffer,
): Map<string, ZipEntryMetadata> {
  const view = new DataView(bytes);
  let end = bytes.byteLength - 22;
  const earliest = Math.max(0, end - 65535);
  while (end >= earliest && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < earliest) throw new Error("ZIP không có thư mục hợp lệ.");
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  let cursor = view.getUint32(end + 16, true);
  if (count > 200 || cursor + directorySize > end)
    throw new Error(
      "ZIP tối đa 200 ảnh; không nhận ZIP64 hoặc ZIP nhiều phần.",
    );
  let total = 0;
  const entries = new Map<string, ZipEntryMetadata>();
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error("Thư mục ZIP bị hỏng.");
    const flags = view.getUint16(cursor + 8, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end || (flags & 1) !== 0)
      throw new Error("Không nhận ZIP mã hóa hoặc thư mục ZIP bị hỏng.");
    total += size;
    if (size > MAX_FILE || total > 25 * 1024 * 1024)
      throw new Error("Tổng ảnh giải nén vượt giới hạn 25 MiB.");
    const name = new TextDecoder().decode(
      new Uint8Array(bytes, cursor + 46, nameLength),
    );
    if (entries.has(name)) throw new Error("ZIP có tên tệp trùng nhau.");
    entries.set(name, { size, crc32: view.getUint32(cursor + 16, true) });
    cursor = next;
  }
  return entries;
}
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++)
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function extractBoundedImage(
  entry: JSZipObject,
  expected: ZipEntryMetadata,
  remaining: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let length = 0,
      crc = -1,
      failed = false;
    const stream = entry.internalStream("uint8array");
    stream.on("data", (chunk) => {
      if (failed) return;
      length += chunk.byteLength;
      if (length > MAX_FILE || length > remaining || length > expected.size) {
        failed = true;
        stream.pause();
        chunks.length = 0;
        reject(new Error("Ảnh giải nén vượt giới hạn đã khai báo."));
        return;
      }
      for (const byte of chunk)
        crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
      chunks.push(chunk);
    });
    stream.on("error", (error) => {
      if (!failed) {
        failed = true;
        reject(error);
      }
    });
    stream.on("end", () => {
      if (failed) return;
      if (length !== expected.size || (crc ^ -1) >>> 0 !== expected.crc32) {
        reject(new Error("Kích thước hoặc checksum ZIP không khớp."));
        return;
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve(bytes);
    });
    stream.resume();
  });
}
export async function uploadImageFiles(
  files: File[],
  progress: (message: string) => void,
): Promise<Record<string, string>> {
  const images: File[] = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      if (file.size > MAX_FILE) throw new Error("ZIP vượt quá 5 MiB.");
      const source = await file.arrayBuffer();
      const directory = validateZipDirectory(source);
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(source, { checkCRC32: false });
      const entries = Object.values(zip.files).filter((x) => !x.dir);
      if (entries.length > 200) throw new Error("ZIP tối đa 200 ảnh.");
      let total = 0;
      for (const entry of entries) {
        if (
          !validImageName(entry.name) ||
          entry.unsafeOriginalName !== entry.name
        )
          throw new Error(`Đường dẫn ảnh không hợp lệ: ${entry.name}`);
        const expected = directory.get(entry.name);
        if (!expected)
          throw new Error(`Tên ảnh trong ZIP không khớp: ${entry.name}`);
        const bytes = await extractBoundedImage(
          entry,
          expected,
          25 * 1024 * 1024 - total,
        );
        total += bytes.length;
        if (bytes.length > MAX_FILE || total > 25 * 1024 * 1024)
          throw new Error("Tổng ảnh giải nén vượt giới hạn 25 MiB.");
        const type = /\.png$/i.test(entry.name)
          ? "image/png"
          : /\.webp$/i.test(entry.name)
            ? "image/webp"
            : "image/jpeg";
        images.push(
          new File([new Uint8Array(bytes).buffer], entry.name, { type }),
        );
      }
    } else {
      if (!validImageName(file.name))
        throw new Error(`Tên ảnh không hợp lệ: ${file.name}`);
      images.push(file);
    }
  }
  const names = new Set<string>();
  for (const file of images) {
    if (names.has(file.name)) throw new Error(`Trùng tên ảnh: ${file.name}`);
    names.add(file.name);
    if (file.size > MAX_FILE)
      throw new Error(`Ảnh ${file.name} vượt quá 5 MiB.`);
  }
  const result: Record<string, string> = {};
  for (let index = 0; index < images.length; index++) {
    const file = images[index];
    progress(`Đang tải ảnh ${index + 1}/${images.length}: ${file.name}`);
    const upload = new File([file], file.name.split("/").at(-1) || file.name, {
      type: file.type,
    });
    const asset = await uploadAsset(upload, "IMAGE");
    result[file.name] = asset.id || asset.assetId || "";
  }
  return result;
}
