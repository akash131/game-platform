import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

/**
 * LiveOps Service - Live operations management like Azure PlayFab
 * Provides title data, player data, events, remote config, and feature flags
 */

export interface TitleData {
  key: string;
  value: any;
  version: number;
  lastUpdated: Date;
}

export interface PlayerData {
  playerId: string;
  key: string;
  value: any;
  permission: 'Public' | 'Private';
  lastUpdated: Date;
}

export interface RemoteConfigValue {
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'json';
  platforms?: string[]; // iOS, Android, PC, etc.
  segments?: string[]; // Player segments
  abTestVariant?: string;
}

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  description?: string;
  rolloutPercentage?: number; // 0-100
  enabledSegments?: string[];
  disabledSegments?: string[];
  schedule?: {
    startTime?: Date;
    endTime?: Date;
  };
}

export interface ScheduledEvent {
  eventId: string;
  name: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  type: 'tournament' | 'sale' | 'bonus' | 'seasonal' | 'custom';
  data?: any;
  active: boolean;
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
  };
}

export interface NewsItem {
  newsId: string;
  title: string;
  body: string;
  timestamp: Date;
  priority: 'low' | 'medium' | 'high';
  expiryTime?: Date;
  imageUrl?: string;
  actionUrl?: string;
  targetSegments?: string[];
}

export interface PlayerSegment {
  segmentId: string;
  name: string;
  description?: string;
  filters: SegmentFilter[];
  playerCount?: number;
}

export interface SegmentFilter {
  property: string;
  operator: 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'contains' | 'notContains';
  value: any;
}

export interface ABTest {
  testId: string;
  name: string;
  description?: string;
  startTime: Date;
  endTime?: Date;
  variants: ABTestVariant[];
  targetSegment?: string;
  status: 'draft' | 'running' | 'paused' | 'completed';
  metrics: ABTestMetric[];
}

export interface ABTestVariant {
  variantId: string;
  name: string;
  weight: number; // 0-100, total should be 100
  config: Record<string, any>;
  playerCount?: number;
}

export interface ABTestMetric {
  name: string;
  type: 'conversion' | 'retention' | 'revenue' | 'engagement';
  values: Map<string, number>; // variantId -> value
}

export interface CloudScript {
  scriptName: string;
  handler: (context: CloudScriptContext) => Promise<any>;
  timeout?: number;
}

export interface CloudScriptContext {
  playerId?: string;
  titleId: string;
  requestData: any;
  currentPlayer?: {
    playerId: string;
    data: Map<string, any>;
  };
}

export interface LiveOpsEvents {
  'titleDataUpdated': (key: string, value: any) => void;
  'playerDataUpdated': (playerId: string, key: string, value: any) => void;
  'eventStarted': (event: ScheduledEvent) => void;
  'eventEnded': (event: ScheduledEvent) => void;
  'featureFlagChanged': (flag: FeatureFlag) => void;
  'newsPublished': (news: NewsItem) => void;
  'abTestStarted': (test: ABTest) => void;
  'abTestCompleted': (test: ABTest) => void;
}

export class LiveOpsService extends EventEmitter<LiveOpsEvents> {
  private titleId: string;
  private titleData: Map<string, TitleData> = new Map();
  private playerData: Map<string, Map<string, PlayerData>> = new Map(); // playerId -> key -> data
  private remoteConfig: Map<string, RemoteConfigValue> = new Map();
  private featureFlags: Map<string, FeatureFlag> = new Map();
  private scheduledEvents: Map<string, ScheduledEvent> = new Map();
  private news: NewsItem[] = [];
  private segments: Map<string, PlayerSegment> = new Map();
  private abTests: Map<string, ABTest> = new Map();
  private cloudScripts: Map<string, CloudScript> = new Map();
  private playerSegmentCache: Map<string, Set<string>> = new Map(); // playerId -> segmentIds
  private playerABTestVariants: Map<string, Map<string, string>> = new Map(); // playerId -> testId -> variantId

  private eventCheckInterval: NodeJS.Timeout | null = null;

  constructor(titleId: string) {
    super();
    this.titleId = titleId;
  }

  /**
   * Start LiveOps service
   */
  start(): void {
    if (this.eventCheckInterval) {
      return;
    }

    // Check scheduled events every minute
    this.eventCheckInterval = setInterval(() => {
      this.checkScheduledEvents();
    }, 60000);

    console.log('LiveOps service started');
  }

