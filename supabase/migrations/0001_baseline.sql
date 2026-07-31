--
-- PostgreSQL database dump  (production baseline — supabase/migrations/0001)
-- Portability edits from the raw pg_dump: `\restrict/\unrestrict` psql artifacts
-- removed; `CREATE SCHEMA public` made IF NOT EXISTS so it applies to a fresh DB.
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6 (Debian 17.6-2.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: audit_log_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_log_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if tg_op = 'UPDATE' then
    if new.action is distinct from old.action
       or new.entity_type is distinct from old.entity_type
       or new.entity_id is distinct from old.entity_id
       or new.payload is distinct from old.payload
       or new.actor_user_id is distinct from old.actor_user_id
       or new.actor_email is distinct from old.actor_email
       or new.created_at is distinct from old.created_at then
      raise exception 'audit_log is append-only — content cannot be modified';
    end if;
    return new;
  end if;
  return old; -- DELETE allowed (cascade cleanup); content already immutable above
end; $$;


--
-- Name: bump_ticker_views(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_ticker_views(t text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare v bigint;
begin
  insert into public.ticker_views (ticker, views) values (t, 1)
  on conflict (ticker) do update set views = ticker_views.views + 1, updated_at = now()
  returning views into v;
  return v;
end; $$;


--
-- Name: bump_ticker_views_daily(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_ticker_views_daily(t text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
  insert into public.ticker_views_daily (ticker, day, views)
  values (upper(t), current_date, 1)
  on conflict (ticker, day)
  do update set views = ticker_views_daily.views + 1;
$$;


--
-- Name: bump_usage_daily(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_usage_daily(k text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  new_count integer;
begin
  insert into public.usage_daily (key, day, count)
  values (k, current_date, 1)
  on conflict (key, day)
  do update set count = usage_daily.count + 1
  returning count into new_count;
  return new_count;
end;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare new_company_id uuid;
begin
  if coalesce(new.raw_user_meta_data->>'account_type', 'company') <> 'member' then
    insert into public.companies (owner_id, name, ticker)
    values (new.id, '', '')
    returning id into new_company_id;
    insert into public.company_users (company_id, user_id, role, status)
    values (new_company_id, new.id, 'admin', 'active')
    on conflict (company_id, user_id) do nothing;
  end if;
  return new;
end;
$$;


--
-- Name: is_company_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_company_admin(cid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select exists (
    select 1 from public.company_users cu
     where cu.company_id = cid and cu.user_id = auth.uid()
       and cu.status = 'active' and cu.role = 'admin'
  ) or exists (
    select 1 from public.companies c where c.id = cid and c.owner_id = auth.uid()
  );
$$;


--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid() and super_admin = true);
$$;


--
-- Name: my_company_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_company_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select cu.company_id
    from public.company_users cu
   where cu.user_id = auth.uid() and cu.status = 'active'
  union
  select c.id from public.companies c where c.owner_id = auth.uid();
$$;


--
-- Name: rate_check(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rate_check(b text, max_hits integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare h int;
begin
  insert into public.rate_limits (bucket, hits) values (b, 1)
  on conflict (bucket) do update set hits = rate_limits.hits + 1
  returning hits into h;
  return h <= max_hits;  -- true = allowed
end; $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    actor_user_id uuid,
    actor_email text,
    action text NOT NULL,
    entity_type text,
    entity_id text,
    payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: calendar_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_access (
    calendar_id uuid NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: claim_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.claim_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticker text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    role text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    company_name text,
    phone text,
    title text,
    relationship text,
    notes text,
    doc_paths text[] DEFAULT '{}'::text[] NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by text
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid,
    name text DEFAULT ''::text NOT NULL,
    ticker text DEFAULT ''::text NOT NULL,
    exchange text DEFAULT ''::text,
    cik text DEFAULT ''::text,
    sector text DEFAULT ''::text,
    city text DEFAULT ''::text,
    state text DEFAULT ''::text,
    description text DEFAULT ''::text,
    approver_name text DEFAULT ''::text,
    approver_title text DEFAULT ''::text,
    x_handle text DEFAULT ''::text,
    peers text[] DEFAULT '{}'::text[],
    tier text DEFAULT 'free'::text,
    quiet_mode boolean DEFAULT false,
    disclosure_text text DEFAULT ''::text,
    fls_text text DEFAULT ''::text,
    onboarding_complete boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    stripe_customer_id text,
    stripe_subscription_id text,
    subscription_status text DEFAULT 'none'::text,
    is_admin boolean DEFAULT false,
    ayrshare_profile_key text DEFAULT ''::text,
    archived_at timestamp with time zone,
    brand_colors text,
    logo_url text,
    image_style text,
    post_guidance text,
    board_notify_emails text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: COLUMN companies.brand_colors; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.brand_colors IS 'Free-text brand color hint for AI image generation (e.g. "navy blue and red").';


--
-- Name: COLUMN companies.image_style; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.image_style IS 'AI image style key: cinematic | infographic | illustration | photographic | minimal.';


--
-- Name: COLUMN companies.post_guidance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.post_guidance IS 'Free-text brand guidance injected into AI post/image prompts.';


--
-- Name: company_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_data (
    company_id uuid NOT NULL,
    collection text NOT NULL,
    data jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: company_features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_features (
    company_id uuid NOT NULL,
    feature text NOT NULL,
    enabled boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: company_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_stats (
    ticker text NOT NULL,
    company_name text DEFAULT ''::text,
    in_universe_reason text DEFAULT ''::text,
    trend_score numeric DEFAULT 0,
    snapshot_at timestamp with time zone DEFAULT now(),
    price numeric,
    change_pct_3mo numeric,
    last_volume numeric,
    avg_volume_3mo numeric,
    volume_ratio numeric,
    market_cap numeric,
    high_52 numeric,
    low_52 numeric,
    cash numeric,
    revenue_annual numeric,
    net_income_annual numeric,
    shares_outstanding numeric,
    shares_change_pct_1y numeric,
    runway_quarters numeric,
    insider_buys integer DEFAULT 0,
    insider_sells integer DEFAULT 0,
    insider_net integer DEFAULT 0,
    form4_count_180d integer DEFAULT 0,
    short_pct numeric,
    filings_12mo integer DEFAULT 0,
    last_filing_date text DEFAULT ''::text,
    last_form text DEFAULT ''::text,
    trials_total integer DEFAULT 0,
    contracts_count integer DEFAULT 0,
    halts_count integer DEFAULT 0,
    bullish integer DEFAULT 0,
    bearish integer DEFAULT 0,
    grade text DEFAULT ''::text,
    score numeric DEFAULT 0,
    industry text DEFAULT ''::text,
    exchange text DEFAULT ''::text
);


--
-- Name: company_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid,
    role text DEFAULT 'member'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    invited_email text DEFAULT ''::text,
    invited_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    invite_token text
);


--
-- Name: crm_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    contact_id uuid,
    crm_company_id uuid,
    deal_id uuid,
    kind text DEFAULT 'note'::text,
    direction text DEFAULT 'outbound'::text,
    summary text DEFAULT ''::text,
    body text DEFAULT ''::text,
    ai_reply text DEFAULT ''::text,
    occurred_at timestamp with time zone DEFAULT now(),
    actor_email text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: crm_companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    domain text DEFAULT ''::text,
    type text DEFAULT 'other'::text,
    industry text DEFAULT ''::text,
    city text DEFAULT ''::text,
    state text DEFAULT ''::text,
    website text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    owner_email text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: crm_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    crm_company_id uuid,
    full_name text DEFAULT ''::text NOT NULL,
    title text DEFAULT ''::text,
    email text DEFAULT ''::text,
    phone text DEFAULT ''::text,
    category text DEFAULT 'investor'::text,
    stage text DEFAULT 'new'::text,
    linkedin_url text DEFAULT ''::text,
    x_handle text DEFAULT ''::text,
    topics text[] DEFAULT '{}'::text[],
    aum text DEFAULT ''::text,
    peers_held text[] DEFAULT '{}'::text[],
    notes text DEFAULT ''::text,
    owner_email text DEFAULT ''::text,
    last_touch_at timestamp with time zone,
    next_followup date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    company_name text DEFAULT ''::text,
    shares_held numeric,
    opted_in boolean DEFAULT false NOT NULL
);


--
-- Name: crm_deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_deals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    stage text DEFAULT 'lead'::text NOT NULL,
    value numeric DEFAULT 0,
    currency text DEFAULT 'USD'::text,
    contact_id uuid,
    crm_company_id uuid,
    close_date date,
    status text DEFAULT 'open'::text,
    notes text DEFAULT ''::text,
    owner_email text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: crm_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    due_date date,
    done boolean DEFAULT false,
    contact_id uuid,
    deal_id uuid,
    owner_email text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id text,
    to_email text DEFAULT ''::text NOT NULL,
    kind text DEFAULT ''::text NOT NULL,
    subject text DEFAULT ''::text,
    status text DEFAULT 'sent'::text NOT NULL,
    sent_at timestamp with time zone DEFAULT now(),
    delivered_at timestamp with time zone,
    opened_at timestamp with time zone,
    error text DEFAULT ''::text
);


--
-- Name: iros_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.iros_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    company_id uuid NOT NULL,
    stage text NOT NULL,
    decision text NOT NULL,
    comment text DEFAULT ''::text,
    actor_user_id uuid,
    actor_email text,
    signature_hash text,
    signature_ip text,
    signature_ua text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: iros_confirmations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.iros_confirmations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    action text NOT NULL,
    params jsonb DEFAULT '{}'::jsonb NOT NULL,
    content_hash text DEFAULT ''::text NOT NULL,
    token_id uuid,
    request_id text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone
);


--
-- Name: iros_disclosure_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.iros_disclosure_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    event_type text NOT NULL,
    description text DEFAULT ''::text,
    effective_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: iros_event_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.iros_event_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    event_id text NOT NULL,
    event_type text NOT NULL,
    callback_url text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    delivered_at timestamp with time zone
);


--
-- Name: iros_event_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.iros_event_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    callback_url text NOT NULL,
    secret_hash text DEFAULT ''::text NOT NULL,
    secret_enc text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: iros_idempotency; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.iros_idempotency (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    operation text NOT NULL,
    idem_key text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    result jsonb,
    request_id text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    finished_at timestamp with time zone
);


--
-- Name: iros_integration_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.iros_integration_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    token_hash text NOT NULL,
    token_prefix text DEFAULT ''::text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    connector_id text DEFAULT ''::text,
    issued_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    last_used_at timestamp with time zone,
    created_by uuid
);


--
-- Name: iros_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.iros_interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    stakeholder_id uuid,
    channel text DEFAULT 'other'::text,
    direction text DEFAULT 'inbound'::text,
    summary text DEFAULT ''::text,
    body text DEFAULT ''::text,
    status text DEFAULT 'open'::text,
    suggested_owner text DEFAULT ''::text,
    suggested_reply text DEFAULT ''::text,
    occurred_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: iros_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.iros_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    channels text[] DEFAULT '{}'::text[],
    scheduled_at timestamp with time zone,
    status text DEFAULT 'draft'::text NOT NULL,
    classification text,
    class_confidence numeric(3,2),
    class_flags jsonb DEFAULT '[]'::jsonb,
    class_reason text DEFAULT ''::text,
    voice_profile_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    platform text DEFAULT ''::text,
    media_url text DEFAULT ''::text,
    theme text DEFAULT ''::text,
    calendar_batch uuid,
    ayr_post_id text DEFAULT ''::text,
    post_url text DEFAULT ''::text,
    publish_error text DEFAULT ''::text,
    posted_at timestamp with time zone,
    CONSTRAINT iros_posts_status_canon CHECK ((status = ANY (ARRAY['draft'::text, 'reviewed'::text, 'approved'::text, 'scheduled'::text, 'published'::text, 'pulled'::text])))
);


--
-- Name: iros_stakeholders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.iros_stakeholders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    full_name text NOT NULL,
    title text DEFAULT ''::text,
    org text DEFAULT ''::text,
    category text DEFAULT 'other'::text,
    topics text[] DEFAULT '{}'::text[],
    email text DEFAULT ''::text,
    linkedin_url text DEFAULT ''::text,
    x_handle text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    last_touch_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: iros_voice_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.iros_voice_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    role_title text DEFAULT ''::text,
    guidance text DEFAULT ''::text,
    style_examples text[] DEFAULT '{}'::text[],
    forbidden_phrases text[] DEFAULT '{}'::text[],
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: lead_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT 'Untitled list'::text NOT NULL,
    note text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticker text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    role text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    handle text NOT NULL,
    bio text DEFAULT ''::text,
    avatar_url text DEFAULT ''::text,
    plan text DEFAULT 'free'::text,
    stripe_customer_id text,
    stripe_subscription_id text,
    subscription_status text DEFAULT 'none'::text,
    created_at timestamp with time zone DEFAULT now(),
    profile_complete boolean DEFAULT false NOT NULL,
    suspended_at timestamp with time zone,
    suspended_reason text DEFAULT ''::text
);


--
-- Name: member_public; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.member_public AS
 SELECT id,
    handle,
    display_name,
    avatar_url
   FROM public.members;


--
-- Name: oauth_access_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_access_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash text NOT NULL,
    grant_id uuid NOT NULL,
    company_id uuid NOT NULL,
    subject_user uuid,
    subject_email text DEFAULT ''::text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: oauth_auth_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_auth_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code_hash text NOT NULL,
    client_id text NOT NULL,
    company_id uuid NOT NULL,
    subject_user uuid NOT NULL,
    subject_email text DEFAULT ''::text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    redirect_uri text NOT NULL,
    code_challenge text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone
);


--
-- Name: oauth_clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id text NOT NULL,
    client_secret_hash text,
    client_name text DEFAULT ''::text NOT NULL,
    redirect_uris text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: oauth_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id text NOT NULL,
    company_id uuid NOT NULL,
    subject_user uuid NOT NULL,
    subject_email text DEFAULT ''::text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    refresh_hash text NOT NULL,
    prev_refresh_hash text,
    issued_at timestamp with time zone DEFAULT now(),
    last_used_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: outreach_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    list_id uuid,
    cik text DEFAULT ''::text,
    name text DEFAULT ''::text NOT NULL,
    ticker text DEFAULT ''::text,
    exchange text DEFAULT ''::text,
    industry text DEFAULT ''::text,
    phone text DEFAULT ''::text,
    address text DEFAULT ''::text,
    recent_form text DEFAULT ''::text,
    edgar_url text DEFAULT ''::text,
    ir_lookup_url text DEFAULT ''::text,
    contact_name text DEFAULT ''::text,
    email text DEFAULT ''::text,
    status text DEFAULT 'new'::text NOT NULL,
    message_id text DEFAULT ''::text,
    last_sent_at timestamp with time zone,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    market_cap numeric,
    size_tier text DEFAULT 'unknown'::text,
    price numeric,
    fit_score integer DEFAULT 0,
    fit_reason text DEFAULT ''::text
);


--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admins (
    user_id uuid NOT NULL,
    email text NOT NULL,
    super_admin boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: public_board; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.public_board (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticker text NOT NULL,
    author text DEFAULT 'Anonymous'::text NOT NULL,
    body text NOT NULL,
    verified boolean DEFAULT false,
    flag text DEFAULT 'chatter'::text,
    flag_reason text DEFAULT ''::text,
    parent_id uuid,
    reactions jsonb DEFAULT '{"agree": 0, "report": 0, "source": 0, "question": 0}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    member_id uuid,
    author_avatar text DEFAULT ''::text
);


--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limits (
    bucket text NOT NULL,
    hits integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: social_strategy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_strategy (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    goals text DEFAULT ''::text,
    audience text DEFAULT ''::text,
    tone text DEFAULT 'professional'::text,
    themes text[] DEFAULT '{}'::text[],
    platforms text[] DEFAULT '{}'::text[],
    posts_per_week integer DEFAULT 3,
    dos text[] DEFAULT '{}'::text[],
    donts text[] DEFAULT '{}'::text[],
    voice_profile_id uuid,
    interview_complete boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: sponsored_briefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sponsored_briefs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    ticker text DEFAULT ''::text,
    title text DEFAULT ''::text,
    markdown text DEFAULT ''::text,
    disclosure text DEFAULT ''::text,
    status text DEFAULT 'ordered'::text,
    stripe_session_id text,
    published boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_sample boolean DEFAULT false
);


--
-- Name: team_calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    calendar_id uuid NOT NULL,
    company_id uuid NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    event_date date NOT NULL,
    event_time text DEFAULT ''::text,
    type text DEFAULT 'custom'::text,
    note text DEFAULT ''::text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: team_calendars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_calendars (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    kind text DEFAULT 'general'::text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    color text DEFAULT 'emerald'::text NOT NULL,
    owner_user_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: team_chat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_chat (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid,
    author_name text DEFAULT ''::text,
    body text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.team_chat REPLICA IDENTITY FULL;


--
-- Name: team_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_profiles (
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    display_name text DEFAULT ''::text,
    office_status text DEFAULT 'in'::text NOT NULL,
    status_reason text DEFAULT ''::text,
    birthday date,
    updated_at timestamp with time zone DEFAULT now(),
    dashboard_layout jsonb
);

ALTER TABLE ONLY public.team_profiles REPLICA IDENTITY FULL;


--
-- Name: team_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid,
    author_name text DEFAULT ''::text,
    body text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: ticker_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticker_views (
    ticker text NOT NULL,
    views bigint DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: ticker_views_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticker_views_daily (
    ticker text NOT NULL,
    day date DEFAULT CURRENT_DATE NOT NULL,
    views integer DEFAULT 0 NOT NULL
);


--
-- Name: usage_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_daily (
    key text NOT NULL,
    day date DEFAULT CURRENT_DATE NOT NULL,
    count integer DEFAULT 0 NOT NULL
);


--
-- Name: user_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_flags (
    user_id uuid NOT NULL,
    learn_visited boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT now(),
    welcomed boolean DEFAULT false
);


--
-- Name: user_workspace; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_workspace (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    pinned boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: watch_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watch_snapshots (
    ticker text NOT NULL,
    snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: watches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticker text NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    member_id uuid
);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: calendar_access calendar_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_access
    ADD CONSTRAINT calendar_access_pkey PRIMARY KEY (calendar_id, user_id);


--
-- Name: claim_requests claim_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_requests
    ADD CONSTRAINT claim_requests_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: company_data company_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_data
    ADD CONSTRAINT company_data_pkey PRIMARY KEY (company_id, collection);


--
-- Name: company_features company_features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_features
    ADD CONSTRAINT company_features_pkey PRIMARY KEY (company_id, feature);


--
-- Name: company_stats company_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_stats
    ADD CONSTRAINT company_stats_pkey PRIMARY KEY (ticker);


--
-- Name: company_users company_users_company_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_users
    ADD CONSTRAINT company_users_company_id_user_id_key UNIQUE (company_id, user_id);


--
-- Name: company_users company_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_users
    ADD CONSTRAINT company_users_pkey PRIMARY KEY (id);


--
-- Name: crm_activities crm_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_pkey PRIMARY KEY (id);


--
-- Name: crm_companies crm_companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_companies
    ADD CONSTRAINT crm_companies_pkey PRIMARY KEY (id);


--
-- Name: crm_contacts crm_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_pkey PRIMARY KEY (id);


--
-- Name: crm_deals crm_deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_pkey PRIMARY KEY (id);


--
-- Name: crm_tasks crm_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_pkey PRIMARY KEY (id);


--
-- Name: email_events email_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_pkey PRIMARY KEY (id);


--
-- Name: iros_approvals iros_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_approvals
    ADD CONSTRAINT iros_approvals_pkey PRIMARY KEY (id);


--
-- Name: iros_confirmations iros_confirmations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_confirmations
    ADD CONSTRAINT iros_confirmations_pkey PRIMARY KEY (id);


--
-- Name: iros_disclosure_events iros_disclosure_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_disclosure_events
    ADD CONSTRAINT iros_disclosure_events_pkey PRIMARY KEY (id);


--
-- Name: iros_event_deliveries iros_event_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_event_deliveries
    ADD CONSTRAINT iros_event_deliveries_pkey PRIMARY KEY (id);


--
-- Name: iros_event_subscriptions iros_event_subscriptions_company_id_callback_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_event_subscriptions
    ADD CONSTRAINT iros_event_subscriptions_company_id_callback_url_key UNIQUE (company_id, callback_url);


--
-- Name: iros_event_subscriptions iros_event_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_event_subscriptions
    ADD CONSTRAINT iros_event_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: iros_idempotency iros_idempotency_company_id_operation_idem_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_idempotency
    ADD CONSTRAINT iros_idempotency_company_id_operation_idem_key_key UNIQUE (company_id, operation, idem_key);


--
-- Name: iros_idempotency iros_idempotency_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_idempotency
    ADD CONSTRAINT iros_idempotency_pkey PRIMARY KEY (id);


--
-- Name: iros_integration_tokens iros_integration_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_integration_tokens
    ADD CONSTRAINT iros_integration_tokens_pkey PRIMARY KEY (id);


--
-- Name: iros_integration_tokens iros_integration_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_integration_tokens
    ADD CONSTRAINT iros_integration_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: iros_interactions iros_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_interactions
    ADD CONSTRAINT iros_interactions_pkey PRIMARY KEY (id);


--
-- Name: iros_posts iros_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_posts
    ADD CONSTRAINT iros_posts_pkey PRIMARY KEY (id);


--
-- Name: iros_stakeholders iros_stakeholders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_stakeholders
    ADD CONSTRAINT iros_stakeholders_pkey PRIMARY KEY (id);


--
-- Name: iros_voice_profiles iros_voice_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_voice_profiles
    ADD CONSTRAINT iros_voice_profiles_pkey PRIMARY KEY (id);


--
-- Name: lead_lists lead_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_lists
    ADD CONSTRAINT lead_lists_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: members members_handle_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_handle_key UNIQUE (handle);


--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (id);


--
-- Name: members members_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_user_id_key UNIQUE (user_id);


--
-- Name: oauth_access_tokens oauth_access_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_access_tokens
    ADD CONSTRAINT oauth_access_tokens_pkey PRIMARY KEY (id);


--
-- Name: oauth_access_tokens oauth_access_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_access_tokens
    ADD CONSTRAINT oauth_access_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: oauth_auth_codes oauth_auth_codes_code_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_auth_codes
    ADD CONSTRAINT oauth_auth_codes_code_hash_key UNIQUE (code_hash);


--
-- Name: oauth_auth_codes oauth_auth_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_auth_codes
    ADD CONSTRAINT oauth_auth_codes_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_client_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_clients
    ADD CONSTRAINT oauth_clients_client_id_key UNIQUE (client_id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_grants oauth_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_grants
    ADD CONSTRAINT oauth_grants_pkey PRIMARY KEY (id);


--
-- Name: oauth_grants oauth_grants_refresh_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_grants
    ADD CONSTRAINT oauth_grants_refresh_hash_key UNIQUE (refresh_hash);


--
-- Name: outreach_leads outreach_leads_list_id_cik_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_leads
    ADD CONSTRAINT outreach_leads_list_id_cik_key UNIQUE (list_id, cik);


--
-- Name: outreach_leads outreach_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_leads
    ADD CONSTRAINT outreach_leads_pkey PRIMARY KEY (id);


--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (user_id);


--
-- Name: public_board public_board_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_board
    ADD CONSTRAINT public_board_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (bucket);


--
-- Name: social_strategy social_strategy_company_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_strategy
    ADD CONSTRAINT social_strategy_company_id_key UNIQUE (company_id);


--
-- Name: social_strategy social_strategy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_strategy
    ADD CONSTRAINT social_strategy_pkey PRIMARY KEY (id);


--
-- Name: sponsored_briefs sponsored_briefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sponsored_briefs
    ADD CONSTRAINT sponsored_briefs_pkey PRIMARY KEY (id);


--
-- Name: team_calendar_events team_calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_calendar_events
    ADD CONSTRAINT team_calendar_events_pkey PRIMARY KEY (id);


--
-- Name: team_calendars team_calendars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_calendars
    ADD CONSTRAINT team_calendars_pkey PRIMARY KEY (id);


--
-- Name: team_chat team_chat_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_chat
    ADD CONSTRAINT team_chat_pkey PRIMARY KEY (id);


--
-- Name: team_profiles team_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_profiles
    ADD CONSTRAINT team_profiles_pkey PRIMARY KEY (company_id, user_id);


--
-- Name: team_updates team_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_updates
    ADD CONSTRAINT team_updates_pkey PRIMARY KEY (id);


--
-- Name: ticker_views_daily ticker_views_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticker_views_daily
    ADD CONSTRAINT ticker_views_daily_pkey PRIMARY KEY (ticker, day);


--
-- Name: ticker_views ticker_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticker_views
    ADD CONSTRAINT ticker_views_pkey PRIMARY KEY (ticker);


--
-- Name: usage_daily usage_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_daily
    ADD CONSTRAINT usage_daily_pkey PRIMARY KEY (key, day);


--
-- Name: user_flags user_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_flags
    ADD CONSTRAINT user_flags_pkey PRIMARY KEY (user_id);


--
-- Name: user_workspace user_workspace_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_workspace
    ADD CONSTRAINT user_workspace_pkey PRIMARY KEY (id);


--
-- Name: watch_snapshots watch_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watch_snapshots
    ADD CONSTRAINT watch_snapshots_pkey PRIMARY KEY (ticker);


--
-- Name: watches watches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watches
    ADD CONSTRAINT watches_pkey PRIMARY KEY (id);


--
-- Name: watches watches_ticker_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watches
    ADD CONSTRAINT watches_ticker_email_key UNIQUE (ticker, email);


--
-- Name: calendar_access_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_access_user_idx ON public.calendar_access USING btree (user_id);


--
-- Name: companies_archived_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_archived_idx ON public.companies USING btree (archived_at) WHERE (archived_at IS NOT NULL);


--
-- Name: company_stats_dilution_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_stats_dilution_idx ON public.company_stats USING btree (shares_change_pct_1y);


--
-- Name: company_stats_insider_net_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_stats_insider_net_idx ON public.company_stats USING btree (insider_net DESC);


--
-- Name: company_stats_snapshot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_stats_snapshot_idx ON public.company_stats USING btree (snapshot_at DESC);


--
-- Name: company_stats_trend_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_stats_trend_idx ON public.company_stats USING btree (trend_score DESC);


--
-- Name: company_stats_volume_ratio_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_stats_volume_ratio_idx ON public.company_stats USING btree (volume_ratio DESC);


--
-- Name: company_users_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_users_company_idx ON public.company_users USING btree (company_id);


--
-- Name: company_users_invite_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_users_invite_idx ON public.company_users USING btree (lower(invited_email));


--
-- Name: company_users_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_users_token_idx ON public.company_users USING btree (invite_token);


--
-- Name: company_users_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_users_user_idx ON public.company_users USING btree (user_id);


--
-- Name: crm_activities_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_activities_contact_idx ON public.crm_activities USING btree (contact_id);


--
-- Name: crm_activities_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_activities_tenant_idx ON public.crm_activities USING btree (company_id);


--
-- Name: crm_companies_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_companies_tenant_idx ON public.crm_companies USING btree (company_id);


--
-- Name: crm_contacts_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_contacts_company_idx ON public.crm_contacts USING btree (crm_company_id);


--
-- Name: crm_contacts_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_contacts_tenant_idx ON public.crm_contacts USING btree (company_id);


--
-- Name: crm_deals_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_deals_tenant_idx ON public.crm_deals USING btree (company_id);


--
-- Name: crm_tasks_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_tasks_tenant_idx ON public.crm_tasks USING btree (company_id);


--
-- Name: email_events_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_events_message_idx ON public.email_events USING btree (message_id);


--
-- Name: email_events_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_events_to_idx ON public.email_events USING btree (lower(to_email), sent_at DESC);


--
-- Name: iros_confirmations_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iros_confirmations_company_idx ON public.iros_confirmations USING btree (company_id, action);


--
-- Name: iros_event_deliveries_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iros_event_deliveries_event_idx ON public.iros_event_deliveries USING btree (event_id);


--
-- Name: iros_event_subscriptions_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iros_event_subscriptions_company_idx ON public.iros_event_subscriptions USING btree (company_id);


--
-- Name: iros_idempotency_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iros_idempotency_created_idx ON public.iros_idempotency USING btree (created_at);


--
-- Name: iros_integration_tokens_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iros_integration_tokens_company_idx ON public.iros_integration_tokens USING btree (company_id);


--
-- Name: iros_posts_calendar_batch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iros_posts_calendar_batch_idx ON public.iros_posts USING btree (calendar_batch) WHERE (calendar_batch IS NOT NULL);


--
-- Name: iros_stakeholders_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iros_stakeholders_company_idx ON public.iros_stakeholders USING btree (company_id);


--
-- Name: oauth_access_tokens_grant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oauth_access_tokens_grant_idx ON public.oauth_access_tokens USING btree (grant_id);


--
-- Name: oauth_grants_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oauth_grants_lookup_idx ON public.oauth_grants USING btree (client_id, subject_user, company_id);


--
-- Name: outreach_leads_fit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_leads_fit_idx ON public.outreach_leads USING btree (list_id, fit_score DESC);


--
-- Name: outreach_leads_list_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_leads_list_idx ON public.outreach_leads USING btree (list_id, status);


--
-- Name: outreach_leads_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_leads_message_idx ON public.outreach_leads USING btree (message_id);


--
-- Name: public_board_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX public_board_member_idx ON public.public_board USING btree (member_id);


--
-- Name: public_board_ticker_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX public_board_ticker_idx ON public.public_board USING btree (ticker, created_at DESC);


--
-- Name: team_calendar_events_cal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_calendar_events_cal_idx ON public.team_calendar_events USING btree (calendar_id, event_date);


--
-- Name: team_calendars_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_calendars_company_idx ON public.team_calendars USING btree (company_id);


--
-- Name: team_chat_company_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_chat_company_time_idx ON public.team_chat USING btree (company_id, created_at DESC);


--
-- Name: team_updates_company_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_updates_company_time_idx ON public.team_updates USING btree (company_id, created_at DESC);


--
-- Name: user_workspace_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_workspace_owner_idx ON public.user_workspace USING btree (company_id, user_id, updated_at DESC);


--
-- Name: watches_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX watches_member_idx ON public.watches USING btree (member_id);


--
-- Name: audit_log audit_log_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_log_no_update BEFORE DELETE OR UPDATE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();


--
-- Name: audit_log audit_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: calendar_access calendar_access_calendar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_access
    ADD CONSTRAINT calendar_access_calendar_id_fkey FOREIGN KEY (calendar_id) REFERENCES public.team_calendars(id) ON DELETE CASCADE;


--
-- Name: calendar_access calendar_access_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_access
    ADD CONSTRAINT calendar_access_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: calendar_access calendar_access_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_access
    ADD CONSTRAINT calendar_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: companies companies_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: company_data company_data_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_data
    ADD CONSTRAINT company_data_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_features company_features_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_features
    ADD CONSTRAINT company_features_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_users company_users_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_users
    ADD CONSTRAINT company_users_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_users company_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_users
    ADD CONSTRAINT company_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: crm_activities crm_activities_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: crm_activities crm_activities_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE CASCADE;


--
-- Name: crm_activities crm_activities_crm_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_crm_company_id_fkey FOREIGN KEY (crm_company_id) REFERENCES public.crm_companies(id) ON DELETE CASCADE;


--
-- Name: crm_activities crm_activities_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.crm_deals(id) ON DELETE CASCADE;


--
-- Name: crm_companies crm_companies_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_companies
    ADD CONSTRAINT crm_companies_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: crm_contacts crm_contacts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: crm_contacts crm_contacts_crm_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_crm_company_id_fkey FOREIGN KEY (crm_company_id) REFERENCES public.crm_companies(id) ON DELETE SET NULL;


--
-- Name: crm_deals crm_deals_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: crm_deals crm_deals_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE SET NULL;


--
-- Name: crm_deals crm_deals_crm_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_crm_company_id_fkey FOREIGN KEY (crm_company_id) REFERENCES public.crm_companies(id) ON DELETE SET NULL;


--
-- Name: crm_tasks crm_tasks_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: crm_tasks crm_tasks_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE SET NULL;


--
-- Name: crm_tasks crm_tasks_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.crm_deals(id) ON DELETE SET NULL;


--
-- Name: iros_approvals iros_approvals_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_approvals
    ADD CONSTRAINT iros_approvals_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: iros_approvals iros_approvals_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_approvals
    ADD CONSTRAINT iros_approvals_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: iros_approvals iros_approvals_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_approvals
    ADD CONSTRAINT iros_approvals_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.iros_posts(id) ON DELETE CASCADE;


--
-- Name: iros_confirmations iros_confirmations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_confirmations
    ADD CONSTRAINT iros_confirmations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: iros_disclosure_events iros_disclosure_events_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_disclosure_events
    ADD CONSTRAINT iros_disclosure_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: iros_disclosure_events iros_disclosure_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_disclosure_events
    ADD CONSTRAINT iros_disclosure_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: iros_event_deliveries iros_event_deliveries_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_event_deliveries
    ADD CONSTRAINT iros_event_deliveries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: iros_event_subscriptions iros_event_subscriptions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_event_subscriptions
    ADD CONSTRAINT iros_event_subscriptions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: iros_idempotency iros_idempotency_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_idempotency
    ADD CONSTRAINT iros_idempotency_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: iros_integration_tokens iros_integration_tokens_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_integration_tokens
    ADD CONSTRAINT iros_integration_tokens_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: iros_integration_tokens iros_integration_tokens_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_integration_tokens
    ADD CONSTRAINT iros_integration_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: iros_interactions iros_interactions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_interactions
    ADD CONSTRAINT iros_interactions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: iros_interactions iros_interactions_stakeholder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_interactions
    ADD CONSTRAINT iros_interactions_stakeholder_id_fkey FOREIGN KEY (stakeholder_id) REFERENCES public.iros_stakeholders(id) ON DELETE SET NULL;


--
-- Name: iros_posts iros_posts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_posts
    ADD CONSTRAINT iros_posts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: iros_posts iros_posts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_posts
    ADD CONSTRAINT iros_posts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: iros_stakeholders iros_stakeholders_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_stakeholders
    ADD CONSTRAINT iros_stakeholders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: iros_voice_profiles iros_voice_profiles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iros_voice_profiles
    ADD CONSTRAINT iros_voice_profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: members members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_access_tokens oauth_access_tokens_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_access_tokens
    ADD CONSTRAINT oauth_access_tokens_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: oauth_access_tokens oauth_access_tokens_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_access_tokens
    ADD CONSTRAINT oauth_access_tokens_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.oauth_grants(id) ON DELETE CASCADE;


--
-- Name: oauth_auth_codes oauth_auth_codes_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_auth_codes
    ADD CONSTRAINT oauth_auth_codes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: oauth_auth_codes oauth_auth_codes_subject_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_auth_codes
    ADD CONSTRAINT oauth_auth_codes_subject_user_fkey FOREIGN KEY (subject_user) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_grants oauth_grants_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_grants
    ADD CONSTRAINT oauth_grants_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: oauth_grants oauth_grants_subject_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_grants
    ADD CONSTRAINT oauth_grants_subject_user_fkey FOREIGN KEY (subject_user) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: outreach_leads outreach_leads_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_leads
    ADD CONSTRAINT outreach_leads_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.lead_lists(id) ON DELETE CASCADE;


--
-- Name: platform_admins platform_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: public_board public_board_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_board
    ADD CONSTRAINT public_board_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE SET NULL;


--
-- Name: social_strategy social_strategy_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_strategy
    ADD CONSTRAINT social_strategy_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: social_strategy social_strategy_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_strategy
    ADD CONSTRAINT social_strategy_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: sponsored_briefs sponsored_briefs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sponsored_briefs
    ADD CONSTRAINT sponsored_briefs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: team_calendar_events team_calendar_events_calendar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_calendar_events
    ADD CONSTRAINT team_calendar_events_calendar_id_fkey FOREIGN KEY (calendar_id) REFERENCES public.team_calendars(id) ON DELETE CASCADE;


--
-- Name: team_calendar_events team_calendar_events_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_calendar_events
    ADD CONSTRAINT team_calendar_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: team_calendar_events team_calendar_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_calendar_events
    ADD CONSTRAINT team_calendar_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: team_calendars team_calendars_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_calendars
    ADD CONSTRAINT team_calendars_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: team_calendars team_calendars_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_calendars
    ADD CONSTRAINT team_calendars_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: team_chat team_chat_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_chat
    ADD CONSTRAINT team_chat_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: team_chat team_chat_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_chat
    ADD CONSTRAINT team_chat_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: team_profiles team_profiles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_profiles
    ADD CONSTRAINT team_profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: team_profiles team_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_profiles
    ADD CONSTRAINT team_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: team_updates team_updates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_updates
    ADD CONSTRAINT team_updates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: team_updates team_updates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_updates
    ADD CONSTRAINT team_updates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_flags user_flags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_flags
    ADD CONSTRAINT user_flags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_workspace user_workspace_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_workspace
    ADD CONSTRAINT user_workspace_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: user_workspace user_workspace_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_workspace
    ADD CONSTRAINT user_workspace_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: watches watches_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watches
    ADD CONSTRAINT watches_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_log_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_read ON public.audit_log FOR SELECT USING (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin()));


--
-- Name: public_board board_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY board_read ON public.public_board FOR SELECT USING (true);


--
-- Name: public_board board_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY board_self_read ON public.public_board FOR SELECT USING ((member_id IN ( SELECT members.id
   FROM public.members
  WHERE (members.user_id = auth.uid()))));


--
-- Name: sponsored_briefs briefs_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY briefs_read ON public.sponsored_briefs FOR SELECT USING (((published = true) OR (company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin()));


--
-- Name: calendar_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_access ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_access calendar_access_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_access_read ON public.calendar_access FOR SELECT USING (((user_id = auth.uid()) OR public.is_company_admin(company_id) OR public.is_super_admin()));


--
-- Name: calendar_access calendar_access_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_access_write ON public.calendar_access USING ((public.is_company_admin(company_id) OR public.is_super_admin())) WITH CHECK ((public.is_company_admin(company_id) OR public.is_super_admin()));


--
-- Name: claim_requests claim_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY claim_admin_read ON public.claim_requests FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.owner_id = auth.uid()) AND (companies.is_admin = true)))));


--
-- Name: claim_requests claim_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY claim_insert ON public.claim_requests FOR INSERT WITH CHECK (true);


--
-- Name: claim_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.claim_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: companies companies_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_members ON public.companies USING (((id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin())) WITH CHECK (((id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin()));


--
-- Name: company_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_data ENABLE ROW LEVEL SECURITY;

--
-- Name: company_data company_data_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_data_members ON public.company_data USING (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin()));


--
-- Name: company_features; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_features ENABLE ROW LEVEL SECURITY;

--
-- Name: company_features company_features_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_features_admin_write ON public.company_features USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: company_features company_features_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_features_read ON public.company_features FOR SELECT USING (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin()));


--
-- Name: company_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: company_stats company_stats_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_stats_read ON public.company_stats FOR SELECT USING (true);


--
-- Name: company_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;

--
-- Name: company_users company_users_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_users_read ON public.company_users FOR SELECT USING (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin()));


--
-- Name: company_users company_users_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_users_write ON public.company_users USING ((public.is_company_admin(company_id) OR public.is_super_admin())) WITH CHECK ((public.is_company_admin(company_id) OR public.is_super_admin()));


--
-- Name: crm_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_activities crm_activities_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_activities_members ON public.crm_activities USING (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin()));


--
-- Name: crm_activities crm_activities_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_activities_rw ON public.crm_activities USING (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin()));


--
-- Name: crm_companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_companies ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_companies crm_companies_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_companies_members ON public.crm_companies USING (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin()));


