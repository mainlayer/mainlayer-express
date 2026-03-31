"use strict";
/**
 * HTTP client for the Mainlayer API.
 *
 * Provides typed methods for each API endpoint. The client is used internally
 * by the middleware and router, but can also be used directly for custom
 * server-side logic.
 *
 * @example
 * ```ts
 * import { MainlayerClient } from '@mainlayer/express';
 *
 * const client = new MainlayerClient({ apiKey: process.env.MAINLAYER_API_KEY! });
 *
 * const { hasAccess } = await client.checkEntitlement({
 *   resourceId: 'res_123',
 *   payerWallet: '0xABC...',
 * });
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MainlayerClient = void 0;
const types_1 = require("./types");
const DEFAULT_BASE_URL = 'https://api.mainlayer.fr';
class MainlayerClient {
    constructor(config) {
        if (!config.apiKey) {
            throw new types_1.MainlayerError('apiKey is required to create a MainlayerClient.', 'MISSING_API_KEY', 400);
        }
        this.apiKey = config.apiKey;
        this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    }
    // ─── Private helpers ──────────────────────────────────────────────────────
    get defaultHeaders() {
        return {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };
    }
    buildUrl(path, params) {
        const url = new URL(path, this.baseUrl + '/');
        if (params) {
            for (const [key, value] of Object.entries(params)) {
                url.searchParams.set(key, value);
            }
        }
        return url.toString();
    }
    async request(method, path, options = {}) {
        const url = this.buildUrl(path, options.params);
        let response;
        try {
            response = await fetch(url, {
                method,
                headers: this.defaultHeaders,
                body: options.body != null ? JSON.stringify(options.body) : undefined,
            });
        }
        catch (err) {
            throw new types_1.MainlayerError(`Network error contacting Mainlayer API: ${err.message}`, 'NETWORK_ERROR', undefined, err);
        }
        let data;
        try {
            data = await response.json();
        }
        catch {
            data = {};
        }
        if (!response.ok) {
            const body = data;
            throw new types_1.MainlayerError(body['message'] ?? `Mainlayer API error: ${response.status}`, body['code'] ?? 'API_ERROR', response.status, data);
        }
        return data;
    }
    // ─── Public API ──────────────────────────────────────────────────────────
    /**
     * Create a new resource.
     * POST /resources
     */
    async createResource(payload) {
        return this.request('POST', '/resources', {
            body: payload,
        });
    }
    /**
     * Check whether a payer wallet has entitlement to a resource.
     * GET /entitlements/check?resource_id=&payer_wallet=
     */
    async checkEntitlement(options) {
        let data;
        try {
            data = await this.request('GET', '/entitlements/check', {
                params: {
                    resource_id: options.resourceId,
                    payer_wallet: options.payerWallet,
                },
            });
        }
        catch (err) {
            if (err instanceof types_1.MainlayerError && err.statusCode === 404) {
                return { hasAccess: false };
            }
            throw err;
        }
        const hasAccess = data['has_access'] === true ||
            data['hasAccess'] === true ||
            data['granted'] === true;
        const entitlement = hasAccess
            ? data['entitlement'] ??
                {
                    resource_id: options.resourceId,
                    payer_wallet: options.payerWallet,
                    ...data,
                }
            : undefined;
        return { hasAccess, entitlement };
    }
    /**
     * Execute a payment for a resource.
     * POST /pay
     */
    async pay(options) {
        const payload = {
            resource_id: options.resourceId,
            payer_wallet: options.payerWallet,
        };
        return this.request('POST', '/pay', { body: payload });
    }
    /**
     * Discover available resources.
     * GET /discover
     */
    async discover() {
        return this.request('GET', '/discover');
    }
    /**
     * Convenience alias for checkEntitlement that returns a simple boolean.
     */
    async hasAccess(options) {
        const result = await this.checkEntitlement(options);
        return result.hasAccess;
    }
}
exports.MainlayerClient = MainlayerClient;
//# sourceMappingURL=client.js.map