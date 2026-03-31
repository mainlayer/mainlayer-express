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
import type { RequirePaymentOptions } from './types';
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
export declare function requirePayment(options: RequirePaymentOptions & {
    apiKey: string;
    baseUrl?: string;
}): (req: Request, res: Response, next: NextFunction) => Promise<void>;
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
export declare function verifyWebhook(secret: string): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=middleware.d.ts.map