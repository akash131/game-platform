-- Game Platform Database Schema
-- PostgreSQL initialization script

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For text search

-- ==================== USERS & AUTHENTICATION ====================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned', 'deleted'))
);

CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    device_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== PLAYER PROFILES ====================

CREATE TABLE player_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(100),
    avatar_url VARCHAR(500),
    bio TEXT,
    level INTEGER DEFAULT 1,
    experience BIGINT DEFAULT 0,
    total_playtime INTEGER DEFAULT 0,  -- minutes
    country VARCHAR(3),
    language VARCHAR(5) DEFAULT 'en',
    privacy_settings JSONB DEFAULT '{}',
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE player_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES player_profiles(id) ON DELETE CASCADE,
    game_type VARCHAR(50) NOT NULL,
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    score BIGINT DEFAULT 0,
    best_score BIGINT DEFAULT 0,
    win_streak INTEGER DEFAULT 0,
    longest_win_streak INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, game_type)
);

-- ==================== MATCHMAKING & SKILL RATING ====================

CREATE TABLE skill_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES player_profiles(id) ON DELETE CASCADE,
    game_type VARCHAR(50) NOT NULL,
    rating_system VARCHAR(20) DEFAULT 'elo' CHECK (rating_system IN ('elo', 'glicko2', 'trueskill')),
    rating INTEGER DEFAULT 1500,
    deviation DECIMAL(10, 2),  -- Glicko-2
    volatility DECIMAL(10, 4),  -- Glicko-2
    mu DECIMAL(10, 2),  -- TrueSkill
    sigma DECIMAL(10, 2),  -- TrueSkill
    rank VARCHAR(20),
    tier INTEGER,
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    last_played TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, game_type)
);

CREATE TABLE matchmaking_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES player_profiles(id) ON DELETE CASCADE,
    game_type VARCHAR(50) NOT NULL,
    region VARCHAR(10),
    preferences JSONB DEFAULT '{}',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued', 'matched', 'cancelled'))
);

CREATE INDEX idx_matchmaking_queue_game_type ON matchmaking_queue(game_type) WHERE status = 'queued';
CREATE INDEX idx_matchmaking_queue_region ON matchmaking_queue(region) WHERE status = 'queued';

-- ==================== GAME SESSIONS ====================

CREATE TABLE game_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'completed', 'cancelled')),
    max_players INTEGER NOT NULL,
    current_players INTEGER DEFAULT 0,
    settings JSONB DEFAULT '{}',
    server_id VARCHAR(100),
    region VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    duration INTEGER,  -- seconds
    winner_team VARCHAR(50),
    metadata JSONB DEFAULT '{}'
);

CREATE TABLE session_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
    player_id UUID REFERENCES player_profiles(id) ON DELETE CASCADE,
    team VARCHAR(50),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP,
    final_stats JSONB DEFAULT '{}',
    won BOOLEAN
);

CREATE INDEX idx_session_players_session ON session_players(session_id);
CREATE INDEX idx_session_players_player ON session_players(player_id);

-- ==================== PAYMENTS & COMMERCE ====================

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    total_spent DECIMAL(12, 2) DEFAULT 0,
    tier VARCHAR(20) DEFAULT 'free' CHECK (tier IN ('free', 'bronze', 'silver', 'gold', 'platinum')),
    wallet_balance JSONB DEFAULT '{}',  -- {currency: amount}
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payment_intents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    method VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
    transaction_id VARCHAR(255),
    receipt_url VARCHAR(500),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE TABLE purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    payment_intent_id UUID REFERENCES payment_intents(id),
    subtotal DECIMAL(12, 2) NOT NULL,
    tax DECIMAL(12, 2) DEFAULT 0,
    total DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    items JSONB NOT NULL,  -- Array of purchase items
    refunded_amount DECIMAL(12, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_id UUID REFERENCES purchases(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    reason VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pending',
    notes TEXT,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

-- ==================== SUBSCRIPTIONS ====================

CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    tier VARCHAR(20) NOT NULL,
    description TEXT,
    features JSONB NOT NULL,  -- Array of feature strings
    pricing JSONB NOT NULL,  -- Array of pricing options
    trial_days INTEGER DEFAULT 0,
    max_devices INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES subscription_plans(id),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'trial', 'past_due', 'cancelled', 'expired', 'paused')),
    interval VARCHAR(20) NOT NULL CHECK (interval IN ('monthly', 'quarterly', 'yearly', 'lifetime')),
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    current_period_start TIMESTAMP NOT NULL,
    current_period_end TIMESTAMP NOT NULL,
    trial_end TIMESTAMP,
    cancel_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    auto_renew BOOLEAN DEFAULT TRUE,
    payment_method VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== LICENSES & DRM ====================

