import { chatResponse } from "@/lib/chat-server";

export function POST(request: Request) {
  return chatResponse(request, {
    apiKey: process.env.RUNYOUR_API_KEY,
    baseUrl: process.env.RUNYOUR_BASE_URL,
    model: process.env.CHAT_MODEL,
  });
}
