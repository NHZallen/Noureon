# The browser image of Noureon: the neko Chromium image with one thing added (docs/superpowers/specs/2026-11-16-browser-agent-design.md, §17.3):
#   - the language files of Chromium (chromium-l10n): the neko image has only en-US, so the pages of the browser itself (errors, "This page is blocked") come in English whatever --lang says.
# Debian keeps only the newest version of chromium-l10n in trixie-security, and it must be of the very version of chromium (the package depends on it), so the browser is brought up to
# that version too (a security update of Debian; the version the image had, 155, is not in the repositories any more). Test the new image (e2e-test.sh) before BROWSER_IMAGE names it.
# Build it with build-image.sh.
ARG BASE=ghcr.io/m1k1o/neko/chromium:latest
FROM ${BASE}
USER root
RUN set -eu; apt-get update; apt-get install -y --no-install-recommends chromium chromium-common chromium-sandbox chromium-l10n; rm -rf /var/lib/apt/lists/*; ls /usr/lib/chromium/locales | grep -q '^zh-TW.pak$'; chromium --version
