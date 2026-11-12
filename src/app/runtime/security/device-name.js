// A short name for the device and the browser a request or a passkey came from, made from the User-Agent text: "iPhone · Safari", "Mac · Chrome", "Windows PC · Edge". It is what the
// list of passkeys shows and what the mails about a change of the account say, so a person can tell their own devices from one they do not know. A browser says little about the
// device (an iPhone does not give its model), so this is the kind of device and the browser, no more. Pure text, no browser objects (the server uses it too).

const OS = [
  [/iPhone/i, 'iPhone'],
  [/iPad/i, 'iPad'],
  [/Android/i, (agent) => (/Mobile/i.test(agent) ? 'Android phone' : 'Android tablet')],
  [/CrOS/i, 'Chromebook'],
  [/Macintosh|Mac OS X/i, 'Mac'],
  [/Windows/i, 'Windows PC'],
  [/Linux|X11/i, 'Linux']
];

// The first that matches wins, so the ones that also say "Chrome" or "Safari" come before them.
const BROWSERS = [
  [/GSA\//, 'Google app'],
  [/FBAN|FBAV|FB_IAB/i, 'Facebook app'],
  [/Instagram/i, 'Instagram app'],
  [/\bLine\//i, 'Line app'],
  [/MicroMessenger/i, 'WeChat'],
  [/EdgiOS|EdgA|Edg\//, 'Edge'],
  [/OPR\/|OPiOS|Opera/, 'Opera'],
  [/SamsungBrowser/i, 'Samsung Internet'],
  [/Firefox|FxiOS/i, 'Firefox'],
  [/CriOS|Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari']
];

const pick = (table, agent) => {
  for (const [pattern, name] of table) if (pattern.test(agent)) return typeof name === 'function' ? name(agent) : name;
  return '';
};

/** "iPhone · Safari" (just one of the two when only one is known, 'Unknown device' when neither is). */
export function deviceName(userAgent = '') {
  const agent = String(userAgent || '').slice(0, 600);
  return [pick(OS, agent), pick(BROWSERS, agent)].filter(Boolean).join(' · ') || 'Unknown device';
}
