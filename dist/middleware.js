"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePayment = requirePayment;
exports.verifyWebhook = verifyWebhook;
const client_1 = require("./client");
const types_1 = require("./types");
const crypto_1 = __importDefault(require("crypto"));
const DEFAULT_BASE_URL = 'https://api.mainlayer.xyz';
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
function requirePayment(options) {
    const { resourceId, apiKey, baseUrl = DEFAULT_BASE_URL, getPayerWallet, onAccessDenied, } = options;
    const client = new client_1.MainlayerClient({ apiKey, baseUrl });
    return async function mainlayerPaywall(req, res, next) {
        const path = req.path ?? req.url ?? '/';
        // ── 1. Extract wallet ────────────────────────────────────────────────────
        const wallet = getPayerWallet
            ? getPayerWallet(req)
            : req.headers['x-wallet-address'];
        if (!wallet) {
            const info = {
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
        let price;
        try {
            const result = await client.checkEntitlement({
                resourceId,
                payerWallet: wallet,
            });
            hasAccess = result.hasAccess;
        }
        catch (err) {
            const info = {
                reason: 'api_error',
                resourceId,
                wallet,
                path,
                error: err,
            };
            onAccessDenied?.(info);
            if (err instanceof types_1.MainlayerError && err.statusCode != null) {
                // Surface specific API errors to callers
                res.status(503).json({
                    error: 'service_unavailable',
                    message: 'Unable to verify access at this time. Please try again.',
                });
            }
            else {
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
        const info = {
            reason: 'payment_required',
            resourceId,
            wallet,
            path,
        };
        onAccessDenied?.(info);
        const body = {
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
function verifyWebhook(secret) {
    if (!secret) {
        throw new types_1.MainlayerError('A webhook secret is required for verifyWebhook middleware.', 'MISSING_WEBHOOK_SECRET', 500);
    }
    return function mainlayerWebhookVerifier(req, res, next) {
        const signature = req.headers['x-mainlayer-signature'];
        if (!signature) {
            res.status(400).json({
                error: 'missing_signature',
                message: 'The x-mainlayer-signature header is required.',
            });
            return;
        }
        // The raw body must be available as a Buffer (use express.raw() upstream)
        const rawBody = req.body;
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
        const expected = crypto_1.default
            .createHmac('sha256', secret)
            .update(bodyBuffer)
            .digest('hex');
        // Constant-time comparison to prevent timing attacks
        let valid = false;
        try {
            valid = crypto_1.default.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
        }
        catch {
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
        }
        catch {
            res.status(400).json({
                error: 'invalid_json',
                message: 'Webhook body is not valid JSON.',
            });
            return;
        }
        next();
    };
}
//# sourceMappingURL=middleware.js.map