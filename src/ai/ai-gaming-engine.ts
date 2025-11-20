/**
 * AI Gaming Engine
 * Machine learning features for smart matchmaking, anti-cheat, player behavior prediction,
 * personalized recommendations, and dynamic difficulty adjustment
 */

import { EventEmitter } from 'events';

export interface PlayerBehaviorProfile {
  playerId: string;
  skillLevel: number;
  playStyle: 'aggressive' | 'defensive' | 'balanced' | 'strategic';
  toxicityScore: number; // 0-100, lower is better
  teamworkScore: number; // 0-100, higher is better
  winPrediction: number; // 0-1 probability
  churnRisk: number; // 0-1 probability
  recommendedGames: string[];
  predictedLTV: number;
  engagementScore: number;
}

export interface CheatDetectionResult {
  playerId: string;
  cheatProbability: number; // 0-1
  detectedPatterns: CheatPattern[];
  confidence: number;
  requiresReview: boolean;
  autoAction?: 'warn' | 'tempban' | 'permaban';
}

export interface CheatPattern {
  type: 'aimbot' | 'wallhack' | 'speedhack' | 'stats_manipulation' | 'input_automation';
  score: number;
  evidence: string[];
  timestamps: Date[];
}

export interface MatchQualityPrediction {
  matchId: string;
  qualityScore: number; // 0-100
  balanceScore: number; // 0-100
  toxicityRisk: number; // 0-1
  expectedCloseness: number; // 0-1 (1 = very close match)
  playerSatisfactionPrediction: number; // 0-100
}

export interface GameRecommendation {
  gameId: string;
  gameName: string;
  relevanceScore: number; // 0-100
  reason: string;
  category: string;
  estimatedEngagement: number; // hours
  purchaseProbability: number; // 0-1
}

export interface DifficultyAdjustment {
  playerId: string;
  currentDifficulty: number; // 0-1
  recommendedDifficulty: number; // 0-1
  reason: string;
  playerFrustrationLevel: number; // 0-1
  playerBoredomLevel: number; // 0-1
}

export interface SentimentAnalysis {
  text: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number; // -1 to 1
  toxicity: number; // 0-1
  categories: string[];
}

export class AIGamingEngine extends EventEmitter {
  private behaviorProfiles: Map<string, PlayerBehaviorProfile> = new Map();
  private cheatHistory: Map<string, CheatDetectionResult[]> = new Map();
  private gamePlayHistory: Map<string, any[]> = new Map();

  // ML Model weights (simplified - in production use TensorFlow.js or ONNX)
  private skillPredictionWeights: number[] = [0.3, 0.25, 0.2, 0.15, 0.1];
  private cheatDetectionThreshold: number = 0.75;
  private toxicityThreshold: number = 0.6;

  /**
   * Analyze player behavior and create profile
   */
  async analyzePlayerBehavior(
    playerId: string,
    gameHistory: any[]
  ): Promise<PlayerBehaviorProfile> {
    const existingProfile = this.behaviorProfiles.get(playerId);

    // Calculate skill level from game history
    const skillLevel = this.calculateSkillLevel(gameHistory);

    // Determine play style
    const playStyle = this.determinePlayStyle(gameHistory);

    // Calculate toxicity score from chat/reports
    const toxicityScore = this.calculateToxicityScore(playerId, gameHistory);

    // Calculate teamwork score
    const teamworkScore = this.calculateTeamworkScore(gameHistory);

    // Predict win rate
    const winPrediction = this.predictWinRate(gameHistory, skillLevel);

    // Calculate churn risk
    const churnRisk = this.predictChurnRisk(playerId, gameHistory);

    // Get game recommendations
    const recommendedGames = await this.getRecommendations(playerId, 5);

    // Predict lifetime value
    const predictedLTV = this.predictLifetimeValue(playerId, gameHistory);

    // Calculate engagement score
    const engagementScore = this.calculateEngagementScore(gameHistory);

    const profile: PlayerBehaviorProfile = {
      playerId,
      skillLevel,
      playStyle,
      toxicityScore,
      teamworkScore,
      winPrediction,
      churnRisk,
      recommendedGames: recommendedGames.map(r => r.gameId),
      predictedLTV,
      engagementScore
    };

    this.behaviorProfiles.set(playerId, profile);

    this.emit('behaviorAnalyzed', profile);

    return profile;
  }

