"use strict";
/**
 * Express router providing built-in Mainlayer payment routes.
 *
 * Mount this router under a prefix to expose:
 *   GET  /mainlayer/discover          — list available resources
 *   POST /mainlayer/pay               — proxy a payment to the Mainlayer API
 *   GET  /mainlayer/access/:resourceId — check access for a wallet+resource pair
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { createMainlayerRouter } from '@mainlayer/express';
 *
 * const app = express();
 * app.use(express.json());
 * app.use(
 *   createMainlayerRouter({
 *     apiKey: process.env.MAINLAYER_API_KEY!,
 *   })
 * );
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMainlayerRouter = createMainlayerRouter;
const express_1 = require("express");
const client_1 = require("./client");
const types_1 = require("./types");
/**
 * Creates an Express Router pre-wired with Mainlayer payment routes.
 */
function createMainlayerRouter(options) {
    const { apiKey, baseUrl } = options;
    const client = new client_1.MainlayerClient({ apiKey, baseUrl });
    const router = (0, express_1.Router)();
    // ── GET /mainlayer/discover ─────────────────────────────────────────────
    /**
     * Browse all available Mainlayer resources.
     *
     * Response: { resources: MainlayerResource[] }
     */
    router.get('/mainlayer/discover', async (_req, res) => {
        try {
            const data = await client.discover();
            res.json(data);
        }
        catch (err) {
            handleRouterError(err, res);
        }
    });
    // ── POST /mainlayer/pay ──────────────────────────────────────────────────
    /**
     * Proxy a payment request to the Mainlayer API.
     *
     * Request body: { resource_id: string; payer_wallet: string }
     * Response:     PayResult
     */
    router.post('/mainlayer/pay', async (req, res) => {
        const { resource_id, payer_wallet } = req.body;
        if (!resource_id || typeof resource_id !== 'string') {
            res.status(400).json({
                error: 'validation_error',
                message: 'resource_id is required and must be a string.',
            });
            return;
        }
        if (!payer_wallet || typeof payer_wallet !== 'string') {
            res.status(400).json({
                error: 'validation_error',
                message: 'payer_wallet is required and must be a string.',
            });
            return;
        }
        try {
            const result = await client.pay({
                resourceId: resource_id,
                payerWallet: payer_wallet,
            });
            res.json(result);
        }
        catch (err) {
            handleRouterError(err, res);
        }
    });
    // ── GET /mainlayer/access/:resourceId ───────────────────────────────────
    /**
     * Check whether a wallet has access to a specific resource.
     *
     * Query params: payer_wallet=<address>
     * Response:     { hasAccess: boolean; entitlement?: EntitlementRecord }
     */
    router.get('/mainlayer/access/:resourceId', async (req, res) => {
        const { resourceId } = req.params;
        const payerWallet = req.query['payer_wallet'] ??
            req.headers['x-wallet-address'];
        if (!payerWallet) {
            res.status(400).json({
                error: 'validation_error',
                message: 'payer_wallet query parameter (or x-wallet-address header) is required.',
            });
            return;
        }
        if (!resourceId) {
            res.status(400).json({
                error: 'validation_error',
                message: 'resourceId route parameter is required.',
            });
            return;
        }
        try {
            const result = await client.checkEntitlement({
                resourceId,
                payerWallet,
            });
            res.json(result);
        }
        catch (err) {
            handleRouterError(err, res);
        }
    });
    return router;
}
// ─── Error helper ────────────────────────────────────────────────────────────
function handleRouterError(err, res) {
    if (err instanceof types_1.MainlayerError) {
        // NETWORK_ERROR means the upstream API is unreachable — return 503
        if (err.code === 'NETWORK_ERROR') {
            res.status(503).json({
                error: 'service_unavailable',
                message: 'Unable to reach the Mainlayer API. Please try again.',
            });
            return;
        }
        const status = err.statusCode ?? 500;
        res.status(status).json({
            error: err.code,
            message: err.message,
            details: err.details,
        });
        return;
    }
    res.status(500).json({
        error: 'internal_error',
        message: 'An unexpected error occurred.',
    });
}
//# sourceMappingURL=router.js.map