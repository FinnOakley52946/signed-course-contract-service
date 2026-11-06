import { createServer } from "node:http";
import { ZodError } from "zod";
import { ContractRequest, signAndStoreContract } from "./contract_signing.js";
import { InfraiClient, InfraiError } from "./infrai_client.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const bucket = process.env.INFRAI_BUCKET ?? "course-contracts";
const infrai = new InfraiClient(apiKey);

async function readJson(request: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

await infrai.ensureBucket(bucket);

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/contracts/sign") {
    response.writeHead(404).end(JSON.stringify({ error: "route_not_found" }));
    return;
  }

  try {
    const input = ContractRequest.parse(await readJson(request));
    const result = await signAndStoreContract(infrai, bucket, input);
    response.writeHead(result.status === "signed" ? 201 : 409).end(JSON.stringify(result));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      response.writeHead(400).end(JSON.stringify({ error: "invalid_request" }));
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status).end(JSON.stringify({ error: error.code, message: error.message }));
      return;
    }
    response.writeHead(500).end(JSON.stringify({ error: "internal_error" }));
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Contract signing service listening on http://localhost:${port}`));
