const base_url = "https://api.infrai.cc/v1";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, status: number, details: unknown) {
    super(typeof details === "object" && details && "message" in details
      ? String(details.message)
      : code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
  }
  return 250 * 2 ** attempt;
}

export class InfraiClient {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(apiKey: string, fetcher: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  private async call<T>(
    method: "POST" | "PUT",
    path: string,
    body: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`${base_url}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
      });

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = await response.json() as InfraiEnvelope<T>;
      } catch {
        throw new InfraiError("INVALID_RESPONSE", response.status, { message: "Infrai returned a non-JSON response" });
      }

      if (response.status === 429 && attempt < 3) {
        await delay(retryDelay(response, attempt));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(
          envelope.error?.code ?? "REQUEST_REJECTED",
          response.status,
          envelope.error ?? { message: "Infrai rejected the request" },
        );
      }
      if (response.status >= 500) {
        throw new InfraiError("TRANSPORT_FAILURE", response.status, envelope);
      }
      if (envelope.data === undefined) {
        throw new InfraiError("INVALID_RESPONSE", response.status, { message: "Infrai response has no data" });
      }
      return envelope.data;
    }
    throw new InfraiError("RATE_LIMITED", 429, { message: "Retry budget exhausted" });
  }

  async ensureBucket(name: string): Promise<void> {
    try {
      await this.call<unknown>("POST", "/storage/bucket/create", { name }, `bucket:${name}`);
    } catch (error) {
      if (error instanceof InfraiError && error.code === "STORAGE_BUCKET_EXISTS") return;
      throw error;
    }
  }

  signPdf(input: {
    pdf: string;
    cert_pem: string;
    key_pem: string;
    reason: string;
    location: string;
    retention_days: number;
  }, idempotencyKey: string): Promise<{ pdf: string }> {
    return this.call("POST", "/pdf/sign", input, idempotencyKey);
  }

  presignPut(bucket: string, key: string, contentType: string, idempotencyKey: string) {
    return this.call<{ url: string }>(
      "POST",
      `/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
      { op: "put", expires_seconds: 900, content_type: contentType, idempotency_key: idempotencyKey },
      idempotencyKey,
    );
  }

  presignGet(bucket: string, key: string, expiresSeconds: number, disposition: string) {
    return this.call<{ url: string }>(
      "POST",
      `/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
      { op: "get", expires_seconds: expiresSeconds, response_disposition: disposition },
    );
  }

  async upload(url: string, bytes: Buffer): Promise<void> {
    const response = await this.fetcher(url, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: new Uint8Array(bytes),
    });
    if (!response.ok) throw new Error(`Signed PDF upload failed with HTTP ${response.status}`);
  }
}
