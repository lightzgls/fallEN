import { createHash } from "node:crypto";
import sharp from "sharp";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { bucket, fail, parse, type Data } from "../../shared/core.js";
import { rowSchema } from "../../contracts/content/values.js";

/** Storage and untrusted file parsing stay outside retriable Firestore callbacks. */
export async function inspectContentUpload(asset: Data): Promise<Data> {
  const [metadata] = await bucket.file(asset.storagePath).getMetadata();
  if (
    Number(metadata.size) !== asset.byteSize ||
    metadata.contentType !== asset.contentType ||
    Number(metadata.size) > 5 * 1024 * 1024
  )
    fail("VALIDATION_FAILED", "Uploaded bytes differ from the grant");
  const [bytes] = await bucket.file(asset.storagePath).download();
  const dimensions: Data = {};
  if (asset.kind === "IMAGE") {
    let image: sharp.Metadata;
    try {
      image = await sharp(bytes, { limitInputPixels: 16_000_000 }).metadata();
      await sharp(bytes, { limitInputPixels: 16_000_000 }).stats();
    } catch {
      return fail("VALIDATION_FAILED", "Invalid or oversized image");
    }
    const formats: Record<string, string> = {
      "image/jpeg": "jpeg",
      "image/png": "png",
      "image/webp": "webp",
    };
    if (image.format !== formats[asset.contentType] || (image.pages ?? 1) > 1)
      fail(
        "VALIDATION_FAILED",
        "Image bytes do not match the declared media type",
      );
    dimensions.width = image.width;
    dimensions.height = image.height;
  } else parseFileRows(bytes, asset);
  return {
    ...dimensions,
    checksum: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function readImportFileRows(asset: Data): Promise<Data[]> {
  const [bytes] = await bucket.file(asset.storagePath).download();
  if (createHash("sha256").update(bytes).digest("hex") !== asset.checksum)
    fail("VALIDATION_FAILED", "Import checksum changed");
  return parseFileRows(bytes, asset);
}

export function parseFileRows(bytes: Buffer, asset: Data): Data[] {
  let rows: Data[];
  if (asset.contentType === "text/csv") {
    const result = Papa.parse<Data>(bytes.toString("utf8"), {
      header: true,
      skipEmptyLines: "greedy",
    });
    if (result.errors.length) fail("VALIDATION_FAILED", "CSV cannot be parsed");
    rows = result.data;
  } else {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(bytes, {
        type: "buffer",
        cellFormula: true,
        bookVBA: true,
        sheetRows: 1002,
      });
    } catch {
      return fail("VALIDATION_FAILED", "XLSX cannot be parsed");
    }
    if (workbook.vbaraw || workbook.SheetNames.length !== 1)
      fail("VALIDATION_FAILED", "Use one worksheet without macros");
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (
      Object.values(sheet).some(
        (cell) =>
          cell && typeof cell === "object" && ("f" in cell || "l" in cell),
      )
    )
      fail(
        "VALIDATION_FAILED",
        "Formula and external-link cells are not accepted",
      );
    rows = XLSX.utils.sheet_to_json<Data>(sheet, { raw: false, defval: "" });
  }
  if (!rows.length || rows.length > 1000)
    fail("VALIDATION_FAILED", "Imports require 1–1000 rows");
  return rows.map((row) => {
    if (
      Object.keys(row).some(
        (key) =>
          ![
            "word",
            "partOfSpeech",
            "focusMeaningId",
            "example",
            "exampleTranslation",
            "position",
            "imageAssetId",
            "imageAlt",
          ].includes(key),
      )
    )
      fail("VALIDATION_FAILED", "Unknown import column");
    const clean = Object.fromEntries(
      Object.entries(row).filter(
        ([, value]) => value !== "" && value !== null && value !== undefined,
      ),
    );
    if (clean.position !== undefined) clean.position = Number(clean.position);
    if (
      Object.values(clean).some(
        (value) => typeof value === "string" && /^[=+@]/.test(value),
      )
    )
      fail("VALIDATION_FAILED", "Formula-like text is not accepted");
    return parse(rowSchema, clean);
  });
}
