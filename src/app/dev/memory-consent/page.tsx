import { notFound } from "next/navigation";
import { MemoryConsentPreview } from "@/app/MemoryConsentGate";

export default function ConsentPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <MemoryConsentPreview />;
}
