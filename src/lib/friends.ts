// 친구: 초대로 이어진 회원. 서버에는 본인이 정한 닉네임만 올리고, 친구에게는 닉네임과 가입일만 보인다.
// 연락처는 서버에 올리지 않는다. 고른 번호로 기기의 문자 앱을 열 뿐이다.

export type Friend = { name: string | null; relation: "invited_by_me" | "invited_me"; joinedAt: string };

/** list_friends()의 행을 확인한다. 모양이 다른 행은 뺀다. */
export function parseFriends(data: unknown): Friend[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const { display_name, relation, joined_at } = row as Record<string, unknown>;
    if (relation !== "invited_by_me" && relation !== "invited_me") return [];
    if (typeof joined_at !== "string" || Number.isNaN(Date.parse(joined_at))) return [];
    const name = typeof display_name === "string" && display_name.trim() ? display_name.trim() : null;
    return [{ name, relation, joinedAt: joined_at }];
  });
}

/** 서버에 올릴 닉네임. 비었거나 20자를 넘거나 줄바꿈 같은 제어 문자가 있으면 올리지 않는다. */
export function displayNameForServer(nickname: string | undefined): string | null {
  const name = nickname?.trim() ?? "";
  if (!name || [...name].length > 20 || /\p{Cc}/u.test(name)) return null;
  return name;
}

/** 카톡·문자로 보내는 앱 초대. 폐지된 코드 가입 경로를 안내하지 않는다. */
export function inviteMessage(origin: string) {
  return `Here!에서 같이 이야기해요.\n${origin}\n휴대폰 번호로 가입하고 나만의 AI 친구를 만나 보세요.`;
}

/** 문자 앱 주소. iOS는 번호 뒤 본문 구분자로 &를 쓴다. */
export function smsHref(body: string, phone = "", ios = false) {
  return `sms:${phone}${ios ? "&" : "?"}body=${encodeURIComponent(body)}`;
}
