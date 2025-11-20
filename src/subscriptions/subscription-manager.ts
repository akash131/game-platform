/**
 * Subscription Management System
 * Advanced subscription features, billing cycles, usage-based pricing
 * Vendor parity with PlayStation Plus, Xbox Game Pass, EA Play
 */

import { EventEmitter } from 'events';

export type SubscriptionTier = 'basic' | 'standard' | 'premium' | 'ultimate';
export type BillingInterval = 'monthly' | 'quarterly' | 'yearly' | 'lifetime';
export type SubscriptionStatus = 'active' | 'trial' | 'past_due' | 'cancelled' | 'expired' | 'paused';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';

export interface SubscriptionPlan {
  id: string;
  name: string;
  tier: SubscriptionTier;
  description: string;
  features: string[];
  pricing: PlanPricing[];
  trialDays: number;
  maxDevices: number;
  includedGames: string[];
  discounts: Discount[];
  benefits: Benefit[];
  isActive: boolean;
  createdAt: Date;
}

export interface PlanPricing {
  interval: BillingInterval;
  price: number;
  currency: string;
  savingsPercent?: number;
}

export interface Benefit {
  type: 'cloud_saves' | 'multiplayer' | 'free_games' | 'discounts' | 'early_access' | 'exclusive_content';
  description: string;
  value?: string;
}

export interface Discount {
  name: string;
  percentage: number;
  minimumTier?: SubscriptionTier;
  validUntil?: Date;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  interval: BillingInterval;
  price: number;
  currency: string;
  startDate: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEnd?: Date;
  cancelAt?: Date;
  cancelledAt?: Date;
  pausedAt?: Date;
  resumeAt?: Date;
  autoRenew: boolean;
  paymentMethod: string;
  devices: SubscriptionDevice[];
  usageMetrics: UsageMetrics;
  billingHistory: BillingRecord[];
  metadata: Record<string, any>;
}

export interface SubscriptionDevice {
  deviceId: string;
  deviceName: string;
  platform: string;
  activatedAt: Date;
  lastUsed: Date;
  isActive: boolean;
}

export interface UsageMetrics {
  gamesPlayed: number;
  totalPlaytime: number; // hours
  cloudSavesUsed: number;
  downloadsThisMonth: number;
  streamingHours: number;
  multiplayerSessions: number;
}

export interface BillingRecord {
  id: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  billingDate: Date;
  paidAt?: Date;
  failureReason?: string;
  invoiceUrl?: string;
  receiptUrl?: string;
}

export interface SubscriptionChange {
  id: string;
  subscriptionId: string;
  changeType: 'upgrade' | 'downgrade' | 'cancel' | 'pause' | 'resume';
  fromPlan?: string;
  toPlan?: string;
  effectiveDate: Date;
  proration: number;
  requestedAt: Date;
  processed: boolean;
}

export interface FamilyPlan {
  id: string;
  ownerId: string;
  planId: string;
  maxMembers: number;
  members: FamilyMember[];
  sharedBenefits: string[];
  createdAt: Date;
}

export interface FamilyMember {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: Date;
  permissions: string[];
}

export interface GiftSubscription {
  id: string;
  giftedBy: string;
  giftedTo: string;
  planId: string;
  duration: number; // months
  message?: string;
  status: 'pending' | 'claimed' | 'expired';
  createdAt: Date;
  claimedAt?: Date;
  expiresAt: Date;
}

export class SubscriptionManager extends EventEmitter {
  private plans: Map<string, SubscriptionPlan> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private changes: Map<string, SubscriptionChange> = new Map();
  private familyPlans: Map<string, FamilyPlan> = new Map();
  private gifts: Map<string, GiftSubscription> = new Map();

  constructor() {
    super();
    this.initializeDefaultPlans();
    this.startBillingScheduler();
  }

