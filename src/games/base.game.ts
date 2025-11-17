import { EventEmitter } from 'eventemitter3';
import { GameType, GameSettings, GameState, GameEvent, Player } from '../types/core.types';

/**
 * Base Game Class - Abstract class for all game implementations
 */
export abstract class BaseGame extends EventEmitter {
  protected gameType: GameType;
  protected name: string;
  protected description: string;
  protected settings: GameSettings;
  protected state: GameState;
  protected players: Map<string, Player>;

  constructor(gameType: GameType, name: string, description: string) {
    super();
    this.gameType = gameType;
    this.name = name;
    this.description = description;
    this.players = new Map();
    this.state = {
      currentPhase: 'waiting',
      score: {},
      events: [],
      metadata: {},
    };
    this.settings = {
      maxPlayers: 2,
      difficulty: 'normal',
      mode: 'default',
    };
  }

  /**
   * Initialize the game
   */
  abstract initialize(settings: GameSettings): Promise<void>;

  /**
   * Start the game
   */
  abstract start(): Promise<void>;

  /**
   * Process player action
   */
  abstract processAction(playerId: string, action: PlayerAction): Promise<void>;

  /**
   * Update game logic (game tick)
   */
  abstract update(deltaTime: number): void;

  /**
   * End the game
   */
  abstract end(): Promise<GameResult>;

  /**
   * Add a player to the game
   */
  addPlayer(player: Player): void {
    this.players.set(player.id, player);
    this.state.score[player.id] = 0;
    this.emit('player:joined', player);
  }

  /**
   * Remove a player from the game
   */
  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    delete this.state.score[playerId];
    this.emit('player:left', { playerId });
  }

  /**
   * Add game event
   */
  protected addEvent(type: string, playerId: string | undefined, data: Record<string, any>): void {
    const event: GameEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: new Date(),
      playerId,
      data,
    };

    this.state.events.push(event);
    this.emit('game:event', event);
  }

  /**
   * Get game info
   */
  getInfo(): GameInfo {
    return {
      type: this.gameType,
      name: this.name,
      description: this.description,
      currentPlayers: this.players.size,
      maxPlayers: this.settings.maxPlayers,
      phase: this.state.currentPhase,
    };
  }

  /**
   * Get current state
   */
  getState(): GameState {
    return { ...this.state };
  }
}

export interface PlayerAction {
  type: string;
  data: Record<string, any>;
  timestamp: Date;
}

export interface GameResult {
  winner?: string;
  finalScores: Record<string, number>;
  statistics: Record<string, any>;
  duration: number;
}

export interface GameInfo {
  type: GameType;
  name: string;
  description: string;
  currentPlayers: number;
  maxPlayers: number;
  phase: string;
}
