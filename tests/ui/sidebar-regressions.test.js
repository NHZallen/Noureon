import assert from 'node:assert/strict';
import test from 'node:test';
import { readUiSource } from '../helpers/source-guards.js';

test('sidebar search and history model pills use solid white surfaces', () => {
  const css = readUiSource('src/styles/main.css');

  assert.match(css, /#open-search-btn[^{]*\{[^}]*background:\s*#ffffff\s!important;/s);
  assert.match(css, /\.model-suffix[^{]*\{[^}]*background-color:\s*#ffffff;/s);
  assert.match(css, /\.dark\s+\.model-suffix[^{]*\{[^}]*background-color:\s*var\(--input-field-bg\)(?:\s!important)?;/s);
});

test('desktop startup keeps sidebar closed while preserving manual and mobile toggle paths', () => {
  const appBootstrapLifecycle = readUiSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const searchUploadSidebarLifecycle = readUiSource('src/app/runtime/legacy-core/search-upload-sidebar-lifecycle.js');
  const css = readUiSource('src/styles/main.css');

  assert.match(
    appBootstrapLifecycle,
    /if\s*\(window\.innerWidth\s*>=\s*1024\)\s*\{[\s\S]*setSidebarOpen\(false\);[\s\S]*ALL_ELEMENTS\.sidebar\.classList\.remove\('open'\);[\s\S]*ALL_ELEMENTS\.appContainer\.classList\.remove\('sidebar-open'\);[\s\S]*\}/
  );
  assert.doesNotMatch(
    appBootstrapLifecycle,
    /if\s*\(window\.innerWidth\s*>=\s*1024\)\s*\{[\s\S]*setSidebarOpen\(true\);[\s\S]*classList\.add\('sidebar-open'\)/
  );
  assert.match(appBootstrapLifecycle, /ALL_ELEMENTS\.menuToggleBtn\.addEventListener\('click',\s*\(\)\s*=>\s*toggleSidebar\(\)\)/);
  assert.match(appBootstrapLifecycle, /ALL_ELEMENTS\.sidebarOverlay\.addEventListener\('click',\s*\(\)\s*=>\s*toggleSidebar\(false\)\)/);
  assert.match(searchUploadSidebarLifecycle, /sidebar\.classList\.toggle\('open',\s*sidebarOpen\)/);
  assert.match(searchUploadSidebarLifecycle, /appContainer\.classList\.toggle\('sidebar-open',\s*sidebarOpen\)/);
  assert.match(searchUploadSidebarLifecycle, /sidebar\.style\.transform\s*=\s*'translateX\(0\)'/);
  assert.match(searchUploadSidebarLifecycle, /sidebar\.style\.transform\s*=\s*'translateX\(-100%\)'/);
  assert.match(css, /#sidebar\s*\{[^}]*visibility:\s*hidden;[^}]*pointer-events:\s*none;/s);
  assert.match(css, /#sidebar\.open,\s*#app-container\.sidebar-open\s+#sidebar\s*\{[^}]*visibility:\s*visible;[^}]*pointer-events:\s*auto;/s);
  assert.match(css, /#user-profile-btn\s*\{[^}]*width:\s*auto\s!important;[^}]*min-width:\s*0;/s);
  assert.match(css, /#settings-btn\s*\{[^}]*flex:\s*0\s+0\s+2\.75rem;/s);
});

test('folder color rendering supports saved css color values without falling back', () => {
  const runtime01 = readUiSource('src/app/runtime/legacy-core/legacy-core.js');
  const sidebarChatAstraRenderSource = readUiSource('src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js');
  const runtime02 = readUiSource('src/app/runtime/legacy-core/legacy-core.js');
  const runtime00 = readUiSource('src/app/runtime/legacy-core/legacy-core.js');
  const css = readUiSource('src/styles/main.css');

  assert.match(runtime00, /resolveFolderColor/);
  assert.match(runtime01, /folderColors:\s*FOLDER_COLORS/);
  assert.match(sidebarChatAstraRenderSource, /resolveFolderColor\(folder\.color,\s*folderColors,\s*folderColors\.gray\)/);
  assert.match(sidebarChatAstraRenderSource, /--folder-icon-color:\s*\$\{iconColor\}/);
  assert.match(runtime02, /normalizeFolderColorSelection\(selectedColor,\s*FOLDER_COLORS\)/);
  assert.match(css, /\.folder-icon\s*\{[^}]*color:\s*var\(--folder-icon-color,\s*inherit\)\s!important;/s);
});
