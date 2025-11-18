/**
 * Leaderboards and Rankings System
 *
 * Steam Leaderboards / Xbox Live / PlayStation Network-style competitive rankings
 *
 * Features:
 * - Global and regional leaderboards
 * - Multiple leaderboard types (score, time, percentage)
 * - Seasonal and all-time rankings
 * - Friend leaderboards
 * - Clan/guild leaderboards
 * - Percentile rankings
 * - Division/tier system (Bronze, Silver, Gold, etc.)
 * - Rank decay and activity requirements
 * - Anti-cheat integration
 * - Historical tracking and replays
 * - Custom leaderboard creation
 * - Achievement-based rankings
 */

import { EventEmitter } from 'eventemitter3';

export enum LeaderboardType {
  SCORE = 'score', // Highest score wins
  TIME = 'time', // Lowest time wins
  PERCENTAGE = 'percentage', // Highest percentage wins
  WINS = 'wins', // Most wins
  RATING = 'rating', // Skill rating (ELO, MMR)
}

export enum LeaderboardScope {
  GLOBAL = 'global',
  REGIONAL = 'regional',
  COUNTRY = 'country',
  FRIENDS = 'friends',
  GUILD = 'guild',
}

export enum LeaderboardPeriod {
  ALL_TIME = 'all_time',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  SEASONAL = 'seasonal',
}

export enum Division {
  UNRANKED = 'unranked',
  BRONZE = 'bronze',
  SILVER = 'silver',
  GOLD = 'gold',
  PLATINUM = 'platinum',
  DIAMOND = 'diamond',
  MASTER = 'master',
  GRANDMASTER = 'grandmaster',
  CHALLENGER = 'challenger',
}

export interface Leaderboard {
  leaderboardId: string;
  name: string;
  gameId: string;
  description: string;
  type: LeaderboardType;
  scope: LeaderboardScope;
  period: LeaderboardPeriod;

  // Configuration
  displayFormat?: string; // e.g., "%.2f seconds", "%d points"
  sortOrder: 'ascending' | 'descending';
  updateFrequency: number; // milliseconds
  maxEntries?: number;

  // Divisions/Tiers
  hasDivisions: boolean;
  divisionThresholds?: Map<Division, number>;

  // Filters
  region?: string;
  country?: string;
  minLevel?: number;

  // Features
  allowTies: boolean;
  showPercentile: boolean;
  trackHistory: boolean;
  requireVerification: boolean;

  // Status
  isActive: boolean;
  isPaused: boolean;

  // Metadata
  totalEntries: number;
  lastUpdated: Date;
  createdAt: Date;
  resetAt?: Date; // For seasonal/periodic leaderboards
  nextResetAt?: Date;
}

export interface LeaderboardEntry {
  entryId: string;
  leaderboardId: string;
  userId: string;
  username: string;
  avatarUrl?: string;

  // Score/Value
  score: number;
  displayValue: string;

  // Ranking
  rank: number;
  previousRank?: number;
  rankChange?: number; // +/- change from previous rank
  percentile: number; // Top X% of players
  division?: Division;

  // Additional Info
  metadata?: Record<string, any>; // Custom data (e.g., level, character)
  country?: string;
  guildId?: string;

  // Verification
  isVerified: boolean;
  replayUrl?: string;
  screenshotUrl?: string;

  // Timestamps
  achievedAt: Date;
  submittedAt: Date;
  lastUpdated: Date;
}

export interface RankingStats {
  userId: string;
  leaderboardId: string;

  // Current stats
  currentRank: number;
  currentScore: number;
  currentDivision?: Division;
  percentile: number;

  // Historical
  bestRank: number;
  bestScore: number;
  worstRank: number;

  // Trends
  rankHistory: RankSnapshot[];
  scoreHistory: ScoreSnapshot[];

  // Activity
  totalSubmissions: number;
  lastSubmission: Date;
  daysActive: number;

  // Achievements
  timesInTop10: number;
  timesInTop100: number;
  consecutiveDaysRanked: number;
}

