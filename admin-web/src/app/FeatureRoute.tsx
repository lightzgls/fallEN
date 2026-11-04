import { Decks } from "../features/content/Decks";
import { DraftEditor } from "../features/content/DraftEditor";
import { Catalog } from "../features/dictionary/Catalog";
import { Imports } from "../features/imports/Imports";
import { SpeechPage } from "../features/config/Speech";
import { Limit, Topics } from "../features/config/AI";
import { Reports } from "../features/reports/Reports";
export function FeatureRoute({
  path,
  navigate,
  onDirty,
}: {
  path: string;
  navigate: (path: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [section, id] = path.replace(/^\//, "").split("/");
  switch (section) {
    case "draft":
      return <DraftEditor navigate={navigate} onDirty={onDirty} />;
    case "catalog":
      return <Catalog navigate={navigate} />;
    case "imports":
      return <Imports navigate={navigate} onDirty={onDirty} />;
    case "speech":
      return (
        <SpeechPage
          key={id}
          wordId={id ? decodeURIComponent(id) : undefined}
          navigate={navigate}
          onDirty={onDirty}
        />
      );
    case "topics":
      return <Topics onDirty={onDirty} />;
    case "limit":
      return <Limit onDirty={onDirty} />;
    case "reports":
      return (
        <Reports
          key={id}
          reportId={id ? decodeURIComponent(id) : undefined}
          navigate={navigate}
        />
      );
    default:
      return <Decks navigate={navigate} />;
  }
}
