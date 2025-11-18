import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

/**
 * Achievement and Progression System
 * Similar to Steam Achievements, Xbox Live, PlayStation Trophies
 */

export interface Achievement {
  achievementId: string;
  name: string;
  description: string;
  icon: string;
  iconGray?: string; // Locked icon
  hidden: boolean;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  points: number;
  requirements: AchievementRequirement[];
  rewards?: AchievementReward[];
  category?: string;
  progressive?: {
    current: number;
    target: number;
  };
}

export interface AchievementRequirement {
  type: 'stat' | 'event' | 'item' | 'level' | 'time' | 'multi';
  stat?: string;
  value?: number;
  operator?: 'equals' | 'greaterThan' | 'lessThan' | 'greaterOrEqual' | 'lessOrEqual';
  eventName?: string;
  eventCount?: number;
  itemId?: string;
  children?: AchievementRequirement[]; // For multi requirements
  logic?: 'and' | 'or';
}

export interface AchievementReward {
  type: 'currency' | 'item' | 'xp' | 'title' | 'badge';
  amount?: number;
  itemId?: string;
  currencyType?: string;
}

export interface PlayerAchievement {
  playerId: string;
  achievementId: string;
  unlocked: boolean;
  progress: number; // 0-100
  unlockedAt?: Date;
  notified: boolean;
}

export interface PlayerLevel {
  level: number;
  currentXP: number;
  xpToNextLevel: number;
  totalXP: number;
  prestige?: number;
}

export interface PlayerStats {
  playerId: string;
  stats: Map<string, number>;
  lastUpdated: Date;
}

export interface Leaderboard {
  leaderboardId: string;
  name: string;
  stat: string;
  resetPeriod?: 'daily' | 'weekly' | 'monthly' | 'never';
  lastReset?: Date;
  entries: LeaderboardEntry[];
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  playerName: string;
  value: number;
  timestamp: Date;
}

export interface SeasonPass {
  seasonId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  freeTiers: SeasonTier[];
  premiumTiers: SeasonTier[];
  active: boolean;
}

export interface SeasonTier {
  tier: number;
  xpRequired: number;
  rewards: AchievementReward[];
}

export interface PlayerSeasonProgress {
  playerId: string;
  seasonId: string;
  tier: number;
  xp: number;
  isPremium: boolean;
  claimedTiers: Set<number>;
}

export interface AchievementEvents {
  'achievementUnlocked': (playerId: string, achievement: Achievement) => void;
  'achievementProgress': (playerId: string, achievementId: string, progress: number) => void;
  'levelUp': (playerId: string, newLevel: number) => void;
  'prestigeUp': (playerId: string, newPrestige: number) => void;
  'leaderboardUpdate': (leaderboardId: string) => void;
  'seasonTierUnlocked': (playerId: string, seasonId: string, tier: number) => void;
}

export class AchievementSystem extends EventEmitter<AchievementEvents> {
  private achievements: Map<string, Achievement> = new Map();
  private playerAchievements: Map<string, Map<string, PlayerAchievement>> = new Map(); // playerId -> achievementId -> progress
  private playerStats: Map<string, PlayerStats> = new Map();
  private playerLevels: Map<string, PlayerLevel> = new Map();
  private leaderboards: Map<string, Leaderboard> = new Map();
  private seasonPasses: Map<string, SeasonPass> = new Map();
  private playerSeasonProgress: Map<string, Map<string, PlayerSeasonProgress>> = new Map();

  // XP curve configuration
  private xpCurve = {
    baseXP: 100,
    multiplier: 1.5,
    maxLevel: 100,
  };

  constructor() {
    super();
  }

  // ==================== Achievements ====================

  /**
   * Register achievement
   */
  registerAchievement(achievement: Omit<Achievement, 'achievementId'>): Achievement {
    const fullAchievement: Achievement = {
      achievementId: uuidv4(),
      ...achievement,
    };

    this.achievements.set(fullAchievement.achievementId, fullAchievement);
    return fullAchievement;
  }

  /**
   * Get player achievements
   */
  getPlayerAchievements(playerId: string, includeHidden: boolean = false): PlayerAchievement[] {
    const playerAchievements = this.playerAchievements.get(playerId);
    if (!playerAchievements) {
      return [];
    }

    const result: PlayerAchievement[] = [];

    for (const [achievementId, progress] of playerAchievements) {
      const achievement = this.achievements.get(achievementId);
      if (!achievement) continue;

      if (!includeHidden && achievement.hidden && !progress.unlocked) {
        continue;
      }

      result.push(progress);
    }

    return result;
  }

