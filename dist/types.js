"use strict";
/**
 * Core types for @mainlayer/express
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MainlayerError = void 0;
// ─── Errors ─────────────────────────────────────────────────────────────────
/** Structured error thrown by Mainlayer helpers. */
class MainlayerError extends Error {
    constructor(message, code, statusCode, details) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.name = 'MainlayerError';
    }
}
exports.MainlayerError = MainlayerError;
//# sourceMappingURL=types.js.map