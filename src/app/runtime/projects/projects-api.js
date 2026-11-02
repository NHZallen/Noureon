// What other parts of the page may ask of the projects (the deep research adds a report to a project): the list of the projects, and one file added as a source, read and kept as it is
// when a file is chosen in a project (start-projects.js gives it). Page only.

let api = null;

export const setProjectsApi = (value) => { api = value && typeof value === 'object' ? value : null; return api; };
export const getProjectsApi = () => api;
