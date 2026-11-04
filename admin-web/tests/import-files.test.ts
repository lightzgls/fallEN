import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import {
  mapImportRows,
  readSourceTable,
  uploadImageFiles,
  validateZipDirectory,
} from "../src/services/import-files";
import { uploadAsset } from "../src/services/api";

vi.mock("../src/services/api", () => ({ uploadAsset: vi.fn() }));

describe("admin import input boundaries", () => {
  it("preserves phrase spacing and maps named images independently of upload order", () => {
    const table = {
      headers: ["Term", "Picture", "Alt"],
      rows: [
        {
          Term: "  train station  ",
          Picture: "travel/station.png",
          Alt: "Nhà ga",
        },
      ],
    };
    expect(
      mapImportRows(
        table,
        "",
        { word: "Term", imagePath: "Picture", imageAlt: "Alt" },
        { "travel/station.png": "asset-station" },
      ),
    ).toEqual([
      {
        word: "train station",
        imageAssetId: "asset-station",
        imageAlt: "Nhà ga",
      },
    ]);
  });

  it("rejects an unmatched image filename instead of attaching a different image", () => {
    expect(() =>
      mapImportRows(
        {
          headers: ["word", "image"],
          rows: [{ word: "station", image: "missing.png" }],
        },
        "",
        { word: "word", imagePath: "image" },
        {},
      ),
    ).toThrow("missing.png");
  });

  it("reads a quoted CSV phrase and rejects malformed CSV", async () => {
    const table = await readSourceTable(
      new File(
        ['word,example\n"train station","A station, nearby."\n'],
        "words.csv",
      ),
    );
    expect(table.rows[0]).toEqual({
      word: "train station",
      example: "A station, nearby.",
    });
    await expect(
      readSourceTable(new File(['word,example\n"broken'], "bad.csv")),
    ).rejects.toThrow("CSV");
  });

  it("rejects formula cells in an XLSX workbook", async () => {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([["word"], ["station"]]);
    sheet.A2 = {
      t: "s",
      f: 'HYPERLINK("https://example.invalid")',
      v: "station",
    };
    XLSX.utils.book_append_sheet(workbook, sheet, "Words");
    const bytes: ArrayBuffer = XLSX.write(workbook, {
      type: "array",
      bookType: "xlsx",
    });
    await expect(
      readSourceTable(new File([bytes], "formula.xlsx")),
    ).rejects.toThrow("công thức");
  });

  it("rejects traversal paths before uploading ZIP images", async () => {
    const zip = new JSZip();
    zip.file("../station.png", new Uint8Array([1, 2, 3]));
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    await expect(
      uploadImageFiles([new File([bytes], "images.zip")], () => undefined),
    ).rejects.toThrow("Đường dẫn");
    expect(uploadAsset).not.toHaveBeenCalled();
  });

  it("checks declared decompressed size before opening ZIP entries", async () => {
    const zip = new JSZip();
    zip.file("station.png", new Uint8Array([1]));
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const view = new DataView(bytes);
    for (let index = 0; index < bytes.byteLength - 46; index++) {
      if (view.getUint32(index, true) === 0x02014b50) {
        view.setUint32(index + 24, 100 * 1024 * 1024, true);
        break;
      }
    }
    expect(() => validateZipDirectory(bytes)).toThrow("25 MiB");
  });

  it("retains the source ZIP path for mapping and uploads a basename", async () => {
    vi.mocked(uploadAsset).mockResolvedValue({
      id: "asset-station",
      storagePath: "content/test/asset-station",
      state: "VALIDATED",
    });
    const zip = new JSZip();
    zip.file("travel/station.png", new Uint8Array([1, 2, 3]));
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const result = await uploadImageFiles(
      [new File([bytes], "images.zip")],
      () => undefined,
    );
    expect(result).toEqual({ "travel/station.png": "asset-station" });
    expect(vi.mocked(uploadAsset).mock.calls[0][0].name).toBe("station.png");
  });

  it("rejects false small expansion metadata while streaming before any upload", async () => {
    const zip = new JSZip();
    zip.file("station.png", new Uint8Array(64 * 1024).fill(7));
    const bytes = await zip.generateAsync({
      type: "arraybuffer",
      compression: "DEFLATE",
    });
    const view = new DataView(bytes);
    for (let index = 0; index < bytes.byteLength - 46; index++) {
      if (view.getUint32(index, true) === 0x02014b50) {
        view.setUint32(index + 24, 1, true);
        break;
      }
    }
    await expect(
      uploadImageFiles([new File([bytes], "forged.zip")], () => undefined),
    ).rejects.toThrow();
    expect(uploadAsset).not.toHaveBeenCalled();
  });
});
