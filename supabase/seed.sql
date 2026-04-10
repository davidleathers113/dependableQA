begin;

do $$
declare
  seeded_user_id uuid;
  seeded_org_id uuid;
  seeded_integration_id uuid;
  seeded_batch_id uuid;
  seeded_publisher_id uuid;
  seeded_campaign_id uuid;
  seeded_billing_account_id uuid;
  seeded_call_one_id uuid;
  seeded_call_two_id uuid;
begin
  select id
  into seeded_user_id
  from auth.users
  order by created_at asc
  limit 1;

  select id
  into seeded_org_id
  from public.organizations
  where slug = 'dependableqa-demo'
  limit 1;

  if seeded_org_id is null then
    insert into public.organizations (name, slug)
    values ('DependableQA Demo', 'dependableqa-demo')
    returning id into seeded_org_id;
  end if;

  if seeded_user_id is not null then
    insert into public.organization_members (organization_id, user_id, role, invite_status)
    values (seeded_org_id, seeded_user_id, 'owner', 'accepted')
    on conflict (organization_id, user_id) do nothing;

    insert into public.billing_accounts (
      organization_id,
      billing_email,
      autopay_enabled,
      recharge_threshold_cents,
      recharge_amount_cents,
      per_minute_rate_cents
    )
    values (
      seeded_org_id,
      (select email from auth.users where id = seeded_user_id),
      true,
      50000,
      100000,
      2
    )
    on conflict (organization_id) do nothing;
  else
    insert into public.billing_accounts (
      organization_id,
      billing_email,
      autopay_enabled,
      recharge_threshold_cents,
      recharge_amount_cents,
      per_minute_rate_cents
    )
    values (
      seeded_org_id,
      'demo@dependableqa.local',
      true,
      50000,
      100000,
      2
    )
    on conflict (organization_id) do nothing;
  end if;

  select id
  into seeded_billing_account_id
  from public.billing_accounts
  where organization_id = seeded_org_id
  limit 1;

  select id
  into seeded_integration_id
  from public.integrations
  where organization_id = seeded_org_id
    and provider = 'ringba'
    and display_name = 'Ringba Primary'
  limit 1;

  if seeded_integration_id is null then
    insert into public.integrations (
      organization_id,
      provider,
      display_name,
      status,
      mode,
      config
    )
    values (
      seeded_org_id,
      'ringba',
      'Ringba Primary',
      'connected',
      'webhook',
      jsonb_build_object('endpoint', '/.netlify/functions/integration-ingest')
    )
    returning id into seeded_integration_id;
  end if;

  select id
  into seeded_publisher_id
  from public.publishers
  where organization_id = seeded_org_id
    and normalized_name = 'leadgen-pro'
  limit 1;

  if seeded_publisher_id is null then
    insert into public.publishers (organization_id, name, normalized_name)
    values (seeded_org_id, 'LeadGen Pro', 'leadgen-pro')
    returning id into seeded_publisher_id;
  end if;

  select id
  into seeded_campaign_id
  from public.campaigns
  where organization_id = seeded_org_id
    and normalized_name = 'solar-direct'
  limit 1;

  if seeded_campaign_id is null then
    insert into public.campaigns (organization_id, name, normalized_name)
    values (seeded_org_id, 'Solar Direct', 'solar-direct')
    returning id into seeded_campaign_id;
  end if;

  select id
  into seeded_batch_id
  from public.import_batches
  where organization_id = seeded_org_id
    and filename = 'demo-seed.csv'
  limit 1;

  if seeded_batch_id is null then
    insert into public.import_batches (
      organization_id,
      integration_id,
      source_provider,
      source_kind,
      uploaded_by,
      filename,
      storage_path,
      status,
      row_count_total,
      row_count_accepted,
      row_count_rejected,
      started_at,
      completed_at
    )
    values (
      seeded_org_id,
      seeded_integration_id,
      'ringba',
      'csv',
      seeded_user_id,
      'demo-seed.csv',
      seeded_org_id::text || '/demo-seed.csv',
      'completed',
      2,
      2,
      0,
      now() - interval '2 hours',
      now() - interval '115 minutes'
    )
    returning id into seeded_batch_id;
  end if;

  insert into public.calls (
    organization_id,
    import_batch_id,
    integration_id,
    publisher_id,
    campaign_id,
    external_call_id,
    dedupe_hash,
    caller_number,
    destination_number,
    started_at,
    ended_at,
    duration_seconds,
    source_provider,
    source_status,
    current_disposition,
    current_review_status,
    has_flags,
    flag_count,
    analysis_status
  )
  values (
    seeded_org_id,
    seeded_batch_id,
    seeded_integration_id,
    seeded_publisher_id,
    seeded_campaign_id,
    'seed-call-001',
    'seed:ringba:seed-call-001',
    '+15551234567',
    '+15557654321',
    now() - interval '2 hours',
    now() - interval '117 minutes',
    180,
    'ringba',
    'received',
    'Qualified',
    'reviewed',
    true,
    1,
    'completed'
  )
  on conflict (organization_id, dedupe_hash) do nothing;

  insert into public.calls (
    organization_id,
    import_batch_id,
    integration_id,
    publisher_id,
    campaign_id,
    external_call_id,
    dedupe_hash,
    caller_number,
    destination_number,
    started_at,
    ended_at,
    duration_seconds,
    source_provider,
    source_status,
    current_disposition,
    current_review_status,
    has_flags,
    flag_count,
    analysis_status
  )
  values (
    seeded_org_id,
    seeded_batch_id,
    seeded_integration_id,
    seeded_publisher_id,
    seeded_campaign_id,
    'seed-call-002',
    'seed:ringba:seed-call-002',
    '+15559876543',
    '+15553456789',
    now() - interval '90 minutes',
    now() - interval '87 minutes',
    210,
    'ringba',
    'received',
    'Needs Review',
    'in_review',
    false,
    0,
    'completed'
  )
  on conflict (organization_id, dedupe_hash) do nothing;

  select id into seeded_call_one_id
  from public.calls
  where organization_id = seeded_org_id and dedupe_hash = 'seed:ringba:seed-call-001'
  limit 1;

  select id into seeded_call_two_id
  from public.calls
  where organization_id = seeded_org_id and dedupe_hash = 'seed:ringba:seed-call-002'
  limit 1;

  insert into public.call_transcripts (organization_id, call_id, transcript_text, transcript_segments)
  values (
    seeded_org_id,
    seeded_call_one_id,
    'Caller asked about qualifying for solar financing and confirmed monthly electric spend above one hundred dollars.',
    jsonb_build_array(
      jsonb_build_object('speaker', 'Agent', 'text', 'Thanks for calling. Are you the homeowner?'),
      jsonb_build_object('speaker', 'Caller', 'text', 'Yes, and my monthly bill is over one hundred dollars.')
    )
  )
  on conflict (call_id) do nothing;

  insert into public.call_transcripts (organization_id, call_id, transcript_text, transcript_segments)
  values (
    seeded_org_id,
    seeded_call_two_id,
    'Caller was interested but needed a callback later in the week.',
    jsonb_build_array(
      jsonb_build_object('speaker', 'Agent', 'text', 'Is this a good time to speak?'),
      jsonb_build_object('speaker', 'Caller', 'text', 'Can someone call me back on Thursday?')
    )
  )
  on conflict (call_id) do nothing;

  insert into public.call_analyses (
    organization_id,
    call_id,
    analysis_version,
    model_name,
    summary,
    disposition_suggested,
    confidence,
    flag_summary,
    structured_output,
    processing_ms
  )
  values (
    seeded_org_id,
    seeded_call_one_id,
    'v1',
    'gpt-4.1',
    'Qualified homeowner with strong purchase intent and clear bill size.',
    'Qualified',
    0.94,
    '[]'::jsonb,
    '{}'::jsonb,
    1450
  )
  on conflict do nothing;

  insert into public.call_flags (
    organization_id,
    call_id,
    flag_type,
    flag_category,
    severity,
    status,
    source,
    title,
    description,
    evidence
  )
  values (
    seeded_org_id,
    seeded_call_one_id,
    'compliance',
    'qa',
    'medium',
    'open',
    'ai',
    'Verify compliance disclosure',
    'AI detected a possible missing compliance phrase near the opening.',
    jsonb_build_object('segment', 'opening')
  )
  on conflict do nothing;

  if seeded_user_id is not null then
    insert into public.call_reviews (
      organization_id,
      call_id,
      reviewed_by,
      review_status,
      final_disposition,
      review_notes
    )
    values (
      seeded_org_id,
      seeded_call_one_id,
      seeded_user_id,
      'reviewed',
      'Qualified',
      'Confirmed caller intent and homeowner status.'
    )
    on conflict do nothing;
  end if;

  insert into public.integration_events (
    organization_id,
    integration_id,
    event_type,
    severity,
    message,
    payload
  )
  values (
    seeded_org_id,
    seeded_integration_id,
    'webhook.received',
    'info',
    'Seeded Ringba webhook event processed successfully.',
    jsonb_build_object('seed', true)
  )
  on conflict do nothing;

  insert into public.wallet_ledger_entries (
    organization_id,
    billing_account_id,
    entry_type,
    amount_cents,
    balance_after_cents,
    reference_type,
    description
  )
  values
    (
      seeded_org_id,
      seeded_billing_account_id,
      'credit',
      150000,
      150000,
      'seed',
      'Initial wallet funding'
    ),
    (
      seeded_org_id,
      seeded_billing_account_id,
      'debit',
      -25950,
      124050,
      'usage',
      'Processed seeded demo call minutes'
    )
  on conflict do nothing;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    metadata
  )
  values (
    seeded_org_id,
    seeded_user_id,
    'organization',
    seeded_org_id,
    'seed.loaded',
    jsonb_build_object('summary', 'Loaded demo organization data.')
  )
  on conflict do nothing;
end $$;

commit;
