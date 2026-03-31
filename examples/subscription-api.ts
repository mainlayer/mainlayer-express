/**
 * Subscription-gated Express API example.
 *
 * Demonstrates how to protect multiple tiers of content with different
 * Mainlayer resource IDs, each representing a subscription plan.
 *
 * Plans:
 *   RESOURCE_STARTER — basic tier, lower price
 *   RESOURCE_PRO     — pro tier with advanced features
 *   RESOURCE_TEAM    — team plan with collaboration features
 *
 * Usage:
 *   MAINLAYER_API_KEY=mk_live_... npx ts-node examples/subscription-api.ts
 */

import express, { Request, Response } from 'express';
import { requirePayment, createMainlayerRouter, MainlayerClient } from '../src/index';

const app = express();
app.use(express.json());

const API_KEY = process.env['MAINLAYER_API_KEY'] ?? 'mk_test_placeholder';

// Subscription tier resource IDs — each maps to a different Mainlayer resource
const RESOURCE_STARTER = process.env['RESOURCE_STARTER'] ?? 'res_starter';
const RESOURCE_PRO = process.env['RESOURCE_PRO'] ?? 'res_pro';
const RESOURCE_TEAM = process.env['RESOURCE_TEAM'] ?? 'res_team';

// ── Mount built-in Mainlayer routes ──────────────────────────────────────────
app.use(createMainlayerRouter({ apiKey: API_KEY }));

// ── Wallet extractor — reads from Bearer token or header ──────────────────────
function extractWallet(req: Request): string | null {
  // Check Authorization: Bearer <wallet> (simplified for demo)
  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  // Fall back to x-wallet-address header
  return (req.headers['x-wallet-address'] as string) ?? null;
}

// ── Subscription paywall factories ───────────────────────────────────────────
const starterPaywall = requirePayment({
  apiKey: API_KEY,
  resourceId: RESOURCE_STARTER,
  getPayerWallet: extractWallet,
  onAccessDenied: ({ reason, wallet }) => {
    console.log(`[starter] denied — reason=${reason} wallet=${wallet ?? 'none'}`);
  },
});

const proPaywall = requirePayment({
  apiKey: API_KEY,
  resourceId: RESOURCE_PRO,
  getPayerWallet: extractWallet,
  onAccessDenied: ({ reason, wallet }) => {
    console.log(`[pro] denied — reason=${reason} wallet=${wallet ?? 'none'}`);
  },
});

const teamPaywall = requirePayment({
  apiKey: API_KEY,
  resourceId: RESOURCE_TEAM,
  getPayerWallet: extractWallet,
  onAccessDenied: ({ reason, wallet }) => {
    console.log(`[team] denied — reason=${reason} wallet=${wallet ?? 'none'}`);
  },
});

// ── Public routes ─────────────────────────────────────────────────────────────
app.get('/', (_req, res: Response) => {
  res.json({
    api: 'Subscription API powered by Mainlayer',
    plans: {
      starter: { resourceId: RESOURCE_STARTER, features: ['5 API calls/day', 'Basic reports'] },
      pro: { resourceId: RESOURCE_PRO, features: ['Unlimited calls', 'Advanced analytics', 'Export'] },
      team: { resourceId: RESOURCE_TEAM, features: ['Everything in Pro', 'Team seats', 'Priority support'] },
    },
    payEndpoint: 'POST /mainlayer/pay',
  });
});

// ── Starter tier routes ───────────────────────────────────────────────────────
app.get('/api/starter/summary', starterPaywall, (_req, res: Response) => {
  res.json({
    plan: 'starter',
    summary: { apiCallsToday: 3, limit: 5, reportsAvailable: 2 },
  });
});

// ── Pro tier routes ───────────────────────────────────────────────────────────
app.get('/api/pro/analytics', proPaywall, (_req, res: Response) => {
  res.json({
    plan: 'pro',
    analytics: {
      totalRequests: 148_200,
      p50Latency: 42,
      p99Latency: 210,
      errorRate: 0.002,
      topEndpoints: ['/api/pro/analytics', '/api/pro/export'],
    },
  });
});

app.post('/api/pro/export', proPaywall, (req: Request, res: Response) => {
  const { format = 'csv', from, to } = req.body as {
    format?: string;
    from?: string;
    to?: string;
  };
  res.json({
    plan: 'pro',
    export: {
      id: `exp_${Date.now()}`,
      format,
      from: from ?? '2025-01-01',
      to: to ?? '2025-03-31',
      status: 'queued',
      downloadUrl: null,
    },
  });
});

// ── Team tier routes ──────────────────────────────────────────────────────────
app.get('/api/team/seats', teamPaywall, (_req, res: Response) => {
  const { wallet } = res.locals['mainlayer'] as { wallet: string };
  res.json({
    plan: 'team',
    admin: wallet,
    seats: [
      { wallet: wallet, role: 'admin', joinedAt: '2025-01-15' },
      { wallet: '0xMember1', role: 'member', joinedAt: '2025-02-01' },
    ],
    maxSeats: 10,
  });
});

app.post('/api/team/invite', teamPaywall, (req: Request, res: Response) => {
  const { walletAddress } = req.body as { walletAddress?: string };
  if (!walletAddress) {
    res.status(400).json({ error: 'walletAddress is required' });
    return;
  }
  res.json({ invited: walletAddress, status: 'pending' });
});

// ── Check current subscription status ────────────────────────────────────────
const client = new MainlayerClient({ apiKey: API_KEY });

app.get('/api/subscription/status', async (req: Request, res: Response) => {
  const wallet = extractWallet(req);
  if (!wallet) {
    res.status(401).json({ error: 'authentication_required' });
    return;
  }

  const [starterAccess, proAccess, teamAccess] = await Promise.all([
    client.hasAccess({ resourceId: RESOURCE_STARTER, payerWallet: wallet }).catch(() => false),
    client.hasAccess({ resourceId: RESOURCE_PRO, payerWallet: wallet }).catch(() => false),
    client.hasAccess({ resourceId: RESOURCE_TEAM, payerWallet: wallet }).catch(() => false),
  ]);

  const activePlan = teamAccess ? 'team' : proAccess ? 'pro' : starterAccess ? 'starter' : null;

  res.json({
    wallet,
    activePlan,
    entitlements: { starter: starterAccess, pro: proAccess, team: teamAccess },
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = Number(process.env['PORT'] ?? 3001);
app.listen(PORT, () => {
  console.log(`Mainlayer subscription API running at http://localhost:${PORT}`);
  console.log('  GET  /                         — plan overview');
  console.log('  GET  /api/subscription/status  — check active plan');
  console.log('  GET  /api/starter/summary      — starter tier');
  console.log('  GET  /api/pro/analytics        — pro tier');
  console.log('  POST /api/pro/export           — pro tier');
  console.log('  GET  /api/team/seats           — team tier');
  console.log('  POST /api/team/invite          — team tier');
});
