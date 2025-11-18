import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

/**
 * Voice Chat System - In-game voice communication
 * Similar to Discord, Vivox, Agora
 */

export interface VoiceChannel {
  channelId: string;
  name: string;
  type: 'team' | 'party' | 'proximity' | 'global' | 'custom';
  maxParticipants?: number;
  participants: Set<string>;
  settings: VoiceChannelSettings;
  spatial?: SpatialAudioConfig;
  active: boolean;
  createdAt: Date;
}

export interface VoiceChannelSettings {
  codec: 'opus' | 'pcm' | 'aac';
  bitrate: number; // kbps
  sampleRate: number; // Hz
  channels: 1 | 2; // mono or stereo
  voiceActivityDetection: boolean;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  encrypted: boolean;
}

export interface SpatialAudioConfig {
  enabled: boolean;
  maxDistance: number; // units
  rolloffFactor: number; // 0-1
  dopplerEffect: boolean;
  reverb: boolean;
}

export interface VoiceParticipant {
  playerId: string;
  channelId: string;
  joinedAt: Date;
  speaking: boolean;
  muted: boolean;
  deafened: boolean;
  volume: number; // 0-100
  position?: { x: number; y: number; z: number };
  voiceActivity: number; // 0-100
  audioStats: ParticipantAudioStats;
}

export interface ParticipantAudioStats {
  packetsReceived: number;
  packetsLost: number;
  packetLossPercentage: number;
  jitter: number; // ms
  roundTripTime: number; // ms
  audioLevel: number; // 0-100
}

export interface VoicePermissions {
  speak: boolean;
  listen: boolean;
  muteOthers: boolean;
  moveUsers: boolean;
  kickUsers: boolean;
}

export interface VoiceSession {
  sessionId: string;
  playerId: string;
  deviceId?: string;
  connectionQuality: 'poor' | 'fair' | 'good' | 'excellent';
  connectedAt: Date;
  audioInput: MediaDeviceInfo | null;
  audioOutput: MediaDeviceInfo | null;
}

export interface MediaDeviceInfo {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

export interface VoiceEvents {
  'channelCreated': (channel: VoiceChannel) => void;
  'channelDeleted': (channelId: string) => void;
  'participantJoined': (channelId: string, playerId: string) => void;
  'participantLeft': (channelId: string, playerId: string) => void;
  'participantSpeaking': (channelId: string, playerId: string, speaking: boolean) => void;
  'participantMuted': (channelId: string, playerId: string, muted: boolean) => void;
  'audioQualityChanged': (sessionId: string, quality: VoiceSession['connectionQuality']) => void;
}

export class VoiceChatService extends EventEmitter<VoiceEvents> {
  private channels: Map<string, VoiceChannel> = new Map();
  private participants: Map<string, VoiceParticipant> = new Map(); // participantKey -> participant
  private sessions: Map<string, VoiceSession> = new Map(); // playerId -> session
  private permissions: Map<string, VoicePermissions> = new Map(); // playerId -> permissions

  // Default settings
  private defaultSettings: VoiceChannelSettings = {
    codec: 'opus',
    bitrate: 64,
    sampleRate: 48000,
    channels: 1,
    voiceActivityDetection: true,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    encrypted: true,
  };

  constructor() {
    super();
  }

  // ==================== Channels ====================

  /**
   * Create voice channel
   */
  createChannel(
    name: string,
    type: VoiceChannel['type'],
    settings?: Partial<VoiceChannelSettings>,
    spatial?: SpatialAudioConfig
  ): VoiceChannel {
    const channel: VoiceChannel = {
      channelId: uuidv4(),
      name,
      type,
      participants: new Set(),
      settings: { ...this.defaultSettings, ...settings },
      spatial,
      active: true,
      createdAt: new Date(),
    };

    this.channels.set(channel.channelId, channel);
    this.emit('channelCreated', channel);

    return channel;
  }

  /**
   * Delete channel
   */
  deleteChannel(channelId: string): void {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Remove all participants
    for (const playerId of channel.participants) {
      this.leaveChannel(channelId, playerId);
    }

    this.channels.delete(channelId);
    this.emit('channelDeleted', channelId);
  }

  /**
   * Get channel
   */
  getChannel(channelId: string): VoiceChannel | undefined {
    return this.channels.get(channelId);
  }

