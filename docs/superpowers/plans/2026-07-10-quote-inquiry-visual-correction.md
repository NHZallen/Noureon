# Quote Inquiry Visual Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the desktop quote inquiry menu, composer preview, and sent-message quote presentation to match the approved screenshots.

**Architecture:** Keep the existing quote data flow and source-scroll lifecycle unchanged. Restore the two quote-arrow DOM nodes that belong to composer and sent-message previews, then scope CSS so only the floating action label is blue while quote previews remain gray and sent previews align right.

**Tech Stack:** Vanilla JavaScript DOM, CSS, Node.js built-in test runner.

## Global Constraints

- Desktop only; mobile quote inquiry UI remains hidden.
- Composer and sent previews clamp quoted text to three lines.
- Clicking a sent quote scrolls to its source without applying browser text selection.
- Do not start localhost or run browser-based local testing.

---

### Task 1: Lock the approved visual contract in tests

**Files:**
- Modify: `tests/quote-inquiry-lifecycle.test.js`
- Modify: `tests/message-markup-renderer.test.js`

**Interfaces:**
- Consumes: source text loaded by `readUiSource` and HTML returned by `buildMessageRenderView`.
- Produces: regression assertions for menu colors, preview colors, arrows, right alignment, and no browser selection.

- [ ] **Step 1: Replace the incorrect visual assertions**

Assert that the lifecycle contains the two preview arrow nodes but the selection-menu construction contains no SVG/arrow, and assert CSS contains white menu states, blue menu text, gray previews, black sent-preview hover, and right alignment.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/quote-inquiry-lifecycle.test.js tests/message-markup-renderer.test.js`

Expected: FAIL because the current implementation has no preview arrows, makes previews blue, and gives the floating button a blue hover background.

### Task 2: Apply the minimal DOM and CSS correction

**Files:**
- Modify: `src/app/legacy-runtime/features/quote-inquiry-lifecycle.js`
- Modify: `src/app/legacy-runtime/features/message-markup-renderer.js`
- Modify: `src/styles/quote-inquiry.css`

**Interfaces:**
- Consumes: the existing `quote-inquiry-bar`, `quote-inquiry-menu-button`, and `sent-message-quote` components.
- Produces: approved desktop presentation without altering quote submission or source navigation.

- [ ] **Step 1: Restore preview arrows only**

Add a `quote-inquiry-icon` span before composer quote text and a `sent-message-quote-icon` span before sent quote text. Keep `quote-inquiry-menu-button` text-only.

- [ ] **Step 2: Correct scoped visual states**

Set the menu button text to `var(--button-primary-bg)` and its normal/hover/focus/active background to `var(--modal-bg)`. Set composer and sent quote colors to `#8b9098`; make sent hover/focus `#111827`; use a two-column arrow/text grid and right-align the sent quote container while preserving the three-line clamp.

- [ ] **Step 3: Run focused tests and verify GREEN**

Run: `node --test tests/quote-inquiry-lifecycle.test.js tests/message-markup-renderer.test.js`

Expected: both files pass with zero failures.

### Task 3: Verify the repository

**Files:**
- Verify only.

**Interfaces:**
- Consumes: completed UI correction.
- Produces: evidence that the correction does not regress other behavior.

- [ ] **Step 1: Check patch formatting**

Run: `git diff --check`

Expected: exit code 0.

- [ ] **Step 2: Run the full test suite**

Run: `npm.cmd test`

Expected: all tests pass with zero failures.

- [ ] **Step 3: Run the production build**

Run: `npm.cmd run build`

Expected: Vite exits successfully.
