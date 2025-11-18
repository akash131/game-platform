import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

/**
 * Replay and Spectator System
 * Similar to League of Legends replay, Dota 2 replay, CS:GO demo system
 */

export interface ReplayFile {
  replayId: string;
  gameSessionId: string;
  gameMode: string;
  mapName: string;
  startTime: Date;
  endTime?: Date;
  duration: number; // milliseconds
  version: string;
  fileSize: number; // bytes
  compressed: boolean;
  hash: string;
  metadata: ReplayMetadata;
  frames: ReplayFrame[];
  players: ReplayPlayer[];
  events: ReplayEvent[];
  highlights?: ReplayHighlight[];
}

export interface ReplayMetadata {
  serverVersion: string;
  gameVersion: string;
  tickRate: number;
  recordingQuality: 'low' | 'medium' | 'high' | 'ultra';
  teamScore?: Record<string, number>;
  winnerTeam?: string;
  custom?: Record<string, any>;
}

export interface ReplayFrame {
  tick: number;
  timestamp: number; // milliseconds from start
  entities: EntityState[];
  camera?: CameraState;
}

export interface EntityState {
  entityId: string;
  type: 'player' | 'npc' | 'projectile' | 'object';
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  velocity?: { x: number; y: number; z: number };
  health?: number;
  state?: string;
  animation?: string;
  custom?: Record<string, any>;
}

export interface CameraState {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  fov: number;
  target?: string; // entityId
}

export interface ReplayPlayer {
  playerId: string;
  playerName: string;
  team?: string;
  character?: string;
  stats: Record<string, number>;
  finalScore?: number;
}

export interface ReplayEvent {
  eventId: string;
  type: string;
  timestamp: number;
  tick: number;
  playerId?: string;
  data: any;
  significance: 'low' | 'medium' | 'high' | 'critical';
}

export interface ReplayHighlight {
  highlightId: string;
  type: 'kill' | 'multikill' | 'objective' | 'clutch' | 'custom';
  startTick: number;
  endTick: number;
  playerId?: string;
  description: string;
  rating?: number; // 0-100
}

export interface SpectatorSession {
  sessionId: string;
  gameSessionId: string;
  spectatorId: string;
  spectatorName: string;
  mode: 'first_person' | 'third_person' | 'free_camera' | 'tactical';
  targetPlayerId?: string;
  joinedAt: Date;
  delay: number; // milliseconds
  permissions: SpectatorPermissions;
}

export interface SpectatorPermissions {
  changeCamera: boolean;
  viewAllPlayers: boolean;
  accessReplay: boolean;
  chat: boolean;
}

export interface ReplayPlayback {
  replayId: string;
  currentTick: number;
  playbackSpeed: number; // 0.25, 0.5, 1.0, 2.0, etc.
  paused: boolean;
  loop: boolean;
  cameraMode: SpectatorSession['mode'];
  targetPlayerId?: string;
  filters?: PlaybackFilters;
}

export interface PlaybackFilters {
  showUI: boolean;
  showNames: boolean;
  showHealth: boolean;
  showTeamOnly: boolean;
  fogOfWar: boolean; // Only show what the target player could see
  highlightPlayer?: string;
}

export interface ReplayAnalytics {
  replayId: string;
  heatmaps: {
    kills: HeatmapData;
    deaths: HeatmapData;
    movement: HeatmapData;
  };
  playerPaths: Map<string, PathData>;
  timeline: TimelineEvent[];
  statistics: ReplayStatistics;
}

export interface HeatmapData {
  points: Array<{ x: number; y: number; intensity: number }>;
  resolution: { width: number; height: number };
}

export interface PathData {
  points: Array<{ x: number; y: number; z: number; timestamp: number }>;
}

export interface TimelineEvent {
  timestamp: number;
  type: string;
  description: string;
  importance: number; // 0-100
}

export interface ReplayStatistics {
  totalKills: number;
  totalDeaths: number;
  averageAccuracy: number;
  peakConcurrentSpectators: number;
  totalViews: number;
  averageViewDuration: number;
}

export interface ReplayEvents {
  'replayStarted': (replayId: string) => void;
  'replayEnded': (replayId: string) => void;
  'spectatorJoined': (session: SpectatorSession) => void;
  'spectatorLeft': (sessionId: string) => void;
  'highlightDetected': (highlight: ReplayHighlight) => void;
  'playbackSpeedChanged': (replayId: string, speed: number) => void;
}

export class ReplaySystem extends EventEmitter<ReplayEvents> {
  private replays: Map<string, ReplayFile> = new Map();
  private activeRecordings: Map<string, ReplayFile> = new Map(); // gameSessionId -> replay
  private spectatorSessions: Map<string, SpectatorSession> = new Map();
  private playbacks: Map<string, ReplayPlayback> = new Map();
  private analytics: Map<string, ReplayAnalytics> = new Map();

