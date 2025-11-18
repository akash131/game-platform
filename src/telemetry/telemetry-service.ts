/**
 * Performance Telemetry Service
 *
 * Application Insights / Datadog / New Relic-style performance monitoring
 *
 * Features:
 * - Real-time performance metrics (FPS, memory, CPU, network)
 * - Custom events and metrics tracking
 * - Distributed tracing across services
 * - Automatic error tracking
 * - User session recording
 * - Performance profiling
 * - Anomaly detection and alerts
 * - Custom dashboards and visualizations
 */

import { EventEmitter } from 'eventemitter3';

export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  TIMER = 'timer',
}

export enum Severity {
  VERBOSE = 'verbose',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export interface TelemetryEvent {
  eventId: string;
  name: string;
  timestamp: Date;
  severity: Severity;
  properties?: Record<string, any>;
  measurements?: Record<string, number>;
  sessionId?: string;
  userId?: string;
  context?: EventContext;
}

export interface EventContext {
  application?: {
    version: string;
    build: string;
  };
  device?: {
    type: string;
    model: string;
    os: string;
    osVersion: string;
  };
  location?: {
    country: string;
    region: string;
    city: string;
  };
  user?: {
    id: string;
    accountId?: string;
  };
  session?: {
    id: string;
    isFirst?: boolean;
  };
  game?: {
    id: string;
    name: string;
    mode: string;
  };
}

export interface PerformanceMetric {
  metricId: string;
  name: string;
  type: MetricType;
  value: number;
  timestamp: Date;
  unit?: string;
  tags?: Record<string, string>;
  sessionId?: string;
  userId?: string;
}

export interface Trace {
  traceId: string;
  name: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  spans: Span[];
  status: 'pending' | 'success' | 'error';
  tags?: Record<string, string>;
  userId?: string;
  sessionId?: string;
}

export interface Span {
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'pending' | 'success' | 'error';
  tags?: Record<string, string>;
  events?: SpanEvent[];
}

export interface SpanEvent {
  name: string;
  timestamp: Date;
  attributes?: Record<string, any>;
}

export interface GamePerformanceMetrics {
  sessionId: string;
  userId?: string;
  gameId?: string;
  startTime: Date;
  endTime?: Date;

  // Frame rate metrics
  fps: {
    current: number;
    average: number;
    min: number;
    max: number;
    samples: number[];
  };

  // Memory metrics (in MB)
  memory: {
    used: number;
    total: number;
    peak: number;
    samples: number[];
  };

  // CPU metrics (percentage)
  cpu: {
    usage: number;
    average: number;
    peak: number;
    samples: number[];
  };

  // Network metrics
  network: {
    latency: number; // ms
    averageLatency: number;
    packetLoss: number; // percentage
    bandwidth: number; // kbps
    samples: {
      latency: number[];
      packetLoss: number[];
      bandwidth: number[];
    };
  };

  // Load times
  loadTimes: {
    initial: number;
    levels: Map<string, number>;
    assets: Map<string, number>;
  };

