const {
  json, allowCors, requirePost, requireConfig, normalizePhone, isValidKenyanPhone,
  makeReference, makeAccessToken, supabase, getPlan, ZETUPAY_SECRET_KEY, SITE_URL,
} = require('./_utils');

module.exports = async function handler(req, res) {
  allowCors(res);
  if (!requirePost(req, res)) return;
  if (!requireConfig(res)) return;

  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = normalizePhone(body.phone);
    const plan = String(body.plan || '').toLowerCase();

    if (name.length < 2) return json(res, 400, { success: false, error: 'Please enter your full name.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { success: false, error: 'Please enter a valid email address.' });
    if (!isValidKenyanPhone(phone)) return json(res, 400, { success: false, error: 'Enter a valid Kenyan M-Pesa number.' });

    const planInfo = await getPlan(plan);
    if (!planInfo) return json(res, 400, { success: false, error: 'Invalid or inactive VIP plan.' });

    const reference = makeReference(plan);
    const accessToken = makeAccessToken();
    const idempotencyKey = reference;

    await supabase('vip_payments', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        reference,
        plan,
        plan_name: planInfo.name,
        amount: planInfo.amount,
        duration_days: planInfo.duration_days,
        customer_name: name,
        customer_email: email,
        phone_number: phone,
        status: 'pending',
        access_token: accessToken,
      }),
    });

    const zetuResponse = await fetch('https://pay.zetupay.co.ke/api/v1/payment/stk-push', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ZETUPAY_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        amount: planInfo.amount,
        phoneNumber: phone,
        reference,
        identifier: email,
        currency: 'KES',
      }),
    });

    const zetuData = await zetuResponse.json().catch(() => ({}));
    if (!zetuResponse.ok || !zetuData.success) {
      await supabase(`vip_payments?reference=eq.${encodeURIComponent(reference)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'failed', failure_reason: zetuData.message || zetuData.error || `ZetuPay error ${zetuResponse.status}` }),
      }).catch(() => {});
      return json(res, zetuResponse.status >= 400 ? zetuResponse.status : 502, {
        success: false,
        error: zetuData.message || zetuData.error || 'ZetuPay could not start the M-Pesa payment.',
      });
    }

    const payment = zetuData.data || {};
    await supabase(`vip_payments?reference=eq.${encodeURIComponent(reference)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        payment_key: payment.paymentKey || null,
        wave_transaction_id: payment.waveTransactionId || null,
        checkout_request_id: payment.checkoutRequestId || null,
        status: payment.status || 'processing',
      }),
    });

    return json(res, 202, {
      success: true,
      reference,
      payment_key: payment.paymentKey || null,
      status: payment.status || 'processing',
      amount: planInfo.amount,
      plan,
      message: 'Check your phone and approve the M-Pesa prompt with your PIN.',
    });
  } catch (error) {
    console.error('ZetuPay initiate error:', error);
    return json(res, 500, { success: false, error: 'Unable to start the M-Pesa payment right now.' });
  }
};
