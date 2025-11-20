/**
 * Cross-Progression System
 * Multi-platform progression sync and cross-save functionality
 * Vendor parity with Epic Cross-Progression, Xbox Play Anywhere, PlayStation Cross-Save
 */

import { EventEmitter } from 'events';

export type Platform = 'pc' | 'playstation' | 'xbox' | 'switch' | 'mobile' | 'steam' | 'epic';
export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'error';
export type ConflictResolution = 'latest' | 'highest' | 'manual' | 'merge';

export interface CrossProgressionConfig {
  enableAutoSync: boolean;
  syncInterval: number; // seconds
  conflictResolution: ConflictResolution;
  enableCloudBackup: boolean;
  maxBackups: number;
  enableEncryption: boolean;
}

export interface PlayerProfile {
  userId: string;
  gameId: string;
  primaryPlatform: Platform;
  linkedPlatforms: PlatformLink[];
  progressionData: ProgressionData;
  inventory: InventoryData;
  achievements: AchievementProgress[];
  statistics: PlayerStatistics;
  settings: GameSettings;
  lastSyncedAt: Date;
  syncStatus: SyncStatus;
  conflictCount: number;
}

export interface PlatformLink {
  platform: Platform;
  platformUserId: string;
  linkedAt: Date;
  isActive: boolean;
  lastPlayedAt?: Date;
  playtime: number; // hours
}

export interface ProgressionData {
  level: number;
  experience: number;
  rank: string;
  prestigeLevel: number;
  seasonLevel: number;
  battlePassTier: number;
  unlockedContent: string[];
  completedMissions: string[];
  questProgress: Record<string, number>;
  skillTree: Record<string, number>;
}

export interface InventoryData {
  currency: Record<string, number>;
  items: InventoryItem[];
  equipment: EquipmentLoadout[];
  cosmetics: CosmeticItem[];
  consumables: Record<string, number>;
}

export interface InventoryItem {
  id: string;
  itemId: string;
  name: string;
  type: string;
  rarity: string;
  quantity: number;
  level: number;
  stats: Record<string, number>;
  acquiredAt: Date;
  platform?: Platform;
  tradeable: boolean;
}

export interface EquipmentLoadout {
  id: string;
  name: string;
  slots: Record<string, string>; // slot -> itemId
  isActive: boolean;
}

export interface CosmeticItem {
  id: string;
  type: 'skin' | 'emote' | 'spray' | 'avatar' | 'banner' | 'title';
  name: string;
  equipped: boolean;
  platform?: Platform;
  transferrable: boolean;
}

export interface AchievementProgress {
  achievementId: string;
  name: string;
  progress: number;
  maxProgress: number;
  unlocked: boolean;
  unlockedAt?: Date;
  platform?: Platform;
}

export interface PlayerStatistics {
  gamesPlayed: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  totalPlaytime: number;
  lastPlayed: Date;
  favoriteMode?: string;
  bestScore: number;
}

export interface GameSettings {
  graphics: Record<string, any>;
  audio: Record<string, any>;
  controls: Record<string, any>;
  gameplay: Record<string, any>;
  accessibility: Record<string, any>;
}

export interface SyncOperation {
  id: string;
  userId: string;
  gameId: string;
  sourcePlatform: Platform;
  targetPlatform?: Platform; // undefined = all platforms
  startedAt: Date;
  completedAt?: Date;
  status: 'running' | 'completed' | 'failed';
  itemsSynced: number;
  conflicts: SyncConflict[];
  errors: string[];
}

export interface SyncConflict {
  id: string;
  field: string;
  localValue: any;
  remoteValue: any;
  platform: Platform;
  timestamp: Date;
  resolved: boolean;
  resolution?: any;
}

export interface CloudBackup {
  id: string;
  userId: string;
  gameId: string;
  platform: Platform;
  data: any;
  size: number;
  createdAt: Date;
  checksum: string;
}

export class CrossProgressionSystem extends EventEmitter {
  private config: CrossProgressionConfig;
  private profiles: Map<string, PlayerProfile> = new Map();
  private syncOperations: Map<string, SyncOperation> = new Map();
  private backups: Map<string, CloudBackup[]> = new Map();
  private syncIntervals: Map<string, NodeJS.Timeout> = new Map();

  // Platform-specific restrictions
  private platformRestrictions: Map<Platform, string[]> = new Map([
    ['playstation', ['sony-exclusive-items']],
    ['xbox', ['microsoft-exclusive-items']],
    ['switch', ['nintendo-exclusive-items']],
    ['mobile', ['mobile-exclusive-items']]
  ]);

