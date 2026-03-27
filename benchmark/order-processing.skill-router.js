// code-after-custom.js
// Rewritten applying: clean-code-reviewer + design-patterns (via skill-router)
//
// Patterns applied (design-patterns skill):
//   Strategy  — payment methods (GoF: encapsulate interchangeable algorithms)
//   Strategy  — discount tiers  (GoF: data-driven, open for extension)
//   State     — order lifecycle (GoF: each status owns its valid transitions)
//   Singleton — stats           (GoF: deliberate, clean, no accidental shared state)
//   Observer  — side effects    (GoF: email/stats decoupled from business logic)
//   Facade    — module API      (GoF: single clean surface, internals hidden)
//   Template Method — validation (GoF: fixed skeleton, variable steps)
//
// Principles applied (clean-code-reviewer skill):
//   N1/N2  — intention-revealing names at the right abstraction level
//   F1/F2  — small functions, one responsibility each
//   G5     — DRY: no duplicated confirmation block
//   G25    — named constants, no magic numbers
//   G23    — data-driven lookup, not if-chain
//   G28    — encapsulated predicates
//   G30    — functions do one thing
//   Ch.7   — throw with context, never silent return false
//   G4     — parameterised queries, no eval, no safety overrides

'use strict';

const db     = require('./db');
const mailer = require('./mailer');

// ─── Constants ────────────────────────────────────────────────────────────────

const TAX_RATE = 0.23;

// Strategy: discount tiers — add a new tier here, nothing else changes (G23, G25)
const DISCOUNT_BY_TIER = Object.freeze({
  standard: 0,
  premium:  0.10,
  vip:      0.20,
  staff:    0.50,
});

// Strategy: payment processors — add a new method here, nothing else changes
const PAYMENT_PROCESSORS = Object.freeze({
  card: {
    charge(user, amount) {
      // TODO: integrate real payment gateway
      console.log(`Charging card (...${String(user.card).slice(-4)}) for ${formatMoney(amount)}`);
      return true;
    },
  },
  paypal: {
    charge(user, amount) {
      // TODO: integrate PayPal SDK
      console.log(`Charging PayPal ${user.paypal} for ${formatMoney(amount)}`);
      return true;
    },
  },
  crypto: {
    charge() {
      throw new Error('Crypto payments are not yet implemented');
    },
  },
});

// ─── State: order lifecycle ───────────────────────────────────────────────────
// Each state owns its own transition rules.
// Adding a new status = adding one object. No existing guards change.

const ORDER_STATES = Object.freeze({
  pending: {
    canCancel: () => true,
    canRefund: () => false,
  },
  paid: {
    canCancel: () => true,
    canRefund: () => true,
  },
  shipped: {
    canCancel: () => false,
    canRefund: () => false,
  },
  delivered: {
    canCancel: () => false,
    canRefund: () => true,
  },
  cancelled: {
    canCancel: () => false,
    canRefund: () => false,
  },
  refunded: {
    canCancel: () => false,
    canRefund: () => false,
  },
});

function getOrderState(status) {
  const state = ORDER_STATES[status];
  if (!state) throw new Error(`Unknown order status: ${status}`);
  return state;
}

// ─── Singleton: stats ─────────────────────────────────────────────────────────
// Deliberate, clean singleton. Not an accidental module-scope variable.

const Stats = (() => {
  const data = { orders: 0, revenue: 0, cancelled: 0 };
  return {
    recordPlaced(total)    { data.orders++; data.revenue += total; },
    recordCancelled(total) { data.cancelled++; data.revenue -= total; },
    recordRefunded(total)  { data.cancelled++; data.revenue -= total; },
    snapshot()             { return { ...data }; },
  };
})();

// ─── Observer: event bus ──────────────────────────────────────────────────────
// Business logic emits events. Side effects (email, stats) register as listeners.
// Adding SMS or audit log = one new listener. Core functions unchanged.

const EventBus = (() => {
  const listeners = {};
  return {
    on(event, fn)   { (listeners[event] = listeners[event] || []).push(fn); },
    emit(event, payload) { (listeners[event] || []).forEach(fn => fn(payload)); },
  };
})();

// Register observers at startup — not inside business functions
EventBus.on('order.placed', ({ user, total }) => {
  mailer.send(user.email, 'Order confirmed', `Your order total is ${formatMoney(total)}.`);
  Stats.recordPlaced(total);
});

