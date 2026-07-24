import type { AuthenticatedUser } from './auth';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Present on any route mounted behind `authenticate`. */
      user?: AuthenticatedUser;
    }
  }
}

export {};
