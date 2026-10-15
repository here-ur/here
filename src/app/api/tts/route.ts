import { failed, openai } from "@/lib/openai";

export async function POST(req: Request) {
  const text = (await req.json().catch(() => null))?.text;
  if (typeof text !== "string" || !text.trim() || text.length > 1000) {
    return Response.json({ error: "잘못된 요청" }, { status: 400 });
  }

  try {
    const res = await openai("audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "coral",
        input: text,
        instructions: "따뜻하고 차분한 한국어로, 조금 천천히 말해 줘.",
        response_format: "mp3",
      }),
    });
    return new Response(res.body, { headers: { "Content-Type": "audio/mpeg" } });
  } catch (err) {
    return failed("tts", err);
  }
}
