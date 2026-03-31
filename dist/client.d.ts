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
import { MainlayerConfig, MainlayerResource, DiscoverResponse, EntitlementCheckResult, PayOptions, PayResult, CheckAccessOptions } from './types';
export declare class MainlayerClient {
    private readonly apiKey;
    private readonly baseUrl;
    constructor(config: MainlayerConfig);
    private get defaultHeaders();
    private buildUrl;
    private request;
    /**
     * Create a new resource.
     * POST /resources
     */
    createResource(payload: Partial<MainlayerResource>): Promise<MainlayerResource>;
    /**
     * Check whether a payer wallet has entitlement to a resource.
     * GET /entitlements/check?resource_id=&payer_wallet=
     */
    checkEntitlement(options: CheckAccessOptions): Promise<EntitlementCheckResult>;
    /**
     * Execute a payment for a resource.
     * POST /pay
     */
    pay(options: PayOptions): Promise<PayResult>;
    /**
     * Discover available resources.
     * GET /discover
     */
    discover(): Promise<DiscoverResponse>;
    /**
     * Convenience alias for checkEntitlement that returns a simple boolean.
     */
    hasAccess(options: CheckAccessOptions): Promise<boolean>;
}
//# sourceMappingURL=client.d.ts.map