-- AI Stock Research Institute - Database initialization
-- This runs automatically on first PostgreSQL container start.

-- Enable useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

-- Create schemas for logical separation
CREATE SCHEMA IF NOT EXISTS market_data;
CREATE SCHEMA IF NOT EXISTS analysis;
CREATE SCHEMA IF NOT EXISTS agents;

-- Grant permissions
GRANT ALL ON SCHEMA market_data TO ai_institute;
GRANT ALL ON SCHEMA analysis TO ai_institute;
GRANT ALL ON SCHEMA agents TO ai_institute;

-- Ensure default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA market_data GRANT ALL ON TABLES TO ai_institute;
ALTER DEFAULT PRIVILEGES IN SCHEMA analysis GRANT ALL ON TABLES TO ai_institute;
ALTER DEFAULT PRIVILEGES IN SCHEMA agents GRANT ALL ON TABLES TO ai_institute;
