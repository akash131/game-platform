import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

/**
 * Session Placement - Intelligent game session placement across fleets
 * Similar to AWS GameLift game session placement
 */

export interface PlayerLatency {
  playerId: string;
  regionName: string;
  latencyMs: number;
}

export interface GameProperty {
  key: string;
  value: string;
}

export interface DesiredPlayerSession {
  playerId: string;
  playerData?: string;
}

export interface GameSessionQueueDestination {
  destinationArn: string;
  fleetArn?: string;
  priority?: number;
}

export interface GameSessionQueue {
  name: string;
  arn: string;
  timeoutSeconds: number;
  destinations: GameSessionQueueDestination[];
  playerLatencyPolicies?: PlayerLatencyPolicy[];
  filterConfiguration?: FilterConfiguration;
  priorityConfiguration?: PriorityConfiguration;
  customEventData?: string;
  notificationTarget?: string;
}

export interface PlayerLatencyPolicy {
  maximumIndividualPlayerLatencyMs?: number;
  policyDurationSeconds?: number;
}

export interface FilterConfiguration {
  allowedLocations?: string[];
}

export interface PriorityConfiguration {
  priorityOrder: Array<'LATENCY' | 'COST' | 'DESTINATION' | 'LOCATION'>;
  locationOrder?: string[];
}

export interface GameSessionPlacementRequest {
  placementId?: string;
  gameSessionQueueName: string;
  gameSessionName?: string;
  maximumPlayerSessionCount: number;
  gameProperties?: GameProperty[];
  gameSessionData?: string;
  desiredPlayerSessions?: DesiredPlayerSession[];
  playerLatencies?: PlayerLatency[];
}

export interface PlacedPlayerSession {
  playerId: string;
  playerSessionId: string;
}

export interface GameSessionPlacement {
  placementId: string;
  gameSessionQueueName: string;
  status: 'PENDING' | 'FULFILLED' | 'CANCELLED' | 'TIMED_OUT' | 'FAILED';
  gameProperties?: GameProperty[];
  maximumPlayerSessionCount: number;
  gameSessionName?: string;
  gameSessionId?: string;
  gameSessionArn?: string;
  gameSessionRegion?: string;
  playerLatencies?: PlayerLatency[];
  startTime: Date;
  endTime?: Date;
  ipAddress?: string;
  port?: number;
  placedPlayerSessions?: PlacedPlayerSession[];
  gameSessionData?: string;
  matchmakerData?: string;
  dnsName?: string;
}

export interface FleetCapacity {
  fleetArn: string;
  fleetId: string;
  location: string;
  instanceType: string;
  instanceCounts: {
    desired: number;
    minimum: number;
    maximum: number;
    active: number;
    idle: number;
    pending: number;
    terminating: number;
  };
}

export interface PlacementMetrics {
  averageLatency: number;
  minLatency: number;
  maxLatency: number;
  distance: number; // Geographic or network distance
  availableCapacity: number;
  utilizationScore: number;
}

export interface PlacementEvents {
  'placementCreated': (placement: GameSessionPlacement) => void;
  'placementFulfilled': (placement: GameSessionPlacement) => void;
  'placementCancelled': (placement: GameSessionPlacement) => void;
  'placementTimedOut': (placement: GameSessionPlacement) => void;
  'placementFailed': (placement: GameSessionPlacement, reason: string) => void;
}

export class SessionPlacementService extends EventEmitter<PlacementEvents> {
  private queues: Map<string, GameSessionQueue> = new Map();
  private placements: Map<string, GameSessionPlacement> = new Map();
  private fleetCapacities: Map<string, FleetCapacity> = new Map();
  private activePlacements: Set<string> = new Set();

  constructor() {
    super();
  }

  /**
   * Create game session queue
   */
  createGameSessionQueue(
    name: string,
    config: Omit<GameSessionQueue, 'name' | 'arn'>
  ): GameSessionQueue {
    const queue: GameSessionQueue = {
      name,
      arn: `arn:aws:gamelift:region:account:gamesessionqueue/${name}`,
      ...config,
    };

    // Sort destinations by priority
    queue.destinations.sort((a, b) => (a.priority || 0) - (b.priority || 0));

    this.queues.set(name, queue);
    return queue;
  }

  /**
   * Update game session queue
   */
  updateGameSessionQueue(
    name: string,
    updates: Partial<Omit<GameSessionQueue, 'name' | 'arn'>>
  ): GameSessionQueue {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new Error(`Queue not found: ${name}`);
    }

    Object.assign(queue, updates);

    if (updates.destinations) {
      queue.destinations.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    }

