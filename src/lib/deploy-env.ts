/** 운영(Vercel Production) 밖에서만 보이는 개발·테스트용 기능인지.
 * 로컬과 here-dev(Preview)에서는 true, here-prod에서는 false. 값은 next.config.ts가 빌드할 때 넣는다. */
export function devToolsVisible(deployEnv: string | undefined = process.env.HERE_DEPLOY_ENV): boolean {
  return deployEnv !== "production";
}