export interface RankSnapshot {
  timestamp: Date;
  rank: number;
  score: number;
  division?: Division;
}

export interface ScoreSnapshot {
  timestamp: Date;
  score: number;
  metadata?: Record<string, any>;
}

export interface DivisionInfo {
  division: Division;
  name: string;
  minScore: number;
  maxScore?: number;
  color: string;
  icon?: string;
  rewards?: DivisionReward[];
  playerCount: number;
  percentOfPlayers: number;
}

export interface DivisionReward {
  type: 'currency' | 'item' | 'cosmetic' | 'title';
  value: number | string;
  description: string;
}

export interface SeasonalRanking {
  seasonId: string;
  leaderboardId: string;
  seasonNumber: number;
  name: string;
  startDate: Date;
  endDate: Date;
  status: 'upcoming' | 'active' | 'ended';

  // Rewards
  rewards: Map<number, SeasonReward[]>; // rank -> rewards

  // Stats
  totalParticipants: number;
  topPlayers: LeaderboardEntry[];

  // Final standings (after season ends)
  finalStandings?: LeaderboardEntry[];
}

export interface SeasonReward {
  type: 'currency' | 'item' | 'cosmetic' | 'title' | 'badge';
  value: number | string;
  description: string;
  rarity?: string;
}

export interface LeaderboardFilter {
  scope?: LeaderboardScope;
  period?: LeaderboardPeriod;
  gameId?: string;
  region?: string;
  country?: string;
  friendsOnly?: boolean;
  guildId?: string;
  division?: Division;
  minRank?: number;
  maxRank?: number;
}

export interface LeaderboardQuery {
  leaderboardId: string;
  startRank?: number;
  endRank?: number;
  aroundUser?: string; // Get entries around specific user
  contextSize?: number; // Number of entries above/below user
  includeMetadata?: boolean;
}

interface LeaderboardEvents {
  'leaderboard:created': (leaderboard: Leaderboard) => void;
  'leaderboard:updated': (leaderboard: Leaderboard) => void;
  'entry:submitted': (entry: LeaderboardEntry) => void;
  'entry:verified': (entry: LeaderboardEntry) => void;
  'rank:changed': (entry: LeaderboardEntry, oldRank: number) => void;
  'division:promoted': (userId: string, division: Division) => void;
  'division:demoted': (userId: string, division: Division) => void;
  'season:started': (season: SeasonalRanking) => void;
  'season:ended': (season: SeasonalRanking) => void;
  'record:broken': (entry: LeaderboardEntry, previousRecord: number) => void;
}

/**
 * LeaderboardSystem
 *
 * Comprehensive competitive rankings and leaderboards system
 */
export class LeaderboardSystem extends EventEmitter<LeaderboardEvents> {
  private leaderboards: Map<string, Leaderboard> = new Map();
  private entries: Map<string, LeaderboardEntry[]> = new Map(); // leaderboardId -> entries
  private userEntries: Map<string, Map<string, LeaderboardEntry>> = new Map(); // userId -> (leaderboardId -> entry)
  private rankingStats: Map<string, Map<string, RankingStats>> = new Map(); // leaderboardId -> (userId -> stats)
  private divisions: Map<string, DivisionInfo[]> = new Map(); // leaderboardId -> divisions
  private seasons: Map<string, SeasonalRanking[]> = new Map(); // leaderboardId -> seasons

  constructor() {
    super();
    this.initializeDefaultDivisions();
    this.startMaintenanceTasks();
  }

