# @mainlayer/express

Official Express.js middleware and helpers for [Mainlayer](https://mainlayer.fr) payments.

Gate any Express route behind a Mainlayer payment in 5 lines of code — with full TypeScript support, built-in payment routes, and webhook signature verification.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
  - [requirePayment](#requirepayment)
  - [verifyWebhook](#verifywebhook)
  - [createMainlayerRouter](#createmainlayerrouter)
  - [MainlayerClient](#mainlayerclient)
- [Built-in Routes](#built-in-routes)
- [TypeScript Types](#typescript-types)
- [Examples](#examples)
- [Error Handling](#error-handling)
- [License](#license)

---

## Installation

```bash
npm install @mainlayer/express
# or
yarn add @mainlayer/express
# or
pnpm add @mainlayer/express
```

**Requirements**

| Peer dependency | Minimum |
|---|---|
| `express` | 4.18.0 |
| Node.js | 18.0.0 |

---

## Quick Start

Add a payment wall to any Express route in 5 lines:

```ts
import express from 'express';
import { requirePayment } from '@mainlayer/express';

const app = express();
app.use(express.json());

app.get(
  '/api/premium',
  requirePayment({
    apiKey: process.env.MAINLAYER_API_KEY!,
    resourceId: process.env.MAINLAYER_RESOURCE_ID!,
  }),
  (req, res) => res.json({ data: 'premium content' })
);

app.listen(3000);
```

That's it. Requests without a valid entitlement receive a structured `402 Payment Required` response with everything clients need to complete payment.

---

## Environment Variables

```bash
# Required — your Mainlayer API key
MAINLAYER_API_KEY=mk_live_...

# Required — the resource ID to gate access to
MAINLAYER_RESOURCE_ID=res_...

# Optional — only needed if you verify webhooks
MAINLAYER_WEBHOOK_SECRET=whsec_...
```

---

## API Reference

### `requirePayment(options)`

Express middleware that gates a route behind a Mainlayer payment check.

**Flow:**
1. Extracts the payer wallet from the request (default: `x-wallet-address` header).
2. Calls `GET /entitlements/check` on the Mainlayer API.
3. Returns `402 Payment Required` if the wallet has no entitlement.
4. Calls `next()` and sets `res.locals.mainlayer` if access is granted.

```ts
import { requirePayment } from '@mainlayer/express';

app.get(
  '/api/report',
  requirePayment({
    apiKey: process.env.MAINLAYER_API_KEY!,
    resourceId: 'res_report_monthly',

    // Optional: custom wallet extractor (default: x-wallet-address header)
    getPayerWallet: (req) => req.headers['x-wallet-address'] as string,

    // Optional: custom base URL
    baseUrl: 'https://api.mainlayer.fr',

    // Optional: access denied callback for logging/metrics
    onAccessDenied: ({ reason, resourceId, wallet, path }) => {
      console.log(`Access denied: ${reason} for ${wallet} on ${path}`);
    },
  }),
  (req, res) => {
    // res.locals.mainlayer is set when access is granted
    const { wallet, resourceId } = res.locals.mainlayer;
    res.json({ data: 'premium content', wallet });
  }
);
```

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `apiKey` | `string` | Yes | Your Mainlayer API key |
| `resourceId` | `string` | Yes | The resource ID to check entitlement for |
| `getPayerWallet` | `(req) => string \| null` | No | Extract wallet from request. Defaults to `x-wallet-address` header |
| `baseUrl` | `string` | No | API base URL. Defaults to `https://api.mainlayer.fr` |
| `onAccessDenied` | `(info) => void` | No | Called on every denial with reason, wallet, and path |

**Responses when access is denied:**

| Scenario | Status | Body |
|---|---|---|
| No wallet found | `401` | `{ error: "authentication_required" }` |
| No entitlement | `402` | `{ error: "payment_required", resource_id, pay_endpoint }` |
| API unreachable | `503` | `{ error: "service_unavailable" }` |

**`res.locals.mainlayer` when access is granted:**

```ts
{
  wallet: string;      // The wallet address that has access
  resourceId: string;  // The resource ID that was checked
}
```

---

### `verifyWebhook(secret)`

Express middleware that verifies Mainlayer webhook signatures using HMAC-SHA256.

**Important:** Mount `express.raw({ type: 'application/json' })` before this middleware on the webhook route so the raw body is available for signature verification. Do not use `express.json()` on webhook routes.

```ts
import { verifyWebhook } from '@mainlayer/express';

app.post(
  '/webhooks/mainlayer',
  // Use express.raw() here, not express.json()
  express.raw({ type: 'application/json' }),
  verifyWebhook(process.env.MAINLAYER_WEBHOOK_SECRET!),
  (req, res) => {
    const event = req.body; // Parsed and verified webhook event
    console.log('Event type:', event.type);
    res.json({ received: true });
  }
);
```

**Verification process:**
1. Reads the `x-mainlayer-signature` header.
2. Computes `HMAC-SHA256(rawBody, secret)`.
3. Compares signatures using a constant-time comparison to prevent timing attacks.
4. Parses the JSON body and assigns it to `req.body` on success.

**Error responses:**

| Scenario | Status | Error code |
|---|---|---|
| Missing signature header | `400` | `missing_signature` |
| Invalid signature | `401` | `invalid_signature` |
| Invalid JSON body | `400` | `invalid_json` |

---

### `createMainlayerRouter(options)`

Creates an Express `Router` pre-wired with three Mainlayer payment routes. Mount it at the app level to instantly expose a payment API surface.

```ts
import { createMainlayerRouter } from '@mainlayer/express';

app.use(
  createMainlayerRouter({
    apiKey: process.env.MAINLAYER_API_KEY!,
    // Optional: baseUrl override
  })
);
```

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `apiKey` | `string` | Yes | Your Mainlayer API key |
| `baseUrl` | `string` | No | API base URL override |

See [Built-in Routes](#built-in-routes) for the full route reference.

---

### `MainlayerClient`

A fully-typed HTTP client for the Mainlayer API. Used internally by the middleware and router, but also available for direct use in custom server-side logic.

```ts
import { MainlayerClient } from '@mainlayer/express';

const client = new MainlayerClient({
  apiKey: process.env.MAINLAYER_API_KEY!,
  baseUrl: 'https://api.mainlayer.fr', // optional
});

// Check entitlement
const { hasAccess, entitlement } = await client.checkEntitlement({
  resourceId: 'res_123',
  payerWallet: '0xABC...',
});

// Execute a payment
const result = await client.pay({
  resourceId: 'res_123',
  payerWallet: '0xABC...',
});

// Discover available resources
const { resources } = await client.discover();

// Create a resource
const resource = await client.createResource({
  name: 'Pro API Access',
  price: 9.99,
});

// Simple boolean access check
const canAccess = await client.hasAccess({
  resourceId: 'res_123',
  payerWallet: '0xABC...',
});
```

**Methods:**

| Method | API Endpoint | Description |
|---|---|---|
| `checkEntitlement(options)` | `GET /entitlements/check` | Returns `{ hasAccess, entitlement? }` |
| `pay(options)` | `POST /pay` | Execute a payment, returns `PayResult` |
| `discover()` | `GET /discover` | List available resources |
| `createResource(payload)` | `POST /resources` | Create a new resource |
| `hasAccess(options)` | `GET /entitlements/check` | Convenience boolean wrapper |

---

## Built-in Routes

When you mount `createMainlayerRouter`, three routes are added to your app:

### `GET /mainlayer/discover`

Browse all available Mainlayer resources.

```bash
curl http://localhost:3000/mainlayer/discover
```

```json
{
  "resources": [
    { "id": "res_123", "name": "Pro API", "price": 9.99 }
  ]
}
```

---

### `POST /mainlayer/pay`

Proxy a payment to the Mainlayer API.

```bash
curl -X POST http://localhost:3000/mainlayer/pay \
  -H "Content-Type: application/json" \
  -d '{ "resource_id": "res_123", "payer_wallet": "0xABC..." }'
```

**Request body:**

| Field | Type | Required |
|---|---|---|
| `resource_id` | `string` | Yes |
| `payer_wallet` | `string` | Yes |

---

### `GET /mainlayer/access/:resourceId`

Check whether a wallet has access to a specific resource.

```bash
# Via query parameter
curl "http://localhost:3000/mainlayer/access/res_123?payer_wallet=0xABC..."

# Via header (fallback)
curl http://localhost:3000/mainlayer/access/res_123 \
  -H "x-wallet-address: 0xABC..."
```

```json
{ "hasAccess": true, "entitlement": { "resource_id": "res_123", ... } }
```

---

## TypeScript Types

All types are exported from `@mainlayer/express`:

```ts
import type {
  // Config
  MainlayerConfig,

  // Resources
  MainlayerResource,
  DiscoverResponse,

  // Entitlements
  EntitlementCheckResult,
  EntitlementRecord,

  // Payments
  PayOptions,
  PayResult,

  // Middleware
  RequirePaymentOptions,
  AccessDeniedInfo,
  PaymentRequiredBody,

  // Webhook
  WebhookEvent,

  // Router
  MainlayerRouterOptions,
} from '@mainlayer/express';

import { MainlayerError } from '@mainlayer/express';
```

### `AccessDeniedInfo`

Passed to `onAccessDenied` callbacks:

```ts
interface AccessDeniedInfo {
  reason: 'no_wallet' | 'payment_required' | 'api_error';
  resourceId: string;
  wallet?: string;
  path: string;
  error?: unknown;
}
```

### `MainlayerError`

Thrown by `MainlayerClient` methods on API failures:

```ts
try {
  await client.pay({ resourceId: 'res_123', payerWallet: '0xABC' });
} catch (err) {
  if (err instanceof MainlayerError) {
    console.log(err.code);       // e.g. 'API_ERROR'
    console.log(err.statusCode); // e.g. 402
    console.log(err.details);    // raw API response body
  }
}
```

---

## Examples

Three complete examples are included in the `examples/` directory:

### `examples/basic-api.ts`

A single Express app with a payment-gated route and the built-in Mainlayer router mounted.

```bash
MAINLAYER_API_KEY=mk_live_... MAINLAYER_RESOURCE_ID=res_... npx ts-node examples/basic-api.ts
```

### `examples/subscription-api.ts`

Multiple subscription tiers (Starter, Pro, Team), each gated by a different Mainlayer resource ID. Includes a `/api/subscription/status` endpoint that checks all tiers at once.

```bash
MAINLAYER_API_KEY=mk_live_... npx ts-node examples/subscription-api.ts
```

### `examples/webhook-handler.ts`

A webhook endpoint with signature verification, idempotency checking, and handlers for `payment.completed`, `entitlement.granted`, `entitlement.revoked`, and `payment.failed` events.

```bash
MAINLAYER_API_KEY=mk_live_... MAINLAYER_WEBHOOK_SECRET=whsec_... npx ts-node examples/webhook-handler.ts
```

---

## Error Handling

`requirePayment` is designed to never crash your Express app. All Mainlayer API errors are caught and translated to appropriate HTTP responses. The middleware fails **closed** — if the API is unreachable, access is denied with a `503`.

For custom error handling, use the `onAccessDenied` callback:

```ts
requirePayment({
  apiKey: process.env.MAINLAYER_API_KEY!,
  resourceId: 'res_123',
  onAccessDenied: ({ reason, resourceId, wallet, path, error }) => {
    // Log to your observability platform
    logger.warn('Mainlayer access denied', { reason, resourceId, wallet, path });
    if (error) logger.error('Mainlayer API error', { error });
  },
})
```

When using `MainlayerClient` directly, catch `MainlayerError`:

```ts
import { MainlayerClient, MainlayerError } from '@mainlayer/express';

try {
  const result = await client.pay({ resourceId, payerWallet });
} catch (err) {
  if (err instanceof MainlayerError) {
    // Structured error with code, statusCode, and details
    res.status(err.statusCode ?? 500).json({ error: err.code, message: err.message });
  } else {
    res.status(500).json({ error: 'internal_error' });
  }
}
```

---

## License

MIT — see [LICENSE](./LICENSE) for details.

---

Built by [Mainlayer](https://mainlayer.fr) — payment infrastructure for the modern web.
