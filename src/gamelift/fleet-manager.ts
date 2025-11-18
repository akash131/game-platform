import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import { GameType } from '../types/core.types';

/**
 * Fleet Manager - AWS GameLift Style
 * Manages fleets of game servers with auto-scaling, health monitoring, and session placement
 * Similar to Amazon GameLift fleet management
 */
export class FleetManager extends EventEmitter {
  private fleets: Map<string, Fleet>;
  private instances: Map<string, GameServerInstance>; // instanceId -> instance
  private fleetInstances: Map<string, Set<string>>; // fleetId -> instanceIds
  private sessions: Map<string, GameServerSession>; // sessionId -> session
  private aliases: Map<string, FleetAlias>;
  private builds: Map<string, ServerBuild>;

  constructor() {
    super();
    this.fleets = new Map();
    this.instances = new Map();
    this.fleetInstances = new Map();
    this.sessions = new Map();
    this.aliases = new Map();
    this.builds = new Map();
  }

  /**
   * Create a new fleet
   */
  createFleet(config: FleetConfiguration): Fleet {
    const fleet: Fleet = {
      id: uuidv4(),
      name: config.name,
      description: config.description,
      buildId: config.buildId,
      instanceType: config.instanceType,
      fleetType: config.fleetType || 'ON_DEMAND',
      gameType: config.gameType,
      status: 'NEW',
      desiredInstances: config.desiredInstances || 1,
      minInstances: config.minInstances || 0,
      maxInstances: config.maxInstances || 10,
      runtimeConfiguration: config.runtimeConfiguration,
      resourceCreationLimitPolicy: config.resourceCreationLimitPolicy,
      metricGroups: config.metricGroups || [],
      createdAt: Date.now(),
      scalingPolicies: [],
    };

    this.fleets.set(fleet.id, fleet);
    this.fleetInstances.set(fleet.id, new Set());

    console.log(`🚀 Fleet created: ${fleet.name} (${fleet.id})`);
    this.emit('fleet:created', fleet);

    // Activate fleet
    this.activateFleet(fleet.id);

    return fleet;
  }

  /**
   * Activate fleet - provisions initial instances
   */
  private activateFleet(fleetId: string): void {
    const fleet = this.fleets.get(fleetId);
    if (!fleet) return;

    fleet.status = 'ACTIVATING';

    // Provision initial instances
    const instancesToCreate = fleet.desiredInstances;

    for (let i = 0; i < instancesToCreate; i++) {
      this.createInstance(fleetId);
    }

    fleet.status = 'ACTIVE';
    console.log(`✅ Fleet activated: ${fleet.name}`);
    this.emit('fleet:activated', fleet);
  }

  /**
   * Create a game server instance
   */
  private createInstance(fleetId: string): GameServerInstance {
    const fleet = this.fleets.get(fleetId);
    if (!fleet) {
      throw new Error('Fleet not found');
    }

    const build = this.builds.get(fleet.buildId);

    const instance: GameServerInstance = {
      id: uuidv4(),
      fleetId,
      instanceType: fleet.instanceType,
      ipAddress: this.generateIPAddress(),
      port: 7777,
      status: 'PENDING',
      operatingSystem: build?.operatingSystem || 'AMAZON_LINUX_2',
      createdAt: Date.now(),
      currentPlayers: 0,
      maxPlayers: fleet.runtimeConfiguration.maxConcurrentGameSessionActivations || 1,
      processes: [],
      metrics: {
        cpuUsage: 0,
        memoryUsage: 0,
        activeSessions: 0,
        availableSessions: 0,
      },
    };

    this.instances.set(instance.id, instance);
    this.fleetInstances.get(fleetId)!.add(instance.id);

    // Simulate instance startup
    setTimeout(() => {
      instance.status = 'ACTIVE';
      this.startServerProcesses(instance, fleet);
      this.emit('instance:active', instance);
    }, 2000);

    console.log(`🖥️  Instance created: ${instance.id}`);
    this.emit('instance:created', instance);

    return instance;
  }

