import { failed, openai } from "@/lib/openai";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File) || audio.size === 0 || audio.size > MAX_BYTES) {
    return Response.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const body = new FormData();
  body.append("file", audio);
  body.append("model", "gpt-4o-mini-transcribe");
  body.append("language", "ko");

  try {
    const res = await openai("audio/transcriptions", { method: "POST", body });
    const { text } = await res.json();
    return Response.json({ text: String(text ?? "").trim() });
  } catch (err) {
    return failed("stt", err);
  }
}