--
-- Name: crm_companies crm_companies_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_companies_rw ON public.crm_companies USING (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin()));


--
-- Name: crm_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_contacts crm_contacts_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_contacts_members ON public.crm_contacts USING (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin()));


--
-- Name: crm_contacts crm_contacts_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_contacts_rw ON public.crm_contacts USING (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin()));


--
-- Name: crm_deals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_deals crm_deals_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_deals_members ON public.crm_deals USING (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin()));


--
-- Name: crm_deals crm_deals_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_deals_rw ON public.crm_deals USING (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin()));


--
-- Name: crm_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_tasks crm_tasks_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_tasks_members ON public.crm_tasks USING (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin()));


--
-- Name: crm_tasks crm_tasks_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_tasks_rw ON public.crm_tasks USING (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin()));


--
-- Name: email_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

--
-- Name: email_events email_events_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_events_admin_read ON public.email_events FOR SELECT USING (public.is_super_admin());


--
-- Name: iros_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.iros_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: iros_approvals iros_approvals_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iros_approvals_members ON public.iros_approvals USING (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin()));


--
-- Name: iros_approvals iros_approvals_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iros_approvals_read ON public.iros_approvals FOR SELECT USING (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin()));


--
-- Name: iros_confirmations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.iros_confirmations ENABLE ROW LEVEL SECURITY;

