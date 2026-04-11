begin;

alter table public.billing_accounts
  add column if not exists stripe_default_payment_method_id text,
  add column if not exists card_brand text,
  add column if not exists card_last4 text,
  add column if not exists card_exp_month integer,
  add column if not exists card_exp_year integer,
  add column if not exists card_funding text,
  add column if not exists card_country text,
  add column if not exists payment_method_status text not null default 'missing',
  add column if not exists last_successful_charge_at timestamptz;

alter table public.billing_accounts
  drop constraint if exists billing_accounts_payment_method_status_check;

alter table public.billing_accounts
  add constraint billing_accounts_payment_method_status_check
  check (payment_method_status in ('missing', 'ready', 'expired', 'attention'));

create index if not exists idx_billing_accounts_default_payment_method
on public.billing_accounts (stripe_default_payment_method_id)
where stripe_default_payment_method_id is not null;

commit;
