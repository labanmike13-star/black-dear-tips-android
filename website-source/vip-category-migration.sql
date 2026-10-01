-- BLACK-DEAR-TIPS: VIP category support
-- Run ONCE in the same Supabase project that contains public.vip_tips.

alter table public.vip_tips
  add column if not exists category text not null default 'over-2-5';

create index if not exists vip_tips_category_date_idx
on public.vip_tips(category, match_date);

-- Allowed values used by the website: correct-score, ht-ft, over-2-5.
-- Existing VIP rows are kept and default to over-2-5 so nothing is deleted.