  // Custom metrics
  custom: Map<string, number>;
}

export interface SessionRecording {
  recordingId: string;
  sessionId: string;
  userId?: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  events: RecordingEvent[];
  metadata?: Record<string, any>;
}

export interface RecordingEvent {
  timestamp: Date;
  type: 'input' | 'navigation' | 'interaction' | 'state_change' | 'error';
  data: any;
}

export interface Alert {
  alertId: string;
  name: string;
  description: string;
  severity: Severity;
  condition: AlertCondition;
  actions: AlertAction[];
  enabled: boolean;
  triggered: boolean;
  lastTriggered?: Date;
  triggerCount: number;
  createdAt: Date;
}

export interface AlertCondition {
  metric: string;
  operator: 'greater_than' | 'less_than' | 'equals' | 'not_equals';
  threshold: number;
  timeWindow: number; // seconds
  aggregation: 'average' | 'sum' | 'min' | 'max' | 'count';
}

export interface AlertAction {
  type: 'email' | 'webhook' | 'notification';
  target: string;
  payload?: Record<string, any>;
}

export interface Dashboard {
  dashboardId: string;
  name: string;
  description: string;
  widgets: DashboardWidget[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardWidget {
  widgetId: string;
  type: 'line_chart' | 'bar_chart' | 'pie_chart' | 'number' | 'table';
  title: string;
  query: WidgetQuery;
  position: { x: number; y: number; width: number; height: number };
}

export interface WidgetQuery {
  metric: string;
  aggregation: 'average' | 'sum' | 'min' | 'max' | 'count';
  timeRange: { start: Date; end: Date } | 'last_hour' | 'last_day' | 'last_week' | 'last_month';
  filters?: Record<string, any>;
  groupBy?: string[];
}

export interface AnomalyDetectionResult {
  timestamp: Date;
  metric: string;
  value: number;
  expectedValue: number;
  deviation: number;
  isAnomaly: boolean;
  severity: Severity;
  reason: string;
}

interface TelemetryEvents {
  'metric:recorded': (metric: PerformanceMetric) => void;
  'event:tracked': (event: TelemetryEvent) => void;
  'trace:started': (trace: Trace) => void;
  'trace:completed': (trace: Trace) => void;
  'alert:triggered': (alert: Alert) => void;
  'anomaly:detected': (result: AnomalyDetectionResult) => void;
  'session:started': (session: GamePerformanceMetrics) => void;
  'session:ended': (session: GamePerformanceMetrics) => void;
}

/**
 * TelemetryService
 *
 * Comprehensive performance monitoring and telemetry system
 */
export class TelemetryService extends EventEmitter<TelemetryEvents> {
  private events: Map<string, TelemetryEvent> = new Map();
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private traces: Map<string, Trace> = new Map();
  private activeTraces: Map<string, Trace> = new Map();
  private gameSessions: Map<string, GamePerformanceMetrics> = new Map();
  private recordings: Map<string, SessionRecording> = new Map();
  private alerts: Map<string, Alert> = new Map();
  private dashboards: Map<string, Dashboard> = new Map();

  // Performance monitoring intervals
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();

  // Anomaly detection baselines
  private metricBaselines: Map<string, number[]> = new Map();

  constructor() {
    super();
    this.startAnomalyDetection();
  }

  /**
   * Track custom event
   */
  trackEvent(
    name: string,
    properties?: Record<string, any>,
    measurements?: Record<string, number>,
    options?: {
      severity?: Severity;
      sessionId?: string;
      userId?: string;
      context?: EventContext;
    }
  ): TelemetryEvent {
    const event: TelemetryEvent = {
      eventId: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      timestamp: new Date(),
      severity: options?.severity || Severity.INFO,
      properties,
      measurements,
      sessionId: options?.sessionId,
      userId: options?.userId,
      context: options?.context,
    };

    this.events.set(event.eventId, event);
    this.emit('event:tracked', event);

    return event;
  }

  /**
   * Record performance metric
   */
  recordMetric(
    name: string,
    value: number,
    type: MetricType = MetricType.GAUGE,
    options?: {
      unit?: string;
      tags?: Record<string, string>;
      sessionId?: string;
      userId?: string;
    }
  ): PerformanceMetric {
    const metric: PerformanceMetric = {
      metricId: `metric_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      type,
      value,
      timestamp: new Date(),
      unit: options?.unit,
      tags: options?.tags,
      sessionId: options?.sessionId,
      userId: options?.userId,
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(metric);

    // Update baseline for anomaly detection
    this.updateBaseline(name, value);

    // Check alerts
    this.checkAlerts(name, value);

    this.emit('metric:recorded', metric);

    return metric;
  }

  /**
   * Start distributed trace
   */
  startTrace(
    name: string,
    options?: {
      tags?: Record<string, string>;
      userId?: string;
      sessionId?: string;
    }
  ): string {
    const trace: Trace = {
      traceId: `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      startTime: new Date(),
      spans: [],
      status: 'pending',
      tags: options?.tags,
      userId: options?.userId,
      sessionId: options?.sessionId,
    };

    this.traces.set(trace.traceId, trace);
    this.activeTraces.set(trace.traceId, trace);
    this.emit('trace:started', trace);

    return trace.traceId;
  }

  /**
   * End distributed trace
   */
  endTrace(traceId: string, status: 'success' | 'error' = 'success'): void {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return;

    trace.endTime = new Date();
    trace.duration = trace.endTime.getTime() - trace.startTime.getTime();
    trace.status = status;

    this.activeTraces.delete(traceId);
    this.emit('trace:completed', trace);

    // Record trace duration as metric
    this.recordMetric(`trace.${trace.name}.duration`, trace.duration, MetricType.TIMER, {
      unit: 'ms',
      tags: { status },
    });
  }

  /**
   * Add span to trace
   */
  addSpan(
    traceId: string,
    name: string,
    options?: {
      parentSpanId?: string;
      tags?: Record<string, string>;
    }
  ): string {
    const trace = this.traces.get(traceId);
    if (!trace) {
      throw new Error('Trace not found');
    }

    const span: Span = {
      spanId: `span_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      parentSpanId: options?.parentSpanId,
      name,
      startTime: new Date(),
      status: 'pending',
      tags: options?.tags,
      events: [],
    };

    trace.spans.push(span);
    return span.spanId;
  }

  /**
   * End span
   */
  endSpan(traceId: string, spanId: string, status: 'success' | 'error' = 'success'): void {
    const trace = this.traces.get(traceId);
    if (!trace) return;

    const span = trace.spans.find(s => s.spanId === spanId);
    if (!span) return;

    span.endTime = new Date();
    span.duration = span.endTime.getTime() - span.startTime.getTime();
    span.status = status;
  }

  /**
   * Add event to span
   */
  addSpanEvent(traceId: string, spanId: string, name: string, attributes?: Record<string, any>): void {
    const trace = this.traces.get(traceId);
    if (!trace) return;

    const span = trace.spans.find(s => s.spanId === spanId);
    if (!span) return;

    span.events!.push({
      name,
      timestamp: new Date(),
      attributes,
    });
  }

  /**
   * Start game performance session
   */
  startGameSession(
    sessionId: string,
    options?: {
      userId?: string;
      gameId?: string;
    }
  ): GamePerformanceMetrics {
    const session: GamePerformanceMetrics = {
      sessionId,
      userId: options?.userId,
      gameId: options?.gameId,
      startTime: new Date(),
      fps: {
        current: 0,
        average: 0,
        min: Infinity,
        max: 0,
        samples: [],
      },
      memory: {
        used: 0,
        total: 0,
        peak: 0,
        samples: [],
      },
      cpu: {
        usage: 0,
        average: 0,
        peak: 0,
        samples: [],
      },
      network: {
        latency: 0,
        averageLatency: 0,
        packetLoss: 0,
        bandwidth: 0,
        samples: {
          latency: [],
          packetLoss: [],
          bandwidth: [],
        },
      },
      loadTimes: {
        initial: 0,
        levels: new Map(),
        assets: new Map(),
      },
      custom: new Map(),
    };

    this.gameSessions.set(sessionId, session);
    this.emit('session:started', session);

    // Start automatic performance monitoring
    this.startPerformanceMonitoring(sessionId);

    return session;
  }

  /**
   * End game performance session
   */
  endGameSession(sessionId: string): void {
    const session = this.gameSessions.get(sessionId);
    if (!session) return;

    session.endTime = new Date();

    // Stop performance monitoring
    this.stopPerformanceMonitoring(sessionId);

    this.emit('session:ended', session);
  }

  /**
   * Update FPS metric
   */
  updateFPS(sessionId: string, fps: number): void {
    const session = this.gameSessions.get(sessionId);
    if (!session) return;

    session.fps.current = fps;
    session.fps.samples.push(fps);
    session.fps.min = Math.min(session.fps.min, fps);
    session.fps.max = Math.max(session.fps.max, fps);
    session.fps.average = session.fps.samples.reduce((a, b) => a + b, 0) / session.fps.samples.length;

    this.recordMetric('game.fps', fps, MetricType.GAUGE, {
      sessionId,
      userId: session.userId,
    });
  }

  /**
   * Update memory metrics
   */
  updateMemory(sessionId: string, used: number, total: number): void {
    const session = this.gameSessions.get(sessionId);
    if (!session) return;

    session.memory.used = used;
    session.memory.total = total;
    session.memory.peak = Math.max(session.memory.peak, used);
    session.memory.samples.push(used);

    this.recordMetric('game.memory.used', used, MetricType.GAUGE, {
      unit: 'MB',
      sessionId,
      userId: session.userId,
    });
  }

  /**
   * Update CPU metrics
   */
  updateCPU(sessionId: string, usage: number): void {
    const session = this.gameSessions.get(sessionId);
    if (!session) return;

    session.cpu.usage = usage;
    session.cpu.samples.push(usage);
    session.cpu.peak = Math.max(session.cpu.peak, usage);
    session.cpu.average = session.cpu.samples.reduce((a, b) => a + b, 0) / session.cpu.samples.length;

    this.recordMetric('game.cpu.usage', usage, MetricType.GAUGE, {
      unit: '%',
      sessionId,
      userId: session.userId,
    });
  }

  /**
   * Update network metrics
   */
  updateNetwork(sessionId: string, latency: number, packetLoss: number, bandwidth: number): void {
    const session = this.gameSessions.get(sessionId);
    if (!session) return;

    session.network.latency = latency;
    session.network.packetLoss = packetLoss;
    session.network.bandwidth = bandwidth;

    session.network.samples.latency.push(latency);
    session.network.samples.packetLoss.push(packetLoss);
    session.network.samples.bandwidth.push(bandwidth);

    session.network.averageLatency =
      session.network.samples.latency.reduce((a, b) => a + b, 0) / session.network.samples.latency.length;

    this.recordMetric('game.network.latency', latency, MetricType.GAUGE, {
      unit: 'ms',
      sessionId,
      userId: session.userId,
    });

    this.recordMetric('game.network.packet_loss', packetLoss, MetricType.GAUGE, {
      unit: '%',
      sessionId,
      userId: session.userId,
    });
  }

  /**
   * Record load time
   */
  recordLoadTime(sessionId: string, type: 'initial' | 'level' | 'asset', name: string, duration: number): void {
    const session = this.gameSessions.get(sessionId);
    if (!session) return;

    if (type === 'initial') {
      session.loadTimes.initial = duration;
    } else if (type === 'level') {
      session.loadTimes.levels.set(name, duration);
    } else if (type === 'asset') {
      session.loadTimes.assets.set(name, duration);
    }

    this.recordMetric(`game.load_time.${type}`, duration, MetricType.TIMER, {
      unit: 'ms',
      tags: { name },
      sessionId,
      userId: session.userId,
    });
  }

  /**
   * Start session recording
   */
  startRecording(
    sessionId: string,
    options?: {
      userId?: string;
      metadata?: Record<string, any>;
    }
  ): SessionRecording {
    const recording: SessionRecording = {
      recordingId: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      userId: options?.userId,
      startTime: new Date(),
      events: [],
      metadata: options?.metadata,
    };

    this.recordings.set(recording.recordingId, recording);
    return recording;
  }

  /**
   * Add event to recording
   */
  addRecordingEvent(
    recordingId: string,
    type: RecordingEvent['type'],
    data: any
  ): void {
    const recording = this.recordings.get(recordingId);
    if (!recording) return;

    recording.events.push({
      timestamp: new Date(),
      type,
      data,
    });
  }

  /**
   * Stop session recording
   */
  stopRecording(recordingId: string): void {
    const recording = this.recordings.get(recordingId);
    if (!recording) return;

    recording.endTime = new Date();
    recording.duration = recording.endTime.getTime() - recording.startTime.getTime();
  }

  /**
   * Create alert
   */
  createAlert(
    name: string,
    description: string,
    condition: AlertCondition,
    actions: AlertAction[],
    severity: Severity = Severity.WARNING
  ): Alert {
    const alert: Alert = {
      alertId: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      severity,
      condition,
      actions,
      enabled: true,
      triggered: false,
      triggerCount: 0,
      createdAt: new Date(),
    };

    this.alerts.set(alert.alertId, alert);
    return alert;
  }

  /**
   * Enable/disable alert
   */
  setAlertEnabled(alertId: string, enabled: boolean): void {
    const alert = this.alerts.get(alertId);
    if (!alert) return;

    alert.enabled = enabled;
  }

  /**
   * Create dashboard
   */
  createDashboard(
    name: string,
    description: string,
    widgets: DashboardWidget[] = []
  ): Dashboard {
    const dashboard: Dashboard = {
      dashboardId: `dash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      widgets,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.dashboards.set(dashboard.dashboardId, dashboard);
    return dashboard;
  }

  /**
   * Add widget to dashboard
   */
  addWidget(dashboardId: string, widget: DashboardWidget): void {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return;

    dashboard.widgets.push(widget);
    dashboard.updatedAt = new Date();
  }

  /**
   * Query metrics
   */
  queryMetrics(
    metric: string,
    options?: {
      timeRange?: { start: Date; end: Date };
      aggregation?: 'average' | 'sum' | 'min' | 'max' | 'count';
      groupBy?: string;
    }
  ): any {
    const metricData = this.metrics.get(metric);
    if (!metricData) return null;

    let filtered = metricData;

    if (options?.timeRange) {
      filtered = filtered.filter(m =>
        m.timestamp >= options.timeRange!.start && m.timestamp <= options.timeRange!.end
      );
    }

    if (options?.aggregation) {
      const values = filtered.map(m => m.value);
      switch (options.aggregation) {
        case 'average':
          return values.reduce((a, b) => a + b, 0) / values.length;
        case 'sum':
          return values.reduce((a, b) => a + b, 0);
        case 'min':
          return Math.min(...values);
        case 'max':
          return Math.max(...values);
        case 'count':
          return values.length;
      }
    }

    return filtered;
  }

  /**
   * Get session metrics
   */
  getSessionMetrics(sessionId: string): GamePerformanceMetrics | null {
    return this.gameSessions.get(sessionId) || null;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): GamePerformanceMetrics[] {
    return Array.from(this.gameSessions.values()).filter(s => !s.endTime);
  }

  // Private helper methods

  private startPerformanceMonitoring(sessionId: string): void {
    // Simulate performance monitoring
    const interval = setInterval(() => {
      const session = this.gameSessions.get(sessionId);
      if (!session || session.endTime) {
        this.stopPerformanceMonitoring(sessionId);
        return;
      }

      // Simulate metrics (in real app, these would be actual measurements)
      this.updateFPS(sessionId, 60 + Math.random() * 10 - 5);
      this.updateMemory(sessionId, 500 + Math.random() * 100, 2048);
      this.updateCPU(sessionId, 40 + Math.random() * 20);
      this.updateNetwork(sessionId, 50 + Math.random() * 30, Math.random() * 2, 1000 + Math.random() * 500);
    }, 1000); // Update every second

    this.monitoringIntervals.set(sessionId, interval);
  }

  private stopPerformanceMonitoring(sessionId: string): void {
    const interval = this.monitoringIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(sessionId);
    }
  }

  private updateBaseline(metric: string, value: number): void {
    if (!this.metricBaselines.has(metric)) {
      this.metricBaselines.set(metric, []);
    }

    const baseline = this.metricBaselines.get(metric)!;
    baseline.push(value);

    // Keep only last 1000 samples
    if (baseline.length > 1000) {
      baseline.shift();
    }
  }

  private checkAlerts(metric: string, value: number): void {
    for (const alert of this.alerts.values()) {
      if (!alert.enabled || alert.condition.metric !== metric) continue;

      const shouldTrigger = this.evaluateAlertCondition(alert.condition, value);

      if (shouldTrigger && !alert.triggered) {
        alert.triggered = true;
        alert.lastTriggered = new Date();
        alert.triggerCount++;
        this.emit('alert:triggered', alert);
        this.executeAlertActions(alert);
      } else if (!shouldTrigger && alert.triggered) {
        alert.triggered = false;
      }
    }
  }

  private evaluateAlertCondition(condition: AlertCondition, value: number): boolean {
    switch (condition.operator) {
      case 'greater_than':
        return value > condition.threshold;
      case 'less_than':
        return value < condition.threshold;
      case 'equals':
        return value === condition.threshold;
      case 'not_equals':
        return value !== condition.threshold;
      default:
        return false;
    }
  }

  private executeAlertActions(alert: Alert): void {
    for (const action of alert.actions) {
      switch (action.type) {
        case 'email':
          // Send email notification
          console.log(`Sending alert email to ${action.target}`);
          break;
        case 'webhook':
          // Call webhook
          console.log(`Calling webhook ${action.target}`);
          break;
        case 'notification':
          // Send push notification
          console.log(`Sending push notification to ${action.target}`);
          break;
      }
    }
  }

  private startAnomalyDetection(): void {
    // Check for anomalies every 30 seconds
    setInterval(() => {
      for (const [metricName, baseline] of this.metricBaselines.entries()) {
        if (baseline.length < 30) continue; // Need enough data

        const recent = this.metrics.get(metricName);
        if (!recent || recent.length === 0) continue;

        const latestValue = recent[recent.length - 1].value;
        const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
        const variance = baseline.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / baseline.length;
        const stdDev = Math.sqrt(variance);

        const deviation = Math.abs(latestValue - mean) / stdDev;

        if (deviation > 3) { // 3 sigma rule
          const result: AnomalyDetectionResult = {
            timestamp: new Date(),
            metric: metricName,
            value: latestValue,
            expectedValue: mean,
            deviation,
            isAnomaly: true,
            severity: deviation > 5 ? Severity.CRITICAL : Severity.WARNING,
            reason: `Value ${latestValue.toFixed(2)} deviates ${deviation.toFixed(2)} standard deviations from mean ${mean.toFixed(2)}`,
          };

          this.emit('anomaly:detected', result);
        }
      }
    }, 30000); // Every 30 seconds
  }
}
