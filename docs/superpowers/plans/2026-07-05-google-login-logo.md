# Google Login Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google's official multicolor G logo before the existing Google login text while preserving the Supabase OAuth flow.

**Architecture:** Keep the existing `#supabase-google-btn` and its click listener unchanged. Store Google's approved `g-logo.png` locally under `public/`, then add a decorative image child when the auth shell creates the button.

**Tech Stack:** Vanilla JavaScript, Happy DOM, Node.js test runner, Vite, Tailwind utility classes

---

### Task 1: Add and verify the official Google logo

**Files:**
- Create: `public/google-g-logo.png`
- Modify: `src/app/auth/supabase-auth-bridge.js`
- Test: `tests/supabase-auth-bridge.test.js`

- [x] **Step 1: Write the failing DOM test**

Add these assertions after the existing Google button assertion:

```js
const googleButton = window.document.getElementById('supabase-google-btn');
const googleLogo = googleButton.querySelector('img');
assert.ok(googleLogo);
assert.equal(googleLogo.getAttribute('src'), '/google-g-logo.png');
assert.equal(googleLogo.getAttribute('width'), '20');
assert.equal(googleLogo.getAttribute('height'), '20');
assert.equal(googleLogo.getAttribute('alt'), '');
assert.equal(googleLogo.getAttribute('aria-hidden'), 'true');
```

- [x] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/supabase-auth-bridge.test.js`

Expected: FAIL because `googleButton.querySelector('img')` returns `null`.

- [x] **Step 3: Download the approved official asset**

Download `https://developers.google.com/static/identity/images/g-logo.png` to `public/google-g-logo.png`. Verify the file is a valid PNG and record its pixel dimensions.

- [x] **Step 4: Add the image to the existing button**

After creating `googleButton`, add layout classes and prepend the decorative image:

```js
googleButton.classList.add('flex', 'items-center', 'justify-center', 'gap-2');
const googleLogo = document.createElement('img');
googleLogo.src = '/google-g-logo.png';
googleLogo.width = 20;
googleLogo.height = 20;
googleLogo.alt = '';
googleLogo.setAttribute('aria-hidden', 'true');
googleButton.prepend(googleLogo);
```

Do not change the Google button ID or the existing `signInWithOAuth` listener.

- [x] **Step 5: Run the focused test and confirm GREEN**

Run: `node --test tests/supabase-auth-bridge.test.js`

Expected: all tests in the file PASS.

- [x] **Step 6: Run repository verification**

Run: `npm test`

Expected: all tests PASS with no failures.

Run: `npm run build`

Expected: Vite production build completes successfully.

- [x] **Step 7: Inspect the rendered login screen**

Run the Vite development server, open the login page at desktop and mobile widths, and confirm the official G logo appears before the text without overlap or layout shift.

- [x] **Step 8: Commit and publish**

```bash
git add public/google-g-logo.png src/app/auth/supabase-auth-bridge.js tests/supabase-auth-bridge.test.js docs/superpowers/plans/2026-07-05-google-login-logo.md
git commit -m "feat: add official Google login logo"
git push origin main
```
