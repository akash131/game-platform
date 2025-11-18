/**
 * Battle Pass / Season Pass System
 *
 * Fortnite / Apex Legends / Call of Duty-style seasonal progression
 *
 * Features:
 * - Free and premium tiers
 * - Level-based rewards
 * - XP and challenge progression
 * - Instant tier unlocks (with currency)
 * - Cosmetic and gameplay rewards
 * - Season-exclusive content
 * - Prestige/bonus tiers after completion
 * - Retroactive reward claiming (buy pass later)
 * - Gift battle pass
 * - Track progression across platforms
 */

import { EventEmitter } from 'eventemitter3';

export enum RewardType {
  CURRENCY = 'currency',
  COSMETIC = 'cosmetic',
  EMOTE = 'emote',
  WEAPON_SKIN = 'weapon_skin',
  CHARACTER_SKIN = 'character_skin',
  XP_BOOST = 'xp_boost',
  LOOT_BOX = 'loot_box',
  BADGE = 'badge',
  TITLE = 'title',
  AVATAR = 'avatar',
}

export enum PassTier {
  FREE = 'free',
  PREMIUM = 'premium',
  PRESTIGE = 'prestige', // Bonus tiers after completing base pass
}

export interface BattlePass {
  passId: string;
  seasonId: string;
  seasonNumber: number;
  name: string;
  description: string;

  // Timing
  startDate: Date;
  endDate: Date;
  status: 'upcoming' | 'active' | 'ended';

  // Pricing
  premiumPrice: number;
  currency: string;
  bundlePrice?: number; // Price with instant tier unlocks
  giftable: boolean;

  // Progression
  maxTier: number;
  prestigeTiers: number;
  xpPerTier: number;

  // Rewards
  rewards: Map<number, PassReward[]>; // tier -> rewards
  freeRewards: Map<number, PassReward[]>;
  prestigeRewards: Map<number, PassReward[]>;

  // Features
  hasInstantUnlock: boolean; // Unlock some rewards immediately on purchase
  instantUnlockRewards?: PassReward[];
  retroactiveRewards: boolean; // Can buy pass and claim past rewards

  // Stats
  totalPlayers: number;
  playersWithPremium: number;
  averageTier: number;

  createdAt: Date;
  updatedAt: Date;
}

export interface PassReward {
  rewardId: string;
  tier: number;
  tierType: PassTier;
  type: RewardType;
  name: string;
  description: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
  imageUrl?: string;
  value: number | string; // Amount for currency, ID for items
  metadata?: Record<string, any>;
  isExclusive: boolean; // Can't be obtained elsewhere
  isFeatured: boolean; // Highlighted reward
}

export interface PlayerPassProgress {
  userId: string;
  passId: string;
  hasPremium: boolean;
  purchasedAt?: Date;

  // Progression
  currentTier: number;
  currentXP: number;
  totalXP: number;

  // Rewards
  claimedRewards: Set<string>; // rewardIds
  unclaimedRewards: Set<string>;

  // Boosts
  xpBoostMultiplier: number;
  xpBoostExpiresAt?: Date;

  // Stats
  challengesCompleted: number;
  dailyChallengesCompleted: number;
  weeklyChallengesCompleted: number;

  lastPlayed: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PassChallenge {
  challengeId: string;
  passId: string;
  name: string;
  description: string;
  type: 'daily' | 'weekly' | 'seasonal';

  // Objectives
  objectives: ChallengeObjective[];

  // Rewards
  xpReward: number;
  bonusRewards?: PassReward[];

  // Timing
  availableFrom: Date;
  expiresAt?: Date;

  // Status
  isActive: boolean;
  isCompleted: boolean;

  // Difficulty
  difficulty: 'easy' | 'medium' | 'hard' | 'extreme';
  stars: number; // 1-5 star rating

  createdAt: Date;
}

export interface ChallengeObjective {
  objectiveId: string;
  description: string;
  type: 'kill' | 'win' | 'score' | 'distance' | 'time' | 'collect' | 'custom';
  target: number;
  current: number;
  isCompleted: boolean;
  metadata?: Record<string, any>; // e.g., { weapon: 'rifle', gameMode: 'battle_royale' }
}

export interface PlayerChallengeProgress {
  userId: string;
  challengeId: string;
  objectives: Map<string, number>; // objectiveId -> current progress
  isCompleted: boolean;
  completedAt?: Date;
  claimed: boolean;
  claimedAt?: Date;
}

export interface PassBundle {
  bundleId: string;
  passId: string;
  name: string;
  description: string;
  price: number;
  currency: string;

