/**
 * Game Platform - Enterprise-grade game platform
 *
 * Main exports for the game platform library
 */

// Core Platform
export { GamePlatform } from './core/game-platform';
export { SessionManager } from './core/session-manager';
export { PlayerManager } from './core/player-manager';
export { AnalyticsSystem } from './core/analytics';
export { MatchmakingSystem } from './core/matchmaking';

// Providers
export { BaseGameProvider } from './providers/base.provider';
export { NvidiaGeForceProvider } from './providers/nvidia.provider';
export { UnityCloudProvider } from './providers/unity.provider';
export { UnrealCloudProvider } from './providers/unreal.provider';

// Games
export { BaseGame } from './games/base.game';
export { FPSGame } from './games/fps.game';
export { StrategyGame } from './games/strategy.game';
export { RacingGame } from './games/racing.game';
export { RPGGame } from './games/rpg.game';
export { BattleRoyaleGame } from './games/battle-royale.game';
export { MOBAGame } from './games/moba.game';

// Social Systems
export { PartySystem } from './social/party-system';
export { FriendSystem } from './social/friend-system';
export { ChatSystem } from './social/chat-system';
export { GuildSystem } from './social/guild-system';

// Economy
export { EconomySystem } from './economy/economy-system';
export { TradingSystem } from './economy/trading-system';

// Tournaments
export { TournamentSystem } from './tournaments/tournament-system';

// API Server
export { GamePlatformAPI } from './api/server';

// GameLift / AWS Gaming Services
export { FleetManager } from './gamelift/fleet-manager';
export { FlexMatch } from './gamelift/flexmatch';
export { GameServerSDK, ServerSDK, getServerSDK } from './gamelift/game-server-sdk';
export { SessionPlacementService } from './gamelift/session-placement';
export { AutoScalingService } from './gamelift/auto-scaling';
export { MonitoringService, GameLiftAlarms, MetricUnit } from './gamelift/monitoring';

// LiveOps (PlayFab-style)
export { LiveOpsService } from './liveops/liveops-service';

// Anti-Cheat
export { AntiCheatService, CheatType } from './anticheat/anticheat-service';

// Progression & Achievements
export { AchievementSystem } from './progression/achievement-system';

// Communication
export { VoiceChatService } from './communication/voice-chat';

// Storage
export { CloudSaveService } from './storage/cloud-save';

// Replay & Spectator
export { ReplaySystem } from './replay/replay-system';

// Cloud Streaming (GeForce Now-style)
export { CloudStreamingService } from './streaming/cloud-streaming';

// UGC / Workshop (Steam Workshop-style)
export { WorkshopService } from './ugc/workshop';

// Identity & Authentication
export { IdentityService } from './identity/identity-service';

// CDN (Content Delivery Network)
export { CDNService } from './cdn/cdn-service';

// Analytics & Business Intelligence
export { AnalyticsDashboard } from './analytics/analytics-dashboard';

// Commerce & Store
export { StorePlatform } from './commerce/store-platform';

// Diagnostics & Error Tracking
export { CrashReportingService } from './diagnostics/crash-reporting';

// Notifications
export { NotificationService } from './notifications/notification-service';

// Telemetry & Performance Monitoring
export { TelemetryService } from './telemetry/telemetry-service';

// Types
export * from './types/core.types';

// Re-export for convenience
export { GamePlatform as default } from './core/game-platform';
