import express, { Application } from 'express';
import request from 'supertest';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { requirePayment } from '../src/middleware';
import { verifyWebhook } from '../src/middleware';
import { createMainlayerRouter } from '../src/router';
import crypto from 'crypto';

// ─── Mock global fetch ──────────────────────────────────────────────────────

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

beforeEach(() => {
  global.fetch = mockFetch as typeof fetch;
  mockFetch.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeApp(middlewareOptions?: Parameters<typeof requirePayment>[0]): Application {
  const app = express();
  app.use(express.json());
  if (middlewareOptions) {
    app.get(
      '/protected',
      requirePayment(middlewareOptions),
      (_req, res) => {
        res.json({ secret: 'unlocked', locals: res.locals['mainlayer'] });
      }
    );
  }
  return app;
}

function mockEntitlementGranted(): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      has_access: true,
      resource_id: 'res_test',
      payer_wallet: '0xABC',
    }),
  } as Response);
}

function mockEntitlementDenied(): void {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 404,
    json: async () => ({}),
  } as Response);
}

function mockNetworkError(): void {
  mockFetch.mockRejectedValueOnce(new Error('Network failure'));
}

// ─── requirePayment middleware ───────────────────────────────────────────────

describe('requirePayment middleware', () => {
  const baseOptions = {
    apiKey: 'mk_test_abc123',
    resourceId: 'res_test_001',
  };

  describe('wallet extraction', () => {
    it('returns 401 when no wallet header is present', async () => {
      const app = makeApp(baseOptions);
      const res = await request(app).get('/protected');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('authentication_required');
    });

    it('returns 401 with a descriptive message when wallet is missing', async () => {
      const app = makeApp(baseOptions);
      const res = await request(app).get('/protected');
      expect(res.body.message).toMatch(/wallet address/i);
    });

    it('reads wallet from x-wallet-address header by default', async () => {
      mockEntitlementGranted();
      const app = makeApp(baseOptions);
      const res = await request(app)
        .get('/protected')
        .set('x-wallet-address', '0xABC123');
      expect(res.status).toBe(200);
    });

    it('uses a custom getPayerWallet function when provided', async () => {
      mockEntitlementGranted();
      const app = makeApp({
        ...baseOptions,
        getPayerWallet: (req) => req.headers['x-custom-wallet'] as string,
      });
      const res = await request(app)
        .get('/protected')
        .set('x-custom-wallet', '0xCustom999');
      expect(res.status).toBe(200);
    });

    it('returns 401 when custom getPayerWallet returns null', async () => {
      const app = makeApp({
        ...baseOptions,
        getPayerWallet: () => null,
      });
      const res = await request(app).get('/protected');
      expect(res.status).toBe(401);
    });

    it('returns 401 when custom getPayerWallet returns undefined', async () => {
      const app = makeApp({
        ...baseOptions,
        getPayerWallet: () => undefined,
      });
      const res = await request(app).get('/protected');
      expect(res.status).toBe(401);
    });
  });

  describe('entitlement checks', () => {
    it('calls next() when entitlement check returns has_access: true', async () => {
      mockEntitlementGranted();
      const app = makeApp(baseOptions);
      const res = await request(app)
        .get('/protected')
        .set('x-wallet-address', '0xABC');
      expect(res.status).toBe(200);
      expect(res.body.secret).toBe('unlocked');
    });

    it('returns 402 when entitlement check returns 404 (no access)', async () => {
      mockEntitlementDenied();
      const app = makeApp(baseOptions);
      const res = await request(app)
        .get('/protected')
        .set('x-wallet-address', '0xABC');
      expect(res.status).toBe(402);
    });

    it('returns 402 body with payment_required error key', async () => {
      mockEntitlementDenied();
      const app = makeApp(baseOptions);
      const res = await request(app)
        .get('/protected')
        .set('x-wallet-address', '0xABC');
      expect(res.body.error).toBe('payment_required');
    });

    it('includes resource_id in the 402 response body', async () => {
      mockEntitlementDenied();
      const app = makeApp(baseOptions);
      const res = await request(app)
        .get('/protected')
        .set('x-wallet-address', '0xABC');
      expect(res.body.resource_id).toBe(baseOptions.resourceId);
    });

    it('includes pay_endpoint in the 402 response body', async () => {
      mockEntitlementDenied();
      const app = makeApp(baseOptions);
      const res = await request(app)
        .get('/protected')
        .set('x-wallet-address', '0xABC');
      expect(res.body.pay_endpoint).toContain('api.mainlayer.xyz/pay');
    });

    it('passes wallet and resourceId via res.locals.mainlayer when access is granted', async () => {
      mockEntitlementGranted();
      const app = makeApp(baseOptions);
      const res = await request(app)
        .get('/protected')
        .set('x-wallet-address', '0xABC');
      expect(res.body.locals).toMatchObject({
        wallet: '0xABC',
        resourceId: baseOptions.resourceId,
      });
    });

    it('sends Authorization: Bearer <apiKey> to the Mainlayer API', async () => {
      mockEntitlementGranted();
      const app = makeApp(baseOptions);
      await request(app)
        .get('/protected')
        .set('x-wallet-address', '0xABC');
      const [, fetchInit] = mockFetch.mock.calls[0]!;
      const headers = fetchInit?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Bearer ${baseOptions.apiKey}`);
    });

    it('includes resource_id and payer_wallet in the entitlements check URL', async () => {
      mockEntitlementGranted();
      const app = makeApp(baseOptions);
      await request(app)
        .get('/protected')
        .set('x-wallet-address', '0xWALLET');
      const [fetchUrl] = mockFetch.mock.calls[0]!;
      expect(String(fetchUrl)).toContain('resource_id=res_test_001');
      expect(String(fetchUrl)).toContain('payer_wallet=0xWALLET');
    });

    it('uses a custom baseUrl when provided', async () => {
      mockEntitlementGranted();
      const app = makeApp({
        ...baseOptions,
        baseUrl: 'https://staging.api.mainlayer.xyz',
      });
      await request(app)
        .get('/protected')
        .set('x-wallet-address', '0xABC');
      const [fetchUrl] = mockFetch.mock.calls[0]!;
      expect(String(fetchUrl)).toContain('staging.api.mainlayer.xyz');
    });
  });

  describe('error handling', () => {
    it('returns 503 when the Mainlayer API throws a network error', async () => {
      mockNetworkError();
      const app = makeApp(baseOptions);
      const res = await request(app)
        .get('/protected')
        .set('x-wallet-address', '0xABC');
      expect(res.status).toBe(503);
    });

    it('returns 503 with service_unavailable error key on network error', async () => {
      mockNetworkError();
      const app = makeApp(baseOptions);
      const res = await request(app)
        .get('/protected')
        .set('x-wallet-address', '0xABC');
      expect(res.body.error).toBe('service_unavailable');
    });
  });

  describe('onAccessDenied callback', () => {
    it('calls onAccessDenied with no_wallet reason when wallet is missing', async () => {
      const onAccessDenied = jest.fn();
      const app = makeApp({ ...baseOptions, onAccessDenied });
      await request(app).get('/protected');
      expect(onAccessDenied).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'no_wallet', resourceId: baseOptions.resourceId })
      );
    });

    it('calls onAccessDenied with payment_required reason when access is denied', async () => {
      mockEntitlementDenied();
      const onAccessDenied = jest.fn();
      const app = makeApp({ ...baseOptions, onAccessDenied });
      await request(app)
        .get('/protected')
        .set('x-wallet-address', '0xABC');
      expect(onAccessDenied).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'payment_required',
          wallet: '0xABC',
        })
      );
    });

    it('calls onAccessDenied with api_error reason on network failure', async () => {
      mockNetworkError();
      const onAccessDenied = jest.fn();
      const app = makeApp({ ...baseOptions, onAccessDenied });
      await request(app)
        .get('/protected')
        .set('x-wallet-address', '0xABC');
      expect(onAccessDenied).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'api_error' })
      );
    });

    it('does not call onAccessDenied when access is granted', async () => {
      mockEntitlementGranted();
      const onAccessDenied = jest.fn();
      const app = makeApp({ ...baseOptions, onAccessDenied });
      await request(app)
        .get('/protected')
        .set('x-wallet-address', '0xABC');
      expect(onAccessDenied).not.toHaveBeenCalled();
    });
  });
});

// ─── verifyWebhook middleware ────────────────────────────────────────────────

describe('verifyWebhook middleware', () => {
  const webhookSecret = 'whsec_supersecretkey123';

  function makeWebhookApp(): Application {
    const app = express();
    app.post(
      '/webhook',
      express.raw({ type: 'application/json' }),
      verifyWebhook(webhookSecret),
      (req, res) => {
        res.json({ received: true, event: req.body });
      }
    );
    return app;
  }

  function signPayload(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  it('throws when no secret is provided', () => {
    expect(() => verifyWebhook('')).toThrow();
  });

  it('returns 400 when the x-mainlayer-signature header is missing', async () => {
    const app = makeWebhookApp();
    const res = await request(app)
      .post('/webhook')
      .send(JSON.stringify({ type: 'payment.completed' }))
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('missing_signature');
  });

  it('returns 401 when the signature is invalid', async () => {
    const app = makeWebhookApp();
    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-mainlayer-signature', 'badhex0000000000000000000000000000000000000000000000000000000000')
      .send(JSON.stringify({ type: 'payment.completed' }));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_signature');
  });

  it('returns 200 and parsed body when the signature is valid', async () => {
    const app = makeWebhookApp();
    const payload = JSON.stringify({ type: 'payment.completed', id: 'evt_123' });
    const sig = signPayload(payload, webhookSecret);

    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-mainlayer-signature', sig)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.event.type).toBe('payment.completed');
  });
});

// ─── createMainlayerRouter ───────────────────────────────────────────────────

describe('createMainlayerRouter', () => {
  const apiKey = 'mk_test_router_key';

  function makeRouterApp(): Application {
    const app = express();
    app.use(express.json());
    app.use(createMainlayerRouter({ apiKey }));
    return app;
  }

  describe('GET /mainlayer/discover', () => {
    it('returns 200 with resource list from the API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ resources: [{ id: 'res_1', name: 'Pro API' }] }),
      } as Response);

      const app = makeRouterApp();
      const res = await request(app).get('/mainlayer/discover');
      expect(res.status).toBe(200);
      expect(res.body.resources).toHaveLength(1);
    });

    it('returns 503 when the discover API fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));
      const app = makeRouterApp();
      const res = await request(app).get('/mainlayer/discover');
      expect(res.status).toBe(503);
    });
  });

  describe('POST /mainlayer/pay', () => {
    it('returns 400 when resource_id is missing', async () => {
      const app = makeRouterApp();
      const res = await request(app)
        .post('/mainlayer/pay')
        .send({ payer_wallet: '0xABC' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    it('returns 400 when payer_wallet is missing', async () => {
      const app = makeRouterApp();
      const res = await request(app)
        .post('/mainlayer/pay')
        .send({ resource_id: 'res_1' });
      expect(res.status).toBe(400);
    });

    it('proxies the payment to the Mainlayer API and returns the result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, transaction_id: 'txn_abc' }),
      } as Response);

      const app = makeRouterApp();
      const res = await request(app)
        .post('/mainlayer/pay')
        .send({ resource_id: 'res_1', payer_wallet: '0xABC' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /mainlayer/access/:resourceId', () => {
    it('returns 400 when payer_wallet query param and header are both missing', async () => {
      const app = makeRouterApp();
      const res = await request(app).get('/mainlayer/access/res_001');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    it('checks access via query param and returns result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ has_access: true }),
      } as Response);

      const app = makeRouterApp();
      const res = await request(app)
        .get('/mainlayer/access/res_001')
        .query({ payer_wallet: '0xABC' });

      expect(res.status).toBe(200);
      expect(res.body.hasAccess).toBe(true);
    });

    it('accepts wallet from x-wallet-address header as fallback', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ has_access: false }),
      } as Response);

      const app = makeRouterApp();
      const res = await request(app)
        .get('/mainlayer/access/res_001')
        .set('x-wallet-address', '0xFALLBACK');

      expect(res.status).toBe(200);
    });
  });
});
