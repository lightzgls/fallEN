export interface Meaning {
  id: string;
  partOfSpeech: string;
  text: string;
  example?: string;
  exampleTranslation?: string;
  imageAssetId?: string;
  imageAlt?: string;
}
export interface Word {
  wordId: string;
  id?: string;
  wordVersion: number;
  version?: number;
  spelling: string;
  phonetic?: string;
  meanings: Meaning[];
  releaseId?: string;
  matchType?: string;
}
export interface WordPage {
  items: Word[];
  releaseId: string;
  cursor?: string;
}
