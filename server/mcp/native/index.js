// The clients of native connectors (a connector of the catalog with `native: '<provider>'`): they have the same shape as the client of an MCP server (server/mcp/client.js:
// `listTools`, `callTool`, `close`), so that the login, the list of tools, the permissions and the loops of the replies treat both the same. The tools are our own code, so
// their text is trusted (a change in it is not a service changing its tools: see `refreshTools` in server/mcp/connections.js), but what a service returns is data as ever.

import { ToolFailure, createApi, DEFAULT_API_TIMEOUT_MS } from './api.js';
import { googleProvider } from './google/index.js';

export const PROVIDERS = Object.freeze({ google: googleProvider });
const MAX_RESULT_CHARS = 80_000;

/** The names of the tools a provider has (for the tests and the catalog check). */
export const nativeToolNames = (providerId) => (PROVIDERS[providerId]?.tools || []).map((tool) => tool.name);

export function createNativeClient(providerId, { getToken, onUnauthorized = async () => null, fetchImpl = fetch, timeoutMs = DEFAULT_API_TIMEOUT_MS }) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error(`There is no native connector "${providerId}".`);
  const byName = new Map(provider.tools.map((tool) => [tool.name, tool]));
  return {
    async listTools() {
      return provider.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
    },
    async callTool(name, args, { signal } = {}) {
      const tool = byName.get(name);
      if (!tool) return { text: `There is no tool called ${name}.`, isError: true, images: 0 };
      const call = createApi({ hosts: provider.hosts, getToken, onUnauthorized, fetchImpl, timeoutMs, signal, explain: provider.explain });
      try {
        const result = await tool.run(args && typeof args === 'object' && !Array.isArray(args) ? args : {}, call);
        const text = typeof result === 'string' ? result : JSON.stringify(result ?? {});
        return { text: text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n[cut]` : text, isError: false, images: 0 };
      } catch (error) {
        // A call that Google refused or an input that is not right is the tool's result; a login that is not good (McpError) goes up as with any connector.
        if (error instanceof ToolFailure) return { text: error.message, isError: true, images: 0 };
        throw error;
      }
    },
    async close() {}
  };
}
