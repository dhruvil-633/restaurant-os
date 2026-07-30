import { Router } from 'express';
import {
  getHealthScore,
  getKitchenHeatmap,
  getMenuPerformance,
  getPeakHours,
  getReplay,
  getWasteAnalytics,
} from '../controllers/analyticsController';
import {
  getOrderTypeBreakdown,
  getOverview,
  getPopularDishes,
  getRecentActivity,
  getRevenueChart,
} from '../controllers/dashboardController';
import { getMyPerformance } from '../controllers/personalController';
import {
  exportCustomersCsv,
  exportEmployeesCsv,
  exportInventoryCsv,
  exportMenuSalesCsv,
  exportOrdersCsv,
  exportRevenueCsv,
  getCustomerReport,
  getInventoryReport,
  getOrdersReport,
  getRevenueReport,
} from '../controllers/reportController';
import {
  deleteUpload,
  getRestaurantSettings,
  getWorkspaceStatus,
  globalSearch,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateRestaurantSettings,
  uploadFile,
} from '../controllers/miscController';
import { authenticate, authorize } from '../middlewares/auth';
import { uploadRateLimiter } from '../middlewares/rateLimit';
import { uploadDocument } from '../middlewares/upload';
import { validate } from '../middlewares/validate';
import { uuidParamSchema } from '../validators/common';

/* ── Dashboard ──────────────────────────────────────────────────────────── */

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

// Every signed-in role can see their own shift; the business-wide figures
// below are what management uses.
dashboardRouter.get('/me', getMyPerformance);

// Business-wide figures are management-only; floor and kitchen staff get
// their own numbers from /dashboard/me instead.
const management = authorize('owner', 'manager');

dashboardRouter.get('/overview', management, getOverview);
dashboardRouter.get('/revenue-chart', management, getRevenueChart);
dashboardRouter.get('/popular-dishes', management, getPopularDishes);
dashboardRouter.get('/order-mix', management, getOrderTypeBreakdown);
dashboardRouter.get('/activity', management, getRecentActivity);

/* ── Analytics ──────────────────────────────────────────────────────────── */

export const analyticsRouter = Router();

// Business intelligence is management-only; the floor sees operational data.
analyticsRouter.use(authenticate, authorize('owner', 'manager'));

analyticsRouter.get('/replay', getReplay);
analyticsRouter.get('/kitchen-heatmap', getKitchenHeatmap);
analyticsRouter.get('/waste', getWasteAnalytics);
analyticsRouter.get('/health-score', getHealthScore);
analyticsRouter.get('/peak-hours', getPeakHours);
analyticsRouter.get('/menu-performance', getMenuPerformance);

/* ── Reports ────────────────────────────────────────────────────────────── */

export const reportRouter = Router();
reportRouter.use(authenticate, authorize('owner', 'manager'));

reportRouter.get('/revenue', getRevenueReport);
reportRouter.get('/orders', getOrdersReport);
reportRouter.get('/customers', getCustomerReport);
reportRouter.get('/inventory', getInventoryReport);

reportRouter.get('/revenue/export', exportRevenueCsv);
reportRouter.get('/orders/export', exportOrdersCsv);
reportRouter.get('/customers/export', exportCustomersCsv);
reportRouter.get('/inventory/export', exportInventoryCsv);
// The employee export carries salary figures.
reportRouter.get('/employees/export', authorize('owner'), exportEmployeesCsv);
reportRouter.get('/menu-sales/export', exportMenuSalesCsv);

/* ── Notifications ──────────────────────────────────────────────────────── */

export const notificationRouter = Router();
notificationRouter.use(authenticate);

notificationRouter.get('/', listNotifications);
notificationRouter.post('/read-all', markAllNotificationsRead);
notificationRouter.post('/:id/read', validate({ params: uuidParamSchema }), markNotificationRead);

/* ── Uploads ────────────────────────────────────────────────────────────── */

export const uploadRouter = Router();
uploadRouter.use(authenticate, uploadRateLimiter);

uploadRouter.post('/', uploadDocument, uploadFile);
uploadRouter.delete('/', authorize('owner', 'manager'), deleteUpload);

/* ── Search & settings ──────────────────────────────────────────────────── */

export const searchRouter = Router();
searchRouter.use(authenticate);
searchRouter.get('/', globalSearch);

export const settingsRouter = Router();
settingsRouter.use(authenticate);

settingsRouter.get('/', getRestaurantSettings);
settingsRouter.get('/workspace-status', getWorkspaceStatus);
// Tax rate, loyalty accrual and service charge move real money, so only an
// owner may change them. Managers see the values read-only.
settingsRouter.patch('/', authorize('owner'), updateRestaurantSettings);
