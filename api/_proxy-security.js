import { createHash, randomUUID } from 'node:crypto';

const encoder = new TextEncoder();

export class ProxyRequestError extends Error {
  constructor(message, status = 400, code = 'INVALID_REQUEST') {
    super(message);
    this.name = 'ProxyRequestError';
    this.status = status;
    this.code = code;
  }
}

const fail = (message, status, code) => {
  throw new ProxyRequestError(message, status, code);
};

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const assertAllowedKeys = (value, allowed, path) => {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${path}.${key} is not allowed`, 400, 'UNKNOWN_FIELD');
  }
};

const boundedString = (value, path, max, { min = 0 } = {}) => {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    fail(`${path} must be a string within the allowed length`, 400, 'INVALID_FIELD');
  }
  return value;
};

const boundedNumber = (value, path, min, max) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(`${path} must be a number within the allowed range`, 400, 'INVALID_FIELD');
  }
  return value;
};

export function applyProxyResponseHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export function createProxyRequestContext(res, route, {
  logger = console,
  now = () => Date.now(),
  requestId = randomUUID()
} = {}) {
  res.setHeader('X-Request-ID', requestId);
  return { logger, now, requestId, route, startedAt: now(), recorded: false };
}

export function recordProxyEvent(context, { status, outcome, userId } = {}) {
  if (!context || context.recorded) return;
  context.recorded = true;
  const resolvedUserId = userId || context.userId;
  const userHash = resolvedUserId
    ? createHash('sha256').update(String(resolvedUserId)).digest('hex').slice(0, 16)
    : undefined;
  context.logger.info(JSON.stringify({
    event: 'proxy_request',
    requestId: context.requestId,
    route: context.route,
    status,
    outcome,
    durationMs: Math.max(0, context.now() - context.startedAt),
    ...(userHash && { userHash })
  }));
}

export function requireJsonRequest(req) {
  const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    fail('Content-Type must be application/json', 415, 'UNSUPPORTED_MEDIA_TYPE');
  }
}

export function readProviderAuthorization(req) {
  const authorization = String(req.headers?.authorization || '');
  if (!authorization.startsWith('Bearer ') || authorization.length > 16_384 || /[\r\n]/.test(authorization)) {
    fail('A valid provider Authorization header is required', 401, 'INVALID_AUTHORIZATION');
  }
  return authorization;
}

function readNoureonAuthorization(req) {
  const authorization = String(req.headers?.['x-noureon-authorization'] || '');
  if (!authorization.startsWith('Bearer ') || authorization.length > 16_384 || /[\r\n]/.test(authorization)) {
    fail('Noureon authentication is required', 401, 'NOUREON_AUTH_REQUIRED');
  }
  return authorization.slice(7).trim();
}

export async function authenticateProxyUser(req, { fetchImpl = fetch, env = process.env } = {}) {
  const token = readNoureonAuthorization(req);
  const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!supabaseUrl || !publishableKey) fail('Proxy authentication is not configured', 503, 'AUTH_NOT_CONFIGURED');

  let response;
  try {
    response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    fail('Authentication service is unavailable', 503, 'AUTH_UNAVAILABLE');
  }
  if (!response.ok) fail('Noureon session is invalid', 401, 'INVALID_NOUREON_SESSION');
  const user = await response.json().catch(() => null);
  if (!user?.id || typeof user.id !== 'string') fail('Noureon session is invalid', 401, 'INVALID_NOUREON_SESSION');
  return { id: user.id };
}


export function parseRequestBody(req, maxBytes) {
  let body = req.body;
  if (typeof body === 'string') {
    if (encoder.encode(body).byteLength > maxBytes) fail('Request body is too large', 413, 'BODY_TOO_LARGE');
    try {
      body = JSON.parse(body);
    } catch {
      fail('Request body is not valid JSON', 400, 'INVALID_JSON');
    }
  }
  if (!isRecord(body)) fail('Request body must be a JSON object', 400, 'INVALID_BODY');
  const serialized = JSON.stringify(body);
  if (encoder.encode(serialized).byteLength > maxBytes) fail('Request body is too large', 413, 'BODY_TOO_LARGE');
  return body;
}

function validateMediaUrl(value, path) {
  boundedString(value, path, 900_000, { min: 1 });
  if (!value.startsWith('data:image/') && !value.startsWith('data:video/')) {
    fail(`${path} must use an inline image or video data URL`, 400, 'URL_SCHEME_NOT_ALLOWED');
  }
  return value;
}

function validateContentPart(part, path) {
  if (!isRecord(part)) fail(`${path} must be an object`, 400, 'INVALID_FIELD');
  if (part.type === 'text') {
    assertAllowedKeys(part, new Set(['type', 'text']), path);
    return { type: 'text', text: boundedString(part.text, `${path}.text`, 200_000) };
  }
  if (part.type === 'image_url') {
    assertAllowedKeys(part, new Set(['type', 'image_url']), path);
    if (!isRecord(part.image_url)) fail(`${path}.image_url must be an object`, 400, 'INVALID_FIELD');
    assertAllowedKeys(part.image_url, new Set(['url', 'detail']), `${path}.image_url`);
    const detail = part.image_url.detail == null ? undefined : boundedString(part.image_url.detail, `${path}.image_url.detail`, 16);
    if (detail && !['auto', 'low', 'high'].includes(detail)) fail('Image detail is not allowed', 400, 'INVALID_FIELD');
    return { type: 'image_url', image_url: { url: validateMediaUrl(part.image_url.url, `${path}.image_url.url`), ...(detail && { detail }) } };
  }
  if (part.type === 'video_url') {
    assertAllowedKeys(part, new Set(['type', 'video_url']), path);
    if (!isRecord(part.video_url)) fail(`${path}.video_url must be an object`, 400, 'INVALID_FIELD');
    assertAllowedKeys(part.video_url, new Set(['url']), `${path}.video_url`);
    return { type: 'video_url', video_url: { url: validateMediaUrl(part.video_url.url, `${path}.video_url.url`) } };
  }
  fail(`${path}.type is not allowed`, 400, 'INVALID_FIELD');
}

export function validateChatProxyBody(body) {
  assertAllowedKeys(body, new Set([
    'model', 'messages', 'stream', 'temperature', 'top_p', 'max_tokens', 'reasoning_effort'
  ]), '$');
  const model = boundedString(body.model, '$.model', 256, { min: 1 });
  if (!/^[A-Za-z0-9._:/-]+$/.test(model)) fail('Model id contains invalid characters', 400, 'INVALID_FIELD');
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 200) {
    fail('Messages must be a non-empty bounded array', 400, 'INVALID_FIELD');
  }
  const messages = body.messages.map((message, index) => {
    const path = `$.messages[${index}]`;
    if (!isRecord(message)) fail(`${path} must be an object`, 400, 'INVALID_FIELD');
    assertAllowedKeys(message, new Set(['role', 'content']), path);
    if (!['system', 'user', 'assistant'].includes(message.role)) fail(`${path}.role is not allowed`, 400, 'INVALID_FIELD');
    const content = Array.isArray(message.content)
      ? message.content.map((part, partIndex) => validateContentPart(part, `${path}.content[${partIndex}]`))
      : boundedString(message.content, `${path}.content`, 200_000);
    if (Array.isArray(content) && (content.length < 1 || content.length > 32)) {
      fail(`${path}.content has too many parts`, 400, 'INVALID_FIELD');
    }
    return { role: message.role, content };
  });
  if (body.stream != null && typeof body.stream !== 'boolean') fail('$.stream must be boolean', 400, 'INVALID_FIELD');
  if (body.max_tokens != null && !Number.isInteger(body.max_tokens)) fail('$.max_tokens must be an integer', 400, 'INVALID_FIELD');
  if (body.reasoning_effort != null && !['minimal', 'low', 'medium', 'high'].includes(body.reasoning_effort)) {
    fail('Reasoning effort is not allowed', 400, 'INVALID_FIELD');
  }
  return {
    model,
    messages,
    stream: body.stream == null ? true : body.stream,
    ...(body.temperature != null && { temperature: boundedNumber(body.temperature, '$.temperature', 0, 2) }),
    ...(body.top_p != null && { top_p: boundedNumber(body.top_p, '$.top_p', 0, 1) }),
    ...(body.max_tokens != null && { max_tokens: boundedNumber(body.max_tokens, '$.max_tokens', 1, 128_000) }),
    ...(body.reasoning_effort != null && {
      reasoning_effort: boundedString(body.reasoning_effort, '$.reasoning_effort', 32, { min: 1 })
    })
  };
}

export function validateTavilyProxyBody(body) {
  assertAllowedKeys(body, new Set([
    'query', 'search_depth', 'max_results', 'include_answer', 'include_raw_content',
    'include_images', 'include_usage', 'topic'
  ]), '$');
  const query = boundedString(body.query, '$.query', 400, { min: 1 }).trim();
  if (!query) fail('Query cannot be empty', 400, 'INVALID_FIELD');
  const searchDepth = body.search_depth ?? 'basic';
  if (!['basic', 'advanced'].includes(searchDepth)) fail('Search depth is not allowed', 400, 'INVALID_FIELD');
  const topic = body.topic ?? 'general';
  if (!['general', 'news', 'finance'].includes(topic)) fail('Search topic is not allowed', 400, 'INVALID_FIELD');
  const output = {
    query,
    search_depth: searchDepth,
    max_results: Math.trunc(boundedNumber(body.max_results ?? 6, '$.max_results', 1, 10)),
    topic
  };
  for (const key of ['include_answer', 'include_raw_content', 'include_images', 'include_usage']) {
    if (body[key] != null && typeof body[key] !== 'boolean') fail(`$.${key} must be boolean`, 400, 'INVALID_FIELD');
    output[key] = body[key] ?? false;
  }
  return output;
}

export function sendProxyError(res, error, fallbackMessage) {
  if (error instanceof ProxyRequestError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return error.status;
  }
  res.status(502).json({ error: fallbackMessage, code: 'UPSTREAM_FAILURE' });
  return 502;
}
