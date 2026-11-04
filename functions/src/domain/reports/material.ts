import { hash } from "../../shared/values.js";
import { type Data } from "../../shared/types.js";
import type { Category } from "../../contracts/reports/values.js";

export function learningContent(
  word: Data,
  category: Category,
  override?: Data,
): Data {
  const meanings: Data[] = override?.focusMeaningId
    ? word.meanings.filter(
        (meaning: Data) => meaning.id === override.focusMeaningId,
      )
    : word.meanings;
  const projected = meanings
    .map((meaning) => {
      const meaningContent = {
        partOfSpeech: meaning.partOfSpeech,
        text: meaning.text,
      };
      const exampleContent = {
        meaning: meaningContent,
        example: override?.example ?? meaning.example ?? null,
        exampleTranslation: override?.example
          ? override.exampleTranslation
          : (meaning.exampleTranslation ?? null),
      };
      const imageContent = {
        meaning: meaningContent,
        imageAssetId: override?.imageAssetId ?? meaning.imageAssetId ?? null,
        imageAlt: override?.imageAssetId
          ? override.imageAlt
          : (meaning.imageAlt ?? null),
      };
      if (category === "MEANING") return meaningContent;
      if (category === "EXAMPLE_TRANSLATION") return exampleContent;
      if (category === "IMAGE") return imageContent;
      return { ...meaningContent, ...exampleContent, ...imageContent };
    })
    .sort((left, right) => hash(left).localeCompare(hash(right)));
  const pronunciation = {
    spelling: word.spelling,
    phonetic: word.phonetic ?? null,
    otherSpellings: [...(word.otherSpellings ?? [])].sort(),
  };
  if (category === "PRONUNCIATION") return pronunciation;
  return category === "OTHER"
    ? { ...pronunciation, meanings: projected }
    : { meanings: projected };
}
