/**
 * Skill-Based Matchmaking System
 * Implements Elo, Glicko-2, and TrueSkill rating algorithms
 * Vendor parity with competitive gaming platforms
 */

import { EventEmitter } from 'events';

export type RatingSystem = 'elo' | 'glicko2' | 'trueskill';

export interface PlayerRating {
  playerId: string;
  rating: number;
  deviation?: number; // Glicko-2 rating deviation
  volatility?: number; // Glicko-2 volatility
  mu?: number; // TrueSkill mean
  sigma?: number; // TrueSkill standard deviation
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winStreak: number;
  lastPlayed: Date;
  rank?: string;
  tier?: number;
}

export interface MatchResult {
  players: PlayerResult[];
  timestamp: Date;
  gameType: string;
  duration?: number;
}

export interface PlayerResult {
  playerId: string;
  placement: number; // 1 = winner, 2 = second, etc.
  score?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
}

export interface RankConfig {
  name: string;
  minRating: number;
  maxRating: number;
  tier: number;
  icon?: string;
  color?: string;
}

export interface MatchmakingPreferences {
  maxRatingDifference: number;
  maxWaitTime: number;
  preferredRegions: string[];
  allowCrossPlatform: boolean;
  minSkillLevel?: number;
  maxSkillLevel?: number;
}

export interface SkillBracket {
  name: string;
  minRating: number;
  maxRating: number;
  playerCount: number;
}

export class SkillRatingSystem extends EventEmitter {
  private ratings: Map<string, PlayerRating> = new Map();
  private matchHistory: MatchResult[] = [];
  private rankConfigs: RankConfig[] = [];
  private system: RatingSystem;

  // Elo parameters
  private eloKFactor: number = 32;
  private eloBase: number = 400;

  // Glicko-2 parameters
  private glickoTau: number = 0.5; // System volatility
  private glickoDefaultRating: number = 1500;
  private glickoDefaultDeviation: number = 350;
  private glickoDefaultVolatility: number = 0.06;

  // TrueSkill parameters
  private trueskillMu: number = 25;
  private trueskillSigma: number = 8.333;
  private trueskillBeta: number = 4.166; // Half of sigma
  private trueskillTau: number = 0.083; // Dynamic factor

  constructor(system: RatingSystem = 'elo') {
    super();
    this.system = system;
    this.initializeRanks();
  }

  /**
   * Initialize rank configurations (like League of Legends, Valorant, etc.)
   */
  private initializeRanks(): void {
    this.rankConfigs = [
      { name: 'Iron', minRating: 0, maxRating: 1099, tier: 1, color: '#4A4A4A' },
      { name: 'Bronze', minRating: 1100, maxRating: 1299, tier: 2, color: '#CD7F32' },
      { name: 'Silver', minRating: 1300, maxRating: 1499, tier: 3, color: '#C0C0C0' },
      { name: 'Gold', minRating: 1500, maxRating: 1699, tier: 4, color: '#FFD700' },
      { name: 'Platinum', minRating: 1700, maxRating: 1899, tier: 5, color: '#E5E4E2' },
      { name: 'Diamond', minRating: 1900, maxRating: 2099, tier: 6, color: '#B9F2FF' },
      { name: 'Master', minRating: 2100, maxRating: 2299, tier: 7, color: '#A855F7' },
      { name: 'Grandmaster', minRating: 2300, maxRating: 2499, tier: 8, color: '#DC2626' },
      { name: 'Challenger', minRating: 2500, maxRating: 9999, tier: 9, color: '#FBBF24' }
    ];
  }

  /**
   * Get or create player rating
   */
  getPlayerRating(playerId: string): PlayerRating {
    if (!this.ratings.has(playerId)) {
      const rating = this.createDefaultRating(playerId);
      this.ratings.set(playerId, rating);
    }
    return this.ratings.get(playerId)!;
  }

