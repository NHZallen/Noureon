import {
  getChartAuthoringGuidance,
  getChartGuidanceMode,
  getChartTypeSpecificGuidance,
  getCompactChartGuidance
} from './chart-selection-policy.js';

export {
  getChartAuthoringGuidance,
  getChartGuidanceMode,
  getChartTypeSpecificGuidance,
  getCompactChartGuidance
};

// Backward-compatible compact export for tests or callers that still import the
// legacy constant directly. Runtime prompt injection should call
// getChartAuthoringGuidance(inputText) instead.
export const CHART_AUTHORING_GUIDANCE = getCompactChartGuidance();