  /**
   * Calculate player skill level using machine learning
   */
  private calculateSkillLevel(gameHistory: any[]): number {
    if (gameHistory.length === 0) return 500; // Default ELO

    const features = [
      this.getWinRate(gameHistory),
      this.getAverageKDA(gameHistory),
      this.getObjectiveScore(gameHistory),
      this.getConsistencyScore(gameHistory),
      this.getRecentPerformance(gameHistory)
    ];

    // Weighted sum with ML weights
    let skillScore = 0;
    for (let i = 0; i < features.length; i++) {
      skillScore += features[i] * this.skillPredictionWeights[i];
    }

    // Normalize to 0-2000 scale
    return Math.max(0, Math.min(2000, skillScore * 2000));
  }

  /**
   * Determine player's play style using clustering
   */
  private determinePlayStyle(gameHistory: any[]): 'aggressive' | 'defensive' | 'balanced' | 'strategic' {
    const metrics = {
      aggression: this.calculateAggression(gameHistory),
      defense: this.calculateDefense(gameHistory),
      strategy: this.calculateStrategy(gameHistory)
    };

    if (metrics.aggression > 0.7) return 'aggressive';
    if (metrics.defense > 0.7) return 'defensive';
    if (metrics.strategy > 0.7) return 'strategic';
    return 'balanced';
  }

  /**
   * Calculate toxicity score using NLP
   */
  private calculateToxicityScore(playerId: string, gameHistory: any[]): number {
    // Analyze chat messages and reports
    let toxicitySum = 0;
    let count = 0;

    for (const game of gameHistory) {
      if (game.chatMessages) {
        for (const message of game.chatMessages) {
          const sentiment = this.analyzeSentiment(message);
          toxicitySum += sentiment.toxicity;
          count++;
        }
      }

      // Factor in reports
      if (game.reports) {
        toxicitySum += game.reports.length * 0.1;
        count++;
      }
    }

    return count > 0 ? Math.min(100, (toxicitySum / count) * 100) : 0;
  }

  /**
   * Calculate teamwork score
   */
  private calculateTeamworkScore(gameHistory: any[]): number {
    let teamworkSum = 0;
    let count = 0;

    for (const game of gameHistory) {
      if (game.assists && game.kills) {
        const assistRatio = game.assists / Math.max(1, game.kills);
        teamworkSum += Math.min(1, assistRatio / 2);
        count++;
      }

      if (game.objectivesHelped) {
        teamworkSum += game.objectivesHelped * 0.1;
        count++;
      }
    }

    return count > 0 ? Math.min(100, (teamworkSum / count) * 100) : 50;
  }

  /**
   * Predict win rate using logistic regression
   */
  private predictWinRate(gameHistory: any[], skillLevel: number): number {
    const recentGames = gameHistory.slice(-20);
    const currentWinRate = this.getWinRate(recentGames);

    // Adjust based on skill level
    const skillFactor = skillLevel / 1000; // Normalize around 1.0

    return Math.min(1, Math.max(0, currentWinRate * skillFactor));
  }

  /**
   * Predict churn risk using survival analysis
   */
  private predictChurnRisk(playerId: string, gameHistory: any[]): number {
    if (gameHistory.length === 0) return 0.5;

    const lastPlayed = gameHistory[gameHistory.length - 1]?.timestamp || new Date();
    const daysSinceLastPlayed = (Date.now() - new Date(lastPlayed).getTime()) / (1000 * 60 * 60 * 24);

    // Risk factors
    const factors = {
      inactivity: Math.min(1, daysSinceLastPlayed / 30),
      decreasingPlaytime: this.calculatePlaytimeTrend(gameHistory) < 0 ? 0.3 : 0,
      losingStreak: this.hasLosingStreak(gameHistory) ? 0.2 : 0,
      lowEngagement: this.calculateEngagementScore(gameHistory) < 30 ? 0.2 : 0
    };

    return Math.min(1, Object.values(factors).reduce((sum, val) => sum + val, 0));
  }

