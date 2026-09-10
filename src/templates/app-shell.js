import fragment00 from './fragments/00-shell.fragment.js';
import fragment01 from './fragments/01-shell.fragment.js';
import fragment02 from './fragments/02-shell.fragment.js';
import fragment03 from './fragments/03-shell.fragment.js';
import fragment04 from './fragments/04-shell.fragment.js';
import fragment05 from './fragments/05-shell.fragment.js';
import fragment06 from './fragments/06-shell.fragment.js';
import fragment07 from './fragments/07-shell.fragment.js';

const appShellWithLegacyDemo = [
  fragment00,
  fragment01,
  fragment02,
  fragment03,
  fragment04,
  fragment05,
  fragment06,
  fragment07
].join('');

const appShellWithoutLegacyDemo = appShellWithLegacyDemo.replace(
  /\s*<section class="py-20 lg:py-24 bg-gray-50">[\s\S]*?<div id="demo-chat-window"[\s\S]*?<\/section>/,
  ''
);

const appShell = appShellWithoutLegacyDemo.replace(
  /\s*<button(?=[^>]*\bid="expand-input-btn")[\s\S]*?<\/button>/,
  ''
).replace(
  '<p class="mt-1"><a href="mailto:support@noureon.com" class="text-blue-600 hover:underline">support@noureon.com</a></p>',
  '<p class="mt-1"><a href="mailto:support@noureon.com" class="text-blue-600 hover:underline">support@noureon.com</a></p>\n                    <p class="mt-1"><a href="https://github.com/NHZallen/Noureon" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">GitHub</a></p>'
).replace(
  '<p class="text-sm text-[var(--text-secondary)] mb-2"><a href="mailto:support@noureon.com" class="text-blue-600 hover:underline">support@noureon.com</a></p>',
  '<p class="text-sm text-[var(--text-secondary)] mb-2"><a href="mailto:support@noureon.com" class="text-blue-600 hover:underline">support@noureon.com</a></p>\n                        <p class="text-sm text-[var(--text-secondary)] mb-4"><a href="https://github.com/NHZallen/Noureon" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">GitHub</a></p>'
);

export default appShell;
