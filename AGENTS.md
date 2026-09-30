# Instructions for AI coding agents

Read these before changing anything:

- Current work, rules and next steps: [`docs/superpowers/plans/2026-09-28-downloadable-files-handoff.md`](docs/superpowers/plans/2026-09-28-downloadable-files-handoff.md)
- Plan and decisions: [`docs/superpowers/specs/2026-09-26-downloadable-files-design.md`](docs/superpowers/specs/2026-09-26-downloadable-files-design.md)
- Design system and PPTX output: [`docs/superpowers/specs/2026-09-27-design-system.md`](docs/superpowers/specs/2026-09-27-design-system.md)
- V1 visual check design and implementation notes: [`docs/superpowers/specs/2026-09-28-vision-check-design.md`](docs/superpowers/specs/2026-09-28-vision-check-design.md)
- Plan B (Python sandbox, "Advanced" mode) design: [`docs/superpowers/specs/2026-09-28-python-sandbox-design.md`](docs/superpowers/specs/2026-09-28-python-sandbox-design.md)
- Releases and deployment: [`RELEASING.md`](RELEASING.md), tests: [`TESTING.md`](TESTING.md)

Rules that always apply:

- Reply to the owner in Traditional Chinese.
- Do one phase at a time and report; push to `main` only when the owner says so (every push deploys to noureon.com).
- Never add `Co-Authored-By` or any AI attribution to commit messages.
- Do not commit `.claude/`.
- Tag every minor release (`x.y.0`) as `v<version>` on its release commit (see `RELEASING.md`); patch releases need no tag.
- Every feature and text covers zh-TW, en, fr, ru and es.
- Base visual designs on real vendor designs with references; the owner prefers minimal black and white. Ask before deciding user-facing layout.
- Before finishing: `npm test`, `npm run build`, `npm run check:sizes`, `npm run check:legacy-runtime`, `npm audit --omit=dev`.