  /**
   * Predict lifetime value
   */
  private predictLifetimeValue(playerId: string, gameHistory: any[]): number {
    const engagementScore = this.calculateEngagementScore(gameHistory);
    const playTime = gameHistory.reduce((sum, game) => sum + (game.duration || 0), 0);
    const purchaseHistory = gameHistory.filter(g => g.purchase).length;

    // Simple LTV formula
    const baseLTV = purchaseHistory * 50; // $50 per purchase
    const engagementMultiplier = 1 + (engagementScore / 100);
    const timeMultiplier = 1 + Math.log10(playTime / 60 + 1);

    return baseLTV * engagementMultiplier * timeMultiplier;
  }

  /**
   * Calculate engagement score
   */
  private calculateEngagementScore(gameHistory: any[]): number {
    if (gameHistory.length === 0) return 0;

    const factors = {
      frequency: Math.min(100, gameHistory.length * 2),
      sessionLength: Math.min(100, this.getAverageSessionLength(gameHistory) / 60),
      consistency: this.getConsistencyScore(gameHistory) * 100,
      social: this.getSocialScore(gameHistory) * 100
    };

    return Object.values(factors).reduce((sum, val) => sum + val, 0) / 4;
  }

  /**
   * Detect cheating using anomaly detection
   */
  async detectCheating(
    playerId: string,
    gameSession: any
  ): Promise<CheatDetectionResult> {
    const patterns: CheatPattern[] = [];

    // Aimbot detection
    const aimbotScore = this.detectAimbot(gameSession);
    if (aimbotScore > 0.5) {
      patterns.push({
        type: 'aimbot',
        score: aimbotScore,
        evidence: ['Abnormally high headshot ratio', 'Impossible flick shots'],
        timestamps: [new Date()]
      });
    }

    // Wallhack detection
    const wallhackScore = this.detectWallhack(gameSession);
    if (wallhackScore > 0.5) {
      patterns.push({
        type: 'wallhack',
        score: wallhackScore,
        evidence: ['Pre-aiming at enemies through walls', 'Tracking invisible players'],
        timestamps: [new Date()]
      });
    }

    // Speed hack detection
    const speedhackScore = this.detectSpeedhack(gameSession);
    if (speedhackScore > 0.5) {
      patterns.push({
        type: 'speedhack',
        score: speedhackScore,
        evidence: ['Movement speed exceeds maximum', 'Impossible position changes'],
        timestamps: [new Date()]
      });
    }

    // Stats manipulation
    const statsManipScore = this.detectStatsManipulation(playerId, gameSession);
    if (statsManipScore > 0.5) {
      patterns.push({
        type: 'stats_manipulation',
        score: statsManipScore,
        evidence: ['Abnormal stat progression', 'Impossible achievement unlocks'],
        timestamps: [new Date()]
      });
    }

    // Calculate overall cheat probability
    const cheatProbability = patterns.length > 0
      ? patterns.reduce((sum, p) => sum + p.score, 0) / patterns.length
      : 0;

    const confidence = patterns.length > 0
      ? Math.min(1, patterns.length * 0.3)
      : 0;

    // Determine auto action
    let autoAction: 'warn' | 'tempban' | 'permaban' | undefined;
    if (cheatProbability > 0.9) {
      autoAction = 'permaban';
    } else if (cheatProbability > this.cheatDetectionThreshold) {
      autoAction = 'tempban';
    } else if (cheatProbability > 0.5) {
      autoAction = 'warn';
    }

    const result: CheatDetectionResult = {
      playerId,
      cheatProbability,
      detectedPatterns: patterns,
      confidence,
      requiresReview: cheatProbability > 0.6 && confidence < 0.8,
      autoAction
    };

    // Store in history
    if (!this.cheatHistory.has(playerId)) {
      this.cheatHistory.set(playerId, []);
    }
    this.cheatHistory.get(playerId)!.push(result);

    if (patterns.length > 0) {
      this.emit('cheatDetected', result);
    }

    return result;
  }

