import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

/**
 * Cloud Streaming Service - Cloud gaming like Nvidia GeForce Now, Google Stadia, Xbox Cloud Gaming
 * Enables playing games on remote servers with video streaming to clients
 */

export interface StreamingSession {
  sessionId: string;
  userId: string;
  gameId: string;
  serverId: string;
  status: 'initializing' | 'connecting' | 'streaming' | 'paused' | 'ended';
  startTime: Date;
  endTime?: Date;
  resolution: VideoResolution;
  framerate: number;
  bitrate: number; // kbps
  codec: 'h264' | 'h265' | 'vp9' | 'av1';
  latency: number; // ms
  protocol: 'webrtc' | 'websocket' | 'udp';
  quality: StreamQuality;
  inputMethod: 'keyboard_mouse' | 'controller' | 'touch';
  region: string;
}

export interface VideoResolution {
  width: number;
  height: number;
  name: string; // '1080p', '1440p', '4K', etc.
}

export interface StreamQuality {
  preset: 'low' | 'medium' | 'high' | 'ultra';
  adaptiveBitrate: boolean;
  minBitrate: number;
  maxBitrate: number;
  targetFps: number;
}

export interface StreamingServer {
  serverId: string;
  region: string;
  location: string;
  gpuModel: string;
  cpuModel: string;
  ramGB: number;
  status: 'available' | 'busy' | 'maintenance' | 'offline';
  currentSessions: number;
  maxSessions: number;
  capabilities: ServerCapabilities;
  performance: ServerPerformance;
}

export interface ServerCapabilities {
  maxResolution: VideoResolution;
  supportedCodecs: Array<'h264' | 'h265' | 'vp9' | 'av1'>;
  maxFramerate: number;
  rayTracingSupport: boolean;
  dlssSupport: boolean;
}

export interface ServerPerformance {
  cpuUsage: number; // 0-100
  gpuUsage: number; // 0-100
  ramUsage: number; // 0-100
  networkBandwidth: number; // Mbps
  averageLatency: number; // ms
  uptime: number; // milliseconds
}

export interface StreamMetrics {
  sessionId: string;
  timestamp: Date;
  fps: number;
  bitrate: number;
  packetLoss: number;
  jitter: number;
  latency: number;
  frameDrops: number;
  bandwidth: number; // Mbps
  decoderLatency: number;
  networkLatency: number;
  renderLatency: number;
}

export interface InputEvent {
  sessionId: string;
  timestamp: Date;
  type: 'keyboard' | 'mouse' | 'controller' | 'touch';
  data: any;
  sequenceNumber: number;
}

export interface GameInstance {
  instanceId: string;
  gameId: string;
  serverId: string;
  processId?: number;
  state: 'launching' | 'running' | 'paused' | 'crashed' | 'terminated';
  launchTime: Date;
  saveState?: string; // Serialized game state for quick resume
}

export interface StreamingQueue {
  queueId: string;
  userId: string;
  gameId: string;
  preferredRegion?: string;
  quality: StreamQuality;
  position: number;
  estimatedWaitTime: number; // milliseconds
  joinedAt: Date;
}

export interface StreamingEvents {
  'sessionStarted': (session: StreamingSession) => void;
  'sessionEnded': (sessionId: string, duration: number) => void;
  'qualityChanged': (sessionId: string, quality: StreamQuality) => void;
  'latencyUpdated': (sessionId: string, latency: number) => void;
  'connectionIssue': (sessionId: string, issue: string) => void;
  'serverAllocated': (serverId: string, sessionId: string) => void;
  'queuePositionChanged': (queueId: string, position: number) => void;
}

export class CloudStreamingService extends EventEmitter<StreamingEvents> {
  private sessions: Map<string, StreamingSession> = new Map();
  private servers: Map<string, StreamingServer> = new Map();
  private gameInstances: Map<string, GameInstance> = new Map();
  private queue: StreamingQueue[] = [];
  private metrics: Map<string, StreamMetrics[]> = new Map(); // sessionId -> metrics history
  private inputBuffer: Map<string, InputEvent[]> = new Map(); // sessionId -> input events

  // Quality presets
  private qualityPresets: Record<string, StreamQuality> = {
    low: {
      preset: 'low',
      adaptiveBitrate: true,
      minBitrate: 2000,
      maxBitrate: 5000,
      targetFps: 30,
    },
    medium: {
      preset: 'medium',
      adaptiveBitrate: true,
      minBitrate: 5000,
      maxBitrate: 10000,
      targetFps: 60,
    },
    high: {
      preset: 'high',
      adaptiveBitrate: true,
      minBitrate: 10000,
      maxBitrate: 20000,
      targetFps: 60,
    },
    ultra: {
      preset: 'ultra',
      adaptiveBitrate: true,
      minBitrate: 20000,
      maxBitrate: 50000,
      targetFps: 120,
    },
  };

