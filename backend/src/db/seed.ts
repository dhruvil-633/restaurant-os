import { sql } from 'drizzle-orm';
import { closeDatabaseConnection, db, verifyDatabaseConnection } from './index';
import {
  activityLogs,
  attendance,
  customers,
  employees,
  feedback,
  ingredients,
  inventoryTransactions,
  menuCategories,
  menuItemIngredients,
  menuItems,
  notifications,
  orderItems,
  orders,
  passwordResetTokens,
  purchaseItems,
  purchases,
  refreshTokens,
  reservations,
  restaurantTables,
  roles,
  settings,
  shifts,
  suppliers,
  users,
} from './schema';
import { logger } from '../config/logger';
import { hashPassword } from '../utils/password';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, USER_ROLES } from '../types/roles';

/* ── Deterministic pseudo-randomness ─────────────────────────────────────
   A fixed seed keeps every run reproducible, so screenshots and numbers in
   the README stay consistent with what a fresh database produces.          */

let randomState = 42;

function random(): number {
  randomState = (randomState * 1_664_525 + 1_013_904_223) % 4_294_967_296;
  return randomState / 4_294_967_296;
}

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)] as T;
}

function chance(probability: number): boolean {
  return random() < probability;
}

const money = (value: number): string => (Math.round(value * 100) / 100).toFixed(2);

const DEMO_PASSWORD = 'Password123';
const HISTORY_DAYS = 60;

async function wipe(): Promise<void> {
  logger.info('Clearing existing data…');
  // Order matters only where FKs lack ON DELETE CASCADE.
  await db.delete(inventoryTransactions);
  await db.delete(purchaseItems);
  await db.delete(purchases);
  await db.delete(menuItemIngredients);
  await db.delete(feedback);
  await db.delete(orderItems);
  await db.delete(orders);
  await db.delete(reservations);
  await db.delete(attendance);
  await db.delete(shifts);
  await db.delete(employees);
  await db.delete(customers);
  await db.delete(ingredients);
  await db.delete(suppliers);
  await db.delete(menuItems);
  await db.delete(menuCategories);
  await db.delete(restaurantTables);
  await db.delete(activityLogs);
  await db.delete(notifications);
  await db.delete(settings);
  await db.delete(refreshTokens);
  await db.delete(passwordResetTokens);
  await db.delete(users);
  await db.delete(roles);
}

