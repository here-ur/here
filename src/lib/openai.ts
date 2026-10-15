// 서버 전용. OPENAI_API_KEY는 API 라우트에서만 읽는다.
// ponytail: 호출 제한(rate limit)이 없다. 공개 배포 전에 IP별 제한이나 Vercel Firewall을 건다.
export async function openai(path: string, init: RequestInit): Promise<Response> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았어요 (.env.local)");
  const res = await fetch(`https://api.openai.com/v1/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, ...init.headers },
  });
  if (!res.ok) throw new Error(`OpenAI ${path} ${res.status}: ${await res.text()}`);
  return res;
}

export function failed(where: string, err: unknown): Response {
  console.error(where, err);
  return Response.json({ error: "잠시 연결이 어려워요. 조금 뒤에 다시 해 줘." }, { status: 502 });
}
