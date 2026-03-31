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
export { requirePayment, verifyWebhook } from './middleware';
export { createMainlayerRouter } from './router';
export { MainlayerClient } from './client';
export type { MainlayerConfig, MainlayerResource, DiscoverResponse, EntitlementCheckResult, EntitlementRecord, PayOptions, PayPayload, PayResult, RequirePaymentOptions, AccessDeniedInfo, PaymentRequiredBody, WebhookEvent, MainlayerRouterOptions, CheckAccessOptions, } from './types';
export { MainlayerError } from './types';
//# sourceMappingURL=index.d.ts.map