async function seed(): Promise<void> {
  await verifyDatabaseConnection();
  await wipe();

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  /* ── Roles ───────────────────────────────────────────────────────────── */
  await db.insert(roles).values(
    USER_ROLES.map((role) => ({
      name: role,
      label: ROLE_LABELS[role],
      description: ROLE_DESCRIPTIONS[role],
    })),
  );

  /* ── Users ───────────────────────────────────────────────────────────── */
  const staffSeed = [
    { name: 'Arjun Mehta', email: 'owner@restaurantos.app', role: 'owner' as const, phone: '+91 98200 11111' },
    { name: 'Priya Nair', email: 'manager@restaurantos.app', role: 'manager' as const, phone: '+91 98200 22222' },
    { name: 'Rahul Verma', email: 'cashier@restaurantos.app', role: 'cashier' as const, phone: '+91 98200 33333' },
    { name: 'Sneha Kulkarni', email: 'waiter@restaurantos.app', role: 'waiter' as const, phone: '+91 98200 44444' },
    { name: 'Imran Sheikh', email: 'chef@restaurantos.app', role: 'chef' as const, phone: '+91 98200 55555' },
    { name: 'Divya Rao', email: 'kitchen@restaurantos.app', role: 'kitchen_staff' as const, phone: '+91 98200 66666' },
    { name: 'Karan Patel', email: 'karan@restaurantos.app', role: 'waiter' as const, phone: '+91 98200 77777' },
    { name: 'Meera Joshi', email: 'meera@restaurantos.app', role: 'waiter' as const, phone: '+91 98200 88888' },
  ];

  const userRows = await db
    .insert(users)
    .values(
      staffSeed.map((staff) => ({
        name: staff.name,
        email: staff.email,
        passwordHash,
        role: staff.role,
        phone: staff.phone,
        lastLoginAt: new Date(),
      })),
    )
    .returning();

  const waiters = userRows.filter((user) => user.role === 'waiter');
  const chefs = userRows.filter((user) => user.role === 'chef' || user.role === 'kitchen_staff');
  const owner = userRows[0];
  const manager = userRows[1];

  /* ── Settings ────────────────────────────────────────────────────────── */
  await db.insert(settings).values({
    key: 'restaurant',
    value: {
      restaurantName: 'The Copper Spoon',
      currency: 'INR',
      currencySymbol: '₹',
      taxRatePercent: 5,
      serviceChargePercent: 0,
      loyaltyPointsPerCurrencyUnit: 0.1,
      lowStockNotifications: true,
      averageTableTurnoverMinutes: 55,
      address: '14 Linking Road, Bandra West, Mumbai 400050',
      phone: '+91 22 4000 1234',
      timezone: 'Asia/Kolkata',
    },
    description: 'Restaurant-wide configuration',
    updatedById: owner?.id ?? null,
  });

  /* ── Tables ──────────────────────────────────────────────────────────── */
  const tableSeed: { label: string; capacity: number; section: string; shape: 'square' | 'round' | 'rectangle'; x: number; y: number }[] = [];
  const sections = [
    { name: 'Main Hall', count: 10, baseY: 18 },
    { name: 'Garden', count: 6, baseY: 52 },
    { name: 'Private Dining', count: 4, baseY: 82 },
  ];

  let tableNumber = 1;
  for (const section of sections) {
    for (let index = 0; index < section.count; index += 1) {
      const perRow = 5;
      tableSeed.push({
        label: `T${String(tableNumber).padStart(2, '0')}`,
        capacity: pick([2, 2, 4, 4, 4, 6, 8]),
        section: section.name,
        shape: pick(['square', 'round', 'rectangle'] as const),
        x: 10 + (index % perRow) * 19,
        y: section.baseY + Math.floor(index / perRow) * 16,
      });
      tableNumber += 1;
    }
  }

  const tableRows = await db
    .insert(restaurantTables)
    .values(
      tableSeed.map((table) => ({
        label: table.label,
        capacity: table.capacity,
        section: table.section,
        shape: table.shape,
        positionX: money(table.x),
        positionY: money(table.y),
        status: 'available' as const,
      })),
    )
    .returning();

  /* ── Menu ────────────────────────────────────────────────────────────── */
  const categorySeed = [
    { name: 'Starters', type: 'food' as const, sortOrder: 1 },
    { name: 'Main Course', type: 'food' as const, sortOrder: 2 },
    { name: 'Breads & Rice', type: 'food' as const, sortOrder: 3 },
    { name: 'Beverages', type: 'drinks' as const, sortOrder: 4 },
    { name: 'Desserts', type: 'desserts' as const, sortOrder: 5 },
  ];

  const categoryRows = await db
    .insert(menuCategories)
    .values(
      categorySeed.map((category) => ({
        name: category.name,
        slug: category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        type: category.type,
        sortOrder: category.sortOrder,
        description: `${category.name} on the à la carte menu`,
      })),
    )
    .returning();

  const categoryByName = new Map(categoryRows.map((category) => [category.name, category.id]));

  const dishSeed = [
    ['Starters', 'Paneer Tikka', 340, 118, 14, true, 2],
    ['Starters', 'Chicken 65', 380, 142, 16, false, 3],
    ['Starters', 'Crispy Corn Kernels', 280, 88, 10, true, 1],
    ['Starters', 'Tandoori Mushroom', 320, 104, 15, true, 1],
    ['Starters', 'Prawn Koliwada', 460, 198, 18, false, 2],
    ['Main Course', 'Butter Chicken', 480, 186, 22, false, 1],
    ['Main Course', 'Paneer Butter Masala', 420, 148, 20, true, 1],
    ['Main Course', 'Dal Makhani', 340, 96, 25, true, 0],
    ['Main Course', 'Rogan Josh', 520, 224, 28, false, 2],
    ['Main Course', 'Malai Kofta', 400, 138, 22, true, 0],
    ['Main Course', 'Goan Fish Curry', 560, 248, 24, false, 3],
    ['Breads & Rice', 'Garlic Naan', 90, 22, 8, true, 0],
    ['Breads & Rice', 'Butter Roti', 60, 14, 6, true, 0],
    ['Breads & Rice', 'Hyderabadi Biryani', 460, 178, 30, false, 2],
    ['Breads & Rice', 'Jeera Rice', 220, 62, 12, true, 0],
    ['Beverages', 'Masala Chai', 90, 18, 5, true, 0],
    ['Beverages', 'Fresh Lime Soda', 130, 32, 4, true, 0],
    ['Beverages', 'Mango Lassi', 180, 54, 6, true, 0],
    ['Beverages', 'Cold Coffee', 210, 68, 7, true, 0],
    ['Desserts', 'Gulab Jamun', 160, 44, 6, true, 0],
    ['Desserts', 'Rasmalai', 190, 58, 5, true, 0],
    ['Desserts', 'Chocolate Brownie', 240, 82, 9, true, 0],
  ] as const;

  const dishRows = await db
    .insert(menuItems)
    .values(
      dishSeed.map(([category, name, price, cost, prepTime, vegetarian, spice], index) => ({
        categoryId: categoryByName.get(category) as string,
        name,
        description: `${name} — prepared fresh to order.`,
        price: money(price),
        cost: money(cost),
        prepTimeMinutes: prepTime,
        isVegetarian: vegetarian,
        spiceLevel: spice,
        calories: randomInt(180, 720),
        isFeatured: index % 7 === 0,
        sortOrder: index,
      })),
    )
    .returning();

  /* ── Suppliers & ingredients ─────────────────────────────────────────── */
  const supplierRows = await db
    .insert(suppliers)
    .values([
      { name: 'Sunrise Farms', contactName: 'Vikram Shah', phone: '+91 99300 10001', email: 'orders@sunrisefarms.in', address: 'APMC Market, Vashi' },
      { name: 'Coastal Seafoods', contactName: 'Nita Fernandes', phone: '+91 99300 10002', email: 'sales@coastalseafoods.in', address: 'Sassoon Dock, Colaba' },
      { name: 'Daily Dairy Co.', contactName: 'Ramesh Iyer', phone: '+91 99300 10003', email: 'hello@dailydairy.in', address: 'Andheri East' },
      { name: 'Spice Route Traders', contactName: 'Farah Khan', phone: '+91 99300 10004', email: 'contact@spiceroute.in', address: 'Crawford Market' },
    ])
    .returning();

  const ingredientSeed = [
    ['Chicken', 'Meat', 'kg', 48, 15, 80, 260, 0],
    ['Paneer', 'Dairy', 'kg', 22, 8, 40, 380, 2],
    ['Prawns', 'Seafood', 'kg', 9, 6, 25, 620, 1],
    ['Fish Fillet', 'Seafood', 'kg', 12, 6, 30, 540, 1],
    ['Basmati Rice', 'Grains', 'kg', 85, 25, 120, 145, 3],
    ['Wheat Flour', 'Grains', 'kg', 60, 20, 100, 48, 3],
    ['Butter', 'Dairy', 'kg', 14, 6, 30, 520, 2],
    ['Fresh Cream', 'Dairy', 'l', 11, 8, 25, 260, 2],
    ['Tomatoes', 'Produce', 'kg', 34, 15, 60, 42, 0],
    ['Onions', 'Produce', 'kg', 52, 20, 90, 34, 0],
    ['Mushrooms', 'Produce', 'kg', 7, 5, 20, 190, 0],
    ['Sweet Corn', 'Produce', 'kg', 9, 5, 20, 88, 0],
    ['Garam Masala', 'Spices', 'kg', 4, 2, 10, 780, 3],
    ['Red Chilli Powder', 'Spices', 'kg', 5, 2, 12, 420, 3],
    ['Cooking Oil', 'Pantry', 'l', 38, 15, 70, 140, 3],
    ['Mangoes', 'Produce', 'kg', 6, 8, 25, 180, 0],
    ['Coffee Beans', 'Beverage', 'kg', 5, 3, 12, 900, 3],
    ['Sugar', 'Pantry', 'kg', 40, 15, 70, 46, 3],
  ] as const;

  const today = new Date();

  const ingredientRows = await db
    .insert(ingredients)
    .values(
      ingredientSeed.map(([name, category, unit, stock, min, max, cost, storageIndex]) => {
        const expiry = new Date(today);
        // Perishables expire soon; pantry staples last months.
        expiry.setDate(expiry.getDate() + (storageIndex === 0 ? randomInt(2, 12) : randomInt(60, 240)));
        return {
          name,
          category,
          unit,
          currentStock: money(stock),
          minStock: money(min),
          maxStock: money(max),
          costPerUnit: money(cost),
          supplierId: pick(supplierRows).id,
          storageLocation: ['Cold Room', 'Freezer', 'Chiller', 'Dry Store'][storageIndex] ?? 'Dry Store',
          expiryDate: expiry.toISOString().slice(0, 10),
        };
      }),
    )
    .returning();

  const ingredientByName = new Map(ingredientRows.map((row) => [row.name, row]));

  /* ── Recipes ─────────────────────────────────────────────────────────── */
  const recipeSeed: Record<string, [string, number][]> = {
    'Butter Chicken': [['Chicken', 0.25], ['Butter', 0.04], ['Tomatoes', 0.15], ['Fresh Cream', 0.05]],
    'Paneer Butter Masala': [['Paneer', 0.2], ['Butter', 0.03], ['Tomatoes', 0.14], ['Fresh Cream', 0.04]],
    'Paneer Tikka': [['Paneer', 0.18], ['Onions', 0.06], ['Garam Masala', 0.005]],
    'Chicken 65': [['Chicken', 0.22], ['Red Chilli Powder', 0.006], ['Cooking Oil', 0.05]],
    'Prawn Koliwada': [['Prawns', 0.18], ['Cooking Oil', 0.05], ['Red Chilli Powder', 0.005]],
    'Goan Fish Curry': [['Fish Fillet', 0.24], ['Onions', 0.08], ['Tomatoes', 0.1]],
    'Hyderabadi Biryani': [['Basmati Rice', 0.18], ['Chicken', 0.2], ['Onions', 0.08]],
    'Jeera Rice': [['Basmati Rice', 0.15], ['Cooking Oil', 0.02]],
    'Garlic Naan': [['Wheat Flour', 0.12], ['Butter', 0.01]],
    'Butter Roti': [['Wheat Flour', 0.09], ['Butter', 0.008]],
    'Dal Makhani': [['Butter', 0.03], ['Fresh Cream', 0.04], ['Tomatoes', 0.08]],
    'Malai Kofta': [['Paneer', 0.14], ['Fresh Cream', 0.05], ['Onions', 0.06]],
    'Rogan Josh': [['Chicken', 0.26], ['Onions', 0.1], ['Garam Masala', 0.006]],
    'Tandoori Mushroom': [['Mushrooms', 0.18], ['Garam Masala', 0.004]],
    'Crispy Corn Kernels': [['Sweet Corn', 0.16], ['Cooking Oil', 0.04]],
    'Mango Lassi': [['Mangoes', 0.12], ['Sugar', 0.02]],
    'Cold Coffee': [['Coffee Beans', 0.02], ['Sugar', 0.02]],
    'Masala Chai': [['Sugar', 0.015]],
    'Gulab Jamun': [['Sugar', 0.05], ['Wheat Flour', 0.04]],
    'Rasmalai': [['Sugar', 0.04], ['Fresh Cream', 0.05]],
    'Chocolate Brownie': [['Sugar', 0.05], ['Butter', 0.03], ['Wheat Flour', 0.06]],
    'Fresh Lime Soda': [['Sugar', 0.015]],
  };

  const recipeValues: { menuItemId: string; ingredientId: string; quantity: string }[] = [];
  for (const dish of dishRows) {
    for (const [ingredientName, quantity] of recipeSeed[dish.name] ?? []) {
      const ingredient = ingredientByName.get(ingredientName);
      if (ingredient) {
        recipeValues.push({
          menuItemId: dish.id,
          ingredientId: ingredient.id,
          quantity: quantity.toFixed(3),
        });
      }
    }
  }
  if (recipeValues.length) await db.insert(menuItemIngredients).values(recipeValues);

  /* ── Employees ───────────────────────────────────────────────────────── */
  const employeeRows = await db
    .insert(employees)
    .values(
      userRows.map((user, index) => {
        const hired = new Date(today);
        hired.setMonth(hired.getMonth() - randomInt(3, 40));
        return {
          userId: user.id,
          employeeCode: `EMP${String(index + 1).padStart(3, '0')}`,
          name: user.name,
          position: ROLE_LABELS[user.role],
          department: ['chef', 'kitchen_staff'].includes(user.role) ? 'Kitchen' : 'Service',
          phone: user.phone,
          email: user.email,
          monthlySalary: money(
            { owner: 180_000, manager: 95_000, cashier: 42_000, waiter: 32_000, chef: 78_000, kitchen_staff: 34_000 }[
              user.role
            ] ?? 35_000,
          ),
          hiredAt: hired.toISOString().slice(0, 10),
        };
      }),
    )
    .returning();

  /* ── Attendance (last 30 days) ───────────────────────────────────────── */
  const attendanceValues: (typeof attendance.$inferInsert)[] = [];
  for (let dayOffset = 30; dayOffset >= 1; dayOffset -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    const workDate = date.toISOString().slice(0, 10);

    for (const employee of employeeRows) {
      const roll = random();
      const status = roll > 0.93 ? 'absent' : roll > 0.87 ? 'late' : roll > 0.85 ? 'leave' : 'present';
      if (status === 'absent' || status === 'leave') {
        attendanceValues.push({ employeeId: employee.id, workDate, status, hoursWorked: '0' });
        continue;
      }

      const checkIn = new Date(date);
      checkIn.setHours(status === 'late' ? 11 : 10, randomInt(0, 45), 0, 0);
      const checkOut = new Date(date);
      checkOut.setHours(randomInt(21, 23), randomInt(0, 55), 0, 0);
      const hours = (checkOut.getTime() - checkIn.getTime()) / 3_600_000;

      attendanceValues.push({
        employeeId: employee.id,
        workDate,
        status,
        checkInAt: checkIn,
        checkOutAt: checkOut,
        hoursWorked: hours.toFixed(2),
      });
    }
  }
  await db.insert(attendance).values(attendanceValues);

  /* ── Customers ───────────────────────────────────────────────────────── */
  const firstNames = ['Aditya', 'Ishita', 'Rohan', 'Ananya', 'Vikram', 'Nisha', 'Kabir', 'Tara', 'Aryan', 'Sanya', 'Dev', 'Riya', 'Nikhil', 'Pooja', 'Sameer', 'Aisha', 'Varun', 'Kavya', 'Manav', 'Diya', 'Rishi', 'Neha', 'Aman', 'Shreya'];
  const lastNames = ['Sharma', 'Iyer', 'Kapoor', 'Reddy', 'Bose', 'Menon', 'Chopra', 'Gupta', 'Desai', 'Malhotra', 'Pillai', 'Sinha'];

  const customerValues: (typeof customers.$inferInsert)[] = [];
  for (let index = 0; index < 60; index += 1) {
    const birthday = new Date(1975 + randomInt(0, 30), randomInt(0, 11), randomInt(1, 28));
    customerValues.push({
      name: `${pick(firstNames)} ${pick(lastNames)}`,
      phone: `+91 9${randomInt(1000, 9999)} ${randomInt(10_000, 99_999)}`,
      email: chance(0.7) ? `guest${index + 1}@example.com` : null,
      birthday: birthday.toISOString().slice(0, 10),
      notes: chance(0.2) ? pick(['Prefers a window seat', 'Allergic to peanuts', 'Regular — likes table T04', 'Jain food only']) : null,
    });
  }
  const customerRows = await db.insert(customers).values(customerValues).returning();

  /* ── Order history ───────────────────────────────────────────────────── */
  logger.info(`Generating ${HISTORY_DAYS} days of order history…`);

  const orderValues: (typeof orders.$inferInsert)[] = [];
  const itemsByOrderNumber = new Map<string, { dishIndex: number; quantity: number }[]>();
  const taxRate = 0.05;

  for (let dayOffset = HISTORY_DAYS; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - dayOffset);
    const weekday = day.getDay();

    // Fri/Sat/Sun are meaningfully busier than a Monday.
    const isWeekend = weekday === 0 || weekday === 5 || weekday === 6;
    const orderCount = isWeekend ? randomInt(26, 40) : randomInt(12, 24);

    for (let index = 0; index < orderCount; index += 1) {
      // Two service peaks: lunch and dinner.
      const isDinner = chance(0.62);
      const hour = isDinner ? randomInt(19, 22) : randomInt(12, 15);
      const placedAt = new Date(day);
      placedAt.setHours(hour, randomInt(0, 59), randomInt(0, 59), 0);

      if (placedAt.getTime() > Date.now()) continue;

      const type = chance(0.72) ? 'dine_in' : chance(0.6) ? 'takeaway' : 'delivery';
      const table = type === 'dine_in' ? pick(tableRows) : null;
      const waiter = pick(waiters);
      const chef = pick(chefs);
      const customer = chance(0.65) ? pick(customerRows) : null;

      const lineCount = randomInt(1, 5);
      const lines: { dishIndex: number; quantity: number }[] = [];
      let subtotal = 0;
      let longestPrep = 0;

      for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
        const dishIndex = randomInt(0, dishRows.length - 1);
        const dish = dishRows[dishIndex];
        if (!dish) continue;
        const quantity = chance(0.75) ? 1 : randomInt(2, 3);
        lines.push({ dishIndex, quantity });
        subtotal += Number(dish.price) * quantity;
        longestPrep = Math.max(longestPrep, dish.prepTimeMinutes);
      }

      if (lines.length === 0) continue;

      const discount = chance(0.12) ? Math.round(subtotal * 0.1) : 0;
      const taxAmount = (subtotal - discount) * taxRate;
      const total = subtotal - discount + taxAmount;

      const isCancelled = chance(0.05);
      const orderNumber = `ORD-${day.toISOString().slice(0, 10).replace(/-/g, '')}-${String(
        index + 1,
      ).padStart(4, '0')}`;

      // Kitchen timings drift longer during peak dinner service.
      const cookingDelay = randomInt(1, 4);
      const cookDuration = longestPrep + (isDinner ? randomInt(0, 14) : randomInt(-2, 7));
      const cookingStartedAt = new Date(placedAt.getTime() + cookingDelay * 60_000);
      const readyAt = new Date(cookingStartedAt.getTime() + Math.max(5, cookDuration) * 60_000);
      const servedAt = new Date(readyAt.getTime() + randomInt(1, 6) * 60_000);
      const completedAt = new Date(servedAt.getTime() + randomInt(12, 55) * 60_000);

      orderValues.push({
        orderNumber,
        type,
        status: isCancelled ? 'cancelled' : 'completed',
        priority: chance(0.08) ? 'high' : 'normal',
        tableId: table?.id ?? null,
        customerId: customer?.id ?? null,
        waiterId: waiter?.id ?? null,
        chefId: chef?.id ?? null,
        guestCount: type === 'dine_in' ? randomInt(1, 6) : 1,
        subtotal: money(subtotal),
        taxAmount: money(taxAmount),
        discountAmount: money(discount),
        total: money(total),
        paymentMethod: isCancelled ? null : pick(['cash', 'card', 'upi', 'wallet'] as const),
        paymentStatus: isCancelled ? 'unpaid' : 'paid',
        deliveryAddress: type === 'delivery' ? '204, Sea Breeze Apartments, Bandra West' : null,
        cancelReason: isCancelled ? pick(['Guest left before ordering', 'Duplicate ticket', 'Item unavailable']) : null,
        placedAt,
        cookingStartedAt: isCancelled ? null : cookingStartedAt,
        readyAt: isCancelled ? null : readyAt,
        servedAt: isCancelled ? null : servedAt,
        completedAt: isCancelled ? null : completedAt,
        cancelledAt: isCancelled ? new Date(placedAt.getTime() + 4 * 60_000) : null,
        createdAt: placedAt,
        updatedAt: completedAt,
      });

      itemsByOrderNumber.set(orderNumber, lines);
    }
  }

  // Insert in chunks so a single statement never grows unbounded.
  const CHUNK = 500;
  const insertedOrders: (typeof orders.$inferSelect)[] = [];
  for (let index = 0; index < orderValues.length; index += CHUNK) {
    const chunk = orderValues.slice(index, index + CHUNK);
    const rows = await db.insert(orders).values(chunk).returning();
    insertedOrders.push(...rows);
  }

  const orderItemValues: (typeof orderItems.$inferInsert)[] = [];
  for (const order of insertedOrders) {
    const lines = itemsByOrderNumber.get(order.orderNumber) ?? [];
    for (const line of lines) {
      const dish = dishRows[line.dishIndex];
      if (!dish) continue;
      const unitPrice = Number(dish.price);
      orderItemValues.push({
        orderId: order.id,
        menuItemId: dish.id,
        nameSnapshot: dish.name,
        unitPrice: money(unitPrice),
        quantity: line.quantity,
        lineTotal: money(unitPrice * line.quantity),
        status: order.status === 'cancelled' ? 'cancelled' : 'served',
        prepTimeMinutes: dish.prepTimeMinutes,
        startedAt: order.cookingStartedAt,
        readyAt: order.readyAt,
        createdAt: order.placedAt,
      });
    }
  }

  for (let index = 0; index < orderItemValues.length; index += CHUNK) {
    await db.insert(orderItems).values(orderItemValues.slice(index, index + CHUNK));
  }

  /* ── Customer roll-ups ───────────────────────────────────────────────── */
  await db.execute(sql`
    update customers c
    set visit_count   = stats.visits,
        total_spent   = stats.spent,
        loyalty_points = floor(stats.spent * 0.1),
        first_visit_at = stats.first_visit,
        last_visit_at  = stats.last_visit
    from (
      select customer_id,
             count(*)          as visits,
             sum(total)        as spent,
             min(placed_at)    as first_visit,
             max(placed_at)    as last_visit
      from orders
      where customer_id is not null and status = 'completed'
      group by customer_id
    ) as stats
    where c.id = stats.customer_id
  `);

  /* ── Live floor state ────────────────────────────────────────────────── */
  const liveOrderValues: (typeof orders.$inferInsert)[] = [];
  const liveTables = tableRows.slice(0, 7);
  const liveStatuses = ['pending', 'cooking', 'cooking', 'ready', 'served'] as const;

  liveTables.forEach((table, index) => {
    const status = liveStatuses[index % liveStatuses.length] ?? 'pending';
    const minutesAgo = randomInt(4, 38);
    const placedAt = new Date(Date.now() - minutesAgo * 60_000);

    const lineCount = randomInt(2, 4);
    let subtotal = 0;
    const lines: { dishIndex: number; quantity: number }[] = [];
    for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
      const dishIndex = randomInt(0, dishRows.length - 1);
      const dish = dishRows[dishIndex];
      if (!dish) continue;
      const quantity = chance(0.8) ? 1 : 2;
      lines.push({ dishIndex, quantity });
      subtotal += Number(dish.price) * quantity;
    }

    const taxAmount = subtotal * taxRate;
    const orderNumber = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-9${String(index + 1).padStart(3, '0')}`;

    liveOrderValues.push({
      orderNumber,
      type: 'dine_in',
      status,
      priority: index === 2 ? 'urgent' : 'normal',
      tableId: table.id,
      customerId: pick(customerRows).id,
      waiterId: pick(waiters)?.id ?? null,
      chefId: status === 'pending' ? null : pick(chefs)?.id ?? null,
      guestCount: randomInt(2, 5),
      subtotal: money(subtotal),
      taxAmount: money(taxAmount),
      total: money(subtotal + taxAmount),
      paymentStatus: 'unpaid',
      placedAt,
      cookingStartedAt: status === 'pending' ? null : new Date(placedAt.getTime() + 2 * 60_000),
      readyAt: ['ready', 'served'].includes(status) ? new Date(placedAt.getTime() + 18 * 60_000) : null,
      servedAt: status === 'served' ? new Date(placedAt.getTime() + 22 * 60_000) : null,
      createdAt: placedAt,
    });

    itemsByOrderNumber.set(orderNumber, lines);
  });

  const liveOrders = await db.insert(orders).values(liveOrderValues).returning();

  const liveItemValues: (typeof orderItems.$inferInsert)[] = [];
  for (const order of liveOrders) {
    for (const line of itemsByOrderNumber.get(order.orderNumber) ?? []) {
      const dish = dishRows[line.dishIndex];
      if (!dish) continue;
      const unitPrice = Number(dish.price);
      liveItemValues.push({
        orderId: order.id,
        menuItemId: dish.id,
        nameSnapshot: dish.name,
        unitPrice: money(unitPrice),
        quantity: line.quantity,
        lineTotal: money(unitPrice * line.quantity),
        status:
          order.status === 'pending'
            ? 'queued'
            : order.status === 'cooking'
              ? 'cooking'
              : order.status === 'ready'
                ? 'ready'
                : 'served',
        prepTimeMinutes: dish.prepTimeMinutes,
        startedAt: order.cookingStartedAt,
        readyAt: order.readyAt,
        createdAt: order.placedAt,
      });
    }
  }
  await db.insert(orderItems).values(liveItemValues);

  await db
    .update(restaurantTables)
    .set({ status: 'occupied' })
    .where(sql`id in ${sql.raw(`('${liveTables.map((table) => table.id).join("','")}')`)}`);

  // A couple of tables mid-turnaround makes the floor plan look real.
  const cleaningTables = tableRows.slice(8, 10);
  if (cleaningTables.length) {
    await db
      .update(restaurantTables)
      .set({ status: 'cleaning' })
      .where(sql`id in ${sql.raw(`('${cleaningTables.map((table) => table.id).join("','")}')`)}`);
  }

  /* ── Reservations ────────────────────────────────────────────────────── */
  const reservationValues: (typeof reservations.$inferInsert)[] = [];
  for (let index = 0; index < 26; index += 1) {
    const reservedFor = new Date();
    reservedFor.setDate(reservedFor.getDate() + randomInt(-4, 9));
    reservedFor.setHours(randomInt(12, 22), pick([0, 15, 30, 45]), 0, 0);

    const isPast = reservedFor.getTime() < Date.now();
    const customer = pick(customerRows);

    reservationValues.push({
      reservationCode: `RSV-${reservedFor.toISOString().slice(0, 10).replace(/-/g, '')}-${1000 + index}`,
      customerId: customer.id,
      tableId: chance(0.75) ? pick(tableRows).id : null,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      partySize: randomInt(2, 8),
      reservedFor,
      durationMinutes: pick([60, 90, 90, 120]),
      status: isPast
        ? pick(['completed', 'completed', 'completed', 'no_show'] as const)
        : pick(['confirmed', 'confirmed', 'pending'] as const),
      specialRequest: chance(0.35)
        ? pick(['Birthday celebration — please arrange a cake', 'Window table preferred', 'High chair needed', 'Anniversary dinner'])
        : null,
      createdById: manager?.id ?? null,
    });
  }
  await db.insert(reservations).values(reservationValues);

  /* ── Feedback ────────────────────────────────────────────────────────── */
  const completedOrders = insertedOrders.filter((order) => order.status === 'completed');
  const feedbackValues: (typeof feedback.$inferInsert)[] = [];

  for (const order of completedOrders) {
    if (!chance(0.28)) continue;
    // Skewed positive, as real restaurant reviews tend to be.
    const rating = chance(0.68) ? randomInt(4, 5) : randomInt(2, 4);
    feedbackValues.push({
      orderId: order.id,
      customerId: order.customerId,
      rating,
      foodRating: Math.max(1, Math.min(5, rating + randomInt(-1, 1))),
      serviceRating: Math.max(1, Math.min(5, rating + randomInt(-1, 1))),
      ambienceRating: Math.max(1, Math.min(5, rating + randomInt(-1, 1))),
      comment: chance(0.45)
        ? rating >= 4
          ? pick(['Excellent food and warm service.', 'The butter chicken was outstanding.', 'Lovely ambience, will return.', 'Quick service even on a busy night.'])
          : pick(['Food took longer than expected.', 'Order arrived cold.', 'Service was slow this evening.', 'Portion sizes were small for the price.'])
        : null,
      createdAt: order.completedAt ?? order.placedAt,
    });
  }
  for (let index = 0; index < feedbackValues.length; index += CHUNK) {
    await db.insert(feedback).values(feedbackValues.slice(index, index + CHUNK));
  }

  /* ── Purchases & inventory ledger ────────────────────────────────────── */
  const purchaseRows = await db
    .insert(purchases)
    .values(
      Array.from({ length: 12 }, (_, index) => {
        const orderedAt = new Date(today);
        orderedAt.setDate(orderedAt.getDate() - (index * 5 + randomInt(0, 3)));
        return {
          purchaseNumber: `PO-${orderedAt.toISOString().slice(0, 10).replace(/-/g, '')}-${String(index + 1).padStart(4, '0')}`,
          supplierId: pick(supplierRows).id,
          status: index < 10 ? ('received' as const) : ('ordered' as const),
          invoiceNumber: `INV-${randomInt(10_000, 99_999)}`,
          totalAmount: '0',
          orderedAt,
          receivedAt: index < 10 ? orderedAt : null,
          createdById: manager?.id ?? null,
        };
      }),
    )
    .returning();

  const purchaseItemValues: (typeof purchaseItems.$inferInsert)[] = [];
  const ledgerValues: (typeof inventoryTransactions.$inferInsert)[] = [];

  for (const purchase of purchaseRows) {
    let purchaseTotal = 0;
    const lineCount = randomInt(3, 6);
    const used = new Set<string>();

    for (let index = 0; index < lineCount; index += 1) {
      const ingredient = pick(ingredientRows);
      if (used.has(ingredient.id)) continue;
      used.add(ingredient.id);

      const quantity = randomInt(5, 40);
      const unitCost = Number(ingredient.costPerUnit);
      const lineTotal = quantity * unitCost;
      purchaseTotal += lineTotal;

      purchaseItemValues.push({
        purchaseId: purchase.id,
        ingredientId: ingredient.id,
        quantity: quantity.toFixed(3),
        unitCost: money(unitCost),
        lineTotal: money(lineTotal),
      });

      if (purchase.status === 'received') {
        ledgerValues.push({
          ingredientId: ingredient.id,
          type: 'purchase',
          quantity: quantity.toFixed(3),
          unitCost: money(unitCost),
          totalCost: money(lineTotal),
          note: `Received on ${purchase.purchaseNumber}`,
          performedById: manager?.id ?? null,
          occurredAt: purchase.receivedAt ?? purchase.orderedAt,
        });
      }
    }

    await db
      .update(purchases)
      .set({ totalAmount: money(purchaseTotal) })
      .where(sql`id = ${purchase.id}`);
  }

  await db.insert(purchaseItems).values(purchaseItemValues);

  // Waste events across the window — the raw material for Waste Analytics.
  const wasteReasons = ['expired', 'spoiled', 'overcooked', 'customer_return', 'spillage', 'preparation_error', 'other'] as const;
  for (let dayOffset = HISTORY_DAYS; dayOffset >= 0; dayOffset -= 1) {
    if (!chance(0.55)) continue;
    const occurredAt = new Date(today);
    occurredAt.setDate(occurredAt.getDate() - dayOffset);
    occurredAt.setHours(randomInt(14, 23), randomInt(0, 59), 0, 0);

    const incidents = randomInt(1, 3);
    for (let index = 0; index < incidents; index += 1) {
      const ingredient = pick(ingredientRows);
      const quantity = Number((random() * 2.5 + 0.2).toFixed(3));
      const unitCost = Number(ingredient.costPerUnit);
      ledgerValues.push({
        ingredientId: ingredient.id,
        type: 'waste',
        quantity: (-quantity).toFixed(3),
        unitCost: money(unitCost),
        totalCost: money(quantity * unitCost),
        wasteReason: pick(wasteReasons),
        note: chance(0.4) ? 'Recorded during closing stock check' : null,
        performedById: pick(chefs)?.id ?? null,
        occurredAt,
      });
    }
  }

  for (let index = 0; index < ledgerValues.length; index += CHUNK) {
    await db.insert(inventoryTransactions).values(ledgerValues.slice(index, index + CHUNK));
  }

  /* ── Activity log (drives Restaurant Replay) ─────────────────────────── */
  const activityValues: (typeof activityLogs.$inferInsert)[] = [];

  for (const order of insertedOrders.slice(-320)) {
    const waiter = userRows.find((user) => user.id === order.waiterId);
    activityValues.push({
      userId: order.waiterId,
      actorName: waiter?.name ?? 'Staff',
      action: 'order.created',
      entityType: 'order',
      entityId: order.id,
      description: `${waiter?.name ?? 'Staff'} placed order ${order.orderNumber}`,
      metadata: { total: Number(order.total), type: order.type },
      occurredAt: order.placedAt,
    });

    if (order.readyAt) {
      const chef = userRows.find((user) => user.id === order.chefId);
      activityValues.push({
        userId: order.chefId,
        actorName: chef?.name ?? 'Kitchen',
        action: 'order.ready',
        entityType: 'order',
        entityId: order.id,
        description: `${chef?.name ?? 'Kitchen'} marked ${order.orderNumber} ready`,
        occurredAt: order.readyAt,
      });
    }

    if (order.completedAt) {
      activityValues.push({
        userId: order.waiterId,
        actorName: waiter?.name ?? 'Staff',
        action: 'order.settled',
        entityType: 'order',
        entityId: order.id,
        description: `${waiter?.name ?? 'Staff'} settled ${order.orderNumber} by ${order.paymentMethod ?? 'cash'}`,
        metadata: { total: Number(order.total) },
        occurredAt: order.completedAt,
      });
    }
  }

  for (let index = 0; index < activityValues.length; index += CHUNK) {
    await db.insert(activityLogs).values(activityValues.slice(index, index + CHUNK));
  }

  /* ── Notifications ───────────────────────────────────────────────────── */
  await db.insert(notifications).values([
    {
      targetRole: 'manager',
      type: 'inventory_low',
      title: 'Prawns are running low',
      message: '9 kg left (minimum 6 kg) — reorder from Coastal Seafoods.',
      link: '/inventory',
    },
    {
      targetRole: 'chef',
      type: 'order_created',
      title: 'New order on table T03',
      message: '3 items queued for the kitchen.',
      link: '/kitchen',
    },
    {
      targetRole: 'owner',
      type: 'feedback_received',
      title: '2-star review received',
      message: 'Food took longer than expected.',
      link: '/customers',
    },
    {
      targetRole: 'manager',
      type: 'reservation_created',
      title: 'Table booked for 8 guests',
      message: 'Anniversary dinner this Saturday at 8:30 PM.',
      link: '/reservations',
      isRead: true,
    },
  ]);

  /* ── Summary ─────────────────────────────────────────────────────────── */
  const revenue = insertedOrders
    .filter((order) => order.status === 'completed')
    .reduce((sum, order) => sum + Number(order.total), 0);

  logger.info('');
  logger.info('╔══════════════════════════════════════════════════════════╗');
  logger.info('║  RestaurantOS seeded successfully                        ║');
  logger.info('╚══════════════════════════════════════════════════════════╝');
  logger.info('');
  logger.info(`  Staff accounts     ${userRows.length}`);
  logger.info(`  Tables             ${tableRows.length}`);
  logger.info(`  Menu items         ${dishRows.length} across ${categoryRows.length} categories`);
  logger.info(`  Ingredients        ${ingredientRows.length} from ${supplierRows.length} suppliers`);
  logger.info(`  Customers          ${customerRows.length}`);
  logger.info(`  Historical orders  ${insertedOrders.length} over ${HISTORY_DAYS} days`);
  logger.info(`  Live orders        ${liveOrders.length} on the floor right now`);
  logger.info(`  Reservations       ${reservationValues.length}`);
  logger.info(`  Reviews            ${feedbackValues.length}`);
  logger.info(`  Stock movements    ${ledgerValues.length}`);
  logger.info(`  Revenue on record  ₹${Math.round(revenue).toLocaleString('en-IN')}`);
  logger.info('');
  logger.info('  Sign in with any of these — password for all is:');
  logger.info(`  \x1b[36m${DEMO_PASSWORD}\x1b[0m`);
  logger.info('');
  for (const staff of staffSeed.slice(0, 6)) {
    logger.info(`    ${ROLE_LABELS[staff.role].padEnd(14)} ${staff.email}`);
  }
  logger.info('');
}

seed()
  .then(async () => {
    await closeDatabaseConnection();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    logger.error('Seeding failed', error);
    await closeDatabaseConnection().catch(() => undefined);
    process.exit(1);
  });
