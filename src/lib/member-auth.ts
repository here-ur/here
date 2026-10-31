import { requestSupabase } from "./supabase.ts";

type Allowed = { userId: string; response?: never };
type Denied = { userId?: never; response: Response };

export async function requireMember(request: Request): Promise<Allowed | Denied> {
  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer (\S+)$/i.exec(header)?.[1];
  if (!token) return { response: Response.json({ error: "로그인이 필요해요." }, { status: 401 }) };

  const supabase = requestSupabase(token);
  if (!supabase) return { response: Response.json({ error: "로그인 설정이 아직 준비되지 않았어요." }, { status: 503 }) };

  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return { response: Response.json({ error: "로그인이 만료됐어요. 다시 로그인해 주세요." }, { status: 401 }) };

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("user_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (memberError) return { response: Response.json({ error: "계정 상태를 확인하지 못했어요." }, { status: 503 }) };
  if (!member) return { response: Response.json({ error: "초대받은 계정만 이용할 수 있어요." }, { status: 403 }) };
  return { userId: auth.user.id };
}