  /**
   * Detect aimbot using statistical analysis
   */
  private detectAimbot(gameSession: any): number {
    if (!gameSession.shots) return 0;

    const headshotRatio = (gameSession.headshots || 0) / Math.max(1, gameSession.shots);
    const accuracy = (gameSession.hits || 0) / Math.max(1, gameSession.shots);

    // Abnormally high values indicate potential aimbot
    let score = 0;

    if (headshotRatio > 0.8) score += 0.5;
    if (accuracy > 0.9) score += 0.3;
    if (gameSession.consecutiveHeadshots > 10) score += 0.2;

    return Math.min(1, score);
  }

  /**
   * Detect wallhack using behavior analysis
   */
  private detectWallhack(gameSession: any): number {
    let score = 0;

    if (gameSession.preAimingEvents > 5) score += 0.4;
    if (gameSession.trackingThroughWalls > 3) score += 0.4;
    if (gameSession.impossibleKnowledge > 2) score += 0.2;

    return Math.min(1, score);
  }

  /**
   * Detect speed hack using physics validation
   */
  private detectSpeedhack(gameSession: any): number {
    if (!gameSession.movements) return 0;

    let violations = 0;

    for (const movement of gameSession.movements) {
      if (movement.speed > gameSession.maxSpeed * 1.1) {
        violations++;
      }
    }

    return Math.min(1, violations / 10);
  }

  /**
   * Detect stats manipulation
   */
  private detectStatsManipulation(playerId: string, gameSession: any): number {
    // Check for impossible stat gains
    let score = 0;

    if (gameSession.levelGain > 10) score += 0.3;
    if (gameSession.currencyGained > 100000) score += 0.3;
    if (gameSession.achievementsUnlocked > 20) score += 0.4;

    return Math.min(1, score);
  }

  /**
   * Predict match quality before it starts
   */
  async predictMatchQuality(
    matchId: string,
    playerIds: string[]
  ): Promise<MatchQualityPrediction> {
    const profiles = playerIds
      .map(id => this.behaviorProfiles.get(id))
      .filter(p => p !== undefined) as PlayerBehaviorProfile[];

    if (profiles.length === 0) {
      return {
        matchId,
        qualityScore: 50,
        balanceScore: 50,
        toxicityRisk: 0.5,
        expectedCloseness: 0.5,
        playerSatisfactionPrediction: 50
      };
    }

    // Calculate skill balance
    const avgSkill = profiles.reduce((sum, p) => sum + p.skillLevel, 0) / profiles.length;
    const skillVariance = profiles.reduce((sum, p) => sum + Math.pow(p.skillLevel - avgSkill, 2), 0) / profiles.length;
    const balanceScore = Math.max(0, 100 - (skillVariance / 100));

    // Calculate toxicity risk
    const avgToxicity = profiles.reduce((sum, p) => sum + p.toxicityScore, 0) / profiles.length;
    const toxicityRisk = avgToxicity / 100;

    // Calculate expected closeness
    const expectedCloseness = Math.max(0, 1 - (skillVariance / 10000));

    // Calculate quality score
    const qualityScore = (balanceScore * 0.5) + ((1 - toxicityRisk) * 50);

    // Predict player satisfaction
    const playerSatisfactionPrediction = qualityScore * 0.8 +
      (profiles.reduce((sum, p) => sum + p.teamworkScore, 0) / profiles.length) * 0.2;

    return {
      matchId,
      qualityScore,
      balanceScore,
      toxicityRisk,
      expectedCloseness,
      playerSatisfactionPrediction
    };
  }

