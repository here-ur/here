import { handleContextWorker } from '@/lib/context-worker';
export const maxDuration = 60;
export async function POST(request: Request) {
  return handleContextWorker(request, process.env);
}