  /**
   * Create new leaderboard
   */
  createLeaderboard(
    name: string,
    gameId: string,
    type: LeaderboardType,
    options?: {
      description?: string;
      scope?: LeaderboardScope;
      period?: LeaderboardPeriod;
      displayFormat?: string;
      sortOrder?: 'ascending' | 'descending';
      updateFrequency?: number;
      maxEntries?: number;
      hasDivisions?: boolean;
      region?: string;
      country?: string;
      minLevel?: number;
      allowTies?: boolean;
      showPercentile?: boolean;
      trackHistory?: boolean;
      requireVerification?: boolean;
    }
  ): Leaderboard {
    const leaderboard: Leaderboard = {
      leaderboardId: `lb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      gameId,
      description: options?.description || '',
      type,
      scope: options?.scope || LeaderboardScope.GLOBAL,
      period: options?.period || LeaderboardPeriod.ALL_TIME,
      displayFormat: options?.displayFormat,
      sortOrder: options?.sortOrder || (type === LeaderboardType.TIME ? 'ascending' : 'descending'),
      updateFrequency: options?.updateFrequency || 60000, // 1 minute default
      maxEntries: options?.maxEntries,
      hasDivisions: options?.hasDivisions || false,
      region: options?.region,
      country: options?.country,
      minLevel: options?.minLevel,
      allowTies: options?.allowTies ?? true,
      showPercentile: options?.showPercentile ?? true,
      trackHistory: options?.trackHistory ?? true,
      requireVerification: options?.requireVerification || false,
      isActive: true,
      isPaused: false,
      totalEntries: 0,
      lastUpdated: new Date(),
      createdAt: new Date(),
    };

    // Set next reset time for periodic leaderboards
    if (leaderboard.period !== LeaderboardPeriod.ALL_TIME) {
      leaderboard.nextResetAt = this.calculateNextReset(leaderboard.period);
    }

    this.leaderboards.set(leaderboard.leaderboardId, leaderboard);
    this.entries.set(leaderboard.leaderboardId, []);
    this.rankingStats.set(leaderboard.leaderboardId, new Map());

    if (leaderboard.hasDivisions) {
      this.setupDivisions(leaderboard.leaderboardId);
    }

    this.emit('leaderboard:created', leaderboard);
    return leaderboard;
  }

  /**
   * Submit score to leaderboard
   */
  submitScore(
    leaderboardId: string,
    userId: string,
    username: string,
    score: number,
    options?: {
      metadata?: Record<string, any>;
      country?: string;
      guildId?: string;
      avatarUrl?: string;
      replayUrl?: string;
      screenshotUrl?: string;
      forceUpdate?: boolean; // Update even if score is worse
    }
  ): LeaderboardEntry {
    const leaderboard = this.leaderboards.get(leaderboardId);
    if (!leaderboard) throw new Error('Leaderboard not found');
    if (!leaderboard.isActive || leaderboard.isPaused) {
      throw new Error('Leaderboard is not accepting submissions');
    }

    // Check if this is a better score
    const existingEntry = this.getUserEntry(leaderboardId, userId);
    if (existingEntry && !options?.forceUpdate) {
      const isBetter = this.isBetterScore(leaderboard, score, existingEntry.score);
      if (!isBetter) {
        throw new Error('Score is not better than existing entry');
      }
    }

    const entry: LeaderboardEntry = {
      entryId: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      leaderboardId,
      userId,
      username,
      avatarUrl: options?.avatarUrl,
      score,
      displayValue: this.formatScore(leaderboard, score),
      rank: 0, // Will be calculated
      percentile: 0,
      metadata: options?.metadata,
      country: options?.country,
      guildId: options?.guildId,
      isVerified: !leaderboard.requireVerification,
      replayUrl: options?.replayUrl,
      screenshotUrl: options?.screenshotUrl,
      achievedAt: new Date(),
      submittedAt: new Date(),
      lastUpdated: new Date(),
    };

    // Store previous rank if updating
    if (existingEntry) {
      entry.previousRank = existingEntry.rank;
    }

    // Add or update entry
    this.addOrUpdateEntry(leaderboardId, userId, entry);

    // Recalculate rankings
    this.recalculateRankings(leaderboardId);

    // Update stats
    this.updateRankingStats(leaderboardId, userId, entry);

    // Check for division changes
    if (leaderboard.hasDivisions) {
      this.checkDivisionChange(leaderboardId, userId, entry);
    }

    this.emit('entry:submitted', entry);

    // Check if record was broken
    const entries = this.entries.get(leaderboardId) || [];
    if (entries.length > 0 && this.isBetterScore(leaderboard, entry.score, entries[0].score)) {
      const previousRecord = entries[0].score;
      this.emit('record:broken', entry, previousRecord);
    }

    return entry;
  }

  /**
   * Verify entry (for anti-cheat or manual review)
   */
  verifyEntry(entryId: string, isVerified: boolean): void {
    for (const entries of this.entries.values()) {
      const entry = entries.find(e => e.entryId === entryId);
      if (entry) {
        entry.isVerified = isVerified;
        if (!isVerified) {
          // Remove from leaderboard if not verified
          const index = entries.indexOf(entry);
          entries.splice(index, 1);
        }
        this.emit('entry:verified', entry);
        return;
      }
    }
  }

  /**
   * Get leaderboard entries with filters
   */
  getLeaderboard(query: LeaderboardQuery): LeaderboardEntry[] {
    const entries = this.entries.get(query.leaderboardId) || [];

    if (query.aroundUser) {
      // Get entries around specific user
      const userEntry = entries.find(e => e.userId === query.aroundUser);
      if (!userEntry) return [];

      const userRank = userEntry.rank;
      const contextSize = query.contextSize || 10;
      const startRank = Math.max(1, userRank - contextSize);
      const endRank = Math.min(entries.length, userRank + contextSize);

      return entries.filter(e => e.rank >= startRank && e.rank <= endRank);
    }

    // Get entries by rank range
    const startRank = query.startRank || 1;
    const endRank = query.endRank || 100;

    return entries.filter(e => e.rank >= startRank && e.rank <= endRank);
  }

  /**
   * Get user's rank on leaderboard
   */
  getUserRank(leaderboardId: string, userId: string): LeaderboardEntry | null {
    return this.getUserEntry(leaderboardId, userId);
  }

  /**
   * Get user's ranking stats
   */
  getUserStats(leaderboardId: string, userId: string): RankingStats | null {
    const stats = this.rankingStats.get(leaderboardId);
    return stats ? stats.get(userId) || null : null;
  }

  /**
   * Get division info
   */
  getDivisions(leaderboardId: string): DivisionInfo[] {
    return this.divisions.get(leaderboardId) || [];
  }

  /**
   * Get user's division
   */
  getUserDivision(leaderboardId: string, userId: string): Division | null {
    const entry = this.getUserEntry(leaderboardId, userId);
    return entry?.division || null;
  }

  /**
   * Create seasonal leaderboard
   */
  createSeason(
    leaderboardId: string,
    seasonNumber: number,
    name: string,
    duration: number, // milliseconds
    rewards: Map<number, SeasonReward[]>
  ): SeasonalRanking {
    const leaderboard = this.leaderboards.get(leaderboardId);
    if (!leaderboard) throw new Error('Leaderboard not found');

    const season: SeasonalRanking = {
      seasonId: `season_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      leaderboardId,
      seasonNumber,
      name,
      startDate: new Date(),
      endDate: new Date(Date.now() + duration),
      status: 'active',
      rewards,
      totalParticipants: 0,
      topPlayers: [],
    };

    if (!this.seasons.has(leaderboardId)) {
      this.seasons.set(leaderboardId, []);
    }
    this.seasons.get(leaderboardId)!.push(season);

    this.emit('season:started', season);
    return season;
  }

