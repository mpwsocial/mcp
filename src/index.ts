#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ApiError, Client, needsAuth, verifyWebhook, type Environment } from "./client.js";

type CatalogItem = {
  method: string;
  path: string;
  folder: string;
  name: string;
};

const catalog: CatalogItem[] = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "catalog.json"), "utf8")
);

const NAMED: Record<string, { method: string; path: string; description: string }> = {
  wallet_create: {
    method: "POST",
    path: "wallet/create",
    description: "Create a wallet.",
  },
  wallet_details: {
    method: "POST",
    path: "wallet/details",
    description: "Fetch wallet details.",
  },
  wallet_transactions: {
    method: "POST",
    path: "wallet/transactions",
    description: "List wallet transactions.",
  },
  collection_initiate: {
    method: "POST",
    path: "wallet/collection/initiate",
    description: "Initiate a collection order.",
  },
  collection_info: {
    method: "POST",
    path: "wallet/collection/info",
    description: "Get collection order info.",
  },
  transfer_direct: {
    method: "POST",
    path: "wallet/transfer/direct/single",
    description: "Send a direct single transfer.",
  },
  user_individual_create: {
    method: "POST",
    path: "user/account/individual/create",
    description: "Create an individual user.",
  },
  user_individual_details: {
    method: "POST",
    path: "user/account/individual/details",
    description: "Fetch an individual user.",
  },
  user_business_create: {
    method: "POST",
    path: "user/account/business/create",
    description: "Create a business user.",
  },
  verification_lookup: {
    method: "POST",
    path: "verification/lookup",
    description: "Run a verification lookup.",
  },
  countries: {
    method: "POST",
    path: "user/misc/countries",
    description: "List countries.",
  },
  job_types: {
    method: "POST",
    path: "user/misc/job-types",
    description: "List job types.",
  },
  card_create: {
    method: "POST",
    path: "card/create",
    description: "Create a card.",
  },
  card_details: {
    method: "POST",
    path: "card/details",
    description: "Fetch card details.",
  },
  authentication_initiate: {
    method: "POST",
    path: "authentication/initiate",
    description: "Start authentication.",
  },
  authentication_connect: {
    method: "POST",
    path: "authentication/connect",
    description: "Connect an authenticated session to a merchant.",
  },
};

function environment(): Environment {
  const value = (process.env.MOIPAYWAY_ENVIRONMENT || "test").toLowerCase();
  if (value !== "test" && value !== "live") {
    throw new Error("MOIPAYWAY_ENVIRONMENT must be test or live");
  }
  return value;
}

function client(): Client {
  return new Client(process.env.MOIPAYWAY_API_KEY || "", environment());
}

function findEndpoint(path: string, method?: string): CatalogItem | undefined {
  const cleaned = path.replace(/^\//, "");
  if (method) {
    return catalog.find(
      (item) => item.path === cleaned && item.method.toUpperCase() === method.toUpperCase()
    );
  }
  return catalog.find((item) => item.path === cleaned);
}

function asText(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}

function fail(message: string, payload: Record<string, unknown> | null = null) {
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          status: "failed",
          message,
          ...(payload ? { data: payload } : {}),
        }),
      },
    ],
  };
}

async function callApi(method: string, path: string, body: Record<string, unknown> = {}) {
  try {
    const result = await client().request(method, path, body, needsAuth(method, path));
    return asText(result);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.message, err.payload);
    }
    return fail("Request failed");
  }
}

const bodySchema = {
  body: z.record(z.unknown()).optional().describe("JSON request body"),
};

function createServer(): McpServer {
  const server = new McpServer({
    name: "moipayway",
    version: "0.1.0",
  });

  server.tool(
    "list_endpoints",
    "List MoiPayWay API collection endpoints. Filter by folder such as Wallet, User, Card, Verification, Omnichain.",
    {
      folder: z.string().optional().describe("Collection folder name"),
      query: z.string().optional().describe("Filter by path or name"),
    },
    async ({ folder, query }) => {
      const needle = (query || "").toLowerCase();
      const folderNeedle = (folder || "").toLowerCase();
      const rows = catalog.filter((item) => {
        if (folderNeedle && !item.folder.toLowerCase().includes(folderNeedle)) return false;
        if (!needle) return true;
        return (
          item.path.toLowerCase().includes(needle) ||
          item.name.toLowerCase().includes(needle) ||
          item.folder.toLowerCase().includes(needle)
        );
      });
      return asText({
        status: "success",
        message: `${rows.length} endpoints`,
        data: rows,
      });
    }
  );

  server.tool(
    "request",
    "Call any MoiPayWay API collection endpoint by path. Use list_endpoints to discover paths.",
    {
      path: z.string().describe("Collection path, for example wallet/create"),
      method: z.enum(["GET", "POST"]).optional().describe("HTTP method. Defaults to the collection method for this path."),
      body: z.record(z.unknown()).optional().describe("JSON request body"),
    },
    async ({ path, method, body }) => {
      const item = findEndpoint(path, method);
      if (!item) {
        return fail("Unknown endpoint. Use list_endpoints to see collection paths.");
      }
      return callApi(item.method, item.path, (body || {}) as Record<string, unknown>);
    }
  );

  for (const [name, spec] of Object.entries(NAMED)) {
    server.tool(name, spec.description, bodySchema, async ({ body }) => {
      return callApi(spec.method, spec.path, (body || {}) as Record<string, unknown>);
    });
  }

  server.tool(
    "verify_webhook",
    "Verify a MoiPayWay webhook signature.",
    {
      raw_body: z.string().describe("Raw webhook body"),
      signature_header: z.string().describe("X-MPW-Webhook-Signature header"),
      timestamp_header: z.string().describe("X-MPW-Webhook-Timestamp header"),
    },
    async ({ raw_body, signature_header, timestamp_header }) => {
      const apiKey = process.env.MOIPAYWAY_API_KEY || "";
      const ok = verifyWebhook(raw_body, signature_header, timestamp_header, apiKey);
      return asText({
        status: ok ? "success" : "failed",
        message: ok ? "Signature valid" : "Signature invalid",
        data: { valid: ok },
      });
    }
  );

  return server;
}

const transport = new StdioServerTransport();
const server = createServer();
await server.connect(transport);
