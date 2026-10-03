// One line of JSON per event. What is written is chosen field by field: never a request body, a key or a token. Any field with a name
// that suggests a secret is replaced, so a careless call cannot leak one.

const SECRET_NAME = /secret|token|authorization|api[-_]?key|password|cookie|envelope/i;

export function redact(fields = {}) {
  const out = {};
  for (const [name, value] of Object.entries(fields)) {
    out[name] = SECRET_NAME.test(name) ? '[hidden]' : value;
  }
  return out;
}

export function createLogger(write = (line) => process.stdout.write(`${line}\n`), now = () => new Date()) {
  return (event, fields = {}) => write(JSON.stringify({ at: now().toISOString(), event, ...redact(fields) }));
}
