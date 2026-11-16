import { Icon } from "./art";

export default function AuthProviderIcon({ provider }: { provider: "kakao" | "google" | "email" }) {
  if (provider === "email") return <span className="auth-provider-icon"><Icon name="email" size={20} /></span>;
  return <svg className="auth-provider-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {provider === "kakao" ? <path fill="currentColor" d="M12 3C6.48 3 2 6.5 2 10.82c0 2.77 1.85 5.2 4.63 6.59l-1.18 4.32c-.1.38.34.68.67.46l5.16-3.43.72.02c5.52 0 10-3.5 10-7.96C22 6.5 17.52 3 12 3Z" /> : <>
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.59A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.35-2.59Z" />
      <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.35 2.59A6 6 0 0 1 12 5.96Z" />
    </>}
  </svg>;
}