  // Contents
  includesPremiumPass: boolean;
  tierUnlocks: number; // Number of tiers to unlock instantly
  xpBoost?: {
    multiplier: number;
    duration: number; // milliseconds
  };
  bonusRewards?: PassReward[];

  // Limits
  isLimitedTime: boolean;
  expiresAt?: Date;
  maxPurchases?: number;
  purchaseCount: number;

  createdAt: Date;
}

export interface PassGift {
  giftId: string;
  senderId: string;
  receiverId: string;
  passId: string;
  bundleId?: string;
  message?: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  sentAt: Date;
  acceptedAt?: Date;
}

export interface PassStats {
  passId: string;

  // Player stats
  totalPlayers: number;
  premiumPlayers: number;
  conversionRate: number; // % who bought premium

  // Progression
  averageTier: number;
  medianTier: number;
  playersAtMaxTier: number;

  // Engagement
  averageChallengesCompleted: number;
  dailyActiveUsers: number;
  averagePlaytimePerDay: number;

  // Revenue
  totalRevenue: number;
  averageRevenuePerUser: number;

  // Popular rewards
  mostClaimedRewards: PassReward[];
  leastClaimedRewards: PassReward[];
}

interface BattlePassEvents {
  'pass:purchased': (userId: string, pass: BattlePass) => void;
  'tier:unlocked': (userId: string, tier: number, rewards: PassReward[]) => void;
  'reward:claimed': (userId: string, reward: PassReward) => void;
  'challenge:completed': (userId: string, challenge: PassChallenge) => void;
  'pass:completed': (userId: string, pass: BattlePass) => void;
  'season:started': (pass: BattlePass) => void;
  'season:ended': (pass: BattlePass) => void;
  'gift:sent': (gift: PassGift) => void;
  'gift:received': (gift: PassGift) => void;
}

/**
 * BattlePassSystem
 *
 * Comprehensive seasonal progression and monetization system
 */
export class BattlePassSystem extends EventEmitter<BattlePassEvents> {
  private passes: Map<string, BattlePass> = new Map();
  private playerProgress: Map<string, Map<string, PlayerPassProgress>> = new Map(); // userId -> (passId -> progress)
  private challenges: Map<string, PassChallenge> = new Map();
  private challengeProgress: Map<string, Map<string, PlayerChallengeProgress>> = new Map(); // userId -> (challengeId -> progress)
  private bundles: Map<string, PassBundle> = new Map();
  private gifts: Map<string, PassGift> = new Map();
  private activePassId?: string;

  constructor() {
    super();
  }

  /**
   * Create new battle pass / season
   */
  createBattlePass(
    seasonNumber: number,
    name: string,
    duration: number, // milliseconds
    options?: {
      description?: string;
      premiumPrice?: number;
      currency?: string;
      maxTier?: number;
      prestigeTiers?: number;
      xpPerTier?: number;
      hasInstantUnlock?: boolean;
      retroactiveRewards?: boolean;
      giftable?: boolean;
    }
  ): BattlePass {
    const pass: BattlePass = {
      passId: `pass_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      seasonId: `season_${seasonNumber}`,
      seasonNumber,
      name,
      description: options?.description || '',
      startDate: new Date(),
      endDate: new Date(Date.now() + duration),
      status: 'active',
      premiumPrice: options?.premiumPrice || 950,
      currency: options?.currency || 'v_bucks',
      giftable: options?.giftable ?? true,
      maxTier: options?.maxTier || 100,
      prestigeTiers: options?.prestigeTiers || 20,
      xpPerTier: options?.xpPerTier || 80000,
      rewards: new Map(),
      freeRewards: new Map(),
      prestigeRewards: new Map(),
      hasInstantUnlock: options?.hasInstantUnlock ?? false,
      retroactiveRewards: options?.retroactiveRewards ?? true,
      totalPlayers: 0,
      playersWithPremium: 0,
      averageTier: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.passes.set(pass.passId, pass);
    this.activePassId = pass.passId;

    this.emit('season:started', pass);
    return pass;
  }

  /**
   * Add reward to battle pass
   */
  addReward(
    passId: string,
    tier: number,
    tierType: PassTier,
    reward: Omit<PassReward, 'rewardId' | 'tier' | 'tierType'>
  ): PassReward {
    const pass = this.passes.get(passId);
    if (!pass) throw new Error('Battle pass not found');

    const fullReward: PassReward = {
      rewardId: `reward_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tier,
      tierType,
      ...reward,
    };

    const rewardMap = tierType === PassTier.FREE ? pass.freeRewards :
                      tierType === PassTier.PRESTIGE ? pass.prestigeRewards :
                      pass.rewards;

    if (!rewardMap.has(tier)) {
      rewardMap.set(tier, []);
    }
    rewardMap.get(tier)!.push(fullReward);

    pass.updatedAt = new Date();
    return fullReward;
  }

