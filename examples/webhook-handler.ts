/**
 * Webhook handler example — Express endpoint with Mainlayer signature verification.
 *
 * IMPORTANT: The verifyWebhook middleware must receive the raw request body
 * before JSON parsing. Use express.raw() on the webhook route only — do NOT
 * use express.json() globally if you need raw body access.
 *
 * Usage:
 *   MAINLAYER_API_KEY=mk_live_... \
 *   MAINLAYER_WEBHOOK_SECRET=whsec_... \
 *   npx ts-node examples/webhook-handler.ts
 *
 * Test with a valid HMAC signature:
 *   node -e "
 *     const crypto = require('crypto');
 *     const body = JSON.stringify({ type: 'payment.completed', id: 'evt_001' });
 *     const sig = crypto.createHmac('sha256', 'whsec_test').update(body).digest('hex');
 *     console.log('Signature:', sig);
 *     console.log('Body:', body);
 *   "
 */

import express, { Request, Response } from 'express';
import { verifyWebhook } from '../src/index';
import type { WebhookEvent } from '../src/index';

const app = express();

const WEBHOOK_SECRET = process.env['MAINLAYER_WEBHOOK_SECRET'] ?? 'whsec_test_placeholder';

// ── In-memory event log (use a real DB in production) ─────────────────────────
const processedEvents: WebhookEvent[] = [];

// ── Helper: dispatch event to appropriate handler ─────────────────────────────
async function handleEvent(event: WebhookEvent): Promise<void> {
  console.log(`[webhook] processing event type=${event.type} id=${event.id}`);

  switch (event.type) {
    case 'payment.completed':
      await onPaymentCompleted(event);
      break;

    case 'entitlement.granted':
      await onEntitlementGranted(event);
      break;

    case 'entitlement.revoked':
      await onEntitlementRevoked(event);
      break;

    case 'payment.failed':
      await onPaymentFailed(event);
      break;

    default:
      console.log(`[webhook] unhandled event type: ${event.type}`);
  }
}

async function onPaymentCompleted(event: WebhookEvent): Promise<void> {
  const { resource_id, payer_wallet, amount } = event.data as {
    resource_id?: string;
    payer_wallet?: string;
    amount?: number;
  };
  console.log(
    `[webhook] payment completed — resource=${resource_id} wallet=${payer_wallet} amount=${amount}`
  );
  // In production: update your database, send confirmation email, provision access, etc.
}

async function onEntitlementGranted(event: WebhookEvent): Promise<void> {
  const { resource_id, payer_wallet } = event.data as {
    resource_id?: string;
    payer_wallet?: string;
  };
  console.log(`[webhook] entitlement granted — resource=${resource_id} wallet=${payer_wallet}`);
  // In production: enable features for the user, update user record, etc.
}

async function onEntitlementRevoked(event: WebhookEvent): Promise<void> {
  const { resource_id, payer_wallet } = event.data as {
    resource_id?: string;
    payer_wallet?: string;
  };
  console.log(`[webhook] entitlement revoked — resource=${resource_id} wallet=${payer_wallet}`);
  // In production: disable features, notify user their access has expired, etc.
}

async function onPaymentFailed(event: WebhookEvent): Promise<void> {
  const { resource_id, payer_wallet, reason } = event.data as {
    resource_id?: string;
    payer_wallet?: string;
    reason?: string;
  };
  console.log(
    `[webhook] payment failed — resource=${resource_id} wallet=${payer_wallet} reason=${reason}`
  );
  // In production: notify user, retry logic, etc.
}

// ── Webhook endpoint ──────────────────────────────────────────────────────────
//
// Use express.raw() here — NOT express.json() — so the raw body is
// available for HMAC signature verification. The verifyWebhook middleware
// will parse the JSON and replace req.body after successful verification.

app.post(
  '/webhooks/mainlayer',
  express.raw({ type: 'application/json' }),
  verifyWebhook(WEBHOOK_SECRET),
  async (req: Request, res: Response) => {
    const event = req.body as WebhookEvent;

    // Idempotency: skip already-processed events
    if (processedEvents.some((e) => e.id === event.id)) {
      console.log(`[webhook] duplicate event skipped: ${event.id}`);
      res.json({ received: true, duplicate: true });
      return;
    }

    try {
      await handleEvent(event);
      processedEvents.push(event);

      // Always respond with 200 quickly so Mainlayer doesn't retry
      res.json({ received: true });
    } catch (err) {
      console.error('[webhook] error processing event:', err);
      // Return 200 anyway to prevent retries for processing errors.
      // Use a dead-letter queue for events that fail consistently.
      res.status(500).json({ received: false, error: 'Processing failed' });
    }
  }
);

// ── Event log endpoint (for debugging) ───────────────────────────────────────
app.get('/webhooks/events', express.json(), (_req: Request, res: Response) => {
  res.json({ count: processedEvents.length, events: processedEvents });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = Number(process.env['PORT'] ?? 3002);
app.listen(PORT, () => {
  console.log(`Mainlayer webhook handler running at http://localhost:${PORT}`);
  console.log(`  POST /webhooks/mainlayer  — receives Mainlayer webhook events`);
  console.log(`  GET  /webhooks/events     — view processed events (debug)`);
  console.log(`  GET  /health`);
  console.log(`\nWebhook secret: ${WEBHOOK_SECRET.slice(0, 12)}...`);
});
