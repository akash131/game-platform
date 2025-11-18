import { EventEmitter } from 'eventemitter3';

/**
 * Monitoring and Metrics - Comprehensive observability for game infrastructure
 * Similar to AWS CloudWatch metrics for GameLift
 */

export interface MetricDataPoint {
  timestamp: Date;
  value: number;
  unit: MetricUnit;
}

export enum MetricUnit {
  None = 'None',
  Count = 'Count',
  Percent = 'Percent',
  Seconds = 'Seconds',
  Milliseconds = 'Milliseconds',
  Bytes = 'Bytes',
  Kilobytes = 'Kilobytes',
  Megabytes = 'Megabytes',
  Gigabytes = 'Gigabytes',
  CountPerSecond = 'Count/Second',
  BytesPerSecond = 'Bytes/Second',
}

export interface MetricDimension {
  name: string;
  value: string;
}

export interface Metric {
  namespace: string;
  metricName: string;
  dimensions: MetricDimension[];
  dataPoints: MetricDataPoint[];
}

export interface MetricStatistics {
  sampleCount: number;
  sum: number;
  average: number;
  minimum: number;
  maximum: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface Alarm {
  alarmName: string;
  alarmArn?: string;
  description?: string;
  metricName: string;
  namespace: string;
  dimensions?: MetricDimension[];
  threshold: number;
  comparisonOperator: 'GreaterThanThreshold' | 'LessThanThreshold' | 'GreaterThanOrEqualToThreshold' | 'LessThanOrEqualToThreshold';
  evaluationPeriods: number;
  period: number; // seconds
  statistic: 'Average' | 'Sum' | 'Minimum' | 'Maximum' | 'SampleCount';
  state: 'OK' | 'ALARM' | 'INSUFFICIENT_DATA';
  stateReason?: string;
  stateUpdatedTimestamp?: Date;
  actionsEnabled: boolean;
  alarmActions?: string[];
  okActions?: string[];
}

export interface Dashboard {
  dashboardName: string;
  widgets: DashboardWidget[];
}

export interface DashboardWidget {
  type: 'metric' | 'text' | 'log';
  title: string;
  metrics?: string[];
  properties?: Record<string, any>;
}

export interface LogEntry {
  timestamp: Date;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  message: string;
  metadata?: Record<string, any>;
  source?: string;
  fleetId?: string;
  instanceId?: string;
  gameSessionId?: string;
}

export interface MonitoringEvents {
  'metricPublished': (metric: Metric) => void;
  'alarmStateChange': (alarm: Alarm, oldState: string, newState: string) => void;
  'anomalyDetected': (metric: string, value: number, expected: number) => void;
}

export class MonitoringService extends EventEmitter<MonitoringEvents> {
  private metrics: Map<string, Metric> = new Map();
  private alarms: Map<string, Alarm> = new Map();
  private dashboards: Map<string, Dashboard> = new Map();
  private logs: LogEntry[] = [];
  private readonly MAX_LOGS = 10000;
  private readonly MAX_DATA_POINTS = 1000;
  private evaluationInterval: NodeJS.Timeout | null = null;

