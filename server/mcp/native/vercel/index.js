// The Vercel provider of the native connectors: Vercel's own REST API (https://vercel.com/docs/rest-api) with a token that the person made and pasted (a connector with
// `tokenLogin`; docs/superpowers/specs/2026-11-14-connector-token-login-design.md). Vercel's MCP server is not used: it takes only the clients Vercel has approved.
// What a tool does is written here. What the service returns is data; a value of an environment variable is never read out (only its name, kind and where it applies).

import { McpError } from '../../client.js';
import { ToolFailure } from '../api.js';
import { enumArg, fit, idArg, idPart, intArg, textArg } from '../inputs.js';

const BASE = 'https://api.vercel.com';
const MAX_LOG_LINE_CHARS = 600;

/** In a few plain words, why Vercel refused a call (its own shape of error: { error: { code, message } }). */
export function explain(status, text) {
  let error = null;
  try {
    error = JSON.parse(text)?.error || null;
  } catch {
    error = null;
  }
  const code = String(error?.code || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
  const message = String(error?.message || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (status === 403) return `The token does not allow this${message ? ` (${message})` : ''}: it may be for another team or have too small a scope. The user can make a new token and paste it again in the settings of the Vercel connector.`;
  if (status === 404) return `Not found${message ? `: ${message}` : ''}. Check the id, and the team (\`team_id\`) it belongs to.`;
  if (status === 429) return 'Vercel says there are too many requests: try again in a moment.';
  return `Vercel answered ${status}${code ? ` (${code})` : ''}${message ? `: ${message}` : ''}.`;
}

/**
 * Tries a pasted token once, before it is kept: Vercel's own address for "who is this" answers with the account. Throws an McpError('unauthorized') when Vercel does not take the
 * token, an McpError('unreachable') when it cannot be asked. Returns { account } (the username, for the log of what was connected; never the token).
 */
export async function verifyToken(token, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(`${BASE}/v2/user`, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  } catch {
    throw new McpError('unreachable', 'Vercel could not be reached.');
  }
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel?.().catch(() => {});
    throw new McpError('unauthorized', 'Vercel did not accept the token.', { status: response.status });
  }
  if (!response.ok) {
    await response.body?.cancel?.().catch(() => {});
    throw new McpError('unreachable', `Vercel answered ${response.status}.`, { status: response.status });
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const user = body?.user || body || {};
  return { account: String(user.username || user.name || '').replace(/[^A-Za-z0-9 _.@-]/g, '').slice(0, 80) };
}

const teamArg = (args) => idArg(args, 'team_id', { required: false });
const withTeam = (args, query = {}) => ({ ...query, teamId: teamArg(args) });
const stamp = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? new Date(Number(value)).toISOString() : undefined);
const TEAM_ARG = { type: 'string', description: 'The id of the team (from vercel_list_teams); leave it out for the personal account (or the default team of the token).' };

const shapeProject = (project) => ({
  id: project.id,
  name: project.name,
  ...(project.framework ? { framework: project.framework } : {}),
  ...(project.link?.repo ? { repo: `${project.link.org ? `${project.link.org}/` : ''}${project.link.repo}`, git: project.link.type } : {}),
  ...(project.link?.productionBranch ? { production_branch: project.link.productionBranch } : {}),
  ...(stamp(project.updatedAt) ? { updated: stamp(project.updatedAt) } : {}),
  ...(project.latestDeployments?.[0]?.url ? { latest_url: project.latestDeployments[0].url, latest_state: project.latestDeployments[0].readyState || project.latestDeployments[0].state } : {})
});

const shapeDeployment = (deployment) => ({
  id: deployment.uid || deployment.id,
  name: deployment.name,
  url: deployment.url,
  state: deployment.state || deployment.readyState,
  ...(deployment.target ? { target: deployment.target } : {}),
  ...(stamp(deployment.created || deployment.createdAt) ? { created: stamp(deployment.created || deployment.createdAt) } : {}),
  ...(deployment.creator?.username ? { creator: deployment.creator.username } : {}),
  ...(deployment.meta?.githubCommitRef || deployment.meta?.gitlabCommitRef ? { branch: deployment.meta.githubCommitRef || deployment.meta.gitlabCommitRef } : {}),
  ...(deployment.meta?.githubCommitMessage || deployment.meta?.gitlabCommitMessage ? { commit_message: String(deployment.meta.githubCommitMessage || deployment.meta.gitlabCommitMessage).split('\n')[0].slice(0, 200) } : {})
});

export const vercelTools = [
  {
    name: 'vercel_list_teams',
    description: 'List the teams the token belongs to (id, slug, name). Use the id as `team_id` in the other tools for a project that belongs to a team.',
    inputSchema: { type: 'object', properties: {} },
    async run(_args, call) {
      const data = await call('GET', `${BASE}/v2/teams`, { query: { limit: 100 } });
      return (data?.teams || []).map((team) => ({ id: team.id, slug: team.slug, name: team.name }));
    }
  },
  {
    name: 'vercel_list_projects',
    description: 'List the projects, the most recently updated first, with their framework, repository and latest deployment.',
    inputSchema: { type: 'object', properties: { team_id: TEAM_ARG, search: { type: 'string', description: 'Only projects whose name contains this.' }, max_results: { type: 'integer', description: '1 to 100, default 20.' } } },
    async run(args, call) {
      const data = await call('GET', `${BASE}/v10/projects`, { query: withTeam(args, { limit: intArg(args, 'max_results', { max: 100, fallback: 20 }), search: textArg(args, 'search', { max: 100 }) }) });
      return (data?.projects || []).map(shapeProject);
    }
  },
  {
    name: 'vercel_get_project',
    description: 'Get one project: its framework, build settings, repository and production branch.',
    inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'The id or the name of the project.' }, team_id: TEAM_ARG }, required: ['project'] },
    async run(args, call) {
      const project = await call('GET', `${BASE}/v9/projects/${idPart(idArg(args, 'project'))}`, { query: withTeam(args) });
      return {
        ...shapeProject(project),
        ...(project.nodeVersion ? { node_version: project.nodeVersion } : {}),
        ...(project.buildCommand ? { build_command: project.buildCommand } : {}),
        ...(project.installCommand ? { install_command: project.installCommand } : {}),
        ...(project.outputDirectory ? { output_directory: project.outputDirectory } : {}),
        ...(project.rootDirectory ? { root_directory: project.rootDirectory } : {})
      };
    }
  },
  {
    name: 'vercel_list_deployments',
    description: 'List deployments, the newest first: their state (BUILDING, ERROR, READY, QUEUED, CANCELED...), address, branch and commit message. Filter by project, target (production or preview) or state.',
    inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'The id or the name of a project.' }, team_id: TEAM_ARG, target: { type: 'string', enum: ['production', 'preview'] }, state: { type: 'string', description: 'For example ERROR or READY.' }, max_results: { type: 'integer', description: '1 to 100, default 20.' } } },
    async run(args, call) {
      const state = textArg(args, 'state', { max: 40 }).toUpperCase();
      if (state && !/^[A-Z_,]+$/.test(state)) throw new ToolFailure('"state" must be a state name such as ERROR or READY.');
      const data = await call('GET', `${BASE}/v7/deployments`, {
        query: withTeam(args, { projectId: idArg(args, 'project', { required: false }), target: enumArg(args, 'target', ['production', 'preview'], undefined), state, limit: intArg(args, 'max_results', { max: 100, fallback: 20 }) })
      });
      return (data?.deployments || []).map(shapeDeployment);
    }
  },
  {
    name: 'vercel_get_deployment',
    description: 'Get one deployment: its state, address, the aliases (domains) it answers on, the branch and commit, and the error when the build failed.',
    inputSchema: { type: 'object', properties: { deployment: { type: 'string', description: 'The id (dpl_...) or the address of the deployment.' }, team_id: TEAM_ARG }, required: ['deployment'] },
    async run(args, call) {
      const deployment = await call('GET', `${BASE}/v13/deployments/${idPart(idArg(args, 'deployment'))}`, { query: withTeam(args) });
      return {
        ...shapeDeployment(deployment),
        ...(Array.isArray(deployment.alias) && deployment.alias.length ? { aliases: deployment.alias.slice(0, 20) } : {}),
        ...(deployment.errorMessage ? { error: String(deployment.errorMessage).slice(0, 500) } : {}),
        ...(deployment.errorCode ? { error_code: String(deployment.errorCode).slice(0, 80) } : {}),
        ...(stamp(deployment.ready) ? { ready: stamp(deployment.ready) } : {})
      };
    }
  },
  {
    name: 'vercel_get_build_logs',
    description: 'Read the build log of a deployment (the last lines by default), to see why a build failed. Each line has its time and text.',
    inputSchema: { type: 'object', properties: { deployment: { type: 'string', description: 'The id (dpl_...) or the address of the deployment.' }, team_id: TEAM_ARG, max_lines: { type: 'integer', description: '1 to 300, default 100 (the last ones).' } }, required: ['deployment'] },
    async run(args, call) {
      const events = await call('GET', `${BASE}/v3/deployments/${idPart(idArg(args, 'deployment'))}/events`, { query: withTeam(args, { builds: 1, direction: 'backward', limit: intArg(args, 'max_lines', { max: 300, fallback: 100 }) }) });
      const lines = (Array.isArray(events) ? events : [])
        .map((event) => ({ at: stamp(event.created || event.payload?.date), text: String(event.text ?? event.payload?.text ?? '').slice(0, MAX_LOG_LINE_CHARS) }))
        .filter((line) => line.text)
        .reverse();
      return fit(lines.map((line) => `${line.at || ''} ${line.text}`.trim()).join('\n') || '(no lines)');
    }
  },
  {
    name: 'vercel_list_project_domains',
    description: 'List the domains of a project and whether each is verified, and where it redirects.',
    inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'The id or the name of the project.' }, team_id: TEAM_ARG }, required: ['project'] },
    async run(args, call) {
      const data = await call('GET', `${BASE}/v9/projects/${idPart(idArg(args, 'project'))}/domains`, { query: withTeam(args, { limit: 100 }) });
      return (data?.domains || []).map((domain) => ({ name: domain.name, verified: Boolean(domain.verified), ...(domain.redirect ? { redirect_to: domain.redirect } : {}), ...(domain.gitBranch ? { branch: domain.gitBranch } : {}) }));
    }
  },
  {
    name: 'vercel_list_env_vars',
    description: 'List the environment variables of a project: their names, kind and where they apply (production, preview, development). The values are never read out.',
    inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'The id or the name of the project.' }, team_id: TEAM_ARG }, required: ['project'] },
    async run(args, call) {
      const data = await call('GET', `${BASE}/v10/projects/${idPart(idArg(args, 'project'))}/env`, { query: withTeam(args) });
      return (data?.envs || []).map((variable) => ({ key: variable.key, type: variable.type, target: variable.target, ...(variable.gitBranch ? { branch: variable.gitBranch } : {}) }));
    }
  },
  {
    name: 'vercel_redeploy',
    description: 'Deploy an existing deployment again (a new build of the same source). Use it when a build failed for a reason that is gone, or to apply new environment variables. It starts a build that may change what is live when the target is production.',
    inputSchema: { type: 'object', properties: { deployment: { type: 'string', description: 'The id (dpl_...) of the deployment to deploy again.' }, team_id: TEAM_ARG, target: { type: 'string', enum: ['production', 'preview'], description: 'Where to deploy; by default the same as the deployment had.' } }, required: ['deployment'] },
    async run(args, call) {
      const id = idArg(args, 'deployment');
      const source = await call('GET', `${BASE}/v13/deployments/${idPart(id)}`, { query: withTeam(args) });
      const target = enumArg(args, 'target', ['production', 'preview'], source.target === 'production' ? 'production' : undefined);
      const created = await call('POST', `${BASE}/v13/deployments`, { query: withTeam(args, { forceNew: 1 }), json: { name: source.name, deploymentId: source.id || id, ...(target ? { target } : {}) } });
      return { ...shapeDeployment(created), note: 'A new build was started.' };
    }
  },
  {
    name: 'vercel_cancel_deployment',
    description: 'Stop a build that is still running. A deployment that is already ready, failed or canceled cannot be stopped.',
    inputSchema: { type: 'object', properties: { deployment: { type: 'string', description: 'The id (dpl_...) of the deployment.' }, team_id: TEAM_ARG }, required: ['deployment'] },
    async run(args, call) {
      return shapeDeployment(await call('PATCH', `${BASE}/v12/deployments/${idPart(idArg(args, 'deployment'))}/cancel`, { query: withTeam(args) }));
    }
  }
];

export const vercelProvider = Object.freeze({
  hosts: Object.freeze(['api.vercel.com']),
  explain,
  verifyToken,
  tools: Object.freeze(vercelTools)
});