  /**
   * Check achievement progress
   */
  checkAchievements(playerId: string): void {
    const stats = this.playerStats.get(playerId);
    if (!stats) return;

    for (const achievement of this.achievements.values()) {
      this.checkAchievement(playerId, achievement, stats);
    }
  }

  /**
   * Check single achievement
   */
  private checkAchievement(playerId: string, achievement: Achievement, stats: PlayerStats): void {
    // Get or create player achievement progress
    if (!this.playerAchievements.has(playerId)) {
      this.playerAchievements.set(playerId, new Map());
    }

    const playerAchievements = this.playerAchievements.get(playerId)!;

    let progress = playerAchievements.get(achievement.achievementId);
    if (!progress) {
      progress = {
        playerId,
        achievementId: achievement.achievementId,
        unlocked: false,
        progress: 0,
        notified: false,
      };
      playerAchievements.set(achievement.achievementId, progress);
    }

    if (progress.unlocked) {
      return; // Already unlocked
    }

    // Check requirements
    const meetsRequirements = this.checkRequirements(achievement.requirements, stats);

    if (meetsRequirements) {
      progress.unlocked = true;
      progress.progress = 100;
      progress.unlockedAt = new Date();

      this.emit('achievementUnlocked', playerId, achievement);

      // Grant rewards
      if (achievement.rewards) {
        this.grantRewards(playerId, achievement.rewards);
      }
    } else {
      // Update progress for progressive achievements
      if (achievement.progressive) {
        const newProgress = this.calculateProgress(achievement, stats);
        if (newProgress !== progress.progress) {
          progress.progress = newProgress;
          this.emit('achievementProgress', playerId, achievement.achievementId, newProgress);
        }
      }
    }
  }

  /**
   * Check if requirements are met
   */
  private checkRequirements(
    requirements: AchievementRequirement[],
    stats: PlayerStats
  ): boolean {
    for (const req of requirements) {
      switch (req.type) {
        case 'stat':
          if (!this.checkStatRequirement(req, stats)) return false;
          break;

        case 'multi':
          if (req.children) {
            const childResults = req.children.map(child =>
              this.checkRequirements([child], stats)
            );

            if (req.logic === 'and' && !childResults.every(r => r)) return false;
            if (req.logic === 'or' && !childResults.some(r => r)) return false;
          }
          break;

        // Add more requirement types as needed
      }
    }

    return true;
  }

  /**
   * Check stat requirement
   */
  private checkStatRequirement(req: AchievementRequirement, stats: PlayerStats): boolean {
    if (!req.stat || req.value === undefined) return false;

    const statValue = stats.stats.get(req.stat) || 0;
    const operator = req.operator || 'greaterOrEqual';

    switch (operator) {
      case 'equals':
        return statValue === req.value;
      case 'greaterThan':
        return statValue > req.value;
      case 'lessThan':
        return statValue < req.value;
      case 'greaterOrEqual':
        return statValue >= req.value;
      case 'lessOrEqual':
        return statValue <= req.value;
      default:
        return false;
    }
  }

  /**
   * Calculate progressive achievement progress
   */
  private calculateProgress(achievement: Achievement, stats: PlayerStats): number {
    if (!achievement.progressive) return 0;

    const req = achievement.requirements[0];
    if (req.type !== 'stat' || !req.stat) return 0;

    const current = stats.stats.get(req.stat) || 0;
    const target = achievement.progressive.target;

    return Math.min(100, (current / target) * 100);
  }

  // ==================== Player Stats ====================

  /**
   * Update player stat
   */
  updatePlayerStat(playerId: string, stat: string, value: number): void {
    let stats = this.playerStats.get(playerId);

    if (!stats) {
      stats = {
        playerId,
        stats: new Map(),
        lastUpdated: new Date(),
      };
      this.playerStats.set(playerId, stats);
    }

    stats.stats.set(stat, value);
    stats.lastUpdated = new Date();

    // Check achievements
    this.checkAchievements(playerId);

    // Update leaderboards
    this.updateLeaderboards(playerId, stat, value);
  }

  /**
   * Increment player stat
   */
  incrementPlayerStat(playerId: string, stat: string, increment: number = 1): void {
    const current = this.getPlayerStat(playerId, stat);
    this.updatePlayerStat(playerId, stat, current + increment);
  }

  /**
   * Get player stat
   */
  getPlayerStat(playerId: string, stat: string): number {
    const stats = this.playerStats.get(playerId);
    return stats?.stats.get(stat) || 0;
  }

  // ==================== Leveling & XP ====================

