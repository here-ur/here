import { notFound } from "next/navigation";
import Check from "./Check";
export default function Page() {
  if (process.env.VERCEL_ENV === "production" || process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://mwjwfumpxdlllikcdvkh.supabase.co") notFound();
  return <Check />;
}