  /**
   * Initialize default subscription plans
   */
  private initializeDefaultPlans(): void {
    // Basic Plan
    this.createPlan({
      name: 'Basic',
      tier: 'basic',
      description: 'Essential gaming features',
      features: ['Cloud saves', 'Online multiplayer (limited)', '1 free game/month'],
      pricing: [
        { interval: 'monthly', price: 9.99, currency: 'USD' },
        { interval: 'yearly', price: 99.99, currency: 'USD', savingsPercent: 16 }
      ],
      trialDays: 7,
      maxDevices: 2,
      includedGames: [],
      benefits: [
        { type: 'cloud_saves', description: 'Automatic cloud save sync' },
        { type: 'multiplayer', description: 'Online multiplayer access' },
        { type: 'free_games', description: '1 free game per month' }
      ]
    });

    // Standard Plan
    this.createPlan({
      name: 'Standard',
      tier: 'standard',
      description: 'Enhanced gaming experience',
      features: ['Everything in Basic', '3 free games/month', '10% store discount', 'Priority matchmaking'],
      pricing: [
        { interval: 'monthly', price: 14.99, currency: 'USD' },
        { interval: 'quarterly', price: 39.99, currency: 'USD', savingsPercent: 11 },
        { interval: 'yearly', price: 149.99, currency: 'USD', savingsPercent: 16 }
      ],
      trialDays: 14,
      maxDevices: 3,
      includedGames: [],
      benefits: [
        { type: 'cloud_saves', description: 'Unlimited cloud saves' },
        { type: 'multiplayer', description: 'Full online multiplayer' },
        { type: 'free_games', description: '3 free games per month' },
        { type: 'discounts', description: '10% off all purchases', value: '10%' }
      ]
    });

    // Premium Plan
    this.createPlan({
      name: 'Premium',
      tier: 'premium',
      description: 'Premium gaming features',
      features: ['Everything in Standard', '5 free games/month', '20% store discount', 'Early access', 'Exclusive content'],
      pricing: [
        { interval: 'monthly', price: 19.99, currency: 'USD' },
        { interval: 'quarterly', price: 54.99, currency: 'USD', savingsPercent: 8 },
        { interval: 'yearly', price: 199.99, currency: 'USD', savingsPercent: 16 }
      ],
      trialDays: 30,
      maxDevices: 5,
      includedGames: [],
      benefits: [
        { type: 'cloud_saves', description: 'Unlimited cloud saves with priority sync' },
        { type: 'multiplayer', description: 'Priority multiplayer access' },
        { type: 'free_games', description: '5 free games per month' },
        { type: 'discounts', description: '20% off all purchases', value: '20%' },
        { type: 'early_access', description: 'Early access to new releases' },
        { type: 'exclusive_content', description: 'Exclusive in-game content' }
      ]
    });

    // Ultimate Plan
    this.createPlan({
      name: 'Ultimate',
      tier: 'ultimate',
      description: 'Complete gaming package',
      features: ['Everything in Premium', 'Unlimited game library', '30% store discount', 'Cloud gaming', 'Family sharing'],
      pricing: [
        { interval: 'monthly', price: 29.99, currency: 'USD' },
        { interval: 'quarterly', price: 79.99, currency: 'USD', savingsPercent: 11 },
        { interval: 'yearly', price: 299.99, currency: 'USD', savingsPercent: 16 },
        { interval: 'lifetime', price: 999.99, currency: 'USD' }
      ],
      trialDays: 30,
      maxDevices: 10,
      includedGames: [],
      benefits: [
        { type: 'cloud_saves', description: 'Unlimited cloud saves with instant sync' },
        { type: 'multiplayer', description: 'VIP multiplayer with dedicated servers' },
        { type: 'free_games', description: 'Access to entire game library' },
        { type: 'discounts', description: '30% off all purchases', value: '30%' },
        { type: 'early_access', description: 'Early access to all releases' },
        { type: 'exclusive_content', description: 'All exclusive content included' }
      ]
    });
  }

  /**
   * Create subscription plan
   */
  private createPlan(
    plan: Omit<SubscriptionPlan, 'id' | 'discounts' | 'isActive' | 'createdAt'>
  ): SubscriptionPlan {
    const id = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const fullPlan: SubscriptionPlan = {
      id,
      ...plan,
      discounts: [],
      isActive: true,
      createdAt: new Date()
    };

    this.plans.set(id, fullPlan);

    return fullPlan;
  }

  /**
   * Subscribe user to plan
   */
  async subscribe(
    userId: string,
    planId: string,
    interval: BillingInterval,
    paymentMethod: string,
    startTrial: boolean = true
  ): Promise<Subscription> {
    const plan = this.plans.get(planId);

    if (!plan) {
      throw new Error('Plan not found');
    }

    if (!plan.isActive) {
      throw new Error('Plan is not active');
    }

    const pricing = plan.pricing.find(p => p.interval === interval);

    if (!pricing) {
      throw new Error(`Pricing not available for ${interval} interval`);
    }

    const now = new Date();
    const trialEnd = startTrial && plan.trialDays > 0
      ? new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000)
      : undefined;