  // Resolution presets
  private resolutionPresets: Record<string, VideoResolution> = {
    '720p': { width: 1280, height: 720, name: '720p' },
    '1080p': { width: 1920, height: 1080, name: '1080p' },
    '1440p': { width: 2560, height: 1440, name: '1440p' },
    '4K': { width: 3840, height: 2160, name: '4K' },
  };

  constructor() {
    super();
  }

  // ==================== Server Management ====================

  /**
   * Register streaming server
   */
  registerServer(server: Omit<StreamingServer, 'serverId' | 'currentSessions' | 'status'>): StreamingServer {
    const fullServer: StreamingServer = {
      serverId: uuidv4(),
      status: 'available',
      currentSessions: 0,
      ...server,
    };

    this.servers.set(fullServer.serverId, fullServer);
    return fullServer;
  }

  /**
   * Update server performance
   */
  updateServerPerformance(serverId: string, performance: ServerPerformance): void {
    const server = this.servers.get(serverId);
    if (server) {
      server.performance = performance;

      // Auto-adjust server status based on performance
      if (performance.cpuUsage > 95 || performance.gpuUsage > 95) {
        server.status = 'busy';
      } else if (server.status === 'busy' && performance.cpuUsage < 80 && performance.gpuUsage < 80) {
        server.status = 'available';
      }
    }
  }

  /**
   * Find best server for session
   */
  private findBestServer(
    gameId: string,
    preferredRegion?: string,
    quality?: StreamQuality
  ): StreamingServer | null {
    const candidates: StreamingServer[] = [];

    for (const server of this.servers.values()) {
      if (server.status !== 'available') continue;
      if (server.currentSessions >= server.maxSessions) continue;

      // Check region preference
      if (preferredRegion && server.region !== preferredRegion) {
        continue;
      }

      // Check quality requirements
      if (quality) {
        if (quality.targetFps > server.capabilities.maxFramerate) continue;
      }

      candidates.push(server);
    }

    if (candidates.length === 0) return null;

    // Sort by load (lower is better)
    candidates.sort((a, b) => {
      const loadA = a.currentSessions / a.maxSessions;
      const loadB = b.currentSessions / b.maxSessions;
      return loadA - loadB;
    });

    return candidates[0];
  }

  // ==================== Session Management ====================

  /**
   * Request streaming session
   */
  async requestSession(
    userId: string,
    gameId: string,
    options?: {
      resolution?: string;
      quality?: string;
      preferredRegion?: string;
      inputMethod?: StreamingSession['inputMethod'];
    }
  ): Promise<StreamingSession | StreamingQueue> {
    const resolution = options?.resolution
      ? this.resolutionPresets[options.resolution] || this.resolutionPresets['1080p']
      : this.resolutionPresets['1080p'];

    const quality = options?.quality
      ? this.qualityPresets[options.quality] || this.qualityPresets['medium']
      : this.qualityPresets['medium'];

    // Find available server
    const server = this.findBestServer(gameId, options?.preferredRegion, quality);

    if (!server) {
      // No server available - add to queue
      return this.addToQueue(userId, gameId, options?.preferredRegion, quality);
    }

    // Create session
    const session = await this.createSession(userId, gameId, server.serverId, resolution, quality, options?.inputMethod);

    return session;
  }

  /**
   * Create streaming session
   */
  private async createSession(
    userId: string,
    gameId: string,
    serverId: string,
    resolution: VideoResolution,
    quality: StreamQuality,
    inputMethod: StreamingSession['inputMethod'] = 'keyboard_mouse'
  ): Promise<StreamingSession> {
    const session: StreamingSession = {
      sessionId: uuidv4(),
      userId,
      gameId,
      serverId,
      status: 'initializing',
      startTime: new Date(),
      resolution,
      framerate: quality.targetFps,
      bitrate: quality.maxBitrate,
      codec: 'h264', // Default codec
      latency: 0,
      protocol: 'webrtc',
      quality,
      inputMethod,
      region: this.servers.get(serverId)?.region || 'unknown',
    };

    this.sessions.set(session.sessionId, session);
    this.metrics.set(session.sessionId, []);
    this.inputBuffer.set(session.sessionId, []);

    // Update server
    const server = this.servers.get(serverId);
    if (server) {
      server.currentSessions++;
    }

    // Launch game instance
    await this.launchGameInstance(session.sessionId, gameId, serverId);

    session.status = 'streaming';
    this.emit('sessionStarted', session);
    this.emit('serverAllocated', serverId, session.sessionId);

    return session;
  }

  /**
   * End streaming session
   */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.status = 'ended';
    session.endTime = new Date();

