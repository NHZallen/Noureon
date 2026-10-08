/**
 * The small judgements made when a message is sent (does it need today's facts, a file, a chart, a command tool): a call to OpenRouter's
 * Decisions API with the OpenRouter key, when there is one. Without a key, or when the call fails or is slow, there is none (null) and the
 * word lists decide, as before (decision-client.js). The code that asks (decision-ask.js) is loaded the first time it is needed, so it is not
 * part of what every page load carries; a load slower than the call itself is allowed gives no judgement this time (it goes on for the next).
 */
export function createRequestDecisions(dependencies = {}) {
  let ask = null;
  let loading = null;
  const load = () => {
    loading ||= import('./decision-ask.js').then((module) => { ask = module.createAsk(dependencies); }).catch((error) => {
      loading = null;
      dependencies.logger?.warn?.('[decisions] could not load', error);
    });
    return loading;
  };
  return async (input) => {
    if (!ask) {
      let timer;
      await Promise.race([load(), new Promise((resolve) => { timer = setTimeout(resolve, 1000); })]);
      clearTimeout(timer);
      if (!ask) return null;
    }
    return ask(input);
  };
}
