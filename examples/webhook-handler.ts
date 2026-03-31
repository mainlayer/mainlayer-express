/**
 * Webhook handler example with signature verification
 *
 * Run with:
 *   MAINLAYER_API_KEY=mk_live_... MAINLAYER_WEBHOOK_SECRET=whsec_... npx ts-node examples/webhook-handler.ts
 */

import express from 'express';
import crypto from 'crypto';
import { verifyWebhook } from '../src/index';
import type { WebhookEvent } from '../src/types';

const app = express();

if (!process.env.MAINLAYER_WEBHOOK_SECRET) {
  throw new Error('MAINLAYER_WEBHOOK_SECRET is required');
}

// In-memory store for idempotency (use a database in production)
const processedEvents = new Set<string>();

// Webhook endpoint with signature verification
app.post(
  '/webhooks/mainlayer',
  express.raw({ type: 'application/json' }),
  verifyWebhook(process.env.MAINLAYER_WEBHOOK_SECRET),
  (req, res) => {
    const event = req.body as WebhookEvent;

    if (processedEvents.has(event.id)) {
      res.json({ received: true, status: 'idempotent' });
      return;
    }

    processedEvents.add(event.id);

    switch (event.type) {
      case 'entitlement.granted': {
        const { wallet, resource_id } = event.data as { wallet: string; resource_id: string };
        console.log(`[GRANTED] ${wallet} → ${resource_id}`);
        break;
      }
      case 'entitlement.revoked': {
        const { wallet } = event.data as { wallet: string };
        console.log(`[REVOKED] ${wallet}`);
        break;
      }
      case 'payment.completed': {
        const { transaction_id } = event.data as { transaction_id: string };
        console.log(`[PAYMENT] ${transaction_id}`);
        break;
      }
    }

    res.json({ received: true, event_id: event.id });
  }
);

const PORT = 3001;
app.listen(PORT, () => console.log(`Webhook server on http://localhost:${PORT}`));
