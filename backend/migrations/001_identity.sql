-- Up Migration
CREATE TABLE user_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone text NOT NULL UNIQUE,
    name text,
    password_hash text,
    token_version integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name text NOT NULL,
    vertical_type text NOT NULL CHECK (vertical_type IN ('fuel', 'timber', 'construction', 'kirana', 'other')),
    language text NOT NULL DEFAULT 'hi' CHECK (language IN ('en', 'hi')),
    tax_profile jsonb,
    config jsonb NOT NULL DEFAULT '{}',
    is_active boolean NOT NULL DEFAULT true,
    trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '336 hours'),
    plan_name text NOT NULL DEFAULT 'Trial',
    subscription_status text NOT NULL DEFAULT 'trialing'
        CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
    plan_limits jsonb NOT NULL,
    current_period_end timestamptz,
    past_due_since timestamptz,
    pending_subscription_id text,
    current_subscription_id text,
    checkout_attempt text,
    checkout_started_at timestamptz,
    cancel_at_cycle_end boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    user_id uuid NOT NULL REFERENCES user_accounts (id),
    role text NOT NULL CHECK (role IN ('owner', 'manager', 'attendant')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'disabled')),
    invited_by uuid REFERENCES user_accounts (id),
    last_used_at timestamptz,
    invite_token_hash text,
    invite_expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, user_id)
);

CREATE INDEX memberships_user_id_idx ON memberships (user_id);
CREATE INDEX memberships_role_status_idx ON memberships (workspace_id, role, status);
CREATE INDEX memberships_invite_token_idx ON memberships (workspace_id, invite_token_hash);

CREATE TABLE refresh_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    user_id uuid NOT NULL REFERENCES user_accounts (id),
    token_version integer NOT NULL,
    family_id uuid NOT NULL,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    user_agent text,
    revoked_at timestamptz,
    -- Refresh families follow the account when the selected workspace changes.
    replaced_by uuid REFERENCES refresh_tokens (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX refresh_tokens_user_family_idx ON refresh_tokens (user_id, family_id);
CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens (expires_at);

CREATE TABLE password_otps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_hash text NOT NULL UNIQUE,
    code_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    sent_at timestamptz NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX password_otps_expires_at_idx ON password_otps (expires_at);

-- Down Migration
DROP TABLE password_otps;
DROP TABLE refresh_tokens;
DROP TABLE memberships;
DROP TABLE workspaces;
DROP TABLE user_accounts;
