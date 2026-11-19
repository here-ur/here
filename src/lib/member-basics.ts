import type { SupabaseClient } from "@supabase/supabase-js";

/** 새로 가입한 회원이 기억 동의 다음, 캐릭터 만나기 전에 한 번 적는 성별·생년월일.
 * 값은 members 행에만 두고(0016_member_basics.sql) AI 대화·기억·리포트에는 보내지 않는다.
 * 이 마이그레이션 전에 가입한 회원은 묻지 않는다(basics_required = false). */
export type Gender = "female" | "male";
export const GENDERS: readonly { id: Gender; label: string }[] = [
  { id: "female", label: "여성" },
  { id: "male", label: "남성" },
];
/** 법정대리인 동의 절차가 없어 만 14세 미만은 가입을 막는다. DB 함수도 같은 기준으로 저장을 거절한다. */
export const MIN_AGE = 14;
const EARLIEST = "1900-01-01";

export type SaveResult = "ok" | "invalid" | "under_14" | "not_member";

const pad = (n: number, size = 2) => String(n).padStart(size, "0");
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** 한국 날짜로 오늘(YYYY-MM-DD). DB 함수도 Asia/Seoul 날짜로 나이를 잰다. */
export function seoulToday(now = Date.now()): string {
  const d = new Date(now + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 입력칸에는 숫자만 8자리까지 남긴다(점·빼기·띄어쓰기를 붙여 적어도 받아 준다). */
export function birthDigits(input: string): string {
  return input.replace(/\D/g, "").slice(0, 8);
}

/** 생년월일 8자리(YYYYMMDD)를 실제 있는 날짜(YYYY-MM-DD)로 바꾼다. 1900년 이전·오늘 이후·없는 날짜는 null. */
export function parseBirthDate(input: string, today = seoulToday()): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(birthDigits(input));
  if (!match || birthDigits(input) !== input.replace(/[\s.\-/]/g, "")) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) return null;
  const iso = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
  return iso < EARLIEST || iso > today ? null : iso;
}

/** 만 나이가 minAge 미만인지. 생일에 minAge년을 더한 날이 오늘보다 뒤면 아직 그 나이가 아니다.
 * 2월 29일생은 평년에는 2월 28일에 나이가 든다(PostgreSQL의 date + interval과 같다). */
export function isUnderAge(birth: string, today = seoulToday(), minAge = MIN_AGE): boolean {
  const [year, month, day] = birth.split("-").map(Number);
  const target = year + minAge;
  const reached = `${pad(target, 4)}-${pad(month)}-${pad(Math.min(day, daysIn(target, month)))}`;
  return reached > today;
}

/** 화면에서 적은 날짜를 다시 보여 줄 때: 1999년 1월 1일 */
export function formatBirthDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

/** 이 회원에게 성별·생년월일을 물어야 하는지. 마이그레이션이 아직 적용되지 않은 DB면(열이 없음) 묻지 않는다.
 * 그때는 저장할 곳도 없으므로 기능이 꺼진 것과 같고, 적용된 뒤 다음 확인부터 묻는다. */
export async function needsMemberBasics(client: SupabaseClient, userId: string, signal?: AbortSignal): Promise<{ needed: boolean; known: boolean }> {
  let query = client.from("members").select("gender, birth_date, basics_required").eq("user_id", userId);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query.maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "42703") return { needed: false, known: false };
    throw Error("basics_unavailable");
  }
  if (!data) throw Error("basics_member_missing");
  const row = data as { gender: string | null; birth_date: string | null; basics_required: boolean };
  return { needed: row.basics_required === true && (!row.gender || !row.birth_date), known: true };
}

export async function saveMemberBasics(client: SupabaseClient, gender: Gender, birthDate: string): Promise<SaveResult> {
  const { data, error } = await client.rpc("set_member_basics", { p_gender: gender, p_birth_date: birthDate });
  if (error) throw Error("basics_save_failed");
  if (data === "ok" || data === "invalid" || data === "under_14" || data === "not_member") return data;
  throw Error("basics_save_unknown");
}

/** 캐릭터 만나기 무대가 넘긴 답("여성", "1999년 1월 1일")을 저장할 값으로 바꾼다. 둘 중 하나라도 없거나 없는 날짜면 null. */
export function basicsFromAnswers(answers: Record<string, unknown>, today = seoulToday()): { gender: Gender; birthDate: string } | null {
  const gender = GENDERS.find((g) => g.label === answers.gender)?.id;
  const match = typeof answers.birth === "string" ? /^(\d{4})년 (\d{1,2})월 (\d{1,2})일$/.exec(answers.birth) : null;
  const birthDate = match ? parseBirthDate(`${match[1]}${pad(Number(match[2]))}${pad(Number(match[3]))}`, today) : null;
  return gender && birthDate ? { gender, birthDate } : null;
}

/** 저장하지 못했을 때 화면에 보여 줄 말. */
export function basicsSaveError(result: Exclude<SaveResult, "ok"> | "failed"): string {
  if (result === "under_14") return `만 ${MIN_AGE}세 이상부터 쓸 수 있어요.`;
  if (result === "invalid") return "생년월일을 다시 확인해 주세요.";
  if (result === "not_member") return "계정 정보를 확인하지 못했어요. 로그아웃한 뒤 다시 로그인해 주세요.";
  return "저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.";
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
// 화면 안내용 표시일 뿐 권한이 아니다. 한 번 끝나면 다시 묻지 않으므로, 이 기기에서 확인을 건너뛰는 데만 쓴다.
export function basicsDisplayKey(userId: string) {
  return `here:basics-display:${userId}`;
}
export function hasBasicsDisplayHint(storage: StorageLike | undefined, userId: string): boolean {
  if (!userId) return false;
  try { return storage?.getItem(basicsDisplayKey(userId)) === "done"; }
  catch { return false; }
}
export function setBasicsDisplayHint(storage: StorageLike | undefined, userId: string) {
  if (!userId) return;
  try { storage?.setItem(basicsDisplayKey(userId), "done"); }
  catch { /* 저장소를 못 쓰면 다음에도 서버에서 한 번 더 확인한다. */ }
}
