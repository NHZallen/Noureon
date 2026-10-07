# Instructions for AI coding agents

Read these before changing anything:

- **Start here — latest handoff (state, rules, next steps, environment notes):** [`docs/superpowers/plans/2026-10-04-session-handoff.md`](docs/superpowers/plans/2026-10-04-session-handoff.md)
- Downloadable files line of work: [`docs/superpowers/plans/2026-09-28-downloadable-files-handoff.md`](docs/superpowers/plans/2026-09-28-downloadable-files-handoff.md)
- Plan and decisions: [`docs/superpowers/specs/2026-09-26-downloadable-files-design.md`](docs/superpowers/specs/2026-09-26-downloadable-files-design.md)
- Design system and PPTX output: [`docs/superpowers/specs/2026-09-27-design-system.md`](docs/superpowers/specs/2026-09-27-design-system.md)
- V1 visual check design and implementation notes: [`docs/superpowers/specs/2026-09-28-vision-check-design.md`](docs/superpowers/specs/2026-09-28-vision-check-design.md)
- Plan B (Python sandbox, "Advanced" mode) design: [`docs/superpowers/specs/2026-09-28-python-sandbox-design.md`](docs/superpowers/specs/2026-09-28-python-sandbox-design.md)
- Server-side execution (replies that continue after the page is closed, skills, command-line tools) plan: [`docs/superpowers/specs/2026-10-03-server-runtime-design.md`](docs/superpowers/specs/2026-10-03-server-runtime-design.md)
- Deep research (計劃倒數、自主研究、報告卡與下載) design, under discussion: [`docs/superpowers/specs/2026-10-04-deep-research-design.md`](docs/superpowers/specs/2026-10-04-deep-research-design.md)
- CLI store (命令工具商城: store tab, `@` menu, permissions, sandbox network) design, phase 1 shipped (notes in §9), phase 2 done (notes in §10); phases 3 and 4 (user uploads) were cancelled by the owner on 2026-10-05, so the plan is complete: [`docs/superpowers/specs/2026-10-04-cli-store-design.md`](docs/superpowers/specs/2026-10-04-cli-store-design.md)
- Split storage (工作空間分開儲存：每個對話一筆紀錄，解決啟動時整份重寫、記憶體暴衝) design, all phases done and on by default since 17.8.0 (notes in §13): [`docs/superpowers/specs/2026-10-06-split-storage-design.md`](docs/superpowers/specs/2026-10-06-split-storage-design.md)
- Server-side image generation (圖片生成搬到伺服器，關掉頁面也會畫完) design, done and released in 17.9.0 (P0 to P3 in §8 to §11; to do: the real-account checklist in §11). The plan for the same line of work: image first, then the web search that models without tools use (the server does the search itself), then the multi-model council last, each with its own design before any code: [`docs/superpowers/specs/2026-10-06-server-image-generation-design.md`](docs/superpowers/specs/2026-10-06-server-image-generation-design.md)
- Server-side web search packet (「先搜一包」搬到伺服器，關掉頁面也會搜完、答完) design, draft under discussion, no code yet: [`docs/superpowers/specs/2026-10-07-server-search-packet-design.md`](docs/superpowers/specs/2026-10-07-server-search-packet-design.md)
- Releases and deployment: [`RELEASING.md`](RELEASING.md), tests: [`TESTING.md`](TESTING.md)

Rules that always apply:

- Reply to the owner in Traditional Chinese.
- Do one phase at a time and report; push to `main` only when the owner says so (every push deploys to noureon.com).
- Never add `Co-Authored-By` or any AI attribution to commit messages.
- Do not commit `.claude/`.
- Tag every minor release (`x.y.0`) as `v<version>` on its release commit (see `RELEASING.md`); patch releases need no tag.
- Every feature and text covers zh-TW, en, fr, ru and es.
- Base visual designs on real vendor designs with references; the owner prefers minimal black and white. Ask before deciding user-facing layout.
- Before finishing: `npm test`, `npm run build`, `npm run check:sizes`, `npm run check:legacy-runtime`, `npm run check:server`, `npm audit --omit=dev`.
