import { Router } from 'express';
import {
  changePassword,
  forgotPassword,
  getProfile,
  login,
  logout,
  logoutAll,
  refresh,
  register,
  resetPassword,
  updateProfile,
} from '../controllers/authController';
import { authenticate } from '../middlewares/auth';
import { authRateLimiter } from '../middlewares/rateLimit';
import { validate } from '../middlewares/validate';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '../validators/auth';

export const authRouter = Router();

authRouter.post('/register', authRateLimiter, validate({ body: registerSchema }), register);
authRouter.post('/login', authRateLimiter, validate({ body: loginSchema }), login);
authRouter.post('/refresh', validate({ body: refreshSchema }), refresh);
authRouter.post('/logout', logout);
authRouter.post(
  '/forgot-password',
  authRateLimiter,
  validate({ body: forgotPasswordSchema }),
  forgotPassword,
);
authRouter.post(
  '/reset-password',
  authRateLimiter,
  validate({ body: resetPasswordSchema }),
  resetPassword,
);

authRouter.use(authenticate);

authRouter.get('/me', getProfile);
authRouter.patch('/me', validate({ body: updateProfileSchema }), updateProfile);
authRouter.post('/change-password', validate({ body: changePasswordSchema }), changePassword);
authRouter.post('/logout-all', logoutAll);
