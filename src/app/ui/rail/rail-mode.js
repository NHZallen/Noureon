// The layout of the left side on a computer (docs/superpowers/specs/2026-11-05-desktop-rail-sidebar-design.md): a narrow rail of icons, beside it a panel (the old left menu) and then the page.
// What the layout is for a width and for the choice of the person, and where the choice is kept. Pure: no window, no document (the storage is given).
//
//   none    under 768 px (a phone): no rail, the menu is the drawer it has always been
//   drawer  768 to 1023 px: the rail is there, the panel lies over the page when it is opened (a click on a rail icon or on the button of the top bar)
//   pinned  1024 px and more, the choice "docked": the panel stands beside the rail and the page takes the rest
//   hover   1024 px and more, the choice "on hover": only the rail is there, the panel lies over the page while the pointer is on the rail or on the panel

export const RAIL_MIN_WIDTH = 768;
export const DOCKED_MIN_WIDTH = 1024;
export const PANEL_MODES = Object.freeze(['pinned', 'hover']);
export const PANEL_MODE_KEY = 'noureon.rail.panel.v1';
export const PANEL_DEFAULT = 'pinned';
/** How long the panel stays after the pointer left it (a pointer going across the corner of the page is not a leaving). */
export const PEEK_LEAVE_MS = 320;
/** How long the list of the settings shows when they are opened on hover (there is no icon to be on). */
export const SETTINGS_PEEK_MS = 1800;

/** The layout for a width; `coarse` is a screen that is touched (it has no hover, so the panel stays docked). */
export function layoutFor(width, choice = PANEL_DEFAULT, { coarse = false } = {}) {
  if (!(width >= RAIL_MIN_WIDTH)) return 'none';
  if (width < DOCKED_MIN_WIDTH) return 'drawer';
  if (coarse) return 'pinned';
  return choice === 'hover' ? 'hover' : 'pinned';
}

export const otherMode = (mode) => (mode === 'hover' ? 'pinned' : 'hover');

/** The choice kept on this device ('pinned' when none is kept or the storage cannot be read). */
export function readPanelMode(storage) {
  try {
    const value = storage?.getItem(PANEL_MODE_KEY);
    return PANEL_MODES.includes(value) ? value : PANEL_DEFAULT;
  } catch {
    return PANEL_DEFAULT;
  }
}

export function writePanelMode(storage, mode) {
  if (!PANEL_MODES.includes(mode)) return false;
  try {
    storage?.setItem(PANEL_MODE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}
