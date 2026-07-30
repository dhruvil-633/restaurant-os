import { Router } from 'express';
import { authRouter } from './auth';
import {
  customerRouter,
  employeeRouter,
  feedbackRouter,
  inventoryRouter,
  reservationRouter,
} from './domain';
import {
  analyticsRouter,
  dashboardRouter,
  notificationRouter,
  reportRouter,
  searchRouter,
  settingsRouter,
  uploadRouter,
} from './insights';
import { menuRouter } from './menu';
import { kitchenRouter, orderRouter } from './orders';
import { publicRouter } from './publicRoutes';
import { tableRouter } from './tables';
import { userRouter } from './users';

export const apiRouter = Router();

// Guest-facing routes — mounted before the authenticated ones and rate
// limited independently inside the router itself.
apiRouter.use('/public', publicRouter);

apiRouter.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'RestaurantOS API',
    data: {
      version: '1.0.0',
      endpoints: [
        '/api/auth',
        '/api/users',
        '/api/menu',
        '/api/tables',
        '/api/orders',
        '/api/kitchen',
        '/api/reservations',
        '/api/customers',
        '/api/feedback',
        '/api/employees',
        '/api/inventory',
        '/api/dashboard',
        '/api/analytics',
        '/api/reports',
        '/api/notifications',
        '/api/uploads',
        '/api/search',
        '/api/settings',
      ],
    },
  });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/menu', menuRouter);
apiRouter.use('/tables', tableRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/kitchen', kitchenRouter);
apiRouter.use('/reservations', reservationRouter);
apiRouter.use('/customers', customerRouter);
apiRouter.use('/feedback', feedbackRouter);
apiRouter.use('/employees', employeeRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/reports', reportRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/uploads', uploadRouter);
apiRouter.use('/search', searchRouter);
apiRouter.use('/settings', settingsRouter);