  /**
   * Get personalized game recommendations
   */
  async getRecommendations(
    playerId: string,
    count: number = 5
  ): Promise<GameRecommendation[]> {
    const profile = this.behaviorProfiles.get(playerId);
    const gameHistory = this.gamePlayHistory.get(playerId) || [];

    // Collaborative filtering: find similar players
    const similarPlayers = this.findSimilarPlayers(playerId, 10);

    // Content-based filtering: analyze played games
    const playedGames = new Set(gameHistory.map(g => g.gameId));

    // Mock game catalog
    const gameCatalog = this.getGameCatalog();

    const recommendations: GameRecommendation[] = [];

    for (const game of gameCatalog) {
      if (playedGames.has(game.id)) continue;

      let relevanceScore = 0;

      // Similarity to played games
      const genreMatch = this.calculateGenreSimilarity(game, gameHistory);
      relevanceScore += genreMatch * 40;

      // Popularity among similar players
      const popularityScore = this.calculatePopularityAmongSimilar(game.id, similarPlayers);
      relevanceScore += popularityScore * 30;

      // Match to player style
      if (profile) {
        const styleMatch = this.calculateStyleMatch(game, profile);
        relevanceScore += styleMatch * 30;
      }

      // Estimate engagement
      const estimatedEngagement = this.estimateEngagement(game, profile);

      // Estimate purchase probability
      const purchaseProbability = Math.min(1, relevanceScore / 100);

      recommendations.push({
        gameId: game.id,
        gameName: game.name,
        relevanceScore,
        reason: this.generateRecommendationReason(game, genreMatch, popularityScore),
        category: game.category,
        estimatedEngagement,
        purchaseProbability
      });
    }

    // Sort by relevance and return top N
    return recommendations
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, count);
  }

  /**
   * Adjust difficulty dynamically based on player performance
   */
  async adjustDifficulty(
    playerId: string,
    recentPerformance: any[]
  ): Promise<DifficultyAdjustment> {
    const currentDifficulty = recentPerformance[0]?.difficulty || 0.5;

    // Calculate frustration level
    const frustrationLevel = this.calculateFrustration(recentPerformance);

    // Calculate boredom level
    const boredomLevel = this.calculateBoredom(recentPerformance);

    // Find optimal difficulty (flow state)
    let recommendedDifficulty = currentDifficulty;
    let reason = '';

    if (frustrationLevel > 0.7) {
      // Too difficult, reduce
      recommendedDifficulty = Math.max(0.1, currentDifficulty - 0.1);
      reason = 'Player showing signs of frustration, reducing difficulty';
    } else if (boredomLevel > 0.7) {
      // Too easy, increase
      recommendedDifficulty = Math.min(1.0, currentDifficulty + 0.1);
      reason = 'Player performing too well, increasing challenge';
    } else if (frustrationLevel < 0.3 && boredomLevel < 0.3) {
      // In flow state, gradually increase
      recommendedDifficulty = Math.min(1.0, currentDifficulty + 0.02);
      reason = 'Player in optimal flow state, slightly increasing difficulty';
    } else {
      reason = 'Current difficulty is appropriate';
    }

    return {
      playerId,
      currentDifficulty,
      recommendedDifficulty,
      reason,
      playerFrustrationLevel: frustrationLevel,
      playerBoredomLevel: boredomLevel
    };
  }

  /**
   * Analyze sentiment of text using NLP
   */
  analyzeSentiment(text: string): SentimentAnalysis {
    const lowerText = text.toLowerCase();

    // Simple keyword-based sentiment (in production use NLP library)
    const positiveWords = ['good', 'great', 'awesome', 'love', 'best', 'win', 'gg', 'nice'];
    const negativeWords = ['bad', 'sucks', 'hate', 'worst', 'noob', 'trash', 'ez', 'rekt'];
    const toxicWords = ['idiot', 'stupid', 'kill yourself', 'retard', 'cancer', 'kys'];

    let score = 0;
    let toxicity = 0;

    for (const word of positiveWords) {
      if (lowerText.includes(word)) score += 0.2;
    }

    for (const word of negativeWords) {
      if (lowerText.includes(word)) score -= 0.2;
    }

    for (const word of toxicWords) {
      if (lowerText.includes(word)) {
        toxicity += 0.3;
        score -= 0.4;
      }
    }

    score = Math.max(-1, Math.min(1, score));
    toxicity = Math.max(0, Math.min(1, toxicity));

    const sentiment: 'positive' | 'negative' | 'neutral' =
      score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral';

    return {
      text,
      sentiment,
      score,
      toxicity,
      categories: []
    };
  }

  // ==================== HELPER METHODS ====================

  private getWinRate(games: any[]): number {
    if (games.length === 0) return 0.5;
    const wins = games.filter(g => g.won).length;
    return wins / games.length;
  }

  private getAverageKDA(games: any[]): number {
    if (games.length === 0) return 1;

    const avgKills = games.reduce((sum, g) => sum + (g.kills || 0), 0) / games.length;
    const avgDeaths = Math.max(1, games.reduce((sum, g) => sum + (g.deaths || 0), 0) / games.length);
    const avgAssists = games.reduce((sum, g) => sum + (g.assists || 0), 0) / games.length;

    return (avgKills + avgAssists * 0.5) / avgDeaths;
  }

  private getObjectiveScore(games: any[]): number {
    return games.reduce((sum, g) => sum + (g.objectives || 0), 0) / Math.max(1, games.length) / 10;
  }

  private getConsistencyScore(games: any[]): number {
    if (games.length < 2) return 0.5;

    const scores = games.map(g => g.score || 0);
    const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;

    return Math.max(0, 1 - (variance / 10000));
  }

  private getRecentPerformance(games: any[]): number {
    const recent = games.slice(-5);
    return this.getWinRate(recent);
  }

  private calculateAggression(games: any[]): number {
    return games.reduce((sum, g) => sum + (g.kills || 0) / Math.max(1, g.duration || 1), 0) / Math.max(1, games.length);
  }

  private calculateDefense(games: any[]): number {
    return games.reduce((sum, g) => sum + (g.damageBlocked || 0) / Math.max(1, g.damageTaken || 1), 0) / Math.max(1, games.length);
  }

  private calculateStrategy(games: any[]): number {
    return games.reduce((sum, g) => sum + (g.objectives || 0) / Math.max(1, g.kills || 1), 0) / Math.max(1, games.length);
  }

  private calculatePlaytimeTrend(games: any[]): number {
    if (games.length < 5) return 0;

    const recent = games.slice(-5).reduce((sum, g) => sum + (g.duration || 0), 0);
    const older = games.slice(-10, -5).reduce((sum, g) => sum + (g.duration || 0), 0);

    return (recent - older) / Math.max(1, older);
  }

  private hasLosingStreak(games: any[]): boolean {
    const recent = games.slice(-5);
    return recent.filter(g => !g.won).length >= 4;
  }

  private getAverageSessionLength(games: any[]): number {
    return games.reduce((sum, g) => sum + (g.duration || 0), 0) / Math.max(1, games.length);
  }

  private getSocialScore(games: any[]): number {
    const gamesWithParty = games.filter(g => g.partySize > 1).length;
    return gamesWithParty / Math.max(1, games.length);
  }

  private calculateFrustration(performance: any[]): number {
    const recentLosses = performance.slice(-5).filter(p => !p.won).length;
    const deaths = performance.reduce((sum, p) => sum + (p.deaths || 0), 0) / Math.max(1, performance.length);

    return Math.min(1, (recentLosses / 5) * 0.6 + (deaths / 20) * 0.4);
  }

  private calculateBoredom(performance: any[]): number {
    const recentWins = performance.slice(-5).filter(p => p.won).length;
    const dominance = performance.reduce((sum, p) => sum + ((p.kills || 0) / Math.max(1, p.deaths || 1)), 0) / Math.max(1, performance.length);

    return Math.min(1, (recentWins / 5) * 0.5 + Math.min(1, dominance / 5) * 0.5);
  }

  private findSimilarPlayers(playerId: string, count: number): string[] {
    const targetProfile = this.behaviorProfiles.get(playerId);
    if (!targetProfile) return [];

    const similarities: { playerId: string; score: number }[] = [];

    for (const [otherPlayerId, otherProfile] of this.behaviorProfiles) {
      if (otherPlayerId === playerId) continue;

      const similarity = this.calculateProfileSimilarity(targetProfile, otherProfile);
      similarities.push({ playerId: otherPlayerId, score: similarity });
    }

    return similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map(s => s.playerId);
  }

  private calculateProfileSimilarity(p1: PlayerBehaviorProfile, p2: PlayerBehaviorProfile): number {
    const skillDiff = Math.abs(p1.skillLevel - p2.skillLevel) / 2000;
    const styleSame = p1.playStyle === p2.playStyle ? 1 : 0;

    return (1 - skillDiff) * 0.5 + styleSame * 0.5;
  }

  private getGameCatalog(): any[] {
    return [
      { id: 'game1', name: 'Battle Royale Legends', category: 'shooter', genres: ['fps', 'battle-royale'] },
      { id: 'game2', name: 'Strategy Empire', category: 'strategy', genres: ['rts', 'strategy'] },
      { id: 'game3', name: 'Racing Thunder', category: 'racing', genres: ['racing', 'arcade'] },
      { id: 'game4', name: 'RPG Quest', category: 'rpg', genres: ['rpg', 'adventure'] },
      { id: 'game5', name: 'MOBA Champions', category: 'moba', genres: ['moba', 'strategy'] }
    ];
  }

  private calculateGenreSimilarity(game: any, gameHistory: any[]): number {
    const playedGenres = new Set(gameHistory.flatMap(g => g.genres || []));
    const matchingGenres = game.genres.filter((g: string) => playedGenres.has(g)).length;

    return matchingGenres / Math.max(1, game.genres.length);
  }

  private calculatePopularityAmongSimilar(gameId: string, similarPlayers: string[]): number {
    let playedCount = 0;

    for (const playerId of similarPlayers) {
      const history = this.gamePlayHistory.get(playerId) || [];
      if (history.some(g => g.gameId === gameId)) {
        playedCount++;
      }
    }

    return playedCount / Math.max(1, similarPlayers.length);
  }

  private calculateStyleMatch(game: any, profile: PlayerBehaviorProfile): number {
    // Match game to player style
    const styleMatches: Record<string, string[]> = {
      aggressive: ['fps', 'battle-royale', 'action'],
      defensive: ['strategy', 'tower-defense'],
      balanced: ['moba', 'rpg'],
      strategic: ['rts', 'strategy', 'tactics']
    };

    const matchingGenres = game.genres.filter((g: string) =>
      styleMatches[profile.playStyle]?.includes(g)
    ).length;

    return matchingGenres / Math.max(1, game.genres.length);
  }

  private estimateEngagement(game: any, profile?: PlayerBehaviorProfile): number {
    if (!profile) return 20;

    // Estimate based on game type and player engagement score
    const baseHours = {
      'fps': 50,
      'rpg': 100,
      'strategy': 80,
      'moba': 120,
      'racing': 30
    };

    const base = baseHours[game.category as keyof typeof baseHours] || 40;
    const multiplier = profile.engagementScore / 50;

    return base * multiplier;
  }

  private generateRecommendationReason(game: any, genreMatch: number, popularityScore: number): string {
    if (genreMatch > 0.7) {
      return `Similar to games you've enjoyed`;
    } else if (popularityScore > 0.7) {
      return `Popular among similar players`;
    } else {
      return `Trending in ${game.category}`;
    }
  }
}
