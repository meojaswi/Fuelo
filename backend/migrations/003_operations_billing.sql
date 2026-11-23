-- Up Migration
CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    actor_user_id uuid REFERENCES user_accounts (id),
    actor_role text,
    action text NOT NULL,
    entity_type text,
    entity_id text,
    summary text,
    meta jsonb,
    ip text,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id)
);

CREATE TABLE daily_summaries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    date date NOT NULL,
    items jsonb DEFAULT '[]',
    grand_total_amount numeric(20,2) DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, date)
);

CREATE TABLE links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    transaction_id uuid,
    token text NOT NULL,
    expires_at timestamptz NOT NULL,
    first_viewed_at timestamptz,
    view_count bigint DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    UNIQUE (token)
);

CREATE TABLE message_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    transaction_id uuid,
    channel text NOT NULL CHECK (channel IN ('whatsapp', 'sms')),
    to_phone text NOT NULL,
    body text NOT NULL,
    sensitive boolean DEFAULT false,
    delivery_expires_at timestamptz,
    content_sid text,
    content_variables jsonb,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    attempts integer DEFAULT 0,
    max_attempts integer DEFAULT 3,
    last_error text,
    provider_message_sid text,
    sent_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id)
);

CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    transaction_id uuid,
    message_job_id uuid,
    channel text NOT NULL CHECK (channel IN ('whatsapp', 'sms')),
    status text NOT NULL CHECK (status IN ('sent', 'failed', 'pending')),
    retry_count integer DEFAULT 0,
    message_body text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id)
);

CREATE TABLE scheduler_locks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name text NOT NULL,
    run_date date NOT NULL,
    acquired_at timestamptz DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (job_name, run_date)
);

CREATE TABLE subscription_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
    price_in_paise bigint NOT NULL,
    plan_limits jsonb,
    transaction_cap bigint,
    razorpay_plan_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (name, billing_cycle)
);

CREATE TABLE workspace_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    plan_id uuid NOT NULL REFERENCES subscription_plans (id),
    razorpay_subscription_id text NOT NULL,
    status text DEFAULT 'created' CHECK (status IN ('created', 'active', 'halted', 'cancelled', 'completed')),
    current_period_end timestamptz,
    last_event_at numeric,
    last_event_rank integer,
    pending_plan_id uuid REFERENCES subscription_plans (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    UNIQUE (razorpay_subscription_id)
);

CREATE TABLE linked_revenue_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_name text NOT NULL,
    razorpay_account_id text NOT NULL,
    share_percent numeric NOT NULL,
    referred_workspace_ids jsonb DEFAULT '[]',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhook_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL CHECK (provider IN ('razorpay', 'twilio')),
    event_id text NOT NULL,
    processed_at timestamptz DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, event_id)
);

ALTER TABLE links ADD CONSTRAINT links_transaction_id_fk
    FOREIGN KEY (workspace_id, transaction_id) REFERENCES transactions (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE message_jobs ADD CONSTRAINT message_jobs_transaction_id_fk
    FOREIGN KEY (workspace_id, transaction_id) REFERENCES transactions (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE notifications ADD CONSTRAINT notifications_transaction_id_fk
    FOREIGN KEY (workspace_id, transaction_id) REFERENCES transactions (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE notifications ADD CONSTRAINT notifications_message_job_id_fk
    FOREIGN KEY (workspace_id, message_job_id) REFERENCES message_jobs (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX audit_logs_workspace_id_created_at_id_idx ON audit_logs (workspace_id, created_at DESC, id DESC);
CREATE INDEX message_jobs_status_idx ON message_jobs (status);
CREATE INDEX message_jobs_status_created_at_idx ON message_jobs (status, created_at);
CREATE INDEX notifications_workspace_id_created_at_idx ON notifications (workspace_id, created_at DESC);
CREATE INDEX workspace_subscriptions_workspace_id_idx ON workspace_subscriptions (workspace_id);

-- Down Migration
DROP TABLE webhook_events, linked_revenue_accounts, workspace_subscriptions, subscription_plans, scheduler_locks, notifications, message_jobs, links, daily_summaries, audit_logs;