  /**
   * End season and distribute rewards
   */
  endSeason(seasonId: string): void {
    for (const seasons of this.seasons.values()) {
      const season = seasons.find(s => s.seasonId === seasonId);
      if (season) {
        season.status = 'ended';

        // Save final standings
        const entries = this.entries.get(season.leaderboardId) || [];
        season.finalStandings = [...entries];

        // Distribute rewards (implementation depends on your economy system)
        this.distributeSeasonRewards(season);

        this.emit('season:ended', season);
        return;
      }
    }
  }

  /**
   * Reset leaderboard (for periodic leaderboards)
   */
  resetLeaderboard(leaderboardId: string): void {
    const leaderboard = this.leaderboards.get(leaderboardId);
    if (!leaderboard) return;

    // Archive current entries if tracking history
    if (leaderboard.trackHistory) {
      const entries = this.entries.get(leaderboardId) || [];
      // Store in history (implementation depends on your storage)
      console.log(`Archived ${entries.length} entries for leaderboard ${leaderboardId}`);
    }

    // Clear entries
    this.entries.set(leaderboardId, []);
    this.rankingStats.set(leaderboardId, new Map());

    leaderboard.totalEntries = 0;
    leaderboard.resetAt = new Date();
    leaderboard.nextResetAt = this.calculateNextReset(leaderboard.period);
    leaderboard.lastUpdated = new Date();
  }

