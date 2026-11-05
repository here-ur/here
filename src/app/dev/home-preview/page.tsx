import { notFound } from "next/navigation";
import { Suspense } from "react";
import Preview from "./Preview";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Suspense fallback={null}><Preview /></Suspense>;
}
