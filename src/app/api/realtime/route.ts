import { failed, openai } from "@/lib/openai";
import { requireMember } from "@/lib/member-auth";
import { requireMemoryConsent } from "@/lib/memory-access";
import { VOICES } from "@/lib/onboarding";
import { memoryEnabled } from "@/lib/memory";
import { companionPrompt } from "@/lib/companion-prompt";
import { requireApiQuota } from "@/lib/api-quota";
import { JsonRequestError, readSmallJson } from "@/lib/request-json";

// 브라우저가 OpenAI realtime에 직접 붙을 때 쓰는 임시 키를 발급한다. 진짜 키는 서버에만 있다.
// 테스트용으로 Vercel 환경변수 REALTIME_MODEL에 "gpt-realtime-2.1"을 넣으면 큰 모델로 바뀐다(약 3배 비쌈).
const MODEL = process.env.REALTIME_MODEL || "gpt-realtime-2.1-mini";

export async function POST(req: Request) {
  const access = await requireMember(req);
  if (access.response) return access.response;
  const consentError = await requireMemoryConsent(access.supabase);
  if (consentError) return consentError;
  const quotaError = await requireApiQuota(access.supabase, "realtime");
  if (quotaError) return quotaError;
  try {
    const parsed = await readSmallJson(req, 5000, 4096);
    const body = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    const voice = VOICES.some((v) => v.id === body.voice) ? body.voice : "marin";
    const memory = memoryEnabled(process.env);
    const res = await openai("realtime/client_secrets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 60 }, // 연결을 여는 데만 쓰고 버린다
        session: {
          type: "realtime",
          model: MODEL,
          instructions: companionPrompt(access.onboardingAnswers, undefined, { hereName: access.hereName, mode: "voice" }),
          output_modalities: ["audio"],
          audio: {
            input: {
              noise_reduction: { type: "near_field" },
              transcription: { model: "gpt-4o-mini-transcribe", language: "ko" },
              // 첫 인사가 끝나기 전 입력/VAD가 응답을 가로채지 않게 한다.
              // 클라이언트가 output_audio_buffer.stopped 이후 semantic_vad를 켠다.
              turn_detection: null,
            },
            output: { voice },
          },
          tools: [],
        },
      }),
    });
    const { value } = await res.json();
    return Response.json({ key: value, model: MODEL, memory, webSearch: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof JsonRequestError) return Response.json({ error: err.message }, { status: err.status, headers: { "Cache-Control": "no-store" } });
    return failed();
  }
}
