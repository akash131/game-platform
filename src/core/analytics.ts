import { EventEmitter } from 'eventemitter3';
import {
  Analytics,
  AnalyticsEvent,
  LeaderboardEntry,
  GameSession,
} from '../types/core.types';

/**
 * Analytics System
 * Real-time analytics and leaderboard management
 * Similar to Google Analytics, AWS CloudWatch, Azure Monitor
 */
export class AnalyticsSystem extends EventEmitter {
  private analyticsData: Map<string, Analytics>;
  private leaderboards: Map<string, LeaderboardEntry[]>;
  private eventBuffer: AnalyticsEvent[];

  constructor() {
    super();
    this.analyticsData = new Map();
    this.leaderboards = new Map();
    this.eventBuffer = [];
  }

  /**
   * Track analytics event
   */
  trackEvent(sessionId: string, playerId: string, event: AnalyticsEvent): void {
    let analytics = this.analyticsData.get(`${sessionId}-${playerId}`);

    if (!analytics) {
      analytics = {
        sessionId,
        playerId,
        metrics: {
          fps: 60,
          latency: 30,
          bandwidth: 100,
          cpuUsage: 50,
          gpuUsage: 60,
        },
        events: [],
      };
      this.analyticsData.set(`${sessionId}-${playerId}`, analytics);
    }

    analytics.events.push(event);
    this.eventBuffer.push(event);

    this.emit('analytics:event', event);
  }

  /**
   * Update performance metrics
   */
  updateMetrics(sessionId: string, playerId: string, metrics: Partial<Analytics['metrics']>): void {
    const key = `${sessionId}-${playerId}`;
    let analytics = this.analyticsData.get(key);

    if (!analytics) {
      analytics = {
        sessionId,
        playerId,
        metrics: {
          fps: 60,
          latency: 30,
          bandwidth: 100,
          cpuUsage: 50,
          gpuUsage: 60,
        },
        events: [],
      };
      this.analyticsData.set(key, analytics);
    }

    analytics.metrics = { ...analytics.metrics, ...metrics };
    this.emit('analytics:metrics:updated', { sessionId, playerId, metrics: analytics.metrics });
  }

  /**
   * Get analytics for a session/player
   */
  getAnalytics(sessionId: string, playerId: string): Analytics | undefined {
    return this.analyticsData.get(`${sessionId}-${playerId}`);
  }

  /**
   * Get average metrics for a session
   */
  getSessionMetrics(sessionId: string): Analytics['metrics'] {
    const sessionAnalytics = Array.from(this.analyticsData.entries())
      .filter(([key]) => key.startsWith(sessionId))
      .map(([_, analytics]) => analytics);

    if (sessionAnalytics.length === 0) {
      return {
        fps: 0,
        latency: 0,
        bandwidth: 0,
        cpuUsage: 0,
        gpuUsage: 0,
      };
    }

    return {
      fps: this.average(sessionAnalytics.map(a => a.metrics.fps)),
      latency: this.average(sessionAnalytics.map(a => a.metrics.latency)),
      bandwidth: this.average(sessionAnalytics.map(a => a.metrics.bandwidth)),
      cpuUsage: this.average(sessionAnalytics.map(a => a.metrics.cpuUsage)),
      gpuUsage: this.average(sessionAnalytics.map(a => a.metrics.gpuUsage)),
    };
  }

  /**
   * Update leaderboard
   */
  updateLeaderboard(
    leaderboardId: string,
    playerId: string,
    username: string,
    score: number,
    metadata?: Record<string, any>
  ): void {
    let leaderboard = this.leaderboards.get(leaderboardId);

    if (!leaderboard) {
      leaderboard = [];
      this.leaderboards.set(leaderboardId, leaderboard);
    }

    // Update or add entry
    const existingIndex = leaderboard.findIndex(entry => entry.playerId === playerId);

    if (existingIndex >= 0) {
      leaderboard[existingIndex].score = score;
      leaderboard[existingIndex].metadata = metadata;
    } else {
      leaderboard.push({
        rank: 0,
        playerId,
        username,
        score,
        metadata,
      });
    }

    // Sort by score and update ranks
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    this.emit('leaderboard:updated', { leaderboardId });
  }

  /**
   * Get leaderboard
   */
  getLeaderboard(leaderboardId: string, limit: number = 100): LeaderboardEntry[] {
    const leaderboard = this.leaderboards.get(leaderboardId);
    return leaderboard ? leaderboard.slice(0, limit) : [];
  }

  /**
   * Get player rank
   */
  getPlayerRank(leaderboardId: string, playerId: string): LeaderboardEntry | undefined {
    const leaderboard = this.leaderboards.get(leaderboardId);
    return leaderboard?.find(entry => entry.playerId === playerId);
  }

  /**
   * Get global leaderboard (all game types combined)
   */
  getGlobalLeaderboard(limit: number = 100): LeaderboardEntry[] {
    const allEntries: Map<string, LeaderboardEntry> = new Map();

    // Combine all leaderboards
    for (const leaderboard of this.leaderboards.values()) {
      for (const entry of leaderboard) {
        const existing = allEntries.get(entry.playerId);
        if (existing) {
          existing.score += entry.score;
        } else {
          allEntries.set(entry.playerId, { ...entry });
        }
      }
    }

    // Sort and rank
    const globalLeaderboard = Array.from(allEntries.values()).sort((a, b) => b.score - a.score);

    globalLeaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return globalLeaderboard.slice(0, limit);
  }

  /**
   * Generate analytics report
   */
  generateReport(sessionId?: string): AnalyticsReport {
    let events = this.eventBuffer;

    if (sessionId) {
      events = Array.from(this.analyticsData.entries())
        .filter(([key]) => key.startsWith(sessionId))
        .flatMap(([_, analytics]) => analytics.events);
    }

    const eventsByType = this.groupEventsByType(events);

    return {
      totalEvents: events.length,
      eventsByType,
      timeRange: {
        start: events[0]?.timestamp || new Date(),
        end: events[events.length - 1]?.timestamp || new Date(),
      },
      uniquePlayers: new Set(
        Array.from(this.analyticsData.values()).map(a => a.playerId)
      ).size,
    };
  }

  /**
   * Clear analytics data (for cleanup)
   */
  clearAnalytics(sessionId?: string): void {
    if (sessionId) {
      for (const key of this.analyticsData.keys()) {
        if (key.startsWith(sessionId)) {
          this.analyticsData.delete(key);
        }
      }
    } else {
      this.analyticsData.clear();
      this.eventBuffer = [];
    }
  }

  private average(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }

  private groupEventsByType(events: AnalyticsEvent[]): Record<string, number> {
    const groups: Record<string, number> = {};

    for (const event of events) {
      groups[event.type] = (groups[event.type] || 0) + 1;
    }

    return groups;
  }
}

export interface AnalyticsReport {
  totalEvents: number;
  eventsByType: Record<string, number>;
  timeRange: {
    start: Date;
    end: Date;
  };
  uniquePlayers: number;
}
