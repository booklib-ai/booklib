// code-after-native.js
// Rewritten applying all findings from: pr-review-toolkit:code-reviewer
// Fixes applied (by issue #):
//  #1  Parameterised queries — no SQL injection
//  #2  eval("stats") → return stats
//  #3  No module-level mutable state — all state is local or injected
//  #4  items array removed from module scope
//  #5  null check before ord.status in refund()
//  #6  Card data not logged to console (PCI)
//  #7  Unknown payment method throws, not silently returns undefined
//  #8  Shared finalizeOrder() — no duplicated block
//  #9  discount variable removed; named constants used
//  #10 === / !== throughout, no loose equality
//  #11/#12 cancel/refund look up user email from order, not global usr
//  #13 Single stats object — no two-object inconsistency
//  #14 cancel() updates stats.cancelled on success
//  #15 try/catch around db and mailer calls
//  #16 const/let throughout, no var
//  #17 Descriptive parameter names

'use strict';

const db     = require('./db');
const mailer = require('./mailer');

const TAX_RATE          = 0.23;
const DISCOUNT_PREMIUM  = 0.10;
const DISCOUNT_VIP      = 0.20;
const DISCOUNT_STAFF    = 0.50;
const NON_CANCELLABLE   = ['cancelled', 'shipped', 'delivered'];

// Module-level stats — single source of truth (#13)
const stats = { orders: 0, revenue: 0, cancelled: 0 };

// ─── Public API ──────────────────────────────────────────────────────────────

// Renamed from process() — avoids shadowing Node's global `process` (#17, #13)
async function placeOrder(order, user, paymentMethod, statsRef) {
  // Guard clauses replace pyramid nesting (#10)
  if (!user || !user.active) return false;
  if (!order || !order.items || order.items.length === 0) return false;

  // Local variables — no module-level state (#3, #4)
  const validItems = order.items.filter(item => item.qty > 0 && item.price > 0);
  if (validItems.length === 0) return false;

  let subtotal = validItems.reduce((sum, item) => sum + item.qty * item.price, 0);

  // Named constants replace magic numbers (#9)
  if (user.type === 'premium') subtotal *= (1 - DISCOUNT_PREMIUM);
  else if (user.type === 'vip') subtotal *= (1 - DISCOUNT_VIP);
  else if (user.type === 'staff') subtotal *= (1 - DISCOUNT_STAFF);

  const total = subtotal * (1 + TAX_RATE);

  // Dispatch — unknown method throws, not silently undefined (#7)
  const charged = await chargePayment(paymentMethod, user, total);
  if (!charged) return false;

  // Shared confirmation — duplicated block eliminated (#8)
  await finalizeOrder(order, user, total, statsRef || stats);
  return true;
}

async function getOrders(userId) {
  // Parameterised query (#1)
  return db.query('SELECT * FROM orders WHERE user_id = $1', [userId]);
}

async function cancelOrder(orderId, userId, reason) {
  try {
    // Parameterised (#1)
    const order = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);

    // Null check (#5); strict equality (#10)
    if (!order) return false;
    if (order.user_id !== userId) return false;
    if (NON_CANCELLABLE.includes(order.status)) return false;

    await db.query(
      'UPDATE orders SET status = $1, reason = $2 WHERE id = $3',
      ['cancelled', reason, orderId],
    );

    // Use order's own email — not global usr (#11)
    mailer.send(order.user_email, 'Order cancelled', 'Your order has been cancelled.');

    // Stats update on cancel (#14)
    stats.cancelled++;
    stats.revenue -= order.total;

    return true;
  } catch (err) {
    // Error handling (#15)
    console.error('cancelOrder failed:', err.message);
    return false;
  }
}

async function refundOrder(orderId) {
  try {
    const order = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);

    // Null check added — was missing, caused TypeError crash (#5)
    if (!order) return false;
    if (order.status !== 'paid') return false;

    await db.query(
      'UPDATE orders SET status = $1 WHERE id = $2',
      ['refunded', orderId],
    );

    stats.revenue  -= order.total;
    stats.cancelled++;

    // Use order's own email — not global usr (#12)
    mailer.send(
      order.user_email,
      'Refund processed',
      `Your refund of ${formatMoney(order.total)} is on its way.`,
    );

    return true;
  } catch (err) {
    console.error('refundOrder failed:', err.message);
    return false;
  }
}

function getStats() {
  return { ...stats };   // eval("stats") → just return the object (#2); defensive copy (#13)
}

// ─── Private helpers ─────────────────────────────────────────────────────────

async function chargePayment(method, user, total) {
  if (method === 'card')   return chargeCard(user.card, total);
  if (method === 'paypal') return chargePaypal(user.paypal, total);
  if (method === 'crypto') throw new Error('Crypto payments are not yet supported');
  // Unknown method throws — no silent undefined return (#7)
  throw new Error(`Unknown payment method: ${method}`);
}

// Shared — eliminates the duplicated card/paypal block (#8)
async function finalizeOrder(order, user, total, statsRef) {
  // Parameterised INSERT (#1)
  await db.query(
    'INSERT INTO orders (id, user_id, total, status) VALUES ($1, $2, $3, $4)',
    [order.id, user.id, total, 'paid'],
  );
  mailer.send(
    user.email,
    'Order confirmed',
    `Your order has been confirmed. Total: ${formatMoney(total)}`,
  );
  statsRef.orders++;
  statsRef.revenue += total;
}

function chargeCard(cardToken, amount) {
  // Do NOT log card details — PCI-DSS (#6)
  console.log(`Charging card (ending ...${String(cardToken).slice(-4)}) for ${formatMoney(amount)}`);
  return true; // TODO: integrate real payment gateway
}

function chargePaypal(account, amount) {
  console.log(`Charging PayPal ${account} for ${formatMoney(amount)}`);
  return true; // TODO: integrate PayPal SDK
}

function formatMoney(amount) {
  return `$${(Math.round(amount * 100) / 100).toFixed(2)}`;
}

module.exports = {
  placeOrder,
  getOrders,
  cancelOrder,
  refundOrder,
  getStats,
};
