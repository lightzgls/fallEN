import { useEffect, useState } from "react";
import { api, assetUrl } from "../services/api";
import { AssetImage } from "./Ui";
export function StoredImage({
  assetId,
  alt,
  className,
}: {
  assetId?: string;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setUrl(undefined);
    setFailed(false);
    if (assetId)
      void api("getImageAsset", { assetId })
        .then((asset) => asset.url ?? assetUrl(asset.storagePath))
        .then((value) => {
          if (active) setUrl(value);
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    return () => {
      active = false;
    };
  }, [assetId]);
  if (failed)
    return (
      <div
        className={`image-placeholder ${className || ""}`}
        role="img"
        aria-label={`Không tải được ảnh: ${alt}`}
      >
        Không tải được ảnh
      </div>
    );
  return <AssetImage url={url} alt={alt} className={className} />;
}