  /**
   * Start server processes on instance
   */
  private startServerProcesses(instance: GameServerInstance, fleet: Fleet): void {
    const config = fleet.runtimeConfiguration;

    for (let i = 0; i < config.serverProcesses.length; i++) {
      const processConfig = config.serverProcesses[i];

      for (let j = 0; j < processConfig.concurrentExecutions; j++) {
        const process: ServerProcess = {
          id: uuidv4(),
          launchPath: processConfig.launchPath,
          parameters: processConfig.parameters,
          port: instance.port + instance.processes.length,
          status: 'ACTIVE',
          currentSessions: 0,
          maxSessions: 1,
        };

        instance.processes.push(process);
      }
    }

    instance.metrics.availableSessions = instance.processes.length;
    console.log(`📦 Started ${instance.processes.length} server processes on ${instance.id}`);
  }

  /**
   * Create game session on fleet
   */
  async createGameSession(request: CreateGameSessionRequest): Promise<GameServerSession> {
    const fleet = this.fleets.get(request.fleetId);
    if (!fleet) {
      throw new Error('Fleet not found');
    }

    if (fleet.status !== 'ACTIVE') {
      throw new Error('Fleet is not active');
    }

    // Find available instance and process
    const placement = this.findOptimalPlacement(fleet.id, request.maximumPlayerSessionCount);

    if (!placement) {
      throw new Error('No available server capacity');
    }

    const session: GameServerSession = {
      id: uuidv4(),
      name: request.name,
      fleetId: request.fleetId,
      instanceId: placement.instanceId,
      processId: placement.processId,
      gameType: fleet.gameType,
      maximumPlayerSessionCount: request.maximumPlayerSessionCount,
      currentPlayerSessionCount: 0,
      status: 'ACTIVATING',
      ipAddress: placement.ipAddress,
      port: placement.port,
      gameProperties: request.gameProperties || {},
      gameSessionData: request.gameSessionData,
      createdAt: Date.now(),
      playerSessions: [],
    };

    this.sessions.set(session.id, session);

    // Update instance and process
    const instance = this.instances.get(placement.instanceId)!;
    const process = instance.processes.find(p => p.id === placement.processId)!;

    process.currentSessions++;
    instance.metrics.activeSessions++;
    instance.metrics.availableSessions--;

    // Activate session
    setTimeout(() => {
      session.status = 'ACTIVE';
      this.emit('session:activated', session);
    }, 1000);

    console.log(`🎮 Game session created: ${session.id} on ${instance.id}`);
    this.emit('session:created', session);

    return session;
  }

  /**
   * Find optimal server placement
   */
  private findOptimalPlacement(fleetId: string, playerCount: number): SessionPlacement | null {
    const instanceIds = this.fleetInstances.get(fleetId);
    if (!instanceIds) return null;

    // Sort instances by current load (prefer less loaded)
    const instances = Array.from(instanceIds)
      .map(id => this.instances.get(id)!)
      .filter(i => i.status === 'ACTIVE')
      .sort((a, b) => a.currentPlayers - b.currentPlayers);

    for (const instance of instances) {
      // Find available process
      const availableProcess = instance.processes.find(
        p => p.status === 'ACTIVE' && p.currentSessions < p.maxSessions
      );

      if (availableProcess) {
        return {
          instanceId: instance.id,
          processId: availableProcess.id,
          ipAddress: instance.ipAddress,
          port: availableProcess.port,
        };
      }
    }

    return null;
  }

  /**
   * Create player session
   */
  createPlayerSession(gameSessionId: string, playerId: string): PlayerSession {
    const session = this.sessions.get(gameSessionId);
    if (!session) {
      throw new Error('Game session not found');
    }

    if (session.status !== 'ACTIVE') {
      throw new Error('Game session is not active');
    }

    if (session.currentPlayerSessionCount >= session.maximumPlayerSessionCount) {
      throw new Error('Game session is full');
    }

    const playerSession: PlayerSession = {
      id: uuidv4(),
      gameSessionId,
      playerId,
      status: 'RESERVED',
      ipAddress: session.ipAddress,
      port: session.port,
      createdAt: Date.now(),
    };

    session.playerSessions.push(playerSession);
    session.currentPlayerSessionCount++;

    const instance = this.instances.get(session.instanceId)!;
    instance.currentPlayers++;

    console.log(`👤 Player session created for ${playerId}`);
    this.emit('player:session:created', playerSession);

    return playerSession;
  }

