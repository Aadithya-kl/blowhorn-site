-- Secondary index on rate_limits (window) for efficient range cleanup by the scheduled worker.
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window);
