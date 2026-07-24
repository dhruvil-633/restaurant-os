import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BarChart3, ChefHat, Store, UtensilsCrossed } from 'lucide-react';

const HIGHLIGHTS = [
  { icon: Store, title: 'Live floor plan', copy: 'Every table, order and waiter at a glance.' },
  { icon: ChefHat, title: 'Kitchen display', copy: 'Tickets that turn red before a guest complains.' },
  { icon: UtensilsCrossed, title: 'Inventory that self-deducts', copy: 'Recipes drive stock automatically.' },
  { icon: BarChart3, title: 'Health score', copy: 'One number for how the restaurant is really doing.' },
];

export function AuthLayout() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Marketing panel — hidden on small screens where the form is all that matters. */}
      <div className="relative hidden overflow-hidden bg-slate-950 lg:block">
        <div className="absolute inset-0 grid-texture opacity-[0.06]" />
        <div className="absolute -left-32 -top-32 size-[26rem] rounded-full bg-emerald-500/25 blur-[100px]" />
        <div className="absolute -bottom-40 -right-24 size-[30rem] rounded-full bg-orange-500/18 blur-[110px]" />

        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-500 shadow-lg shadow-emerald-500/25">
              <UtensilsCrossed className="size-5 text-white" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-white">RestaurantOS</span>
          </div>

          <div className="max-w-md">
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="text-4xl font-semibold leading-[1.15] tracking-tight text-white text-balance xl:text-[2.75rem]"
            >
              The operating system for modern restaurants.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4 text-[15px] leading-relaxed text-slate-400"
            >
              Floor, kitchen, inventory and analytics in one place — so the people running
              service are looking at the room, not at spreadsheets.
            </motion.p>

            <div className="mt-10 grid gap-x-6 gap-y-5 sm:grid-cols-2">
              {HIGHLIGHTS.map((item, index) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.16 + index * 0.07 }}
                  className="flex gap-3"
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/8 ring-1 ring-white/10">
                    <item.icon className="size-4 text-emerald-400" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">{item.copy}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-600">
            © {new Date().getFullYear()} RestaurantOS · Built with the MERN-adjacent stack, on Postgres.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-canvas px-5 py-10 sm:px-8">
        <div className="w-full max-w-[26rem]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand">
              <UtensilsCrossed className="size-5 text-white" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-ink">RestaurantOS</span>
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
