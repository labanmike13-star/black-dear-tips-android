const { json, allowCors, requireConfig, supabase, ZETUPAY_SECRET_KEY } = require('./_utils');

module.exports = async function handler(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return json(res, 405, { success: false, error: 'Method not allowed' });
  if (!requireConfig(res)) return;

  try {
    const reference = String(req.query.reference || '').trim();
    const paymentKey = String(req.query.paymentKey || '').trim();
    if (!reference || !paymentKey) return json(res, 400, { success: false, error: 'Missing payment reference or payment key.' });

    const rows = await supabase(`vip_payments?select=reference,plan,plan_name,amount,status,payment_key,access_token,vip_expires_at&reference=eq.${encodeURIComponent(reference)}&limit=1`);
    const order = Array.isArray(rows) ? rows[0] : null;
    if (!order || order.payment_key !== paymentKey) return json(res, 404, { success: false, error: 'Payment not found.' });

    const response = await fetch(`https://pay.zetupay.co.ke/api/v1/payment/stk-push/${encodeURIComponent(paymentKey)}`, {
      headers: { Authorization: `Bearer ${ZETUPAY_SECRET_KEY}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) return json(res, response.status || 502, { success: false, error: data.message || data.error || 'Could not check payment status.' });

    const p = data.data || {};
    if (p.status && p.status !== order.status) {
      const patch = { status: p.status };
      if (p.receiptNumber) patch.receipt_number = p.receiptNumber;
      if (p.waveTransactionId) patch.wave_transaction_id = p.waveTransactionId;
      if (p.paidAt) patch.paid_at = p.paidAt;
      await supabase(`vip_payments?reference=eq.${encodeURIComponent(reference)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) }).catch(() => {});
    }

    const paid = p.status === 'success';
    return json(res, 200, {
      success: true,
      status: p.status,
      reference,
      plan: order.plan,
      amount: order.amount,
      receiptNumber: p.receiptNumber || null,
      accessToken: paid ? order.access_token : null,
      expiresAt: paid ? order.vip_expires_at : null,
    });
  } catch (error) {
    console.error('ZetuPay status error:', error);
    return json(res, 500, { success: false, error: 'Unable to check payment status right now.' });
  }
};
