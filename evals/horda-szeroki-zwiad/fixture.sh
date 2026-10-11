#!/bin/bash
# Szerokie repo: 120 modułów w 12 katalogach, endpoint wołany na trzy sposoby w trzech
# miejscach i fałszywy trop (`/api/orders`). Za duże na kilka grepów z ręki.
set -e
for d in api views jobs legacy billing search admin mail auth cache report util; do
  mkdir -p "src/$d"
  for i in $(seq 1 10); do
    printf "// moduł %s/%s\nexport const f%s = (x: number) => x + %s\nexport const route%s = '/api/orders/%s'\n" "$d" "$i" "$i" "$i" "$i" "$i" > "src/$d/m$i.ts"
  done
done
printf "export const USERS = '/api/users'\n" > src/api/paths.ts
printf "import { USERS } from '../api/paths'\nexport const load = () => fetch(USERS)\n" > src/views/list.ts
printf "export const sync = () => fetch('/api/users?all=1')\n" > src/jobs/sync.ts
printf "const base = '/api'\nexport const old = () => fetch(\`\${base}/users\`)\n" > src/legacy/old.ts
