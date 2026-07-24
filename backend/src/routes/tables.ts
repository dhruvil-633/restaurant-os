import { Router } from 'express';
import {
  assignWaiter,
  createTable,
  deleteTable,
  getTableSections,
  getWaitTimeEstimate,
  listTables,
  saveFloorLayout,
  updateTable,
  updateTableStatus,
} from '../controllers/tableController';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  assignWaiterSchema,
  createTableSchema,
  updateFloorLayoutSchema,
  updateTableSchema,
  updateTableStatusSchema,
} from '../validators/tables';
import { uuidParamSchema } from '../validators/common';

export const tableRouter = Router();

tableRouter.use(authenticate);

tableRouter.get('/', listTables);
tableRouter.get('/sections', getTableSections);
tableRouter.get('/wait-time', getWaitTimeEstimate);

// Floor staff run the day-to-day state of a table.
const canWorkFloor = authorize('owner', 'manager', 'cashier', 'waiter');

tableRouter.patch(
  '/:id/status',
  canWorkFloor,
  validate({ params: uuidParamSchema, body: updateTableStatusSchema }),
  updateTableStatus,
);
tableRouter.patch(
  '/:id/waiter',
  canWorkFloor,
  validate({ params: uuidParamSchema, body: assignWaiterSchema }),
  assignWaiter,
);

// Changing the floor plan itself is a management action.
const canManageFloor = authorize('owner', 'manager');

tableRouter.post('/', canManageFloor, validate({ body: createTableSchema }), createTable);
tableRouter.post(
  '/layout',
  canManageFloor,
  validate({ body: updateFloorLayoutSchema }),
  saveFloorLayout,
);
tableRouter.patch(
  '/:id',
  canManageFloor,
  validate({ params: uuidParamSchema, body: updateTableSchema }),
  updateTable,
);
tableRouter.delete('/:id', canManageFloor, validate({ params: uuidParamSchema }), deleteTable);
