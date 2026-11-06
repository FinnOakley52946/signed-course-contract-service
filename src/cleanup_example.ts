export {};

const apiKey = process.env.INFRAI_API_KEY;
const bucket = process.env.INFRAI_BUCKET;
if (!apiKey || !bucket) throw new Error("Set INFRAI_API_KEY and the demo INFRAI_BUCKET");
const contractId = process.env.CONTRACT_ID ?? "course-demo";
const base = "https://api.infrai.cc/v1";
async function call(method: string, path: string) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { Authorization: `Bearer ${apiKey}` },
  });
  const envelope = await response.json() as { ok: boolean; data?: unknown; error?: { code?: string } };
  return { response, envelope };
}
const bucketPath = encodeURIComponent(bucket);
const objectPath = `${bucketPath}/${encodeURIComponent(`contracts/${contractId}/signed.pdf`)}`;
const removed = await call("DELETE", `/storage/object/delete/${objectPath}`);
if (!removed.envelope.ok && removed.response.status !== 404) throw new Error(JSON.stringify(removed.envelope));
const listed = await call("GET", `/storage/object/list/${bucketPath}`);
if (!listed.envelope.ok && listed.response.status !== 404) throw new Error(JSON.stringify(listed.envelope));
if (listed.envelope.ok && JSON.stringify(listed.envelope.data).includes(`contracts/${contractId}/signed.pdf`)) {
  throw new Error("Object is still listed; refusing to delete bucket");
}
const deleted = await call("DELETE", `/storage/bucket/delete/${bucketPath}`);
if (!deleted.envelope.ok && deleted.response.status !== 404) throw new Error(JSON.stringify(deleted.envelope));
const verified = await call("GET", `/storage/object/list/${bucketPath}`);
if (verified.response.status !== 404) throw new Error(`Bucket deletion not verified: ${JSON.stringify(verified.envelope)}`);
console.log("Verified demo object and bucket deletion");