CREATE TABLE product_keys (
    key VARCHAR(29) PRIMARY KEY,  -- XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
    game_id VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL,
    batch_id VARCHAR(100) NOT NULL,
    is_redeemed BOOLEAN DEFAULT FALSE,
    redeemed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    redeemed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

CREATE TABLE licenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(29) REFERENCES product_keys(key),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    game_id VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked', 'expired')),
    max_activations INTEGER DEFAULT 5,
    restrictions JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    last_validated TIMESTAMP
);

CREATE TABLE license_activations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    license_id UUID REFERENCES licenses(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    hardware_hash VARCHAR(64) NOT NULL,
    ip_address INET,
    is_active BOOLEAN DEFAULT TRUE,
    activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== DEVELOPER PORTAL ====================

CREATE TABLE developers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    tier VARCHAR(20) DEFAULT 'individual' CHECK (tier IN ('individual', 'indie', 'studio', 'enterprise')),
    verified BOOLEAN DEFAULT FALSE,
    tax_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP
);

CREATE TABLE applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_id UUID REFERENCES developers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'rejected', 'published', 'suspended')),
    platforms TEXT[] DEFAULT '{}',
    age_rating VARCHAR(10),
    tags TEXT[] DEFAULT '{}',
    pricing JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_id UUID REFERENCES developers(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key VARCHAR(100) UNIQUE NOT NULL,
    secret VARCHAR(100) NOT NULL,
    scopes TEXT[] NOT NULL,
    app_ids UUID[] DEFAULT '{}',
    rate_limit INTEGER DEFAULT 1000,
    is_active BOOLEAN DEFAULT TRUE,
    usage_count BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP,
    expires_at TIMESTAMP
);

-- ==================== CROSS-PROGRESSION ====================

CREATE TABLE platform_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    game_id VARCHAR(100) NOT NULL,
    platform VARCHAR(20) NOT NULL,
    platform_user_id VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_played_at TIMESTAMP,
    playtime INTEGER DEFAULT 0,  -- hours
    UNIQUE(user_id, game_id, platform)
);

CREATE TABLE progression_backups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    game_id VARCHAR(100) NOT NULL,
    platform VARCHAR(20) NOT NULL,
    data JSONB NOT NULL,
    size INTEGER NOT NULL,  -- bytes
    checksum VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== ANALYTICS ====================

CREATE TABLE analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    game_id VARCHAR(100),
    event_type VARCHAR(50) NOT NULL,
    event_name VARCHAR(100) NOT NULL,
    properties JSONB DEFAULT '{}',
    session_id VARCHAR(100),
    platform VARCHAR(20),
    country VARCHAR(3),
    device_type VARCHAR(50),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_analytics_events_user ON analytics_events(user_id);
CREATE INDEX idx_analytics_events_game ON analytics_events(game_id);
CREATE INDEX idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_timestamp ON analytics_events(timestamp);

CREATE TABLE cohorts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    user_count INTEGER DEFAULT 0,
    user_ids UUID[] DEFAULT '{}',
    metrics JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== SOCIAL ====================

CREATE TABLE friendships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    friend_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,
    UNIQUE(user_id, friend_id),
    CHECK (user_id != friend_id)
);

