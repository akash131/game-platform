import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

/**
 * Crash Reporting - Error tracking and diagnostics
 * Similar to Sentry, Crashlytics, Bugsnag
 */

export interface CrashReport {
  crashId: string;
  appVersion: string;
  platform: string;
  os: string;
  osVersion: string;
  deviceModel?: string;
  userId?: string;
  sessionId?: string;
  timestamp: Date;
  type: 'crash' | 'exception' | 'error' | 'warning';
  severity: 'fatal' | 'error' | 'warning' | 'info';
  message: string;
  stackTrace: StackFrame[];
  breadcrumbs: Breadcrumb[];
  context: ErrorContext;
  fingerprint: string; // For grouping similar errors
  handled: boolean;
  tags: Record<string, string>;
}

export interface StackFrame {
  file: string;
  line: number;
  column?: number;
  function?: string;
  context?: {
    pre: string[];
    line: string;
    post: string[];
  };
}

export interface Breadcrumb {
  timestamp: Date;
  type: 'navigation' | 'http' | 'user' | 'console' | 'error';
  category: string;
  message: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  data?: Record<string, any>;
}

export interface ErrorContext {
  environment: string; // dev, staging, production
  release: string;
  gameState?: any;
  playerState?: any;
  memoryUsage?: MemoryUsage;
  deviceInfo?: DeviceInfo;
  customData?: Record<string, any>;
}

export interface MemoryUsage {
  used: number; // bytes
  total: number;
  peak: number;
}

export interface DeviceInfo {
  cpuModel?: string;
  gpuModel?: string;
  ramGB?: number;
  screenResolution?: string;
  locale?: string;
  timezone?: string;
}

export interface ErrorGroup {
  groupId: string;
  fingerprint: string;
  firstSeen: Date;
  lastSeen: Date;
  count: number;
  affectedUsers: Set<string>;
  status: 'unresolved' | 'resolved' | 'ignored';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo?: string;
  notes?: string[];
  crashes: string[]; // crashIds
}

export interface PerformanceTrace {
  traceId: string;
  name: string;
  startTime: Date;
  duration: number; // milliseconds
  metrics: Record<string, number>;
  attributes: Record<string, any>;
}

export interface NetworkTrace {
  traceId: string;
  url: string;
  method: string;
  startTime: Date;
  duration: number;
  statusCode?: number;
  requestSize?: number;
  responseSize?: number;
  error?: string;
}

export interface CrashMetrics {
  crashFreeRate: number; // Percentage
  crashFreeUsers: number;
  totalCrashes: number;
  affectedUsers: number;
  crashesPerUser: number;
  topCrashes: Array<{
    groupId: string;
    count: number;
    affectedUsers: number;
  }>;
}

export interface DiagnosticsEvents {
  'crashReported': (crash: CrashReport) => void;
  'errorGroupCreated': (group: ErrorGroup) => void;
  'errorGroupUpdated': (group: ErrorGroup) => void;
  'performanceIssue': (trace: PerformanceTrace) => void;
}

export class CrashReportingService extends EventEmitter<DiagnosticsEvents> {
  private crashes: Map<string, CrashReport> = new Map();
  private errorGroups: Map<string, ErrorGroup> = new Map(); // fingerprint -> group
  private performanceTraces: PerformanceTrace[] = [];
  private networkTraces: NetworkTrace[] = [];
  private sessions: Map<string, SessionDiagnostics> = new Map();

  private readonly MAX_CRASHES = 100000;
  private readonly MAX_TRACES = 10000;

  constructor() {
    super();
  }

  // ==================== Crash Reporting ====================