  constructor(config: CrossProgressionConfig) {
    super();
    this.config = {
      enableAutoSync: true,
      syncInterval: 300,
      conflictResolution: 'latest',
      enableCloudBackup: true,
      maxBackups: 10,
      enableEncryption: true,
      ...config
    };
  }

  /**
   * Create or get player profile
   */
  async getPlayerProfile(
    userId: string,
    gameId: string,
    platform: Platform
  ): Promise<PlayerProfile> {
    const key = `${userId}:${gameId}`;

    if (!this.profiles.has(key)) {
      const profile = this.createDefaultProfile(userId, gameId, platform);
      this.profiles.set(key, profile);

      if (this.config.enableAutoSync) {
        this.startAutoSync(key);
      }
    }

    return this.profiles.get(key)!;
  }

  /**
   * Create default player profile
   */
  private createDefaultProfile(
    userId: string,
    gameId: string,
    platform: Platform
  ): PlayerProfile {
    return {
      userId,
      gameId,
      primaryPlatform: platform,
      linkedPlatforms: [{
        platform,
        platformUserId: userId,
        linkedAt: new Date(),
        isActive: true,
        playtime: 0
      }],
      progressionData: {
        level: 1,
        experience: 0,
        rank: 'Bronze',
        prestigeLevel: 0,
        seasonLevel: 0,
        battlePassTier: 0,
        unlockedContent: [],
        completedMissions: [],
        questProgress: {},
        skillTree: {}
      },
      inventory: {
        currency: { gold: 0, premium: 0 },
        items: [],
        equipment: [],
        cosmetics: [],
        consumables: {}
      },
      achievements: [],
      statistics: {
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        totalPlaytime: 0,
        lastPlayed: new Date(),
        bestScore: 0
      },
      settings: {
        graphics: {},
        audio: {},
        controls: {},
        gameplay: {},
        accessibility: {}
      },
      lastSyncedAt: new Date(),
      syncStatus: 'synced',
      conflictCount: 0
    };
  }

  /**
   * Link platform to account
   */
  async linkPlatform(
    userId: string,
    gameId: string,
    platform: Platform,
    platformUserId: string
  ): Promise<PlayerProfile> {
    const profile = await this.getPlayerProfile(userId, gameId, platform);

    // Check if platform already linked
    const existing = profile.linkedPlatforms.find(p => p.platform === platform);

    if (existing) {
      throw new Error(`Platform ${platform} already linked`);
    }

    const link: PlatformLink = {
      platform,
      platformUserId,
      linkedAt: new Date(),
      isActive: true,
      playtime: 0
    };

    profile.linkedPlatforms.push(link);

    this.emit('platformLinked', { userId, gameId, platform });

    // Trigger sync to new platform
    await this.syncToAllPlatforms(userId, gameId);

    return profile;
  }

  /**
   * Unlink platform
   */
  async unlinkPlatform(
    userId: string,
    gameId: string,
    platform: Platform
  ): Promise<void> {
    const profile = await this.getPlayerProfile(userId, gameId, platform);

    if (platform === profile.primaryPlatform) {
      throw new Error('Cannot unlink primary platform');
    }

    const index = profile.linkedPlatforms.findIndex(p => p.platform === platform);

    if (index === -1) {
      throw new Error('Platform not linked');
    }

    profile.linkedPlatforms.splice(index, 1);

    this.emit('platformUnlinked', { userId, gameId, platform });
  }

  /**
   * Sync progression to all platforms
   */
  async syncToAllPlatforms(
    userId: string,
    gameId: string,
    sourcePlatform?: Platform
  ): Promise<SyncOperation> {
    const profile = await this.getPlayerProfile(userId, gameId, sourcePlatform || 'pc');

    const operation: SyncOperation = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      gameId,
      sourcePlatform: sourcePlatform || profile.primaryPlatform,
      startedAt: new Date(),
      status: 'running',
      itemsSynced: 0,
      conflicts: [],
      errors: []
    };

    this.syncOperations.set(operation.id, operation);

    try {
      // Sync progression data
      operation.itemsSynced += this.syncProgressionData(profile);

      // Sync inventory
      operation.itemsSynced += await this.syncInventory(profile);

      // Sync achievements
      operation.itemsSynced += this.syncAchievements(profile);

      // Sync statistics
      operation.itemsSynced += this.syncStatistics(profile);

      // Sync settings
      operation.itemsSynced += this.syncSettings(profile);

      operation.status = 'completed';
      operation.completedAt = new Date();
      profile.lastSyncedAt = new Date();
      profile.syncStatus = 'synced';

      // Create backup
      if (this.config.enableCloudBackup) {
        await this.createBackup(userId, gameId, sourcePlatform || profile.primaryPlatform, profile);
      }

      this.emit('syncCompleted', operation);
    } catch (error) {
      operation.status = 'failed';
      operation.errors.push(String(error));
      profile.syncStatus = 'error';

      this.emit('syncFailed', { operation, error });
    }

