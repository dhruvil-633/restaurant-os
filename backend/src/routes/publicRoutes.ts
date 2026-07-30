import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  createPublicOrder,
  getPublicMenu,
  trackPublicOrder,
} from '../controllers/publicController';
import { validate } from '../middlewares/validate';
import { publicOrderSchema } from '../validators/publicOrder';

/**
 * Unauthenticated guest-facing routes.
 *
 * These are the only endpoints reachable without a token, so they carry their
 * own tighter rate limits — the general API ceiling assumes a signed-in member
 * of staff, which is a very different threat model from the open internet.
 */
export const publicRouter = Router();

const browseLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Placing an order writes to the kitchen queue, so it is limited hard.
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many orders from this device. Please call the restaurant instead.',
      code: 'RATE_LIMITED',
    });
  },
});

publicRouter.get('/menu', browseLimiter, getPublicMenu);
publicRouter.get('/orders/track', browseLimiter, trackPublicOrder);
publicRouter.post('/orders', orderLimiter, validate({ body: publicOrderSchema }), createPublicOrder);
