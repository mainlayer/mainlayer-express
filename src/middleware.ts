/**
 * Express middleware for Mainlayer payment gating.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { requirePayment, verifyWebhook } from '@mainlayer/express';
 *
 * const app = express();
 *
 * // Gate a route behind a Mainlayer payment
 * app.get(
 *   '/api/premium/data',
 *   requirePayment({
 *     resourceId: process.env.MAINLAYER_RESOURCE_ID!,
 *     getPayerWallet: (req) => req.headers['x-wallet-address'] as string,
 *   }),
 *   (req, res) => res.json({ data: 'premium content' })
 * );
 * ```
 */

import type { Request, Response, NextFunction } from 'express';
import { MainlayerClient } from './client';
import type {
  RequirePaymentOptions,
  AccessDeniedInfo,
  PaymentRequiredBody,
} from './types';
import { MainlayerError } from './types';
import crypto from 'crypto';

const DEFAULT_BASE_URL = 'https://api.mainlayer.fr';

// ─── requirePayment ─────────────────────────────────────────────────────────

/**
 * Express middleware that gates a route behind a Mainlayer payment check.
 *
 * - Extracts the payer wallet from the request (default: `x-wallet-address` header).
 * - Calls the Mainlayer entitlements API to verify access.
 * - Returns `402 Payment Required` with payment instructions when access is denied.
 * - Calls `next()` when access is granted, forwarding wallet info via request locals.
 *
 * @example
 * ```ts
 * app.get(
 *   '/api/report',
 *   requirePayment({
 *     resourceId: 'res_report_monthly',
 *     getPayerWallet: (req) => req.headers['x-wallet-address'] as string,
 *   }),
 *   reportHandler
 * );
 * ```
 */
export function requirePayment(
  options: RequirePaymentOptions & { apiKey: string; baseUrl?: string }
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const {
    resourceId,
    apiKey,
    baseUrl = DEFAULT_BASE_URL,
    getPayerWallet,
    onAccessDenied,
  } = options;

  const client = new MainlayerClient({ apiKey, baseUrl });

  return async function mainlayerPaywall(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const path = req.path ?? req.url ?? '/';

    // ── 1. Extract wallet ────────────────────────────────────────────────────
    const wallet = getPayerWallet
      ? getPayerWallet(req)
      : (req.headers['x-wallet-address'] as string | undefined);

    if (!wallet) {
      const info: AccessDeniedInfo = {
        reason: 'no_wallet',
        resourceId,
        path,
      };
      onAccessDenied?.(info);

      res.status(401).json({
        error: 'authentication_required',
        message: 'A wallet address is required. Provide it via the x-wallet-address header.',
      });
      return;
    }

    // ── 2. Check entitlement ─────────────────────────────────────────────────
    let hasAccess = false;
    let price: number | undefined;

    try {
      const result = await client.checkEntitlement({
        resourceId,
        payerWallet: wallet,
      });
      hasAccess = result.hasAccess;
    } catch (err) {
      const info: AccessDeniedInfo = {
        reason: 'api_error',
        resourceId,
        wallet,
        path,
        error: err,
      };
      onAccessDenied?.(info);

      if (err instanceof MainlayerError && err.statusCode != null) {
        // Surface specific API errors to callers
        res.status(503).json({
          error: 'service_unavailable',
          message: 'Unable to verify access at this time. Please try again.',
        });
      } else {
        res.status(503).json({
          error: 'service_unavailable',
          message: 'Unable to verify access at this time. Please try again.',
        });
      }
      return;
    }

    // ── 3. Allow or deny ────────────────────────────────────────────────────
    if (hasAccess) {
      // Forward wallet info to downstream handlers via res.locals
      res.locals['mainlayer'] = { wallet, resourceId };
      next();
      return;
    }

    const info: AccessDeniedInfo = {
      reason: 'payment_required',
      resourceId,
      wallet,
      path,
    };
    onAccessDenied?.(info);

    const body: PaymentRequiredBody = {
      error: 'payment_required',
      resource_id: resourceId,
      pay_endpoint: `${baseUrl}/pay`,
      message: 'Access to this resource requires a Mainlayer payment.',
    };

    if (price != null) {
      body.price_usdc = price;
    }

    res.status(402).json(body);
  };
}

// ─── verifyWebhook ──────────────────────────────────────────────────────────

/**
 * Express middleware that verifies Mainlayer webhook signatures.
 *
 * Must be mounted before `express.json()` on webhook routes so that the raw
 * request body is available for HMAC verification.
 *
 * @example
 * ```ts
 * app.post(
 *   '/webhooks/mainlayer',
 *   express.raw({ type: 'application/json' }),
 *   verifyWebhook(process.env.MAINLAYER_WEBHOOK_SECRET!),
 *   (req, res) => {
 *     const event = req.body; // parsed & verified
 *     res.json({ received: true });
 *   }
 * );
 * ```
 */
export function verifyWebhook(
  secret: string
): (req: Request, res: Response, next: NextFunction) => void {
  if (!secret) {
    throw new MainlayerError(
      'A webhook secret is required for verifyWebhook middleware.',
      'MISSING_WEBHOOK_SECRET',
      500
    );
  }

  return function mainlayerWebhookVerifier(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const signature = req.headers['x-mainlayer-signature'] as string | undefined;

    if (!signature) {
      res.status(400).json({
        error: 'missing_signature',
        message: 'The x-mainlayer-signature header is required.',
      });
      return;
    }

    // The raw body must be available as a Buffer (use express.raw() upstream)
    const rawBody: Buffer | string = req.body as Buffer | string;
    if (!rawBody || (Buffer.isBuffer(rawBody) && rawBody.length === 0)) {
      res.status(400).json({
        error: 'missing_body',
        message: 'Request body is empty or not available as raw bytes.',
      });
      return;
    }

    const bodyBuffer = Buffer.isBuffer(rawBody)
      ? rawBody
      : Buffer.from(rawBody, 'utf-8');

    // Compute HMAC-SHA256 over the raw body using the webhook secret
    const expected = crypto
      .createHmac('sha256', secret)
      .update(bodyBuffer)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    let valid = false;
    try {
      valid = crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex')
      );
    } catch {
      valid = false;
    }

    if (!valid) {
      res.status(401).json({
        error: 'invalid_signature',
        message: 'Webhook signature verification failed.',
      });
      return;
    }

    // Replace body with parsed JSON for downstream handlers
    try {
      req.body = JSON.parse(bodyBuffer.toString('utf-8'));
    } catch {
      res.status(400).json({
        error: 'invalid_json',
        message: 'Webhook body is not valid JSON.',
      });
      return;
    }

    next();
  };
}
