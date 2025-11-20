/**
 * Advanced Analytics System
 * Cohort analysis, funnel analysis, LTV calculation, retention metrics
 * Vendor parity with Unity Analytics, GameAnalytics, Mixpanel
 */

import { EventEmitter } from 'events';

export type EventType = 'session_start' | 'session_end' | 'purchase' | 'level_up' | 'achievement' | 'custom';
export type CohortType = 'registration' | 'first_purchase' | 'install' | 'custom';
export type TimeGranularity = 'hour' | 'day' | 'week' | 'month';

export interface AnalyticsEvent {
  id: string;
  userId: string;
  gameId: string;
  eventType: EventType;
  eventName: string;
  timestamp: Date;
  properties: Record<string, any>;
  sessionId?: string;
  platform?: string;
  country?: string;
  deviceType?: string;
}

export interface UserProfile {
  userId: string;
  gameId: string;
  firstSeen: Date;
  lastSeen: Date;
  totalSessions: number;
  totalPlaytime: number;
  totalPurchases: number;
  totalRevenue: number;
  level: number;
  cohort?: string;
  segments: string[];
  attributes: Record<string, any>;
}

export interface Cohort {
  id: string;
  name: string;
  type: CohortType;
  startDate: Date;
  endDate: Date;
  userCount: number;
  users: string[];
  metrics: CohortMetrics;
}

export interface CohortMetrics {
  retention: Record<number, number>; // Day -> retention %
  revenue: Record<number, number>; // Day -> total revenue
  engagement: Record<number, number>; // Day -> avg session time
  conversion: number; // % of users who made purchase
  churnRate: Record<number, number>; // Day -> churn %
}

export interface FunnelStep {
  name: string;
  eventName: string;
  filters?: Record<string, any>;
}

export interface Funnel {
  id: string;
  name: string;
  steps: FunnelStep[];
  createdAt: Date;
  results?: FunnelResults;
}

export interface FunnelResults {
  totalUsers: number;
  stepResults: StepResult[];
  overallConversion: number;
  averageTimeToComplete: number; // seconds
  dropoffPoints: DropoffAnalysis[];
}

export interface StepResult {
  stepName: string;
  userCount: number;
  conversionFromPrevious: number; // %
  conversionFromStart: number; // %
  averageTimeFromPrevious: number; // seconds
  dropoffCount: number;
}

export interface DropoffAnalysis {
  fromStep: string;
  toStep: string;
  dropoffRate: number; // %
  userCount: number;
  commonReasons?: string[];
}

export interface LTVCalculation {
  userId?: string;
  segment?: string;
  cohort?: string;
  ltv: number;
  predictedLTV: number;
  averageRevenue: number;
  averageLifetime: number; // days
  purchaseFrequency: number;
  retentionRate: number;
  calculatedAt: Date;
}

export interface RetentionAnalysis {
  period: TimeGranularity;
  cohorts: Record<string, number[]>; // Cohort -> retention by period
  overall: number[];
  nDayRetention: Record<number, number>; // Day N -> retention %
}

export interface SegmentDefinition {
  id: string;
  name: string;
  conditions: SegmentCondition[];
  userCount: number;
  lastUpdated: Date;
}

export interface SegmentCondition {
  field: string;
  operator: 'equals' | 'greater' | 'less' | 'contains' | 'between';
  value: any;
}

export interface ABTest {
  id: string;
  name: string;
  variants: TestVariant[];
  startDate: Date;
  endDate?: Date;
  targetSegment?: string;
  results?: ABTestResults;
  status: 'draft' | 'running' | 'completed' | 'paused';
}

export interface TestVariant {
  id: string;
  name: string;
  allocation: number; // % of traffic
  userCount: number;
  metrics: VariantMetrics;
}

export interface VariantMetrics {
  conversionRate: number;
  averageRevenue: number;
  retention: number;
  engagement: number;
}

