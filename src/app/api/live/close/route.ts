import { requireMember } from '@/lib/member-auth';
import { readSmallJson } from '@/lib/request-json';
export async function POST(request: Request) {
  const access = await requireMember(request);
  if (access.response) return access.response;
  try {
    const body = await readSmallJson(request, 3000, 1024) as { callId?: unknown };
    if (typeof body.callId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.callId)) return Response.json({ error: 'invalid_call' }, { status: 400 });
    const { data, error } = await access.supabase.rpc('request_voice_close', { p_id: body.callId }).abortSignal(AbortSignal.timeout(3000));
    if (error) throw Error('close_request_failed');
    return Response.json({ requested: data === true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'voice_close_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
