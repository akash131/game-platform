import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import {
  GameSession,
  GameType,
  ProviderType,
  GameSettings,
  SessionStatus,
} from '../types/core.types';
import { BaseGameProvider } from '../providers/base.provider';

/**
 * Session Manager
 * Manages game sessions across multiple providers
 * Similar to AWS Session Manager or Azure Session Management
 */
export class SessionManager extends EventEmitter {
  private sessions: Map<string, GameSession>;
  private providers: Map<ProviderType, BaseGameProvider>;
  private activeSessions: Map<string, string>; // playerId -> sessionId

  constructor() {
    super();
    this.sessions = new Map();
    this.providers = new Map();
    this.activeSessions = new Map();
  }

  /**
   * Register a provider
   */
  registerProvider(provider: BaseGameProvider): void {
    const info = provider.getInfo();
    this.providers.set(info.type, provider);
    console.log(`📦 Provider registered: ${info.name}`);
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
    // Select provider
    const provider = providerType
      ? this.providers.get(providerType)
      : this.selectBestProvider(gameType);

    if (!provider) {
      throw new Error('No suitable provider found');
    }

    // Create session through provider
    const session = await provider.createSession(gameType, players, settings);

    // Store session
    this.sessions.set(session.id, session);

    // Track active sessions for players
    for (const playerId of players) {
      this.activeSessions.set(playerId, session.id);
    }

    console.log(`🎮 Session created: ${session.id} (${gameType} on ${provider.getInfo().name})`);
    this.emit('session:created', session);

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): GameSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get active session for a player
   */
  getPlayerSession(playerId: string): GameSession | undefined {
    const sessionId = this.activeSessions.get(playerId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const provider = this.providers.get(session.provider);
    if (provider) {
      await provider.endSession(sessionId);
    }

    session.status = SessionStatus.COMPLETED;
    session.endTime = new Date();

    // Remove from active sessions
    for (const playerId of session.players) {
      this.activeSessions.delete(playerId);
    }

    console.log(`🏁 Session ended: ${sessionId}`);
    this.emit('session:ended', session);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): GameSession[] {
    return Array.from(this.sessions.values()).filter(
      session => session.status === SessionStatus.ACTIVE
    );
  }

  /**
   * Get sessions by game type
   */
  getSessionsByType(gameType: GameType): GameSession[] {
    return Array.from(this.sessions.values()).filter(session => session.gameType === gameType);
  }

  /**
   * Get session metrics
   */
  async getSessionMetrics(sessionId: string): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const provider = this.providers.get(session.provider);
    if (provider) {
      return await provider.getMetrics(sessionId);
    }

    return null;
  }

  /**
   * Select the best provider for a game type
   */
  private selectBestProvider(gameType: GameType): BaseGameProvider | undefined {
    const suitableProviders = Array.from(this.providers.values()).filter(provider =>
      provider.supports(gameType)
    );

    if (suitableProviders.length === 0) {
      return undefined;
    }

    // For now, return the first suitable provider
    // In production, this would use load balancing, performance metrics, etc.
    return suitableProviders[0];
  }

  /**
   * Get platform statistics
   */
  getStatistics(): SessionStatistics {
    const activeSessions = this.getActiveSessions();

    return {
      totalSessions: this.sessions.size,
      activeSessions: activeSessions.length,
      completedSessions: Array.from(this.sessions.values()).filter(
        s => s.status === SessionStatus.COMPLETED
      ).length,
      totalPlayers: new Set(
        activeSessions.flatMap(session => session.players)
      ).size,
      sessionsByType: this.getSessionCountByType(),
    };
  }

  private getSessionCountByType(): Record<GameType, number> {
    const counts: any = {};

    for (const session of this.sessions.values()) {
      counts[session.gameType] = (counts[session.gameType] || 0) + 1;
    }

    return counts;
  }
}

export interface SessionStatistics {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  totalPlayers: number;
  sessionsByType: Record<GameType, number>;
}