  // Common GameLift metrics
  public static readonly METRICS = {
    // Fleet metrics
    ACTIVE_INSTANCES: 'ActiveInstances',
    DESIRED_INSTANCES: 'DesiredInstances',
    IDLE_INSTANCES: 'IdleInstances',
    MAX_INSTANCES: 'MaxInstances',
    MIN_INSTANCES: 'MinInstances',
    PERCENT_IDLE_INSTANCES: 'PercentIdleInstances',
    INSTANCE_INTERRUPTIONS: 'InstanceInterruptions',

    // Game session metrics
    ACTIVE_GAME_SESSIONS: 'ActiveGameSessions',
    ACTIVATING_GAME_SESSIONS: 'ActivatingGameSessions',
    AVAILABLE_GAME_SESSIONS: 'AvailableGameSessions',
    PERCENT_AVAILABLE_GAME_SESSIONS: 'PercentAvailableGameSessions',
    GAME_SESSION_INTERRUPTIONS: 'GameSessionInterruptions',

    // Player session metrics
    CURRENT_PLAYER_SESSIONS: 'CurrentPlayerSessions',
    PLAYER_SESSION_ACTIVATIONS: 'PlayerSessionActivations',

    // Server process metrics
    ACTIVE_SERVER_PROCESSES: 'ActiveServerProcesses',
    HEALTHY_SERVER_PROCESSES: 'HealthyServerProcesses',
    PERCENT_HEALTHY_SERVER_PROCESSES: 'PercentHealthyServerProcesses',
    SERVER_PROCESS_ABNORMAL_TERMINATIONS: 'ServerProcessAbnormalTerminations',
    SERVER_PROCESS_ACTIVATIONS: 'ServerProcessActivations',
    SERVER_PROCESS_TERMINATIONS: 'ServerProcessTerminations',

    // Matchmaking metrics
    MATCHMAKING_SUCCEEDED: 'MatchmakingSucceeded',
    MATCHMAKING_FAILED: 'MatchmakingFailed',
    MATCHMAKING_TIMED_OUT: 'MatchmakingTimedOut',
    MATCHMAKING_CANCELLED: 'MatchmakingCancelled',
    TIME_TO_MATCH: 'TimeToMatch',
    PLAYERS_IN_QUEUE: 'PlayersInQueue',

    // Placement metrics
    PLACEMENT_SUCCEEDED: 'PlacementSucceeded',
    PLACEMENT_FAILED: 'PlacementFailed',
    PLACEMENT_TIMED_OUT: 'PlacementTimedOut',
    PLACEMENT_CANCELLED: 'PlacementCancelled',
    TIME_TO_PLACEMENT: 'TimeToPlacement',

    // Performance metrics
    CPU_UTILIZATION: 'CPUUtilization',
    NETWORK_IN: 'NetworkIn',
    NETWORK_OUT: 'NetworkOut',
    DISK_READ_OPS: 'DiskReadOps',
    DISK_WRITE_OPS: 'DiskWriteOps',
  };

  constructor() {
    super();
  }

  /**
   * Start monitoring service
   */
  start(): void {
    if (this.evaluationInterval) {
      return; // Already running
    }

    this.evaluationInterval = setInterval(() => {
      this.evaluateAlarms();
    }, 60000); // Evaluate every minute

    console.log('Monitoring service started');
  }

  /**
   * Stop monitoring service
   */
  stop(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }

    console.log('Monitoring service stopped');
  }

  /**
   * Put metric data
   */
  putMetricData(
    namespace: string,
    metricName: string,
    value: number,
    unit: MetricUnit = MetricUnit.None,
    dimensions: MetricDimension[] = []
  ): void {
    const metricKey = this.getMetricKey(namespace, metricName, dimensions);

    let metric = this.metrics.get(metricKey);
    if (!metric) {
      metric = {
        namespace,
        metricName,
        dimensions,
        dataPoints: [],
      };
      this.metrics.set(metricKey, metric);
    }

    const dataPoint: MetricDataPoint = {
      timestamp: new Date(),
      value,
      unit,
    };

    metric.dataPoints.push(dataPoint);

    // Keep only recent data points
    if (metric.dataPoints.length > this.MAX_DATA_POINTS) {
      metric.dataPoints = metric.dataPoints.slice(-this.MAX_DATA_POINTS);
    }

    this.emit('metricPublished', metric);
  }

