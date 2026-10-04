# Development dependency review — 2026-10-04

**VERIFIED** against the installed lockfile, `npm audit --json`, `npm ls --all`, installed tool source and npm registry. Eight HIGH package entries describe one root vulnerability, not eight independent exploits. Production audit: zero findings. This is dependency evidence, not a penetration test or a production approval.

Root advisory: [GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Deeply nested attacker-controlled brace patterns can exhaust recursive AST walkers and terminate a Node process. Affected: braces <=3.0.3. The advisory lists no patched version; the registry reports latest 3.0.3 and 3.0.4 returns 404 on this evidence date. Do not suppress the advisory.

| Package (installed) | Severity | Dependency path / classification | Runtime exposure | Recommended action | Breaking-change risk |
| --- | --- | --- | --- | --- | --- |
| braces 3.0.3 | HIGH | micromatch → braces; transitive dev | Pattern parsing in lint/CLI processes; no application dependency path | Retain, restrict tooling inputs, track upstream patch | No safe patch available; no lockfile-only cure |
| micromatch 4.0.8 | HIGH, inherited | fast-glob → micromatch → braces; transitive dev | Tool glob patterns; no application import | Same containment; no speculative override | Replacing glob engine changes semantics |
| fast-glob 3.3.1 and 3.3.3 | HIGH, inherited | eslint-config-next → @next/eslint-plugin-next → fast-glob 3.3.1; shadcn → fast-glob 3.3.3; shadcn → ts-morph → @ts-morph/common → fast-glob 3.3.3 | Linter and component/code-generation tooling | Keep stack; trusted glob configuration only | Upgrading fast-glob alone retains braces chain |
| @next/eslint-plugin-next 15.5.26 | HIGH, inherited | eslint-config-next → plugin; transitive dev | npm lint and Next 15 build lint stage | Preserve matched Next 15 versions | Audit proposes eslint-config-next 14.2.35, a major downgrade |
| eslint-config-next 15.5.26 | HIGH, inherited | Direct devDependency | Lint/build; CI if those commands run | No major downgrade; monitor advisory | Major downgrade mismatches the existing framework |
| @ts-morph/common 0.27.0 | HIGH, inherited | shadcn → ts-morph → common; transitive dev | TypeScript source manipulation when shadcn CLI runs | No CLI/registry processing on untrusted inputs | Audit says fixAvailable, but does not establish a safe braces patch |
| ts-morph 26.0.0 | HIGH, inherited | shadcn → ts-morph; transitive dev | Component/source generation, not tsc compilation | Retain; do not run generators in deployment/CI | A transitive upgrade may remove one path but leaves direct shadcn and lint paths |
| shadcn 4.21.0 | HIGH, inherited | Direct devDependency; direct glob and ts-morph consumers | CLI/MCP/generation; build reads its static CSS only | Do not expose its CLI/MCP to remote inputs; keep CSS dependency | Audit proposes shadcn 1.0.0, a major downgrade |

## When code executes

| Phase | Installed chain / observed configuration |
| --- | --- |
| Development | Dependencies exist. `next dev` does not invoke the shadcn CLI. `src/app/globals.css` imports shadcn's static Tailwind CSS. Developer-invoked lint or component generation loads the vulnerable toolchain. |
| Build | Next 15's normal build runs lint. Plugin `dist/utils/get-root-dirs.js` imports fast-glob and calls it for `settings.next.rootDir` glob configuration. Current ESLint config has no rootDir glob. Import presence alone does not prove exploitable attacker-controlled input. CSS compilation does not execute the shadcn CLI. |
| Tests | Current Vitest/application/integration tests do not import these CLI/lint consumers. The installed `npm ls` paths do not run through Vitest. No claim about every possible future test/plugin. |
| CI | No repository CI workflow exists. Running build/lint reproduces the tooling exposure; generators would add shadcn exposure. CI isolation below is an operational requirement. |
| Production runtime | `npm ls --omit=dev braces micromatch fast-glob shadcn` is empty. `npm audit --omit=dev` reports zero. No source imports of the JS CLI; do not run dev tooling in the request-serving process. Build still requires devDependencies for CSS/lint. |

## Containment and remediation decision

No dependency or lockfile upgrades were applied. Package script additions do not alter dependency resolution. Existing overrides remain untouched. A lockfile-only refresh cannot obtain a patched braces release that does not exist. `npm audit fix --force` would make major downgrades and is rejected for this task.

Registry follow-up: latest micromatch 4.0.8 still requires braces ^3.0.3; latest fast-glob 3.3.3 still requires micromatch ^4.0.8. shadcn 4.21.1 is a patch release but still requires fast-glob ^3.3.3 and ts-morph ^26.0.0, so it does not remediate this finding. ts-morph 26 has only 26.0.0 published in the inspected range. @ts-morph/common 0.28.0/0.29.0 switch from fast-glob to tinyglobby; latest ts-morph 28.0.0 uses common ~0.29.0. These remove one inherited path, but require crossing the installed pre-1.0 common range / ts-morph major range and do not fix shadcn's direct fast-glob or ESLint's path. They are not a compatible lockfile-only complete remediation and were not forced with overrides. The only audit-suggested lint replacement is the mismatched 14.2.35 downgrade; no supported root patch was found.

Use the pinned lockfile with `npm ci`; build trusted source/configuration in an isolated worker. Do not accept user-controlled glob patterns, shadcn registries or remote generator/MCP requests. Untrusted-PR CI must not receive staging/production secrets; do not use privileged `pull_request_target` execution for untrusted code. Limit worker CPU/time, use least-privilege build credentials only in trusted release jobs, and never expose dev servers to public traffic. These controls constrain risk; they do not resolve the advisory. No CI has been provisioned or verified here. Reassess when a supported upstream patch is published, then apply the smallest supported change and repeat build/lint/tests.
