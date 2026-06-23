import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildAstraMobileContextMenuMarkup,
  buildConversationMobileContextMenuMarkup,
  buildFolderMobileContextMenuMarkup
} from '../src/app/legacy-runtime/features/mobile-context-menu-markup.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const getActions = (markup) => [...markup.matchAll(/data-action="([^"]+)"/g)].map((match) => match[1]);

test('builds conversation mobile menu markup for a foldered pinned conversation', () => {
  const markup = buildConversationMobileContextMenuMarkup({
    title: 'Roadmap',
    folderId: 'folder-1',
    pinned: true,
    text: {
      rename: 'Rename',
      unpin: 'Unpin',
      moveOutOfFolder: 'Move out',
      archive: 'Archive',
      delete: 'Delete'
    }
  });

  assert.match(markup, /^\n\s*<div class="menu-header">Roadmap<\/div>/);
  assert.deepEqual(getActions(markup), ['rename', 'pin', 'move-out', 'archive', 'delete']);
  assert.match(markup, /<span>Unpin<\/span>/);
  assert.match(markup, /<span>Move out<\/span>/);
  assert.doesNotMatch(markup, /data-action="move-to"/);
  assert.match(markup, /<div class="menu-item delete" data-action="delete">/);
});

test('builds conversation mobile menu fallback labels for an unpinned root conversation', () => {
  const markup = buildConversationMobileContextMenuMarkup({
    title: 'General',
    folderId: null,
    pinned: false,
    text: {}
  });

  assert.deepEqual(getActions(markup), ['rename', 'pin', 'move-to', 'archive', 'delete']);
  assert.match(markup, /<span>釘選<\/span>/);
  assert.match(markup, /<span>移至資料夾<\/span>/);
  assert.match(markup, /<span>重新命名<\/span>/);
  assert.match(markup, /<span>封存<\/span>/);
  assert.match(markup, /<span>刪除<\/span>/);
});

test('builds folder mobile menu markup with expected action order', () => {
  const markup = buildFolderMobileContextMenuMarkup({
    name: 'Work',
    text: {
      rename: 'Rename folder',
      customize: 'Customize',
      deleteFolder: 'Delete folder'
    }
  });

  assert.match(markup, /^\n\s*<div class="menu-header">Work<\/div>/);
  assert.deepEqual(getActions(markup), ['rename-folder', 'customize-folder', 'delete-folder']);
  assert.match(markup, /<span>Customize<\/span>/);
  assert.match(markup, /<div class="menu-item delete" data-action="delete-folder">/);
});

test('builds Astra mobile menu markup for official and user-created Astras', () => {
  const officialMarkup = buildAstraMobileContextMenuMarkup({
    name: 'Official Astra',
    officialId: 'official-1',
    text: { editAvatar: 'Edit avatar', delete: 'Delete' }
  });
  const userMarkup = buildAstraMobileContextMenuMarkup({
    name: 'My Astra',
    officialId: null,
    text: { edit: 'Edit Astra', editAvatar: 'Edit avatar', delete: 'Delete' }
  });

  assert.match(officialMarkup, /^\n\s*<div class="menu-header">Official Astra<\/div>/);
  assert.deepEqual(getActions(officialMarkup), ['edit-avatar', 'delete-astras']);
  assert.doesNotMatch(officialMarkup, /data-action="edit-astras"/);

  assert.match(userMarkup, /^\n\s*<div class="menu-header">My Astra<\/div>/);
  assert.deepEqual(getActions(userMarkup), ['edit-astras', 'edit-avatar', 'delete-astras']);
  assert.match(userMarkup, /<span>Edit Astra<\/span>/);
});

test('mobile context menu markup helper has no runtime side-effect tokens', () => {
  const source = readSource('src/app/legacy-runtime/features/mobile-context-menu-markup.js');
  const sourceWithoutExportNames = source
    .replaceAll('buildConversationMobileContextMenuMarkup', '')
    .replaceAll('buildFolderMobileContextMenuMarkup', '')
    .replaceAll('buildAstraMobileContextMenuMarkup', '');
  const forbiddenTokens = [
    'document',
    'window',
    'globalThis',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'fetch',
    'addEventListener',
    'removeEventListener',
    'querySelector',
    'getElementById',
    'innerHTML',
    'classList',
    'Chart',
    'canvas',
    'getContext'
  ];

  for (const token of forbiddenTokens) {
    assert.equal(sourceWithoutExportNames.includes(token), false, `helper source should not include ${token}`);
  }
});
