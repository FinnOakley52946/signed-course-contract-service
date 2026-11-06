import { z } from "zod";
import { InfraiClient } from "./infrai_client.js";

export const ContractRequest = z.object({
  contractId: z.string().min(1).regex(/^[A-Za-z0-9_-]+$/),
  course: z.object({
    title: z.string().min(1),
    deliveryStartsOn: z.string().date(),
    deliveryEndsOn: z.string().date(),
  }),
  learner: z.object({
    id: z.string().min(1),
    completionDeadline: z.string().datetime({ offset: true }),
  }),
  educator: z.object({
    id: z.string().min(1),
    reportDueOn: z.string().date(),
  }),
  contractPdfBase64: z.string().min(1),
  certificatePem: z.string().startsWith("-----BEGIN CERTIFICATE-----"),
  privateKeyPem: z.string().min(1),
});

export type ContractInput = z.infer<typeof ContractRequest>;

export function signingDecision(input: ContractInput, now: Date) {
  const deadline = new Date(input.learner.completionDeadline);
  if (deadline.getTime() <= now.getTime()) {
    return { allowed: false as const, reason: "learner_deadline_passed" as const };
  }
  if (input.course.deliveryStartsOn > input.course.deliveryEndsOn) {
    return { allowed: false as const, reason: "invalid_delivery_window" as const };
  }
  if (input.educator.reportDueOn < input.course.deliveryEndsOn) {
    return { allowed: false as const, reason: "report_precedes_delivery_end" as const };
  }
  return { allowed: true as const };
}

export async function signAndStoreContract(
  infrai: InfraiClient,
  bucket: string,
  input: ContractInput,
  now = new Date(),
) {
  const decision = signingDecision(input, now);
  if (!decision.allowed) return { status: "rejected" as const, reason: decision.reason };

  const objectKey = `contracts/${input.contractId}/signed.pdf`;
  const signed = await infrai.signPdf({
    pdf: input.contractPdfBase64,
    cert_pem: input.certificatePem,
    key_pem: input.privateKeyPem,
    reason: `Course delivery contract: ${input.course.title}`,
    location: "server-side",
    retention_days: 30,
  }, `sign:${input.contractId}`);

  const put = await infrai.presignPut(bucket, objectKey, "application/pdf", `store:${input.contractId}`);
  await infrai.upload(put.url, Buffer.from(signed.pdf, "base64"));
  const download = await infrai.presignGet(
    bucket,
    objectKey,
    3_600,
    `attachment; filename="${input.contractId}-signed.pdf"`,
  );

  return {
    status: "signed" as const,
    contractId: input.contractId,
    learnerDeadline: input.learner.completionDeadline,
    educatorReportDueOn: input.educator.reportDueOn,
    signedDocumentUrl: download.url,
    expiresInSeconds: 3_600,
  };
}
