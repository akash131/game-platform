import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

/**
 * Anti-Cheat Service - Game integrity and anti-cheat system
 * Similar to Easy Anti-Cheat, BattlEye, and Valve Anti-Cheat
 */

export interface CheatDetection {
  detectionId: string;
  playerId: string;
  sessionId: string;
  timestamp: Date;
  cheatType: CheatType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-100
  evidence: CheatEvidence[];
  action: CheatAction;
  status: 'pending' | 'confirmed' | 'false_positive';
}

export enum CheatType {
  // Client-side cheats
  SPEED_HACK = 'speed_hack',
  WALLHACK = 'wallhack',
  AIMBOT = 'aimbot',
  ESP = 'esp', // Extra sensory perception
  NO_RECOIL = 'no_recoil',
  INFINITE_AMMO = 'infinite_ammo',
  GOD_MODE = 'god_mode',
  TELEPORT = 'teleport',

  // Memory manipulation
  MEMORY_EDITING = 'memory_editing',
  DLL_INJECTION = 'dll_injection',
  PROCESS_MANIPULATION = 'process_manipulation',

  // Network cheats
  PACKET_MANIPULATION = 'packet_manipulation',
  LAG_SWITCH = 'lag_switch',
  NETWORK_INJECTION = 'network_injection',

  // Gameplay cheats
  STAT_MANIPULATION = 'stat_manipulation',
  ITEM_DUPLICATION = 'item_duplication',
  CURRENCY_EXPLOIT = 'currency_exploit',
  MATCH_FIXING = 'match_fixing',

  // Automation
  BOT_USAGE = 'bot_usage',
  MACRO = 'macro',
  SCRIPT_INJECTION = 'script_injection',

  // Other
  MODIFIED_CLIENT = 'modified_client',
  UNTRUSTED_FILE = 'untrusted_file',
  SUSPICIOUS_BEHAVIOR = 'suspicious_behavior',
}

export interface CheatEvidence {
  type: 'metric' | 'file' | 'memory' | 'network' | 'behavior';
  description: string;
  data: any;
  timestamp: Date;
}

export interface CheatAction {
  type: 'none' | 'warning' | 'kick' | 'temporary_ban' | 'permanent_ban';
  duration?: number; // milliseconds for temporary ban
  reason: string;
  appealable: boolean;
}

export interface PlayerSession {
  sessionId: string;
  playerId: string;
  startTime: Date;
  endTime?: Date;
  metrics: SessionMetrics;
  fileHashes: Map<string, string>;
  behaviorScore: number; // 0-100, 100 = clean
}

export interface SessionMetrics {
  // Movement metrics
  averageSpeed: number;
  maxSpeed: number;
  teleportCount: number;

  // Combat metrics
  headshots: number;
  bodyshots: number;
  misses: number;
  headshotPercentage: number;
  averageAccuracy: number;

  // Reaction metrics
  averageReactionTime: number; // milliseconds
  suspiciouslyFastReactions: number;

  // Network metrics
  averagePing: number;
  packetLoss: number;
  suspiciousPackets: number;

  // Behavior metrics
  impossibleActions: number;
  reportCount: number;
}

export interface AntiCheatConfig {
  enableFileIntegrity: boolean;
  enableMemoryScanning: boolean;
  enableBehaviorAnalysis: boolean;
  enableNetworkMonitoring: boolean;

  // Thresholds
  headshotPercentageThreshold: number;
  speedMultiplierThreshold: number;
  reactionTimeThreshold: number;

  // Actions
  autoKickEnabled: boolean;
  autoBanEnabled: boolean;
  requireManualReview: boolean;
}

export interface PlayerReport {
  reportId: string;
  reportedPlayerId: string;
  reporterPlayerId: string;
  reason: string;
  category: 'cheating' | 'harassment' | 'exploiting' | 'other';
  timestamp: Date;
  gameSessionId?: string;
  evidence?: string[];
  status: 'pending' | 'reviewed' | 'actioned' | 'dismissed';
}