  /**
   * Create default rating based on system
   */
  private createDefaultRating(playerId: string): PlayerRating {
    const baseRating: PlayerRating = {
      playerId,
      rating: 1500,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winStreak: 0,
      lastPlayed: new Date()
    };

    switch (this.system) {
      case 'elo':
        return { ...baseRating, rating: 1500 };

      case 'glicko2':
        return {
          ...baseRating,
          rating: this.glickoDefaultRating,
          deviation: this.glickoDefaultDeviation,
          volatility: this.glickoDefaultVolatility
        };

      case 'trueskill':
        return {
          ...baseRating,
          rating: this.trueskillMu,
          mu: this.trueskillMu,
          sigma: this.trueskillSigma
        };

      default:
        return baseRating;
    }
  }

  /**
   * Process match result and update ratings
   */
  async processMatch(match: MatchResult): Promise<Map<string, PlayerRating>> {
    this.matchHistory.push(match);

    const updatedRatings = new Map<string, PlayerRating>();

    switch (this.system) {
      case 'elo':
        return this.processMatchElo(match);

      case 'glicko2':
        return this.processMatchGlicko2(match);

      case 'trueskill':
        return this.processMatchTrueSkill(match);

      default:
        throw new Error(`Unknown rating system: ${this.system}`);
    }
  }

  /**
   * Process match using Elo rating system
   */
  private processMatchElo(match: MatchResult): Map<string, PlayerRating> {
    const updatedRatings = new Map<string, PlayerRating>();

    // Sort players by placement
    const sortedPlayers = [...match.players].sort((a, b) => a.placement - b.placement);

    // Update each pair of players
    for (let i = 0; i < sortedPlayers.length; i++) {
      for (let j = i + 1; j < sortedPlayers.length; j++) {
        const player1 = sortedPlayers[i];
        const player2 = sortedPlayers[j];

        const rating1 = this.getPlayerRating(player1.playerId);
        const rating2 = this.getPlayerRating(player2.playerId);

        // Calculate expected scores
        const expected1 = this.calculateEloExpected(rating1.rating, rating2.rating);
        const expected2 = this.calculateEloExpected(rating2.rating, rating1.rating);

        // Actual scores (1 for winner, 0 for loser)
        const actual1 = player1.placement < player2.placement ? 1 : 0;
        const actual2 = player2.placement < player1.placement ? 1 : 0;

        // Calculate K-factor (higher for new players)
        const k1 = this.calculateKFactor(rating1);
        const k2 = this.calculateKFactor(rating2);

        // Update ratings
        const newRating1 = rating1.rating + k1 * (actual1 - expected1);
        const newRating2 = rating2.rating + k2 * (actual2 - expected2);

        rating1.rating = Math.round(newRating1);
        rating2.rating = Math.round(newRating2);

        // Update stats
        this.updatePlayerStats(rating1, actual1 === 1, actual1 === 0, actual1 === actual2);
        this.updatePlayerStats(rating2, actual2 === 1, actual2 === 0, actual1 === actual2);

        // Update ranks
        rating1.rank = this.getRank(rating1.rating).name;
        rating1.tier = this.getRank(rating1.rating).tier;
        rating2.rank = this.getRank(rating2.rating).name;
        rating2.tier = this.getRank(rating2.rating).tier;

        updatedRatings.set(player1.playerId, rating1);
        updatedRatings.set(player2.playerId, rating2);
      }
    }

    this.emit('ratingsUpdated', { match, updatedRatings });
    return updatedRatings;
  }

