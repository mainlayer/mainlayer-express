/**
 * Basic API example — Express route gated behind a Mainlayer payment.
 *
 * Usage:
 *   MAINLAYER_API_KEY=mk_live_... MAINLAYER_RESOURCE_ID=res_... npx ts-node examples/basic-api.ts
 *
 * Then call the protected route:
 *   # No wallet — 401
 *   curl http://localhost:3000/api/report
 *
 *   # No entitlement — 402 with payment info
 *   curl -H "x-wallet-address: 0xYourWallet" http://localhost:3000/api/report
 *
 *   # With entitlement — 200
 *   curl -H "x-wallet-address: 0xYourWallet" http://localhost:3000/api/report
 */

import express from 'express';
import {
  requirePayment,
  createMainlayerRouter,
  MainlayerClient,
} from '../src/index';

const app = express();
app.use(express.json());

const API_KEY = process.env['MAINLAYER_API_KEY'] ?? 'mk_test_placeholder';
const RESOURCE_ID = process.env['MAINLAYER_RESOURCE_ID'] ?? 'res_placeholder';

// ── Mount built-in Mainlayer routes ──────────────────────────────────────────
// Provides: GET /mainlayer/discover, POST /mainlayer/pay, GET /mainlayer/access/:id
app.use(createMainlayerRouter({ apiKey: API_KEY }));

// ── Public route ─────────────────────────────────────────────────────────────
app.get('/api/status', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// ── Gated route ──────────────────────────────────────────────────────────────
app.get(
  '/api/report',
  requirePayment({
    apiKey: API_KEY,
    resourceId: RESOURCE_ID,
    // Default: reads wallet from x-wallet-address header
    // Optionally override: getPayerWallet: (req) => req.user?.walletAddress,
    onAccessDenied: (info) => {
      console.log(`[mainlayer] access denied — reason=${info.reason} resource=${info.resourceId}`);
    },
  }),
  (_req, res) => {
    // res.locals.mainlayer is set by requirePayment when access is granted
    const { wallet } = res.locals['mainlayer'] as { wallet: string; resourceId: string };
    res.json({
      message: 'Premium report data',
      generatedFor: wallet,
      data: {
        revenue: 142_800,
        users: 4_120,
        mrr: 11_900,
      },
    });
  }
);

// ── Multiple gated routes using the same middleware config ───────────────────
const paywall = requirePayment({
  apiKey: API_KEY,
  resourceId: RESOURCE_ID,
});

app.get('/api/analytics', paywall, (_req, res) => {
  res.json({ pageViews: 98_200, bounceRate: 0.34 });
});

app.get('/api/exports', paywall, (_req, res) => {
  res.json({ exports: [{ id: 'exp_1', name: 'Q1 2025.csv' }] });
});

// ── Direct client usage ──────────────────────────────────────────────────────
const client = new MainlayerClient({ apiKey: API_KEY });

app.get('/api/discover', async (_req, res) => {
  try {
    const result = await client.discover();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to discover resources', details: String(err) });
  }
});

// ─── Start server ────────────────────────────────────────────────────────────
const PORT = Number(process.env['PORT'] ?? 3000);
app.listen(PORT, () => {
  console.log(`Mainlayer basic API running at http://localhost:${PORT}`);
  console.log(`  GET  /api/status       — public`);
  console.log(`  GET  /api/report       — requires payment`);
  console.log(`  GET  /api/analytics    — requires payment`);
  console.log(`  GET  /api/exports      — requires payment`);
  console.log(`  GET  /mainlayer/discover`);
  console.log(`  POST /mainlayer/pay`);
  console.log(`  GET  /mainlayer/access/:resourceId`);
});