--
-- Name: iros_disclosure_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.iros_disclosure_events ENABLE ROW LEVEL SECURITY;

--
-- Name: iros_disclosure_events iros_disclosure_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iros_disclosure_rw ON public.iros_disclosure_events USING (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin()));


--
-- Name: iros_event_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.iros_event_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: iros_event_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.iros_event_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: iros_idempotency; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.iros_idempotency ENABLE ROW LEVEL SECURITY;

--
-- Name: iros_integration_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.iros_integration_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: iros_interactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.iros_interactions ENABLE ROW LEVEL SECURITY;

--
-- Name: iros_interactions iros_interactions_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iros_interactions_rw ON public.iros_interactions USING (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin()));


--
-- Name: iros_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.iros_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: iros_posts iros_posts_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iros_posts_members ON public.iros_posts USING (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin()));


--
-- Name: iros_posts iros_posts_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iros_posts_rw ON public.iros_posts USING (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin()));


--
-- Name: iros_stakeholders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.iros_stakeholders ENABLE ROW LEVEL SECURITY;

--
-- Name: iros_stakeholders iros_stakeholders_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iros_stakeholders_members ON public.iros_stakeholders USING (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin()));


--
-- Name: iros_stakeholders iros_stakeholders_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iros_stakeholders_rw ON public.iros_stakeholders USING (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin()));


