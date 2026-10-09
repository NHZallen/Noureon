// The official skills (技能): the ones the owner puts in the Extensions page (docs/superpowers/specs/2026-10-09-skills-design.md). They are part of the app (no
// database), so they travel with a release. The list is only what the page needs to show it; the text of each skill is in skill-catalog-bodies.js, which the page
// loads when a skill is used or its details are opened (and which the server reads), so the text of every skill is not in the part of the page every visit loads.
//
// An entry: { name, description, version, author, i18n?: { '<language>': { title, description } } } with the same rules as a pasted skill (skill-format.js):
// name and description are what the model is given, whatever language the page is in; `i18n` is only how the page shows it. An entry may carry its `body` itself
// (the tests do); the ones of the app have it in skill-catalog-bodies.js.

import { SKILL_BODY_MAX, SKILL_DESCRIPTION_MAX, isSkillName } from './skill-format.js';

// A plain list (the tests put an entry in it and take it out again); entries are added here by the owner and not changed while the app runs.
export const OFFICIAL_SKILL_CATALOG = [
  {
    name: 'skill-creator',
    description: 'Helps the user create a new skill or improve one. Use whenever the user wants to make a skill, turn what they just did or a workflow into a reusable skill, write a SKILL.md, or fix a skill that does not trigger or work well.',
    version: '1',
    author: 'Noureon',
    i18n: {
      'zh-TW': { title: '製作技能', description: '和你一起把做法整理成技能：問清楚用途、寫草稿、試做、修改，最後讓你看過全文再加入。' },
      en: { title: 'Make a skill', description: 'Works with you to turn a way of doing something into a skill: finds out what it is for, drafts it, tries it, improves it, and lets you read it all before you add it.' },
      fr: { title: 'Créer une compétence', description: 'Vous aide à transformer une façon de faire en compétence : comprend à quoi elle sert, rédige un brouillon, l’essaie, l’améliore, et vous laisse tout lire avant de l’ajouter.' },
      ru: { title: 'Создать навык', description: 'Помогает превратить ваш способ работы в навык: выясняет, для чего он нужен, пишет черновик, пробует его, улучшает и даёт прочесть всё перед добавлением.' },
      es: { title: 'Crear una habilidad', description: 'Te ayuda a convertir una forma de hacer algo en una habilidad: averigua para qué sirve, redacta un borrador, lo prueba, lo mejora y te deja leerlo todo antes de añadirlo.' }
    }
  },
  {
    name: 'meeting-notes',
    description: 'Turns raw meeting notes or a transcript into a clear record: summary, decisions, action items with owners and dates, open questions, and an optional follow-up message. Use whenever the user pastes notes from a meeting, call, interview or workshop, or asks for minutes, a recap or action items.',
    version: '1',
    author: 'Noureon',
    i18n: {
      'zh-TW': { title: '會議記錄', description: '把雜亂的會議筆記或逐字稿整理成摘要、決議、待辦事項（含負責人與期限）和待解問題。' },
      en: { title: 'Meeting notes', description: 'Turn messy notes or a transcript into a summary, decisions, action items with owners and dates, and open questions.' },
      fr: { title: 'Compte rendu de réunion', description: 'Transforme des notes brutes ou une transcription en résumé, décisions, actions (responsable, échéance) et questions ouvertes.' },
      ru: { title: 'Протокол встречи', description: 'Превращает черновые заметки или расшифровку в итоги, решения, задачи с исполнителями и сроками и открытые вопросы.' },
      es: { title: 'Acta de reunión', description: 'Convierte notas desordenadas o una transcripción en resumen, decisiones, tareas con responsable y fecha, y preguntas abiertas.' }
    }
  },
  {
    name: 'proofread',
    description: 'Proofreads and polishes the wording of a text in any language without changing its meaning or voice: fixes spelling, grammar and punctuation, and lists the changes. Use whenever the user pastes text and asks to proofread, correct or polish its language, or asks if the wording or grammar is right.',
    version: '1',
    author: 'Noureon',
    i18n: {
      'zh-TW': { title: '校對', description: '修正文字的拼字、文法、標點與用詞，不改原意和語氣，並列出改了什麼。' },
      en: { title: 'Proofread', description: 'Fix spelling, grammar, punctuation and wording without changing the meaning or voice, and see what changed.' },
      fr: { title: 'Relecture', description: 'Corrige l’orthographe, la grammaire, la ponctuation et les tournures sans changer le sens ni le ton, et montre ce qui a changé.' },
      ru: { title: 'Вычитка', description: 'Исправляет орфографию, грамматику, пунктуацию и формулировки, не меняя смысла и стиля, и показывает, что изменилось.' },
      es: { title: 'Corrección', description: 'Corrige ortografía, gramática, puntuación y redacción sin cambiar el sentido ni el tono, y muestra qué ha cambiado.' }
    }
  },
  {
    name: 'fact-check',
    description: 'Checks the factual claims in a text in any language: one verdict per claim (supported, partly true, contradicted, outdated, cannot verify) with evidence and source, and says what was not checked. Use whenever the user asks to fact-check or verify something, or if a claim, number or date is true.',
    version: '1',
    author: 'Noureon',
    i18n: {
      'zh-TW': { title: '事實查核', description: '逐項查證文字裡的事實主張，給出判定、證據與來源，並說明哪些沒查、哪些無法查證。' },
      en: { title: 'Fact-check', description: 'Check each factual claim in a text, with a verdict, the evidence and the source, and say what was not checked or could not be verified.' },
      fr: { title: 'Vérification des faits', description: 'Vérifie chaque affirmation factuelle d’un texte, avec un verdict, les preuves et la source, et indique ce qui n’a pas été vérifié ou ne peut pas l’être.' },
      ru: { title: 'Проверка фактов', description: 'Проверяет каждое фактическое утверждение в тексте: вердикт, доказательства и источник, а также что не проверено или не поддаётся проверке.' },
      es: { title: 'Verificación de datos', description: 'Comprueba cada afirmación factual de un texto, con un veredicto, las pruebas y la fuente, e indica qué no se comprobó o no se pudo verificar.' }
    }
  },
  {
    name: 'storyline',
    description: 'Plans a presentation storyline in any language: audience and goal, one key message, and a slide-by-slide outline with titles that make the point, the evidence each slide needs, and timing. Use whenever the user wants a deck, pitch or talk outline, or help structuring what to say on slides.',
    version: '1',
    author: 'Noureon',
    i18n: {
      'zh-TW': { title: '簡報大綱', description: '把主題或筆記整理成簡報的故事線：聽眾與目標、一句主訊息，以及逐頁大綱（標題講重點、每頁需要的證據、時間）。' },
      en: { title: 'Presentation storyline', description: 'Turn a topic or notes into the story of a presentation: audience and goal, one key message, and a slide-by-slide outline with the evidence and timing.' },
      fr: { title: 'Plan de présentation', description: 'Transforme un sujet ou des notes en fil conducteur : public et objectif, un message clé, et un plan diapo par diapo avec les preuves et le temps.' },
      ru: { title: 'Структура презентации', description: 'Превращает тему или заметки в сюжет презентации: аудитория и цель, главная мысль и план по слайдам с доказательствами и временем.' },
      es: { title: 'Guion de presentación', description: 'Convierte un tema o unas notas en el hilo de una presentación: público y objetivo, un mensaje clave y un esquema diapositiva a diapositiva con pruebas y tiempos.' }
    }
  }
];

