const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');

// Routes
const authRoutes        = require('./routes/auth.routes');
const userRoutes        = require('./routes/user.routes');
const transactionRoutes = require('./routes/transaction.routes');
const splitRoutes       = require('./routes/split.routes');
const debtRoutes        = require('./routes/debt.routes');
const disputeRoutes     = require('./routes/dispute.routes');
const stripeRoutes      = require('./routes/stripe.routes');

// Middleware
const { errorHandler } = require('./middleware/error.middleware');
const { authenticate } = require('./middleware/auth.middleware');

const app = express();

// ─────────────────────────────────────────
// SECURITY MIDDLEWARE
// ─────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting — stricter on auth routes
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Only 10 login attempts per 15 min
  message: { error: 'Too many auth attempts, please try again later.' }
});

app.use(globalLimiter);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ─────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'Settlr API', version: '1.0.0' });
});

// ─────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────
app.use('/api/auth',         authLimiter, authRoutes);
app.use('/api/users',        authenticate, userRoutes);
app.use('/api/transactions', authenticate, transactionRoutes);
app.use('/api/splits',       authenticate, splitRoutes);
app.use('/api/debts',        authenticate, debtRoutes);
app.use('/api/disputes',     authenticate, disputeRoutes);
app.use('/api/stripe',       stripeRoutes);

// ─────────────────────────────────────────
// 404 HANDLER
// ─────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─────────────────────────────────────────
// GLOBAL ERROR HANDLER
// ─────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
