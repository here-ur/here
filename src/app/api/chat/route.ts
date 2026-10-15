import { hasCrisisSignal } from "@/lib/crisis";
import { failed, openai } from "@/lib/openai";

const MODEL = "gpt-4.1-mini";

const SYSTEM = `너는 "몽글이"야. 마음이 힘든 사람의 이야기를 들어 주는 AI 대화 상대야.

- 따뜻한 반말로, 소리 내어 읽기 좋게 2~3문장으로 짧게 답해. 이모지와 목록은 쓰지 마.
- 판단하거나 훈계하지 말고, 들은 걸 짚어 주고 한 가지만 부드럽게 물어봐.
- 너는 AI야. 물어보면 솔직하게 AI라고 말해.
- 진단하지 마. 병명, 약, 치료법, 처방을 말하지 마.
- 특정 병원이나 의사를 추천하지 마.

JSON으로만 답해:
- reply: 사용자에게 할 말
- suggestHospital: 어려움이 2주 넘게 이어지거나, 잠·식사·일상이 무너졌다고 하거나, 사용자가 전문가 도움을 원하면 true. 이때 reply에 "전문가와 이야기해 보는 것도 방법이야" 정도로만 가볍게 덧붙여.
- crisis: 자살이나 자해 생각, 자신을 해칠 위험이 보이면 true. 이때 reply에서 먼저 안전을 묻고, 자살예방상담전화 109에 지금 바로 전화할 수 있다고 알려 줘.`;

const SCHEMA = {
  name: "mongle_reply",
  strict: true,
  schema: {
    type: "object",
    properties: {
      reply: { type: "string" },
      suggestHospital: { type: "boolean" },
      crisis: { type: "boolean" },
    },
    required: ["reply", "suggestHospital", "crisis"],
    additionalProperties: false,
  },
};

type Msg = { role: "user" | "assistant"; content: string };

function parseMessages(body: unknown): Msg[] | null {
  const list = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(list) || list.length === 0) return null;
  const ok = list.every(
    (m) =>
      (m?.role === "user" || m?.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.length <= 1000,
  );
  return ok ? (list as Msg[]).slice(-20) : null;
}

export async function POST(req: Request) {
  const messages = parseMessages(await req.json().catch(() => null));
  if (!messages || messages.at(-1)!.role !== "user") {
    return Response.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const crisisByKeyword = hasCrisisSignal(messages.at(-1)!.content);

  try {
    const res = await openai("chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: SYSTEM }, ...messages],
        response_format: { type: "json_schema", json_schema: SCHEMA },
      }),
    });
    const data = await res.json();
    const out = JSON.parse(data.choices[0].message.content);
    return Response.json({
      reply: String(out.reply),
      suggestHospital: Boolean(out.suggestHospital),
      crisis: crisisByKeyword || Boolean(out.crisis),
    });
  } catch (err) {
    // AI가 실패해도 위기 신호는 놓치지 않는다.
    if (crisisByKeyword) return Response.json({ reply: "", suggestHospital: false, crisis: true });
    return failed("chat", err);
  }
}