--
-- Name: iros_voice_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.iros_voice_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: iros_voice_profiles iros_voices_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iros_voices_rw ON public.iros_voice_profiles USING (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin()));


--
-- Name: lead_lists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_lists ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_lists lead_lists_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_lists_admin ON public.lead_lists USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: leads leads_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_admin_read ON public.leads FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.owner_id = auth.uid()) AND (companies.is_admin = true)))));


--
-- Name: leads leads_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_insert ON public.leads FOR INSERT WITH CHECK (true);


--
-- Name: members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

--
-- Name: members members_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_self ON public.members USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: oauth_access_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.oauth_access_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: oauth_auth_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.oauth_auth_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: oauth_clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;

--
-- Name: oauth_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.oauth_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_leads outreach_leads_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY outreach_leads_admin ON public.outreach_leads USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: platform_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_admins platform_admins_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY platform_admins_self ON public.platform_admins FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: public_board; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.public_board ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: social_strategy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_strategy ENABLE ROW LEVEL SECURITY;

--
-- Name: social_strategy social_strategy_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY social_strategy_rw ON public.social_strategy USING (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.owner_id = auth.uid()))) OR public.is_super_admin()));


--
-- Name: sponsored_briefs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sponsored_briefs ENABLE ROW LEVEL SECURITY;

