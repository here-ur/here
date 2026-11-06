type Deployment = { VERCEL_ENV?: string; VERCEL_GIT_COMMIT_REF?: string };

export function devCanonicalAddress(input: string, method: string, env: Deployment): string | null {
  if (env.VERCEL_ENV !== "preview" || env.VERCEL_GIT_COMMIT_REF !== "dev") return null;
  if (method !== "GET" && method !== "HEAD") return null;
  const url = new URL(input);
  if (url.pathname !== "/" || !/^here-[a-z0-9-]+-here23\.vercel\.app$/.test(url.hostname)) return null;
  // Navigate to the existing session's origin; never send tokens between hosts.
  url.protocol = "https:";
  url.host = "here-dev.vercel.app";
  url.port = "";
  return url.toString();
}
