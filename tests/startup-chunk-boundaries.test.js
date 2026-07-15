import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

test('homepage keeps Supabase, cloud sync, and the full recovery page behind dynamic imports', () => {
  const mainSource = readSource('src/main.js');
  const identitySource = readSource('src/app/auth/startup-identity.js');
  const authLoaderSource = readSource('src/app/auth/startup-auth-bridge.js');
  const staticImports = mainSource
    .split(/\r?\n/)
    .filter((line) => /^import\s/.test(line));

  assert.equal(
    staticImports.some((line) => line.includes('cloud-workspace-sync.js')),
    false
  );
  assert.equal(
    staticImports.some((line) => line.includes('password-recovery-page.js')),
    false
  );
  assert.equal(
    staticImports.some((line) => line.includes('supabase-auth-bridge.js')),
    false
  );
  assert.doesNotMatch(
    mainSource,
    /from\s+['"][^'"]*supabase-auth-bridge\.js['"]/
  );
  assert.doesNotMatch(
    identitySource,
    /^import\s+.*supabase-client\.js.*$/m
  );
  assert.match(identitySource, /import\('\.\/supabase-client\.js'\)/);
  assert.doesNotMatch(
    authLoaderSource,
    /^import\s+.*supabase-auth-bridge\.js.*$/m
  );
  assert.match(authLoaderSource, /import\('\.\/supabase-auth-bridge\.js'\)/);
  assert.match(
    mainSource,
    /import\s+\{\s*isPasswordRecoveryRoute\s*\}\s+from\s+'\.\/app\/auth\/password-recovery-route\.js'/
  );
  assert.match(mainSource, /await\s+import\(\s*'\.\/app\/auth\/password-recovery-page\.js'\s*\)/);
  assert.match(mainSource, /retryAsync\(async\s*\(\)\s*=>\s*\{[\s\S]*?await\s+import\('\.\/app\/sync\/cloud-workspace-sync\.js'\)/);
});

test('Supabase dependencies stay out of the eager catch-all vendor chunk', () => {
  const viteSource = readSource('vite.config.js');
  const supabaseRuleAt = viteSource.indexOf("if (id.includes('@supabase')) return undefined");
  const catchAllVendorAt = viteSource.indexOf("return 'vendor';");

  assert.ok(supabaseRuleAt >= 0);
  assert.ok(catchAllVendorAt > supabaseRuleAt);
});

test('startup data begins after shell mount and joins auth at the runtime gate', () => {
  const mainSource = readSource('src/main.js');
  const shellAt = mainSource.indexOf('mountAppShell(appShell)');
  const dataAt = mainSource.indexOf('const startupDataReady = Promise.all([');
  const identityAt = mainSource.indexOf('const identityAndRequiredAuthReady = resolveStartupIdentity()');
  const localBypassAt = mainSource.indexOf("startupIdentity.mode === 'local'");
  const authAt = mainSource.indexOf('await initializeStartupAuthBridge({ window, document, startupIdentity })');
  const gateAt = mainSource.indexOf('const [{ auth, startupIdentity }] = await Promise.all([');
  const runtimeAt = mainSource.indexOf("await import('./app/legacy-app.js')");

  assert.ok(shellAt >= 0);
  assert.ok(dataAt > shellAt, 'startup data should begin immediately after the shell is mounted');
  assert.ok(identityAt > dataAt, 'identity should start while startup data is already loading');
  assert.ok(localBypassAt > identityAt, 'only cached local identity may bypass required startup auth');
  assert.ok(authAt > identityAt, 'auth should begin as soon as identity resolves');
  assert.ok(gateAt > authAt, 'the runtime gate should await both concurrent branches');
  assert.ok(runtimeAt > gateAt, 'legacy runtime must not load before auth and data are ready');
  assert.match(
    mainSource.slice(gateAt, runtimeAt),
    /identityAndRequiredAuthReady,\s*startupDataReady/
  );
  assert.match(
    mainSource.slice(identityAt, gateAt),
    /startupIdentity\.mode === 'local'\s*\? null\s*:\s*await initializeStartupAuthBridge/
  );
  const safetyCheckAt = mainSource.indexOf('if (!startupIdentity.safeToReadWorkspace)');
  const unsafeErrorAt = mainSource.indexOf('cannot verify the cached cloud workspace owner');
  assert.ok(safetyCheckAt > authAt, 'an unsafe cloud identity must be rechecked after auth reconciliation');
  assert.ok(unsafeErrorAt > safetyCheckAt && unsafeErrorAt < gateAt, 'unsafe identity must reject before the runtime gate');
});

test('local or anonymous startup resolves cloud readiness without fetching cloud sync', () => {
  const mainSource = readSource('src/main.js');
  const runtimeAt = mainSource.indexOf('STARTUP_MARKS.RUNTIME_INTERACTIVE');
  const backgroundAuthAt = mainSource.indexOf('void initializeLocalAuthBridgeInBackground');
  const cloudBranchAt = mainSource.indexOf("const cloudSyncReady = startupIdentity.mode !== 'local' && auth?.session?.user");
  const cloudImportAt = mainSource.indexOf("import('./app/sync/cloud-workspace-sync.js')");
  const localFallbackAt = mainSource.indexOf("startupIdentity.mode === 'local' ? 'local-identity' : 'no-session'");
  const exposedAt = mainSource.indexOf('window.__astraCloudWorkspaceSyncReady = cloudSyncReady');

  assert.ok(backgroundAuthAt > runtimeAt, 'local auth bridge must start only after runtime is interactive');
  assert.ok(cloudBranchAt > backgroundAuthAt);
  assert.ok(cloudImportAt > cloudBranchAt);
  assert.ok(localFallbackAt > cloudImportAt);
  assert.ok(exposedAt > localFallbackAt);
  assert.match(
    mainSource,
    /startupIdentity\.mode !== 'local' && auth\?\.session\?\.user\s*\?\s*retryAsync\(/
  );
  assert.match(mainSource, /:\s*Promise\.resolve\(\{/);
});

test('normal auth and settings code depend only on the tiny recovery route helper', () => {
  const authBridgeSource = readSource('src/app/auth/supabase-auth-bridge.js');
  const settingsSource = readSource('src/app/runtime/legacy-core/settings-sync-vault-controls.js');
  const recoveryPageSource = readSource('src/app/auth/password-recovery-page.js');
  const routeSource = readSource('src/app/auth/password-recovery-route.js');

  assert.match(authBridgeSource, /from '\.\/password-recovery-route\.js'/);
  assert.doesNotMatch(authBridgeSource, /password-recovery-page\.js/);
  assert.match(settingsSource, /from '\.\.\/\.\.\/auth\/password-recovery-route\.js'/);
  assert.doesNotMatch(settingsSource, /password-recovery-page\.js/);
  assert.match(recoveryPageSource, /from '\.\/password-recovery-route\.js'/);
  assert.match(routeSource, /export function isPasswordRecoveryRoute/);
  assert.match(routeSource, /export function openPasswordRecovery/);
  assert.doesNotMatch(routeSource, /supabase|turnstile|i18n|password-recovery-page/i);
});
