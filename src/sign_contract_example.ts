import { readFile } from "node:fs/promises";

const contractPdfBase64 = (await readFile("fixtures/course-contract.pdf")).toString("base64");
const certificatePem = await readFile(process.env.SIGNING_CERT_PATH ?? "signing-cert.pem", "utf8");
const privateKeyPem = await readFile(process.env.SIGNING_KEY_PATH ?? "signing-key.pem", "utf8");

const today = new Date();
const dateAfter = (days: number) => new Date(today.getTime() + days * 86_400_000).toISOString().slice(0, 10);

const response = await fetch("http://localhost:3000/contracts/sign", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    contractId: process.env.CONTRACT_ID ?? "course-demo",
    course: {
      title: "Clinical Data Privacy",
      deliveryStartsOn: dateAfter(-30),
      deliveryEndsOn: dateAfter(-1),
    },
    learner: {
      id: "learner-184",
      completionDeadline: `${dateAfter(7)}T17:00:00Z`,
    },
    educator: {
      id: "educator-21",
      reportDueOn: dateAfter(9),
    },
    contractPdfBase64,
    certificatePem,
    privateKeyPem,
  }),
});

console.log(await response.json());

if (!response.ok) process.exitCode = 1;
