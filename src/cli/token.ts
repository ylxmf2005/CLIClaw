import { CLICLAW_TOKEN_ENV } from "../shared/env.js";

export { CLICLAW_TOKEN_ENV };

export function resolveToken(token?: string): string {
  if (token && token.trim()) return token.trim();

  const fromEnv = process.env[CLICLAW_TOKEN_ENV];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  throw new Error(
    `Token is required. Provide --token <token> or set ${CLICLAW_TOKEN_ENV}.`
  );
}
