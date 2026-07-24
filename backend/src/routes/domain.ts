import { Router } from 'express';
import {
  adjustLoyaltyPoints,
  createCustomer,
  deleteCustomer,
  findCustomerByPhone,
  getCustomer,
  getCustomerMemory,
  getUpcomingBirthdays,
  listCustomers,
  listFeedback,
  updateCustomer,
} from '../controllers/customerController';
import {
  createFeedback,
  createReservation,
  deleteReservation,
  getReservation,
  getTodayReservations,
  listReservations,
  updateReservation,
} from '../controllers/reservationController';
import {
  createEmployee,
  createShift,
  deleteEmployee,
  deleteShift,
  getEmployee,
  getPerformance,
  listAttendance,
  listEmployees,
  listShifts,
  markAttendance,
  updateEmployee,
} from '../controllers/employeeController';
import {
  adjustStock,
  createIngredient,
  createPurchase,
  createSupplier,
  deleteIngredient,
  deleteSupplier,
  getInventorySummary,
  listIngredients,
  listPurchases,
  listSuppliers,
  listTransactions,
  receivePurchase,
  recordWaste,
  updateIngredient,
  updateSupplier,
} from '../controllers/inventoryController';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { uuidParamSchema } from '../validators/common';
import {
  createCustomerSchema,
  createEmployeeSchema,
  createFeedbackSchema,
  createReservationSchema,
  attendanceSchema,
  shiftSchema,
  updateCustomerSchema,
  updateEmployeeSchema,
  updateReservationSchema,
} from '../validators/people';
import {
  createIngredientSchema,
  createPurchaseSchema,
  createSupplierSchema,
  recordWasteSchema,
  stockAdjustmentSchema,
  updateIngredientSchema,
  updateSupplierSchema,
} from '../validators/inventory';

/* ── Customers ──────────────────────────────────────────────────────────── */

export const customerRouter = Router();
customerRouter.use(authenticate);

customerRouter.get('/', listCustomers);
customerRouter.get('/lookup', findCustomerByPhone);
customerRouter.get('/birthdays', getUpcomingBirthdays);
customerRouter.get('/feedback', listFeedback);
customerRouter.get('/:id', validate({ params: uuidParamSchema }), getCustomer);
customerRouter.get('/:id/memory', validate({ params: uuidParamSchema }), getCustomerMemory);

customerRouter.post('/', validate({ body: createCustomerSchema }), createCustomer);
customerRouter.patch(
  '/:id',
  validate({ params: uuidParamSchema, body: updateCustomerSchema }),
  updateCustomer,
);
customerRouter.post(
  '/:id/loyalty',
  authorize('owner', 'manager', 'cashier'),
  validate({ params: uuidParamSchema }),
  adjustLoyaltyPoints,
);
customerRouter.delete(
  '/:id',
  authorize('owner', 'manager'),
  validate({ params: uuidParamSchema }),
  deleteCustomer,
);

/* ── Reservations ───────────────────────────────────────────────────────── */

export const reservationRouter = Router();
reservationRouter.use(authenticate);

reservationRouter.get('/', listReservations);
reservationRouter.get('/today', getTodayReservations);
reservationRouter.get('/:id', validate({ params: uuidParamSchema }), getReservation);

const canBook = authorize('owner', 'manager', 'cashier', 'waiter');

reservationRouter.post('/', canBook, validate({ body: createReservationSchema }), createReservation);
reservationRouter.patch(
  '/:id',
  canBook,
  validate({ params: uuidParamSchema, body: updateReservationSchema }),
  updateReservation,
);
reservationRouter.delete(
  '/:id',
  authorize('owner', 'manager'),
  validate({ params: uuidParamSchema }),
  deleteReservation,
);

/* ── Feedback ───────────────────────────────────────────────────────────── */

export const feedbackRouter = Router();
feedbackRouter.use(authenticate);
feedbackRouter.post('/', validate({ body: createFeedbackSchema }), createFeedback);

/* ── Employees ──────────────────────────────────────────────────────────── */

export const employeeRouter = Router();
employeeRouter.use(authenticate, authorize('owner', 'manager'));

employeeRouter.get('/', listEmployees);
employeeRouter.get('/performance', getPerformance);
employeeRouter.get('/attendance', listAttendance);
employeeRouter.get('/shifts', listShifts);
employeeRouter.get('/:id', validate({ params: uuidParamSchema }), getEmployee);

employeeRouter.post('/', validate({ body: createEmployeeSchema }), createEmployee);
employeeRouter.post('/attendance', validate({ body: attendanceSchema }), markAttendance);
employeeRouter.post('/shifts', validate({ body: shiftSchema }), createShift);
employeeRouter.patch(
  '/:id',
  validate({ params: uuidParamSchema, body: updateEmployeeSchema }),
  updateEmployee,
);
employeeRouter.delete('/shifts/:id', validate({ params: uuidParamSchema }), deleteShift);
employeeRouter.delete('/:id', validate({ params: uuidParamSchema }), deleteEmployee);

/* ── Inventory ──────────────────────────────────────────────────────────── */

export const inventoryRouter = Router();
inventoryRouter.use(authenticate);

// The kitchen needs to read stock and log waste, so reads are open to staff.
inventoryRouter.get('/', listIngredients);
inventoryRouter.get('/summary', getInventorySummary);
inventoryRouter.get('/transactions', listTransactions);
inventoryRouter.get('/suppliers', listSuppliers);
inventoryRouter.get('/purchases', listPurchases);

inventoryRouter.post(
  '/waste',
  authorize('owner', 'manager', 'chef', 'kitchen_staff'),
  validate({ body: recordWasteSchema }),
  recordWaste,
);

const canManageStock = authorize('owner', 'manager');

inventoryRouter.post('/', canManageStock, validate({ body: createIngredientSchema }), createIngredient);
inventoryRouter.patch(
  '/:id',
  canManageStock,
  validate({ params: uuidParamSchema, body: updateIngredientSchema }),
  updateIngredient,
);
inventoryRouter.post(
  '/:id/adjust',
  canManageStock,
  validate({ params: uuidParamSchema, body: stockAdjustmentSchema }),
  adjustStock,
);
inventoryRouter.delete(
  '/:id',
  canManageStock,
  validate({ params: uuidParamSchema }),
  deleteIngredient,
);

inventoryRouter.post(
  '/suppliers',
  canManageStock,
  validate({ body: createSupplierSchema }),
  createSupplier,
);
inventoryRouter.patch(
  '/suppliers/:id',
  canManageStock,
  validate({ params: uuidParamSchema, body: updateSupplierSchema }),
  updateSupplier,
);
inventoryRouter.delete(
  '/suppliers/:id',
  canManageStock,
  validate({ params: uuidParamSchema }),
  deleteSupplier,
);

inventoryRouter.post(
  '/purchases',
  canManageStock,
  validate({ body: createPurchaseSchema }),
  createPurchase,
);
inventoryRouter.post(
  '/purchases/:id/receive',
  canManageStock,
  validate({ params: uuidParamSchema }),
  receivePurchase,
);