  /**
   * Calculate Elo expected score
   */
  private calculateEloExpected(ratingA: number, ratingB: number): number {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / this.eloBase));
  }

  /**
   * Calculate K-factor (dynamic based on games played)
   */
  private calculateKFactor(rating: PlayerRating): number {
    // Higher K for new players (faster rating changes)
    if (rating.gamesPlayed < 30) return 40;
    if (rating.rating > 2400) return 16; // Lower K for high-rated players
    return this.eloKFactor;
  }

  /**
   * Process match using Glicko-2 rating system
   */
  private processMatchGlicko2(match: MatchResult): Map<string, PlayerRating> {
    const updatedRatings = new Map<string, PlayerRating>();

    const sortedPlayers = [...match.players].sort((a, b) => a.placement - b.placement);

    for (let i = 0; i < sortedPlayers.length; i++) {
      const player = sortedPlayers[i];
      const rating = this.getPlayerRating(player.playerId);

      // Gather opponents
      const opponents = sortedPlayers
        .filter((_, idx) => idx !== i)
        .map(p => {
          const oppRating = this.getPlayerRating(p.playerId);
          return {
            rating: oppRating.rating,
            deviation: oppRating.deviation!,
            result: player.placement < p.placement ? 1 : player.placement > p.placement ? 0 : 0.5
          };
        });

      // Update rating using Glicko-2
      const updated = this.updateGlicko2Rating(
        rating.rating,
        rating.deviation!,
        rating.volatility!,
        opponents
      );

      rating.rating = Math.round(updated.rating);
      rating.deviation = updated.deviation;
      rating.volatility = updated.volatility;

      // Update stats
      const wins = opponents.filter(o => o.result === 1).length;
      const losses = opponents.filter(o => o.result === 0).length;
      const draws = opponents.filter(o => o.result === 0.5).length;

      this.updatePlayerStats(rating, wins > 0, losses > 0, draws > 0);

      rating.rank = this.getRank(rating.rating).name;
      rating.tier = this.getRank(rating.rating).tier;

      updatedRatings.set(player.playerId, rating);
    }

    this.emit('ratingsUpdated', { match, updatedRatings });
    return updatedRatings;
  }

  /**
   * Update Glicko-2 rating (simplified implementation)
   */
  private updateGlicko2Rating(
    rating: number,
    rd: number,
    vol: number,
    opponents: { rating: number; deviation: number; result: number }[]
  ): { rating: number; deviation: number; volatility: number } {
    // Convert to Glicko-2 scale
    const mu = (rating - 1500) / 173.7178;
    const phi = rd / 173.7178;

    // Calculate v (variance)
    let v = 0;
    for (const opp of opponents) {
      const oppMu = (opp.rating - 1500) / 173.7178;
      const oppPhi = opp.deviation / 173.7178;
      const g = this.glickoG(oppPhi);
      const e = this.glickoE(mu, oppMu, oppPhi);
      v += Math.pow(g, 2) * e * (1 - e);
    }
    v = 1 / v;

    // Calculate delta
    let delta = 0;
    for (const opp of opponents) {
      const oppMu = (opp.rating - 1500) / 173.7178;
      const oppPhi = opp.deviation / 173.7178;
      const g = this.glickoG(oppPhi);
      const e = this.glickoE(mu, oppMu, oppPhi);
      delta += g * (opp.result - e);
    }
    delta = v * delta;

    // Update volatility (simplified)
    const newVol = Math.sqrt(Math.pow(vol, 2) + Math.pow(delta, 2) / v);

    // Update phi
    const phiStar = Math.sqrt(Math.pow(phi, 2) + Math.pow(newVol, 2));
    const newPhi = 1 / Math.sqrt(1 / Math.pow(phiStar, 2) + 1 / v);

    // Update mu
    let muDelta = 0;
    for (const opp of opponents) {
      const oppMu = (opp.rating - 1500) / 173.7178;
      const oppPhi = opp.deviation / 173.7178;
      const g = this.glickoG(oppPhi);
      const e = this.glickoE(mu, oppMu, oppPhi);
      muDelta += g * (opp.result - e);
    }
    const newMu = mu + Math.pow(newPhi, 2) * muDelta;

    // Convert back to rating scale
    return {
      rating: newMu * 173.7178 + 1500,
      deviation: newPhi * 173.7178,
      volatility: Math.min(newVol, 1.0) // Cap volatility
    };
  }

  private glickoG(phi: number): number {
    return 1 / Math.sqrt(1 + 3 * Math.pow(phi, 2) / Math.pow(Math.PI, 2));
  }

  private glickoE(mu: number, muJ: number, phiJ: number): number {
    return 1 / (1 + Math.exp(-this.glickoG(phiJ) * (mu - muJ)));
  }

  /**
   * Process match using TrueSkill rating system
   */
  private processMatchTrueSkill(match: MatchResult): Map<string, PlayerRating> {
    const updatedRatings = new Map<string, PlayerRating>();

    const sortedPlayers = [...match.players].sort((a, b) => a.placement - b.placement);

    // Simplified TrueSkill update (actual TrueSkill is more complex)
    for (let i = 0; i < sortedPlayers.length; i++) {
      const player = sortedPlayers[i];
      const rating = this.getPlayerRating(player.playerId);

      const mu = rating.mu!;
      const sigma = rating.sigma!;

      // Performance calculation
      const betterPlayers = sortedPlayers.filter(p => p.placement < player.placement).length;
      const worsePlayers = sortedPlayers.filter(p => p.placement > player.placement).length;

      const performanceMultiplier = (worsePlayers - betterPlayers) / sortedPlayers.length;

      // Update mu and sigma
      const newMu = mu + sigma * performanceMultiplier * 3;
      const newSigma = Math.sqrt(
        Math.pow(sigma, 2) + Math.pow(this.trueskillTau, 2) -
        Math.pow(sigma, 4) / (Math.pow(sigma, 2) + Math.pow(this.trueskillBeta, 2))
      );

      rating.mu = newMu;
      rating.sigma = Math.max(newSigma, 1.0); // Minimum sigma
      rating.rating = Math.round(newMu - 3 * newSigma); // Conservative skill estimate

      // Update stats
      this.updatePlayerStats(rating, player.placement === 1, player.placement === sortedPlayers.length, false);

      rating.rank = this.getRank(rating.rating).name;
      rating.tier = this.getRank(rating.rating).tier;

      updatedRatings.set(player.playerId, rating);
    }

    this.emit('ratingsUpdated', { match, updatedRatings });
    return updatedRatings;
  }

  /**
   * Update player statistics
   */
  private updatePlayerStats(
    rating: PlayerRating,
    isWin: boolean,
    isLoss: boolean,
    isDraw: boolean
  ): void {
    rating.gamesPlayed++;
    rating.lastPlayed = new Date();

    if (isWin) {
      rating.wins++;
      rating.winStreak++;
    } else {
      rating.winStreak = 0;
      if (isLoss) {
        rating.losses++;
      } else if (isDraw) {
        rating.draws++;
      }
    }
  }

  /**
   * Get rank configuration for rating
   */
  getRank(rating: number): RankConfig {
    for (const rank of this.rankConfigs) {
      if (rating >= rank.minRating && rating <= rank.maxRating) {
        return rank;
      }
    }
    return this.rankConfigs[0]; // Default to lowest rank
  }

  /**
   * Find suitable opponents based on rating
   */
  findMatchingPlayers(
    playerId: string,
    maxRatingDifference: number = 200,
    count: number = 10
  ): PlayerRating[] {
    const playerRating = this.getPlayerRating(playerId);
    const minRating = playerRating.rating - maxRatingDifference;
    const maxRating = playerRating.rating + maxRatingDifference;

    const matches: PlayerRating[] = [];

    for (const [id, rating] of this.ratings) {
      if (id === playerId) continue;

      if (rating.rating >= minRating && rating.rating <= maxRating) {
        matches.push(rating);
      }
    }

    // Sort by rating proximity
    matches.sort((a, b) => {
      const diffA = Math.abs(a.rating - playerRating.rating);
      const diffB = Math.abs(b.rating - playerRating.rating);
      return diffA - diffB;
    });

    return matches.slice(0, count);
  }

  /**
   * Create balanced teams based on ratings
   */
  createBalancedTeams(
    playerIds: string[],
    teamCount: number = 2
  ): string[][] {
    if (playerIds.length < teamCount) {
      throw new Error('Not enough players for teams');
    }

    const players = playerIds.map(id => this.getPlayerRating(id));

    // Sort by rating (descending)
    players.sort((a, b) => b.rating - a.rating);

    // Create teams
    const teams: PlayerRating[][] = Array.from({ length: teamCount }, () => []);
    const teamRatings: number[] = Array(teamCount).fill(0);

    // Snake draft: distribute players to balance teams
    for (let i = 0; i < players.length; i++) {
      // Find team with lowest total rating
      const minTeamIndex = teamRatings.indexOf(Math.min(...teamRatings));
      teams[minTeamIndex].push(players[i]);
      teamRatings[minTeamIndex] += players[i].rating;
    }

    return teams.map(team => team.map(p => p.playerId));
  }

  /**
   * Get skill brackets distribution
   */
  getSkillBrackets(): SkillBracket[] {
    const brackets: SkillBracket[] = [];

    for (const rank of this.rankConfigs) {
      const playerCount = Array.from(this.ratings.values()).filter(
        r => r.rating >= rank.minRating && r.rating <= rank.maxRating
      ).length;

      brackets.push({
        name: rank.name,
        minRating: rank.minRating,
        maxRating: rank.maxRating,
        playerCount
      });
    }

    return brackets;
  }

  /**
   * Get leaderboard
   */
  getLeaderboard(limit: number = 100): PlayerRating[] {
    return Array.from(this.ratings.values())
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit);
  }

  /**
   * Get player rank percentile
   */
  getPercentile(playerId: string): number {
    const rating = this.getPlayerRating(playerId);
    const allRatings = Array.from(this.ratings.values())
      .map(r => r.rating)
      .sort((a, b) => a - b);

    const index = allRatings.findIndex(r => r >= rating.rating);
    return ((index + 1) / allRatings.length) * 100;
  }

  /**
   * Decay rating for inactive players
   */
  applyInactivityDecay(daysInactive: number = 30, decayAmount: number = 10): number {
    let decayedCount = 0;
    const now = new Date();

    for (const [, rating] of this.ratings) {
      const daysSinceLastPlayed = (now.getTime() - rating.lastPlayed.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceLastPlayed >= daysInactive) {
        const periods = Math.floor(daysSinceLastPlayed / daysInactive);
        rating.rating = Math.max(0, rating.rating - decayAmount * periods);

        if (this.system === 'glicko2') {
          // Increase deviation for inactive players
          rating.deviation = Math.min(350, rating.deviation! + 5 * periods);
        }

        if (this.system === 'trueskill') {
          // Increase sigma for inactive players
          rating.sigma = Math.min(8.333, rating.sigma! + 0.1 * periods);
        }

        decayedCount++;
      }
    }

    this.emit('inactivityDecay', { decayedCount });
    return decayedCount;
  }

  /**
   * Reset seasonal ratings
   */
  resetSeasonalRatings(softReset: boolean = true): void {
    for (const [, rating] of this.ratings) {
      if (softReset) {
        // Soft reset: move rating towards mean
        const mean = 1500;
        rating.rating = Math.round((rating.rating + mean) / 2);
      } else {
        // Hard reset
        const defaultRating = this.createDefaultRating(rating.playerId);
        Object.assign(rating, defaultRating);
      }

      // Reset stats
      rating.gamesPlayed = 0;
      rating.wins = 0;
      rating.losses = 0;
      rating.draws = 0;
      rating.winStreak = 0;
    }

    this.emit('seasonReset', { softReset });
  }

  /**
   * Get rating statistics
   */
  getStats(): any {
    const ratings = Array.from(this.ratings.values());

    return {
      system: this.system,
      totalPlayers: ratings.length,
      averageRating: ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length,
      medianRating: this.calculateMedian(ratings.map(r => r.rating)),
      highestRating: Math.max(...ratings.map(r => r.rating)),
      lowestRating: Math.min(...ratings.map(r => r.rating)),
      totalMatches: this.matchHistory.length,
      activePlayers: ratings.filter(r => {
        const daysSince = (Date.now() - r.lastPlayed.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince < 7;
      }).length,
      brackets: this.getSkillBrackets()
    };
  }

  private calculateMedian(numbers: number[]): number {
    const sorted = numbers.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
}
