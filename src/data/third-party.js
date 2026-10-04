// The third-party software Noureon uses, for the page "Third-party software and licences" (the CLI store and the settings link to it). The CLI tools
// themselves are listed from the store's catalog (data/cli-catalog.js); this file holds the rest: what is in the server's sandbox, and the
// libraries the app is made with (the runtime dependencies of package.json). Licences are the ones each project declares; checked 2026-10-05.

export const SANDBOX_SOFTWARE = Object.freeze([
  { name: 'Python', license: 'PSF-2.0', url: 'https://www.python.org/' },
  { name: 'NumPy', license: 'BSD-3-Clause', url: 'https://numpy.org/' },
  { name: 'pandas', license: 'BSD-3-Clause', url: 'https://pandas.pydata.org/' },
  { name: 'Matplotlib', license: 'Matplotlib License (PSF-based)', url: 'https://matplotlib.org/' },
  { name: 'SciPy', license: 'BSD-3-Clause', url: 'https://scipy.org/' },
  { name: 'scikit-learn', license: 'BSD-3-Clause', url: 'https://scikit-learn.org/' },
  { name: 'SymPy', license: 'BSD-3-Clause', url: 'https://www.sympy.org/' },
  { name: 'Pillow', license: 'MIT-CMU (HPND)', url: 'https://python-pillow.org/' },
  { name: 'lxml', license: 'BSD-3-Clause', url: 'https://lxml.de/' },
  { name: 'Beautiful Soup', license: 'MIT', url: 'https://www.crummy.com/software/BeautifulSoup/' },
  { name: 'python-docx', license: 'MIT', url: 'https://github.com/python-openxml/python-docx' },
  { name: 'python-pptx', license: 'MIT', url: 'https://github.com/scanny/python-pptx' },
  { name: 'openpyxl', license: 'MIT', url: 'https://openpyxl.readthedocs.io/' },
  { name: 'XlsxWriter', license: 'BSD-2-Clause', url: 'https://xlsxwriter.readthedocs.io/' },
  { name: 'ReportLab', license: 'BSD-3-Clause', url: 'https://www.reportlab.com/opensource/' },
  { name: 'fpdf2', license: 'LGPL-3.0-only', url: 'https://py-pdf.github.io/fpdf2/' },
  { name: 'pypdf', license: 'BSD-3-Clause', url: 'https://pypdf.readthedocs.io/' },
  { name: 'Node.js', license: 'MIT', url: 'https://nodejs.org/' },
  { name: 'npm', license: 'Artistic-2.0', url: 'https://www.npmjs.com/' },
  { name: 'Git', license: 'GPL-2.0-only', url: 'https://git-scm.com/' },
  { name: 'curl', license: 'curl (MIT-style)', url: 'https://curl.se/' },
  { name: 'Noto fonts', license: 'OFL-1.1', url: 'https://fonts.google.com/noto' },
  { name: 'Inter', license: 'OFL-1.1', url: 'https://rsms.me/inter/' }
]);

export const APP_LIBRARIES = Object.freeze([
  { name: 'Supabase JS', license: 'MIT', url: 'https://github.com/supabase/supabase-js' },
  { name: 'Chart.js', license: 'MIT', url: 'https://www.chartjs.org/' },
  { name: 'Cropper.js', license: 'MIT', url: 'https://fengyuanchen.github.io/cropperjs/' },
  { name: 'docx', license: 'MIT', url: 'https://docx.js.org/' },
  { name: 'docx-preview', license: 'Apache-2.0', url: 'https://github.com/VolodymyrBaydalka/docxjs' },
  { name: 'DOMPurify', license: 'MPL-2.0 OR Apache-2.0', url: 'https://github.com/cure53/DOMPurify' },
  { name: 'HarfBuzz.js', license: 'MIT', url: 'https://github.com/harfbuzz/harfbuzzjs' },
  { name: 'highlight.js', license: 'BSD-3-Clause', url: 'https://highlightjs.org/' },
  { name: 'html5-qrcode', license: 'Apache-2.0', url: 'https://github.com/mebjas/html5-qrcode' },
  { name: 'JSZip', license: 'MIT OR GPL-3.0-or-later', url: 'https://stuk.github.io/jszip/' },
  { name: 'KaTeX', license: 'MIT', url: 'https://katex.org/' },
  { name: 'marked', license: 'MIT', url: 'https://marked.js.org/' },
  { name: 'MathJax', license: 'Apache-2.0', url: 'https://www.mathjax.org/' },
  { name: 'PDF.js', license: 'Apache-2.0', url: 'https://mozilla.github.io/pdf.js/' },
  { name: 'pdfmake', license: 'MIT', url: 'https://pdfmake.github.io/docs/' },
  { name: 'PeerJS', license: 'MIT', url: 'https://peerjs.com/' },
  { name: 'PptxGenJS', license: 'MIT', url: 'https://gitbrent.github.io/PptxGenJS/' },
  { name: 'node-qrcode', license: 'MIT', url: 'https://github.com/soldair/node-qrcode' },
  { name: 'write-excel-file', license: 'MIT', url: 'https://gitlab.com/catamphetamine/write-excel-file' },
  { name: 'Pyodide', license: 'MPL-2.0', url: 'https://pyodide.org/' }
]);
