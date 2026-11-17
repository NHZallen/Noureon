// The work list of the browser agent for one reply (design: docs/superpowers/specs/2026-11-16-browser-agent-design.md, section 17): the tasks in the order they are done. The model
// may change what is still to do as the work goes on or the person steers it, but a task that is done is never changed, moved out or taken back. The list belongs to one reply: the
// next reply of the conversation starts with an empty one (nothing is carried over; this object lives as long as the loader of the reply).

export const PLAN_STATES = ['todo', 'doing', 'done'];
export const MAX_PLAN_TASKS = 12;
export const MAX_TASK_CHARS = 120;

const oneLine = (value, limit) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

/** What the model gave as a task: a text, or { text, status }. Anything else is left out. */
function readTasks(input) {
  const out = [];
  for (const entry of Array.isArray(input) ? input : []) {
    const text = oneLine(typeof entry === 'string' ? entry : entry?.text, MAX_TASK_CHARS);
    if (!text) continue;
    const status = typeof entry === 'object' && PLAN_STATES.includes(entry?.status) ? entry.status : 'todo';
    out.push({ text, status });
  }
  return out;
}

export function createBrowserPlan() {
  let tasks = [];
  return {
    get tasks() { return tasks.map((task) => ({ ...task })); },
    /**
     * `incoming` is the whole list as the model wants it now. Done tasks are the server's: one that the model left out or reworded comes back where it was, one that it marked
     * "todo" stays done. Only what is not done follows the model. Returns { tasks, kept } where `kept` counts the done tasks that were put back or kept as they were.
     */
    update(incoming) {
      const wanted = readTasks(incoming);
      const finished = tasks.map((task, index) => ({ task, index })).filter((item) => item.task.status === 'done');
      const used = new Set();
      const next = [];
      let kept = 0;
      for (const item of wanted) {
        const match = finished.find((done) => !used.has(done) && same(done.task.text, item.text));
        if (match) { used.add(match); next.push({ ...match.task }); continue; }
        next.push(item);
      }
      // A finished task the model forgot is put back at its place (or at the end when the list is shorter now).
      for (const done of finished) {
        if (used.has(done)) continue;
        next.splice(Math.min(done.index, next.length), 0, { ...done.task });
        kept += 1;
      }
      kept += used.size;
      // Only one task is in hand at a time: the first one the model said it is working on, the first one after the done ones when it said none.
      let doing = false;
      for (const task of next) {
        if (task.status !== 'doing') continue;
        if (doing) task.status = 'todo'; else doing = true;
      }
      // Too long: what is not done is cut from the end (done tasks stay).
      while (next.length > MAX_PLAN_TASKS) {
        const last = next.findLastIndex((task) => task.status !== 'done');
        if (last < 0) break;
        next.splice(last, 1);
      }
      tasks = next;
      return { tasks: this.tasks, kept };
    }
  };
}

/** The list as it is told back to the model. */
export function planText(tasks, { kept = 0 } = {}) {
  if (!tasks.length) return 'The work list is empty.';
  const mark = { done: '[done]', doing: '[doing]', todo: '[to do]' };
  const lines = tasks.map((task, index) => `${index + 1}. ${mark[task.status]} ${task.text}`);
  return `The work list now (a task that is done cannot be changed; call browser_plan again to change what is still to do or to mark tasks):${kept ? `\n(${kept} done ${kept === 1 ? 'task is' : 'tasks are'} kept as they were.)` : ''}\n${lines.join('\n')}`;
}
