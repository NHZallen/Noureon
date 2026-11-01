import { createCanvas } from '@napi-rs/canvas';

// A PDF of `pages` pages that are only pictures (a scan: no text layer), made of JPEGs drawn with the canvas of the server. Returns Uint8Array.
export function makeScanPdf(pages = 2, { width = 200, height = 120 } = {}) {
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const catalog = add('');
  const tree = add('');
  const kids = [];
  for (let index = 0; index < pages; index += 1) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    context.fillStyle = index % 2 ? 'blue' : 'red';
    context.fillRect(0, 0, width, height);
    const jpeg = canvas.toBuffer('image/jpeg', 80);
    const image = add({ dict: `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, stream: jpeg });
    const content = add({ dict: '', stream: Buffer.from(`q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`) });
    kids.push(add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objects[tree - 1] = `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages} >>`;
  const chunks = [Buffer.from('%PDF-1.4\n')];
  const offsets = [];
  let length = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const parts = typeof object === 'string'
      ? [Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`)]
      : [Buffer.from(`${index + 1} 0 obj\n<< ${object.dict} /Length ${object.stream.length} >>\nstream\n`), object.stream, Buffer.from('\nendstream\nendobj\n')];
    for (const part of parts) { chunks.push(part); length += part.length; }
  });
  const xref = length;
  let table = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) table += `${String(offset).padStart(10, '0')} 00000 n \n`;
  chunks.push(Buffer.from(`${table}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return new Uint8Array(Buffer.concat(chunks));
}