  /**
   * Purchase premium battle pass
   */
  purchasePremiumPass(userId: string, passId?: string): PlayerPassProgress {
    const targetPassId = passId || this.activePassId;
    if (!targetPassId) throw new Error('No active battle pass');

    const pass = this.passes.get(targetPassId);
    if (!pass) throw new Error('Battle pass not found');

    let progress = this.getPlayerProgress(userId, targetPassId);

    if (!progress) {
      progress = this.initializePlayerProgress(userId, targetPassId);
    }

    if (progress.hasPremium) {
      throw new Error('Already owns premium pass');
    }

    progress.hasPremium = true;
    progress.purchasedAt = new Date();

    pass.playersWithPremium++;
    pass.updatedAt = new Date();

    // Unlock instant rewards if applicable
    if (pass.hasInstantUnlock && pass.instantUnlockRewards) {
      for (const reward of pass.instantUnlockRewards) {
        this.claimReward(userId, targetPassId, reward.rewardId);
      }
    }

    // If retroactive rewards enabled, unlock all premium rewards for completed tiers
    if (pass.retroactiveRewards) {
      for (let tier = 1; tier <= progress.currentTier; tier++) {
        const rewards = pass.rewards.get(tier) || [];
        for (const reward of rewards) {
          if (!progress.claimedRewards.has(reward.rewardId)) {
            progress.unclaimedRewards.add(reward.rewardId);
          }
        }
      }
    }

    this.emit('pass:purchased', userId, pass);
    return progress;
  }

  /**
   * Grant XP to player
   */
  grantXP(userId: string, amount: number, passId?: string): PlayerPassProgress {
    const targetPassId = passId || this.activePassId;
    if (!targetPassId) throw new Error('No active battle pass');

    let progress = this.getPlayerProgress(userId, targetPassId);
    if (!progress) {
      progress = this.initializePlayerProgress(userId, targetPassId);
    }

    const pass = this.passes.get(targetPassId)!;

    // Apply XP boost
    const boostedAmount = Math.floor(amount * progress.xpBoostMultiplier);

    progress.currentXP += boostedAmount;
    progress.totalXP += boostedAmount;
    progress.lastPlayed = new Date();

    // Check for tier unlocks
    const previousTier = progress.currentTier;
    while (progress.currentXP >= pass.xpPerTier && progress.currentTier < pass.maxTier) {
      progress.currentXP -= pass.xpPerTier;
      progress.currentTier++;

      // Unlock tier rewards
      this.unlockTierRewards(userId, targetPassId, progress.currentTier);
    }

    // Check for prestige tiers
    if (progress.currentTier >= pass.maxTier && progress.currentXP >= pass.xpPerTier) {
      const prestigeTier = progress.currentTier - pass.maxTier;
      if (prestigeTier < pass.prestigeTiers) {
        progress.currentXP -= pass.xpPerTier;
        progress.currentTier++;
        this.unlockTierRewards(userId, targetPassId, progress.currentTier);
      }
    }

    // Check XP boost expiration
    if (progress.xpBoostExpiresAt && progress.xpBoostExpiresAt < new Date()) {
      progress.xpBoostMultiplier = 1.0;
      progress.xpBoostExpiresAt = undefined;
    }

    progress.updatedAt = new Date();

    // Check if pass completed
    if (previousTier < pass.maxTier && progress.currentTier >= pass.maxTier) {
      this.emit('pass:completed', userId, pass);
    }

    return progress;
  }

