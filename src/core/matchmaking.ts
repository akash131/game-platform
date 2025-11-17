import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import { GameType, GameSettings, Player } from '../types/core.types';

/**
 * Matchmaking System
 * Intelligent player matching based on skill, latency, and preferences
 * Similar to matchmaking systems in League of Legends, Dota 2, Overwatch
 */
export class MatchmakingSystem extends EventEmitter {
  private queues: Map<string, MatchmakingQueue>;
  private lobbies: Map<string, Lobby>;
  private playerQueues: Map<string, string>; // playerId -> queueId
  private eloCalculator: EloCalculator;

  constructor() {
    super();
    this.queues = new Map();
    this.lobbies = new Map();
    this.playerQueues = new Map();
    this.eloCalculator = new EloCalculator();

    // Initialize default queues
    this.initializeQueues();
  }

  /**
   * Join matchmaking queue
   */
  joinQueue(
    player: Player,
    gameType: GameType,
    preferences: MatchmakingPreferences = {}
  ): MatchmakingTicket {
    // Check if player is already in queue
    if (this.playerQueues.has(player.id)) {
      throw new Error('Player is already in a queue');
    }

    const queueId = this.getQueueId(gameType, preferences.mode);
    let queue = this.queues.get(queueId);

    if (!queue) {
      queue = this.createQueue(queueId, gameType, preferences.mode);
    }

    const ticket: MatchmakingTicket = {
      id: uuidv4(),
      playerId: player.id,
      gameType,
      queueId,
      joinTime: Date.now(),
      preferences,
      skillRating: this.calculateSkillRating(player),
    };

    queue.tickets.push(ticket);
    this.playerQueues.set(player.id, queueId);

    console.log(`🎯 Player ${player.username} joined ${gameType} queue`);
    this.emit('player:joined:queue', { player, ticket });

    // Try to form a match immediately
    this.tryFormMatch(queueId);

    return ticket;
  }

  /**
   * Leave matchmaking queue
   */
  leaveQueue(playerId: string): void {
    const queueId = this.playerQueues.get(playerId);
    if (!queueId) return;

    const queue = this.queues.get(queueId);
    if (queue) {
      queue.tickets = queue.tickets.filter(t => t.playerId !== playerId);
    }

    this.playerQueues.delete(playerId);

    console.log(`🚪 Player left queue`);
    this.emit('player:left:queue', { playerId });
  }

  /**
   * Get queue status
   */
  getQueueStatus(queueId: string): QueueStatus | undefined {
    const queue = this.queues.get(queueId);
    if (!queue) return undefined;

    return {
      queueId,
      gameType: queue.gameType,
      mode: queue.mode,
      playersInQueue: queue.tickets.length,
      averageWaitTime: this.calculateAverageWaitTime(queue),
      estimatedMatchTime: this.estimateMatchTime(queue),
    };
  }

  /**
   * Get all queue statuses
   */
  getAllQueueStatuses(): QueueStatus[] {
    return Array.from(this.queues.values()).map(queue =>
      this.getQueueStatus(queue.id)!
    );
  }

  /**
   * Get lobby by ID
   */
  getLobby(lobbyId: string): Lobby | undefined {
    return this.lobbies.get(lobbyId);
  }

  /**
   * Accept match
   */
  acceptMatch(lobbyId: string, playerId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      throw new Error('Lobby not found');
    }

    if (!lobby.players.includes(playerId)) {
      throw new Error('Player not in lobby');
    }

    if (!lobby.acceptedPlayers.includes(playerId)) {
      lobby.acceptedPlayers.push(playerId);
    }

    console.log(`✅ Player accepted match (${lobby.acceptedPlayers.length}/${lobby.players.length})`);
    this.emit('match:accepted', { lobbyId, playerId });

