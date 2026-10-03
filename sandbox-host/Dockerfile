# The image every sandbox container is made from: Python with the packages the model is told it has, the app's fonts pinned to regular
# and bold, and the `noureon` module. Built on the host from the repository root:
#     docker build -f sandbox-host/Dockerfile -t noureon-sandbox:1 .
# Nothing in it is secret.

# 1. The files made from the repository: the `noureon` module, and the fonts.
FROM python:3.12-slim-bookworm AS assets
RUN pip install --no-cache-dir fonttools brotli
RUN apt-get update && apt-get install -y --no-install-recommends nodejs && rm -rf /var/lib/apt/lists/*
WORKDIR /build
# package.json says the .js files are modules (without it Node reads public/sandbox/runtime.js the old way and cannot import from it).
COPY package.json ./package.json
COPY public/sandbox ./public/sandbox
COPY sandbox-host/export-noureon-module.mjs sandbox-host/build_fonts.py ./sandbox-host/
COPY src/assets/fonts ./fonts
RUN node sandbox-host/export-noureon-module.mjs /build/noureon.py \
 && python sandbox-host/build_fonts.py /build/fonts /build/pinned-fonts

# 2. The image.
FROM python:3.12-slim-bookworm
RUN pip install --no-cache-dir \
    numpy pandas matplotlib scipy scikit-learn sympy pillow lxml beautifulsoup4 \
    python-docx python-pptx openpyxl XlsxWriter reportlab fpdf2 pypdf
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 MPLBACKEND=Agg HOME=/work PYTHONPATH=/opt/noureon
COPY --from=assets /build/noureon.py /opt/noureon/noureon.py
COPY --from=assets /build/pinned-fonts /fonts
COPY sandbox-host/repl.py /opt/noureon/repl.py
# matplotlib builds its font list once, here, so a step does not wait for it; the runner's container starts from this copy.
RUN mkdir -p /usr/share/fonts/truetype/noureon && cp /fonts/*.ttf /usr/share/fonts/truetype/noureon/ \
 && MPLCONFIGDIR=/opt/mplcache python -c "import matplotlib.font_manager as m; print(len(m.fontManager.ttflist), 'fonts')" \
 && chmod -R a+rX /opt /fonts
USER 65534:65534
ENTRYPOINT ["python", "-u", "/opt/noureon/repl.py"]
