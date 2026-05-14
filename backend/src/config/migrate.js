const pool = require('./db');

const migrate = async () => {
  const client = await pool.connect();

  try {
    console.log('🚀 Running Settlr database migration...');

    await client.query('BEGIN');

    // ─────────────────────────────────────────
    // ENUMS
    // ─────────────────────────────────────────
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'failed');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE split_status AS ENUM (
          'pending',
          'accepted',
          'pay_later',
          'declined',
          'no_response',
          'settled'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE debt_type AS ENUM ('no_response', 'pay_later', 'declined');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE reminder_type AS ENUM ('day1', 'day3', 'day7', 'due_date', 'custom');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE dispute_status AS ENUM ('open', 'resolved', 'escalated');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // ─────────────────────────────────────────
    // TABLE: USERS
    // ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name                VARCHAR(100)  NOT NULL,
        email               VARCHAR(150)  UNIQUE NOT NULL,
        phone               VARCHAR(20)   UNIQUE,
        password_hash       TEXT          NOT NULL,
        stripe_customer_id  VARCHAR(100),
        stripe_account_id   VARCHAR(100),
        fcm_token           TEXT,
        created_at          TIMESTAMP     DEFAULT NOW(),
        updated_at          TIMESTAMP     DEFAULT NOW()
      );
    `);

    console.log('  ✅ users table ready');

    // ─────────────────────────────────────────
    // TABLE: TRANSACTIONS
    // ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payer_id        UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        total_amount    DECIMAL(10,2) NOT NULL,
        currency        VARCHAR(3)    NOT NULL DEFAULT 'GBP',
        merchant_name   VARCHAR(200),
        status          transaction_status NOT NULL DEFAULT 'pending',
        created_at      TIMESTAMP     DEFAULT NOW(),
        updated_at      TIMESTAMP     DEFAULT NOW()
      );
    `);

    console.log('  ✅ transactions table ready');

    // ─────────────────────────────────────────
    // TABLE: SPLITS
    // ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS splits (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id    UUID          NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        payee_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount            DECIMAL(10,2) NOT NULL,
        status            split_status  NOT NULL DEFAULT 'pending',
        pay_later_date    TIMESTAMP,
        decline_reason    TEXT,
        stripe_transfer_id VARCHAR(100),
        responded_at      TIMESTAMP,
        settled_at        TIMESTAMP,
        created_at        TIMESTAMP     DEFAULT NOW(),
        updated_at        TIMESTAMP     DEFAULT NOW()
      );
    `);

    console.log('  ✅ splits table ready');

    // ─────────────────────────────────────────
    // TABLE: DEBTS
    // ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS debts (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        split_id          UUID          NOT NULL REFERENCES splits(id) ON DELETE CASCADE,
        debtor_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        creditor_id       UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount            DECIMAL(10,2) NOT NULL,
        type              debt_type     NOT NULL,
        due_date          TIMESTAMP,
        reminder_count    INT           DEFAULT 0,
        last_reminder_at  TIMESTAMP,
        settled_at        TIMESTAMP,
        created_at        TIMESTAMP     DEFAULT NOW(),
        updated_at        TIMESTAMP     DEFAULT NOW()
      );
    `);

    console.log('  ✅ debts table ready');

    // ─────────────────────────────────────────
    // TABLE: REMINDERS
    // ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS reminders (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        debt_id     UUID          NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
        type        reminder_type NOT NULL,
        sent_at     TIMESTAMP     DEFAULT NOW()
      );
    `);

    console.log('  ✅ reminders table ready');

    // ─────────────────────────────────────────
    // TABLE: DISPUTES
    // ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS disputes (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        split_id    UUID           NOT NULL REFERENCES splits(id) ON DELETE CASCADE,
        raised_by   UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason      TEXT           NOT NULL,
        status      dispute_status NOT NULL DEFAULT 'open',
        resolved_at TIMESTAMP,
        created_at  TIMESTAMP      DEFAULT NOW(),
        updated_at  TIMESTAMP      DEFAULT NOW()
      );
    `);

    console.log('  ✅ disputes table ready');

    // ─────────────────────────────────────────
    // INDEXES — speeds up common queries
    // ─────────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_payer_id   ON transactions(payer_id);
      CREATE INDEX IF NOT EXISTS idx_splits_transaction_id   ON splits(transaction_id);
      CREATE INDEX IF NOT EXISTS idx_splits_payee_id         ON splits(payee_id);
      CREATE INDEX IF NOT EXISTS idx_splits_status           ON splits(status);
      CREATE INDEX IF NOT EXISTS idx_debts_debtor_id         ON debts(debtor_id);
      CREATE INDEX IF NOT EXISTS idx_debts_creditor_id       ON debts(creditor_id);
      CREATE INDEX IF NOT EXISTS idx_debts_type              ON debts(type);
      CREATE INDEX IF NOT EXISTS idx_disputes_split_id       ON disputes(split_id);
    `);

    console.log('  ✅ indexes created');

    await client.query('COMMIT');
    console.log('\n🎉 Migration complete — all tables and indexes ready\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
};

migrate();
