import { Router } from 'express';
import { authRouter } from './auth';

export const apiRouter = Router();

apiRouter.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'RestaurantOS API',
    data: {
      version: '1.0.0',
      endpoints: ['/api/auth'],
    },
  });
});

apiRouter.use('/auth', authRouter);
