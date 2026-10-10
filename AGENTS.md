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
- CLI store (命令工具商城: store tab, `@` menu, permissions, sandbox network) design, phase 1 shipped (notes in §9), phase 2 done (notes in §10); phases 3 and 4 (user uploads) were cancelled by the owner on 2026-10-05, so the plan is complete; on 2026-10-09 the store became the Extensions page (擴充) with two parts, skills (empty for now) and CLI tools (§16): [`docs/superpowers/specs/2026-10-04-cli-store-design.md`](docs/superpowers/specs/2026-10-04-cli-store-design.md)
- Skills (技能: SKILL.md format, pasted or uploaded as a zip with files by the user and kept in `user_skills` and the bucket `user-skill-bundles`, asked for with `/` or loaded by the model with `load_skill` and `read_skill_file`, scripts run from `/skills` in the server sandbox; the official `skill-creator` skill and the `skill-draft` card for making skills; the Skills part of the Extensions page), phases 1 to 3 (P1, P2 with files and scripts, P3 making skills) done on the working branch `claude/dark-mode` and waiting for the owner to test (notes in §11 to §22; the first official skills to put in the catalog are still to be chosen with the owner, §9): [`docs/superpowers/specs/2026-10-09-skills-design.md`](docs/superpowers/specs/2026-10-09-skills-design.md)
- Split storage (工作空間分開儲存：每個對話一筆紀錄，解決啟動時整份重寫、記憶體暴衝) design, all phases done and on by default since 17.8.0 (notes in §13): [`docs/superpowers/specs/2026-10-06-split-storage-design.md`](docs/superpowers/specs/2026-10-06-split-storage-design.md)
- Server-side image generation (圖片生成搬到伺服器，關掉頁面也會畫完) design, done and released in 17.9.0 (P0 to P3 in §8 to §11; to do: the real-account checklist in §11). The plan for the same line of work: image first, then the web search that models without tools use (the server does the search itself), then the multi-model council last, each with its own design before any code: [`docs/superpowers/specs/2026-10-06-server-image-generation-design.md`](docs/superpowers/specs/2026-10-06-server-image-generation-design.md)
- Server-side web search packet (「先搜一包」搬到伺服器，關掉頁面也會搜完、答完) design, done (17.10.0; the real-account checklist is in §10): [`docs/superpowers/specs/2026-10-07-server-search-packet-design.md`](docs/superpowers/specs/2026-10-07-server-search-packet-design.md)
- Server-side multi-model council (多模型會議搬到伺服器，關掉頁面也會開完會) design, done (17.11.0; the real-account checklist is in §10; the last of image, search packet, council): [`docs/superpowers/specs/2026-10-08-server-council-design.md`](docs/superpowers/specs/2026-10-08-server-council-design.md)
- Public pages (使用條款、隱私權政策、更新紀錄做成 noureon.com/terms、/privacy、/updates 的獨立靜態頁) design, done (17.13.0; the open choices of the owner are in §4.3 and the handoff): [`docs/superpowers/specs/2026-10-08-public-pages-design.md`](docs/superpowers/specs/2026-10-08-public-pages-design.md)
- Dark mode (the colour names of `src/styles/tokens.css`, light/dark/system, the dark grey theme; what is done and what is left): [`docs/superpowers/specs/2026-10-08-dark-mode-design.md`](docs/superpowers/specs/2026-10-08-dark-mode-design.md)
- Decisions judgement model (判斷模型: OpenRouter Decisions API decides web search, file guidance, chart guidance, command tools; falls back to the word lists; 17.16.0; the live endpoint and CORS were never tested from the sandbox, see §4): [`docs/superpowers/specs/2026-10-08-decisions-design.md`](docs/superpowers/specs/2026-10-08-decisions-design.md)
- Homepage (登入前首頁: three pinned scroll stories made from screenshots of the real components, five languages, light and dark; `public/home.css`, `src/app/ui/home/`, `src/data/home-texts.js`, `public/home/`; done in 18.1.0): [`docs/superpowers/specs/2026-10-10-homepage-design.md`](docs/superpowers/specs/2026-10-10-homepage-design.md)
- Releases and deployment: [`RELEASING.md`](RELEASING.md), tests: [`TESTING.md`](TESTING.md)

Rules that always apply:

- Reply to the owner in Traditional Chinese.
- Do one phase at a time and report; push to `main` only when the owner says so (every push deploys to noureon.com).
- Never add `Co-Authored-By` or any AI attribution to commit messages.
- Do not commit `.claude/`.
- Tag every minor release (`x.y.0`) as `v<version>` on its release commit (see `RELEASING.md`); patch releases need no tag.
- Every feature and text covers zh-TW, en, fr, ru and es.
- Colours: use the names of `src/styles/tokens.css` (`var(--text-primary)`, `var(--modal-bg)`…) and never write a colour of your own in a stylesheet; the light and the dark theme depend on it.
- Base visual designs on real vendor designs with references; the owner prefers minimal black and white. Ask before deciding user-facing layout.
- Before finishing: `npm test`, `npm run build`, `npm run check:sizes`, `npm run check:legacy-runtime`, `npm run check:server`, `npm audit --omit=dev`.