export interface Ban {
  banId: string;
  playerId: string;
  type: 'temporary' | 'permanent';
  reason: string;
  startTime: Date;
  endTime?: Date;
  appealable: boolean;
  appealStatus?: 'pending' | 'approved' | 'denied';
}

export interface AntiCheatEvents {
  'cheatDetected': (detection: CheatDetection) => void;
  'playerBanned': (ban: Ban) => void;
  'playerKicked': (playerId: string, reason: string) => void;
  'reportCreated': (report: PlayerReport) => void;
  'suspiciousActivity': (playerId: string, activity: string) => void;
}

export class AntiCheatService extends EventEmitter<AntiCheatEvents> {
  private config: AntiCheatConfig;
  private activeSessions: Map<string, PlayerSession> = new Map();
  private detections: Map<string, CheatDetection[]> = new Map(); // playerId -> detections
  private reports: Map<string, PlayerReport> = new Map();
  private bans: Map<string, Ban> = new Map(); // playerId -> ban
  private trustedFileHashes: Set<string> = new Set();
  private playerTrustScores: Map<string, number> = new Map(); // playerId -> score (0-100)

  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<AntiCheatConfig>) {
    super();

    this.config = {
      enableFileIntegrity: true,
      enableMemoryScanning: true,
      enableBehaviorAnalysis: true,
      enableNetworkMonitoring: true,
      headshotPercentageThreshold: 75,
      speedMultiplierThreshold: 1.5,
      reactionTimeThreshold: 100, // ms
      autoKickEnabled: true,
      autoBanEnabled: false,
      requireManualReview: true,
      ...config,
    };
  }

  /**
   * Start anti-cheat service
   */
  start(): void {
    if (this.monitoringInterval) {
      return;
    }

    this.monitoringInterval = setInterval(() => {
      this.monitorActiveSessions();
    }, 5000); // Check every 5 seconds

    console.log('Anti-cheat service started');
  }

  /**
   * Stop anti-cheat service
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log('Anti-cheat service stopped');
  }

  /**
   * Start player session
   */
  startSession(playerId: string, fileHashes?: Map<string, string>): PlayerSession {
    const session: PlayerSession = {
      sessionId: uuidv4(),
      playerId,
      startTime: new Date(),
      fileHashes: fileHashes || new Map(),
      behaviorScore: 100,
      metrics: {
        averageSpeed: 0,
        maxSpeed: 0,
        teleportCount: 0,
        headshots: 0,
        bodyshots: 0,
        misses: 0,
        headshotPercentage: 0,
        averageAccuracy: 0,
        averageReactionTime: 0,
        suspiciouslyFastReactions: 0,
        averagePing: 0,
        packetLoss: 0,
        suspiciousPackets: 0,
        impossibleActions: 0,
        reportCount: 0,
      },
    };

    this.activeSessions.set(session.sessionId, session);

    // Check file integrity
    if (this.config.enableFileIntegrity && fileHashes) {
      this.checkFileIntegrity(session);
    }

    return session;
  }

  /**
   * End player session
   */
  endSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.endTime = new Date();
      this.activeSessions.delete(sessionId);

      // Final analysis
      this.analyzeSession(session);
    }
  }

  /**
   * Update session metrics
   */
  updateSessionMetrics(sessionId: string, updates: Partial<SessionMetrics>): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    Object.assign(session.metrics, updates);

    // Recalculate derived metrics
    const metrics = session.metrics;

    if (metrics.headshots + metrics.bodyshots + metrics.misses > 0) {
      const totalShots = metrics.headshots + metrics.bodyshots + metrics.misses;
      const hits = metrics.headshots + metrics.bodyshots;
      metrics.headshotPercentage = (metrics.headshots / totalShots) * 100;
      metrics.averageAccuracy = (hits / totalShots) * 100;
    }

    // Check for suspicious metrics
    this.checkMetrics(session);
  }

  /**
   * Report action (shot, movement, etc.)
   */
  reportAction(sessionId: string, action: {
    type: 'shot' | 'kill' | 'movement' | 'interaction';
    target?: string;
    hit?: boolean;
    headshot?: boolean;
    speed?: number;
    position?: { x: number; y: number; z: number };
    reactionTime?: number;
  }): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const metrics = session.metrics;

    switch (action.type) {
      case 'shot':
        if (action.hit) {
          if (action.headshot) {
            metrics.headshots++;
          } else {
            metrics.bodyshots++;
          }
        } else {
          metrics.misses++;
        }

        if (action.reactionTime !== undefined) {
          const count = metrics.headshots + metrics.bodyshots + metrics.misses;
          metrics.averageReactionTime =
            (metrics.averageReactionTime * (count - 1) + action.reactionTime) / count;

          if (action.reactionTime < this.config.reactionTimeThreshold) {
            metrics.suspiciouslyFastReactions++;
          }
        }
        break;

      case 'movement':
        if (action.speed !== undefined) {
          const expectedMaxSpeed = 10; // units per second
          metrics.averageSpeed = (metrics.averageSpeed + action.speed) / 2;
          metrics.maxSpeed = Math.max(metrics.maxSpeed, action.speed);

          if (action.speed > expectedMaxSpeed * this.config.speedMultiplierThreshold) {
            this.createDetection(session, CheatType.SPEED_HACK, 'high', 80, [
              {
                type: 'metric',
                description: `Player speed ${action.speed} exceeds threshold`,
                data: { speed: action.speed, threshold: expectedMaxSpeed },
                timestamp: new Date(),
              },
            ]);
          }
        }
        break;

      case 'kill':
        // Already tracked via shots
        break;
    }

    this.updateSessionMetrics(sessionId, metrics);
  }

  /**
   * Check file integrity
   */
  private checkFileIntegrity(session: PlayerSession): void {
    for (const [file, hash] of session.fileHashes) {
      if (!this.trustedFileHashes.has(hash)) {
        this.createDetection(session, CheatType.UNTRUSTED_FILE, 'high', 90, [
          {
            type: 'file',
            description: `Untrusted file detected: ${file}`,
            data: { file, hash },
            timestamp: new Date(),
          },
        ]);
      }
    }
  }

  /**
   * Check metrics for anomalies
   */
  private checkMetrics(session: PlayerSession): void {
    const metrics = session.metrics;

    // Check headshot percentage
    if (metrics.headshotPercentage > this.config.headshotPercentageThreshold) {
      if (metrics.headshots + metrics.bodyshots > 20) { // Minimum sample size
        this.createDetection(session, CheatType.AIMBOT, 'high', 85, [
          {
            type: 'metric',
            description: 'Abnormally high headshot percentage',
            data: {
              headshotPercentage: metrics.headshotPercentage,
              threshold: this.config.headshotPercentageThreshold,
              sampleSize: metrics.headshots + metrics.bodyshots + metrics.misses,
            },
            timestamp: new Date(),
          },
        ]);
      }
    }

    // Check reaction time
    if (metrics.suspiciouslyFastReactions > 10) {
      this.createDetection(session, CheatType.AIMBOT, 'medium', 70, [
        {
          type: 'metric',
          description: 'Suspiciously fast reaction times',
          data: {
            count: metrics.suspiciouslyFastReactions,
            average: metrics.averageReactionTime,
          },
          timestamp: new Date(),
        },
      ]);
    }

    // Check impossible actions
    if (metrics.impossibleActions > 0) {
      this.createDetection(session, CheatType.SUSPICIOUS_BEHAVIOR, 'critical', 95, [
        {
          type: 'behavior',
          description: 'Impossible game actions detected',
          data: { count: metrics.impossibleActions },
          timestamp: new Date(),
        },
      ]);
    }
  }

  /**
   * Create cheat detection
   */
  private createDetection(
    session: PlayerSession,
    cheatType: CheatType,
    severity: CheatDetection['severity'],
    confidence: number,
    evidence: CheatEvidence[]
  ): CheatDetection {
    const action = this.determineAction(cheatType, severity, confidence, session.playerId);

    const detection: CheatDetection = {
      detectionId: uuidv4(),
      playerId: session.playerId,
      sessionId: session.sessionId,
      timestamp: new Date(),
      cheatType,
      severity,
      confidence,
      evidence,
      action,
      status: this.config.requireManualReview ? 'pending' : 'confirmed',
    };

    // Store detection
    if (!this.detections.has(session.playerId)) {
      this.detections.set(session.playerId, []);
    }
    this.detections.get(session.playerId)!.push(detection);

    this.emit('cheatDetected', detection);

    // Execute action
    if (!this.config.requireManualReview || (severity === 'critical' && confidence > 90)) {
      this.executeAction(detection);
    }

    // Update behavior score
    session.behaviorScore = Math.max(0, session.behaviorScore - (confidence / 2));
    this.playerTrustScores.set(session.playerId, session.behaviorScore);

    return detection;
  }

  /**
   * Determine action for detection
   */
  private determineAction(
    cheatType: CheatType,
    severity: CheatDetection['severity'],
    confidence: number,
    playerId: string
  ): CheatAction {
    const detectionHistory = this.detections.get(playerId) || [];
    const recentDetections = detectionHistory.filter(
      d => Date.now() - d.timestamp.getTime() < 86400000 // 24 hours
    ).length;

    // Critical cheats = immediate action
    if (severity === 'critical' && confidence > 90) {
      return {
        type: this.config.autoBanEnabled ? 'permanent_ban' : 'kick',
        reason: `Critical cheat detected: ${cheatType}`,
        appealable: true,
      };
    }

    // Multiple detections = escalate
    if (recentDetections >= 3) {
      return {
        type: 'temporary_ban',
        duration: 86400000, // 24 hours
        reason: 'Multiple cheat detections',
        appealable: true,
      };
    }

    // High severity = kick
    if (severity === 'high' && this.config.autoKickEnabled) {
      return {
        type: 'kick',
        reason: `Suspected cheat: ${cheatType}`,
        appealable: true,
      };
    }

    // Low/medium = warning
    return {
      type: 'warning',
      reason: `Suspicious behavior detected: ${cheatType}`,
      appealable: false,
    };
  }

  /**
   * Execute cheat action
   */
  private executeAction(detection: CheatDetection): void {
    const action = detection.action;

    switch (action.type) {
      case 'kick':
        this.kickPlayer(detection.playerId, action.reason);
        break;

      case 'temporary_ban':
        this.banPlayer(detection.playerId, 'temporary', action.reason, action.duration);
        break;

      case 'permanent_ban':
        this.banPlayer(detection.playerId, 'permanent', action.reason);
        break;

      case 'warning':
        // Warning only - logged but no action
        break;
    }
  }

  /**
   * Kick player
   */
  private kickPlayer(playerId: string, reason: string): void {
    // End all sessions
    for (const [sessionId, session] of this.activeSessions) {
      if (session.playerId === playerId) {
        this.endSession(sessionId);
      }
    }

    this.emit('playerKicked', playerId, reason);
  }

  /**
   * Ban player
   */
  private banPlayer(
    playerId: string,
    type: 'temporary' | 'permanent',
    reason: string,
    duration?: number
  ): void {
    const ban: Ban = {
      banId: uuidv4(),
      playerId,
      type,
      reason,
      startTime: new Date(),
      endTime: duration ? new Date(Date.now() + duration) : undefined,
      appealable: true,
    };

    this.bans.set(playerId, ban);
    this.kickPlayer(playerId, reason);
    this.emit('playerBanned', ban);
  }

  /**
   * Create player report
   */
  createReport(report: Omit<PlayerReport, 'reportId' | 'timestamp' | 'status'>): PlayerReport {
    const fullReport: PlayerReport = {
      reportId: uuidv4(),
      timestamp: new Date(),
      status: 'pending',
      ...report,
    };

    this.reports.set(fullReport.reportId, fullReport);
    this.emit('reportCreated', fullReport);

    // Update session metrics if in active session
    for (const session of this.activeSessions.values()) {
      if (session.playerId === report.reportedPlayerId) {
        session.metrics.reportCount++;

        // Multiple reports = suspicious
        if (session.metrics.reportCount >= 3) {
          this.emit('suspiciousActivity', report.reportedPlayerId, 'Multiple reports received');
        }
      }
    }

    return fullReport;
  }

  /**
   * Check if player is banned
   */
  isPlayerBanned(playerId: string): boolean {
    const ban = this.bans.get(playerId);
    if (!ban) return false;

    if (ban.type === 'permanent') return true;

    if (ban.endTime && ban.endTime > new Date()) {
      return true;
    }

    // Ban expired
    this.bans.delete(playerId);
    return false;
  }

  /**
   * Get player trust score
   */
  getPlayerTrustScore(playerId: string): number {
    return this.playerTrustScores.get(playerId) || 100;
  }

  /**
   * Monitor active sessions
   */
  private monitorActiveSessions(): void {
    for (const session of this.activeSessions.values()) {
      // Check session duration
      const duration = Date.now() - session.startTime.getTime();

      // Analyze behavior patterns every 5 minutes
      if (duration % 300000 < 5000) {
        this.analyzeBehaviorPatterns(session);
      }
    }
  }

  /**
   * Analyze behavior patterns
   */
  private analyzeBehaviorPatterns(session: PlayerSession): void {
    const metrics = session.metrics;

    // Pattern 1: Perfect accuracy with low ping (aimbot indicator)
    if (metrics.averageAccuracy > 95 && metrics.averagePing < 30) {
      this.emit('suspiciousActivity', session.playerId, 'Perfect accuracy with low latency');
    }

    // Pattern 2: Consistent headshot rate (aimbot indicator)
    if (metrics.headshotPercentage > 70 && metrics.headshots > 30) {
      this.emit('suspiciousActivity', session.playerId, 'Consistently high headshot rate');
    }

    // Pattern 3: Zero packet loss with suspicious packets (network manipulation)
    if (metrics.packetLoss === 0 && metrics.suspiciousPackets > 0) {
      this.emit('suspiciousActivity', session.playerId, 'Suspicious network activity');
    }
  }

  /**
   * Analyze completed session
   */
  private analyzeSession(session: PlayerSession): void {
    // Final behavior score
    const score = session.behaviorScore;
    this.playerTrustScores.set(session.playerId, score);

    if (score < 50) {
      this.emit('suspiciousActivity', session.playerId, `Low behavior score: ${score}`);
    }
  }

  /**
   * Add trusted file hash
   */
  addTrustedFile(hash: string): void {
    this.trustedFileHashes.add(hash);
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    activeSessions: number;
    totalDetections: number;
    pendingDetections: number;
    activeBans: number;
    pendingReports: number;
    averageTrustScore: number;
  } {
    let totalDetections = 0;
    let pendingDetections = 0;

    for (const detections of this.detections.values()) {
      totalDetections += detections.length;
      pendingDetections += detections.filter(d => d.status === 'pending').length;
    }

    const pendingReports = Array.from(this.reports.values())
      .filter(r => r.status === 'pending').length;

    const trustScores = Array.from(this.playerTrustScores.values());
    const averageTrustScore = trustScores.length > 0
      ? trustScores.reduce((a, b) => a + b, 0) / trustScores.length
      : 100;

    return {
      activeSessions: this.activeSessions.size,
      totalDetections,
      pendingDetections,
      activeBans: this.bans.size,
      pendingReports,
      averageTrustScore,
    };
  }
}
