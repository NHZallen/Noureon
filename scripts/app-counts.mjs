// The numbers of the application that the home page and the documents write in their words (how many models, how many vendors): worked out from the
// registries, the one place they are true. Used by tests/home-page.test.js (it checks the words against them) and by scripts/sync-counts.mjs (which
// writes them into the words).

export async function computeAppCounts() {
  const registry = await import('../src/app/runtime/legacy-core/model-registry.js');
  const groups = await import('../src/app/ui/model-picker/model-picker-groups.js');
  const modelRegistry = registry.createLegacyModelRegistry({ getConfig: () => ({}) });
  const vendors = new Set(registry.MODELS.map((model) => groups.getCompanyLabel(groups.getModelCompany(model, modelRegistry.getModelApiId(model)))));
  const { DESIGN_PRESET_IDS } = await import('../src/app/ui/files/design/design-presets.js');
  const { DOCUMENT_PRESET_IDS } = await import('../src/app/ui/files/design/document-presets.js');
  const { OFFICIAL_CLI_CATALOG } = await import('../src/data/cli-catalog.js');
  const { OFFICIAL_SKILL_CATALOG } = await import('../src/data/skill-catalog.js');
  return {
    models: registry.MODELS.length,
    vendors: vendors.size,
    councilMin: registry.COUNCIL_MIN_MODELS,
    councilMax: registry.COUNCIL_MAX_MODELS,
    deckDesigns: DESIGN_PRESET_IDS.length,
    documentStyles: DOCUMENT_PRESET_IDS.length,
    skills: OFFICIAL_SKILL_CATALOG.length,
    cliTools: OFFICIAL_CLI_CATALOG.length
  };
}
