import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { createProjectCrumb } from '../src/app/ui/projects/project-crumb.js';
import { openMenu } from '../src/app/ui/projects/project-parts.js';
import { projectPlaceholder, setProjectPlaceholder } from '../src/app/runtime/projects/project-placeholder.js';

// A chat that belongs to a project says so under its header; the empty box says whom it writes to; the menu of the left list opens toward the middle of the screen as the other menus there do.

const wait = (ms = 70) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (key, values = {}) => (key === 'pjCrumb' ? `Chat in ${values.name}` : key);

test('the line under the header shows the project of the open chat, opens its page, and follows the chat', async () => {
  const window = new Window({ url: 'https://noureon.test/' });
  const { document } = window;
  document.body.innerHTML = '<main id="chat-workspace"><header>H</header><div id="chat-container"></div></main><div id="history-list"></div>';
  let project = { id: 'p1', name: 'Translation <b>x</b>', icon: 'book', color: 'blue' };
  const opened = [];
  const crumb = createProjectCrumb({ document, text, getProject: () => project, openProject: (id) => opened.push(id) });
  const node = document.getElementById('project-crumb');
  assert.equal(node.previousElementSibling.tagName, 'HEADER', 'it stands right under the header');
  assert.equal(node.hidden, false);
  assert.equal(node.querySelector('.pj-crumb-name').textContent, 'Translation <b>x</b>', 'the name is text');
  assert.equal(node.querySelector('b'), null);
  assert.equal(node.title, 'Chat in Translation <b>x</b>');
  node.click();
  assert.deepEqual(opened, ['p1']);
  // The chat changes to one outside any project.
  project = null;
  document.dispatchEvent(new window.CustomEvent('noureon:chat-changed'));
  await wait();
  assert.equal(node.hidden, true);
  // The project is renamed (the history is drawn again).
  project = { id: 'p1', name: 'Renamed', icon: 'book', color: 'blue' };
  document.getElementById('history-list').appendChild(document.createElement('div'));
  await wait();
  assert.equal(node.hidden, false);
  assert.equal(node.querySelector('.pj-crumb-name').textContent, 'Renamed');
  crumb.stop();
  assert.equal(document.getElementById('project-crumb'), null);
  await window.happyDOM.abort();
});

test('the placeholder of a chat of a project comes from the part for the projects, and a failure leaves the usual one', () => {
  setProjectPlaceholder(null);
  assert.equal(projectPlaceholder({ folderId: 'p1' }), null);
  setProjectPlaceholder((conversation) => (conversation.folderId ? 'Message Translation' : null));
  assert.equal(projectPlaceholder({ folderId: 'p1' }), 'Message Translation');
  assert.equal(projectPlaceholder({ folderId: null }), null);
  setProjectPlaceholder(() => { throw new Error('boom'); });
  assert.equal(projectPlaceholder({ folderId: 'p1' }), null);
  setProjectPlaceholder(null);
});

test('a menu of the left list opens from the left edge of its button (toward the middle), one of the page ends at the right edge of its button', async () => {
  const window = new Window({ url: 'https://noureon.test/' });
  const { document } = window;
  window.innerWidth = 1200;
  window.innerHeight = 800;
  document.body.innerHTML = '<div id="root"></div>';
  const anchor = document.createElement('button');
  anchor.getBoundingClientRect = () => ({ left: 239, right: 263, top: 100, bottom: 124 });
  document.body.appendChild(anchor);
  const items = [{ label: 'A', icon: 'pin', action() {} }];
  const start = openMenu({ document, root: document.body, anchor, items, align: 'start' });
  assert.equal(start.element.style.left, '239px');
  start.close();
  const end = openMenu({ document, root: document.body, anchor, items });
  assert.equal(Number.parseInt(end.element.style.left, 10) <= 263 - 1, true, 'its right edge is at the button\'s');
  end.close();
  await window.happyDOM.abort();
});

test('on a phone the header of the chat becomes the project\'s: a way back, the name with "Chat" under it, and no line under the header', async () => {
  const window = new Window({ url: 'https://noureon.test/' });
  const { document } = window;
  window.matchMedia = (query) => ({ matches: /max-width: 767px/.test(query), media: query, addEventListener() {}, removeEventListener() {} });
  document.body.innerHTML = '<main id="chat-workspace"><header><div id="left"><button id="menu-toggle-btn"></button><button id="new-chat-btn-header"></button></div></header></main>';
  let project = { id: 'p1', name: 'Translation', icon: 'book', color: 'blue' };
  const opened = [];
  const crumb = createProjectCrumb({ document, text: (key, values = {}) => (key === 'pjHeadSub' ? 'Chat' : key === 'pjCrumb' ? `Chat in ${values.name}` : key), getProject: () => project, openProject: (id) => opened.push(id) });
  const header = document.querySelector('#chat-workspace > header');
  assert.equal(header.classList.contains('pj-in-project'), true);
  assert.equal(document.getElementById('project-crumb').hidden, true, 'the line is for a computer');
  assert.equal(document.querySelector('#left').firstElementChild.id, 'project-head-back', 'the way back is first');
  assert.equal(document.getElementById('project-head-back').className.includes('rounded'), true, 'it is a plain icon like the other buttons of the header');
  assert.equal(document.querySelector('.pj-head-name').textContent, 'Translation');
  assert.equal(document.querySelector('.pj-head-sub').textContent, 'Chat');
  document.getElementById('project-head-back').click();
  document.getElementById('project-head-title').click();
  assert.deepEqual(opened, ['p1', 'p1']);
  project = null;
  crumb.update();
  assert.equal(header.classList.contains('pj-in-project'), false);
  assert.equal(document.getElementById('project-head-back'), null);
  assert.equal(document.getElementById('project-head-title'), null);
  crumb.stop();
  await window.happyDOM.abort();
});
