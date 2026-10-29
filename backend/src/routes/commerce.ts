import { Router } from 'express';
import {
  addPayment,
  createReward,
  deleteReward,
  getBillPayments,
  getReorderSuggestions,
  listRedemptions,
  listRewards,
  redeemReward,
  updateReward,
  voidPayment,
} from '../controllers/commerceController';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { uuidParamSchema } from '../validators/common';
import { addPaymentSchema, redeemRewardSchema } from '../validators/commerce';

/** Split bills, loyalty redemption and purchasing intelligence. */
export const commerceRouter = Router();
commerceRouter.use(authenticate);

const canTakeMoney = authorize('owner', 'manager', 'cashier', 'waiter');

commerceRouter.get('/orders/:id/payments', validate({ params: uuidParamSchema }), getBillPayments);
commerceRouter.post(
  '/orders/:id/payments',
  canTakeMoney,
  validate({ params: uuidParamSchema, body: addPaymentSchema }),
  addPayment,
);
commerceRouter.delete('/orders/:id/payments/:paymentId', canTakeMoney, voidPayment);

commerceRouter.get('/rewards', listRewards);
commerceRouter.get('/rewards/redemptions', authorize('owner', 'manager'), listRedemptions);
commerceRouter.post('/rewards/redeem', canTakeMoney, validate({ body: redeemRewardSchema }), redeemReward);

// Designing the loyalty scheme is a management decision, not a floor one.
const canDesignRewards = authorize('owner', 'manager');
commerceRouter.post('/rewards', canDesignRewards, createReward);
commerceRouter.patch('/rewards/:id', canDesignRewards, validate({ params: uuidParamSchema }), updateReward);
commerceRouter.delete('/rewards/:id', canDesignRewards, validate({ params: uuidParamSchema }), deleteReward);

commerceRouter.get('/reorder', authorize('owner', 'manager'), getReorderSuggestions);
