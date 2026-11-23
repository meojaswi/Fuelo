-- Up Migration
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE TABLE customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    name text NOT NULL,
    phone text NOT NULL,
    is_credit_customer boolean DEFAULT false,
    credit_balance numeric(20,2) DEFAULT 0,
    gstin text,
    billing_address text,
    state text,
    vehicles jsonb DEFAULT '[]',
    credit_days integer,
    last_reminder_at timestamptz,
    credit_limit numeric(20,2),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    CHECK (credit_limit >= 0),
    UNIQUE (workspace_id, phone)
);

CREATE TABLE inventory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    item_type text NOT NULL,
    current_stock numeric NOT NULL DEFAULT 0,
    current_pieces numeric(20,4) DEFAULT 0,
    species text,
    grade text,
    pricing_unit text CHECK (pricing_unit IN ('cubic_ft', 'piece', 'running_ft', 'sq_ft')),
    default_thickness_in numeric,
    hsn_code text,
    gst_rate_percent numeric(20,2),
    unit text NOT NULL,
    price_per_unit numeric(20,2) NOT NULL DEFAULT 0,
    last_price_update timestamptz DEFAULT now(),
    price_source text DEFAULT 'manual' CHECK (price_source IN ('manual', 'auto')),
    removed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    CHECK (current_stock NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric))
);

CREATE TABLE tanks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    name text NOT NULL,
    item_type text NOT NULL,
    capacity_litres numeric(20,4) NOT NULL,
    book_stock numeric(20,4) DEFAULT 0,
    is_active boolean DEFAULT true,
    deactivated_at timestamptz,
    deactivated_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, name)
);

CREATE TABLE nozzles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    tank_id uuid NOT NULL,
    label text NOT NULL,
    item_type text NOT NULL,
    last_meter_reading numeric(20,4) DEFAULT 0,
    is_active boolean DEFAULT true,
    deactivated_at timestamptz,
    deactivated_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, label)
);

CREATE TABLE shifts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    opened_by uuid NOT NULL REFERENCES user_accounts (id),
    opened_at timestamptz NOT NULL DEFAULT now(),
    closed_at timestamptz,
    status text DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    prices_snapshot jsonb DEFAULT '[]',
    nozzle_readings jsonb DEFAULT '[]',
    declared_cash numeric(20,2),
    declared_upi numeric(20,2),
    declared_card numeric(20,2),
    credit_sales_total numeric(20,2),
    expected_sales_total numeric(20,2),
    variance numeric(20,2),
    stock_effects jsonb DEFAULT '[]',
    reopened_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id)
);

CREATE TABLE deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    tank_id uuid NOT NULL,
    item_type text NOT NULL,
    supplier_name text NOT NULL,
    invoice_number text,
    vehicle_number text,
    quantity_litres numeric(20,4) NOT NULL,
    rate_per_litre numeric(20,2) NOT NULL,
    total_amount numeric(20,2) NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    received_by uuid NOT NULL REFERENCES user_accounts (id),
    status text DEFAULT 'active' CHECK (status IN ('active', 'voided')),
    voided_at timestamptz,
    voided_by uuid REFERENCES user_accounts (id),
    voided_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id)
);

CREATE TABLE dip_readings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    tank_id uuid NOT NULL,
    reading_litres numeric(20,4) NOT NULL,
    book_stock numeric(20,4) NOT NULL,
    variance_litres numeric(20,4) NOT NULL,
    recorded_at timestamptz DEFAULT now(),
    recorded_by uuid NOT NULL REFERENCES user_accounts (id),
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id)
);

CREATE TABLE transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    customer_id uuid,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    item_type text NOT NULL,
    quantity numeric NOT NULL,
    unit text NOT NULL,
    amount numeric(20,2) NOT NULL,
    line_items jsonb,
    charges jsonb,
    paid_amount numeric(20,2),
    credit_amount numeric(20,2),
    advance_applied numeric(20,2),
    invoice_number text,
    invoice jsonb,
    credit_note_id uuid,
    expected_amount numeric(20,2),
    price_mismatch boolean,
    payment_mode text NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'credit')),
    upi_reference text,
    notes text,
    created_by uuid REFERENCES user_accounts (id),
    shift_id uuid,
    vehicle_number text,
    vehicle_number_warning boolean,
    tank_changes jsonb DEFAULT '[]',
    inventory_id uuid,
    voided_at timestamptz,
    voided_reason text,
    voided_by uuid REFERENCES user_accounts (id),
    status text DEFAULT 'active' CHECK (status IN ('active', 'voided')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    CHECK (quantity > 0 AND quantity NOT IN ('NaN'::numeric, 'Infinity'::numeric))
);

CREATE TABLE ledger_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    customer_id uuid NOT NULL,
    type text NOT NULL CHECK (type IN ('credit_sale', 'payment', 'adjustment', 'void_reversal')),
    amount numeric(20,2) NOT NULL,
    direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
    transaction_id uuid,
    payment_mode text CHECK (payment_mode IN ('cash', 'upi', 'credit')),
    upi_reference text,
    note text,
    created_by uuid NOT NULL REFERENCES user_accounts (id),
    affects_balance boolean DEFAULT true,
    balance_after numeric(20,2) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    CHECK (amount > 0)
);

