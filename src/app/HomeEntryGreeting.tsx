"use client";

import { useEffect } from "react";
import { connectRealtime } from "@/lib/realtime";
import { browserSupabase } from "@/lib/supabase";

/** Home-entry audio only. Never requests microphone access or stores a conversation. */
export default function HomeEntryGreeting({ name, voice, onSpeaking, onDone }: {
  name: string; voice: string;
  onSpeaking: (value: boolean) => void;
  onDone: (value: boolean) => void;
}) {
  useEffect(() => {
    const controller = new AbortController();
    const finish = () => {
      if (controller.signal.aborted) return;
      onSpeaking(false);
      onDone(true);
    };
    // Deferral prevents Strict Mode's discarded effect from opening a duplicate session.
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const { data } = await browserSupabase()!.auth.getSession();
          if (controller.signal.aborted) return;
          if (!data.session) { finish(); return; }
          await connectRealtime({
            onStatus: status => { if (!controller.signal.aborted) onSpeaking(status === "speaking"); },
            onUserText: () => {}, onUserPartial: () => {},
            onAssistantText: () => {}, onAssistantPartial: () => {}, onTool: () => {},
            onError: finish,
          }, { name, voice }, controller.signal, data.session.access_token,
          { microphone: false, greeting: true, onGreetingEnd: finish });
        } catch { finish(); }
      })();
    }, 0);
    const expiry = setTimeout(() => { finish(); controller.abort(); }, 60_000);
    const onHidden = () => { if (document.hidden) { finish(); controller.abort(); } };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      clearTimeout(timer);
      clearTimeout(expiry);
      document.removeEventListener("visibilitychange", onHidden);
      controller.abort();
    };
  }, [name, voice, onSpeaking, onDone]);
  return null;
}
