import { notFound } from "next/navigation";
import Preview from "./Preview";

// 로그인 없이 첫 실행(기억 동의 → 캐릭터 만나기)을 넘겨 보는 개발용 화면. 환영·가입·로그인은 로그아웃한 첫 화면(/)에서,
// 마이크 안내는 홈에서 처음 마이크를 누를 때 나오며 /dev/microphone-permission에서 본다.
// 서버에 요청하지 않고 아무것도 저장하지 않는다.
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Preview />;
}
