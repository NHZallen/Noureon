// A choice made in a menu field (a select) takes the focus off it at once: the picker of a phone closes, but the field keeps the focus, and with it the blue frame, until something else is touched.
// One delegated listener for every select of the page. Page only.

export function installSelectBlur(document) {
  document.addEventListener('change', (event) => {
    const target = event.target;
    if (target?.tagName === 'SELECT') target.blur();
  });
}