  /**
   * Report crash
   */
  reportCrash(report: Omit<CrashReport, 'crashId' | 'timestamp' | 'fingerprint'>): CrashReport {
    const fingerprint = this.generateFingerprint(report.stackTrace, report.message);

    const fullReport: CrashReport = {
      crashId: uuidv4(),
      timestamp: new Date(),
      fingerprint,
      ...report,
    };

    this.crashes.set(fullReport.crashId, fullReport);

    // Manage storage
    if (this.crashes.size > this.MAX_CRASHES) {
      const oldestCrashId = this.crashes.keys().next().value;
      this.crashes.delete(oldestCrashId);
    }

    // Group similar errors
    this.groupError(fullReport);

    this.emit('crashReported', fullReport);

    return fullReport;
  }

  /**
   * Report exception
   */
  reportException(
    error: Error,
    context?: Partial<ErrorContext>,
    userId?: string,
    sessionId?: string
  ): CrashReport {
    const stackTrace = this.parseStackTrace(error.stack || '');

    return this.reportCrash({
      appVersion: context?.release || '1.0.0',
      platform: process.platform,
      os: process.platform,
      osVersion: process.version,
      userId,
      sessionId,
      type: 'exception',
      severity: 'error',
      message: error.message,
      stackTrace,
      breadcrumbs: this.getBreadcrumbs(sessionId),
      context: {
        environment: 'production',
        release: '1.0.0',
        ...context,
      },
      handled: true,
      tags: {},
    });
  }

  /**
   * Add breadcrumb
   */
  addBreadcrumb(
    sessionId: string,
    type: Breadcrumb['type'],
    category: string,
    message: string,
    data?: Record<string, any>
  ): void {
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = {
        sessionId,
        breadcrumbs: [],
        startTime: new Date(),
      };
      this.sessions.set(sessionId, session);
    }

    const breadcrumb: Breadcrumb = {
      timestamp: new Date(),
      type,
      category,
      message,
      level: 'info',
      data,
    };

    session.breadcrumbs.push(breadcrumb);

