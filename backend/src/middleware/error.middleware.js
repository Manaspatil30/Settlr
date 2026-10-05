const errorHandler = (err, req, res, next) => {
  console.error('❌ Error:', err.message);

  // If this error came from an external API call (axios), always return 500.
  // Never forward upstream 401/403 to the client — it would wipe the user's JWT.
  if (err.response) {
    return res.status(500).json({ error: 'An external service request failed' });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = { errorHandler };
