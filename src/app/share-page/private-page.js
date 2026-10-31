// What a page that must stay out of search engines and out of the referrer of the links on it does to itself (the shared conversation and the page of the reports). The header of the same name in
// vercel.json is what a crawler that does not run the page sees.

/** Tells search engines and link followers to keep away, and drops what would point them to the site's home page as the address of this one. */
export function markPageAsPrivate(document) {
  const put = (name, content) => {
    let meta = document.querySelector(`meta[name="${name}"]`);
    if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name', name); document.head.appendChild(meta); }
    meta.setAttribute('content', content);
  };
  put('robots', 'noindex, nofollow, noarchive');
  put('referrer', 'no-referrer');
  document.querySelector('link[rel="canonical"]')?.remove();
  document.querySelector('meta[property="og:url"]')?.remove();
}
