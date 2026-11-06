import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

await mkdir("fixtures", { recursive: true });
const stream = "BT /F1 18 Tf 72 720 Td (Sample course contract) Tj ET\n";
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
];
let pdf = "%PDF-1.4\n";
const offsets = [0];
for (const [index, object] of objects.entries()) {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
}
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
await writeFile("fixtures/course-contract.pdf", pdf);
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "fixtures/signing-key.pem", "-out", "fixtures/signing-cert.pem", "-days", "2", "-subj", "/CN=Local demo signing only"], { stdio: "ignore" });
console.log("Created demo PDF and self-signed test credentials in fixtures/");