  /**
   * Unlock tier instantly (with currency)
   */
  unlockTierInstantly(userId: string, tiers: number = 1, passId?: string): PlayerPassProgress {
    const targetPassId = passId || this.activePassId;
    if (!targetPassId) throw new Error('No active battle pass');

    const progress = this.getPlayerProgress(userId, targetPassId);
    if (!progress) throw new Error('Player progress not found');

    const pass = this.passes.get(targetPassId)!;

    const newTier = Math.min(progress.currentTier + tiers, pass.maxTier + pass.prestigeTiers);

    for (let tier = progress.currentTier + 1; tier <= newTier; tier++) {
      this.unlockTierRewards(userId, targetPassId, tier);
    }

    progress.currentTier = newTier;
    progress.currentXP = 0;
    progress.updatedAt = new Date();

    return progress;
  }

  /**
   * Claim reward
   */
  claimReward(userId: string, passId: string, rewardId: string): PassReward {
    const progress = this.getPlayerProgress(userId, passId);
    if (!progress) throw new Error('Player progress not found');

    const pass = this.passes.get(passId)!;

    // Find reward
    let reward: PassReward | undefined;
    for (const rewards of [pass.freeRewards, pass.rewards, pass.prestigeRewards]) {
      for (const rewardList of rewards.values()) {
        reward = rewardList.find(r => r.rewardId === rewardId);
        if (reward) break;
      }
      if (reward) break;
    }

    if (!reward) throw new Error('Reward not found');

    // Check if tier is unlocked
    if (reward.tier > progress.currentTier) {
      throw new Error('Tier not unlocked');
    }

    // Check if premium is required
    if (reward.tierType === PassTier.PREMIUM && !progress.hasPremium) {
      throw new Error('Premium pass required');
    }

    // Check if already claimed
    if (progress.claimedRewards.has(rewardId)) {
      throw new Error('Reward already claimed');
    }

    progress.claimedRewards.add(rewardId);
    progress.unclaimedRewards.delete(rewardId);
    progress.updatedAt = new Date();

    this.emit('reward:claimed', userId, reward);
    return reward;
  }