  private config = {
    maxReplaySize: 500 * 1024 * 1024, // 500 MB
    defaultTickRate: 64, // ticks per second
    autoDetectHighlights: true,
    spectatorDelay: 30000, // 30 seconds
    enableCompression: true,
  };

  constructor() {
    super();
  }

  // ==================== Recording ====================

  /**
   * Start recording
   */
  startRecording(
    gameSessionId: string,
    gameMode: string,
    mapName: string,
    players: ReplayPlayer[],
    metadata?: Partial<ReplayMetadata>
  ): ReplayFile {
    const replay: ReplayFile = {
      replayId: uuidv4(),
      gameSessionId,
      gameMode,
      mapName,
      startTime: new Date(),
      duration: 0,
      version: '1.0',
      fileSize: 0,
      compressed: this.config.enableCompression,
      hash: '',
      metadata: {
        serverVersion: '1.0.0',
        gameVersion: '1.0.0',
        tickRate: this.config.defaultTickRate,
        recordingQuality: 'high',
        ...metadata,
      },
      frames: [],
      players,
      events: [],
      highlights: [],
    };

    this.activeRecordings.set(gameSessionId, replay);
    this.emit('replayStarted', replay.replayId);

    return replay;
  }

  /**
   * Record frame
   */
  recordFrame(gameSessionId: string, entities: EntityState[], camera?: CameraState): void {
    const replay = this.activeRecordings.get(gameSessionId);
    if (!replay) {
      throw new Error('No active recording for this session');
    }

    const tick = replay.frames.length;
    const timestamp = Date.now() - replay.startTime.getTime();

    const frame: ReplayFrame = {
      tick,
      timestamp,
      entities,
      camera,
    };

    replay.frames.push(frame);
    replay.duration = timestamp;
  }

  /**
   * Record event
   */
  recordEvent(
    gameSessionId: string,
    type: string,
    data: any,
    significance: ReplayEvent['significance'] = 'low',
    playerId?: string
  ): ReplayEvent {
    const replay = this.activeRecordings.get(gameSessionId);
    if (!replay) {
      throw new Error('No active recording for this session');
    }

    const event: ReplayEvent = {
      eventId: uuidv4(),
      type,
      timestamp: Date.now() - replay.startTime.getTime(),
      tick: replay.frames.length - 1,
      playerId,
      data,
      significance,
    };

    replay.events.push(event);

    // Auto-detect highlights
    if (this.config.autoDetectHighlights && significance === 'critical') {
      this.detectHighlight(replay, event);
    }

    return event;
  }

  /**
   * Stop recording
   */
  stopRecording(gameSessionId: string): ReplayFile {
    const replay = this.activeRecordings.get(gameSessionId);
    if (!replay) {
      throw new Error('No active recording for this session');
    }

    replay.endTime = new Date();
    replay.duration = replay.endTime.getTime() - replay.startTime.getTime();

    // Calculate file size
    replay.fileSize = this.estimateFileSize(replay);

    // Calculate hash
    replay.hash = this.calculateReplayHash(replay);

    // Move to stored replays
    this.replays.set(replay.replayId, replay);
    this.activeRecordings.delete(gameSessionId);

    // Generate analytics
    this.generateAnalytics(replay);

    this.emit('replayEnded', replay.replayId);

    return replay;
  }

  // ==================== Highlights ====================

  /**
   * Detect highlight
   */
  private detectHighlight(replay: ReplayFile, event: ReplayEvent): void {
    let highlightType: ReplayHighlight['type'] = 'custom';
    let duration = 10000; // 10 seconds

    // Detect specific highlight types
    if (event.type.includes('kill')) {
      highlightType = 'kill';
      if (event.type.includes('multi')) {
        highlightType = 'multikill';
        duration = 15000;
      }
    } else if (event.type.includes('objective')) {
      highlightType = 'objective';
      duration = 20000;
    }

    const currentTick = replay.frames.length - 1;
    const ticksPerSecond = replay.metadata.tickRate;
    const startTick = Math.max(0, currentTick - (5 * ticksPerSecond)); // 5 seconds before
    const endTick = currentTick + (duration / 1000 * ticksPerSecond);

    const highlight: ReplayHighlight = {
      highlightId: uuidv4(),
      type: highlightType,
      startTick,
      endTick,
      playerId: event.playerId,
      description: `${highlightType} at ${this.formatTime(event.timestamp)}`,
      rating: event.significance === 'critical' ? 90 : 70,
    };

    if (!replay.highlights) {
      replay.highlights = [];
    }

    replay.highlights.push(highlight);
    this.emit('highlightDetected', highlight);
  }

