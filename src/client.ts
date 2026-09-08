import { createHmac, timingSafeEqual } from "node:crypto";

export type Environment = "test" | "live";

const BASES: Record<Environment, string> = {
  test: "https://dev.moipayway.co",
  live: "https://api.moipayway.co",
};

export class ApiError extends Error {
  constructor(
    message: string,
    public httpStatus = 0,
    public payload: Record<string, unknown> | null = null
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function needsAuth(method: string, path: string): boolean {
  if (path === "authentication/initiate") return false;
  if (method.toUpperCase() === "GET" && path.startsWith("user/misc/")) return false;
  return true;
}

export function verifyWebhook(
  rawBody: string,
  signatureHeader: string,
  timestampHeader: string,
  apiKey: string,
  toleranceSeconds = 300
): boolean {
  if (!rawBody || !signatureHeader || !timestampHeader || !apiKey) return false;
  if (!/^\d+$/.test(timestampHeader)) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestampHeader));
  if (toleranceSeconds > 0 && age > toleranceSeconds) return false;
  const provided = signatureHeader.toLowerCase().startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;
  const expected = createHmac("sha256", apiKey)
    .update(`${timestampHeader}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export class Client {
  constructor(
    private apiKey: string,
    private environment: Environment,
    private timeoutMs = 30000
  ) {}

  baseUrl(): string {
    return BASES[this.environment];
  }

  async request(
    method: string,
    path: string,
    body: Record<string, unknown> = {},
    auth = true
  ): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl().replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (auth) {
      if (!this.apiKey) {
        throw new ApiError("MOIPAYWAY_API_KEY is required");
      }
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method: method.toUpperCase(),
        headers,
        body:
          method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD"
            ? undefined
            : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError("Unable to reach MoiPayWay");
    } finally {
      clearTimeout(timer);
    }

    const decoded = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!decoded) throw new ApiError("Invalid JSON response", res.status);
    const status = String(decoded.status || "").toLowerCase();
    if (status === "failed" || status === "error") {
      throw new ApiError(String(decoded.message || "Request failed"), res.status, decoded);
    }
    return decoded;
  }
}
