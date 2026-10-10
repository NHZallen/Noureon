// The pictures of the home page: screenshots of the real components of the application (the council's progress, the research card, the file cards,
// the extensions page), made in the five languages and in both themes, kept as public/home/<language>/<theme>-<story>-<frame>.webp.
// Every frame of a story has the same size, so the window around them never changes size while they cross-fade. `at` is the share of the
// story's scroll from which a frame shows.

export const HOME_IMAGE_DIR = '/home';

export const HOME_STORIES = Object.freeze([
  { id: 'council', width: 620, height: 717, frames: [['firstRound', 0.03], ['deliberation', 0.34], ['synthesis', 0.52], ['final', 0.7]], captions: [0, 0.34, 0.68] },
  { id: 'research', width: 620, height: 742, frames: [['r0', 0.03], ['r1', 0.18], ['r2', 0.36], ['r3', 0.52], ['done', 0.68], ['menu', 0.84]], captions: [0, 0.34, 0.68] },
  { id: 'files', width: 620, height: 581, frames: [['pending', 0.03], ['one', 0.18], ['two', 0.4], ['three', 0.7]], captions: [0, 0.34, 0.68] }
]);

export const HOME_EXTENSIONS_IMAGE = Object.freeze({ name: 'ext', width: 800, height: 680 });

export const homeImagePath = (language, theme, name) => `${HOME_IMAGE_DIR}/${language}/${theme}-${name}.webp`;