--
-- Name: team_calendar_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_calendar_events ENABLE ROW LEVEL SECURITY;

--
-- Name: team_calendar_events team_calendar_events_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_calendar_events_read ON public.team_calendar_events FOR SELECT USING (((calendar_id IN ( SELECT team_calendars.id
   FROM public.team_calendars)) OR public.is_super_admin()));


--
-- Name: team_calendar_events team_calendar_events_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_calendar_events_write ON public.team_calendar_events USING (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin())) WITH CHECK (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin()));


--
-- Name: team_calendars; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_calendars ENABLE ROW LEVEL SECURITY;

--
-- Name: team_calendars team_calendars_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_calendars_read ON public.team_calendars FOR SELECT USING ((((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) AND ((kind = 'general'::text) OR (owner_user_id = auth.uid()) OR public.is_company_admin(company_id) OR (id IN ( SELECT calendar_access.calendar_id
   FROM public.calendar_access
  WHERE (calendar_access.user_id = auth.uid()))))) OR public.is_super_admin()));


--
-- Name: team_calendars team_calendars_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_calendars_write ON public.team_calendars USING ((((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) AND (public.is_company_admin(company_id) OR (owner_user_id = auth.uid()))) OR public.is_super_admin())) WITH CHECK ((((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) AND (public.is_company_admin(company_id) OR (owner_user_id = auth.uid()))) OR public.is_super_admin()));