CREATE TABLE parties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    leader_id UUID REFERENCES users(id) ON DELETE CASCADE,
    max_size INTEGER DEFAULT 4,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE party_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    party_id UUID REFERENCES parties(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(party_id, user_id)
);

-- ==================== ACHIEVEMENTS ====================

CREATE TABLE achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    rarity VARCHAR(20) DEFAULT 'common',
    points INTEGER DEFAULT 0,
    icon_url VARCHAR(500),
    requirements JSONB DEFAULT '{}',
    rewards JSONB DEFAULT '{}',
    is_hidden BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, name)
);

CREATE TABLE player_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES player_profiles(id) ON DELETE CASCADE,
    achievement_id UUID REFERENCES achievements(id) ON DELETE CASCADE,
    progress INTEGER DEFAULT 0,
    max_progress INTEGER NOT NULL,
    unlocked BOOLEAN DEFAULT FALSE,
    unlocked_at TIMESTAMP,
    UNIQUE(player_id, achievement_id)
);

-- ==================== LEADERBOARDS ====================

CREATE TABLE leaderboard_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES player_profiles(id) ON DELETE CASCADE,
    game_type VARCHAR(50) NOT NULL,
    score BIGINT NOT NULL,
    rank INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_leaderboard_game_type ON leaderboard_entries(game_type, score DESC);
CREATE INDEX idx_leaderboard_player ON leaderboard_entries(player_id);

-- ==================== MODERATION ====================

CREATE TABLE moderation_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    moderator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('warn', 'mute', 'tempban', 'permaban', 'content_remove')),
    reason TEXT NOT NULL,
    duration INTEGER,  -- minutes for temporary actions
    evidence JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reported_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reason VARCHAR(50) NOT NULL,
    description TEXT,
    evidence JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- ==================== FUNCTIONS & TRIGGERS ====================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_player_profiles_updated_at BEFORE UPDATE ON player_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_player_stats_updated_at BEFORE UPDATE ON player_stats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_skill_ratings_updated_at BEFORE UPDATE ON skill_ratings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== INDEXES FOR PERFORMANCE ====================

-- User lookups
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(token);

-- Player lookups
CREATE INDEX idx_player_profiles_user ON player_profiles(user_id);
CREATE INDEX idx_player_stats_player ON player_stats(player_id);
CREATE INDEX idx_skill_ratings_player ON skill_ratings(player_id);

-- Payment lookups
CREATE INDEX idx_payment_intents_customer ON payment_intents(customer_id);
CREATE INDEX idx_purchases_customer ON purchases(customer_id);
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);

-- Developer lookups
CREATE INDEX idx_developers_user ON developers(user_id);
CREATE INDEX idx_applications_developer ON applications(developer_id);
CREATE INDEX idx_api_keys_developer ON api_keys(developer_id);

-- ==================== SAMPLE DATA ====================

-- Insert sample subscription plans
INSERT INTO subscription_plans (name, tier, description, features, pricing, trial_days, max_devices) VALUES
('Basic Plan', 'basic', 'Essential gaming features',
 '["Cloud saves", "Online multiplayer", "1 free game/month"]'::jsonb,
 '[{"interval": "monthly", "price": 9.99, "currency": "USD"}, {"interval": "yearly", "price": 99.99, "currency": "USD"}]'::jsonb,
 7, 2),
('Premium Plan', 'premium', 'Premium gaming experience',
 '["Everything in Basic", "5 free games/month", "20% store discount", "Early access"]'::jsonb,
 '[{"interval": "monthly", "price": 19.99, "currency": "USD"}, {"interval": "yearly", "price": 199.99, "currency": "USD"}]'::jsonb,
 30, 5);

-- Create indices for full-text search
CREATE INDEX idx_applications_name_trgm ON applications USING gin (name gin_trgm_ops);
CREATE INDEX idx_users_username_trgm ON users USING gin (username gin_trgm_ops);
