import { createDecisionService } from './decision-client.js';
import { canModelUseCli, enabledCliTools } from '../cli/cli-state.js';

const hasFilePart = (message) => (message?.parts || []).some((part) => part?.inlineData || part?.sandboxFile);

/**
 * The questions put to the Decisions model for one message (decision-request.js loads this the first time it is needed). Only the command tools the
 * model may use by itself are put to the question (the ones chosen with "@" are always given).
 */
export function createAsk({ getApiKeyForProvider, getConfig, logger } = {}) {
  const decisionService = createDecisionService({ fetchImpl: (...args) => globalThis.fetch(...args), getApiKey: () => getApiKeyForProvider('openrouter'), logger });
  return ({ conversation, userMessage, uploadedFiles = [], signal } = {}) => {
    const config = getConfig();
    const messages = conversation?.messages || [];
    return decisionService.decide({
      message: userMessage,
      history: messages,
      tools: enabledCliTools(config).filter((tool) => canModelUseCli(config, tool.id)).map((tool) => ({ name: tool.name, description: tool.description?.en || '' })),
      hasAttachment: uploadedFiles.length > 0,
      conversationHasFile: messages.some(hasFilePart)
    }, { signal });
  };
}
