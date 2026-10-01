BLACK-DEAR-TIPS VIP PLANS — ZETUPAY M-PESA STK

Plans:
DAILY = KSh 500
WEEKLY = KSh 3,500
MONTHLY = KSh 15,000

Payment is initiated server-side through ZetuPay M-Pesa STK Push.
Do not place ZetuPay Secret Key or Supabase service-role key in public files.

Required Vercel Environment Variables:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- ZETUPAY_SECRET_KEY
- SITE_URL

Required Supabase SQL:
- vip-payments.sql

Required ZetuPay transaction webhook:
https://black-dear-tips.com/api/zetupay-callback

ZetuPay production callback:
https://black-dear-tips.com/api/zetupay-callback

Required Vercel environment variables:
ZETUPAY_SECRET_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL
SITE_URL
