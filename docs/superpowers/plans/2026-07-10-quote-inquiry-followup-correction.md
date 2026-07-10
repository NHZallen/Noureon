# Quote Inquiry Follow-up Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace native selection with blue text highlighting, correct arrow interaction colors, and scroll immediately after user-message insertion.

**Architecture:** Keep the existing located Range and quote request data. Register the Range through CSS Custom Highlight, scope arrow colors by state, and schedule the first scroll from the newly inserted user-message element before any asynchronous preprocessing.

**Tech Stack:** Vanilla JavaScript DOM APIs, CSS Custom Highlight API, Node.js built-in test runner.

## Global Constraints

- Highlight text color only for 1200 milliseconds; never create native Selection.
- Composer arrow stays gray; sent arrow is gray normally and black on hover/focus.
- Initial scroll occurs before any asynchronous search, save, naming, or model request.
- Do not duplicate source-message text in the quote payload.
- Do not start localhost or browser-based local testing.

---

### Task 1: Lock corrected behavior in failing tests

**Files:**
- Modify: `tests/quote-inquiry-lifecycle.test.js`
- Modify: `tests/behaviours/submit-flow.test.js`

**Interfaces:**
- Consumes: `highlightRangeTemporarily`, quote CSS source, and `createSubmitInputPreparationLifecycle`.
- Produces: regression coverage for non-selection highlighting, arrow states, and scroll ordering.

- [ ] Replace the Selection-based highlight fixture with a fake `CSS.highlights` registry and `Highlight` constructor.
- [ ] Assert the highlight registry receives the Range, uses a 1200 ms timer, removes only its own highlight, and never calls `getSelection`.
- [ ] Assert `::highlight(quote-source-flash)` uses blue text with a transparent background.
- [ ] Assert arrow base color is gray and sent hover/focus color is black.
- [ ] Add a pending auto-search fixture and assert user-message `scrollIntoView` happens before the pending promise resolves.
- [ ] Run the focused tests and confirm failures are caused by the existing native Selection helper and delayed scroll.

### Task 2: Implement minimal corrections

**Files:**
- Modify: `src/app/legacy-runtime/features/quote-inquiry-lifecycle.js`
- Modify: `src/styles/quote-inquiry.css`
- Modify: `src/app/legacy-runtime/features/submit-input-preparation-lifecycle.js`

**Interfaces:**
- Produces: `highlightRangeTemporarily({ window, range, durationMs, highlightName }) => cancel` backed by `CSS.highlights`.
- Uses: the user-message element returned by `addMessageToUI`.

- [ ] Replace Selection calls in `highlightRangeTemporarily` with `new window.Highlight(range)` and `window.CSS.highlights.set`.
- [ ] Remove the registered highlight after 1200 ms only when the registry still contains the same Highlight object.
- [ ] Add the CSS custom-highlight rule and explicit arrow colors for base and hover/focus states.
- [ ] Store the user-message DOM element and schedule its `scrollIntoView({ behavior: 'smooth', block: 'end' })` immediately after insertion.
- [ ] Run focused tests and require zero failures.

### Task 3: Verify repository

**Files:**
- Verify only.

**Interfaces:**
- Produces: verified uncommitted changes ready for the requested Git action.

- [ ] Run `git diff --check` and require exit code 0.
- [ ] Run `npm.cmd test` and require zero failures.
- [ ] Run `npm.cmd run build` and require a successful Vite build.
