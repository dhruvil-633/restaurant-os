import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { verifyAccessToken } from '../utils/jwt';
import { KITCHEN_ROLES, MANAGEMENT_ROLES, ORDER_ROLES } from '../types/roles';
import type { AuthenticatedUser } from '../types/auth';
import { SOCKET_EVENTS, SOCKET_ROOMS, type SocketEventName } from './events';

interface AuthenticatedSocket extends Socket {
  data: {
    user?: AuthenticatedUser;
  };
}

let io: SocketServer | null = null;

export function initialiseSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: env.corsOrigins,
      credentials: true,
    },
    // Render's free tier can be slow to wake; be generous before giving up.
    pingTimeout: 30_000,
    pingInterval: 25_000,
  });

  // The handshake carries the same access token the REST API uses, so an
  // unauthenticated socket never joins a room or receives an event.
  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      next(new Error('Authentication required'));
      return;
    }

    try {
      const payload = verifyAccessToken(token);
      (socket as AuthenticatedSocket).data.user = {
        id: payload.sub,
        name: payload.name,
        email: payload.email,
        role: payload.role,
      };
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket as AuthenticatedSocket).data.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    socket.join(SOCKET_ROOMS.ALL);
    socket.join(SOCKET_ROOMS.user(user.id));
    socket.join(SOCKET_ROOMS.role(user.role));

    if (KITCHEN_ROLES.includes(user.role)) socket.join(SOCKET_ROOMS.KITCHEN);
    if (ORDER_ROLES.includes(user.role)) socket.join(SOCKET_ROOMS.FLOOR);
    if (MANAGEMENT_ROLES.includes(user.role)) socket.join(SOCKET_ROOMS.MANAGEMENT);

    logger.debug(`Socket connected: ${user.name} (${user.role})`);

    socket.on('disconnect', (reason) => {
      logger.debug(`Socket disconnected: ${user.name} — ${reason}`);
    });
  });

  logger.info('Realtime gateway ready');
  return io;
}

export function getSocketServer(): SocketServer | null {
  return io;
}

/**
 * Emit helpers used by controllers. They no-op when the gateway is not running
 * (for example inside the seed script), so business logic never has to guard.
 */
export const realtime = {
  toAll(event: SocketEventName, payload: unknown): void {
    io?.to(SOCKET_ROOMS.ALL).emit(event, payload);
  },
  toKitchen(event: SocketEventName, payload: unknown): void {
    io?.to(SOCKET_ROOMS.KITCHEN).emit(event, payload);
  },
  toFloor(event: SocketEventName, payload: unknown): void {
    io?.to(SOCKET_ROOMS.FLOOR).emit(event, payload);
  },
  toManagement(event: SocketEventName, payload: unknown): void {
    io?.to(SOCKET_ROOMS.MANAGEMENT).emit(event, payload);
  },
  toUser(userId: string, event: SocketEventName, payload: unknown): void {
    io?.to(SOCKET_ROOMS.user(userId)).emit(event, payload);
  },
  toRole(role: string, event: SocketEventName, payload: unknown): void {
    io?.to(SOCKET_ROOMS.role(role)).emit(event, payload);
  },
};

export async function closeSocketServer(): Promise<void> {
  if (!io) return;
  await new Promise<void>((resolve) => {
    io?.close(() => resolve());
  });
  io = null;
  logger.info('Realtime gateway closed');
}

export { SOCKET_EVENTS, SOCKET_ROOMS };
