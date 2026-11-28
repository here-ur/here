import { requireMember } from '@/lib/member-auth';
export async function GET(request: Request) {
  const access = await requireMember(request);
  if (access.response) return access.response;
  const id = new URL(request.url).searchParams.get('callId');
  const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return json({ error: 'invalid_call' }, 400);
  try {
    const { data, error } = await access.supabase.rpc('voice_call_status', { p_id: id }).abortSignal(AbortSignal.timeout(3000));
    if (error) throw Error('status_unavailable');
    return data ? json(data) : json({ error: 'voice_call_not_found' }, 404);
  } catch { return json({ error: 'voice_status_unavailable' }, 503); }
}
