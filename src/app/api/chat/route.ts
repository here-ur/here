import { chatResponse } from "@/lib/chat-server";
import { requireMember } from "@/lib/member-auth";

export async function POST(request: Request) {
  const access = await requireMember(request);
  if (access.response) return access.response;
  return chatResponse(request, {
    apiKey: process.env.RUNYOUR_API_KEY,
    baseUrl: process.env.RUNYOUR_BASE_URL,
    model: process.env.CHAT_MODEL,
  });
}
