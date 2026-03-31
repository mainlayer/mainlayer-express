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

import {
  MainlayerConfig,
  MainlayerResource,
  DiscoverResponse,
  EntitlementCheckResult,
  EntitlementRecord,
  PayOptions,
  PayPayload,
  PayResult,
  CheckAccessOptions,
  MainlayerError,
} from './types';

const DEFAULT_BASE_URL = 'https://api.mainlayer.xyz';

export class MainlayerClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: MainlayerConfig) {
    if (!config.apiKey) {
      throw new MainlayerError(
        'apiKey is required to create a MainlayerClient.',
        'MISSING_API_KEY',
        400
      );
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private get defaultHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(path, this.baseUrl + '/');
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  private async request<T>(
    method: string,
    path: string,
    options: { params?: Record<string, string>; body?: unknown } = {}
  ): Promise<T> {
    const url = this.buildUrl(path, options.params);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: this.defaultHeaders,
        body: options.body != null ? JSON.stringify(options.body) : undefined,
      });
    } catch (err) {
      throw new MainlayerError(
        `Network error contacting Mainlayer API: ${(err as Error).message}`,
        'NETWORK_ERROR',
        undefined,
        err
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      const body = data as Record<string, unknown>;
      throw new MainlayerError(
        (body['message'] as string) ?? `Mainlayer API error: ${response.status}`,
        (body['code'] as string) ?? 'API_ERROR',
        response.status,
        data
      );
    }

    return data as T;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Create a new resource.
   * POST /resources
   */
  async createResource(
    payload: Partial<MainlayerResource>
  ): Promise<MainlayerResource> {
    return this.request<MainlayerResource>('POST', '/resources', {
      body: payload,
    });
  }

  /**
   * Check whether a payer wallet has entitlement to a resource.
   * GET /entitlements/check?resource_id=&payer_wallet=
   */
  async checkEntitlement(
    options: CheckAccessOptions
  ): Promise<EntitlementCheckResult> {
    let data: Record<string, unknown>;
    try {
      data = await this.request<Record<string, unknown>>(
        'GET',
        '/entitlements/check',
        {
          params: {
            resource_id: options.resourceId,
            payer_wallet: options.payerWallet,
          },
        }
      );
    } catch (err) {
      if (err instanceof MainlayerError && err.statusCode === 404) {
        return { hasAccess: false };
      }
      throw err;
    }

    const hasAccess =
      data['has_access'] === true ||
      data['hasAccess'] === true ||
      data['granted'] === true;

    const entitlement = hasAccess
      ? (data['entitlement'] as EntitlementRecord | undefined) ??
        ({
          resource_id: options.resourceId,
          payer_wallet: options.payerWallet,
          ...data,
        } as EntitlementRecord)
      : undefined;

    return { hasAccess, entitlement };
  }

  /**
   * Execute a payment for a resource.
   * POST /pay
   */
  async pay(options: PayOptions): Promise<PayResult> {
    const payload: PayPayload = {
      resource_id: options.resourceId,
      payer_wallet: options.payerWallet,
    };
    return this.request<PayResult>('POST', '/pay', { body: payload });
  }

  /**
   * Discover available resources.
   * GET /discover
   */
  async discover(): Promise<DiscoverResponse> {
    return this.request<DiscoverResponse>('GET', '/discover');
  }

  /**
   * Convenience alias for checkEntitlement that returns a simple boolean.
   */
  async hasAccess(options: CheckAccessOptions): Promise<boolean> {
    const result = await this.checkEntitlement(options);
    return result.hasAccess;
  }
}
