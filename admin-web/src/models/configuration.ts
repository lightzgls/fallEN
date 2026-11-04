export interface Speech {
  provider: "ANDROID_TTS";
  text: string;
  listenAllowed: boolean;
  version: number;
}
export interface Topic {
  id: string;
  name: string;
  context: string;
  learnerRole: string;
  aiRole: string;
  goal: string;
  openingLine: string;
  guide: string;
  active: boolean;
  version: number;
}
export interface ChatLimit {
  maxSessionsPerDay: number;
  version: number;
}
