// The one place the composer side (research-mode.js) and the cards (ui/research/) meet: the cards ask to edit a plan or to start a
// research from here, and the composer registers what answers.

let mode = null;

export const registerResearchMode = (value) => { mode = value; };
export const getResearchMode = () => mode;
