import { EventEmitter } from 'eventemitter3';
import { SessionManager } from './session-manager';
import { PlayerManager } from './player-manager';
import { AnalyticsSystem } from './analytics';
import { BaseGameProvider } from '../providers/base.provider';
import { NvidiaGeForceProvider } from '../providers/nvidia.provider';
import { UnityCloudProvider } from '../providers/unity.provider';
import { UnrealCloudProvider } from '../providers/unreal.provider';
import {
  GameType,
  GameSettings,
  GameSession,
  Player,
  ProviderType,
} from '../types/core.types';

/**
 * Main Game Platform Class
 * Enterprise-grade game platform inspired by cloud providers (AWS, Azure, Google Cloud)
 * and top game companies (Nvidia, Epic Games, Unity)
 */
export class GamePlatform extends EventEmitter {
  private sessionManager: SessionManager;
  private playerManager: PlayerManager;
  private analytics: AnalyticsSystem;
  private initialized: boolean;

  constructor() {
    super();
    this.sessionManager = new SessionManager();
    this.playerManager = new PlayerManager();
    this.analytics = new AnalyticsSystem();
    this.initialized = false;

    this.setupEventForwarding();
  }

  /**
   * Initialize the platform with default providers
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('⚠️  Platform already initialized');
      return;
    }

    console.log('🚀 Initializing Game Platform...');

    // Initialize and register providers
    const providers: BaseGameProvider[] = [
      new NvidiaGeForceProvider(),
      new UnityCloudProvider(),
      new UnrealCloudProvider(),
    ];

    for (const provider of providers) {
      await provider.initialize();
      this.sessionManager.registerProvider(provider);
    }

    this.initialized = true;
    console.log('✅ Game Platform initialized successfully!');
    console.log(`📦 ${providers.length} providers registered`);

    this.emit('platform:initialized');
  }

  /**
   * Create a new player account
   */
  createPlayer(username: string): Player {
    return this.playerManager.createPlayer(username);
  }

  /**
   * Get player by ID
   */
  getPlayer(playerId: string): Player | undefined {
    return this.playerManager.getPlayer(playerId);
  }

  /**
   * Get player by username
   */
  getPlayerByUsername(username: string): Player | undefined {
    return this.playerManager.getPlayerByUsername(username);
  }

  /**
   * Create a new game session
   */
  async createSession(
    gameType: GameType,
    players: string[],
    settings: GameSettings,
    providerType?: ProviderType
  ): Promise<GameSession> {
    if (!this.initialized) {
      throw new Error('Platform not initialized. Call initialize() first.');
    }

    return await this.sessionManager.createSession(gameType, players, settings, providerType);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): GameSession | undefined {
    return this.sessionManager.getSession(sessionId);
  }

  /**
   * End a game session
   */
  async endSession(sessionId: string): Promise<void> {
    await this.sessionManager.endSession(sessionId);

    // Record game results for all players
    const session = this.sessionManager.getSession(sessionId);
    if (session) {
      for (const playerId of session.players) {
        const score = session.state.score[playerId] || 0;
        const winner = this.determineWinner(session);
        const won = winner === playerId;

        this.playerManager.recordGameResult(playerId, won, score);

        // Update leaderboard
        const player = this.playerManager.getPlayer(playerId);
        if (player) {
          this.analytics.updateLeaderboard(
            session.gameType,
            playerId,
            player.username,
            score,
            { sessionId: session.id }
          );
        }
      }
    }
  }

  /**
   * Get leaderboard for a game type
   */
  getLeaderboard(gameType: GameType, limit?: number): any[] {
    return this.analytics.getLeaderboard(gameType, limit);
  }

  /**
   * Get global leaderboard
   */
  getGlobalLeaderboard(limit?: number): any[] {
    return this.analytics.getGlobalLeaderboard(limit);
  }

  /**
   * Get player rank in a game type
   */
  getPlayerRank(gameType: GameType, playerId: string): any {
    return this.analytics.getPlayerRank(gameType, playerId);
  }

  /**
   * Get top players
   */
  getTopPlayers(limit?: number): Player[] {
    return this.playerManager.getTopPlayers(limit);
  }

  /**
   * Get platform statistics
   */
  getStatistics(): PlatformStatistics {
    const sessionStats = this.sessionManager.getStatistics();

    return {
      players: {
        total: this.playerManager.getPlayerCount(),
        topPlayers: this.playerManager.getTopPlayers(5),
      },
      sessions: sessionStats,
      analytics: this.analytics.generateReport(),
    };
  }

  /**
   * Get session metrics
   */
  async getSessionMetrics(sessionId: string): Promise<any> {
    return await this.sessionManager.getSessionMetrics(sessionId);
  }

  /**
   * Track analytics event
   */
  trackEvent(sessionId: string, playerId: string, eventType: string, data: any): void {
    this.analytics.trackEvent(sessionId, playerId, {
      type: eventType,
      timestamp: new Date(),
      data,
    });
  }

  /**
   * Generate analytics report
   */
  generateAnalyticsReport(sessionId?: string): any {
    return this.analytics.generateReport(sessionId);
  }

  /**
   * Shutdown the platform
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Game Platform...');

    // End all active sessions
    const activeSessions = this.sessionManager.getActiveSessions();
    for (const session of activeSessions) {
      await this.sessionManager.endSession(session.id);
    }

    this.initialized = false;
    console.log('✅ Platform shutdown complete');

    this.emit('platform:shutdown');
  }

  /**
   * Determine the winner of a session
   */
  private determineWinner(session: GameSession): string | undefined {
    const scores = Object.entries(session.state.score);
    if (scores.length === 0) return undefined;

    scores.sort((a, b) => b[1] - a[1]);
    return scores[0][0];
  }

  /**
   * Setup event forwarding from managers
   */
  private setupEventForwarding(): void {
    // Forward session events
    this.sessionManager.on('session:created', session => {
      this.emit('session:created', session);
    });

    this.sessionManager.on('session:ended', session => {
      this.emit('session:ended', session);
    });

    // Forward player events
    this.playerManager.on('player:created', player => {
      this.emit('player:created', player);
    });

    this.playerManager.on('player:level:up', data => {
      this.emit('player:level:up', data);
    });

    this.playerManager.on('player:achievement:unlocked', data => {
      this.emit('player:achievement:unlocked', data);
    });

    // Forward analytics events
    this.analytics.on('leaderboard:updated', data => {
      this.emit('leaderboard:updated', data);
    });
  }
}

export interface PlatformStatistics {
  players: {
    total: number;
    topPlayers: Player[];
  };
  sessions: any;
  analytics: any;
}