  /**
   * Add custom highlight
   */
  addHighlight(
    replayId: string,
    type: ReplayHighlight['type'],
    startTick: number,
    endTick: number,
    description: string,
    playerId?: string
  ): ReplayHighlight {
    const replay = this.replays.get(replayId);
    if (!replay) {
      throw new Error('Replay not found');
    }

    const highlight: ReplayHighlight = {
      highlightId: uuidv4(),
      type,
      startTick,
      endTick,
      playerId,
      description,
    };

    if (!replay.highlights) {
      replay.highlights = [];
    }

    replay.highlights.push(highlight);
    return highlight;
  }

  // ==================== Spectating ====================

  /**
   * Join as spectator
   */
  joinSpectator(
    gameSessionId: string,
    spectatorId: string,
    spectatorName: string,
    permissions?: Partial<SpectatorPermissions>
  ): SpectatorSession {
    const session: SpectatorSession = {
      sessionId: uuidv4(),
      gameSessionId,
      spectatorId,
      spectatorName,
      mode: 'free_camera',
      joinedAt: new Date(),
      delay: this.config.spectatorDelay,
      permissions: {
        changeCamera: true,
        viewAllPlayers: true,
        accessReplay: false,
        chat: false,
        ...permissions,
      },
    };

    this.spectatorSessions.set(session.sessionId, session);
    this.emit('spectatorJoined', session);

    return session;
  }

  /**
   * Leave spectator
   */
  leaveSpectator(sessionId: string): void {
    this.spectatorSessions.delete(sessionId);
    this.emit('spectatorLeft', sessionId);
  }

  /**
   * Update spectator camera
   */
  updateSpectatorCamera(
    sessionId: string,
    mode: SpectatorSession['mode'],
    targetPlayerId?: string
  ): void {
    const session = this.spectatorSessions.get(sessionId);
    if (!session) {
      throw new Error('Spectator session not found');
    }

    if (!session.permissions.changeCamera) {
      throw new Error('No permission to change camera');
    }

    session.mode = mode;
    session.targetPlayerId = targetPlayerId;
  }

  /**
   * Get spectators for game
   */
  getSpectators(gameSessionId: string): SpectatorSession[] {
    return Array.from(this.spectatorSessions.values())
      .filter(s => s.gameSessionId === gameSessionId);
  }

  // ==================== Playback ====================

  /**
   * Start playback
   */
  startPlayback(replayId: string, options?: Partial<ReplayPlayback>): ReplayPlayback {
    const replay = this.replays.get(replayId);
    if (!replay) {
      throw new Error('Replay not found');
    }

    const playback: ReplayPlayback = {
      replayId,
      currentTick: 0,
      playbackSpeed: 1.0,
      paused: false,
      loop: false,
      cameraMode: 'free_camera',
      filters: {
        showUI: true,
        showNames: true,
        showHealth: true,
        showTeamOnly: false,
        fogOfWar: false,
      },
      ...options,
    };

    this.playbacks.set(replayId, playback);
    return playback;
  }

  /**
   * Update playback
   */
  updatePlayback(replayId: string, updates: Partial<ReplayPlayback>): void {
    const playback = this.playbacks.get(replayId);
    if (!playback) {
      throw new Error('Playback not found');
    }

    Object.assign(playback, updates);

    if (updates.playbackSpeed !== undefined) {
      this.emit('playbackSpeedChanged', replayId, updates.playbackSpeed);
    }
  }

  /**
   * Seek to tick
   */
  seekToTick(replayId: string, tick: number): void {
    const playback = this.playbacks.get(replayId);
    if (!playback) {
      throw new Error('Playback not found');
    }

    const replay = this.replays.get(replayId);
    if (!replay) {
      throw new Error('Replay not found');
    }

    playback.currentTick = Math.max(0, Math.min(tick, replay.frames.length - 1));
  }

  /**
   * Seek to time
   */
  seekToTime(replayId: string, timestamp: number): void {
    const replay = this.replays.get(replayId);
    if (!replay) {
      throw new Error('Replay not found');
    }

    // Find closest frame
    const tick = Math.floor((timestamp / replay.duration) * replay.frames.length);
    this.seekToTick(replayId, tick);
  }

  /**
   * Get frame at tick
   */
  getFrame(replayId: string, tick: number): ReplayFrame | undefined {
    const replay = this.replays.get(replayId);
    if (!replay) {
      return undefined;
    }

    return replay.frames[tick];
  }

  // ==================== Analytics ====================

