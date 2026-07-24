import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { API_ORIGIN, tokenStore } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { QUERY_KEYS, SOCKET_EVENTS } from '@/constants/socketEvents';
import type { AppNotification, Order } from '@/types';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

/**
 * Opens one authenticated socket for the whole app and translates server
 * events into React Query cache invalidations, so any screen showing the
 * affected data refreshes without its own subscription.
 */
export function useSocketConnection(): { connected: boolean } {
  const queryClient = useQueryClient();
  const status = useAuthStore((state) => state.status);
  const userRole = useAuthStore((state) => state.user?.role);
  const [connected, setConnected] = useState(false);

  // Kept in a ref so the effect does not re-run when the callback identity
  // changes — the socket should be created once per session.
  const clientRef = useRef(queryClient);
  clientRef.current = queryClient;

  useEffect(() => {
    if (status !== 'authenticated') return undefined;

    const token = tokenStore.getAccessToken();
    if (!token) return undefined;

    const instance = io(API_ORIGIN, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 8,
      reconnectionDelay: 1200,
    });

    socket = instance;

    instance.on('connect', () => setConnected(true));
    instance.on('disconnect', () => setConnected(false));
    instance.on('connect_error', () => setConnected(false));

    const invalidate = (keys: readonly (readonly unknown[])[]): void => {
      for (const key of keys) {
        void clientRef.current.invalidateQueries({ queryKey: key });
      }
    };

    instance.on(SOCKET_EVENTS.ORDER_CREATED, (order: Order) => {
      invalidate([QUERY_KEYS.orders, QUERY_KEYS.kitchenQueue, QUERY_KEYS.tables, QUERY_KEYS.dashboard]);
      if (userRole === 'chef' || userRole === 'kitchen_staff') {
        toast.info(`New order ${order.orderNumber}`, {
          description: order.tableLabel ? `Table ${order.tableLabel}` : 'Takeaway / delivery',
        });
      }
    });

    instance.on(SOCKET_EVENTS.ORDER_UPDATED, () => {
      invalidate([QUERY_KEYS.orders, QUERY_KEYS.kitchenQueue, QUERY_KEYS.tables]);
    });

    instance.on(SOCKET_EVENTS.ORDER_ITEM_UPDATED, () => {
      invalidate([QUERY_KEYS.orders, QUERY_KEYS.kitchenQueue]);
    });

    instance.on(SOCKET_EVENTS.ORDER_READY, (order: Order) => {
      invalidate([QUERY_KEYS.orders, QUERY_KEYS.kitchenQueue, QUERY_KEYS.tables]);
      if (userRole && ['waiter', 'manager', 'owner', 'cashier'].includes(userRole)) {
        toast.success(`Order ${order.orderNumber} is ready`, {
          description: order.tableLabel ? `Serve table ${order.tableLabel}` : 'Ready for pickup',
        });
      }
    });

    instance.on(SOCKET_EVENTS.ORDER_COMPLETED, () => {
      invalidate([QUERY_KEYS.orders, QUERY_KEYS.tables, QUERY_KEYS.dashboard, QUERY_KEYS.kitchenQueue]);
    });

    instance.on(SOCKET_EVENTS.ORDER_CANCELLED, () => {
      invalidate([QUERY_KEYS.orders, QUERY_KEYS.tables, QUERY_KEYS.kitchenQueue, QUERY_KEYS.dashboard]);
    });

    instance.on(SOCKET_EVENTS.TABLE_UPDATED, () => {
      invalidate([QUERY_KEYS.tables, QUERY_KEYS.waitTime]);
    });

    instance.on(SOCKET_EVENTS.RESERVATION_CREATED, () => {
      invalidate([QUERY_KEYS.reservations, QUERY_KEYS.tables, QUERY_KEYS.dashboard]);
    });

    instance.on(SOCKET_EVENTS.RESERVATION_UPDATED, () => {
      invalidate([QUERY_KEYS.reservations, QUERY_KEYS.tables]);
    });

    instance.on(SOCKET_EVENTS.INVENTORY_ALERT, (payload: { name: string; currentStock: number; unit: string }) => {
      invalidate([QUERY_KEYS.inventory, QUERY_KEYS.dashboard]);
      toast.warning(`${payload.name} is running low`, {
        description: `${payload.currentStock} ${payload.unit} remaining`,
      });
    });

    instance.on(SOCKET_EVENTS.INVENTORY_UPDATED, () => {
      invalidate([QUERY_KEYS.inventory]);
    });

    instance.on(SOCKET_EVENTS.NOTIFICATION_NEW, (notification: AppNotification) => {
      invalidate([QUERY_KEYS.notifications]);
      toast(notification.title, { description: notification.message });
    });

    instance.on(SOCKET_EVENTS.ACTIVITY_LOGGED, () => {
      invalidate([QUERY_KEYS.activity]);
    });

    return () => {
      instance.removeAllListeners();
      instance.disconnect();
      socket = null;
      setConnected(false);
    };
  }, [status, userRole]);

  return { connected };
}
