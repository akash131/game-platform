import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

/**
 * Analytics Dashboard - Real-time game analytics and business intelligence
 * Similar to Unity Analytics, GameAnalytics, Amplitude
 */

export interface AnalyticsEvent {
  eventId: string;
  eventName: string;
  userId?: string;
  sessionId?: string;
  timestamp: Date;
  properties: Record<string, any>;
  platform?: string;
  appVersion?: string;
  country?: string;
}

export interface UserMetrics {
  userId: string;
  firstSeen: Date;
  lastSeen: Date;
  totalSessions: number;
  totalPlaytime: number; // milliseconds
  avgSessionDuration: number;
  retention: {
    day1: boolean;
    day7: boolean;
    day30: boolean;
  };
  ltv: number; // Lifetime value
  level: number;
  achievements: number;
}

export interface GameMetrics {
  gameId: string;
  timestamp: Date;
  dau: number; // Daily active users
  mau: number; // Monthly active users
  newUsers: number;
  returningUsers: number;
  avgSessionDuration: number;
  totalRevenue: number;
  arpu: number; // Average revenue per user
  arppu: number; // Average revenue per paying user
  conversionRate: number;
  retentionRate: {
    day1: number;
    day7: number;
    day30: number;
  };
  churnRate: number;
}

export interface Funnel {
  funnelId: string;
  name: string;
  steps: FunnelStep[];
  created: Date;
}

export interface FunnelStep {
  stepName: string;
  eventName: string;
  order: number;
  completed: number;
  dropoff: number;
  conversionRate: number;
}

export interface Cohort {
  cohortId: string;
  name: string;
  startDate: Date;
  endDate?: Date;
  userCount: number;
  criteria: CohortCriteria[];
  metrics: CohortMetrics;
}

export interface CohortCriteria {
  type: 'event' | 'property' | 'metric';
  field: string;
  operator: 'equals' | 'greater' | 'less' | 'contains';
  value: any;
}

export interface CohortMetrics {
  avgLifetime: number;
  avgRevenue: number;
  retentionByDay: Map<number, number>; // day -> retention %
  churnByDay: Map<number, number>;
}

export interface Dashboard {
  dashboardId: string;
  name: string;
  widgets: DashboardWidget[];
  filters: DashboardFilter[];
  refreshInterval?: number; // seconds
}

export interface DashboardWidget {
  widgetId: string;
  type: 'line_chart' | 'bar_chart' | 'pie_chart' | 'metric' | 'table' | 'heatmap';
  title: string;
  metric: string;
  dimensions?: string[];
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  timeRange?: TimeRange;
  filters?: Record<string, any>;
}

export interface DashboardFilter {
  field: string;
  operator: 'equals' | 'in' | 'between' | 'greater' | 'less';
  value: any;
}

export interface TimeRange {
  start: Date;
  end: Date;
  granularity: 'minute' | 'hour' | 'day' | 'week' | 'month';
}

export interface RealtimeMetrics {
  timestamp: Date;
  concurrent: {
    players: number;
    sessions: number;
    matches: number;
  };
  performance: {
    avgFps: number;
    avgLatency: number;
    errorRate: number;
  };
  business: {
    purchasesPerMinute: number;
    revenuePerMinute: number;
  };
}

export interface AnalyticsQuery {
  metric: string;
  dimensions?: string[];
  filters?: Record<string, any>;
  timeRange: TimeRange;
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  groupBy?: string[];
}

export interface AnalyticsEvents {
  'eventTracked': (event: AnalyticsEvent) => void;
  'dashboardUpdated': (dashboardId: string) => void;
  'alertTriggered': (alert: AnalyticsAlert) => void;
  'cohortCreated': (cohort: Cohort) => void;
}

export interface AnalyticsAlert {
  alertId: string;
  name: string;
  condition: string;
  threshold: number;
  currentValue: number;
  triggered: Date;
}

export class AnalyticsDashboard extends EventEmitter<AnalyticsEvents> {
  private events: AnalyticsEvent[] = [];
  private userMetrics: Map<string, UserMetrics> = new Map();
  private gameMetrics: GameMetrics[] = [];
  private funnels: Map<string, Funnel> = new Map();
  private cohorts: Map<string, Cohort> = new Map();
  private dashboards: Map<string, Dashboard> = new Map();
  private realtimeMetrics: RealtimeMetrics[] = [];
  private alerts: Map<string, AnalyticsAlert> = new Map();

