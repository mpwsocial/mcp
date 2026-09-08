# MoiPayWay MCP

MCP server for the MoiPayWay API collection. Agents can list endpoints and call them with a merchant API key.

```bash
npm install -g @moipayway/mcp
```

```json
{
  "mcpServers": {
    "moipayway": {
      "command": "npx",
      "args": ["-y", "@moipayway/mcp"],
      "env": {
        "MOIPAYWAY_API_KEY": "your_api_key",
        "MOIPAYWAY_ENVIRONMENT": "test"
      }
    }
  }
}
```

`test` uses `https://dev.moipayway.co`. `live` uses `https://api.moipayway.co`.

## Tools

- `list_endpoints` — browse collection paths by folder or search
- `request` — call any collection path (`wallet/create`, `user/account/individual/create`, …)
- Named helpers: `wallet_create`, `wallet_details`, `wallet_transactions`, `collection_initiate`, `collection_info`, `transfer_direct`, `user_individual_create`, `user_individual_details`, `user_business_create`, `verification_lookup`, `countries`, `job_types`, `card_create`, `card_details`, `authentication_initiate`, `authentication_connect`
- `verify_webhook` — check `X-MPW-Webhook-Signature` / `X-MPW-Webhook-Timestamp`

```js
await request({
  path: "wallet/collection/initiate",
  body: {
    order_reference_code: "ORD-1001",
    meta: {
      amount: "5000",
      narration: "Invoice 1001",
      wallet_id: "wallet-uuid",
      user_id: "user-uuid",
    },
  },
});
```
