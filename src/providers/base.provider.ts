import { EventEmitter } from 'eventemitter3';
import { GameSession, GameType, ProviderType, GameSettings, GameState } from '../types/core.types';

/**
 * Base Game Provider - Abstract class for all game engine providers
 * Similar to cloud provider SDKs (AWS SDK, Azure SDK, Google Cloud SDK)
 */
export abstract class BaseGameProvider extends EventEmitter {
  protected type: ProviderType;
  protected name: string;
  protected capabilities: ProviderCapabilities;
  protected sessions: Map<string, GameSession>;

  constructor(type: ProviderType, name: string, capabilities: ProviderCapabilities) {
    super();
    this.type = type;
    this.name = name;
    this.capabilities = capabilities;
    this.sessions = new Map();
  }

  /**
   * Initialize the provider
   */
  abstract initialize(): Promise<void>;

  /**
   * Create a new game session
   */
  abstract createSession(
    gameType: GameType,
    players: string[],
    settings: GameSettings
  ): Promise<GameSession>;

  /**
   * Update game state
   */
  abstract updateGameState(sessionId: string, state: Partial<GameState>): Promise<void>;

  /**
   * End a game session
   */
  abstract endSession(sessionId: string): Promise<void>;

  /**
   * Get session by ID
   */
  getSession(sessionId: string): GameSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get provider info
   */
  getInfo(): ProviderInfo {
    return {
      type: this.type,
      name: this.name,
      capabilities: this.capabilities,
    };
  }

  /**
   * Check if provider supports a game type
   */
  supports(gameType: GameType): boolean {
    return this.capabilities.supportedGameTypes.includes(gameType);
  }

  /**
   * Get performance metrics
   */
  abstract getMetrics(sessionId: string): Promise<ProviderMetrics>;
}

export interface ProviderCapabilities {
  supportedGameTypes: GameType[];
  maxPlayers: number;
  supportsRayTracing: boolean;
  supports4K: boolean;
  supportsVR: boolean;
  cloudRendering: boolean;
  edgeComputing: boolean;
}

export interface ProviderInfo {
  type: ProviderType;
  name: string;
  capabilities: ProviderCapabilities;
}

export interface ProviderMetrics {
  avgFPS: number;
  avgLatency: number;
  uptime: number;
  activeSessions: number;
  totalBandwidth: number;
}