    // Keep last 100 breadcrumbs
    if (session.breadcrumbs.length > 100) {
      session.breadcrumbs.shift();
    }
  }

  /**
   * Get breadcrumbs for session
   */
  private getBreadcrumbs(sessionId?: string): Breadcrumb[] {
    if (!sessionId) return [];

    const session = this.sessions.get(sessionId);
    return session?.breadcrumbs || [];
  }

  // ==================== Error Grouping ====================

  /**
   * Generate fingerprint for error grouping
   */
  private generateFingerprint(stackTrace: StackFrame[], message: string): string {
    // Combine message and top stack frames for fingerprint
    const key = message + stackTrace.slice(0, 3).map(f => `${f.file}:${f.line}`).join('|');

    // Simple hash
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    return hash.toString(36);
  }

  /**
   * Group error
   */
  private groupError(crash: CrashReport): void {
    let group = this.errorGroups.get(crash.fingerprint);

    if (!group) {
      group = {
        groupId: uuidv4(),
        fingerprint: crash.fingerprint,
        firstSeen: crash.timestamp,
        lastSeen: crash.timestamp,
        count: 0,
        affectedUsers: new Set(),
        status: 'unresolved',
        priority: this.calculatePriority(crash.severity),
        crashes: [],
      };

      this.errorGroups.set(crash.fingerprint, group);
      this.emit('errorGroupCreated', group);
    }

    group.count++;
    group.lastSeen = crash.timestamp;
    group.crashes.push(crash.crashId);

    if (crash.userId) {
      group.affectedUsers.add(crash.userId);
    }

    // Keep last 100 crashes per group
    if (group.crashes.length > 100) {
      group.crashes.shift();
    }

    // Auto-escalate if many users affected
    if (group.affectedUsers.size > 100 && group.priority !== 'critical') {
      group.priority = 'critical';
    }

    this.emit('errorGroupUpdated', group);
  }

  /**
   * Calculate priority
   */
  private calculatePriority(severity: CrashReport['severity']): ErrorGroup['priority'] {
    switch (severity) {
      case 'fatal':
        return 'critical';
      case 'error':
        return 'high';
      case 'warning':
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Parse stack trace
   */
  private parseStackTrace(stack: string): StackFrame[] {
    const frames: StackFrame[] = [];
    const lines = stack.split('\n');

    for (const line of lines) {
      // Parse stack frame (simplified)
      const match = line.match(/at\s+(.+?)\s+\((.+):(\d+):(\d+)\)/);

      if (match) {
        frames.push({
          function: match[1],
          file: match[2],
          line: parseInt(match[3]),
          column: parseInt(match[4]),
        });
      }
    }

    return frames;
  }

  /**
   * Resolve error group
   */
  resolveErrorGroup(groupId: string): void {
    for (const group of this.errorGroups.values()) {
      if (group.groupId === groupId) {
        group.status = 'resolved';
        this.emit('errorGroupUpdated', group);
        break;
      }
    }
  }

  /**
   * Ignore error group
   */
  ignoreErrorGroup(groupId: string): void {
    for (const group of this.errorGroups.values()) {
      if (group.groupId === groupId) {
        group.status = 'ignored';
        this.emit('errorGroupUpdated', group);
        break;
      }
    }
  }

  // ==================== Performance Monitoring ====================

  /**
   * Start performance trace
   */
  startTrace(name: string): string {
    const traceId = uuidv4();

    const trace: PerformanceTrace = {
      traceId,
      name,
      startTime: new Date(),
      duration: 0,
      metrics: {},
      attributes: {},
    };

    // Store temporarily
    (this as any)._activeTraces = (this as any)._activeTraces || new Map();
    (this as any)._activeTraces.set(traceId, trace);

    return traceId;
  }

  /**
   * Stop performance trace
   */
  stopTrace(traceId: string, metrics?: Record<string, number>, attributes?: Record<string, any>): void {
    const activeTraces = (this as any)._activeTraces as Map<string, PerformanceTrace>;
    if (!activeTraces) return;

    const trace = activeTraces.get(traceId);
    if (!trace) return;

    trace.duration = Date.now() - trace.startTime.getTime();
    if (metrics) trace.metrics = metrics;
    if (attributes) trace.attributes = attributes;

    this.performanceTraces.push(trace);
    activeTraces.delete(traceId);

    // Manage storage
    if (this.performanceTraces.length > this.MAX_TRACES) {
      this.performanceTraces.shift();
    }

    // Check for performance issues
    if (trace.duration > 1000) {
      // Slow operation
      this.emit('performanceIssue', trace);
    }
  }

  /**
   * Record network trace
   */
  recordNetworkTrace(
    url: string,
    method: string,
    duration: number,
    statusCode?: number,
    requestSize?: number,
    responseSize?: number,
    error?: string
  ): void {
    const trace: NetworkTrace = {
      traceId: uuidv4(),
      url,
      method,
      startTime: new Date(),
      duration,
      statusCode,
      requestSize,
      responseSize,
      error,
    };

    this.networkTraces.push(trace);

    // Manage storage
    if (this.networkTraces.length > this.MAX_TRACES) {
      this.networkTraces.shift();
    }
  }

  // ==================== Queries ====================

  /**
   * Get crash by ID
   */
  getCrash(crashId: string): CrashReport | undefined {
    return this.crashes.get(crashId);
  }

  /**
   * List crashes
   */
  listCrashes(filters?: {
    userId?: string;
    appVersion?: string;
    platform?: string;
    severity?: CrashReport['severity'];
    startDate?: Date;
    endDate?: Date;
  }): CrashReport[] {
    let crashes = Array.from(this.crashes.values());

    if (filters) {
      if (filters.userId) {
        crashes = crashes.filter(c => c.userId === filters.userId);
      }

      if (filters.appVersion) {
        crashes = crashes.filter(c => c.appVersion === filters.appVersion);
      }

      if (filters.platform) {
        crashes = crashes.filter(c => c.platform === filters.platform);
      }

      if (filters.severity) {
        crashes = crashes.filter(c => c.severity === filters.severity);
      }

      if (filters.startDate) {
        crashes = crashes.filter(c => c.timestamp >= filters.startDate!);
      }

      if (filters.endDate) {
        crashes = crashes.filter(c => c.timestamp <= filters.endDate!);
      }
    }

    return crashes.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * List error groups
   */
  listErrorGroups(status?: ErrorGroup['status']): ErrorGroup[] {
    let groups = Array.from(this.errorGroups.values());

    if (status) {
      groups = groups.filter(g => g.status === status);
    }

    return groups.sort((a, b) => b.count - a.count);
  }

  /**
   * Get error group
   */
  getErrorGroup(groupId: string): ErrorGroup | undefined {
    for (const group of this.errorGroups.values()) {
      if (group.groupId === groupId) {
        return group;
      }
    }
    return undefined;
  }

  // ==================== Metrics ====================

  /**
   * Get crash metrics
   */
  getCrashMetrics(timeRange?: { start: Date; end: Date }): CrashMetrics {
    let crashes = Array.from(this.crashes.values());

    if (timeRange) {
      crashes = crashes.filter(c =>
        c.timestamp >= timeRange.start && c.timestamp <= timeRange.end
      );
    }

    const affectedUsers = new Set<string>();
    const sessionUsers = new Set<string>();

    for (const crash of crashes) {
      if (crash.userId) affectedUsers.add(crash.userId);
    }

    // Estimate total users from sessions
    for (const session of this.sessions.values()) {
      // Would get userId from session
      sessionUsers.add(session.sessionId);
    }

    const totalUsers = Math.max(affectedUsers.size, sessionUsers.size);
    const crashFreeUsers = totalUsers - affectedUsers.size;
    const crashFreeRate = totalUsers > 0 ? (crashFreeUsers / totalUsers) * 100 : 100;

    const crashesPerUser = affectedUsers.size > 0 ? crashes.length / affectedUsers.size : 0;

    // Top crashes
    const groupCounts = new Map<string, { count: number; users: Set<string> }>();

    for (const crash of crashes) {
      if (!groupCounts.has(crash.fingerprint)) {
        groupCounts.set(crash.fingerprint, { count: 0, users: new Set() });
      }

      const gc = groupCounts.get(crash.fingerprint)!;
      gc.count++;
      if (crash.userId) gc.users.add(crash.userId);
    }

    const topCrashes = Array.from(groupCounts.entries())
      .map(([fingerprint, data]) => {
        const group = this.errorGroups.get(fingerprint);
        return {
          groupId: group?.groupId || fingerprint,
          count: data.count,
          affectedUsers: data.users.size,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      crashFreeRate,
      crashFreeUsers,
      totalCrashes: crashes.length,
      affectedUsers: affectedUsers.size,
      crashesPerUser,
      topCrashes,
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): {
    avgDuration: number;
    p95Duration: number;
    slowTraces: number;
    totalTraces: number;
  } {
    if (this.performanceTraces.length === 0) {
      return {
        avgDuration: 0,
        p95Duration: 0,
        slowTraces: 0,
        totalTraces: 0,
      };
    }

    const durations = this.performanceTraces.map(t => t.duration).sort((a, b) => a - b);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const p95Index = Math.floor(durations.length * 0.95);
    const p95Duration = durations[p95Index];
    const slowTraces = durations.filter(d => d > 1000).length;

    return {
      avgDuration,
      p95Duration,
      slowTraces,
      totalTraces: this.performanceTraces.length,
    };
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalCrashes: number;
    totalGroups: number;
    unresolvedGroups: number;
    performanceTraces: number;
    networkTraces: number;
    activeSessions: number;
  } {
    const unresolvedGroups = Array.from(this.errorGroups.values())
      .filter(g => g.status === 'unresolved').length;

    return {
      totalCrashes: this.crashes.size,
      totalGroups: this.errorGroups.size,
      unresolvedGroups,
      performanceTraces: this.performanceTraces.length,
      networkTraces: this.networkTraces.length,
      activeSessions: this.sessions.size,
    };
  }
}

interface SessionDiagnostics {
  sessionId: string;
  breadcrumbs: Breadcrumb[];
  startTime: Date;
}