    return queue;
  }

  /**
   * Start game session placement
   */
  async startGameSessionPlacement(
    request: GameSessionPlacementRequest
  ): Promise<GameSessionPlacement> {
    const queue = this.queues.get(request.gameSessionQueueName);
    if (!queue) {
      throw new Error(`Queue not found: ${request.gameSessionQueueName}`);
    }

    const placement: GameSessionPlacement = {
      placementId: request.placementId || uuidv4(),
      gameSessionQueueName: request.gameSessionQueueName,
      status: 'PENDING',
      gameProperties: request.gameProperties,
      maximumPlayerSessionCount: request.maximumPlayerSessionCount,
      gameSessionName: request.gameSessionName,
      playerLatencies: request.playerLatencies,
      startTime: new Date(),
      gameSessionData: request.gameSessionData,
    };

    this.placements.set(placement.placementId, placement);
    this.activePlacements.add(placement.placementId);

    this.emit('placementCreated', placement);

    // Start async placement process
    this.processPlacement(placement, queue, request).catch(error => {
      placement.status = 'FAILED';
      placement.endTime = new Date();
      this.activePlacements.delete(placement.placementId);
      this.emit('placementFailed', placement, error.message);
    });

    return placement;
  }

  /**
   * Process placement request
   */
  private async processPlacement(
    placement: GameSessionPlacement,
    queue: GameSessionQueue,
    request: GameSessionPlacementRequest
  ): Promise<void> {
    const startTime = Date.now();
    const timeout = queue.timeoutSeconds * 1000;

    // Apply latency policies over time
    let currentPolicyIndex = 0;
    const policies = queue.playerLatencyPolicies || [];

    while (Date.now() - startTime < timeout) {
      // Check if we should move to next latency policy
      if (currentPolicyIndex < policies.length) {
        const currentPolicy = policies[currentPolicyIndex];
        const policyDuration = (currentPolicy.policyDurationSeconds || 0) * 1000;

        if (Date.now() - startTime >= policyDuration && currentPolicyIndex < policies.length - 1) {
          currentPolicyIndex++;
        }
      }

      // Find best destination
      const bestDestination = await this.findBestDestination(
        queue,
        request,
        policies[currentPolicyIndex]
      );

      if (bestDestination) {
        // Place session
        await this.placeSession(placement, bestDestination, request);
        return;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Timeout
    placement.status = 'TIMED_OUT';
    placement.endTime = new Date();
    this.activePlacements.delete(placement.placementId);
    this.emit('placementTimedOut', placement);
  }

  /**
   * Find best destination for placement
   */
  private async findBestDestination(
    queue: GameSessionQueue,
    request: GameSessionPlacementRequest,
    latencyPolicy?: PlayerLatencyPolicy
  ): Promise<GameSessionQueueDestination | null> {
    const candidates: Array<{
      destination: GameSessionQueueDestination;
      metrics: PlacementMetrics;
    }> = [];

    for (const destination of queue.destinations) {
      // Check capacity
      const capacity = this.fleetCapacities.get(destination.fleetArn || '');
      if (!capacity || capacity.instanceCounts.idle === 0) {
        continue;
      }

      // Calculate metrics
      const metrics = this.calculatePlacementMetrics(
        destination,
        request.playerLatencies || [],
        capacity,
        latencyPolicy
      );

      // Check latency policy
      if (latencyPolicy?.maximumIndividualPlayerLatencyMs) {
        if (metrics.maxLatency > latencyPolicy.maximumIndividualPlayerLatencyMs) {
          continue; // Exceeds latency threshold
        }
      }

      // Check location filter
      if (queue.filterConfiguration?.allowedLocations) {
        if (!queue.filterConfiguration.allowedLocations.includes(capacity.location)) {
          continue;
        }
      }

      candidates.push({ destination, metrics });
    }

    if (candidates.length === 0) {
      return null;
    }

    // Sort by priority configuration
    if (queue.priorityConfiguration) {
      this.sortByPriority(candidates, queue.priorityConfiguration);
    } else {
      // Default: sort by latency
      candidates.sort((a, b) => a.metrics.averageLatency - b.metrics.averageLatency);
    }

    return candidates[0].destination;
  }

  /**
   * Calculate placement metrics
   */
  private calculatePlacementMetrics(
    destination: GameSessionQueueDestination,
    playerLatencies: PlayerLatency[],
    capacity: FleetCapacity,
    latencyPolicy?: PlayerLatencyPolicy
  ): PlacementMetrics {
    const latencies = playerLatencies
      .filter(pl => pl.regionName === capacity.location)
      .map(pl => pl.latencyMs);

    const averageLatency = latencies.length > 0
      ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length
      : 0;

    const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0;
    const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;

    const availableCapacity = capacity.instanceCounts.idle;
    const totalCapacity = capacity.instanceCounts.active;
    const utilizationScore = totalCapacity > 0 ? availableCapacity / totalCapacity : 0;

    return {
      averageLatency,
      minLatency,
      maxLatency,
      distance: averageLatency, // Simplified: use latency as distance
      availableCapacity,
      utilizationScore,
    };
  }

  /**
   * Sort candidates by priority
   */
  private sortByPriority(
    candidates: Array<{
      destination: GameSessionQueueDestination;
      metrics: PlacementMetrics;
    }>,
    priorityConfig: PriorityConfiguration
  ): void {
    candidates.sort((a, b) => {
      for (const priority of priorityConfig.priorityOrder) {
        let comparison = 0;

        switch (priority) {
          case 'LATENCY':
            comparison = a.metrics.averageLatency - b.metrics.averageLatency;
            break;

          case 'COST':
            // Lower utilization = higher cost efficiency
            comparison = b.metrics.utilizationScore - a.metrics.utilizationScore;
            break;

          case 'DESTINATION':
            comparison = (a.destination.priority || 0) - (b.destination.priority || 0);
            break;

          case 'LOCATION':
            if (priorityConfig.locationOrder) {
              const aIndex = priorityConfig.locationOrder.indexOf(
                this.fleetCapacities.get(a.destination.fleetArn || '')?.location || ''
              );
              const bIndex = priorityConfig.locationOrder.indexOf(
                this.fleetCapacities.get(b.destination.fleetArn || '')?.location || ''
              );
              comparison = aIndex - bIndex;
            }
            break;
        }

        if (comparison !== 0) {
          return comparison;
        }
      }

      return 0;
    });
  }

  /**
   * Place session on destination
   */
  private async placeSession(
    placement: GameSessionPlacement,
    destination: GameSessionQueueDestination,
    request: GameSessionPlacementRequest
  ): Promise<void> {
    const capacity = this.fleetCapacities.get(destination.fleetArn || '');
    if (!capacity) {
      throw new Error('Fleet capacity not found');
    }

    // Create game session (would integrate with FleetManager)
    const gameSessionId = uuidv4();
    const gameSessionArn = `arn:aws:gamelift:${capacity.location}:account:gamesession/${capacity.fleetId}/${gameSessionId}`;

    // Update placement
    placement.status = 'FULFILLED';
    placement.gameSessionId = gameSessionId;
    placement.gameSessionArn = gameSessionArn;
    placement.gameSessionRegion = capacity.location;
    placement.ipAddress = '192.168.1.100'; // Would get from actual instance
    placement.port = 7777;
    placement.dnsName = `${capacity.fleetId}.gamelift.com`;
    placement.endTime = new Date();

    // Create player sessions if requested
    if (request.desiredPlayerSessions) {
      placement.placedPlayerSessions = request.desiredPlayerSessions.map(dps => ({
        playerId: dps.playerId,
        playerSessionId: uuidv4(),
      }));
    }

    // Update capacity
    capacity.instanceCounts.idle--;
    capacity.instanceCounts.active++;

    this.activePlacements.delete(placement.placementId);
    this.emit('placementFulfilled', placement);
  }

  /**
   * Stop game session placement
   */
  stopGameSessionPlacement(placementId: string): GameSessionPlacement {
    const placement = this.placements.get(placementId);
    if (!placement) {
      throw new Error(`Placement not found: ${placementId}`);
    }

    if (placement.status === 'FULFILLED' || placement.status === 'CANCELLED' || placement.status === 'TIMED_OUT') {
      return placement; // Already finished
    }

    placement.status = 'CANCELLED';
    placement.endTime = new Date();
    this.activePlacements.delete(placementId);

    this.emit('placementCancelled', placement);
    return placement;
  }

  /**
   * Describe game session placement
   */
  describeGameSessionPlacement(placementId: string): GameSessionPlacement | undefined {
    return this.placements.get(placementId);
  }

  /**
   * Get game session queue
   */
  getGameSessionQueue(name: string): GameSessionQueue | undefined {
    return this.queues.get(name);
  }

  /**
   * Update fleet capacity (called by FleetManager)
   */
  updateFleetCapacity(fleetArn: string, capacity: FleetCapacity): void {
    this.fleetCapacities.set(fleetArn, capacity);
  }

  /**
   * Get placement statistics
   */
  getStatistics(): {
    activePlacements: number;
    pendingPlacements: number;
    fulfilledPlacements: number;
    timedOutPlacements: number;
    averagePlacementTime: number;
  } {
    let pending = 0;
    let fulfilled = 0;
    let timedOut = 0;
    let totalTime = 0;
    let completedCount = 0;

    for (const placement of this.placements.values()) {
      switch (placement.status) {
        case 'PENDING':
          pending++;
          break;
        case 'FULFILLED':
          fulfilled++;
          if (placement.endTime) {
            totalTime += placement.endTime.getTime() - placement.startTime.getTime();
            completedCount++;
          }
          break;
        case 'TIMED_OUT':
          timedOut++;
          break;
      }
    }

    return {
      activePlacements: this.activePlacements.size,
      pendingPlacements: pending,
      fulfilledPlacements: fulfilled,
      timedOutPlacements: timedOut,
      averagePlacementTime: completedCount > 0 ? totalTime / completedCount : 0,
    };
  }

  /**
   * Clean up old placements
   */
  cleanupOldPlacements(olderThanMs: number = 3600000): void {
    const cutoffTime = Date.now() - olderThanMs;

    for (const [placementId, placement] of this.placements) {
      if (placement.endTime && placement.endTime.getTime() < cutoffTime) {
        this.placements.delete(placementId);
      }
    }
  }
}
