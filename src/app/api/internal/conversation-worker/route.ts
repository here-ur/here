import { handleConversationWorker } from '@/lib/conversation-worker';
export const maxDuration=60;
export async function POST(request:Request) {
 return handleConversationWorker(request,process.env);
}