  /**
   * Update player session status
   */
  updatePlayerSessionStatus(playerSessionId: string, status: PlayerSessionStatus): void {
    for (const session of this.sessions.values()) {
      const playerSession = session.playerSessions.find(ps => ps.id === playerSessionId);
      if (playerSession) {
        playerSession.status = status;

        if (status === 'COMPLETED') {
          session.currentPlayerSessionCount--;
          const instance = this.instances.get(session.instanceId)!;
          instance.currentPlayers--;
        }

        this.emit('player:session:updated', playerSession);
        return;
      }
    }
  }

  /**
   * Terminate game session
   */
  terminateGameSession(gameSessionId: string): void {
    const session = this.sessions.get(gameSessionId);
    if (!session) return;

    session.status = 'TERMINATED';
    session.terminatedAt = Date.now();

    // Update instance and process
    const instance = this.instances.get(session.instanceId)!;
    const process = instance.processes.find(p => p.id === session.processId)!;

    process.currentSessions--;
    instance.metrics.activeSessions--;
    instance.metrics.availableSessions++;
    instance.currentPlayers -= session.currentPlayerSessionCount;

    console.log(`🏁 Game session terminated: ${gameSessionId}`);
    this.emit('session:terminated', session);
  }

  /**
   * Set fleet capacity
   */
  updateFleetCapacity(fleetId: string, desiredInstances: number): void {
    const fleet = this.fleets.get(fleetId);
    if (!fleet) {
      throw new Error('Fleet not found');
    }

    if (desiredInstances < fleet.minInstances || desiredInstances > fleet.maxInstances) {
      throw new Error('Desired instances outside of min/max bounds');
    }

    const currentInstances = this.fleetInstances.get(fleetId)!.size;
    const delta = desiredInstances - currentInstances;

    if (delta > 0) {
      // Scale up
      for (let i = 0; i < delta; i++) {
        this.createInstance(fleetId);
      }
    } else if (delta < 0) {
      // Scale down
      this.scaleDownInstances(fleetId, Math.abs(delta));
    }

    fleet.desiredInstances = desiredInstances;
    console.log(`⚖️  Fleet capacity updated: ${currentInstances} -> ${desiredInstances}`);
    this.emit('fleet:capacity:updated', { fleetId, desiredInstances });
  }

  /**
   * Scale down instances
   */
  private scaleDownInstances(fleetId: string, count: number): void {
    const instanceIds = Array.from(this.fleetInstances.get(fleetId)!);

    // Sort by current players (terminate least loaded first)
    const instances = instanceIds
      .map(id => this.instances.get(id)!)
      .filter(i => i.status === 'ACTIVE')
      .sort((a, b) => a.currentPlayers - b.currentPlayers);

    for (let i = 0; i < Math.min(count, instances.length); i++) {
      this.terminateInstance(instances[i].id);
    }
  }

  /**
   * Terminate instance
   */
  private terminateInstance(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    instance.status = 'TERMINATING';

    // Terminate all sessions on instance
    for (const session of this.sessions.values()) {
      if (session.instanceId === instanceId && session.status === 'ACTIVE') {
        this.terminateGameSession(session.id);
      }
    }

    // Remove from fleet
    this.fleetInstances.get(instance.fleetId)!.delete(instanceId);
    this.instances.delete(instanceId);

    console.log(`❌ Instance terminated: ${instanceId}`);
    this.emit('instance:terminated', { instanceId });
  }

  /**
   * Create fleet alias
   */
  createAlias(name: string, routingStrategy: RoutingStrategy): FleetAlias {
    const alias: FleetAlias = {
      id: uuidv4(),
      name,
      description: '',
      routingStrategy,
      createdAt: Date.now(),
    };

    this.aliases.set(alias.id, alias);

    console.log(`🏷️  Fleet alias created: ${name}`);
    this.emit('alias:created', alias);

    return alias;
  }

