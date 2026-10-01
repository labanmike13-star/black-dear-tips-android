const {
  json, verifyZetuPaySignature, getRawBody, supabase, ZETUPAY_SECRET_KEY,
} = require('./_utils');

module.exports.config = { api: { bodyParser: false } };

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { success: false, error: 'Method not allowed' });
  if (!ZETUPAY_SECRET_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) return json(res, 500, { success: false, error: 'Server configuration is incomplete.' });

  try {
    const rawBody = await getRawBody(req);
    if (!verifyZetuPaySignature(req, rawBody)) return json(res, 401, { success: false, error: 'Invalid webhook signature.' });

    const txn = JSON.parse(rawBody.toString('utf8'));
    if (txn.event) return json(res, 200, { success: true, ignored: true });

    const reference = String(txn.reference || '').trim();
    if (!reference) return json(res, 400, { success: false, error: 'Missing reference.' });

    const rows = await supabase(`vip_payments?select=id,reference,amount,duration_days,status&reference=eq.${encodeURIComponent(reference)}&limit=1`);
    const order = Array.isArray(rows) ? rows[0] : null;
    if (!order) return json(res, 200, { success: true, ignored: true });

    if (txn.status !== 'success') return json(res, 200, { success: true, ignored: true });
    if (Number(txn.amount) !== Number(order.amount)) return json(res, 400, { success: false, error: 'Payment amount does not match the order.' });
    if (order.status === 'success') return json(res, 200, { success: true, alreadyProcessed: true });

    const now = new Date();
    const expires = new Date(now.getTime() + Number(order.duration_days) * 86400000);
    await supabase(`vip_payments?reference=eq.${encodeURIComponent(reference)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'success',
        receipt_number: txn.receiptNumber || null,
        wave_transaction_id: txn.waveTransactionId || null,
        paid_at: txn.transactionDate || new Date().toISOString(),
        vip_expires_at: expires.toISOString(),
      }),
    });

    return json(res, 200, { success: true });
  } catch (error) {
    console.error('ZetuPay callback error:', error);
    return json(res, 500, { success: false, error: 'Webhook processing failed.' });
  }
};
