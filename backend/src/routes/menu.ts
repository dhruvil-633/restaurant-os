import { Router } from 'express';
import {
  createCategory,
  createMenuItem,
  deleteCategory,
  deleteMenuItem,
  getMenuForOrdering,
  getMenuItem,
  listCategories,
  listMenuItems,
  setRecipe,
  toggleAvailability,
  updateCategory,
  updateMenuItem,
} from '../controllers/menuController';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  createCategorySchema,
  createMenuItemSchema,
  recipeSchema,
  updateCategorySchema,
  updateMenuItemSchema,
} from '../validators/menu';
import { uuidParamSchema } from '../validators/common';

export const menuRouter = Router();

menuRouter.use(authenticate);

// Reading the menu is required by every role that can take an order.
menuRouter.get('/categories', listCategories);
menuRouter.get('/items', listMenuItems);
menuRouter.get('/for-ordering', getMenuForOrdering);
menuRouter.get('/items/:id', validate({ params: uuidParamSchema }), getMenuItem);

const canEditMenu = authorize('owner', 'manager');

menuRouter.post('/categories', canEditMenu, validate({ body: createCategorySchema }), createCategory);
menuRouter.patch(
  '/categories/:id',
  canEditMenu,
  validate({ params: uuidParamSchema, body: updateCategorySchema }),
  updateCategory,
);
menuRouter.delete(
  '/categories/:id',
  canEditMenu,
  validate({ params: uuidParamSchema }),
  deleteCategory,
);

menuRouter.post('/items', canEditMenu, validate({ body: createMenuItemSchema }), createMenuItem);
menuRouter.patch(
  '/items/:id',
  canEditMenu,
  validate({ params: uuidParamSchema, body: updateMenuItemSchema }),
  updateMenuItem,
);
menuRouter.delete('/items/:id', canEditMenu, validate({ params: uuidParamSchema }), deleteMenuItem);
menuRouter.post('/items/:id/recipe', canEditMenu, validate({ params: uuidParamSchema, body: recipeSchema }), setRecipe);

// Chefs mark a dish sold out mid-service, so they can toggle availability too.
menuRouter.patch(
  '/items/:id/availability',
  authorize('owner', 'manager', 'chef', 'kitchen_staff'),
  validate({ params: uuidParamSchema }),
  toggleAvailability,
);
