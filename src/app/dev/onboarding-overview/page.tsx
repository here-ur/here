import { notFound } from "next/navigation";
import Overview from "./Overview";

// 캐릭터 만나기(온보딩) 단계를 한 페이지에 나란히 펼쳐 보는 개발용 화면. 아무것도 저장하지 않는다.
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Overview />;
}