  /**
   * List channels
   */
  listChannels(type?: VoiceChannel['type']): VoiceChannel[] {
    const channels = Array.from(this.channels.values());

    if (type) {
      return channels.filter(c => c.type === type);
    }

    return channels;
  }

  // ==================== Participants ====================

  /**
   * Join channel
   */
  joinChannel(channelId: string, playerId: string): VoiceParticipant {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    if (channel.maxParticipants && channel.participants.size >= channel.maxParticipants) {
      throw new Error('Channel is full');
    }

    const participantKey = `${channelId}:${playerId}`;

    let participant = this.participants.get(participantKey);
    if (!participant) {
      participant = {
        playerId,
        channelId,
        joinedAt: new Date(),
        speaking: false,
        muted: false,
        deafened: false,
        volume: 100,
        voiceActivity: 0,
        audioStats: {
          packetsReceived: 0,
          packetsLost: 0,
          packetLossPercentage: 0,
          jitter: 0,
          roundTripTime: 0,
          audioLevel: 0,
        },
      };

      this.participants.set(participantKey, participant);
      channel.participants.add(playerId);

      this.emit('participantJoined', channelId, playerId);
    }

    return participant;
  }

  /**
   * Leave channel
   */
  leaveChannel(channelId: string, playerId: string): void {
    const channel = this.channels.get(channelId);
    if (!channel) {
      return;
    }

    const participantKey = `${channelId}:${playerId}`;
    this.participants.delete(participantKey);
    channel.participants.delete(playerId);

    this.emit('participantLeft', channelId, playerId);
  }

  /**
   * Get channel participants
   */
  getChannelParticipants(channelId: string): VoiceParticipant[] {
    const channel = this.channels.get(channelId);
    if (!channel) {
      return [];
    }

    const participants: VoiceParticipant[] = [];

    for (const playerId of channel.participants) {
      const participantKey = `${channelId}:${playerId}`;
      const participant = this.participants.get(participantKey);
      if (participant) {
        participants.push(participant);
      }
    }

    return participants;
  }

  // ==================== Audio Control ====================

  /**
   * Set speaking state
   */
  setSpeaking(channelId: string, playerId: string, speaking: boolean): void {
    const participantKey = `${channelId}:${playerId}`;
    const participant = this.participants.get(participantKey);

    if (participant) {
      participant.speaking = speaking;
      this.emit('participantSpeaking', channelId, playerId, speaking);
    }
  }

  /**
   * Mute participant
   */
  muteParticipant(channelId: string, playerId: string, muted: boolean): void {
    const participantKey = `${channelId}:${playerId}`;
    const participant = this.participants.get(participantKey);

    if (participant) {
      participant.muted = muted;
      this.emit('participantMuted', channelId, playerId, muted);
    }
  }

  /**
   * Deafen participant
   */
  deafenParticipant(channelId: string, playerId: string, deafened: boolean): void {
    const participantKey = `${channelId}:${playerId}`;
    const participant = this.participants.get(participantKey);

    if (participant) {
      participant.deafened = deafened;
    }
  }

  /**
   * Set participant volume
   */
  setParticipantVolume(channelId: string, playerId: string, volume: number): void {
    const participantKey = `${channelId}:${playerId}`;
    const participant = this.participants.get(participantKey);

    if (participant) {
      participant.volume = Math.max(0, Math.min(100, volume));
    }
  }

  /**
   * Update participant position (for spatial audio)
   */
  updateParticipantPosition(
    channelId: string,
    playerId: string,
    position: { x: number; y: number; z: number }
  ): void {
    const participantKey = `${channelId}:${playerId}`;
    const participant = this.participants.get(participantKey);

    if (participant) {
      participant.position = position;
    }
  }

  // ==================== Sessions ====================

  /**
   * Create voice session
   */
  createSession(playerId: string, deviceId?: string): VoiceSession {
    const session: VoiceSession = {
      sessionId: uuidv4(),
      playerId,
      deviceId,
      connectionQuality: 'good',
      connectedAt: new Date(),
      audioInput: null,
      audioOutput: null,
    };

    this.sessions.set(playerId, session);
    return session;
  }

  /**
   * End session
   */
  endSession(playerId: string): void {
    this.sessions.delete(playerId);

    // Leave all channels
    for (const channel of this.channels.values()) {
      if (channel.participants.has(playerId)) {
        this.leaveChannel(channel.channelId, playerId);
      }
    }
  }

