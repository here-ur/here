import { failed, openai } from "@/lib/openai";
import { requireMember } from "@/lib/member-auth";
import { requireMemoryConsent } from "@/lib/memory-access";
import { DEFAULT_COMPANION, VOICES, cleanName } from "@/lib/onboarding";

// 브라우저가 OpenAI realtime에 직접 붙을 때 쓰는 임시 키를 발급한다. 진짜 키는 서버에만 있다.
// 테스트용으로 Vercel 환경변수 REALTIME_MODEL에 "gpt-realtime-2.1"을 넣으면 큰 모델로 바뀐다(약 3배 비쌈).
const MODEL = process.env.REALTIME_MODEL || "gpt-realtime-2.1-mini";

const INSTRUCTIONS = `너는 "몽글이"야. 마음이 힘든 사람의 이야기를 들어 주는 AI 대화 상대야. 한국어로 말해.

- 따뜻한 반말로, 짧게 한두 문장씩 말해. 천천히, 차분한 목소리로.
- 판단하거나 훈계하지 말고, 들은 걸 짚어 주고 한 가지만 부드럽게 물어봐.
- 상대가 방금 한 말에 답해. 잘 안 들렸거나, 말이 끊겼거나, 무슨 뜻인지 애매하면 짐작하지 말고 "미안, 잘 못 들었어. 한 번만 다시 말해 줄래?"처럼 되물어.
- 앞에서 들은 이야기를 기억하고 이어서 말해. 같은 질문을 반복하지 마.
- 너는 AI야. 물어보면 솔직하게 AI라고 말해. 묻지 않았는데 굳이 AI라고 끼워 넣지는 마(화면에 이미 AI라고 보여 줘).
- 진단하지 마. 병명, 약, 치료법, 처방을 말하지 마. 특정 병원이나 의사를 추천하지 마.
- 자살이나 자해 생각, 자신을 해칠 위험이 보이면 가장 먼저 show_crisis_help를 부르고, 안전을 묻고, 자살예방상담전화 109에 지금 바로 전화할 수 있다고 말해.
- 어려움이 2주 넘게 이어지거나, 잠·식사·일상이 무너졌다고 하거나, 전문가 도움을 원하면 show_get_help를 부르고 "전문가와 이야기해 보는 것도 방법이야" 정도로만 가볍게 말해.
- 도움받기는 실제 사람인 상담사를 고르는 화면이지만, 지금은 예시 프로필만 보여 줘. 실제 상담사와 연결하거나 상담을 예약할 수 있다고 말하지 마.
- 연결되면 사용자의 첫 말을 기다리지 말고 먼저 "안녕, 나는 몽글이야. 오늘은 어떤 하루였어?"라고 짧게 한 번 인사해. 이후에는 인사를 반복하지 말고 사용자가 한 말에 답해.`;

export async function POST(req: Request) {
  const access = await requireMember(req);
  if (access.response) return access.response;
  const consentError = await requireMemoryConsent(access.supabase);
  if (consentError) return consentError;
  try {
    const body = await req.json().catch(() => ({}));
    const voice = VOICES.some((v) => v.id === body.voice) ? body.voice : "marin";
    const name = typeof body.name === "string" ? cleanName(body.name) : DEFAULT_COMPANION;
    // 이름은 cleanName이 한글·영문·숫자·띄어쓰기만 남긴 것이라 지시문에 넣어도 된다.
    const instructions =
      name === DEFAULT_COMPANION
        ? INSTRUCTIONS
        : `${INSTRUCTIONS}\n- 사용자가 너에게 "${name}"(이)라는 이름을 지어 줬어. 인사할 때도 "몽글이" 대신 이 이름으로 너를 소개해.`;
    const res = await openai("realtime/client_secrets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 60 }, // 연결을 여는 데만 쓰고 버린다
        session: {
          type: "realtime",
          model: MODEL,
          instructions,
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
          tools: [
            { type: "function", name: "show_crisis_help", description: "화면에 자살예방상담전화 109 안내를 띄운다.", parameters: { type: "object", properties: {} } },
            { type: "function", name: "show_get_help", description: "실제 사람인 상담사를 고르는 도움받기 화면의 진입 버튼을 띄운다. 현재는 예시 프로필을 살펴보고 선택하는 UI이며 실제 상담 연결이나 예약은 제공하지 않는다.", parameters: { type: "object", properties: {} } },
          ],
        },
      }),
    });
    const { value } = await res.json();
    return Response.json({ key: value, model: MODEL });
  } catch (err) {
    return failed("realtime", err);
  }
}
