/**
 * Basic Express paywall example
 *
 * Run with:
 *   MAINLAYER_API_KEY=mk_live_... MAINLAYER_RESOURCE_ID=res_... npx ts-node examples/basic-paywall.ts
 *
 * Then test with:
 *   curl -H "x-wallet-address: 0x123" http://localhost:3000/api/premium
 */

import express from 'express';
import { requirePayment, createMainlayerRouter } from '../src/index';

const app = express();
app.use(express.json());

if (!process.env.MAINLAYER_API_KEY) {
  throw new Error('MAINLAYER_API_KEY is required');
}

if (!process.env.MAINLAYER_RESOURCE_ID) {
  throw new Error('MAINLAYER_RESOURCE_ID is required');
}

// Mount built-in Mainlayer routes
app.use(
  createMainlayerRouter({
    apiKey: process.env.MAINLAYER_API_KEY,
  })
);

// Public route
app.get('/api/public', (req, res) => {
  res.json({ message: 'This is free content' });
});

// Payment-gated route
app.get(
  '/api/premium',
  requirePayment({
    apiKey: process.env.MAINLAYER_API_KEY,
    resourceId: process.env.MAINLAYER_RESOURCE_ID,
    onAccessDenied: (info) => {
      console.log('[ACCESS DENIED]', info.reason, { wallet: info.wallet, path: info.path });
    },
  }),
  (req, res) => {
    const { wallet, resourceId } = res.locals.mainlayer;
    res.json({
      message: 'This is premium content',
      wallet,
      resourceId,
      timestamp: new Date().toISOString(),
    });
  }
);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`  Try: curl http://localhost:${PORT}/api/public`);
  console.log(`  Try: curl -H "x-wallet-address: 0x123" http://localhost:${PORT}/api/premium`);
});