  /**
   * Stop LiveOps service
   */
  stop(): void {
    if (this.eventCheckInterval) {
      clearInterval(this.eventCheckInterval);
      this.eventCheckInterval = null;
    }

    console.log('LiveOps service stopped');
  }

  // ==================== Title Data Management ====================

  /**
   * Set title data
   */
  setTitleData(key: string, value: any): void {
    const existing = this.titleData.get(key);
    const version = existing ? existing.version + 1 : 1;

    const data: TitleData = {
      key,
      value,
      version,
      lastUpdated: new Date(),
    };

    this.titleData.set(key, data);
    this.emit('titleDataUpdated', key, value);
  }

  /**
   * Get title data
   */
  getTitleData(key?: string): any {
    if (key) {
      return this.titleData.get(key)?.value;
    }

    const result: Record<string, any> = {};
    for (const [k, v] of this.titleData) {
      result[k] = v.value;
    }
    return result;
  }

  // ==================== Player Data Management ====================

  /**
   * Set player data
   */
  setPlayerData(playerId: string, key: string, value: any, permission: 'Public' | 'Private' = 'Private'): void {
    if (!this.playerData.has(playerId)) {
      this.playerData.set(playerId, new Map());
    }

    const data: PlayerData = {
      playerId,
      key,
      value,
      permission,
      lastUpdated: new Date(),
    };

    this.playerData.get(playerId)!.set(key, data);
    this.emit('playerDataUpdated', playerId, key, value);
  }

  /**
   * Get player data
   */
  getPlayerData(playerId: string, key?: string): any {
    const playerDataMap = this.playerData.get(playerId);
    if (!playerDataMap) {
      return key ? undefined : {};
    }

    if (key) {
      return playerDataMap.get(key)?.value;
    }

    const result: Record<string, any> = {};
    for (const [k, v] of playerDataMap) {
      result[k] = v.value;
    }
    return result;
  }

  /**
   * Delete player data
   */
  deletePlayerData(playerId: string, key: string): void {
    const playerDataMap = this.playerData.get(playerId);
    if (playerDataMap) {
      playerDataMap.delete(key);
    }
  }

  // ==================== Remote Configuration ====================

  /**
   * Set remote config value
   */
  setRemoteConfig(config: RemoteConfigValue): void {
    this.remoteConfig.set(config.key, config);
  }