  /**
   * Award XP to player
   */
  awardXP(playerId: string, amount: number): void {
    let playerLevel = this.playerLevels.get(playerId);

    if (!playerLevel) {
      playerLevel = {
        level: 1,
        currentXP: 0,
        xpToNextLevel: this.calculateXPForLevel(2),
        totalXP: 0,
        prestige: 0,
      };
      this.playerLevels.set(playerId, playerLevel);
    }

    playerLevel.currentXP += amount;
    playerLevel.totalXP += amount;

    // Check for level up
    while (playerLevel.currentXP >= playerLevel.xpToNextLevel) {
      if (playerLevel.level >= this.xpCurve.maxLevel) {
        // Max level - prestige?
        break;
      }

      playerLevel.currentXP -= playerLevel.xpToNextLevel;
      playerLevel.level++;
      playerLevel.xpToNextLevel = this.calculateXPForLevel(playerLevel.level + 1);

      this.emit('levelUp', playerId, playerLevel.level);

      // Grant level rewards
      this.grantLevelRewards(playerId, playerLevel.level);
    }

    // Update season progress
    this.updateSeasonProgress(playerId, amount);
  }

  /**
   * Calculate XP required for level
   */
  private calculateXPForLevel(level: number): number {
    return Math.floor(
      this.xpCurve.baseXP * Math.pow(this.xpCurve.multiplier, level - 1)
    );
  }

  /**
   * Prestige player
   */
  prestigePlayer(playerId: string): void {
    const playerLevel = this.playerLevels.get(playerId);
    if (!playerLevel || playerLevel.level < this.xpCurve.maxLevel) {
      throw new Error('Player must be max level to prestige');
    }

    playerLevel.prestige = (playerLevel.prestige || 0) + 1;
    playerLevel.level = 1;
    playerLevel.currentXP = 0;
    playerLevel.xpToNextLevel = this.calculateXPForLevel(2);

    this.emit('prestigeUp', playerId, playerLevel.prestige);

    // Grant prestige rewards
    this.grantPrestigeRewards(playerId, playerLevel.prestige);
  }

  // ==================== Leaderboards ====================

  /**
   * Create leaderboard
   */
  createLeaderboard(
    name: string,
    stat: string,
    resetPeriod?: Leaderboard['resetPeriod']
  ): Leaderboard {
    const leaderboard: Leaderboard = {
      leaderboardId: uuidv4(),
      name,
      stat,
      resetPeriod,
      entries: [],
    };

    this.leaderboards.set(leaderboard.leaderboardId, leaderboard);
    return leaderboard;
  }

  /**
   * Update leaderboards
   */
  private updateLeaderboards(playerId: string, stat: string, value: number): void {
    for (const leaderboard of this.leaderboards.values()) {
      if (leaderboard.stat === stat) {
        this.updateLeaderboardEntry(leaderboard, playerId, value);
      }
    }
  }

  /**
   * Update leaderboard entry
   */
  private updateLeaderboardEntry(leaderboard: Leaderboard, playerId: string, value: number): void {
    // Find existing entry
    const existingIndex = leaderboard.entries.findIndex(e => e.playerId === playerId);

    if (existingIndex >= 0) {
      leaderboard.entries[existingIndex].value = value;
      leaderboard.entries[existingIndex].timestamp = new Date();
    } else {
      leaderboard.entries.push({
        rank: 0,
        playerId,
        playerName: `Player ${playerId.substring(0, 8)}`, // Would get from player service
        value,
        timestamp: new Date(),
      });
    }

    // Sort by value (descending)
    leaderboard.entries.sort((a, b) => b.value - a.value);

    // Update ranks
    leaderboard.entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    // Keep only top 100
    if (leaderboard.entries.length > 100) {
      leaderboard.entries = leaderboard.entries.slice(0, 100);
    }

    this.emit('leaderboardUpdate', leaderboard.leaderboardId);
  }

  /**
   * Get leaderboard
   */
  getLeaderboard(leaderboardId: string, limit: number = 100): LeaderboardEntry[] {
    const leaderboard = this.leaderboards.get(leaderboardId);
    if (!leaderboard) return [];

    return leaderboard.entries.slice(0, limit);
  }

  /**
   * Get player rank
   */
  getPlayerRank(leaderboardId: string, playerId: string): number | null {
    const leaderboard = this.leaderboards.get(leaderboardId);
    if (!leaderboard) return null;

    const entry = leaderboard.entries.find(e => e.playerId === playerId);
    return entry?.rank || null;
  }

  // ==================== Season Pass ====================

