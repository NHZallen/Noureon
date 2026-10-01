/**
 * Where a site's small icon comes from: this app's own server finds it (api/site-icon.js), so the visitor's browser
 * does not ask each site and no third party's icon service learns which sites were looked at.
 */
export const siteIconUrl = (host) => `/api/site-icon?host=${encodeURIComponent(host)}`;
