# The browser image of Noureon: the neko Chromium image with one thing added (docs/superpowers/specs/2026-11-16-browser-agent-design.md, §17.3):
#   - the language files of Chromium (chromium-l10n): the image has only en-US, so the pages of the browser itself (errors, "This page is blocked") come in English whatever --lang says;
# Build it with build-image.sh; BROWSER_IMAGE in host.env then names the result.
ARG BASE=ghcr.io/m1k1o/neko/chromium:latest
FROM ${BASE}
USER root
# The language files must be of the very version of the Chromium that is in the image (the package depends on it).
RUN set -eu; version="$(dpkg-query -W -f='${Version}' chromium)"; apt-get update; apt-get install -y --no-install-recommends "chromium-l10n=${version}"; rm -rf /var/lib/apt/lists/*; ls /usr/lib/chromium/locales | grep -q '^zh-TW.pak$'
