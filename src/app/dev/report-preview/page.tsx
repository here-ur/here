import { Suspense } from "react";
import { notFound } from "next/navigation";
import Preview from "./Preview";

type Query = Promise<{ [key: string]: string | string[] | undefined }>;

// ?data=quiet(이번 주에 이야기 없음) · ?data=empty(이야기한 날 없음)로 빈 상태를 볼 수 있다.
async function Sample({ searchParams }: { searchParams: Query }) {
  const data = (await searchParams).data;
  return <Preview sample={data === "quiet" || data === "empty" ? data : "full"} />;
}

export default function Page({ searchParams }: { searchParams: Query }) {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Suspense><Sample searchParams={searchParams} /></Suspense>;
}