  /**
   * Create challenge
   */
  createChallenge(
    passId: string,
    name: string,
    description: string,
    type: 'daily' | 'weekly' | 'seasonal',
    objectives: Omit<ChallengeObjective, 'objectiveId' | 'current' | 'isCompleted'>[],
    xpReward: number,
    options?: {
      bonusRewards?: PassReward[];
      difficulty?: 'easy' | 'medium' | 'hard' | 'extreme';
      stars?: number;
      expiresIn?: number; // milliseconds
    }
  ): PassChallenge {
    const challenge: PassChallenge = {
      challengeId: `challenge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      passId,
      name,
      description,
      type,
      objectives: objectives.map(obj => ({
        objectiveId: `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        current: 0,
        isCompleted: false,
        ...obj,
      })),
      xpReward,
      bonusRewards: options?.bonusRewards,
      availableFrom: new Date(),
      expiresAt: options?.expiresIn ? new Date(Date.now() + options.expiresIn) : undefined,
      isActive: true,
      isCompleted: false,
      difficulty: options?.difficulty || 'medium',
      stars: options?.stars || 1,
      createdAt: new Date(),
    };

    this.challenges.set(challenge.challengeId, challenge);
    return challenge;
  }

  /**
   * Update challenge progress
   */
  updateChallengeProgress(
    userId: string,
    challengeId: string,
    objectiveId: string,
    progress: number
  ): PlayerChallengeProgress {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) throw new Error('Challenge not found');

    if (!challenge.isActive) {
      throw new Error('Challenge is not active');
    }

    if (!this.challengeProgress.has(userId)) {
      this.challengeProgress.set(userId, new Map());
    }

    let playerProgress = this.challengeProgress.get(userId)!.get(challengeId);
    if (!playerProgress) {
      playerProgress = {
        userId,
        challengeId,
        objectives: new Map(),
        isCompleted: false,
        claimed: false,
      };
      this.challengeProgress.get(userId)!.set(challengeId, playerProgress);
    }

    playerProgress.objectives.set(objectiveId, progress);

    // Check if all objectives completed
    const allCompleted = challenge.objectives.every(obj => {
      const current = playerProgress!.objectives.get(obj.objectiveId) || 0;
      return current >= obj.target;
    });

    if (allCompleted && !playerProgress.isCompleted) {
      playerProgress.isCompleted = true;
      playerProgress.completedAt = new Date();

      // Auto-claim rewards
      this.grantXP(userId, challenge.xpReward, challenge.passId);

      if (challenge.bonusRewards) {
        for (const reward of challenge.bonusRewards) {
          this.claimReward(userId, challenge.passId, reward.rewardId);
        }
      }

      // Update player pass progress stats
      const passProgress = this.getPlayerProgress(userId, challenge.passId);
      if (passProgress) {
        passProgress.challengesCompleted++;
        if (challenge.type === 'daily') passProgress.dailyChallengesCompleted++;
        if (challenge.type === 'weekly') passProgress.weeklyChallengesCompleted++;
      }

      this.emit('challenge:completed', userId, challenge);
    }

    return playerProgress;
  }

  /**
   * Create bundle
   */
  createBundle(
    passId: string,
    name: string,
    description: string,
    price: number,
    options?: {
      currency?: string;
      includesPremiumPass?: boolean;
      tierUnlocks?: number;
      xpBoost?: { multiplier: number; duration: number };
      bonusRewards?: PassReward[];
      isLimitedTime?: boolean;
      expiresIn?: number;
      maxPurchases?: number;
    }
  ): PassBundle {
    const bundle: PassBundle = {
      bundleId: `bundle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      passId,
      name,
      description,
      price,
      currency: options?.currency || 'v_bucks',
      includesPremiumPass: options?.includesPremiumPass ?? true,
      tierUnlocks: options?.tierUnlocks || 25,
      xpBoost: options?.xpBoost,
      bonusRewards: options?.bonusRewards,
      isLimitedTime: options?.isLimitedTime ?? false,
      expiresAt: options?.expiresIn ? new Date(Date.now() + options.expiresIn) : undefined,
      maxPurchases: options?.maxPurchases,
      purchaseCount: 0,
      createdAt: new Date(),
    };

    this.bundles.set(bundle.bundleId, bundle);
    return bundle;
  }

  /**
   * Purchase bundle
   */
  purchaseBundle(userId: string, bundleId: string): PlayerPassProgress {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) throw new Error('Bundle not found');

    if (bundle.isLimitedTime && bundle.expiresAt && bundle.expiresAt < new Date()) {
      throw new Error('Bundle expired');
    }

    if (bundle.maxPurchases && bundle.purchaseCount >= bundle.maxPurchases) {
      throw new Error('Bundle sold out');
    }

    let progress = this.getPlayerProgress(userId, bundle.passId);

    // Purchase premium if included
    if (bundle.includesPremiumPass) {
      if (!progress) {
        progress = this.initializePlayerProgress(userId, bundle.passId);
      }
      if (!progress.hasPremium) {
        this.purchasePremiumPass(userId, bundle.passId);
      }
    }

    // Unlock tiers
    if (bundle.tierUnlocks > 0) {
      this.unlockTierInstantly(userId, bundle.tierUnlocks, bundle.passId);
    }

    // Apply XP boost
    if (bundle.xpBoost) {
      progress!.xpBoostMultiplier = bundle.xpBoost.multiplier;
      progress!.xpBoostExpiresAt = new Date(Date.now() + bundle.xpBoost.duration);
    }

    // Grant bonus rewards
    if (bundle.bonusRewards) {
      for (const reward of bundle.bonusRewards) {
        progress!.unclaimedRewards.add(reward.rewardId);
      }
    }

    bundle.purchaseCount++;
    return progress!;
  }

  /**
   * Gift battle pass
   */
  giftPass(
    senderId: string,
    receiverId: string,
    passId: string,
    message?: string,
    bundleId?: string
  ): PassGift {
    const pass = this.passes.get(passId);
    if (!pass) throw new Error('Battle pass not found');

    if (!pass.giftable) {
      throw new Error('This pass cannot be gifted');
    }

    const gift: PassGift = {
      giftId: `gift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      senderId,
      receiverId,
      passId,
      bundleId,
      message,
      status: 'pending',
      sentAt: new Date(),
    };

    this.gifts.set(gift.giftId, gift);
    this.emit('gift:sent', gift);

    // Auto-accept (in real app, receiver would need to accept)
    this.acceptGift(receiverId, gift.giftId);

    return gift;
  }

  /**
   * Accept gift
   */
  acceptGift(userId: string, giftId: string): void {
    const gift = this.gifts.get(giftId);
    if (!gift) throw new Error('Gift not found');

    if (gift.receiverId !== userId) {
      throw new Error('Not authorized');
    }

    if (gift.status !== 'pending') {
      throw new Error('Gift already processed');
    }

    if (gift.bundleId) {
      this.purchaseBundle(userId, gift.bundleId);
    } else {
      this.purchasePremiumPass(userId, gift.passId);
    }

    gift.status = 'accepted';
    gift.acceptedAt = new Date();

    this.emit('gift:received', gift);
  }

  /**
   * Get player progress
   */
  getPlayerProgress(userId: string, passId?: string): PlayerPassProgress | null {
    const targetPassId = passId || this.activePassId;
    if (!targetPassId) return null;

    const userProgress = this.playerProgress.get(userId);
    return userProgress ? userProgress.get(targetPassId) || null : null;
  }

  /**
   * Get active challenges for player
   */
  getActiveChallenges(passId?: string): PassChallenge[] {
    const targetPassId = passId || this.activePassId;
    if (!targetPassId) return [];

    const now = new Date();
    return Array.from(this.challenges.values())
      .filter(c => c.passId === targetPassId && c.isActive)
      .filter(c => !c.expiresAt || c.expiresAt > now);
  }

  /**
   * Get battle pass stats
   */
  getStats(passId: string): PassStats {
    const pass = this.passes.get(passId);
    if (!pass) throw new Error('Battle pass not found');

    const allProgress = Array.from(this.playerProgress.values())
      .map(map => map.get(passId))
      .filter(Boolean) as PlayerPassProgress[];

    const tiers = allProgress.map(p => p.currentTier);
    const averageTier = tiers.length > 0 ? tiers.reduce((a, b) => a + b, 0) / tiers.length : 0;
    const medianTier = tiers.length > 0 ? tiers.sort((a, b) => a - b)[Math.floor(tiers.length / 2)] : 0;

    const challengesCompleted = allProgress.map(p => p.challengesCompleted);
    const averageChallenges = challengesCompleted.length > 0
      ? challengesCompleted.reduce((a, b) => a + b, 0) / challengesCompleted.length
      : 0;

    return {
      passId,
      totalPlayers: allProgress.length,
      premiumPlayers: allProgress.filter(p => p.hasPremium).length,
      conversionRate: allProgress.length > 0
        ? (allProgress.filter(p => p.hasPremium).length / allProgress.length) * 100
        : 0,
      averageTier,
      medianTier,
      playersAtMaxTier: allProgress.filter(p => p.currentTier >= pass.maxTier).length,
      averageChallengesCompleted: averageChallenges,
      dailyActiveUsers: 0, // Would need actual DAU tracking
      averagePlaytimePerDay: 0, // Would need actual playtime tracking
      totalRevenue: pass.playersWithPremium * pass.premiumPrice,
      averageRevenuePerUser: allProgress.length > 0
        ? (pass.playersWithPremium * pass.premiumPrice) / allProgress.length
        : 0,
      mostClaimedRewards: [],
      leastClaimedRewards: [],
    };
  }

  // Private helper methods

  private initializePlayerProgress(userId: string, passId: string): PlayerPassProgress {
    const pass = this.passes.get(passId)!;

    const progress: PlayerPassProgress = {
      userId,
      passId,
      hasPremium: false,
      currentTier: 0,
      currentXP: 0,
      totalXP: 0,
      claimedRewards: new Set(),
      unclaimedRewards: new Set(),
      xpBoostMultiplier: 1.0,
      challengesCompleted: 0,
      dailyChallengesCompleted: 0,
      weeklyChallengesCompleted: 0,
      lastPlayed: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (!this.playerProgress.has(userId)) {
      this.playerProgress.set(userId, new Map());
    }
    this.playerProgress.get(userId)!.set(passId, progress);

    pass.totalPlayers++;
    return progress;
  }

  private unlockTierRewards(userId: string, passId: string, tier: number): void {
    const pass = this.passes.get(passId)!;
    const progress = this.getPlayerProgress(userId, passId)!;

    const rewards: PassReward[] = [];

    // Add free rewards
    const freeRewards = pass.freeRewards.get(tier) || [];
    rewards.push(...freeRewards);

    // Add premium rewards if player has premium
    if (progress.hasPremium) {
      const premiumRewards = pass.rewards.get(tier) || [];
      rewards.push(...premiumRewards);
    }

    // Add prestige rewards if applicable
    if (tier > pass.maxTier) {
      const prestigeTier = tier - pass.maxTier;
      const prestigeRewards = pass.prestigeRewards.get(prestigeTier) || [];
      if (progress.hasPremium) {
        rewards.push(...prestigeRewards);
      }
    }

    // Mark rewards as unclaimed
    for (const reward of rewards) {
      progress.unclaimedRewards.add(reward.rewardId);
    }

    this.emit('tier:unlocked', userId, tier, rewards);
  }
}
