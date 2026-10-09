// What a model is told about the files of a skill it has (docs/superpowers/specs/2026-10-09-skills-design.md, §14.3). Its own small module: the text of a skill asked for with "/"
// (skill-prompt.js) needs it on the page at once, while the loader that answers the model's calls (skill-tool.js) is only loaded when a reply has skills to offer.

/** Files told about for one skill. */
export const MAX_LISTED_FILES = 60;

/**
 * What the model is told about the files of a skill it has (an empty text when there are none). `canRun`: true when the reply has the sandbox with the skill's
 * folder in it, false when it cannot run scripts, null when that is not known yet (the text of a skill asked for with "/" is written before the reply is).
 */
export function skillFilesNote(name, files, canRun) {
  const list = Array.isArray(files) ? files.filter((file) => file && typeof file.path === 'string' && file.path) : [];
  if (!list.length) return '';
  const lines = list.slice(0, MAX_LISTED_FILES).map((file) => `- ${file.path} (${file.kind === 'script' ? 'script' : file.kind === 'binary' ? 'not text' : 'text'}, ${Number(file.size) || 0} bytes)`);
  const hasText = list.some((file) => file.kind !== 'binary');
  const hasScript = list.some((file) => file.kind === 'script');
  const how = [
    hasText ? 'Read a text file with read_skill_file (the skill name and the path as listed) when the instructions above point to it; do not read files you do not need.' : '',
    hasScript ? (canRun === true
      ? `The scripts are in the sandbox, read only, in /skills/${name}/: run one with run_command or from Python (for example python /skills/${name}/scripts/x.py), and never change them.`
      : canRun === null
        ? `The scripts can only be run in the Python sandbox on the server, where the skill's folder is /skills/${name}/ (read only) when that sandbox is in use: run one with run_command or from Python. In a reply without that sandbox you may read them as text, and if the task needs one to be run, tell the user briefly.`
        : 'The scripts cannot be run in this reply (they run in the Python sandbox on the server). You may read them as text; if the task needs one to be run, tell the user briefly.') : ''
  ].filter(Boolean);
  return `\nThis skill has ${list.length} file${list.length === 1 ? '' : 's'}:\n${lines.join('\n')}${list.length > MAX_LISTED_FILES ? `\n(and ${list.length - MAX_LISTED_FILES} more)` : ''}\n${how.join('\n')}`;
}
