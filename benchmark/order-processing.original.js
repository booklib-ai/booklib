// order processing thing
// ORIGINAL — intentionally bad code. Do not use in production.

var db = require('./db')
var mailer = require('./mailer')

var discount = 0.1
var TAX = 0.23
var items = []
var total = 0
var usr = null

function process(o, u, pay, s) {
    usr = u
    if (u != null) {
        if (u.active == true) {
            if (o != null) {
                if (o.items != null && o.items.length > 0) {
                    var t = 0
                    for (var i = 0; i < o.items.length; i++) {
                        var item = o.items[i]
                        if (item.qty > 0) {
                            if (item.price > 0) {
                                t = t + (item.qty * item.price)
                                items.push(item)
                            }
                        }
                    }
                    if (u.type == "premium") {
                        t = t - (t * 0.1)
                    }
                    if (u.type == "vip") {
                        t = t - (t * 0.2)
                    }
                    if (u.type == "staff") {
                        t = t - (t * 0.5)
                    }
                    total = t + (t * TAX)
                    if (pay == "card") {
                        var res = chargeCard(u.card, total)
                        if (res == true) {
                            var q = "INSERT INTO orders VALUES ('" + o.id + "', '" + u.id + "', " + total + ", 'paid')"
                            db.query(q)
                            mailer.send(u.email, "Order confirmed", "ur order is confirmed lol total: " + total)
                            s.orders++
                            s.revenue = s.revenue + total
                            return true
                        } else {
                            return false
                        }
                    }
                    if (pay == "paypal") {
                        var res2 = chargePaypal(u.paypal, total)
                        if (res2 == true) {
                            var q2 = "INSERT INTO orders VALUES ('" + o.id + "', '" + u.id + "', " + total + ", 'paid')"
                            db.query(q2)
                            mailer.send(u.email, "Order confirmed", "ur order is confirmed lol total: " + total)
                            s.orders++
                            s.revenue = s.revenue + total
                            return true
                        } else {
                            return false
                        }
                    }
                    if (pay == "crypto") {
                        // TODO: implement this someday
                        return false
                    }
                } else {
                    return false
                }
            } else {
                return false
            }
        } else {
            return false
        }
    } else {
        return false
    }
}

function chargeCard(card, amt) {
    // just assume it works
    console.log("charging card " + card + " for " + amt)
    return true
}

function chargePaypal(pp, amt) {
    console.log("paypal " + pp + " " + amt)
    return true
}

// get user orders
function getOrds(uid) {
    var q = "SELECT * FROM orders WHERE user_id = '" + uid + "'"
    return db.query(q)
}

// cancel
function cancel(oid, uid, rsn) {
    var q = "SELECT * FROM orders WHERE id = '" + oid + "'"
    var ord = db.query(q)
    if (ord != null) {
        if (ord.user_id == uid) {
            if (ord.status != "cancelled") {
                if (ord.status != "shipped") {
                    if (ord.status != "delivered") {
                        var q2 = "UPDATE orders SET status = 'cancelled', reason = '" + rsn + "' WHERE id = '" + oid + "'"
                        db.query(q2)
                        mailer.send(usr.email, "Cancelled", "ok cancelled")
                        return true
                    } else {
                        return false
                    }
                } else {
                    return false
                }
            } else {
                return false
            }
        }
    }
    return false
}

// stats thing used everywhere
var stats = {
    orders: 0,
    revenue: 0,
    cancelled: 0
}

function getStats() {
    return eval("stats")
}

// some random util shoved in here
function formatMoney(n) {
    return "$" + Math.round(n * 100) / 100
}

// also does refunds i guess
function refund(oid) {
    var q = "SELECT * FROM orders WHERE id = '" + oid + "'"
    var ord = db.query(q)
    if (ord.status == "paid") {
        // refund the money somehow
        console.log("refunding " + ord.total)
        var q2 = "UPDATE orders SET status = 'refunded' WHERE id = '" + oid + "'"
        db.query(q2)
        stats.revenue = stats.revenue - ord.total
        stats.cancelled++
        mailer.send(usr.email, "Refund", "u got ur money back: " + formatMoney(ord.total))
    }
}

module.exports = { process, getOrds, cancel, getStats, refund }
