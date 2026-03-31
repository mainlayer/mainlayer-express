/**
 * Core types for @mainlayer/express
 */

import type { Request } from 'express';

// ─── Config ────────────────────────────────────────────────────────────────

/** Options for configuring the Mainlayer API client. */
export interface MainlayerConfig {
  /** Your Mainlayer API key (server-side only). */
  apiKey: string;
  /** Base URL override — defaults to https://api.mainlayer.xyz */
  baseUrl?: string;
}

// ─── Resources ─────────────────────────────────────────────────────────────

/** Public metadata for a Mainlayer resource. */
export interface MainlayerResource {
  id: string;
  name: string;
  description?: string;
  price?: number;
  currency?: string;
  [key: string]: unknown;
}

/** Response from GET /discover */
export interface DiscoverResponse {
  resources: MainlayerResource[];
  [key: string]: unknown;
}

// ─── Entitlements ──────────────────────────────────────────────────────────

/** Result of an entitlement (access) check. */
export interface EntitlementCheckResult {
  hasAccess: boolean;
  entitlement?: EntitlementRecord;
}

/** A single entitlement record returned from the API. */
export interface EntitlementRecord {
  id?: string;
  resource_id: string;
  payer_wallet: string;
  granted_at?: string;
  expires_at?: string;
  [key: string]: unknown;
}

// ─── Payments ──────────────────────────────────────────────────────────────

/** Payload for POST /pay */
export interface PayPayload {
  resource_id: string;
  payer_wallet: string;
  [key: string]: unknown;
}

/** Result of a payment execution. */
export interface PayResult {
  success: boolean;
  transactionId?: string;
  transaction_id?: string;
  error?: string;
  [key: string]: unknown;
}

/** Options for the MainlayerClient.pay() method. */
export interface PayOptions {
  resourceId: string;
  payerWallet: string;
}

// ─── Middleware ─────────────────────────────────────────────────────────────

/** Options for requirePayment middleware. */
export interface RequirePaymentOptions {
  /** The Mainlayer resource ID to gate access to. */
  resourceId: string;
  /**
   * Extract the payer wallet from the incoming Express request.
   * Defaults to reading the `x-wallet-address` header.
   */
  getPayerWallet?: (req: Request) => string | null | undefined;
  /**
   * Called when access is denied, providing context for logging.
   */
  onAccessDenied?: (info: AccessDeniedInfo) => void;
}

/** Information passed to onAccessDenied callbacks. */
export interface AccessDeniedInfo {
  reason: 'no_wallet' | 'payment_required' | 'api_error';
  resourceId: string;
  wallet?: string;
  path: string;
  error?: unknown;
}

/** The 402 payment required response body. */
export interface PaymentRequiredBody {
  error: 'payment_required';
  resource_id: string;
  price_usdc?: number;
  pay_endpoint: string;
  message: string;
}

// ─── Webhook ────────────────────────────────────────────────────────────────

/** A Mainlayer webhook event. */
export interface WebhookEvent {
  id: string;
  type: string;
  created_at: string;
  data: Record<string, unknown>;
  [key: string]: unknown;
}

// ─── Router ─────────────────────────────────────────────────────────────────

/** Options for createMainlayerRouter. */
export interface MainlayerRouterOptions {
  /** Your Mainlayer API key. */
  apiKey: string;
  /** Base URL override for the Mainlayer API. */
  baseUrl?: string;
}

// ─── Client ─────────────────────────────────────────────────────────────────

/** Options for checkAccess helper. */
export interface CheckAccessOptions {
  resourceId: string;
  payerWallet: string;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

/** Structured error thrown by Mainlayer helpers. */
export class MainlayerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'MainlayerError';
  }
}
