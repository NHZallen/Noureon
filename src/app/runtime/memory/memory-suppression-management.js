const asArray = value => Array.isArray(value) ? value : [];

const normalizeInstruction = value => String(value || '').trim();

export function addCustomSuppressionRule(memoryState = {}, {
  id,
  instruction,
  now = new Date().toISOString()
} = {}) {
  if (!id) throw new TypeError('Suppression rules require an id.');
  const normalizedInstruction = normalizeInstruction(instruction);
  if (!normalizedInstruction) throw new TypeError('Suppression rules require a non-empty instruction.');

  return {
    ...memoryState,
    suppressionRules: [
      ...asArray(memoryState.suppressionRules),
      {
        id,
        type: 'custom-instruction',
        target: 'memory-context',
        instruction: normalizedInstruction,
        scope: 'all-chat',
        createdAt: now,
        updatedAt: now
      }
    ]
  };
}

export function updateSuppressionRule(memoryState = {}, {
  ruleId,
  instruction,
  now = new Date().toISOString()
} = {}) {
  if (!ruleId) throw new TypeError('Updating a suppression rule requires an id.');
  const normalizedInstruction = normalizeInstruction(instruction);
  if (!normalizedInstruction) throw new TypeError('Suppression rules require a non-empty instruction.');
  let found = false;
  const suppressionRules = asArray(memoryState.suppressionRules).map(rule => {
    if (rule?.id !== ruleId) return rule;
    found = true;
    return { ...rule, instruction: normalizedInstruction, updatedAt: now };
  });
  if (!found) throw new TypeError('Suppression rule was not found.');
  return { ...memoryState, suppressionRules };
}

export function removeSuppressionRule(memoryState = {}, { ruleId } = {}) {
  if (!ruleId) throw new TypeError('Removing a suppression rule requires an id.');
  return {
    ...memoryState,
    suppressionRules: asArray(memoryState.suppressionRules)
      .filter(rule => rule?.id !== ruleId)
  };
}
