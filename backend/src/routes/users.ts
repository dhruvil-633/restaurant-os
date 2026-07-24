import { Router } from 'express';
import {
  createUser,
  deleteUser,
  getRoles,
  getUser,
  listAssignableStaff,
  listUsers,
  resetUserPassword,
  updateUser,
} from '../controllers/userController';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createUserSchema, updateUserSchema } from '../validators/auth';
import { uuidParamSchema } from '../validators/common';

export const userRouter = Router();

userRouter.use(authenticate);

// Every signed-in role needs the staff picker to assign waiters and chefs.
userRouter.get('/assignable', listAssignableStaff);
userRouter.get('/roles', getRoles);

userRouter.use(authorize('owner', 'manager'));

userRouter.get('/', listUsers);
userRouter.post('/', validate({ body: createUserSchema }), createUser);
userRouter.get('/:id', validate({ params: uuidParamSchema }), getUser);
userRouter.patch(
  '/:id',
  validate({ params: uuidParamSchema, body: updateUserSchema }),
  updateUser,
);
userRouter.post('/:id/reset-password', validate({ params: uuidParamSchema }), resetUserPassword);
userRouter.delete('/:id', validate({ params: uuidParamSchema }), deleteUser);
