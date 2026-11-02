// The reader of web pages of the page (the one that reads the addresses of a message: Tavily or TinyFish, with the person's own key), given by the place that makes it
// (shell/model-request-engine.js) and used to read the web addresses that are sources of a project. Page only.

let fetchPages = null;

export const setPageReader = (reader) => { fetchPages = typeof reader === 'function' ? reader : null; return fetchPages; };
export const getPageReader = () => fetchPages;
