/**
 * @mainlayer/express
 *
 * Official Express.js middleware and helpers for Mainlayer payments.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import {
 *   requirePayment,
 *   verifyWebhook,
 *   createMainlayerRouter,
 *   MainlayerClient,
 * } from '@mainlayer/express';
 *
 * const app = express();
 * app.use(express.json());
 *
 * // Mount built-in payment routes
 * app.use(createMainlayerRouter({ apiKey: process.env.MAINLAYER_API_KEY! }));
 *
 * // Gate a route behind a payment
 * app.get(
 *   '/api/premium',
 *   requirePayment({
 *     apiKey: process.env.MAINLAYER_API_KEY!,
 *     resourceId: process.env.MAINLAYER_RESOURCE_ID!,
 *   }),
 *   (req, res) => res.json({ data: 'premium content' })
 * );
 * ```
 */

// Middleware
export { requirePayment, verifyWebhook } from './middleware';

// Router factory
export { createMainlayerRouter } from './router';

// HTTP client
export { MainlayerClient } from './client';

// Types & errors
export type {
  // Config
  MainlayerConfig,

  // Resources
  MainlayerResource,
  DiscoverResponse,

  // Entitlements
  EntitlementCheckResult,
  EntitlementRecord,

  // Payments
  PayOptions,
  PayPayload,
  PayResult,

  // Middleware
  RequirePaymentOptions,
  AccessDeniedInfo,
  PaymentRequiredBody,

  // Webhook
  WebhookEvent,

  // Router
  MainlayerRouterOptions,

  // Client
  CheckAccessOptions,
} from './types';

export { MainlayerError } from './types';