  /**
   * Create server build
   */
  createBuild(build: Omit<ServerBuild, 'id' | 'createdAt' | 'status'>): ServerBuild {
    const newBuild: ServerBuild = {
      id: uuidv4(),
      ...build,
      status: 'READY',
      createdAt: Date.now(),
    };

    this.builds.set(newBuild.id, newBuild);

    console.log(`📦 Server build created: ${newBuild.name} (${newBuild.version})`);
    this.emit('build:created', newBuild);

    return newBuild;
  }

  /**
   * Get fleet
   */
  getFleet(fleetId: string): Fleet | undefined {
    return this.fleets.get(fleetId);
  }

  /**
   * Get fleet instances
   */
  getFleetInstances(fleetId: string): GameServerInstance[] {
    const instanceIds = this.fleetInstances.get(fleetId);
    if (!instanceIds) return [];

    return Array.from(instanceIds)
      .map(id => this.instances.get(id)!)
      .filter(i => i !== undefined);
  }

  /**
   * Get fleet utilization
   */
  getFleetUtilization(fleetId: string): FleetUtilization {
    const instances = this.getFleetInstances(fleetId);

    const totalInstances = instances.length;
    const activeInstances = instances.filter(i => i.status === 'ACTIVE').length;
    const totalCapacity = instances.reduce((sum, i) => sum + i.maxPlayers, 0);
    const currentPlayers = instances.reduce((sum, i) => sum + i.currentPlayers, 0);
    const activeSessions = instances.reduce((sum, i) => sum + i.metrics.activeSessions, 0);
    const availableSessions = instances.reduce((sum, i) => sum + i.metrics.availableSessions, 0);

    return {
      fleetId,
      totalInstances,
      activeInstances,
      totalCapacity,
      currentPlayers,
      utilizationPercentage: totalCapacity > 0 ? (currentPlayers / totalCapacity) * 100 : 0,
      activeSessions,
      availableSessions,
    };
  }

  /**
   * Get game session
   */
  getGameSession(gameSessionId: string): GameServerSession | undefined {
    return this.sessions.get(gameSessionId);
  }

  /**
   * List game sessions
   */
  listGameSessions(fleetId?: string): GameServerSession[] {
    const sessions = Array.from(this.sessions.values());

    if (fleetId) {
      return sessions.filter(s => s.fleetId === fleetId);
    }

    return sessions;
  }

  /**
   * Get fleet statistics
   */
  getStatistics(): FleetStatistics {
    return {
      totalFleets: this.fleets.size,
      activeFleets: Array.from(this.fleets.values()).filter(f => f.status === 'ACTIVE').length,
      totalInstances: this.instances.size,
      activeInstances: Array.from(this.instances.values()).filter(i => i.status === 'ACTIVE').length,
      activeSessions: Array.from(this.sessions.values()).filter(s => s.status === 'ACTIVE').length,
      totalBuilds: this.builds.size,
      totalAliases: this.aliases.size,
    };
  }