EventBus.on('order.cancelled', ({ order, total }) => {
  mailer.send(order.user_email, 'Order cancelled', 'Your order has been cancelled.');
  Stats.recordCancelled(total);
});

EventBus.on('order.refunded', ({ order, total }) => {
  mailer.send(order.user_email, 'Refund processed', `Your refund of ${formatMoney(total)} is on its way.`);
  Stats.recordRefunded(total);
});

// ─── Validation (Template Method skeleton) ────────────────────────────────────
// Fixed skeleton: check preconditions, then run action. (G28, Ch.7)

function assertActiveUser(user) {
  if (!user)        throw new Error('user is required');
  if (!user.active) throw new Error(`User ${user.id} is not active`);
}

function assertValidOrder(order) {
  if (!order?.items?.length) throw new Error('order must contain at least one item');
}

function assertSupportedPayment(method) {
  if (!PAYMENT_PROCESSORS[method]) throw new Error(`Unsupported payment method: ${method}`);
}

// ─── Calculation (F1: one responsibility each) ────────────────────────────────

function calculateSubtotal(items) {
  return items
    .filter(item => item.qty > 0 && item.price > 0)
    .reduce((sum, item) => sum + item.qty * item.price, 0);
}

function applyTierDiscount(amount, userTier) {
  const rate = DISCOUNT_BY_TIER[userTier] ?? 0; // G25: named table, not magic number
  return amount * (1 - rate);
}

function applyTax(amount) {
  return amount * (1 + TAX_RATE);
}

// ─── Persistence ──────────────────────────────────────────────────────────────
// Each function does one thing. Parameterised queries throughout (G4).

async function persistOrder(order, user, total) {
  await db.query(
    'INSERT INTO orders (id, user_id, total, status) VALUES (?, ?, ?, ?)',
    [order.id, user.id, total, 'paid'],
  );
}

async function fetchOrder(orderId) {
  const order = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order) throw new Error(`Order not found: ${orderId}`);
  return order;
}

async function persistCancellation(orderId, reason) {
  await db.query(
    'UPDATE orders SET status = ?, reason = ? WHERE id = ?',
    ['cancelled', reason, orderId],
  );
}

async function persistRefund(orderId) {
  await db.query('UPDATE orders SET status = ? WHERE id = ?', ['refunded', orderId]);
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function formatMoney(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// ─── Facade: public API ───────────────────────────────────────────────────────
// Callers import one clean surface. All internals (strategies, state,
// observer, singleton) are hidden and can evolve independently.

async function processOrder(order, user, paymentMethod) {
  // Template Method: validate → calculate → charge → persist → notify (via Observer)
  assertActiveUser(user);
  assertValidOrder(order);
  assertSupportedPayment(paymentMethod);

  const subtotal   = calculateSubtotal(order.items);
  const discounted = applyTierDiscount(subtotal, user.type);
  const total      = applyTax(discounted);

  // Strategy pattern: dispatch to the right processor, one confirmation path
  PAYMENT_PROCESSORS[paymentMethod].charge(user, total);
  await persistOrder(order, user, total);

  // Observer: emit event — email and stats handled by listeners, not here
  EventBus.emit('order.placed', { user, order, total });
}

async function getUserOrders(userId) {
  return db.query('SELECT * FROM orders WHERE user_id = ?', [userId]);
}

async function cancelOrder(orderId, userId, reason) {
  const order = await fetchOrder(orderId);

  if (order.userId !== userId) throw new Error('Order does not belong to this user');

  // State pattern: the status object decides whether cancellation is legal
  if (!getOrderState(order.status).canCancel()) {
    throw new Error(`Order ${orderId} cannot be cancelled (status: ${order.status})`);
  }

  await persistCancellation(orderId, reason);
  EventBus.emit('order.cancelled', { order, total: order.total });
}

async function refundOrder(orderId) {
  const order = await fetchOrder(orderId);

  // State pattern: the status object decides whether refund is legal
  if (!getOrderState(order.status).canRefund()) {
    throw new Error(`Order ${orderId} cannot be refunded (status: ${order.status})`);
  }

  await persistRefund(orderId);
  EventBus.emit('order.refunded', { order, total: order.total });
}

function getStats() {
  return Stats.snapshot(); // Singleton: clean access, defensive copy
}

// Facade export: one coherent interface
module.exports = {
  processOrder,
  getUserOrders,
  cancelOrder,
  refundOrder,
  getStats,
};