  /**
   * Get metric statistics
   */
  getMetricStatistics(
    namespace: string,
    metricName: string,
    startTime: Date,
    endTime: Date,
    dimensions: MetricDimension[] = []
  ): MetricStatistics | null {
    const metricKey = this.getMetricKey(namespace, metricName, dimensions);
    const metric = this.metrics.get(metricKey);

    if (!metric) {
      return null;
    }

    // Filter data points by time range
    const dataPoints = metric.dataPoints.filter(
      dp => dp.timestamp >= startTime && dp.timestamp <= endTime
    );

    if (dataPoints.length === 0) {
      return null;
    }

    const values = dataPoints.map(dp => dp.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      sampleCount: values.length,
      sum,
      average: sum / values.length,
      minimum: values[0],
      maximum: values[values.length - 1],
      p50: this.percentile(values, 50),
      p90: this.percentile(values, 90),
      p95: this.percentile(values, 95),
      p99: this.percentile(values, 99),
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;

    const index = (p / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) {
      return sortedValues[lower];
    }

    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  /**
   * Put metric alarm
   */
  putMetricAlarm(alarm: Omit<Alarm, 'alarmArn' | 'state' | 'stateUpdatedTimestamp'>): Alarm {
    const fullAlarm: Alarm = {
      ...alarm,
      alarmArn: `arn:aws:cloudwatch:region:account:alarm:${alarm.alarmName}`,
      state: 'INSUFFICIENT_DATA',
      stateUpdatedTimestamp: new Date(),
    };

    this.alarms.set(alarm.alarmName, fullAlarm);
    return fullAlarm;
  }

  /**
   * Delete alarm
   */
  deleteAlarm(alarmName: string): void {
    this.alarms.delete(alarmName);
  }

  /**
   * Get alarm
   */
  getAlarm(alarmName: string): Alarm | undefined {
    return this.alarms.get(alarmName);
  }

  /**
   * List alarms
   */
  listAlarms(stateFilter?: Alarm['state']): Alarm[] {
    const alarms = Array.from(this.alarms.values());

    if (stateFilter) {
      return alarms.filter(a => a.state === stateFilter);
    }

    return alarms;
  }

  /**
   * Evaluate all alarms
   */
  private evaluateAlarms(): void {
    const now = new Date();
    const evaluationWindow = 300000; // 5 minutes

    for (const alarm of this.alarms.values()) {
      const startTime = new Date(now.getTime() - alarm.period * alarm.evaluationPeriods * 1000);

      const stats = this.getMetricStatistics(
        alarm.namespace,
        alarm.metricName,
        startTime,
        now,
        alarm.dimensions
      );

      if (!stats) {
        this.updateAlarmState(alarm, 'INSUFFICIENT_DATA', 'Not enough data');
        continue;
      }

      const value = this.getStatisticValue(stats, alarm.statistic);
      const breached = this.evaluateThreshold(value, alarm.threshold, alarm.comparisonOperator);

      const newState = breached ? 'ALARM' : 'OK';
      const reason = breached
        ? `Threshold Crossed: ${value} ${alarm.comparisonOperator} ${alarm.threshold}`
        : 'Threshold not breached';

      this.updateAlarmState(alarm, newState, reason);
    }
  }

  /**
   * Get statistic value
   */
  private getStatisticValue(stats: MetricStatistics, statistic: Alarm['statistic']): number {
    switch (statistic) {
      case 'Average':
        return stats.average;
      case 'Sum':
        return stats.sum;
      case 'Minimum':
        return stats.minimum;
      case 'Maximum':
        return stats.maximum;
      case 'SampleCount':
        return stats.sampleCount;
      default:
        return stats.average;
    }
  }

  /**
   * Evaluate threshold
   */
  private evaluateThreshold(
    value: number,
    threshold: number,
    operator: Alarm['comparisonOperator']
  ): boolean {
    switch (operator) {
      case 'GreaterThanThreshold':
        return value > threshold;
      case 'LessThanThreshold':
        return value < threshold;
      case 'GreaterThanOrEqualToThreshold':
        return value >= threshold;
      case 'LessThanOrEqualToThreshold':
        return value <= threshold;
      default:
        return false;
    }
  }

  /**
   * Update alarm state
   */
  private updateAlarmState(alarm: Alarm, newState: Alarm['state'], reason: string): void {
    if (alarm.state === newState) {
      return; // No change
    }

    const oldState = alarm.state;
    alarm.state = newState;
    alarm.stateReason = reason;
    alarm.stateUpdatedTimestamp = new Date();

    this.emit('alarmStateChange', alarm, oldState, newState);

    // Trigger actions
    if (alarm.actionsEnabled) {
      if (newState === 'ALARM' && alarm.alarmActions) {
        this.executeActions(alarm.alarmActions, alarm);
      } else if (newState === 'OK' && alarm.okActions) {
        this.executeActions(alarm.okActions, alarm);
      }
    }
  }

  /**
   * Execute alarm actions
   */
  private executeActions(actions: string[], alarm: Alarm): void {
    for (const action of actions) {
      console.log(`Executing action: ${action} for alarm: ${alarm.alarmName}`);
      // In real implementation, would trigger SNS, Lambda, Auto-scaling, etc.
    }
  }

  /**
   * Create dashboard
   */
  createDashboard(name: string, widgets: DashboardWidget[]): Dashboard {
    const dashboard: Dashboard = {
      dashboardName: name,
      widgets,
    };

    this.dashboards.set(name, dashboard);
    return dashboard;
  }

  /**
   * Get dashboard
   */
  getDashboard(name: string): Dashboard | undefined {
    return this.dashboards.get(name);
  }

  /**
   * Log entry
   */
  log(entry: Omit<LogEntry, 'timestamp'>): void {
    const fullEntry: LogEntry = {
      ...entry,
      timestamp: new Date(),
    };

    this.logs.push(fullEntry);

    // Keep only recent logs
    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(-this.MAX_LOGS);
    }
  }

  /**
   * Query logs
   */
  queryLogs(filter: {
    startTime?: Date;
    endTime?: Date;
    level?: LogEntry['level'];
    source?: string;
    fleetId?: string;
    instanceId?: string;
    gameSessionId?: string;
    searchTerm?: string;
  }): LogEntry[] {
    let logs = this.logs;

    if (filter.startTime) {
      logs = logs.filter(log => log.timestamp >= filter.startTime!);
    }

    if (filter.endTime) {
      logs = logs.filter(log => log.timestamp <= filter.endTime!);
    }

    if (filter.level) {
      logs = logs.filter(log => log.level === filter.level);
    }

    if (filter.source) {
      logs = logs.filter(log => log.source === filter.source);
    }

    if (filter.fleetId) {
      logs = logs.filter(log => log.fleetId === filter.fleetId);
    }

    if (filter.instanceId) {
      logs = logs.filter(log => log.instanceId === filter.instanceId);
    }

    if (filter.gameSessionId) {
      logs = logs.filter(log => log.gameSessionId === filter.gameSessionId);
    }

    if (filter.searchTerm) {
      logs = logs.filter(log =>
        log.message.toLowerCase().includes(filter.searchTerm!.toLowerCase())
      );
    }

    return logs;
  }

  /**
   * Get metric key
   */
  private getMetricKey(namespace: string, metricName: string, dimensions: MetricDimension[]): string {
    const dimStr = dimensions
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(d => `${d.name}=${d.value}`)
      .join(',');

    return `${namespace}:${metricName}:${dimStr}`;
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): {
    totalMetrics: number;
    totalDataPoints: number;
    namespaces: string[];
  } {
    const namespaces = new Set<string>();
    let totalDataPoints = 0;

    for (const metric of this.metrics.values()) {
      namespaces.add(metric.namespace);
      totalDataPoints += metric.dataPoints.length;
    }

    return {
      totalMetrics: this.metrics.size,
      totalDataPoints,
      namespaces: Array.from(namespaces),
    };
  }

  /**
   * Clean up old data
   */
  cleanup(olderThanMs: number = 3600000): void {
    const cutoffTime = new Date(Date.now() - olderThanMs);

    // Clean metrics
    for (const metric of this.metrics.values()) {
      metric.dataPoints = metric.dataPoints.filter(dp => dp.timestamp > cutoffTime);
    }

    // Clean logs
    this.logs = this.logs.filter(log => log.timestamp > cutoffTime);
  }
}

/**
 * Helper to create common GameLift alarms
 */
export class GameLiftAlarms {
  static createHighCPUAlarm(
    monitoring: MonitoringService,
    fleetId: string,
    threshold: number = 80
  ): Alarm {
    return monitoring.putMetricAlarm({
      alarmName: `${fleetId}-HighCPU`,
      description: 'Alert when CPU utilization is high',
      namespace: 'AWS/GameLift',
      metricName: MonitoringService.METRICS.CPU_UTILIZATION,
      dimensions: [{ name: 'FleetId', value: fleetId }],
      threshold,
      comparisonOperator: 'GreaterThanThreshold',
      evaluationPeriods: 2,
      period: 300,
      statistic: 'Average',
      actionsEnabled: true,
    });
  }