  private generateIPAddress(): string {
    return `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  }
}

// Types

export interface Fleet {
  id: string;
  name: string;
  description: string;
  buildId: string;
  instanceType: string;
  fleetType: 'ON_DEMAND' | 'SPOT';
  gameType: GameType;
  status: FleetStatus;
  desiredInstances: number;
  minInstances: number;
  maxInstances: number;
  runtimeConfiguration: RuntimeConfiguration;
  resourceCreationLimitPolicy?: ResourceCreationLimitPolicy;
  metricGroups: string[];
  createdAt: number;
  scalingPolicies: ScalingPolicy[];
}

export type FleetStatus = 'NEW' | 'DOWNLOADING' | 'VALIDATING' | 'BUILDING' | 'ACTIVATING' | 'ACTIVE' | 'DELETING' | 'ERROR' | 'TERMINATED';

export interface FleetConfiguration {
  name: string;
  description: string;
  buildId: string;
  instanceType: string;
  fleetType?: 'ON_DEMAND' | 'SPOT';
  gameType: GameType;
  desiredInstances?: number;
  minInstances?: number;
  maxInstances?: number;
  runtimeConfiguration: RuntimeConfiguration;
  resourceCreationLimitPolicy?: ResourceCreationLimitPolicy;
  metricGroups?: string[];
}

export interface RuntimeConfiguration {
  serverProcesses: ServerProcessConfiguration[];
  maxConcurrentGameSessionActivations: number;
  gameSessionActivationTimeoutSeconds: number;
}

export interface ServerProcessConfiguration {
  launchPath: string;
  parameters: string;
  concurrentExecutions: number;
}

export interface ResourceCreationLimitPolicy {
  newGameSessionsPerCreator: number;
  policyPeriodInMinutes: number;
}

export interface GameServerInstance {
  id: string;
  fleetId: string;
  instanceType: string;
  ipAddress: string;
  port: number;
  status: InstanceStatus;
  operatingSystem: string;
  createdAt: number;
  currentPlayers: number;
  maxPlayers: number;
  processes: ServerProcess[];
  metrics: InstanceMetrics;
}

export type InstanceStatus = 'PENDING' | 'ACTIVE' | 'TERMINATING' | 'TERMINATED';

export interface ServerProcess {
  id: string;
  launchPath: string;
  parameters: string;
  port: number;
  status: 'ACTIVE' | 'TERMINATED';
  currentSessions: number;
  maxSessions: number;
}

export interface InstanceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  activeSessions: number;
  availableSessions: number;
}

export interface GameServerSession {
  id: string;
  name: string;
  fleetId: string;
  instanceId: string;
  processId: string;
  gameType: GameType;
  maximumPlayerSessionCount: number;
  currentPlayerSessionCount: number;
  status: GameSessionStatus;
  ipAddress: string;
  port: number;
  gameProperties: Record<string, string>;
  gameSessionData?: string;
  createdAt: number;
  terminatedAt?: number;
  playerSessions: PlayerSession[];
}

export type GameSessionStatus = 'ACTIVATING' | 'ACTIVE' | 'TERMINATING' | 'TERMINATED';

export interface CreateGameSessionRequest {
  name: string;
  fleetId: string;
  maximumPlayerSessionCount: number;
  gameProperties?: Record<string, string>;
  gameSessionData?: string;
}

export interface PlayerSession {
  id: string;
  gameSessionId: string;
  playerId: string;
  status: PlayerSessionStatus;
  ipAddress: string;
  port: number;
  createdAt: number;
}

export type PlayerSessionStatus = 'RESERVED' | 'ACTIVE' | 'COMPLETED' | 'TIMEDOUT';

export interface SessionPlacement {
  instanceId: string;
  processId: string;
  ipAddress: string;
  port: number;
}

export interface FleetAlias {
  id: string;
  name: string;
  description: string;
  routingStrategy: RoutingStrategy;
  createdAt: number;
}

export interface RoutingStrategy {
  type: 'SIMPLE' | 'TERMINAL';
  fleetId?: string;
  message?: string;
}

export interface ServerBuild {
  id: string;
  name: string;
  version: string;
  operatingSystem: 'WINDOWS_2012' | 'AMAZON_LINUX' | 'AMAZON_LINUX_2';
  sizeOnDisk: number;
  status: 'INITIALIZED' | 'READY' | 'FAILED';
  createdAt: number;
}

export interface ScalingPolicy {
  name: string;
  metricName: string;
  targetValue: number;
  comparisonOperator: string;
  threshold: number;
}

export interface FleetUtilization {
  fleetId: string;
  totalInstances: number;
  activeInstances: number;
  totalCapacity: number;
  currentPlayers: number;
  utilizationPercentage: number;
  activeSessions: number;
  availableSessions: number;
}

export interface FleetStatistics {
  totalFleets: number;
  activeFleets: number;
  totalInstances: number;
  activeInstances: number;
  activeSessions: number;
  totalBuilds: number;
  totalAliases: number;
}