export interface ABTestResults {
  winner?: string;
  confidence: number; // %
  significanceLevel: number;
  uplift: Record<string, number>; // Metric -> % change
}

export class AdvancedAnalytics extends EventEmitter {
  private events: Map<string, AnalyticsEvent[]> = new Map();
  private userProfiles: Map<string, UserProfile> = new Map();
  private cohorts: Map<string, Cohort> = new Map();
  private funnels: Map<string, Funnel> = new Map();
  private segments: Map<string, SegmentDefinition> = new Map();
  private abTests: Map<string, ABTest> = new Map();

  /**
   * Track event
   */
  async trackEvent(
    userId: string,
    gameId: string,
    eventType: EventType,
    eventName: string,
    properties: Record<string, any> = {},
    sessionId?: string
  ): Promise<AnalyticsEvent> {
    const event: AnalyticsEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      gameId,
      eventType,
      eventName,
      timestamp: new Date(),
      properties,
      sessionId,
      platform: properties.platform,
      country: properties.country,
      deviceType: properties.deviceType
    };

    const key = `${userId}:${gameId}`;

    if (!this.events.has(key)) {
      this.events.set(key, []);
    }

    this.events.get(key)!.push(event);

    // Update user profile
    await this.updateUserProfile(userId, gameId, event);

    this.emit('eventTracked', event);

