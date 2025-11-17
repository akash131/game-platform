import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import { Player, PlayerStats, InventoryItem, Achievement } from '../types/core.types';

/**
 * Player Manager
 * Manages player accounts, stats, and progression
 */
export class PlayerManager extends EventEmitter {
  private players: Map<string, Player>;
  private usernameIndex: Map<string, string>; // username -> playerId

  constructor() {
    super();
    this.players = new Map();
    this.usernameIndex = new Map();
  }

  /**
   * Create a new player
   */
  createPlayer(username: string): Player {
    // Check if username already exists
    if (this.usernameIndex.has(username)) {
      throw new Error(`Username ${username} already exists`);
    }

    const player: Player = {
      id: uuidv4(),
      username,
      level: 1,
      experience: 0,
      stats: {
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        totalPlayTime: 0,
        averageScore: 0,
      },
      inventory: [],
      achievements: [],
    };

    this.players.set(player.id, player);
    this.usernameIndex.set(username, player.id);

    console.log(`👤 Player created: ${username} (${player.id})`);
    this.emit('player:created', player);

    return player;
  }

  /**
   * Get player by ID
   */
  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  /**
   * Get player by username
   */
  getPlayerByUsername(username: string): Player | undefined {
    const playerId = this.usernameIndex.get(username);
    return playerId ? this.players.get(playerId) : undefined;
  }

  /**
   * Update player stats
   */
  updateStats(playerId: string, stats: Partial<PlayerStats>): void {
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error(`Player ${playerId} not found`);
    }

    player.stats = { ...player.stats, ...stats };
    this.emit('player:stats:updated', player);
  }

  /**
   * Award experience to player
   */
  awardExperience(playerId: string, amount: number): void {
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error(`Player ${playerId} not found`);
    }

    player.experience += amount;

    // Check for level up
    const experienceForNextLevel = player.level * 100;
    if (player.experience >= experienceForNextLevel) {
      player.level++;
      player.experience -= experienceForNextLevel;

      console.log(`🎉 ${player.username} leveled up to ${player.level}!`);
      this.emit('player:level:up', { playerId, newLevel: player.level });

      // Check for level-based achievements
      this.checkLevelAchievements(player);
    }
  }

  /**
   * Add item to player inventory
   */
  addItem(playerId: string, item: InventoryItem): void {
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error(`Player ${playerId} not found`);
    }

    player.inventory.push(item);
    this.emit('player:item:added', { playerId, item });
  }

  /**
   * Remove item from player inventory
   */
  removeItem(playerId: string, itemId: string): void {
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error(`Player ${playerId} not found`);
    }

    player.inventory = player.inventory.filter(item => item.id !== itemId);
    this.emit('player:item:removed', { playerId, itemId });
  }

  /**
   * Award achievement to player
   */
  awardAchievement(playerId: string, achievement: Achievement): void {
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error(`Player ${playerId} not found`);
    }

    // Check if already has achievement
    if (player.achievements.some(a => a.id === achievement.id)) {
      return;
    }

    player.achievements.push(achievement);

    console.log(`🏆 ${player.username} unlocked: ${achievement.name}`);
    this.emit('player:achievement:unlocked', { playerId, achievement });
  }

  /**
   * Get top players by level
   */
  getTopPlayers(limit: number = 10): Player[] {
    return Array.from(this.players.values())
      .sort((a, b) => {
        if (b.level !== a.level) {
          return b.level - a.level;
        }
        return b.experience - a.experience;
      })
      .slice(0, limit);
  }

  /**
   * Get player count
   */
  getPlayerCount(): number {
    return this.players.size;
  }

  /**
   * Record game result for player
   */
  recordGameResult(playerId: string, won: boolean, score: number): void {
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error(`Player ${playerId} not found`);
    }

    player.stats.gamesPlayed++;
    if (won) {
      player.stats.wins++;
    } else {
      player.stats.losses++;
    }

    // Update average score
    player.stats.averageScore =
      (player.stats.averageScore * (player.stats.gamesPlayed - 1) + score) /
      player.stats.gamesPlayed;

    // Award experience based on performance
    const experienceGained = won ? score + 50 : Math.floor(score / 2);
    this.awardExperience(playerId, experienceGained);

    // Check for achievements
    this.checkGameAchievements(player);
  }

  /**
   * Check and award level-based achievements
   */
  private checkLevelAchievements(player: Player): void {
    const achievements = [
      { level: 5, id: 'level_5', name: 'Novice Adventurer', rarity: 'common' },
      { level: 10, id: 'level_10', name: 'Seasoned Warrior', rarity: 'uncommon' },
      { level: 25, id: 'level_25', name: 'Elite Champion', rarity: 'rare' },
      { level: 50, id: 'level_50', name: 'Legendary Hero', rarity: 'epic' },
      { level: 100, id: 'level_100', name: 'Mythical Legend', rarity: 'legendary' },
    ];

    for (const ach of achievements) {
      if (player.level === ach.level) {
        this.awardAchievement(player.id, {
          id: ach.id,
          name: ach.name,
          description: `Reached level ${ach.level}`,
          unlockedAt: new Date(),
          rarity: ach.rarity,
        });
      }
    }
  }

  /**
   * Check and award game-based achievements
   */
  private checkGameAchievements(player: Player): void {
    const achievements = [
      {
        condition: () => player.stats.wins === 1,
        id: 'first_win',
        name: 'First Victory',
        description: 'Win your first game',
        rarity: 'common',
      },
      {
        condition: () => player.stats.wins === 10,
        id: 'ten_wins',
        name: 'Winning Streak',
        description: 'Win 10 games',
        rarity: 'uncommon',
      },
      {
        condition: () => player.stats.wins === 100,
        id: 'hundred_wins',
        name: 'Century Club',
        description: 'Win 100 games',
        rarity: 'rare',
      },
      {
        condition: () => player.stats.gamesPlayed === 100,
        id: 'dedicated',
        name: 'Dedicated Player',
        description: 'Play 100 games',
        rarity: 'uncommon',
      },
    ];

    for (const ach of achievements) {
      if (ach.condition()) {
        this.awardAchievement(player.id, {
          id: ach.id,
          name: ach.name,
          description: ach.description,
          unlockedAt: new Date(),
          rarity: ach.rarity,
        });
      }
    }
  }
}
