import "jszip";
declare module "jszip" {
  interface JSZipObject {
    /** Documented streaming API; omitted by JSZip's bundled legacy declarations. */
    internalStream(type: "uint8array"): JSZipStreamHelper<Uint8Array>;
  }
}
