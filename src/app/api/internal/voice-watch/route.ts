import { handleVoiceWatch } from '@/lib/voice-watch-server';
export const maxDuration = 90;
export async function POST(request: Request) {
  return handleVoiceWatch(request, process.env);
}