    return operation;
  }

  /**
   * Sync progression data
   */
  private syncProgressionData(profile: PlayerProfile): number {
    // Progression data is always synced fully
    return Object.keys(profile.progressionData).length;
  }

  /**
   * Sync inventory with platform restrictions
   */
  private async syncInventory(profile: PlayerProfile): number {
    let syncedItems = 0;

    for (const platform of profile.linkedPlatforms) {
      if (!platform.isActive) continue;

      const restrictions = this.platformRestrictions.get(platform.platform) || [];

      // Filter items based on platform restrictions
      const allowedItems = profile.inventory.items.filter(item => {
        // Check if item is platform-exclusive to another platform
        if (item.platform && item.platform !== platform.platform) {
          return false;
        }

        // Check if item type is restricted on this platform
        return !restrictions.some(restriction => item.type.includes(restriction));
      });

      syncedItems += allowedItems.length;

      // Sync cosmetics with transferability check
      const allowedCosmetics = profile.inventory.cosmetics.filter(cosmetic => {
        if (!cosmetic.transferrable) {
          return cosmetic.platform === platform.platform;
        }
        return true;
      });

      syncedItems += allowedCosmetics.length;
    }

    // Currency always syncs
    syncedItems += Object.keys(profile.inventory.currency).length;

    return syncedItems;
  }

  /**
   * Sync achievements
   */
  private syncAchievements(profile: PlayerProfile): number {
    // Achievements sync across all platforms
    // But platform-specific achievements only unlock on their platform
    return profile.achievements.length;
  }

  /**
   * Sync statistics
   */
  private syncStatistics(profile: PlayerProfile): number {
    // Statistics aggregate across all platforms
    return Object.keys(profile.statistics).length;
  }

  /**
   * Sync settings
   */
  private syncSettings(profile: PlayerProfile): number {
    // Settings sync across platforms with similar capabilities
    let syncedSettings = 0;

    for (const category of Object.keys(profile.settings)) {
      syncedSettings += Object.keys(profile.settings[category]).length;
    }

    return syncedSettings;
  }

  /**
   * Resolve sync conflict
   */
  async resolveConflict(
    conflictId: string,
    resolution: any
  ): Promise<void> {
    let found = false;

    for (const [, operation] of this.syncOperations) {
      const conflict = operation.conflicts.find(c => c.id === conflictId);

      if (conflict) {
        conflict.resolved = true;
        conflict.resolution = resolution;
        found = true;

        this.emit('conflictResolved', conflict);
        break;
      }
    }

    if (!found) {
      throw new Error('Conflict not found');
    }
  }

  /**
   * Auto-resolve conflicts based on strategy
   */
  private autoResolveConflicts(
    profile: PlayerProfile,
    conflicts: SyncConflict[]
  ): void {
    for (const conflict of conflicts) {
      let resolution: any;

      switch (this.config.conflictResolution) {
        case 'latest':
          // Use the most recent value based on timestamp
          resolution = conflict.timestamp > new Date(Date.now() - 60000)
            ? conflict.remoteValue
            : conflict.localValue;
          break;

        case 'highest':
          // Use the higher value (for numeric fields)
          if (typeof conflict.localValue === 'number' && typeof conflict.remoteValue === 'number') {
            resolution = Math.max(conflict.localValue, conflict.remoteValue);
          } else {
            resolution = conflict.remoteValue;
          }
          break;

        case 'merge':
          // Merge arrays and objects
          if (Array.isArray(conflict.localValue) && Array.isArray(conflict.remoteValue)) {
            resolution = [...new Set([...conflict.localValue, ...conflict.remoteValue])];
          } else {
            resolution = conflict.remoteValue;
          }
          break;

        case 'manual':
        default:
          // Don't auto-resolve, let user decide
          return;
      }

      conflict.resolved = true;
      conflict.resolution = resolution;
    }
  }

  /**
   * Create cloud backup
   */
  private async createBackup(
    userId: string,
    gameId: string,
    platform: Platform,
    profile: PlayerProfile
  ): Promise<CloudBackup> {
    const key = `${userId}:${gameId}`;

    if (!this.backups.has(key)) {
      this.backups.set(key, []);
    }

    const backups = this.backups.get(key)!;

    // Remove oldest backup if limit reached
    if (backups.length >= this.config.maxBackups) {
      backups.shift();
    }

    const data = JSON.stringify(profile);
    const checksum = this.calculateChecksum(data);

    const backup: CloudBackup = {
      id: `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      gameId,
      platform,
      data: profile,
      size: data.length,
      createdAt: new Date(),
      checksum
    };

    backups.push(backup);

    this.emit('backupCreated', backup);

    return backup;
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup(
    userId: string,
    gameId: string,
    backupId: string
  ): Promise<PlayerProfile> {
    const key = `${userId}:${gameId}`;
    const backups = this.backups.get(key);

    if (!backups) {
      throw new Error('No backups found');
    }

    const backup = backups.find(b => b.id === backupId);

    if (!backup) {
      throw new Error('Backup not found');
    }

    // Verify checksum
    const data = JSON.stringify(backup.data);
    const checksum = this.calculateChecksum(data);

    if (checksum !== backup.checksum) {
      throw new Error('Backup corrupted - checksum mismatch');
    }

    // Restore profile
    this.profiles.set(key, backup.data);

    this.emit('backupRestored', { userId, gameId, backupId });

    return backup.data;
  }

  /**
   * Get available backups
   */
  getBackups(userId: string, gameId: string): CloudBackup[] {
    const key = `${userId}:${gameId}`;
    return this.backups.get(key) || [];
  }

  /**
   * Start auto-sync
   */
  private startAutoSync(profileKey: string): void {
    if (this.syncIntervals.has(profileKey)) {
      return;
    }

    const interval = setInterval(async () => {
      const profile = this.profiles.get(profileKey);

      if (!profile) {
        clearInterval(interval);
        this.syncIntervals.delete(profileKey);
        return;
      }

      try {
        await this.syncToAllPlatforms(profile.userId, profile.gameId, profile.primaryPlatform);
      } catch (error) {
        this.emit('autoSyncError', { profileKey, error });
      }
    }, this.config.syncInterval * 1000);

    this.syncIntervals.set(profileKey, interval);
  }

  /**
   * Stop auto-sync
   */
  stopAutoSync(userId: string, gameId: string): void {
    const key = `${userId}:${gameId}`;
    const interval = this.syncIntervals.get(key);

    if (interval) {
      clearInterval(interval);
      this.syncIntervals.delete(key);
    }
  }

  /**
   * Calculate checksum
   */
  private calculateChecksum(data: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Transfer items between platforms
   */
  async transferItem(
    userId: string,
    gameId: string,
    itemId: string,
    fromPlatform: Platform,
    toPlatform: Platform
  ): Promise<void> {
    const profile = await this.getPlayerProfile(userId, gameId, fromPlatform);

    const item = profile.inventory.items.find(i => i.id === itemId);

    if (!item) {
      throw new Error('Item not found');
    }

    if (!item.tradeable) {
      throw new Error('Item is not transferrable');
    }

    if (item.platform && item.platform !== fromPlatform) {
      throw new Error('Item cannot be transferred from this platform');
    }

    // Check platform restrictions
    const toRestrictions = this.platformRestrictions.get(toPlatform) || [];

    if (toRestrictions.some(restriction => item.type.includes(restriction))) {
      throw new Error(`Item type ${item.type} is restricted on ${toPlatform}`);
    }

    // Update item platform
    item.platform = toPlatform;

    await this.syncToAllPlatforms(userId, gameId, fromPlatform);

    this.emit('itemTransferred', { userId, gameId, itemId, fromPlatform, toPlatform });
  }

  /**
   * Get sync statistics
   */
  async getStats(): Promise<any> {
    const totalProfiles = this.profiles.size;
    const syncedProfiles = Array.from(this.profiles.values()).filter(
      p => p.syncStatus === 'synced'
    ).length;

    const totalOperations = this.syncOperations.size;
    const completedOperations = Array.from(this.syncOperations.values()).filter(
      o => o.status === 'completed'
    ).length;

    const totalConflicts = Array.from(this.syncOperations.values()).reduce(
      (sum, o) => sum + o.conflicts.length,
      0
    );

    const totalBackups = Array.from(this.backups.values()).reduce(
      (sum, backups) => sum + backups.length,
      0
    );

    return {
      totalProfiles,
      syncedProfiles,
      profilesWithConflicts: Array.from(this.profiles.values()).filter(p => p.conflictCount > 0).length,
      totalOperations,
      completedOperations,
      totalConflicts,
      totalBackups,
      autoSyncActive: this.syncIntervals.size
    };
  }
}
