/** Low-latency dialog audio: Web Speech API first; optional REST TTS later. */

let speaking = false;

export function speakText(
  text: string,
  opts?: { lang?: string; rate?: number; pitch?: number },
): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 400));
    u.lang = opts?.lang ?? "en-US";
    u.rate = opts?.rate ?? 1.05; // slightly faster = snappier
    u.pitch = opts?.pitch ?? 1.05;
    speaking = true;
    u.onend = () => {
      speaking = false;
    };
    u.onerror = () => {
      speaking = false;
    };
    window.speechSynthesis.speak(u);
  } catch {
    speaking = false;
  }
}

export function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* */
  }
  speaking = false;
}

export function isSpeaking() {
  return speaking;
}

/**
 * Optional REST TTS (ElevenLabs-style or OpenAI audio). Fire-and-forget blob play.
 * Configure via VITE_TTS_API_URL + VITE_TTS_API_KEY when available.
 */
export async function speakViaRest(
  text: string,
  apiUrl: string,
  apiKey?: string,
): Promise<boolean> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: text.slice(0, 400), voice: "alloy" }),
    });
    if (!res.ok) return false;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("audio")) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      await audio.play();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
