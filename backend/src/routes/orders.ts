import { Router } from 'express';
import {
  addOrderItems,
  assignChef,
  createOrder,
  getBill,
  getKitchenQueue,
  getOrder,
  listOrders,
  removeOrderItem,
  settleOrder,
  updateOrderItemStatus,
  updateOrderStatus,
} from '../controllers/orderController';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  addOrderItemsSchema,
  assignChefSchema,
  createOrderSchema,
  settleOrderSchema,
  updateOrderItemStatusSchema,
  updateOrderStatusSchema,
} from '../validators/orders';
import { uuidParamSchema } from '../validators/common';

export const orderRouter = Router();

orderRouter.use(authenticate);

orderRouter.get('/', listOrders);
orderRouter.get('/:id', validate({ params: uuidParamSchema }), getOrder);
orderRouter.get('/:id/bill', validate({ params: uuidParamSchema }), getBill);

const canTakeOrders = authorize('owner', 'manager', 'cashier', 'waiter');

orderRouter.post('/', canTakeOrders, validate({ body: createOrderSchema }), createOrder);
orderRouter.post(
  '/:id/items',
  canTakeOrders,
  validate({ params: uuidParamSchema, body: addOrderItemsSchema }),
  addOrderItems,
);
orderRouter.delete('/:id/items/:itemId', canTakeOrders, removeOrderItem);
orderRouter.post(
  '/:id/settle',
  authorize('owner', 'manager', 'cashier'),
  validate({ params: uuidParamSchema, body: settleOrderSchema }),
  settleOrder,
);

// The kitchen drives cooking/ready, the floor drives served/completed —
// the transition table in orderService enforces which is legal when.
orderRouter.patch(
  '/:id/status',
  authorize('owner', 'manager', 'cashier', 'waiter', 'chef', 'kitchen_staff'),
  validate({ params: uuidParamSchema, body: updateOrderStatusSchema }),
  updateOrderStatus,
);
orderRouter.patch(
  '/items/:itemId/status',
  authorize('owner', 'manager', 'chef', 'kitchen_staff'),
  validate({ body: updateOrderItemStatusSchema }),
  updateOrderItemStatus,
);
orderRouter.patch(
  '/:id/chef',
  authorize('owner', 'manager', 'chef'),
  validate({ params: uuidParamSchema, body: assignChefSchema }),
  assignChef,
);

/** Kitchen Display System feed. */
export const kitchenRouter = Router();
kitchenRouter.use(authenticate, authorize('owner', 'manager', 'chef', 'kitchen_staff'));
kitchenRouter.get('/queue', getKitchenQueue);