    // Check if all players have accepted
    if (lobby.acceptedPlayers.length === lobby.players.length) {
      lobby.status = 'ready';
      this.emit('match:ready', lobby);
    }
  }

  /**
   * Decline match
   */
  declineMatch(lobbyId: string, playerId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    console.log(`❌ Player declined match`);
    this.emit('match:declined', { lobbyId, playerId });

    // Cancel the match and return players to queue
    this.cancelMatch(lobbyId);
  }

  /**
   * Cancel match
   */
  cancelMatch(lobbyId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    lobby.status = 'cancelled';
    this.lobbies.delete(lobbyId);

    console.log(`🚫 Match cancelled`);
    this.emit('match:cancelled', { lobbyId });

    // Return players to queue (except the one who declined)
    for (const playerId of lobby.players) {
      this.playerQueues.delete(playerId);
    }
  }

  /**
   * Try to form a match from queue
   */
  private tryFormMatch(queueId: string): void {
    const queue = this.queues.get(queueId);
    if (!queue) return;

    const requiredPlayers = this.getRequiredPlayers(queue.gameType, queue.mode);

    if (queue.tickets.length < requiredPlayers) return;

    // Sort tickets by skill rating for balanced teams
    const sortedTickets = queue.tickets.sort((a, b) => a.skillRating - b.skillRating);

    // Select players for match
    const selectedTickets = this.selectBalancedTeams(sortedTickets, requiredPlayers);

    if (selectedTickets.length === requiredPlayers) {
      this.createLobby(queue.gameType, queue.mode, selectedTickets);

      // Remove selected players from queue
      for (const ticket of selectedTickets) {
        queue.tickets = queue.tickets.filter(t => t.id !== ticket.id);
      }
    }
  }

  /**
   * Create a lobby for matched players
   */
  private createLobby(
    gameType: GameType,
    mode: string | undefined,
    tickets: MatchmakingTicket[]
  ): Lobby {
    const lobby: Lobby = {
      id: uuidv4(),
      gameType,
      mode,
      players: tickets.map(t => t.playerId),
      acceptedPlayers: [],
      status: 'waiting_for_acceptance',
      createdAt: Date.now(),
      expiresAt: Date.now() + 30000, // 30 seconds to accept
      settings: this.generateGameSettings(gameType, mode),
    };

    this.lobbies.set(lobby.id, lobby);

    console.log(`🎮 Match found! Lobby created: ${lobby.id}`);
    this.emit('match:found', lobby);

    // Auto-cancel if not all players accept within timeout
    setTimeout(() => {
      if (lobby.status === 'waiting_for_acceptance') {
        this.cancelMatch(lobby.id);
      }
    }, 30000);

    return lobby;
  }

  /**
   * Select balanced teams from available players
   */
  private selectBalancedTeams(
    tickets: MatchmakingTicket[],
    requiredPlayers: number
  ): MatchmakingTicket[] {
    if (tickets.length < requiredPlayers) return [];

    // For team games, balance by skill
    if (requiredPlayers > 2) {
      return this.balanceTeamsBySkill(tickets, requiredPlayers);
    }

    // For 1v1 or FFA, just take closest skill ratings
    return tickets.slice(0, requiredPlayers);
  }

  /**
   * Balance teams by skill rating
   */
  private balanceTeamsBySkill(
    tickets: MatchmakingTicket[],
    requiredPlayers: number
  ): MatchmakingTicket[] {
    const selected: MatchmakingTicket[] = [];
    const remaining = [...tickets];

    // Snake draft for balanced teams
    for (let i = 0; i < requiredPlayers && remaining.length > 0; i++) {
      const index = i % 2 === 0 ? 0 : remaining.length - 1;
      selected.push(remaining.splice(index, 1)[0]);
    }

    return selected;
  }

  /**
   * Calculate skill rating for player
   */
  private calculateSkillRating(player: Player): number {
    // Simple MMR calculation based on wins and level
    const winRate = player.stats.gamesPlayed > 0
      ? player.stats.wins / player.stats.gamesPlayed
      : 0.5;

    return 1000 + (player.level * 10) + (winRate * 500);
  }

  /**
   * Get required players for game type
   */
  private getRequiredPlayers(gameType: GameType, mode?: string): number {
    const requirements: Record<string, number> = {
      [GameType.FPS]: 10,
      [GameType.STRATEGY]: 2,
      [GameType.RACING]: 8,
      [GameType.RPG]: 4,
      [GameType.MOBA]: 10,
      [GameType.BATTLE_ROYALE]: 100,
    };

    return requirements[gameType] || 2;
  }

  /**
   * Generate game settings based on matchmaking
   */
  private generateGameSettings(gameType: GameType, mode?: string): GameSettings {
    return {
      maxPlayers: this.getRequiredPlayers(gameType, mode),
      difficulty: 'normal',
      mode: mode || 'default',
    };
  }

  /**
   * Calculate average wait time
   */
  private calculateAverageWaitTime(queue: MatchmakingQueue): number {
    if (queue.tickets.length === 0) return 0;

    const now = Date.now();
    const totalWaitTime = queue.tickets.reduce(
      (sum, ticket) => sum + (now - ticket.joinTime),
      0
    );

    return totalWaitTime / queue.tickets.length;
  }

  /**
   * Estimate match time
   */
  private estimateMatchTime(queue: MatchmakingQueue): number {
    const requiredPlayers = this.getRequiredPlayers(queue.gameType, queue.mode);
    const playersInQueue = queue.tickets.length;

    if (playersInQueue >= requiredPlayers) return 0;

    const averageJoinRate = 2; // players per second (estimate)
    const playersNeeded = requiredPlayers - playersInQueue;

    return (playersNeeded / averageJoinRate) * 1000;
  }

  /**
   * Get queue ID
   */
  private getQueueId(gameType: GameType, mode?: string): string {
    return mode ? `${gameType}-${mode}` : gameType;
  }

  /**
   * Create a new queue
   */
  private createQueue(
    queueId: string,
    gameType: GameType,
    mode?: string
  ): MatchmakingQueue {
    const queue: MatchmakingQueue = {
      id: queueId,
      gameType,
      mode,
      tickets: [],
    };

    this.queues.set(queueId, queue);
    return queue;
  }

  /**
   * Initialize default queues
   */
  private initializeQueues(): void {
    const queueConfigs = [
      { gameType: GameType.FPS, mode: 'deathmatch' },
      { gameType: GameType.FPS, mode: 'team-deathmatch' },
      { gameType: GameType.STRATEGY, mode: 'conquest' },
      { gameType: GameType.RACING, mode: 'circuit' },
      { gameType: GameType.RPG, mode: 'cooperative' },
      { gameType: GameType.MOBA, mode: '5v5' },
      { gameType: GameType.BATTLE_ROYALE, mode: 'solo' },
    ];

    for (const config of queueConfigs) {
      const queueId = this.getQueueId(config.gameType, config.mode);
      this.createQueue(queueId, config.gameType, config.mode);
    }

    console.log(`📋 Initialized ${queueConfigs.length} matchmaking queues`);
  }
}

