/**
 * A dependency-free one-page PDF: enough for the seed to put a real,
 * renderable CV in the private bucket without pulling in a PDF library.
 */
function escapePdfText(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildCvPdf(input: {
  name: string;
  title: string;
  email: string;
  summary: string;
  skills: string[];
  history: string[];
}): Uint8Array<ArrayBuffer> {
  const lines: Array<[number, string, number]> = [
    [20, input.name, 0],
    [12, `${input.title} · ${input.email}`, 0],
    [12, "", 0],
    [13, "Summary", 0],
    [11, input.summary, 0],
    [12, "", 0],
    [13, "Skills", 0],
    [11, input.skills.join(" · "), 0],
    [12, "", 0],
    [13, "Experience", 0],
    ...input.history.map((line): [number, string, number] => [11, line, 0]),
    [12, "", 0],
    [9, "Generated demo CV: every detail here is fictional.", 0],
  ];

  let y = 760;
  const ops: string[] = ["BT"];
  for (const [size, text, indent] of lines) {
    y -= size * 1.6;
    ops.push(`/F1 ${size} Tf`, `1 0 0 1 ${56 + indent} ${y} Tm`, `(${escapePdfText(text)}) Tj`);
  }
  ops.push("ET");
  const content = ops.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ];

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = Buffer.from(body, "latin1");
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}
