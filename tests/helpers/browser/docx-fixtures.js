// .docx packages made by hand, as source for the browser tests of the Word preview. `build(JSZip)` runs in the page.

export const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';

const paragraph = (text) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

export const longText = (words) => Array.from({ length: words }, (_, index) => `word${index}`).join(' ');

// The package's parts as strings: `body` goes into word/document.xml; `relationships` are extra relationships of the document.
export const packageParts = ({ body, relationships = '', footer = true } = {}) => ({
  '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${footer ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : ''}</Types>`,
  '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${footer ? '<Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' : ''}${relationships}</Relationships>`,
  'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr>${footer ? '<w:footerReference w:type="default" r:id="rIdF"/>' : ''}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  ...(footer ? { 'word/footer1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W}><w:p><w:r><w:t xml:space="preserve">Page </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple><w:r><w:t xml:space="preserve"> of </w:t></w:r><w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>` } : {})
});

// A long report: headings, 80 paragraphs, one very long paragraph, and a 150-row table whose first row is a header.
export const longReportBody = () => {
  const rows = Array.from({ length: 150 }, (_, index) => `<w:tr>${index === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}<w:tc><w:p><w:r><w:t>${index === 0 ? 'Header cell' : `row ${index}`}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${index === 0 ? 'Value' : index * 10}</w:t></w:r></w:p></w:tc></w:tr>`).join('');
  return [
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Annual report</w:t></w:r></w:p>',
    ...Array.from({ length: 80 }, (_, index) => paragraph(`Paragraph ${index}: ${longText(12)}`)),
    paragraph(`LONG ${longText(900)}`),
    `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid>${rows}</w:tbl>`,
    '<w:p><m:oMath><m:sSubSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sub><m:r><m:t>i</m:t></m:r></m:sub><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSubSup></m:oMath><w:r><w:t xml:space="preserve"> equation at the end</w:t></w:r></w:p>'
  ].join('');
};

// A document that tries what an untrusted Word file could: script as text, a link that runs code, links out, a link inside, a picture from another site.
export const hostileBody = () => [
  paragraph('&lt;script&gt;window.__pwned = 1&lt;/script&gt; &lt;img src=x onerror=&quot;window.__pwned = 2&quot;&gt;'),
  '<w:p><w:hyperlink r:id="rIdJs"><w:r><w:t>run code</w:t></w:r></w:hyperlink></w:p>',
  '<w:p><w:hyperlink r:id="rIdWeb"><w:r><w:t>example link</w:t></w:r></w:hyperlink></w:p>',
  '<w:p><w:hyperlink w:anchor="target"><w:r><w:t>go to target</w:t></w:r></w:hyperlink></w:p>',
  ...Array.from({ length: 70 }, (_, index) => paragraph(`filler ${index} ${longText(10)}`)),
  '<w:p><w:bookmarkStart w:id="1" w:name="target"/><w:r><w:t>the target</w:t></w:r><w:bookmarkEnd w:id="1"/></w:p>'
].join('');

export const hostileRelationships = '<Relationship Id="rIdJs" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:window.__pwned=3" TargetMode="External"/><Relationship Id="rIdWeb" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/page" TargetMode="External"/>';