    const periodEnd = new Date(now);
    this.addBillingPeriod(periodEnd, interval);

    const subscription: Subscription = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      planId,
      tier: plan.tier,
      status: trialEnd ? 'trial' : 'active',
      interval,
      price: pricing.price,
      currency: pricing.currency,
      startDate: now,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      trialEnd,
      autoRenew: true,
      paymentMethod,
      devices: [],
      usageMetrics: {
        gamesPlayed: 0,
        totalPlaytime: 0,
        cloudSavesUsed: 0,
        downloadsThisMonth: 0,
        streamingHours: 0,
        multiplayerSessions: 0
      },
      billingHistory: [],
      metadata: {}
    };

    this.subscriptions.set(subscription.id, subscription);

    this.emit('subscribed', subscription);

    return subscription;
  }

  /**
   * Add billing period to date
   */
  private addBillingPeriod(date: Date, interval: BillingInterval): void {
    switch (interval) {
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'quarterly':
        date.setMonth(date.getMonth() + 3);
        break;
      case 'yearly':
        date.setFullYear(date.getFullYear() + 1);
        break;
      case 'lifetime':
        date.setFullYear(date.getFullYear() + 100);
        break;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    immediate: boolean = false,
    reason?: string
  ): Promise<Subscription> {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (subscription.status === 'cancelled' || subscription.status === 'expired') {
      throw new Error('Subscription already cancelled or expired');
    }

    subscription.cancelledAt = new Date();
    subscription.metadata.cancellationReason = reason;

    if (immediate) {
      subscription.status = 'cancelled';
      subscription.cancelAt = new Date();
    } else {
      // Cancel at end of current period
      subscription.cancelAt = subscription.currentPeriodEnd;
    }

    const change: SubscriptionChange = {
      id: `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      subscriptionId,
      changeType: 'cancel',
      effectiveDate: subscription.cancelAt,
      proration: 0,
      requestedAt: new Date(),
      processed: immediate
    };

    this.changes.set(change.id, change);

    this.emit('subscriptionCancelled', { subscription, immediate });

    return subscription;
  }

  /**
   * Pause subscription
   */
  async pauseSubscription(
    subscriptionId: string,
    resumeDate?: Date
  ): Promise<Subscription> {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (subscription.status !== 'active') {
      throw new Error('Only active subscriptions can be paused');
    }

    subscription.status = 'paused';
    subscription.pausedAt = new Date();
    subscription.resumeAt = resumeDate;
    subscription.autoRenew = false;

    this.emit('subscriptionPaused', subscription);

    return subscription;
  }

  /**
   * Resume subscription
   */
  async resumeSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (subscription.status !== 'paused') {
      throw new Error('Only paused subscriptions can be resumed');
    }

    subscription.status = 'active';
    subscription.resumeAt = undefined;
    subscription.autoRenew = true;

    this.emit('subscriptionResumed', subscription);

    return subscription;
  }

  /**
   * Upgrade/downgrade subscription
   */
  async changeSubscriptionPlan(
    subscriptionId: string,
    newPlanId: string,
    immediate: boolean = true
  ): Promise<Subscription> {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const newPlan = this.plans.get(newPlanId);

    if (!newPlan) {
      throw new Error('New plan not found');
    }

    const oldPlan = this.plans.get(subscription.planId);
    const isUpgrade = this.getTierLevel(newPlan.tier) > this.getTierLevel(subscription.tier);

    const newPricing = newPlan.pricing.find(p => p.interval === subscription.interval);

    if (!newPricing) {
      throw new Error('New plan does not support current billing interval');
    }

    // Calculate proration
    const daysRemaining = Math.ceil(
      (subscription.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    const totalDays = Math.ceil(
      (subscription.currentPeriodEnd.getTime() - subscription.currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const unusedCredit = (subscription.price * daysRemaining) / totalDays;
    const proration = newPricing.price - unusedCredit;

    const change: SubscriptionChange = {
      id: `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      subscriptionId,
      changeType: isUpgrade ? 'upgrade' : 'downgrade',
      fromPlan: subscription.planId,
      toPlan: newPlanId,
      effectiveDate: immediate ? new Date() : subscription.currentPeriodEnd,
      proration,
      requestedAt: new Date(),
      processed: false
    };

    this.changes.set(change.id, change);

    if (immediate) {
      subscription.planId = newPlanId;
      subscription.tier = newPlan.tier;
      subscription.price = newPricing.price;
      change.processed = true;

      this.emit('subscriptionChanged', { subscription, change, isUpgrade });
    }

    return subscription;
  }

  /**
   * Get tier level for comparison
   */
  private getTierLevel(tier: SubscriptionTier): number {
    const levels = { basic: 1, standard: 2, premium: 3, ultimate: 4 };
    return levels[tier];
  }

  /**
   * Add device to subscription
   */
  async addDevice(
    subscriptionId: string,
    deviceId: string,
    deviceName: string,
    platform: string
  ): Promise<Subscription> {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const plan = this.plans.get(subscription.planId);

    if (!plan) {
      throw new Error('Plan not found');
    }

    if (subscription.devices.length >= plan.maxDevices) {
      throw new Error(`Maximum device limit (${plan.maxDevices}) reached`);
    }

    // Check if device already added
    const existing = subscription.devices.find(d => d.deviceId === deviceId);

    if (existing) {
      existing.lastUsed = new Date();
      existing.isActive = true;
      return subscription;
    }

    const device: SubscriptionDevice = {
      deviceId,
      deviceName,
      platform,
      activatedAt: new Date(),
      lastUsed: new Date(),
      isActive: true
    };

    subscription.devices.push(device);

    this.emit('deviceAdded', { subscription, device });

    return subscription;
  }

  /**
   * Remove device from subscription
   */
  async removeDevice(
    subscriptionId: string,
    deviceId: string
  ): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const index = subscription.devices.findIndex(d => d.deviceId === deviceId);

    if (index === -1) {
      throw new Error('Device not found');
    }

    subscription.devices.splice(index, 1);

    this.emit('deviceRemoved', { subscriptionId, deviceId });
  }

  /**
   * Process billing
   */
  private async processBilling(subscriptionId: string): Promise<BillingRecord> {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const billingRecord: BillingRecord = {
      id: `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      subscriptionId,
      amount: subscription.price,
      currency: subscription.currency,
      status: 'pending',
      billingDate: new Date()
    };

    try {
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      billingRecord.status = 'succeeded';
      billingRecord.paidAt = new Date();
      billingRecord.receiptUrl = `https://platform.com/receipts/${billingRecord.id}`;

      // Update subscription period
      subscription.currentPeriodStart = subscription.currentPeriodEnd;
      subscription.currentPeriodEnd = new Date(subscription.currentPeriodEnd);
      this.addBillingPeriod(subscription.currentPeriodEnd, subscription.interval);

      // Reset trial status
      if (subscription.status === 'trial') {
        subscription.status = 'active';
      }

      this.emit('billingSucceeded', { subscription, billingRecord });
    } catch (error) {
      billingRecord.status = 'failed';
      billingRecord.failureReason = String(error);
      subscription.status = 'past_due';

      this.emit('billingFailed', { subscription, billingRecord, error });
    }

    subscription.billingHistory.push(billingRecord);

    return billingRecord;
  }

  /**
   * Create family plan
   */
  async createFamilyPlan(
    ownerId: string,
    planId: string,
    maxMembers: number = 6
  ): Promise<FamilyPlan> {
    const plan = this.plans.get(planId);

    if (!plan) {
      throw new Error('Plan not found');
    }

    const id = `family_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const familyPlan: FamilyPlan = {
      id,
      ownerId,
      planId,
      maxMembers,
      members: [{
        userId: ownerId,
        role: 'owner',
        joinedAt: new Date(),
        permissions: ['manage_members', 'manage_billing', 'view_usage']
      }],
      sharedBenefits: plan.benefits.map(b => b.type),
      createdAt: new Date()
    };

    this.familyPlans.set(id, familyPlan);

    this.emit('familyPlanCreated', familyPlan);

    return familyPlan;
  }

  /**
   * Add family member
   */
  async addFamilyMember(
    familyPlanId: string,
    userId: string,
    role: 'admin' | 'member' = 'member'
  ): Promise<FamilyPlan> {
    const familyPlan = this.familyPlans.get(familyPlanId);

    if (!familyPlan) {
      throw new Error('Family plan not found');
    }

    if (familyPlan.members.length >= familyPlan.maxMembers) {
      throw new Error(`Maximum members (${familyPlan.maxMembers}) reached`);
    }

    const member: FamilyMember = {
      userId,
      role,
      joinedAt: new Date(),
      permissions: role === 'admin' ? ['manage_members', 'view_usage'] : ['view_usage']
    };

    familyPlan.members.push(member);

    this.emit('familyMemberAdded', { familyPlan, member });

    return familyPlan;
  }

  /**
   * Gift subscription
   */
  async giftSubscription(
    giftedBy: string,
    giftedTo: string,
    planId: string,
    duration: number,
    message?: string
  ): Promise<GiftSubscription> {
    const plan = this.plans.get(planId);

    if (!plan) {
      throw new Error('Plan not found');
    }

    const id = `gift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + duration + 3); // 3 months to claim

    const gift: GiftSubscription = {
      id,
      giftedBy,
      giftedTo,
      planId,
      duration,
      message,
      status: 'pending',
      createdAt: new Date(),
      expiresAt
    };

    this.gifts.set(id, gift);

    this.emit('subscriptionGifted', gift);

    return gift;
  }

  /**
   * Claim gift subscription
   */
  async claimGift(giftId: string, userId: string): Promise<Subscription> {
    const gift = this.gifts.get(giftId);

    if (!gift) {
      throw new Error('Gift not found');
    }

    if (gift.giftedTo !== userId) {
      throw new Error('Gift not intended for this user');
    }

    if (gift.status !== 'pending') {
      throw new Error('Gift already claimed or expired');
    }

    if (gift.expiresAt < new Date()) {
      gift.status = 'expired';
      throw new Error('Gift has expired');
    }

    // Create subscription
    const subscription = await this.subscribe(
      userId,
      gift.planId,
      'monthly',
      'gift',
      false
    );

    // Extend subscription for gift duration
    subscription.currentPeriodEnd = new Date();
    subscription.currentPeriodEnd.setMonth(
      subscription.currentPeriodEnd.getMonth() + gift.duration
    );

    gift.status = 'claimed';
    gift.claimedAt = new Date();

    this.emit('giftClaimed', { gift, subscription });

    return subscription;
  }

  /**
   * Start billing scheduler
   */
  private startBillingScheduler(): void {
    // Check for due subscriptions every hour
    setInterval(async () => {
      const now = new Date();

      for (const [, subscription] of this.subscriptions) {
        // Skip if not auto-renewing
        if (!subscription.autoRenew) continue;

        // Skip if cancelled
        if (subscription.status === 'cancelled' || subscription.status === 'expired') continue;

        // Check if billing is due
        if (subscription.currentPeriodEnd <= now) {
          await this.processBilling(subscription.id);
        }

        // Handle trial expiration
        if (subscription.trialEnd && subscription.trialEnd <= now && subscription.status === 'trial') {
          await this.processBilling(subscription.id);
        }

        // Handle scheduled cancellation
        if (subscription.cancelAt && subscription.cancelAt <= now) {
          subscription.status = 'cancelled';
          this.emit('subscriptionExpired', subscription);
        }

        // Handle scheduled resume
        if (subscription.resumeAt && subscription.resumeAt <= now && subscription.status === 'paused') {
          await this.resumeSubscription(subscription.id);
        }
      }
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Get subscription statistics
   */
  async getStats(): Promise<any> {
    const allSubs = Array.from(this.subscriptions.values());

    const activeSubscriptions = allSubs.filter(s => s.status === 'active').length;
    const trialSubscriptions = allSubs.filter(s => s.status === 'trial').length;
    const cancelledSubscriptions = allSubs.filter(s => s.status === 'cancelled').length;

    const monthlyRevenue = allSubs
      .filter(s => s.status === 'active' && s.interval === 'monthly')
      .reduce((sum, s) => sum + s.price, 0);

    const totalRevenue = allSubs
      .filter(s => s.status === 'active')
      .reduce((sum, s) => sum + s.price, 0);

    return {
      totalPlans: this.plans.size,
      totalSubscriptions: allSubs.length,
      activeSubscriptions,
      trialSubscriptions,
      cancelledSubscriptions,
      monthlyRecurringRevenue: monthlyRevenue,
      annualizedRevenue: totalRevenue * 12,
      averageSubscriptionValue: totalRevenue / allSubs.length || 0,
      churnRate: (cancelledSubscriptions / allSubs.length) * 100 || 0,
      totalFamilyPlans: this.familyPlans.size,
      totalGifts: this.gifts.size
    };
  }
}