--
-- Name: team_chat; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_chat ENABLE ROW LEVEL SECURITY;

--
-- Name: team_chat team_chat_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_chat_delete ON public.team_chat FOR DELETE USING (((user_id = auth.uid()) OR public.is_company_admin(company_id) OR public.is_super_admin()));


--
-- Name: team_chat team_chat_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_chat_insert ON public.team_chat FOR INSERT WITH CHECK (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin()));


--
-- Name: team_chat team_chat_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_chat_read ON public.team_chat FOR SELECT USING (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin()));


--
-- Name: team_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: team_profiles team_profiles_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_profiles_read ON public.team_profiles FOR SELECT USING (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin()));


--
-- Name: team_profiles team_profiles_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_profiles_write ON public.team_profiles USING ((((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) AND ((user_id = auth.uid()) OR public.is_company_admin(company_id))) OR public.is_super_admin())) WITH CHECK ((((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) AND ((user_id = auth.uid()) OR public.is_company_admin(company_id))) OR public.is_super_admin()));


--
-- Name: team_updates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_updates ENABLE ROW LEVEL SECURITY;

--
-- Name: team_updates team_updates_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_updates_delete ON public.team_updates FOR DELETE USING (((user_id = auth.uid()) OR public.is_company_admin(company_id) OR public.is_super_admin()));


