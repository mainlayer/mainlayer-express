/**
 * @mainlayer/express middleware tests
 */

import request from 'supertest';
import express from 'express';
import { requirePayment, verifyWebhook } from '../src/middleware';
import { MainlayerClient } from '../src/client';
import crypto from 'crypto';

// Mock MainlayerClient
jest.mock('../src/client');

const MockClient = MainlayerClient as jest.MockedClass<typeof MainlayerClient>;

describe('requirePayment middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    jest.clearAllMocks();
  });

  it('allows access when wallet has entitlement', async () => {
    const mockInstance = {
      checkEntitlement: jest.fn().mockResolvedValue({
        hasAccess: true,
        entitlement: { resource_id: 'res_123', payer_wallet: '0xABC' },
      }),
    };
    MockClient.mockImplementation(() => mockInstance as any);

    app.get(
      '/protected',
      requirePayment({ resourceId: 'res_123', apiKey: 'test_key' }),
      (req, res) => res.json({ success: true })
    );

    const res = await request(app)
      .get('/protected')
      .set('x-wallet-address', '0xABC');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 402 when wallet has no entitlement', async () => {
    const mockInstance = {
      checkEntitlement: jest.fn().mockResolvedValue({ hasAccess: false }),
    };
    MockClient.mockImplementation(() => mockInstance as any);

    app.get(
      '/protected',
      requirePayment({ resourceId: 'res_123', apiKey: 'test_key' }),
      (req, res) => res.json({ success: true })
    );

    const res = await request(app)
      .get('/protected')
      .set('x-wallet-address', '0xABC');

    expect(res.status).toBe(402);
    expect(res.body.error).toBe('payment_required');
  });

  it('returns 401 when wallet header is missing', async () => {
    app.get(
      '/protected',
      requirePayment({ resourceId: 'res_123', apiKey: 'test_key' }),
      (req, res) => res.json({ success: true })
    );

    const res = await request(app).get('/protected');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('authentication_required');
  });

  it('uses custom getPayerWallet function', async () => {
    const mockInstance = {
      checkEntitlement: jest.fn().mockResolvedValue({
        hasAccess: true,
      }),
    };
    MockClient.mockImplementation(() => mockInstance as any);

    app.get(
      '/protected',
      requirePayment({
        resourceId: 'res_123',
        apiKey: 'test_key',
        getPayerWallet: (req) => req.query.wallet as string,
      }),
      (req, res) => res.json({ success: true })
    );

    await request(app).get('/protected?wallet=0xDEF');

    expect(mockInstance.checkEntitlement).toHaveBeenCalledWith({
      resourceId: 'res_123',
      payerWallet: '0xDEF',
    });
  });

  it('calls onAccessDenied callback', async () => {
    const callback = jest.fn();
    const mockInstance = {
      checkEntitlement: jest.fn().mockResolvedValue({ hasAccess: false }),
    };
    MockClient.mockImplementation(() => mockInstance as any);

    app.get(
      '/protected',
      requirePayment({
        resourceId: 'res_123',
        apiKey: 'test_key',
        onAccessDenied: callback,
      }),
      (req, res) => res.json({ success: true })
    );

    await request(app)
      .get('/protected')
      .set('x-wallet-address', '0xABC');

    expect(callback).toHaveBeenCalled();
    expect(callback.mock.calls[0][0].reason).toBe('payment_required');
  });

  it('handles API errors gracefully', async () => {
    const mockInstance = {
      checkEntitlement: jest.fn().mockRejectedValue(new Error('API error')),
    };
    MockClient.mockImplementation(() => mockInstance as any);

    app.get(
      '/protected',
      requirePayment({ resourceId: 'res_123', apiKey: 'test_key' }),
      (req, res) => res.json({ success: true })
    );

    const res = await request(app)
      .get('/protected')
      .set('x-wallet-address', '0xABC');

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('service_unavailable');
  });

  it('sets res.locals.mainlayer when access granted', async () => {
    const mockInstance = {
      checkEntitlement: jest.fn().mockResolvedValue({
        hasAccess: true,
      }),
    };
    MockClient.mockImplementation(() => mockInstance as any);

    app.get(
      '/protected',
      requirePayment({ resourceId: 'res_123', apiKey: 'test_key' }),
      (req, res) => {
        expect(res.locals.mainlayer).toBeDefined();
        expect(res.locals.mainlayer.wallet).toBe('0xABC');
        expect(res.locals.mainlayer.resourceId).toBe('res_123');
        res.json({ success: true });
      }
    );

    await request(app)
      .get('/protected')
      .set('x-wallet-address', '0xABC');
  });
});

describe('verifyWebhook middleware', () => {
  let app: express.Application;
  const secret = 'test_secret_123';

  beforeEach(() => {
    app = express();
  });

  it('verifies webhook signature correctly', async () => {
    const payload = { event: 'test' };
    const rawBody = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    app.post(
      '/webhook',
      express.raw({ type: 'application/json' }),
      verifyWebhook(secret),
      (req, res) => res.json({ received: true })
    );

    const res = await request(app)
      .post('/webhook')
      .set('x-mainlayer-signature', signature)
      .send(rawBody)
      .type('json');

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it('rejects invalid signature', async () => {
    app.post(
      '/webhook',
      express.raw({ type: 'application/json' }),
      verifyWebhook(secret),
      (req, res) => res.json({ received: true })
    );

    const res = await request(app)
      .post('/webhook')
      .set('x-mainlayer-signature', 'invalid_signature')
      .send(JSON.stringify({ event: 'test' }))
      .type('json');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_signature');
  });

  it('rejects missing signature', async () => {
    app.post(
      '/webhook',
      express.raw({ type: 'application/json' }),
      verifyWebhook(secret),
      (req, res) => res.json({ received: true })
    );

    const res = await request(app)
      .post('/webhook')
      .send(JSON.stringify({ event: 'test' }))
      .type('json');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('missing_signature');
  });

  it('rejects invalid JSON in webhook body', async () => {
    const signature = crypto.createHmac('sha256', secret).update('invalid json').digest('hex');

    app.post(
      '/webhook',
      express.raw({ type: 'application/json' }),
      verifyWebhook(secret),
      (req, res) => res.json({ received: true })
    );

    const res = await request(app)
      .post('/webhook')
      .set('x-mainlayer-signature', signature)
      .set('Content-Type', 'application/json')
      .send('invalid json');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_json');
  });

  it('parses and sets req.body after verification', async () => {
    const payload = { event_id: '123', type: 'payment.completed' };
    const rawBody = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    app.post(
      '/webhook',
      express.raw({ type: 'application/json' }),
      verifyWebhook(secret),
      (req, res) => {
        expect(req.body).toEqual(payload);
        res.json({ received: true });
      }
    );

    await request(app)
      .post('/webhook')
      .set('x-mainlayer-signature', signature)
      .send(rawBody)
      .type('json');
  });
});
