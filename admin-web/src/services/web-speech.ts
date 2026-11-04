export function cancelSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}
export function previewSpeech(
  text: string,
  locale: "en-GB" | "en-US",
  rate: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!("speechSynthesis" in window)) {
      reject(new Error("Không thể nghe thử trên trình duyệt này."));
      return;
    }
    cancelSpeech();
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(
      (x) => x.lang.toLowerCase() === locale.toLowerCase(),
    );
    if (!voice) {
      reject(
        new Error(
          `Không có giọng ${locale} trên trình duyệt. Kiểm tra giọng đã cài và thử lại.`,
        ),
      );
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale;
    utterance.voice = voice;
    utterance.rate = rate;
    utterance.onend = () => resolve();
    utterance.onerror = (event) =>
      reject(
        new Error(
          event.error === "canceled"
            ? "Đã dừng nghe thử."
            : "Không thể phát giọng trên trình duyệt.",
        ),
      );
    window.speechSynthesis.speak(utterance);
  });
}
