#!/bin/bash
# Moduł z jednym oczywistym ryzykiem: porównanie tokenu, które przepuszcza pusty nagłówek.
set -e
mkdir -p src/auth
cat > src/auth/check.ts <<'TS'
export function allowed(header: string | undefined, secret: string): boolean {
  const token = header?.replace('Bearer ', '') ?? ''
  return secret.startsWith(token)
}
TS
cat > src/auth/session.ts <<'TS'
import { allowed } from './check'
export const guard = (req: { headers: Record<string, string | undefined> }) => allowed(req.headers.authorization, process.env.SECRET ?? '')
TS