const byName = () => new Map(OFFICIAL_SKILL_CATALOG.map((skill) => [skill.name, skill]));

export const getOfficialSkill = (name) => byName().get(String(name || '')) || null;
export const isOfficialSkillName = (name) => byName().has(String(name || ''));

/** What the page calls a skill, in a language: the title of the entry when it has one, else its name. */
export const skillTitle = (skill, language) => skill?.i18n?.[language]?.title || skill?.i18n?.en?.title || skill?.name || '';
/** What the page tells about a skill, in a language: the entry's own words for it when it has them, else its description. */
export const skillDescription = (skill, language) => skill?.i18n?.[language]?.description || skill?.i18n?.en?.description || skill?.description || '';

/** The text of an official skill when the entry carries it (the tests); the text of the ones of the app is in skill-catalog-bodies.js. */
export const inlineSkillBody = (skill) => (typeof skill?.body === 'string' && skill.body ? skill.body : '');

/** The text of an official skill, loaded when it is needed (a separate file of the page): the entry's own text, else the one of skill-catalog-bodies.js; '' when there is none. */
export async function loadOfficialSkillBody(name) {
  const entry = getOfficialSkill(name);
  if (!entry) return '';
  if (inlineSkillBody(entry)) return entry.body;
  const { OFFICIAL_SKILL_BODIES } = await import('./skill-catalog-bodies.js');
  return OFFICIAL_SKILL_BODIES[name] || '';
}

/** Whether an entry follows the rules (the tests run every entry through this, with its text from skill-catalog-bodies.js when it has none of its own). */
export function validateSkillEntry(skill) {
  const problems = [];
  if (!skill || typeof skill !== 'object') return ['not an object'];
  if (!isSkillName(skill.name)) problems.push('name');
  if (typeof skill.description !== 'string' || !skill.description.trim() || skill.description.length > SKILL_DESCRIPTION_MAX) problems.push('description');
  if (typeof skill.body !== 'string' || !skill.body.trim() || skill.body.length > SKILL_BODY_MAX) problems.push('body');
  if (typeof skill.version !== 'string' || !skill.version) problems.push('version');
  return problems;
}
