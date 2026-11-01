// How the vector of a passage of a project file is named in the store of vectors (workspace_memory_vectors.piece_id, which the past conversations share): `src:<id of the source>:<number
// of the passage in the file>`. A module of its own so that the page's vectors and the database functions agree on the one form. Pure: no window, no document, no browser storage.

export const PIECE_PREFIX = 'src:';
/** The start of the id of a video attached to a message (followed by the start of the hash of the file): it is looked at with the tools of the files of a project, and has vectors like one. */
export const CHAT_VIDEO_PREFIX = 'att-';

export const pieceIdOf = (sourceId, number) => `${PIECE_PREFIX}${sourceId}:${number}`;

/** The id of the source a piece id belongs to, or '' (a piece of a past conversation is not one of a project). */
export const sourceOfPieceId = (id) => {
  const text = String(id || '');
  if (!text.startsWith(PIECE_PREFIX)) return '';
  const end = text.lastIndexOf(':');
  return end > PIECE_PREFIX.length ? text.slice(PIECE_PREFIX.length, end) : '';
};