CREATE TABLE suppliers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    name text NOT NULL,
    phone text,
    gstin text,
    address text,
    state text,
    opening_balance numeric(20,2) DEFAULT 0,
    balance numeric(20,2) DEFAULT 0,
    is_active boolean DEFAULT true,
    deactivation_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id)
);

CREATE TABLE purchases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    supplier_id uuid NOT NULL,
    supplier_name text NOT NULL,
    invoice_number text NOT NULL,
    invoice_date date NOT NULL,
    line_items jsonb NOT NULL DEFAULT '[]',
    charges jsonb DEFAULT '[]',
    total numeric(20,2) NOT NULL,
    paid_amount numeric(20,2) DEFAULT 0,
    payment_mode text CHECK (payment_mode IN ('cash', 'upi')),
    status text DEFAULT 'active' CHECK (status IN ('active', 'voided')),
    notes text,
    created_by uuid NOT NULL REFERENCES user_accounts (id),
    voided_at timestamptz,
    voided_by uuid REFERENCES user_accounts (id),
    voided_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, supplier_id, invoice_number)
);

CREATE TABLE supplier_ledger_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    supplier_id uuid NOT NULL,
    purchase_id uuid,
    type text NOT NULL CHECK (type IN ('purchase', 'payment', 'adjustment', 'void_reversal')),
    direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
    amount numeric(20,2) NOT NULL,
    balance_after numeric(20,2) NOT NULL,
    effective_at timestamptz,
    payment_mode text CHECK (payment_mode IN ('cash', 'upi')),
    note text,
    created_by uuid NOT NULL REFERENCES user_accounts (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    CHECK (amount > 0)
);

CREATE TABLE credit_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    transaction_id uuid NOT NULL,
    invoice_number text NOT NULL,
    number text NOT NULL,
    issued_at timestamptz NOT NULL,
    reason text NOT NULL,
    issued_by uuid NOT NULL REFERENCES user_accounts (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, transaction_id),
    UNIQUE (workspace_id, number)
);

CREATE TABLE invoice_counters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    year text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('invoice', 'credit_note')),
    sequence bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, year, kind)
);

CREATE TABLE stock_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    item_type text NOT NULL,
    delta numeric NOT NULL,
    reason text NOT NULL CHECK (reason IN ('sale', 'void', 'manual_adjust', 'purchase', 'shift_sale', 'shift_reopen', 'delivery_void', 'purchase_void')),
    pieces_delta numeric(20,4),
    pieces_after numeric(20,4),
    purchase_id uuid,
    transaction_id uuid,
    delivery_id uuid,
    shift_id uuid,
    reversed_at timestamptz,
    tank_changes jsonb DEFAULT '[]',
    created_by uuid NOT NULL REFERENCES user_accounts (id),
    balance_after numeric NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id)
);

CREATE TABLE price_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id),
    item_type text NOT NULL,
    old_price numeric(20,2) NOT NULL,
    new_price numeric(20,2) NOT NULL,
    changed_by uuid NOT NULL REFERENCES user_accounts (id),
    changed_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id)
);

