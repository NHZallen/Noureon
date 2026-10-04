// What the model is shown of a deep research that is in the conversation: the whole report with the list of its sources (so it can answer
// about it and improve it), and a line for a research that did not end in one. Stored messages are never changed.

const sourcesList = (sources) => (Array.isArray(sources) ? sources : [])
  .filter((source) => source?.url && Number(source.n) > 0)
  .map((source) => `[${source.n}] ${source.title || source.site || source.url} — ${source.url}`)
  .join('\n');

export function researchPartForApi(part) {
  const report = part?.researchReport;
  if (report) {
    const list = sourcesList(report.sources);
    return { text: `[Deep research report "${report.title || ''}" (the numbers in square brackets are its sources)]\n\n${report.text || ''}${list ? `\n\nSources:\n${list}` : ''}` };
  }
  const plan = part?.researchPlan;
  if (plan) {
    const ended = plan.phase === 'failed' || plan.phase === 'stopped';
    return { text: `[A deep research on "${plan.topic || plan.title || ''}" ${ended ? 'was started but did not end in a report' : 'is still in progress'}.]` };
  }
  return part;
}

export function researchReportsForApi(history = []) {
  if (!Array.isArray(history)) return history;
  return history.map((message) => {
    if (message?.role !== 'model' && message?.role !== 'assistant') return message;
    const parts = Array.isArray(message.parts) ? message.parts : [];
    if (!parts.some((part) => part?.researchReport || part?.researchPlan)) return message;
    return { ...message, parts: parts.map(researchPartForApi) };
  });
}