  static createLowAvailableSessionsAlarm(
    monitoring: MonitoringService,
    fleetId: string,
    threshold: number = 10
  ): Alarm {
    return monitoring.putMetricAlarm({
      alarmName: `${fleetId}-LowAvailableSessions`,
      description: 'Alert when available game sessions are low',
      namespace: 'AWS/GameLift',
      metricName: MonitoringService.METRICS.PERCENT_AVAILABLE_GAME_SESSIONS,
      dimensions: [{ name: 'FleetId', value: fleetId }],
      threshold,
      comparisonOperator: 'LessThanThreshold',
      evaluationPeriods: 3,
      period: 300,
      statistic: 'Average',
      actionsEnabled: true,
    });
  }

  static createUnhealthyServersAlarm(
    monitoring: MonitoringService,
    fleetId: string,
    threshold: number = 90
  ): Alarm {
    return monitoring.putMetricAlarm({
      alarmName: `${fleetId}-UnhealthyServers`,
      description: 'Alert when server process health is low',
      namespace: 'AWS/GameLift',
      metricName: MonitoringService.METRICS.PERCENT_HEALTHY_SERVER_PROCESSES,
      dimensions: [{ name: 'FleetId', value: fleetId }],
      threshold,
      comparisonOperator: 'LessThanThreshold',
      evaluationPeriods: 2,
      period: 300,
      statistic: 'Average',
      actionsEnabled: true,
    });
  }
}