  /**
   * Create season pass
   */
  createSeasonPass(season: Omit<SeasonPass, 'seasonId'>): SeasonPass {
    const fullSeason: SeasonPass = {
      seasonId: uuidv4(),
      ...season,
    };

    this.seasonPasses.set(fullSeason.seasonId, fullSeason);
    return fullSeason;
  }

  /**
   * Get active season
   */
  getActiveSeason(): SeasonPass | null {
    const now = new Date();

    for (const season of this.seasonPasses.values()) {
      if (season.active && season.startDate <= now && season.endDate >= now) {
        return season;
      }
    }

    return null;
  }

  /**
   * Update season progress
   */
  private updateSeasonProgress(playerId: string, xp: number): void {
    const activeSeason = this.getActiveSeason();
    if (!activeSeason) return;

    if (!this.playerSeasonProgress.has(playerId)) {
      this.playerSeasonProgress.set(playerId, new Map());
    }

    const playerSeasons = this.playerSeasonProgress.get(playerId)!;

    let progress = playerSeasons.get(activeSeason.seasonId);
    if (!progress) {
      progress = {
        playerId,
        seasonId: activeSeason.seasonId,
        tier: 0,
        xp: 0,
        isPremium: false,
        claimedTiers: new Set(),
      };
      playerSeasons.set(activeSeason.seasonId, progress);
    }

    progress.xp += xp;

    // Check for tier ups
    const tiers = progress.isPremium ? activeSeason.premiumTiers : activeSeason.freeTiers;

    for (let i = progress.tier; i < tiers.length; i++) {
      const tier = tiers[i];
      if (progress.xp >= tier.xpRequired) {
        progress.tier = tier.tier;
        this.emit('seasonTierUnlocked', playerId, activeSeason.seasonId, tier.tier);
      } else {
        break;
      }
    }
  }

  /**
   * Claim season tier reward
   */
  claimSeasonTierReward(playerId: string, seasonId: string, tier: number): void {
    const season = this.seasonPasses.get(seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    const progress = this.playerSeasonProgress.get(playerId)?.get(seasonId);
    if (!progress) {
      throw new Error('Player not in season');
    }

    if (tier > progress.tier) {
      throw new Error('Tier not unlocked');
    }

    if (progress.claimedTiers.has(tier)) {
      throw new Error('Reward already claimed');
    }

    const tiers = progress.isPremium ? season.premiumTiers : season.freeTiers;
    const tierData = tiers.find(t => t.tier === tier);

    if (tierData) {
      this.grantRewards(playerId, tierData.rewards);
      progress.claimedTiers.add(tier);
    }
  }

  // ==================== Rewards ====================

  /**
   * Grant rewards
   */
  private grantRewards(playerId: string, rewards: AchievementReward[]): void {
    for (const reward of rewards) {
      switch (reward.type) {
        case 'xp':
          if (reward.amount) {
            this.awardXP(playerId, reward.amount);
          }
          break;

        case 'currency':
        case 'item':
        case 'title':
        case 'badge':
          // Would integrate with economy/inventory system
          console.log(`Granted ${reward.type} to player ${playerId}`);
          break;
      }
    }
  }

  /**
   * Grant level rewards
   */
  private grantLevelRewards(playerId: string, level: number): void {
    // Could grant currency, items, etc. based on level
    const xpReward = level * 10;
    console.log(`Player ${playerId} reached level ${level}, granted ${xpReward} bonus XP`);
  }

  /**
   * Grant prestige rewards
   */
  private grantPrestigeRewards(playerId: string, prestige: number): void {
    console.log(`Player ${playerId} reached prestige ${prestige}`);
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalAchievements: number;
    totalPlayers: number;
    averageAchievementCompletion: number;
    averageLevel: number;
    leaderboards: number;
    activeSeasons: number;
  } {
    let totalUnlocked = 0;
    let totalPossible = 0;
    let totalLevel = 0;

    for (const playerAchievements of this.playerAchievements.values()) {
      totalUnlocked += Array.from(playerAchievements.values()).filter(a => a.unlocked).length;
      totalPossible += this.achievements.size;
    }

    for (const level of this.playerLevels.values()) {
      totalLevel += level.level;
    }

    const averageAchievementCompletion = totalPossible > 0
      ? (totalUnlocked / totalPossible) * 100
      : 0;

    const averageLevel = this.playerLevels.size > 0
      ? totalLevel / this.playerLevels.size
      : 0;

    const activeSeasons = Array.from(this.seasonPasses.values())
      .filter(s => s.active).length;

    return {
      totalAchievements: this.achievements.size,
      totalPlayers: this.playerStats.size,
      averageAchievementCompletion,
      averageLevel,
      leaderboards: this.leaderboards.size,
      activeSeasons,
    };
  }
}
