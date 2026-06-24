"use client";

import { useEffect, useRef, useState } from "react";

// A small mic button that uses the browser's Web Speech API to transcribe speech
// and append it to a field. Lets execs build their voice profile by just talking.
// Degrades gracefully (hidden) where the API isn't available.
export default function MicDictate({ onText }: { onText: (chunk: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e: any) => {
      let chunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) chunk += e.results[i][0].transcript;
      }
      if (chunk.trim()) onText(chunk.trim() + " ");
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    return () => { try { rec.stop(); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const rec = recRef.current;
    if (!rec) return;
    if (listening) { try { rec.stop(); } catch { /* ignore */ } setListening(false); }
    else { try { rec.start(); setListening(true); } catch { /* already running */ } }
  };

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${listening ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-300" : "border-app text-muted hover:text-app"}`}
      title={listening ? "Stop dictation" : "Dictate with your microphone"}
    >
      {listening ? "● Listening… (tap to stop)" : "🎤 Speak"}
    </button>
  );
}