  /**
   * Generate analytics
   */
  private generateAnalytics(replay: ReplayFile): void {
    const analytics: ReplayAnalytics = {
      replayId: replay.replayId,
      heatmaps: {
        kills: { points: [], resolution: { width: 1024, height: 1024 } },
        deaths: { points: [], resolution: { width: 1024, height: 1024 } },
        movement: { points: [], resolution: { width: 1024, height: 1024 } },
      },
      playerPaths: new Map(),
      timeline: [],
      statistics: {
        totalKills: 0,
        totalDeaths: 0,
        averageAccuracy: 0,
        peakConcurrentSpectators: 0,
        totalViews: 0,
        averageViewDuration: 0,
      },
    };

    // Generate heatmaps from events
    for (const event of replay.events) {
      if (event.type === 'kill' && event.data.position) {
        analytics.heatmaps.kills.points.push({
          x: event.data.position.x,
          y: event.data.position.z,
          intensity: 1,
        });
        analytics.statistics.totalKills++;
      } else if (event.type === 'death' && event.data.position) {
        analytics.heatmaps.deaths.points.push({
          x: event.data.position.x,
          y: event.data.position.z,
          intensity: 1,
        });
        analytics.statistics.totalDeaths++;
      }
    }

    // Generate player paths
    for (const player of replay.players) {
      const path: PathData = { points: [] };

      for (const frame of replay.frames) {
        const entity = frame.entities.find(e => e.entityId === player.playerId);
        if (entity) {
          path.points.push({
            ...entity.position,
            timestamp: frame.timestamp,
          });

          // Add to movement heatmap
          analytics.heatmaps.movement.points.push({
            x: entity.position.x,
            y: entity.position.z,
            intensity: 0.1,
          });
        }
      }

      analytics.playerPaths.set(player.playerId, path);
    }

    // Generate timeline from significant events
    for (const event of replay.events) {
      if (event.significance === 'high' || event.significance === 'critical') {
        analytics.timeline.push({
          timestamp: event.timestamp,
          type: event.type,
          description: `${event.type} event`,
          importance: event.significance === 'critical' ? 90 : 70,
        });
      }
    }

    this.analytics.set(replay.replayId, analytics);
  }

  /**
   * Get analytics
   */
  getAnalytics(replayId: string): ReplayAnalytics | undefined {
    return this.analytics.get(replayId);
  }

  // ==================== Management ====================

  /**
   * Get replay
   */
  getReplay(replayId: string): ReplayFile | undefined {
    return this.replays.get(replayId);
  }

  /**
   * List replays
   */
  listReplays(filters?: {
    gameMode?: string;
    playerId?: string;
    startDate?: Date;
    endDate?: Date;
  }): ReplayFile[] {
    let replays = Array.from(this.replays.values());

    if (filters) {
      if (filters.gameMode) {
        replays = replays.filter(r => r.gameMode === filters.gameMode);
      }

      if (filters.playerId) {
        replays = replays.filter(r =>
          r.players.some(p => p.playerId === filters.playerId)
        );
      }

      if (filters.startDate) {
        replays = replays.filter(r => r.startTime >= filters.startDate!);
      }

      if (filters.endDate) {
        replays = replays.filter(r => r.startTime <= filters.endDate!);
      }
    }

    return replays.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  /**
   * Delete replay
   */
  deleteReplay(replayId: string): void {
    this.replays.delete(replayId);
    this.analytics.delete(replayId);
    this.playbacks.delete(replayId);
  }

  // ==================== Utilities ====================

  /**
   * Estimate file size
   */
  private estimateFileSize(replay: ReplayFile): number {
    // Rough estimation: each frame ~1KB, events ~500B each
    const framesSize = replay.frames.length * 1024;
    const eventsSize = replay.events.length * 500;
    const metadataSize = 10000; // 10KB for metadata

    let totalSize = framesSize + eventsSize + metadataSize;

    // Compression reduces by ~70%
    if (replay.compressed) {
      totalSize *= 0.3;
    }

    return totalSize;
  }

  /**
   * Calculate replay hash
   */
  private calculateReplayHash(replay: ReplayFile): string {
    const hash = crypto.createHash('sha256');
    hash.update(replay.replayId);
    hash.update(replay.startTime.toISOString());
    hash.update(String(replay.frames.length));
    return hash.digest('hex');
  }

  /**
   * Format time
   */
  private formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalReplays: number;
    activeRecordings: number;
    totalSpectators: number;
    totalStorageUsed: number;
    averageReplayDuration: number;
    totalHighlights: number;
  } {
    let totalStorage = 0;
    let totalDuration = 0;
    let totalHighlights = 0;

    for (const replay of this.replays.values()) {
      totalStorage += replay.fileSize;
      totalDuration += replay.duration;
      totalHighlights += replay.highlights?.length || 0;
    }

    const averageReplayDuration = this.replays.size > 0
      ? totalDuration / this.replays.size
      : 0;

    return {
      totalReplays: this.replays.size,
      activeRecordings: this.activeRecordings.size,
      totalSpectators: this.spectatorSessions.size,
      totalStorageUsed: totalStorage,
      averageReplayDuration,
      totalHighlights,
    };
  }
}