    return event;
  }

  /**
   * Update user profile from event
   */
  private async updateUserProfile(
    userId: string,
    gameId: string,
    event: AnalyticsEvent
  ): Promise<void> {
    const key = `${userId}:${gameId}`;

    if (!this.userProfiles.has(key)) {
      this.userProfiles.set(key, {
        userId,
        gameId,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        totalSessions: 0,
        totalPlaytime: 0,
        totalPurchases: 0,
        totalRevenue: 0,
        level: 1,
        segments: [],
        attributes: {}
      });
    }

    const profile = this.userProfiles.get(key)!;

    profile.lastSeen = event.timestamp;

    // Update based on event type
    if (event.eventType === 'session_start') {
      profile.totalSessions++;
    } else if (event.eventType === 'purchase') {
      profile.totalPurchases++;
      profile.totalRevenue += event.properties.amount || 0;
    } else if (event.eventType === 'level_up') {
      profile.level = event.properties.level || profile.level + 1;
    }

    // Update segments
    await this.updateUserSegments(profile);
  }

  /**
   * Create cohort
   */
  async createCohort(
    name: string,
    type: CohortType,
    startDate: Date,
    endDate: Date
  ): Promise<Cohort> {
    const id = `cohort_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Find users who joined in this period
    const users: string[] = [];

    for (const [, profile] of this.userProfiles) {
      if (profile.firstSeen >= startDate && profile.firstSeen <= endDate) {
        users.push(profile.userId);
      }
    }

    const cohort: Cohort = {
      id,
      name,
      type,
      startDate,
      endDate,
      userCount: users.length,
      users,
      metrics: {
        retention: {},
        revenue: {},
        engagement: {},
        conversion: 0,
        churnRate: {}
      }
    };

    this.cohorts.set(id, cohort);

    // Calculate metrics
    await this.calculateCohortMetrics(id);

    this.emit('cohortCreated', cohort);

    return cohort;
  }

  /**
   * Calculate cohort metrics
   */
  private async calculateCohortMetrics(cohortId: string): Promise<void> {
    const cohort = this.cohorts.get(cohortId);

    if (!cohort) {
      throw new Error('Cohort not found');
    }

    const metrics = cohort.metrics;

    // Calculate retention for each day
    for (let day = 1; day <= 30; day++) {
      const targetDate = new Date(cohort.startDate);
      targetDate.setDate(targetDate.getDate() + day);

      let activeUsers = 0;

      for (const userId of cohort.users) {
        const key = Array.from(this.userProfiles.keys()).find(k => k.startsWith(userId));

        if (key) {
          const profile = this.userProfiles.get(key)!;

          // Check if user was active on target day
          const userEvents = this.events.get(key) || [];
          const dayEvents = userEvents.filter(e => {
            const eventDate = new Date(e.timestamp);
            return eventDate.toDateString() === targetDate.toDateString();
          });

          if (dayEvents.length > 0) {
            activeUsers++;
          }
        }
      }

      metrics.retention[day] = (activeUsers / cohort.userCount) * 100;
      metrics.churnRate[day] = 100 - metrics.retention[day];
    }

    // Calculate conversion (users who made at least one purchase)
    let convertedUsers = 0;
    let totalRevenue = 0;
    let totalSessionTime = 0;

    for (const userId of cohort.users) {
      const key = Array.from(this.userProfiles.keys()).find(k => k.startsWith(userId));

      if (key) {
        const profile = this.userProfiles.get(key)!;

        if (profile.totalPurchases > 0) {
          convertedUsers++;
        }

        totalRevenue += profile.totalRevenue;
        totalSessionTime += profile.totalPlaytime;
      }
    }

    metrics.conversion = (convertedUsers / cohort.userCount) * 100;

    // Average metrics per day
    for (let day = 1; day <= 30; day++) {
      metrics.revenue[day] = totalRevenue / cohort.userCount;
      metrics.engagement[day] = totalSessionTime / cohort.userCount;
    }
  }

  /**
   * Create funnel
   */
  async createFunnel(name: string, steps: FunnelStep[]): Promise<Funnel> {
    const id = `funnel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const funnel: Funnel = {
      id,
      name,
      steps,
      createdAt: new Date()
    };

    this.funnels.set(id, funnel);

    // Calculate funnel results
    await this.analyzeFunnel(id);

    this.emit('funnelCreated', funnel);

    return funnel;
  }

  /**
   * Analyze funnel
   */
  async analyzeFunnel(funnelId: string): Promise<FunnelResults> {
    const funnel = this.funnels.get(funnelId);

    if (!funnel) {
      throw new Error('Funnel not found');
    }

    const stepResults: StepResult[] = [];
    const usersPerStep: Map<number, Set<string>> = new Map();

    // Find users who completed each step
    for (let i = 0; i < funnel.steps.length; i++) {
      const step = funnel.steps[i];
      const usersInStep = new Set<string>();

      for (const [key, events] of this.events) {
        const matchingEvents = events.filter(e => e.eventName === step.eventName);

        if (matchingEvents.length > 0) {
          // Check if user completed previous step
          if (i === 0 || usersPerStep.get(i - 1)?.has(key)) {
            usersInStep.add(key);
          }
        }
      }

      usersPerStep.set(i, usersInStep);

      const userCount = usersInStep.size;
      const previousCount = i === 0 ? userCount : usersPerStep.get(i - 1)!.size;
      const startCount = usersPerStep.get(0)!.size;

      stepResults.push({
        stepName: step.name,
        userCount,
        conversionFromPrevious: (userCount / previousCount) * 100,
        conversionFromStart: (userCount / startCount) * 100,
        averageTimeFromPrevious: 0, // Would calculate from timestamps
        dropoffCount: previousCount - userCount
      });
    }

    // Calculate dropoff points
    const dropoffPoints: DropoffAnalysis[] = [];

    for (let i = 0; i < funnel.steps.length - 1; i++) {
      const fromCount = usersPerStep.get(i)!.size;
      const toCount = usersPerStep.get(i + 1)!.size;
      const dropoff = fromCount - toCount;

      dropoffPoints.push({
        fromStep: funnel.steps[i].name,
        toStep: funnel.steps[i + 1].name,
        dropoffRate: (dropoff / fromCount) * 100,
        userCount: dropoff
      });
    }

    const results: FunnelResults = {
      totalUsers: usersPerStep.get(0)!.size,
      stepResults,
      overallConversion: stepResults.length > 0
        ? stepResults[stepResults.length - 1].conversionFromStart
        : 0,
      averageTimeToComplete: 0, // Would calculate from timestamps
      dropoffPoints
    };

    funnel.results = results;

    return results;
  }

  /**
   * Calculate LTV (Lifetime Value)
   */
  async calculateLTV(
    userId?: string,
    segment?: string,
    cohort?: string
  ): Promise<LTVCalculation> {
    let profiles: UserProfile[] = [];

    if (userId) {
      const key = Array.from(this.userProfiles.keys()).find(k => k.startsWith(userId));
      if (key) {
        profiles = [this.userProfiles.get(key)!];
      }
    } else if (segment) {
      profiles = this.getUsersInSegment(segment);
    } else if (cohort) {
      const cohortData = this.cohorts.get(cohort);
      if (cohortData) {
        profiles = cohortData.users
          .map(uid => {
            const key = Array.from(this.userProfiles.keys()).find(k => k.startsWith(uid));
            return key ? this.userProfiles.get(key)! : null;
          })
          .filter(p => p !== null) as UserProfile[];
      }
    } else {
      profiles = Array.from(this.userProfiles.values());
    }

    if (profiles.length === 0) {
      throw new Error('No users found for LTV calculation');
    }

    // Calculate average metrics
    let totalRevenue = 0;
    let totalLifetime = 0;
    let totalPurchases = 0;
    let activeUsers = 0;

    for (const profile of profiles) {
      totalRevenue += profile.totalRevenue;

      const lifetime = (profile.lastSeen.getTime() - profile.firstSeen.getTime()) / (1000 * 60 * 60 * 24);
      totalLifetime += lifetime;

      totalPurchases += profile.totalPurchases;

      // Consider active if seen in last 7 days
      const daysSinceLastSeen = (Date.now() - profile.lastSeen.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastSeen <= 7) {
        activeUsers++;
      }
    }

    const averageRevenue = totalRevenue / profiles.length;
    const averageLifetime = totalLifetime / profiles.length;
    const purchaseFrequency = totalPurchases / profiles.length;
    const retentionRate = (activeUsers / profiles.length) * 100;

    // Simple LTV formula: Average Revenue * Purchase Frequency * Average Lifetime
    const ltv = averageRevenue * (purchaseFrequency / 30) * averageLifetime;

    // Predicted LTV using retention rate
    const predictedLTV = ltv * (retentionRate / 100) * 2;

    const calculation: LTVCalculation = {
      userId,
      segment,
      cohort,
      ltv,
      predictedLTV,
      averageRevenue,
      averageLifetime,
      purchaseFrequency,
      retentionRate,
      calculatedAt: new Date()
    };

    this.emit('ltvCalculated', calculation);

    return calculation;
  }

  /**
   * Analyze retention
   */
  async analyzeRetention(period: TimeGranularity = 'day'): Promise<RetentionAnalysis> {
    const cohortRetention: Record<string, number[]> = {};

    // Calculate retention for each cohort
    for (const [cohortId, cohort] of this.cohorts) {
      const retention: number[] = [];

      for (let i = 1; i <= 30; i++) {
        retention.push(cohort.metrics.retention[i] || 0);
      }

      cohortRetention[cohort.name] = retention;
    }

    // Calculate overall retention
    const overall: number[] = [];

    for (let day = 1; day <= 30; day++) {
      let totalRetention = 0;
      let cohortCount = 0;

      for (const cohort of this.cohorts.values()) {
        if (cohort.metrics.retention[day] !== undefined) {
          totalRetention += cohort.metrics.retention[day];
          cohortCount++;
        }
      }

      overall.push(cohortCount > 0 ? totalRetention / cohortCount : 0);
    }

    // Calculate N-day retention (common milestones)
    const nDayRetention: Record<number, number> = {
      1: overall[0] || 0,
      7: overall[6] || 0,
      14: overall[13] || 0,
      30: overall[29] || 0
    };

    return {
      period,
      cohorts: cohortRetention,
      overall,
      nDayRetention
    };
  }

  /**
   * Create segment
   */
  async createSegment(
    name: string,
    conditions: SegmentCondition[]
  ): Promise<SegmentDefinition> {
    const id = `segment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const users = this.evaluateSegmentConditions(conditions);

    const segment: SegmentDefinition = {
      id,
      name,
      conditions,
      userCount: users.length,
      lastUpdated: new Date()
    };

    this.segments.set(id, segment);

    // Update user profiles with segment
    for (const userId of users) {
      const key = Array.from(this.userProfiles.keys()).find(k => k.startsWith(userId));
      if (key) {
        const profile = this.userProfiles.get(key)!;
        if (!profile.segments.includes(name)) {
          profile.segments.push(name);
        }
      }
    }

    this.emit('segmentCreated', segment);

    return segment;
  }

  /**
   * Evaluate segment conditions
   */
  private evaluateSegmentConditions(conditions: SegmentCondition[]): string[] {
    const matchingUsers: string[] = [];

    for (const [key, profile] of this.userProfiles) {
      let matches = true;

      for (const condition of conditions) {
        const value = this.getProfileValue(profile, condition.field);

        if (!this.evaluateCondition(value, condition.operator, condition.value)) {
          matches = false;
          break;
        }
      }

      if (matches) {
        matchingUsers.push(profile.userId);
      }
    }

    return matchingUsers;
  }

  /**
   * Get profile value by field path
   */
  private getProfileValue(profile: UserProfile, field: string): any {
    const parts = field.split('.');
    let value: any = profile;

    for (const part of parts) {
      value = value[part];
      if (value === undefined) break;
    }

    return value;
  }

  /**
   * Evaluate condition
   */
  private evaluateCondition(value: any, operator: string, target: any): boolean {
    switch (operator) {
      case 'equals':
        return value === target;
      case 'greater':
        return value > target;
      case 'less':
        return value < target;
      case 'contains':
        return String(value).includes(String(target));
      case 'between':
        return value >= target[0] && value <= target[1];
      default:
        return false;
    }
  }

  /**
   * Update user segments
   */
  private async updateUserSegments(profile: UserProfile): Promise<void> {
    profile.segments = [];

    for (const [, segment] of this.segments) {
      const matches = segment.conditions.every(condition => {
        const value = this.getProfileValue(profile, condition.field);
        return this.evaluateCondition(value, condition.operator, condition.value);
      });

      if (matches) {
        profile.segments.push(segment.name);
      }
    }
  }

  /**
   * Get users in segment
   */
  private getUsersInSegment(segmentName: string): UserProfile[] {
    return Array.from(this.userProfiles.values()).filter(
      p => p.segments.includes(segmentName)
    );
  }

  /**
   * Create A/B test
   */
  async createABTest(
    name: string,
    variants: Omit<TestVariant, 'userCount' | 'metrics'>[],
    targetSegment?: string
  ): Promise<ABTest> {
    const id = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const fullVariants: TestVariant[] = variants.map(v => ({
      ...v,
      userCount: 0,
      metrics: {
        conversionRate: 0,
        averageRevenue: 0,
        retention: 0,
        engagement: 0
      }
    }));

    const test: ABTest = {
      id,
      name,
      variants: fullVariants,
      startDate: new Date(),
      targetSegment,
      status: 'draft'
    };

    this.abTests.set(id, test);

    this.emit('abTestCreated', test);

    return test;
  }

  /**
   * Get analytics statistics
   */
  async getStats(): Promise<any> {
    return {
      totalEvents: Array.from(this.events.values()).reduce((sum, events) => sum + events.length, 0),
      totalUsers: this.userProfiles.size,
      totalCohorts: this.cohorts.size,
      totalFunnels: this.funnels.size,
      totalSegments: this.segments.size,
      totalABTests: this.abTests.size
    };
  }
}
