"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MainlayerError = exports.MainlayerClient = exports.createMainlayerRouter = exports.verifyWebhook = exports.requirePayment = void 0;
// Middleware
var middleware_1 = require("./middleware");
Object.defineProperty(exports, "requirePayment", { enumerable: true, get: function () { return middleware_1.requirePayment; } });
Object.defineProperty(exports, "verifyWebhook", { enumerable: true, get: function () { return middleware_1.verifyWebhook; } });
// Router factory
var router_1 = require("./router");
Object.defineProperty(exports, "createMainlayerRouter", { enumerable: true, get: function () { return router_1.createMainlayerRouter; } });
// HTTP client
var client_1 = require("./client");
Object.defineProperty(exports, "MainlayerClient", { enumerable: true, get: function () { return client_1.MainlayerClient; } });
var types_1 = require("./types");
Object.defineProperty(exports, "MainlayerError", { enumerable: true, get: function () { return types_1.MainlayerError; } });
//# sourceMappingURL=index.js.map