  /**
   * Get remote config for player
   */
  getRemoteConfig(playerId?: string, platform?: string): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, config] of this.remoteConfig) {
      // Check platform filter
      if (platform && config.platforms && !config.platforms.includes(platform)) {
        continue;
      }

      // Check segment filter
      if (playerId && config.segments && config.segments.length > 0) {
        const playerSegments = this.getPlayerSegments(playerId);
        const hasSegment = config.segments.some(seg => playerSegments.has(seg));
        if (!hasSegment) {
          continue;
        }
      }

      result[key] = config.value;
    }

    return result;
  }

  // ==================== Feature Flags ====================

  /**
   * Set feature flag
   */
  setFeatureFlag(flag: FeatureFlag): void {
    this.featureFlags.set(flag.name, flag);
    this.emit('featureFlagChanged', flag);
  }

  /**
   * Check if feature is enabled for player
   */
  isFeatureEnabled(featureName: string, playerId?: string): boolean {
    const flag = this.featureFlags.get(featureName);
    if (!flag) {
      return false;
    }

    // Check base enabled state
    if (!flag.enabled) {
      return false;
    }

    // Check schedule
    if (flag.schedule) {
      const now = new Date();
      if (flag.schedule.startTime && now < flag.schedule.startTime) {
        return false;
      }
      if (flag.schedule.endTime && now > flag.schedule.endTime) {
        return false;
      }
    }

    // Check player-specific rules
    if (playerId) {
      const playerSegments = this.getPlayerSegments(playerId);

      // Check disabled segments
      if (flag.disabledSegments && flag.disabledSegments.length > 0) {
        const hasDisabledSegment = flag.disabledSegments.some(seg => playerSegments.has(seg));
        if (hasDisabledSegment) {
          return false;
        }
      }

      // Check enabled segments
      if (flag.enabledSegments && flag.enabledSegments.length > 0) {
        const hasEnabledSegment = flag.enabledSegments.some(seg => playerSegments.has(seg));
        if (!hasEnabledSegment) {
          return false;
        }
      }

      // Check rollout percentage
      if (flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100) {
        const hash = this.hashString(playerId + featureName);
        const playerPercentile = (hash % 100);
        if (playerPercentile >= flag.rolloutPercentage) {
          return false;
        }
      }
    }

    return true;
  }

  // ==================== Scheduled Events ====================

  /**
   * Create scheduled event
   */
  createScheduledEvent(event: Omit<ScheduledEvent, 'eventId' | 'active'>): ScheduledEvent {
    const fullEvent: ScheduledEvent = {
      eventId: uuidv4(),
      active: false,
      ...event,
    };

    this.scheduledEvents.set(fullEvent.eventId, fullEvent);
    return fullEvent;
  }

  /**
   * Get active events
   */
  getActiveEvents(type?: ScheduledEvent['type']): ScheduledEvent[] {
    const now = new Date();
    const events = Array.from(this.scheduledEvents.values()).filter(event => {
      if (type && event.type !== type) {
        return false;
      }
      return event.active && event.startTime <= now && event.endTime >= now;
    });

    return events;
  }

  /**
   * Check scheduled events
   */
  private checkScheduledEvents(): void {
    const now = new Date();

    for (const event of this.scheduledEvents.values()) {
      const shouldBeActive = event.startTime <= now && event.endTime >= now;

      if (shouldBeActive && !event.active) {
        // Event started
        event.active = true;
        this.emit('eventStarted', event);
      } else if (!shouldBeActive && event.active) {
        // Event ended
        event.active = false;
        this.emit('eventEnded', event);

        // Handle recurring events
        if (event.recurring) {
          this.scheduleNextRecurrence(event);
        }
      }
    }
  }

  /**
   * Schedule next recurrence
   */
  private scheduleNextRecurrence(event: ScheduledEvent): void {
    if (!event.recurring) return;

    const duration = event.endTime.getTime() - event.startTime.getTime();
    let nextStart = new Date(event.startTime);

    switch (event.recurring.frequency) {
      case 'daily':
        nextStart.setDate(nextStart.getDate() + event.recurring.interval);
        break;
      case 'weekly':
        nextStart.setDate(nextStart.getDate() + (7 * event.recurring.interval));
        break;
      case 'monthly':
        nextStart.setMonth(nextStart.getMonth() + event.recurring.interval);
        break;
    }

    event.startTime = nextStart;
    event.endTime = new Date(nextStart.getTime() + duration);
    event.active = false;
  }

  // ==================== News ====================

  /**
   * Publish news
   */
  publishNews(news: Omit<NewsItem, 'newsId' | 'timestamp'>): NewsItem {
    const fullNews: NewsItem = {
      newsId: uuidv4(),
      timestamp: new Date(),
      ...news,
    };

    this.news.unshift(fullNews);
    this.emit('newsPublished', fullNews);

    return fullNews;
  }

  /**
   * Get news for player
   */
  getNews(playerId?: string, limit: number = 10): NewsItem[] {
    const now = new Date();
    let filteredNews = this.news.filter(item => {
      // Check expiry
      if (item.expiryTime && item.expiryTime < now) {
        return false;
      }

      // Check segment targeting
      if (playerId && item.targetSegments && item.targetSegments.length > 0) {
        const playerSegments = this.getPlayerSegments(playerId);
        const hasSegment = item.targetSegments.some(seg => playerSegments.has(seg));
        if (!hasSegment) {
          return false;
        }
      }

      return true;
    });

    return filteredNews.slice(0, limit);
  }

  // ==================== Player Segments ====================

  /**
   * Create player segment
   */
  createSegment(segment: Omit<PlayerSegment, 'segmentId'>): PlayerSegment {
    const fullSegment: PlayerSegment = {
      segmentId: uuidv4(),
      ...segment,
    };

    this.segments.set(fullSegment.segmentId, fullSegment);
    this.playerSegmentCache.clear(); // Clear cache

    return fullSegment;
  }

  /**
   * Get player segments
   */
  getPlayerSegments(playerId: string): Set<string> {
    // Check cache
    if (this.playerSegmentCache.has(playerId)) {
      return this.playerSegmentCache.get(playerId)!;
    }

    const playerSegments = new Set<string>();
    const playerDataMap = this.playerData.get(playerId);

    for (const segment of this.segments.values()) {
      if (this.playerMatchesSegment(playerId, segment, playerDataMap)) {
        playerSegments.add(segment.segmentId);
      }
    }

    this.playerSegmentCache.set(playerId, playerSegments);
    return playerSegments;
  }

  /**
   * Check if player matches segment
   */
  private playerMatchesSegment(
    playerId: string,
    segment: PlayerSegment,
    playerDataMap?: Map<string, PlayerData>
  ): boolean {
    for (const filter of segment.filters) {
      const value = playerDataMap?.get(filter.property)?.value;

      if (!this.evaluateFilter(value, filter.operator, filter.value)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate segment filter
   */
  private evaluateFilter(actualValue: any, operator: SegmentFilter['operator'], expectedValue: any): boolean {
    switch (operator) {
      case 'equals':
        return actualValue === expectedValue;
      case 'notEquals':
        return actualValue !== expectedValue;
      case 'greaterThan':
        return actualValue > expectedValue;
      case 'lessThan':
        return actualValue < expectedValue;
      case 'contains':
        return String(actualValue).includes(String(expectedValue));
      case 'notContains':
        return !String(actualValue).includes(String(expectedValue));
      default:
        return false;
    }
  }

  // ==================== A/B Testing ====================

  /**
   * Create A/B test
   */
  createABTest(test: Omit<ABTest, 'testId' | 'status'>): ABTest {
    // Validate variant weights
    const totalWeight = test.variants.reduce((sum, v) => sum + v.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      throw new Error('Variant weights must sum to 100');
    }

    const fullTest: ABTest = {
      testId: uuidv4(),
      status: 'draft',
      ...test,
    };

    this.abTests.set(fullTest.testId, fullTest);
    return fullTest;
  }

  /**
   * Start A/B test
   */
  startABTest(testId: string): void {
    const test = this.abTests.get(testId);
    if (!test) {
      throw new Error('A/B test not found');
    }

    test.status = 'running';
    this.emit('abTestStarted', test);
  }

  /**
   * Get A/B test variant for player
   */
  getABTestVariant(testId: string, playerId: string): ABTestVariant | null {
    const test = this.abTests.get(testId);
    if (!test || test.status !== 'running') {
      return null;
    }

    // Check cache
    if (!this.playerABTestVariants.has(playerId)) {
      this.playerABTestVariants.set(playerId, new Map());
    }

    const playerTests = this.playerABTestVariants.get(playerId)!;
    if (playerTests.has(testId)) {
      const variantId = playerTests.get(testId)!;
      return test.variants.find(v => v.variantId === variantId) || null;
    }

    // Assign variant based on hash
    const hash = this.hashString(playerId + testId);
    const percentile = hash % 100;

    let cumulative = 0;
    for (const variant of test.variants) {
      cumulative += variant.weight;
      if (percentile < cumulative) {
        playerTests.set(testId, variant.variantId);
        variant.playerCount = (variant.playerCount || 0) + 1;
        return variant;
      }
    }

    return test.variants[0];
  }

  /**
   * Complete A/B test
   */
  completeABTest(testId: string): void {
    const test = this.abTests.get(testId);
    if (!test) {
      throw new Error('A/B test not found');
    }

    test.status = 'completed';
    test.endTime = new Date();
    this.emit('abTestCompleted', test);
  }

  // ==================== Cloud Scripts ====================

  /**
   * Register cloud script
   */
  registerCloudScript(script: CloudScript): void {
    this.cloudScripts.set(script.scriptName, script);
  }

  /**
   * Execute cloud script
   */
  async executeCloudScript(
    scriptName: string,
    requestData: any,
    playerId?: string
  ): Promise<any> {
    const script = this.cloudScripts.get(scriptName);
    if (!script) {
      throw new Error(`Cloud script not found: ${scriptName}`);
    }

    const context: CloudScriptContext = {
      playerId,
      titleId: this.titleId,
      requestData,
    };

    if (playerId) {
      context.currentPlayer = {
        playerId,
        data: this.playerData.get(playerId) || new Map(),
      };
    }

    const timeout = script.timeout || 5000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Cloud script timeout')), timeout)
    );

    const result = await Promise.race([
      script.handler(context),
      timeoutPromise,
    ]);

    return result;
  }

  // ==================== Utilities ====================

  /**
   * Hash string to number
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    titleDataKeys: number;
    totalPlayers: number;
    remoteConfigKeys: number;
    featureFlags: number;
    activeEvents: number;
    segments: number;
    runningTests: number;
    newsItems: number;
  } {
    return {
      titleDataKeys: this.titleData.size,
      totalPlayers: this.playerData.size,
      remoteConfigKeys: this.remoteConfig.size,
      featureFlags: this.featureFlags.size,
      activeEvents: this.getActiveEvents().length,
      segments: this.segments.size,
      runningTests: Array.from(this.abTests.values()).filter(t => t.status === 'running').length,
      newsItems: this.news.length,
    };
  }
}
