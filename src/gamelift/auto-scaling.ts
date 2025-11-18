import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

/**
 * Auto-Scaling - Automatic fleet scaling based on capacity and demand
 * Similar to AWS GameLift auto-scaling
 */

export interface ScalingPolicy {
  policyName: string;
  policyArn?: string;
  fleetId: string;
  metricName: 'PercentAvailableGameSessions' | 'PercentIdleInstances' | 'QueueDepth' | 'WaitTime';
  targetValue: number;
  comparisonOperator?: 'GreaterThanOrEqualToThreshold' | 'GreaterThanThreshold' | 'LessThanThreshold' | 'LessThanOrEqualToThreshold';
  threshold?: number;
  evaluationPeriods?: number;
  scalingAdjustmentType: 'ChangeInCapacity' | 'ExactCapacity' | 'PercentChangeInCapacity';
  scalingAdjustment: number;
  cooldown?: number; // Seconds
  targetTrackingConfiguration?: {
    targetValue: number;
    scaleInCooldown?: number;
    scaleOutCooldown?: number;
    disableScaleIn?: boolean;
  };
}

export interface FleetCapacity {
  fleetId: string;
  instanceType: string;
  desiredInstances: number;
  minInstances: number;
  maxInstances: number;
  activeInstances: number;
  idleInstances: number;
  terminatingInstances: number;
  pendingInstances: number;
  location?: string;
}

export interface FleetUtilization {
  fleetId: string;
  activeServerProcessCount: number;
  activeGameSessionCount: number;
  currentPlayerSessionCount: number;
  maximumPlayerSessionCount: number;
  percentAvailableGameSessions: number;
  percentIdleInstances: number;
  location?: string;
}

export interface ScalingEvent {
  eventId: string;
  fleetId: string;
  policyName: string;
  timestamp: Date;
  action: 'SCALE_OUT' | 'SCALE_IN';
  desiredCapacityBefore: number;
  desiredCapacityAfter: number;
  reason: string;
  metricValue: number;
}

export interface ScalingTarget {
  fleetId: string;
  minCapacity: number;
  maxCapacity: number;
  targetValue: number;
  metricName: string;
  lastScaleTime?: Date;
  cooldownUntil?: Date;
}

export interface AutoScalingEvents {
  'scalingTriggered': (event: ScalingEvent) => void;
  'scalingCompleted': (event: ScalingEvent) => void;
  'scalingCooldown': (fleetId: string, cooldownSeconds: number) => void;
  'capacityUpdated': (fleetId: string, capacity: FleetCapacity) => void;
}

export class AutoScalingService extends EventEmitter<AutoScalingEvents> {
  private policies: Map<string, ScalingPolicy[]> = new Map(); // fleetId -> policies
  private fleetCapacities: Map<string, FleetCapacity> = new Map();
  private fleetUtilizations: Map<string, FleetUtilization> = new Map();
  private scalingTargets: Map<string, ScalingTarget> = new Map();
  private scalingEvents: ScalingEvent[] = [];
  private evaluationInterval: NodeJS.Timeout | null = null;
  private readonly EVALUATION_INTERVAL_MS = 60000; // 1 minute

  constructor() {
    super();
  }

  /**
   * Start auto-scaling service
   */
  start(): void {
    if (this.evaluationInterval) {
      return; // Already running
    }

    this.evaluationInterval = setInterval(() => {
      this.evaluateAllPolicies();
    }, this.EVALUATION_INTERVAL_MS);

    console.log('Auto-scaling service started');
  }

  /**
   * Stop auto-scaling service
   */
  stop(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }

