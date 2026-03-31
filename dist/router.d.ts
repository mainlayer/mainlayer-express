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
import { Router } from 'express';
import { MainlayerRouterOptions } from './types';
/**
 * Creates an Express Router pre-wired with Mainlayer payment routes.
 */
export declare function createMainlayerRouter(options: MainlayerRouterOptions): Router;
//# sourceMappingURL=router.d.ts.map