  /**
   * Update session audio devices
   */
  updateAudioDevices(
    playerId: string,
    input?: MediaDeviceInfo,
    output?: MediaDeviceInfo
  ): void {
    const session = this.sessions.get(playerId);
    if (session) {
      if (input) session.audioInput = input;
      if (output) session.audioOutput = output;
    }
  }

  /**
   * Update audio stats
   */
  updateAudioStats(
    channelId: string,
    playerId: string,
    stats: Partial<ParticipantAudioStats>
  ): void {
    const participantKey = `${channelId}:${playerId}`;
    const participant = this.participants.get(participantKey);

    if (participant) {
      Object.assign(participant.audioStats, stats);

      // Update voice activity
      if (stats.audioLevel !== undefined) {
        participant.voiceActivity = stats.audioLevel;
      }

      // Update connection quality
      this.updateConnectionQuality(playerId, participant.audioStats);
    }
  }

  /**
   * Update connection quality
   */
  private updateConnectionQuality(playerId: string, stats: ParticipantAudioStats): void {
    const session = this.sessions.get(playerId);
    if (!session) return;

    let quality: VoiceSession['connectionQuality'];

    if (stats.packetLossPercentage > 10 || stats.roundTripTime > 300) {
      quality = 'poor';
    } else if (stats.packetLossPercentage > 5 || stats.roundTripTime > 150) {
      quality = 'fair';
    } else if (stats.packetLossPercentage > 2 || stats.roundTripTime > 75) {
      quality = 'good';
    } else {
      quality = 'excellent';
    }

    if (quality !== session.connectionQuality) {
      session.connectionQuality = quality;
      this.emit('audioQualityChanged', session.sessionId, quality);
    }
  }

  // ==================== Permissions ====================

  /**
   * Set voice permissions
   */
  setPermissions(playerId: string, permissions: VoicePermissions): void {
    this.permissions.set(playerId, permissions);
  }

  /**
   * Get permissions
   */
  getPermissions(playerId: string): VoicePermissions {
    return this.permissions.get(playerId) || {
      speak: true,
      listen: true,
      muteOthers: false,
      moveUsers: false,
      kickUsers: false,
    };
  }

  /**
   * Check permission
   */
  hasPermission(playerId: string, permission: keyof VoicePermissions): boolean {
    const permissions = this.getPermissions(playerId);
    return permissions[permission];
  }

  // ==================== Spatial Audio ====================

  /**
   * Calculate spatial audio volume
   */
  calculateSpatialVolume(
    listenerPos: { x: number; y: number; z: number },
    speakerPos: { x: number; y: number; z: number },
    config: SpatialAudioConfig
  ): number {
    if (!config.enabled) {
      return 100;
    }

    const distance = Math.sqrt(
      Math.pow(listenerPos.x - speakerPos.x, 2) +
      Math.pow(listenerPos.y - speakerPos.y, 2) +
      Math.pow(listenerPos.z - speakerPos.z, 2)
    );

    if (distance >= config.maxDistance) {
      return 0;
    }

    const attenuation = 1 - (distance / config.maxDistance) * config.rolloffFactor;
    return Math.max(0, Math.min(100, attenuation * 100));
  }

  // ==================== Statistics ====================

  /**
   * Get statistics
   */
  getStatistics(): {
    totalChannels: number;
    activeChannels: number;
    totalParticipants: number;
    activeSessions: number;
    averageChannelOccupancy: number;
    averagePacketLoss: number;
  } {
    const activeChannels = Array.from(this.channels.values()).filter(c => c.active).length;

    let totalOccupancy = 0;
    for (const channel of this.channels.values()) {
      totalOccupancy += channel.participants.size;
    }

    const averageChannelOccupancy = this.channels.size > 0
      ? totalOccupancy / this.channels.size
      : 0;

    let totalPacketLoss = 0;
    let participantCount = 0;

    for (const participant of this.participants.values()) {
      totalPacketLoss += participant.audioStats.packetLossPercentage;
      participantCount++;
    }

    const averagePacketLoss = participantCount > 0
      ? totalPacketLoss / participantCount
      : 0;

    return {
      totalChannels: this.channels.size,
      activeChannels,
      totalParticipants: this.participants.size,
      activeSessions: this.sessions.size,
      averageChannelOccupancy,
      averagePacketLoss,
    };
  }
}
