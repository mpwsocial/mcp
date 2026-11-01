# MoiPayWay SDK

Official merchant REST SDK. Environments: `test` → `https://dev.moipayway.co`, `live` → `https://api.moipayway.co`.

API reference: [https://documenter.getpostman.com/view/11919136/2sBYHXPdcb](https://documenter.getpostman.com/view/11919136/2sBYHXPdcb)

Collection paths become nested methods (example):

- `POST wallet/create` → client `wallet.create`
- `POST wallet/collection/initiate` → client `wallet.collection.initiate`
- `POST omnichain/tokenization/standards/erc20/deploy` → client `omnichain.tokenization.standards.erc20.deploy`

Deprecated flat tokenization paths (`omnichain/tokenization/erc20/...`) remain as aliases and call the `/standards/` routes.

```bash
npm install -g @moipayway/mcp
# or: npx -y @moipayway/mcp
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

Tools: `list_endpoints`, `request`, named helpers, `verify_webhook`.
