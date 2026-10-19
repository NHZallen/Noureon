// What each member of a council did (docs/superpowers/specs/2026-10-19-council-tools-design.md, §2.3), for the timeline: the counts of each kind of step and
// the newest steps. Kept apart from the members' own loop (council-member-reply.js), which is loaded only when a council is held.

// The steps of a member kept for the progress panel (the newest; the counts go on).
const MAX_STEPS_KEPT = 30;

/** What a member did, for the progress panel: the counts of each kind and the newest steps. */
export function createMemberSteps() {
  const counts = { search: 0, page: 0, skill: 0, connector: 0 };
  let steps = [];
  return {
    add(step) {
      if (!step || !(step.kind in counts)) return;
      counts[step.kind] += 1;
      steps = [...steps, { kind: step.kind, label: String(step.label || '').slice(0, 160) }].slice(-MAX_STEPS_KEPT);
    },
    view: () => ({ counts: { ...counts }, steps: steps.map((step) => ({ ...step })) })
  };
}
