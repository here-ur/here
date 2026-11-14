import { notFound } from "next/navigation";
import Preview from "./Preview";

// 로그인 없이 첫 실행 전체(환영 → 가입·로그인 → 기억 동의 → 마이크 안내 → 캐릭터 만나기)를 넘겨 보는 개발용 화면.
// 서버에 요청하지 않고 아무것도 저장하지 않는다.
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Preview />;
}