    const duration = session.endTime.getTime() - session.startTime.getTime();

    // Update server
    const server = this.servers.get(session.serverId);
    if (server) {
      server.currentSessions = Math.max(0, server.currentSessions - 1);
    }

    // Terminate game instance
    this.terminateGameInstance(sessionId);

    // Cleanup
    this.inputBuffer.delete(sessionId);

    this.emit('sessionEnded', sessionId, duration);

    // Process queue
    this.processQueue();
  }

  /**
   * Pause session
   */
  pauseSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'paused';

      // Save game state for quick resume
      const instance = Array.from(this.gameInstances.values())
        .find(i => i.instanceId === sessionId);

      if (instance) {
        instance.state = 'paused';
        // Would serialize game state here
      }
    }
  }

  /**
   * Resume session
   */
  resumeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'streaming';

      const instance = Array.from(this.gameInstances.values())
        .find(i => i.instanceId === sessionId);

      if (instance) {
        instance.state = 'running';
      }
    }
  }

  // ==================== Game Instance Management ====================

  /**
   * Launch game instance
   */
  private async launchGameInstance(sessionId: string, gameId: string, serverId: string): Promise<GameInstance> {
    const instance: GameInstance = {
      instanceId: sessionId,
      gameId,
      serverId,
      state: 'launching',
      launchTime: new Date(),
    };

    this.gameInstances.set(sessionId, instance);

    // Simulate game launch
    setTimeout(() => {
      instance.state = 'running';
      instance.processId = Math.floor(Math.random() * 100000);
    }, 2000);

    return instance;
  }

  /**
   * Terminate game instance
   */
  private terminateGameInstance(sessionId: string): void {
    const instance = this.gameInstances.get(sessionId);
    if (instance) {
      instance.state = 'terminated';
      this.gameInstances.delete(sessionId);
    }
  }

  // ==================== Queue Management ====================

  /**
   * Add to queue
   */
  private addToQueue(
    userId: string,
    gameId: string,
    preferredRegion: string | undefined,
    quality: StreamQuality
  ): StreamingQueue {
    const queueEntry: StreamingQueue = {
      queueId: uuidv4(),
      userId,
      gameId,
      preferredRegion,
      quality,
      position: this.queue.length + 1,
      estimatedWaitTime: (this.queue.length + 1) * 60000, // 1 minute per position
      joinedAt: new Date(),
    };

    this.queue.push(queueEntry);
    return queueEntry;
  }

  /**
   * Process queue
   */
  private processQueue(): void {
    if (this.queue.length === 0) return;

    const entry = this.queue[0];

    // Try to find server
    const server = this.findBestServer(entry.gameId, entry.preferredRegion, entry.quality);

    if (server) {
      // Remove from queue
      this.queue.shift();

      // Update positions
      this.updateQueuePositions();

      // Create session
      this.createSession(
        entry.userId,
        entry.gameId,
        server.serverId,
        this.resolutionPresets['1080p'],
        entry.quality
      );
    }
  }

  /**
   * Update queue positions
   */
  private updateQueuePositions(): void {
    this.queue.forEach((entry, index) => {
      entry.position = index + 1;
      entry.estimatedWaitTime = (index + 1) * 60000;
      this.emit('queuePositionChanged', entry.queueId, entry.position);
    });
  }

  /**
   * Get queue position
   */
  getQueuePosition(queueId: string): StreamingQueue | undefined {
    return this.queue.find(e => e.queueId === queueId);
  }

  // ==================== Input Handling ====================

  /**
   * Send input event
   */
  sendInput(sessionId: string, type: InputEvent['type'], data: any): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'streaming') {
      return;
    }

    const buffer = this.inputBuffer.get(sessionId);
    if (!buffer) return;

    const event: InputEvent = {
      sessionId,
      timestamp: new Date(),
      type,
      data,
      sequenceNumber: buffer.length,
    };

    buffer.push(event);

    // Keep buffer size manageable
    if (buffer.length > 1000) {
      buffer.shift();
    }

    // In real implementation, would send to game server
    console.log(`Input event ${type} for session ${sessionId}`);
  }

  // ==================== Quality & Metrics ====================

  /**
   * Update stream quality
   */
  updateQuality(sessionId: string, quality: Partial<StreamQuality>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    Object.assign(session.quality, quality);

    if (quality.targetFps) {
      session.framerate = quality.targetFps;
    }

    if (quality.maxBitrate) {
      session.bitrate = quality.maxBitrate;
    }

    this.emit('qualityChanged', sessionId, session.quality);
  }

  /**
   * Report stream metrics
   */
  reportMetrics(sessionId: string, metrics: Omit<StreamMetrics, 'sessionId' | 'timestamp'>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const fullMetrics: StreamMetrics = {
      sessionId,
      timestamp: new Date(),
      ...metrics,
    };

    const history = this.metrics.get(sessionId);
    if (history) {
      history.push(fullMetrics);

      // Keep last 100 metrics
      if (history.length > 100) {
        history.shift();
      }
    }

    // Update session latency
    session.latency = metrics.latency;
    this.emit('latencyUpdated', sessionId, metrics.latency);

    // Auto-adjust quality based on metrics
    if (session.quality.adaptiveBitrate) {
      this.autoAdjustQuality(session, fullMetrics);
    }

    // Detect connection issues
    if (metrics.packetLoss > 5 || metrics.latency > 150) {
      this.emit('connectionIssue', sessionId, 'High latency or packet loss detected');
    }
  }

  /**
   * Auto-adjust quality
   */
  private autoAdjustQuality(session: StreamingSession, metrics: StreamMetrics): void {
    const quality = session.quality;

    // Reduce bitrate on high packet loss
    if (metrics.packetLoss > 5) {
      const newBitrate = Math.max(quality.minBitrate, session.bitrate * 0.9);
      session.bitrate = newBitrate;
    }
    // Increase bitrate on good connection
    else if (metrics.packetLoss < 1 && metrics.latency < 50) {
      const newBitrate = Math.min(quality.maxBitrate, session.bitrate * 1.1);
      session.bitrate = newBitrate;
    }

    // Reduce framerate on performance issues
    if (metrics.frameDrops > 10) {
      session.framerate = Math.max(30, session.framerate - 10);
    }
  }

  /**
   * Get session metrics
   */
  getMetrics(sessionId: string): StreamMetrics[] {
    return this.metrics.get(sessionId) || [];
  }

  /**
   * Get average metrics
   */
  getAverageMetrics(sessionId: string): Partial<StreamMetrics> | null {
    const history = this.metrics.get(sessionId);
    if (!history || history.length === 0) return null;

    const sum = history.reduce((acc, m) => ({
      fps: acc.fps + m.fps,
      bitrate: acc.bitrate + m.bitrate,
      packetLoss: acc.packetLoss + m.packetLoss,
      latency: acc.latency + m.latency,
      jitter: acc.jitter + m.jitter,
    }), { fps: 0, bitrate: 0, packetLoss: 0, latency: 0, jitter: 0 });

    const count = history.length;

    return {
      fps: sum.fps / count,
      bitrate: sum.bitrate / count,
      packetLoss: sum.packetLoss / count,
      latency: sum.latency / count,
      jitter: sum.jitter / count,
    };
  }

  // ==================== Session Queries ====================

  /**
   * Get session
   */
  getSession(sessionId: string): StreamingSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List active sessions
   */
  listActiveSessions(userId?: string): StreamingSession[] {
    const sessions = Array.from(this.sessions.values())
      .filter(s => s.status === 'streaming' || s.status === 'paused');

    if (userId) {
      return sessions.filter(s => s.userId === userId);
    }

    return sessions;
  }

  /**
   * Get server
   */
  getServer(serverId: string): StreamingServer | undefined {
    return this.servers.get(serverId);
  }

  /**
   * List servers
   */
  listServers(region?: string, status?: StreamingServer['status']): StreamingServer[] {
    let servers = Array.from(this.servers.values());

    if (region) {
      servers = servers.filter(s => s.region === region);
    }

    if (status) {
      servers = servers.filter(s => s.status === status);
    }

    return servers;
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalServers: number;
    availableServers: number;
    activeSessions: number;
    queueLength: number;
    averageLatency: number;
    totalCapacity: number;
    usedCapacity: number;
    capacityUtilization: number;
  } {
    const availableServers = Array.from(this.servers.values())
      .filter(s => s.status === 'available').length;

    const activeSessions = Array.from(this.sessions.values())
      .filter(s => s.status === 'streaming').length;

    let totalLatency = 0;
    let latencyCount = 0;

    for (const session of this.sessions.values()) {
      if (session.status === 'streaming') {
        totalLatency += session.latency;
        latencyCount++;
      }
    }

    const averageLatency = latencyCount > 0 ? totalLatency / latencyCount : 0;

    let totalCapacity = 0;
    let usedCapacity = 0;

    for (const server of this.servers.values()) {
      totalCapacity += server.maxSessions;
      usedCapacity += server.currentSessions;
    }

    const capacityUtilization = totalCapacity > 0
      ? (usedCapacity / totalCapacity) * 100
      : 0;

    return {
      totalServers: this.servers.size,
      availableServers,
      activeSessions,
      queueLength: this.queue.length,
      averageLatency,
      totalCapacity,
      usedCapacity,
      capacityUtilization,
    };
  }
}
