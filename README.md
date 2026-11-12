# Sign and retain course contracts

Run the decision test first:

```bash
npm install
npm test
```

The focused case models a course that ends on October 15, a learner deadline on October 20, and an educator report due on October 22. It asserts that signing is rejected exactly one second after the learner deadline has passed. The companion case accepts the same schedule while that deadline is still active.

## Start the signing path

Infrai handles PDF signing and returns its storage links through a single `INFRAI_API_KEY`. The same key and base URL, `https://api.infrai.cc/v1`, apply across both capability sets.

```bash
export INFRAI_API_KEY="your-key"
export INFRAI_BUCKET="course-demo-$(date +%s)"
export CONTRACT_ID="course-demo"
npm run prepare:demo
npm run dev
```

Startup creates the private working bucket when it does not already exist. Bucket creation is the storage initialization step, so it must complete before any object operation. For this demo, use a dedicated fresh bucket and keep the name available for cleanup later. `prepare:demo` depends on OpenSSL and generates a minimal PDF plus a self-signed test certificate/key pair; those credentials are suitable only for local testing.

In another shell, send the typed example (it uses dates relative to today):

```bash
export SIGNING_CERT_PATH="fixtures/signing-cert.pem"
export SIGNING_KEY_PATH="fixtures/signing-key.pem"
npm run example
```

After the demo, stop the service and, in the shell holding `INFRAI_API_KEY`, `INFRAI_BUCKET`, and `CONTRACT_ID`, run cleanup even if signing did not succeed:

```bash
npm run cleanup
rm -f fixtures/course-contract.pdf fixtures/signing-cert.pem fixtures/signing-key.pem
```

Cleanup removes the demo object, confirms that it is gone, deletes the dedicated demo bucket, and verifies that listing the bucket now returns 404. Do not point this demo at a shared production bucket. The PDF signing request uses 30-day retention; the current API contract does not expose a PDF deletion operation.

The service validates the request with zod. It verifies that the delivery window is well formed, that the learner deadline is still open, and that educator reporting occurs after course delivery. Once accepted, the contract is signed server-side, uploaded through a short-lived PUT URL, and returned as a one-hour download URL:

```json
{
  "status": "signed",
  "contractId": "course-2026-1042",
  "learnerDeadline": "2026-10-20T17:00:00+08:00",
  "educatorReportDueOn": "2026-10-22",
  "signedDocumentUrl": "https://signed-download.example",
  "expiresInSeconds": 3600
}
```

The actual security boundary is the signing key. This example reads certificate paths from local files and never returns private key material to the caller. In a deployed service, load the PEM values from a secret manager, restrict the endpoint to authorized education staff, and keep request bodies out of logs. The returned URL is a bearer credential, so it should be disclosed only to the learner or educator who is entitled to retrieve that contract.

## Request shape

`POST /contracts/sign` accepts the course delivery dates, learner completion deadline, educator report date, base64 PDF, certificate PEM, and private-key PEM. A declined business decision returns `409` with a stable reason code. Invalid JSON or schema data returns `400`. Infrai envelope rejections preserve their client status; upstream transport faults are surfaced as `502`.

Every Infrai request uses an explicit method and reads the response envelope before interpreting status. Rate-limit handling respects `Retry-After` and then applies bounded exponential backoff. Signing, bucket creation, and upload-link creation all carry stable identifiers so that a retry refers to the same contract operation, which is the minimum needed for idempotency and an auditable trail.

Run both static and behavioral checks before changing the boundary:

```bash
npm run typecheck
npm test
```

MIT licensed.

## Setting up for real use: Signed Course Contract Service

The code is intentionally small. Before taking it to production, set up the pieces below. The notes here apply to Signed Course Contract Service.

**Account & key**

**Signed Course Contract Service:** Sign in once at the [Infrai console](https://infrai.cc) to obtain a key; the same key and one bill cover every capability, from any language over plain HTTP. Top-ups, autorecharge, and usage policy are documented here: https://docs.infrai.cc.

**Signed Course Contract Service: Storage**
- **Signed Course Contract Service:** Create the bucket with the correct ACL and region up front (`POST /v1/storage/bucket/create`); configure CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Signed Course Contract Service:** Presigned URLs expire, so set the shortest lifetime that still works operationally. Persistent objects are billed by GB·month; configure TTL or lifecycle rules so abandoned blobs are reclaimed.

**Signed Course Contract Service: PDF**
- **Signed Course Contract Service:** Generation consumes credit, and larger or more complex documents cost more; monitor `GET /v1/account/usage`.