--
-- Name: team_updates team_updates_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_updates_insert ON public.team_updates FOR INSERT WITH CHECK ((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)));


--
-- Name: team_updates team_updates_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_updates_read ON public.team_updates FOR SELECT USING (((company_id IN ( SELECT public.my_company_ids() AS my_company_ids)) OR public.is_super_admin()));


--
-- Name: ticker_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticker_views ENABLE ROW LEVEL SECURITY;

--
-- Name: ticker_views_daily; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticker_views_daily ENABLE ROW LEVEL SECURITY;

--
-- Name: usage_daily; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usage_daily ENABLE ROW LEVEL SECURITY;

--
-- Name: user_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_flags ENABLE ROW LEVEL SECURITY;

--
-- Name: user_flags user_flags_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_flags_own ON public.user_flags USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_workspace; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_workspace ENABLE ROW LEVEL SECURITY;

--
-- Name: user_workspace user_workspace_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_workspace_own ON public.user_workspace USING (((user_id = auth.uid()) AND (company_id IN ( SELECT public.my_company_ids() AS my_company_ids)))) WITH CHECK (((user_id = auth.uid()) AND (company_id IN ( SELECT public.my_company_ids() AS my_company_ids))));


--
-- Name: ticker_views views_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY views_all ON public.ticker_views FOR SELECT USING (true);


--
-- Name: watch_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.watch_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: watches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.watches ENABLE ROW LEVEL SECURITY;

--
-- Name: watches watches_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY watches_admin_read ON public.watches FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.owner_id = auth.uid()) AND (companies.is_admin = true)))));


--
-- Name: watches watches_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY watches_insert ON public.watches FOR INSERT WITH CHECK (true);


--
-- Name: watches watches_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY watches_self_read ON public.watches FOR SELECT USING ((member_id IN ( SELECT members.id
   FROM public.members
  WHERE (members.user_id = auth.uid()))));


--
-- Name: watches watches_self_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY watches_self_write ON public.watches USING ((member_id IN ( SELECT members.id
   FROM public.members
  WHERE (members.user_id = auth.uid())))) WITH CHECK ((member_id IN ( SELECT members.id
   FROM public.members
  WHERE (members.user_id = auth.uid()))));


--
-- PostgreSQL database dump complete
--