/**
 * ELO Calculator for skill ratings
 */
class EloCalculator {
  private readonly K_FACTOR = 32;

  calculateNewRatings(
    winnerRating: number,
    loserRating: number
  ): { winner: number; loser: number } {
    const expectedWinner = this.getExpectedScore(winnerRating, loserRating);
    const expectedLoser = this.getExpectedScore(loserRating, winnerRating);

    return {
      winner: Math.round(winnerRating + this.K_FACTOR * (1 - expectedWinner)),
      loser: Math.round(loserRating + this.K_FACTOR * (0 - expectedLoser)),
    };
  }

  private getExpectedScore(ratingA: number, ratingB: number): number {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }
}

export interface MatchmakingTicket {
  id: string;
  playerId: string;
  gameType: GameType;
  queueId: string;
  joinTime: number;
  preferences: MatchmakingPreferences;
  skillRating: number;
}

export interface MatchmakingPreferences {
  mode?: string;
  region?: string;
  maxLatency?: number;
  skillRange?: number;
}

export interface MatchmakingQueue {
  id: string;
  gameType: GameType;
  mode?: string;
  tickets: MatchmakingTicket[];
}

export interface Lobby {
  id: string;
  gameType: GameType;
  mode?: string;
  players: string[];
  acceptedPlayers: string[];
  status: 'waiting_for_acceptance' | 'ready' | 'cancelled';
  createdAt: number;
  expiresAt: number;
  settings: GameSettings;
}

export interface QueueStatus {
  queueId: string;
  gameType: GameType;
  mode?: string;
  playersInQueue: number;
  averageWaitTime: number;
  estimatedMatchTime: number;
}
