import { notFound } from "next/navigation";
import Preview from "./Preview";

// 고양이 로딩 장면(로딩 화면 시안 A·B·C·E·F·G·H·I)을 로그인 없이 넘겨 보는 개발용 화면. 서버에 요청하지 않는다.
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Preview />;
}
