import { requestSupabase } from "./supabase.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

type Allowed = { userId: string; supabase: SupabaseClient; response?: never };
type Denied = { userId?: never; response: Response };

export async function requireMember(request: Request, clientForToken = requestSupabase): Promise<Allowed | Denied> {
  const deny = (error: string, status: number): Denied => ({ response: Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } }) });
  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer (\S+)$/i.exec(header)?.[1];
  if (!token || token.length > 8192) return deny("로그인이 필요해요.", 401);

  try {
    const supabase = clientForToken(token);
    if (!supabase) return deny("로그인 설정이 아직 준비되지 않았어요.", 503);

    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError && (!authError.status || authError.status === 429 || authError.status >= 500)) return deny("로그인 상태를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.", 503);
    if (authError || !auth.user) return deny("로그인이 만료됐어요. 다시 로그인해 주세요.", 401);

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("user_id")
      .eq("user_id", auth.user.id)
      .abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(5000)]))
      .maybeSingle();
    if (memberError) return deny("계정 상태를 확인하지 못했어요.", 503);
    if (!member || member.user_id !== auth.user.id) return deny("초대받은 계정만 이용할 수 있어요.", 403);
    return { userId: auth.user.id, supabase };
  } catch { return deny("계정 상태를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.", 503); }
}
