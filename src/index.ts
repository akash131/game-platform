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

// Types
export * from './types/core.types';

// Re-export for convenience
export { GamePlatform as default } from './core/game-platform';