  private readonly MAX_EVENTS = 1000000; // Keep last 1M events
  private readonly MAX_REALTIME = 1440; // 24 hours at 1-minute granularity

  constructor() {
    super();

    // Update realtime metrics every minute
    setInterval(() => {
      this.updateRealtimeMetrics();
    }, 60000);

    // Update game metrics every hour
    setInterval(() => {
      this.updateGameMetrics();
    }, 3600000);
  }

  // ==================== Event Tracking ====================

  /**
   * Track event
   */
  trackEvent(
    eventName: string,
    userId?: string,
    sessionId?: string,
    properties: Record<string, any> = {},
    metadata?: {
      platform?: string;
      appVersion?: string;
      country?: string;
    }
  ): void {
    const event: AnalyticsEvent = {
      eventId: uuidv4(),
      eventName,
      userId,
      sessionId,
      timestamp: new Date(),
      properties,
      ...metadata,
    };

    this.events.push(event);

    // Manage event storage
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(-this.MAX_EVENTS);
    }

    // Update user metrics
    if (userId) {
      this.updateUserMetrics(userId, event);
    }

    this.emit('eventTracked', event);

    // Check alerts
    this.checkAlerts();
  }

  /**
   * Track user session
   */
  trackSession(userId: string, sessionId: string, duration: number): void {
    this.trackEvent('session_end', userId, sessionId, { duration });

    // Update user metrics
    const metrics = this.userMetrics.get(userId);
    if (metrics) {
      metrics.totalSessions++;
      metrics.totalPlaytime += duration;
      metrics.avgSessionDuration = metrics.totalPlaytime / metrics.totalSessions;
      metrics.lastSeen = new Date();
    }
  }

  /**
   * Track purchase
   */
  trackPurchase(
    userId: string,
    itemId: string,
    amount: number,
    currency: string,
    properties?: Record<string, any>
  ): void {
    this.trackEvent('purchase', userId, undefined, {
      itemId,
      amount,
      currency,
      ...properties,
    });

    // Update LTV
    const metrics = this.userMetrics.get(userId);
    if (metrics) {
      metrics.ltv += amount;
    }
  }

  // ==================== User Metrics ====================

  /**
   * Update user metrics
   */
  private updateUserMetrics(userId: string, event: AnalyticsEvent): void {
    let metrics = this.userMetrics.get(userId);

    if (!metrics) {
      metrics = {
        userId,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        totalSessions: 0,
        totalPlaytime: 0,
        avgSessionDuration: 0,
        retention: {
          day1: false,
          day7: false,
          day30: false,
        },
        ltv: 0,
        level: 0,
        achievements: 0,
      };
      this.userMetrics.set(userId, metrics);
    } else {
      metrics.lastSeen = event.timestamp;

      // Calculate retention
      const daysSinceFirst = Math.floor(
        (event.timestamp.getTime() - metrics.firstSeen.getTime()) / 86400000
      );

      if (daysSinceFirst >= 1) metrics.retention.day1 = true;
      if (daysSinceFirst >= 7) metrics.retention.day7 = true;
      if (daysSinceFirst >= 30) metrics.retention.day30 = true;
    }

    // Update specific metrics based on event
    if (event.eventName === 'level_up' && event.properties.level) {
      metrics.level = event.properties.level;
    }

    if (event.eventName === 'achievement_unlocked') {
      metrics.achievements++;
    }
  }

  /**
   * Get user metrics
   */
  getUserMetrics(userId: string): UserMetrics | undefined {
    return this.userMetrics.get(userId);
  }

  // ==================== Game Metrics ====================

  /**
   * Update game metrics
   */
  private updateGameMetrics(): void {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 86400000);
    const monthAgo = new Date(now.getTime() - 2592000000);

    const dauUsers = new Set<string>();
    const mauUsers = new Set<string>();
    const newUsers = new Set<string>();
    const returningUsers = new Set<string>();

    let totalSessionDuration = 0;
    let sessionCount = 0;
    let totalRevenue = 0;
    const payingUsers = new Set<string>();

    // Analyze events
    for (const event of this.events) {
      if (event.timestamp >= dayAgo) {
        if (event.userId) dauUsers.add(event.userId);
      }

      if (event.timestamp >= monthAgo) {
        if (event.userId) mauUsers.add(event.userId);
      }

      if (event.eventName === 'session_end' && event.properties.duration) {
        totalSessionDuration += event.properties.duration;
        sessionCount++;
      }

      if (event.eventName === 'purchase' && event.properties.amount) {
        totalRevenue += event.properties.amount;
        if (event.userId) payingUsers.add(event.userId);
      }
    }

    // Calculate new vs returning
    for (const userId of dauUsers) {
      const metrics = this.userMetrics.get(userId);
      if (metrics) {
        const daysSinceFirst = Math.floor(
          (now.getTime() - metrics.firstSeen.getTime()) / 86400000
        );

        if (daysSinceFirst === 0) {
          newUsers.add(userId);
        } else {
          returningUsers.add(userId);
        }
      }
    }

    // Calculate retention rates
    const retentionRate = {
      day1: 0,
      day7: 0,
      day30: 0,
    };

    let day1Count = 0, day7Count = 0, day30Count = 0;
    let day1Total = 0, day7Total = 0, day30Total = 0;

    for (const metrics of this.userMetrics.values()) {
      const daysSinceFirst = Math.floor(
        (now.getTime() - metrics.firstSeen.getTime()) / 86400000
      );

      if (daysSinceFirst >= 1) {
        day1Total++;
        if (metrics.retention.day1) day1Count++;
      }

      if (daysSinceFirst >= 7) {
        day7Total++;
        if (metrics.retention.day7) day7Count++;
      }

      if (daysSinceFirst >= 30) {
        day30Total++;
        if (metrics.retention.day30) day30Count++;
      }
    }

    retentionRate.day1 = day1Total > 0 ? (day1Count / day1Total) * 100 : 0;
    retentionRate.day7 = day7Total > 0 ? (day7Count / day7Total) * 100 : 0;
    retentionRate.day30 = day30Total > 0 ? (day30Count / day30Total) * 100 : 0;

    const gameMetric: GameMetrics = {
      gameId: 'default',
      timestamp: now,
      dau: dauUsers.size,
      mau: mauUsers.size,
      newUsers: newUsers.size,
      returningUsers: returningUsers.size,
      avgSessionDuration: sessionCount > 0 ? totalSessionDuration / sessionCount : 0,
      totalRevenue,
      arpu: mauUsers.size > 0 ? totalRevenue / mauUsers.size : 0,
      arppu: payingUsers.size > 0 ? totalRevenue / payingUsers.size : 0,
      conversionRate: mauUsers.size > 0 ? (payingUsers.size / mauUsers.size) * 100 : 0,
      retentionRate,
      churnRate: 100 - retentionRate.day30,
    };

    this.gameMetrics.push(gameMetric);

    // Keep last 90 days
    if (this.gameMetrics.length > 90) {
      this.gameMetrics.shift();
    }
  }

  /**
   * Get latest game metrics
   */
  getGameMetrics(): GameMetrics | undefined {
    return this.gameMetrics[this.gameMetrics.length - 1];
  }

  // ==================== Funnels ====================

  /**
   * Create funnel
   */
  createFunnel(name: string, steps: Omit<FunnelStep, 'completed' | 'dropoff' | 'conversionRate'>[]): Funnel {
    const funnel: Funnel = {
      funnelId: uuidv4(),
      name,
      steps: steps.map(step => ({
        ...step,
        completed: 0,
        dropoff: 0,
        conversionRate: 0,
      })),
      created: new Date(),
    };

    this.funnels.set(funnel.funnelId, funnel);
    this.updateFunnel(funnel.funnelId);

    return funnel;
  }

  /**
   * Update funnel statistics
   */
  private updateFunnel(funnelId: string): void {
    const funnel = this.funnels.get(funnelId);
    if (!funnel) return;

    // Track users through funnel steps
    const userSteps = new Map<string, Set<string>>(); // stepName -> userIds

    for (const step of funnel.steps) {
      userSteps.set(step.stepName, new Set());
    }

    // Count users at each step
    for (const event of this.events) {
      if (!event.userId) continue;

      for (const step of funnel.steps) {
        if (event.eventName === step.eventName) {
          userSteps.get(step.stepName)!.add(event.userId);
        }
      }
    }

    // Calculate metrics
    let previousCount = 0;

    for (let i = 0; i < funnel.steps.length; i++) {
      const step = funnel.steps[i];
      const count = userSteps.get(step.stepName)!.size;

      step.completed = count;

      if (i === 0) {
        step.conversionRate = 100;
        step.dropoff = 0;
      } else {
        step.conversionRate = previousCount > 0 ? (count / previousCount) * 100 : 0;
        step.dropoff = previousCount - count;
      }

      previousCount = count;
    }
  }

  /**
   * Get funnel
   */
  getFunnel(funnelId: string): Funnel | undefined {
    return this.funnels.get(funnelId);
  }

  // ==================== Cohorts ====================

  /**
   * Create cohort
   */
  createCohort(name: string, startDate: Date, criteria: CohortCriteria[], endDate?: Date): Cohort {
    const cohort: Cohort = {
      cohortId: uuidv4(),
      name,
      startDate,
      endDate,
      userCount: 0,
      criteria,
      metrics: {
        avgLifetime: 0,
        avgRevenue: 0,
        retentionByDay: new Map(),
        churnByDay: new Map(),
      },
    };

    this.cohorts.set(cohort.cohortId, cohort);
    this.updateCohort(cohort.cohortId);

    this.emit('cohortCreated', cohort);

    return cohort;
  }

  /**
   * Update cohort metrics
   */
  private updateCohort(cohortId: string): void {
    const cohort = this.cohorts.get(cohortId);
    if (!cohort) return;

    // Find users matching criteria
    const matchingUsers = new Set<string>();

    for (const [userId, metrics] of this.userMetrics) {
      if (this.userMatchesCohort(userId, metrics, cohort)) {
        matchingUsers.add(userId);
      }
    }

    cohort.userCount = matchingUsers.size;

    // Calculate cohort metrics
    let totalLifetime = 0;
    let totalRevenue = 0;

    for (const userId of matchingUsers) {
      const metrics = this.userMetrics.get(userId);
      if (metrics) {
        totalLifetime += Date.now() - metrics.firstSeen.getTime();
        totalRevenue += metrics.ltv;
      }
    }

    cohort.metrics.avgLifetime = matchingUsers.size > 0 ? totalLifetime / matchingUsers.size : 0;
    cohort.metrics.avgRevenue = matchingUsers.size > 0 ? totalRevenue / matchingUsers.size : 0;

    // Calculate retention by day
    for (let day = 1; day <= 30; day++) {
      let retained = 0;

      for (const userId of matchingUsers) {
        const metrics = this.userMetrics.get(userId);
        if (metrics) {
          const daysSinceFirst = Math.floor(
            (Date.now() - metrics.firstSeen.getTime()) / 86400000
          );

          if (daysSinceFirst >= day) {
            const daysSinceLastSeen = Math.floor(
              (Date.now() - metrics.lastSeen.getTime()) / 86400000
            );

            if (daysSinceLastSeen <= 1) {
              retained++;
            }
          }
        }
      }

      const retentionRate = matchingUsers.size > 0 ? (retained / matchingUsers.size) * 100 : 0;
      cohort.metrics.retentionByDay.set(day, retentionRate);
      cohort.metrics.churnByDay.set(day, 100 - retentionRate);
    }
  }

  /**
   * Check if user matches cohort
   */
  private userMatchesCohort(userId: string, metrics: UserMetrics, cohort: Cohort): boolean {
    // Check date range
    if (metrics.firstSeen < cohort.startDate) return false;
    if (cohort.endDate && metrics.firstSeen > cohort.endDate) return false;

    // Check criteria
    for (const criteria of cohort.criteria) {
      if (!this.evaluateCriteria(userId, metrics, criteria)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate criteria
   */
  private evaluateCriteria(userId: string, metrics: UserMetrics, criteria: CohortCriteria): boolean {
    let value: any;

    if (criteria.type === 'metric') {
      value = (metrics as any)[criteria.field];
    }

    if (value === undefined) return false;

    switch (criteria.operator) {
      case 'equals':
        return value === criteria.value;
      case 'greater':
        return value > criteria.value;
      case 'less':
        return value < criteria.value;
      case 'contains':
        return String(value).includes(String(criteria.value));
      default:
        return false;
    }
  }

  // ==================== Dashboards ====================

  /**
   * Create dashboard
   */
  createDashboard(name: string, widgets: DashboardWidget[], filters: DashboardFilter[] = []): Dashboard {
    const dashboard: Dashboard = {
      dashboardId: uuidv4(),
      name,
      widgets,
      filters,
      refreshInterval: 300, // 5 minutes
    };

    this.dashboards.set(dashboard.dashboardId, dashboard);
    return dashboard;
  }

  /**
   * Get dashboard
   */
  getDashboard(dashboardId: string): Dashboard | undefined {
    return this.dashboards.get(dashboardId);
  }

  // ==================== Realtime Metrics ====================

  /**
   * Update realtime metrics
   */
  private updateRealtimeMetrics(): void {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);

    const recentEvents = this.events.filter(e => e.timestamp >= oneMinuteAgo);
    const activeSessions = new Set<string>();
    const activeMatches = new Set<string>();

    let fpsSum = 0, fpsCount = 0;
    let latencySum = 0, latencyCount = 0;
    let errorCount = 0;
    let purchaseCount = 0;
    let revenue = 0;

    for (const event of recentEvents) {
      if (event.sessionId) activeSessions.add(event.sessionId);

      if (event.properties.matchId) activeMatches.add(event.properties.matchId);

      if (event.properties.fps) {
        fpsSum += event.properties.fps;
        fpsCount++;
      }

      if (event.properties.latency) {
        latencySum += event.properties.latency;
        latencyCount++;
      }

      if (event.eventName === 'error') errorCount++;

      if (event.eventName === 'purchase') {
        purchaseCount++;
        revenue += event.properties.amount || 0;
      }
    }

    const metric: RealtimeMetrics = {
      timestamp: now,
      concurrent: {
        players: activeSessions.size,
        sessions: activeSessions.size,
        matches: activeMatches.size,
      },
      performance: {
        avgFps: fpsCount > 0 ? fpsSum / fpsCount : 0,
        avgLatency: latencyCount > 0 ? latencySum / latencyCount : 0,
        errorRate: recentEvents.length > 0 ? (errorCount / recentEvents.length) * 100 : 0,
      },
      business: {
        purchasesPerMinute: purchaseCount,
        revenuePerMinute: revenue,
      },
    };

    this.realtimeMetrics.push(metric);

    // Keep last 24 hours
    if (this.realtimeMetrics.length > this.MAX_REALTIME) {
      this.realtimeMetrics.shift();
    }
  }

  /**
   * Get realtime metrics
   */
  getRealtimeMetrics(minutes: number = 60): RealtimeMetrics[] {
    return this.realtimeMetrics.slice(-minutes);
  }

  // ==================== Alerts ====================

  /**
   * Create alert
   */
  createAlert(name: string, condition: string, threshold: number): void {
    // Would implement alert evaluation logic
  }

  /**
   * Check alerts
   */
  private checkAlerts(): void {
    // Would check alert conditions
  }

  // ==================== Query ====================

  /**
   * Query analytics data
   */
  query(query: AnalyticsQuery): any[] {
    let events = this.events.filter(e =>
      e.timestamp >= query.timeRange.start &&
      e.timestamp <= query.timeRange.end
    );

    // Apply filters
    if (query.filters) {
      events = events.filter(e => {
        for (const [key, value] of Object.entries(query.filters!)) {
          if (e.properties[key] !== value) return false;
        }
        return true;
      });
    }

    return events;
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalEvents: number;
    totalUsers: number;
    activeFunnels: number;
    activeCohorts: number;
    dashboards: number;
  } {
    return {
      totalEvents: this.events.length,
      totalUsers: this.userMetrics.size,
      activeFunnels: this.funnels.size,
      activeCohorts: this.cohorts.size,
      dashboards: this.dashboards.size,
    };
  }
}