    console.log('Auto-scaling service stopped');
  }

  /**
   * Put scaling policy
   */
  putScalingPolicy(policy: Omit<ScalingPolicy, 'policyArn'>): ScalingPolicy {
    const fullPolicy: ScalingPolicy = {
      ...policy,
      policyArn: `arn:aws:gamelift:region:account:scalingpolicy/${policy.fleetId}/${policy.policyName}`,
      cooldown: policy.cooldown || 300, // Default 5 minutes
      evaluationPeriods: policy.evaluationPeriods || 1,
    };

    // Get or create policy list for fleet
    if (!this.policies.has(policy.fleetId)) {
      this.policies.set(policy.fleetId, []);
    }

    const fleetPolicies = this.policies.get(policy.fleetId)!;

    // Remove existing policy with same name
    const existingIndex = fleetPolicies.findIndex(p => p.policyName === policy.policyName);
    if (existingIndex >= 0) {
      fleetPolicies.splice(existingIndex, 1);
    }

    fleetPolicies.push(fullPolicy);

    // If using target tracking, set up target
    if (fullPolicy.targetTrackingConfiguration) {
      this.scalingTargets.set(policy.fleetId, {
        fleetId: policy.fleetId,
        minCapacity: this.fleetCapacities.get(policy.fleetId)?.minInstances || 1,
        maxCapacity: this.fleetCapacities.get(policy.fleetId)?.maxInstances || 10,
        targetValue: fullPolicy.targetTrackingConfiguration.targetValue,
        metricName: fullPolicy.metricName,
      });
    }

    return fullPolicy;
  }

  /**
   * Delete scaling policy
   */
  deleteScalingPolicy(fleetId: string, policyName: string): void {
    const fleetPolicies = this.policies.get(fleetId);
    if (!fleetPolicies) {
      return;
    }

    const index = fleetPolicies.findIndex(p => p.policyName === policyName);
    if (index >= 0) {
      fleetPolicies.splice(index, 1);
    }

    if (fleetPolicies.length === 0) {
      this.policies.delete(fleetId);
    }
  }

  /**
   * Update fleet capacity
   */
  updateFleetCapacity(capacity: FleetCapacity): void {
    this.fleetCapacities.set(capacity.fleetId, capacity);
  }

  /**
   * Update fleet utilization
   */
  updateFleetUtilization(utilization: FleetUtilization): void {
    this.fleetUtilizations.set(utilization.fleetId, utilization);
  }

  /**
   * Set fleet capacity limits
   */
  setFleetCapacityLimits(fleetId: string, minInstances: number, maxInstances: number): void {
    const capacity = this.fleetCapacities.get(fleetId);
    if (capacity) {
      capacity.minInstances = minInstances;
      capacity.maxInstances = maxInstances;

      // Adjust desired if outside new limits
      if (capacity.desiredInstances < minInstances) {
        capacity.desiredInstances = minInstances;
      } else if (capacity.desiredInstances > maxInstances) {
        capacity.desiredInstances = maxInstances;
      }
    }
  }

  /**
   * Evaluate all policies
   */
  private evaluateAllPolicies(): void {
    for (const [fleetId, fleetPolicies] of this.policies) {
      // Check if in cooldown
      const target = this.scalingTargets.get(fleetId);
      if (target?.cooldownUntil && target.cooldownUntil > new Date()) {
        continue; // Still in cooldown
      }

      for (const policy of fleetPolicies) {
        this.evaluatePolicy(policy);
      }
    }
  }

  /**
   * Evaluate single policy
   */
  private evaluatePolicy(policy: ScalingPolicy): void {
    const capacity = this.fleetCapacities.get(policy.fleetId);
    const utilization = this.fleetUtilizations.get(policy.fleetId);

    if (!capacity || !utilization) {
      return; // No data available
    }

    // Get metric value
    const metricValue = this.getMetricValue(policy.metricName, capacity, utilization);

    // Target tracking
    if (policy.targetTrackingConfiguration) {
      this.evaluateTargetTracking(policy, metricValue, capacity);
      return;
    }

    // Threshold-based scaling
    if (policy.threshold !== undefined && policy.comparisonOperator) {
      this.evaluateThresholdPolicy(policy, metricValue, capacity);
    }
  }

  /**
   * Get metric value
   */
  private getMetricValue(
    metricName: ScalingPolicy['metricName'],
    capacity: FleetCapacity,
    utilization: FleetUtilization
  ): number {
    switch (metricName) {
      case 'PercentAvailableGameSessions':
        return utilization.percentAvailableGameSessions;

      case 'PercentIdleInstances':
        return utilization.percentIdleInstances;

      case 'QueueDepth':
        // Would integrate with matchmaking queue
        return 0;

      case 'WaitTime':
        // Would integrate with matchmaking wait times
        return 0;

      default:
        return 0;
    }
  }

  /**
   * Evaluate target tracking policy
   */
  private evaluateTargetTracking(
    policy: ScalingPolicy,
    currentValue: number,
    capacity: FleetCapacity
  ): void {
    const config = policy.targetTrackingConfiguration!;
    const targetValue = config.targetValue;

    // Calculate desired capacity using proportional scaling
    const currentCapacity = capacity.activeInstances + capacity.pendingInstances;
    let desiredCapacity: number;

    if (currentValue > 0) {
      // Scale to meet target
      desiredCapacity = Math.round(currentCapacity * (currentValue / targetValue));
    } else {
      desiredCapacity = currentCapacity;
    }

    // Apply limits
    desiredCapacity = Math.max(capacity.minInstances, Math.min(capacity.maxInstances, desiredCapacity));

    // Determine if we need to scale
    let shouldScale = false;
    let action: 'SCALE_OUT' | 'SCALE_IN' = 'SCALE_OUT';

    if (desiredCapacity > currentCapacity) {
      // Scale out
      shouldScale = true;
      action = 'SCALE_OUT';
    } else if (desiredCapacity < currentCapacity) {
      // Scale in (if not disabled)
      if (!config.disableScaleIn) {
        shouldScale = true;
        action = 'SCALE_IN';
      }
    }

    if (shouldScale && desiredCapacity !== capacity.desiredInstances) {
      const cooldown = action === 'SCALE_OUT'
        ? (config.scaleOutCooldown || policy.cooldown || 300)
        : (config.scaleInCooldown || policy.cooldown || 300);

      this.triggerScaling(policy, action, desiredCapacity, currentValue, capacity, cooldown);
    }
  }

  /**
   * Evaluate threshold-based policy
   */
  private evaluateThresholdPolicy(
    policy: ScalingPolicy,
    metricValue: number,
    capacity: FleetCapacity
  ): void {
    const threshold = policy.threshold!;
    const operator = policy.comparisonOperator!;

    let shouldScale = false;

    switch (operator) {
      case 'GreaterThanOrEqualToThreshold':
        shouldScale = metricValue >= threshold;
        break;
      case 'GreaterThanThreshold':
        shouldScale = metricValue > threshold;
        break;
      case 'LessThanThreshold':
        shouldScale = metricValue < threshold;
        break;
      case 'LessThanOrEqualToThreshold':
        shouldScale = metricValue <= threshold;
        break;
    }

    if (shouldScale) {
      const desiredCapacity = this.calculateAdjustedCapacity(
        policy,
        capacity.desiredInstances
      );

      const action = desiredCapacity > capacity.desiredInstances ? 'SCALE_OUT' : 'SCALE_IN';

      this.triggerScaling(
        policy,
        action,
        desiredCapacity,
        metricValue,
        capacity,
        policy.cooldown || 300
      );
    }
  }

  /**
   * Calculate adjusted capacity
   */
  private calculateAdjustedCapacity(policy: ScalingPolicy, currentCapacity: number): number {
    let newCapacity: number;

    switch (policy.scalingAdjustmentType) {
      case 'ChangeInCapacity':
        newCapacity = currentCapacity + policy.scalingAdjustment;
        break;

      case 'ExactCapacity':
        newCapacity = policy.scalingAdjustment;
        break;

      case 'PercentChangeInCapacity':
        const change = Math.round(currentCapacity * (policy.scalingAdjustment / 100));
        newCapacity = currentCapacity + change;
        break;

      default:
        newCapacity = currentCapacity;
    }

    return newCapacity;
  }

  /**
   * Trigger scaling action
   */
  private triggerScaling(
    policy: ScalingPolicy,
    action: 'SCALE_OUT' | 'SCALE_IN',
    newCapacity: number,
    metricValue: number,
    capacity: FleetCapacity,
    cooldownSeconds: number
  ): void {
    const event: ScalingEvent = {
      eventId: uuidv4(),
      fleetId: policy.fleetId,
      policyName: policy.policyName,
      timestamp: new Date(),
      action,
      desiredCapacityBefore: capacity.desiredInstances,
      desiredCapacityAfter: newCapacity,
      reason: `${policy.metricName} ${action === 'SCALE_OUT' ? 'above' : 'below'} target`,
      metricValue,
    };

    this.scalingEvents.push(event);
    this.emit('scalingTriggered', event);

    // Update capacity
    capacity.desiredInstances = newCapacity;
    this.emit('capacityUpdated', policy.fleetId, capacity);

    // Set cooldown
    const target = this.scalingTargets.get(policy.fleetId);
    if (target) {
      target.lastScaleTime = new Date();
      target.cooldownUntil = new Date(Date.now() + cooldownSeconds * 1000);
    }

    this.emit('scalingCooldown', policy.fleetId, cooldownSeconds);

    // Mark as completed (in real implementation, would wait for instances to launch)
    setTimeout(() => {
      this.emit('scalingCompleted', event);
    }, 1000);
  }

  /**
   * Get scaling policies for fleet
   */
  getScalingPolicies(fleetId: string): ScalingPolicy[] {
    return this.policies.get(fleetId) || [];
  }

  /**
   * Get scaling events
   */
  getScalingEvents(fleetId?: string, limit: number = 50): ScalingEvent[] {
    let events = this.scalingEvents;

    if (fleetId) {
      events = events.filter(e => e.fleetId === fleetId);
    }

    return events.slice(-limit);
  }

  /**
   * Get scaling statistics
   */
  getStatistics(fleetId?: string): {
    totalScalingEvents: number;
    scaleOutEvents: number;
    scaleInEvents: number;
    averageCapacityChange: number;
    lastScalingTime?: Date;
  } {
    let events = this.scalingEvents;

    if (fleetId) {
      events = events.filter(e => e.fleetId === fleetId);
    }

    const scaleOutEvents = events.filter(e => e.action === 'SCALE_OUT').length;
    const scaleInEvents = events.filter(e => e.action === 'SCALE_IN').length;

    const capacityChanges = events.map(e =>
      Math.abs(e.desiredCapacityAfter - e.desiredCapacityBefore)
    );

    const averageCapacityChange = capacityChanges.length > 0
      ? capacityChanges.reduce((a, b) => a + b, 0) / capacityChanges.length
      : 0;

    const lastEvent = events[events.length - 1];

    return {
      totalScalingEvents: events.length,
      scaleOutEvents,
      scaleInEvents,
      averageCapacityChange,
      lastScalingTime: lastEvent?.timestamp,
    };
  }

  /**
   * Create target tracking policy (helper)
   */
  createTargetTrackingPolicy(
    fleetId: string,
    policyName: string,
    metricName: ScalingPolicy['metricName'],
    targetValue: number,
    options?: {
      scaleInCooldown?: number;
      scaleOutCooldown?: number;
      disableScaleIn?: boolean;
    }
  ): ScalingPolicy {
    return this.putScalingPolicy({
      policyName,
      fleetId,
      metricName,
      targetValue,
      scalingAdjustmentType: 'ChangeInCapacity',
      scalingAdjustment: 0, // Not used for target tracking
      targetTrackingConfiguration: {
        targetValue,
        scaleInCooldown: options?.scaleInCooldown,
        scaleOutCooldown: options?.scaleOutCooldown,
        disableScaleIn: options?.disableScaleIn,
      },
    });
  }

  /**
   * Create step scaling policy (helper)
   */
  createStepScalingPolicy(
    fleetId: string,
    policyName: string,
    metricName: ScalingPolicy['metricName'],
    threshold: number,
    scalingAdjustment: number,
    comparisonOperator: ScalingPolicy['comparisonOperator'],
    options?: {
      scalingAdjustmentType?: ScalingPolicy['scalingAdjustmentType'];
      cooldown?: number;
    }
  ): ScalingPolicy {
    return this.putScalingPolicy({
      policyName,
      fleetId,
      metricName,
      targetValue: threshold,
      threshold,
      comparisonOperator,
      scalingAdjustmentType: options?.scalingAdjustmentType || 'ChangeInCapacity',
      scalingAdjustment,
      cooldown: options?.cooldown,
    });
  }
}