ALTER TABLE nozzles ADD CONSTRAINT nozzles_tank_id_fk
    FOREIGN KEY (workspace_id, tank_id) REFERENCES tanks (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE deliveries ADD CONSTRAINT deliveries_tank_id_fk
    FOREIGN KEY (workspace_id, tank_id) REFERENCES tanks (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE dip_readings ADD CONSTRAINT dip_readings_tank_id_fk
    FOREIGN KEY (workspace_id, tank_id) REFERENCES tanks (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE transactions ADD CONSTRAINT transactions_customer_id_fk
    FOREIGN KEY (workspace_id, customer_id) REFERENCES customers (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE transactions ADD CONSTRAINT transactions_credit_note_id_fk
    FOREIGN KEY (workspace_id, credit_note_id) REFERENCES credit_notes (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE transactions ADD CONSTRAINT transactions_shift_id_fk
    FOREIGN KEY (workspace_id, shift_id) REFERENCES shifts (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE transactions ADD CONSTRAINT transactions_inventory_id_fk
    FOREIGN KEY (workspace_id, inventory_id) REFERENCES inventory (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_customer_id_fk
    FOREIGN KEY (workspace_id, customer_id) REFERENCES customers (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_transaction_id_fk
    FOREIGN KEY (workspace_id, transaction_id) REFERENCES transactions (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE purchases ADD CONSTRAINT purchases_supplier_id_fk
    FOREIGN KEY (workspace_id, supplier_id) REFERENCES suppliers (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE supplier_ledger_entries ADD CONSTRAINT supplier_ledger_entries_supplier_id_fk
    FOREIGN KEY (workspace_id, supplier_id) REFERENCES suppliers (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE supplier_ledger_entries ADD CONSTRAINT supplier_ledger_entries_purchase_id_fk
    FOREIGN KEY (workspace_id, purchase_id) REFERENCES purchases (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE credit_notes ADD CONSTRAINT credit_notes_transaction_id_fk
    FOREIGN KEY (workspace_id, transaction_id) REFERENCES transactions (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_purchase_id_fk
    FOREIGN KEY (workspace_id, purchase_id) REFERENCES purchases (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_transaction_id_fk
    FOREIGN KEY (workspace_id, transaction_id) REFERENCES transactions (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_delivery_id_fk
    FOREIGN KEY (workspace_id, delivery_id) REFERENCES deliveries (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_shift_id_fk
    FOREIGN KEY (workspace_id, shift_id) REFERENCES shifts (workspace_id, id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX customers_workspace_id_credit_balance_id_idx ON customers (workspace_id, credit_balance DESC, id);
CREATE INDEX customers_name_trgm_idx ON customers USING gin (lower(name) public.gin_trgm_ops);
CREATE UNIQUE INDEX inventory_workspace_id_item_type_idx ON inventory (workspace_id, item_type) WHERE removed_at IS NULL;
CREATE INDEX tanks_workspace_id_item_type_is_active_idx ON tanks (workspace_id, item_type, is_active);
CREATE INDEX nozzles_workspace_id_tank_id_is_active_idx ON nozzles (workspace_id, tank_id, is_active);
CREATE UNIQUE INDEX shifts_workspace_id_status_idx ON shifts (workspace_id) WHERE status = 'open';
CREATE INDEX shifts_workspace_id_status_closed_at_idx ON shifts (workspace_id, status, closed_at DESC);
CREATE INDEX shifts_workspace_id_opened_at_id_idx ON shifts (workspace_id, opened_at DESC, id DESC);
CREATE INDEX deliveries_workspace_id_received_at_id_idx ON deliveries (workspace_id, received_at DESC, id DESC);
CREATE INDEX deliveries_workspace_id_tank_id_status_idx ON deliveries (workspace_id, tank_id, status);
CREATE INDEX dip_readings_workspace_id_tank_id_recorded_at_id_idx ON dip_readings (workspace_id, tank_id, recorded_at DESC, id DESC);
CREATE INDEX dip_readings_workspace_id_recorded_at_idx ON dip_readings (workspace_id, recorded_at DESC);
CREATE INDEX transactions_workspace_id_created_at_idx ON transactions (workspace_id, created_at DESC);
CREATE INDEX transactions_workspace_id_created_by_created_at_idx ON transactions (workspace_id, created_by, created_at DESC);
CREATE INDEX transactions_workspace_id_customer_phone_idx ON transactions (workspace_id, customer_phone);
CREATE INDEX transactions_workspace_id_payment_mode_created_at_idx ON transactions (workspace_id, payment_mode, created_at DESC);
CREATE INDEX transactions_workspace_id_shift_id_status_idx ON transactions (workspace_id, shift_id, status);
CREATE UNIQUE INDEX transactions_workspace_id_invoice_number_idx ON transactions (workspace_id, invoice_number) WHERE invoice_number IS NOT NULL;
CREATE INDEX transactions_invoice_issued_at_idx ON transactions (workspace_id, (invoice ->> 'issuedAt'));
CREATE INDEX ledger_entries_workspace_id_customer_id_created_at_id_idx ON ledger_entries (workspace_id, customer_id, created_at DESC, id DESC);
CREATE INDEX ledger_entries_workspace_id_customer_id_type_created_at_idx ON ledger_entries (workspace_id, customer_id, type, created_at DESC);
CREATE UNIQUE INDEX ledger_entries_workspace_id_transaction_id_type_idx ON ledger_entries (workspace_id, transaction_id, type) WHERE transaction_id IS NOT NULL;
CREATE INDEX suppliers_workspace_id_is_active_name_idx ON suppliers (workspace_id, is_active, name);
CREATE INDEX suppliers_workspace_id_balance_idx ON suppliers (workspace_id, balance DESC);
CREATE INDEX purchases_workspace_id_status_invoice_date_idx ON purchases (workspace_id, status, invoice_date DESC);
CREATE INDEX supplier_ledger_entries_workspace_id_supplier_id_created_at_id_idx ON supplier_ledger_entries (workspace_id, supplier_id, created_at DESC, id DESC);
CREATE UNIQUE INDEX supplier_ledger_entries_workspace_id_purchase_id_type_idx ON supplier_ledger_entries (workspace_id, purchase_id, type) WHERE purchase_id IS NOT NULL;
CREATE INDEX credit_notes_workspace_id_issued_at_idx ON credit_notes (workspace_id, issued_at);
CREATE INDEX stock_movements_workspace_id_item_type_created_at_idx ON stock_movements (workspace_id, item_type, created_at DESC);
CREATE INDEX stock_movements_tank_changes_idx ON stock_movements USING gin (tank_changes jsonb_path_ops);
CREATE INDEX price_history_workspace_id_item_type_changed_at_idx ON price_history (workspace_id, item_type, changed_at DESC);

-- Down Migration
DROP TABLE price_history, stock_movements, invoice_counters, credit_notes, supplier_ledger_entries, purchases, suppliers, ledger_entries, transactions, dip_readings, deliveries, shifts, nozzles, tanks, inventory, customers;