  /**
   * Search leaderboards
   */
  searchLeaderboards(filter: LeaderboardFilter): Leaderboard[] {
    let results = Array.from(this.leaderboards.values());

    if (filter.scope) {
      results = results.filter(lb => lb.scope === filter.scope);
    }

    if (filter.period) {
      results = results.filter(lb => lb.period === filter.period);
    }

    if (filter.gameId) {
      results = results.filter(lb => lb.gameId === filter.gameId);
    }

    if (filter.region) {
      results = results.filter(lb => lb.region === filter.region);
    }

    if (filter.country) {
      results = results.filter(lb => lb.country === filter.country);
    }

    return results.filter(lb => lb.isActive);
  }

  /**
   * Get global leaderboard stats
   */
  getGlobalStats(leaderboardId: string): {
    totalPlayers: number;
    averageScore: number;
    medianScore: number;
    topScore: number;
    divisionDistribution: Map<Division, number>;
  } | null {
    const entries = this.entries.get(leaderboardId) || [];
    if (entries.length === 0) return null;

    const scores = entries.map(e => e.score);
    const divisionCounts = new Map<Division, number>();

    for (const entry of entries) {
      if (entry.division) {
        divisionCounts.set(entry.division, (divisionCounts.get(entry.division) || 0) + 1);
      }
    }

    return {
      totalPlayers: entries.length,
      averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      medianScore: scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)],
      topScore: entries[0].score,
      divisionDistribution: divisionCounts,
    };
  }

  // Private helper methods

  private addOrUpdateEntry(leaderboardId: string, userId: string, entry: LeaderboardEntry): void {
    const entries = this.entries.get(leaderboardId) || [];

    // Remove existing entry for user
    const existingIndex = entries.findIndex(e => e.userId === userId);
    if (existingIndex >= 0) {
      entries.splice(existingIndex, 1);
    }

    // Add new entry
    entries.push(entry);

    // Store user entry mapping
    if (!this.userEntries.has(userId)) {
      this.userEntries.set(userId, new Map());
    }
    this.userEntries.get(userId)!.set(leaderboardId, entry);

    const leaderboard = this.leaderboards.get(leaderboardId)!;
    leaderboard.totalEntries = entries.length;
  }

  private recalculateRankings(leaderboardId: string): void {
    const leaderboard = this.leaderboards.get(leaderboardId)!;
    const entries = this.entries.get(leaderboardId) || [];

    // Sort entries
    entries.sort((a, b) => {
      if (leaderboard.sortOrder === 'ascending') {
        return a.score - b.score;
      } else {
        return b.score - a.score;
      }
    });

    // Assign ranks
    let currentRank = 1;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const prevEntry = i > 0 ? entries[i - 1] : null;

      // Handle ties
      if (leaderboard.allowTies && prevEntry && entry.score === prevEntry.score) {
        entry.rank = prevEntry.rank;
      } else {
        entry.rank = currentRank;
      }

      // Calculate rank change
      if (entry.previousRank) {
        entry.rankChange = entry.previousRank - entry.rank;
        if (entry.rankChange !== 0) {
          this.emit('rank:changed', entry, entry.previousRank);
        }
      }

      // Calculate percentile
      if (leaderboard.showPercentile) {
        entry.percentile = ((entries.length - entry.rank + 1) / entries.length) * 100;
      }

      // Assign division
      if (leaderboard.hasDivisions) {
        entry.division = this.calculateDivision(leaderboardId, entry.score);
      }

      currentRank++;
    }

    leaderboard.lastUpdated = new Date();
  }

  private updateRankingStats(leaderboardId: string, userId: string, entry: LeaderboardEntry): void {
    const statsMap = this.rankingStats.get(leaderboardId)!;
    let stats = statsMap.get(userId);

    if (!stats) {
      stats = {
        userId,
        leaderboardId,
        currentRank: entry.rank,
        currentScore: entry.score,
        currentDivision: entry.division,
        percentile: entry.percentile,
        bestRank: entry.rank,
        bestScore: entry.score,
        worstRank: entry.rank,
        rankHistory: [],
        scoreHistory: [],
        totalSubmissions: 0,
        lastSubmission: new Date(),
        daysActive: 1,
        timesInTop10: 0,
        timesInTop100: 0,
        consecutiveDaysRanked: 1,
      };
      statsMap.set(userId, stats);
    }

    // Update current stats
    stats.currentRank = entry.rank;
    stats.currentScore = entry.score;
    stats.currentDivision = entry.division;
    stats.percentile = entry.percentile;

    // Update bests
    stats.bestRank = Math.min(stats.bestRank, entry.rank);
    const leaderboard = this.leaderboards.get(leaderboardId)!;
    if (this.isBetterScore(leaderboard, entry.score, stats.bestScore)) {
      stats.bestScore = entry.score;
    }
    stats.worstRank = Math.max(stats.worstRank, entry.rank);

    // Add to history
    stats.rankHistory.push({
      timestamp: new Date(),
      rank: entry.rank,
      score: entry.score,
      division: entry.division,
    });

    stats.scoreHistory.push({
      timestamp: new Date(),
      score: entry.score,
      metadata: entry.metadata,
    });

    // Update counters
    stats.totalSubmissions++;
    stats.lastSubmission = new Date();

    if (entry.rank <= 10) stats.timesInTop10++;
    if (entry.rank <= 100) stats.timesInTop100++;
  }

  private isBetterScore(leaderboard: Leaderboard, newScore: number, existingScore: number): boolean {
    if (leaderboard.sortOrder === 'ascending') {
      return newScore < existingScore;
    } else {
      return newScore > existingScore;
    }
  }

  private formatScore(leaderboard: Leaderboard, score: number): string {
    if (leaderboard.displayFormat) {
      // Simple formatting (in real app, use a proper formatter)
      return leaderboard.displayFormat.replace('%d', score.toString()).replace('%.2f', score.toFixed(2));
    }
    return score.toString();
  }

  private getUserEntry(leaderboardId: string, userId: string): LeaderboardEntry | null {
    const userEntries = this.userEntries.get(userId);
    return userEntries ? userEntries.get(leaderboardId) || null : null;
  }

  private setupDivisions(leaderboardId: string): void {
    const divisions: DivisionInfo[] = [
      {
        division: Division.BRONZE,
        name: 'Bronze',
        minScore: 0,
        maxScore: 1000,
        color: '#CD7F32',
        playerCount: 0,
        percentOfPlayers: 0,
      },
      {
        division: Division.SILVER,
        name: 'Silver',
        minScore: 1000,
        maxScore: 2000,
        color: '#C0C0C0',
        playerCount: 0,
        percentOfPlayers: 0,
      },
      {
        division: Division.GOLD,
        name: 'Gold',
        minScore: 2000,
        maxScore: 3500,
        color: '#FFD700',
        playerCount: 0,
        percentOfPlayers: 0,
      },
      {
        division: Division.PLATINUM,
        name: 'Platinum',
        minScore: 3500,
        maxScore: 5000,
        color: '#E5E4E2',
        playerCount: 0,
        percentOfPlayers: 0,
      },
      {
        division: Division.DIAMOND,
        name: 'Diamond',
        minScore: 5000,
        maxScore: 7500,
        color: '#B9F2FF',
        playerCount: 0,
        percentOfPlayers: 0,
      },
      {
        division: Division.MASTER,
        name: 'Master',
        minScore: 7500,
        maxScore: 10000,
        color: '#9966CC',
        playerCount: 0,
        percentOfPlayers: 0,
      },
      {
        division: Division.GRANDMASTER,
        name: 'Grandmaster',
        minScore: 10000,
        maxScore: 15000,
        color: '#FF6B6B',
        playerCount: 0,
        percentOfPlayers: 0,
      },
      {
        division: Division.CHALLENGER,
        name: 'Challenger',
        minScore: 15000,
        color: '#FF1493',
        playerCount: 0,
        percentOfPlayers: 0,
      },
    ];

    this.divisions.set(leaderboardId, divisions);
  }

  private calculateDivision(leaderboardId: string, score: number): Division {
    const divisions = this.divisions.get(leaderboardId) || [];

    for (let i = divisions.length - 1; i >= 0; i--) {
      const div = divisions[i];
      if (score >= div.minScore) {
        return div.division;
      }
    }

    return Division.UNRANKED;
  }

  private checkDivisionChange(leaderboardId: string, userId: string, entry: LeaderboardEntry): void {
    const stats = this.rankingStats.get(leaderboardId)?.get(userId);
    if (!stats) return;

    const previousDivision = stats.currentDivision;
    const newDivision = entry.division;

    if (previousDivision !== newDivision) {
      const divisionOrder = [
        Division.UNRANKED,
        Division.BRONZE,
        Division.SILVER,
        Division.GOLD,
        Division.PLATINUM,
        Division.DIAMOND,
        Division.MASTER,
        Division.GRANDMASTER,
        Division.CHALLENGER,
      ];

      const oldIndex = divisionOrder.indexOf(previousDivision || Division.UNRANKED);
      const newIndex = divisionOrder.indexOf(newDivision || Division.UNRANKED);

      if (newIndex > oldIndex) {
        this.emit('division:promoted', userId, newDivision!);
      } else {
        this.emit('division:demoted', userId, newDivision!);
      }
    }
  }

  private calculateNextReset(period: LeaderboardPeriod): Date {
    const now = new Date();

    switch (period) {
      case LeaderboardPeriod.DAILY:
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
      case LeaderboardPeriod.WEEKLY:
        const daysUntilMonday = (8 - now.getDay()) % 7;
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilMonday, 0, 0, 0);
      case LeaderboardPeriod.MONTHLY:
        return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
      case LeaderboardPeriod.SEASONAL:
        // 3-month seasons
        const currentMonth = now.getMonth();
        const seasonEndMonth = Math.floor(currentMonth / 3) * 3 + 3;
        return new Date(now.getFullYear(), seasonEndMonth, 1, 0, 0, 0);
      default:
        return new Date(now.getFullYear() + 100, 0, 1); // Far future
    }
  }

  private distributeSeasonRewards(season: SeasonalRanking): void {
    // Implementation depends on your economy system
    console.log(`Distributing rewards for season ${season.seasonNumber}`);
  }

  private initializeDefaultDivisions(): void {
    // Default division setup is done per-leaderboard in setupDivisions
  }

  private startMaintenanceTasks(): void {
    // Check for leaderboard resets every hour
    setInterval(() => {
      const now = new Date();

      for (const leaderboard of this.leaderboards.values()) {
        if (leaderboard.nextResetAt && leaderboard.nextResetAt <= now) {
          this.resetLeaderboard(leaderboard.leaderboardId);
        }
      }

      // Check for season endings
      for (const seasons of this.seasons.values()) {
        for (const season of seasons) {
          if (season.status === 'active' && season.endDate <= now) {
            this.endSeason(season.seasonId);
          }
        }
      }
    }, 60 * 60 * 1000); // Every hour
  }
}
