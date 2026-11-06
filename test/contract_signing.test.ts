import assert from "node:assert/strict";
import test from "node:test";
import { ContractRequest, signingDecision } from "../src/contract_signing.js";

const contract = ContractRequest.parse({
  contractId: "course-1042",
  course: {
    title: "Clinical Data Privacy",
    deliveryStartsOn: "2026-09-15",
    deliveryEndsOn: "2026-10-15",
  },
  learner: {
    id: "learner-184",
    completionDeadline: "2026-10-20T17:00:00+08:00",
  },
  educator: { id: "educator-21", reportDueOn: "2026-10-22" },
  contractPdfBase64: "JVBERi0xLjQ=",
  certificatePem: "-----BEGIN CERTIFICATE-----\ntest",
  privateKeyPem: "-----BEGIN PRIVATE KEY-----\ntest",
});

test("rejects signing after the learner completion deadline", () => {
  assert.deepEqual(
    signingDecision(contract, new Date("2026-10-20T09:00:01Z")),
    { allowed: false, reason: "learner_deadline_passed" },
  );
});

test("allows a coherent delivery and reporting schedule before the deadline", () => {
  assert.deepEqual(
    signingDecision(contract, new Date("2026-09-20T00:00:00Z")),
    { allowed: true },
  );
});
