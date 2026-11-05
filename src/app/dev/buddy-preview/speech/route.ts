import { readFile } from "node:fs/promises";
import path from "node:path";

// Local synthetic speech fixture only. No personal conversation or provider call.
export async function GET() {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  const bytes = await readFile(path.join(process.cwd(), "src/app/dev/buddy-preview/speech/sample.wav"));
  return new Response(bytes, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
}
