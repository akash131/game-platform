import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

/**
 * Cloud Save System - Cloud-based save game synchronization
 * Similar to Steam Cloud, Xbox Live Cloud Saves, PlayStation Plus Cloud Storage
 */

export interface SaveFile {
  saveId: string;
  playerId: string;
  fileName: string;
  data: Buffer | string;
  metadata: SaveMetadata;
  version: number;
  hash: string;
  encrypted: boolean;
  compressed: boolean;
  size: number; // bytes
  createdAt: Date;
  updatedAt: Date;
  syncedAt?: Date;
}

export interface SaveMetadata {
  gameId: string;
  slotName?: string;
  characterName?: string;
  level?: number;
  playtime?: number; // milliseconds
  screenshot?: string; // base64 or URL
  custom?: Record<string, any>;
}

export interface SaveSlot {
  slotId: string;
  name: string;
  description?: string;
  maxSize?: number; // bytes
  allowMultipleSaves: boolean;
}

export interface SyncConflict {
  conflictId: string;
  playerId: string;
  fileName: string;
  localSave: SaveFile;
  cloudSave: SaveFile;
  resolution?: 'local' | 'cloud' | 'merge' | 'keep_both';
  timestamp: Date;
}

export interface SaveQuota {
  playerId: string;
  totalSize: number; // bytes
  maxSize: number; // bytes
  fileCount: number;
  maxFiles: number;
  utilizationPercentage: number;
}

export interface SaveBackup {
  backupId: string;
  saveId: string;
  playerId: string;
  fileName: string;
  data: Buffer | string;
  timestamp: Date;
  retentionDays: number;
}

export interface CloudSaveEvents {
  'saveUploaded': (save: SaveFile) => void;
  'saveDownloaded': (save: SaveFile) => void;
  'saveDeleted': (saveId: string) => void;
  'syncConflict': (conflict: SyncConflict) => void;
  'quotaExceeded': (playerId: string, quota: SaveQuota) => void;
  'backupCreated': (backup: SaveBackup) => void;
}

export class CloudSaveService extends EventEmitter<CloudSaveEvents> {
  private saves: Map<string, SaveFile> = new Map(); // saveId -> save
  private playerSaves: Map<string, Set<string>> = new Map(); // playerId -> saveIds
  private slots: Map<string, SaveSlot> = new Map();
  private conflicts: Map<string, SyncConflict> = new Map();
  private quotas: Map<string, SaveQuota> = new Map(); // playerId -> quota
  private backups: Map<string, SaveBackup[]> = new Map(); // saveId -> backups

  // Configuration
  private config = {
    defaultMaxSize: 100 * 1024 * 1024, // 100 MB per player
    defaultMaxFiles: 50,
    enableEncryption: true,
    enableCompression: true,
    autoBackup: true,
    backupRetentionDays: 30,
    maxBackupsPerSave: 5,
  };

  constructor() {
    super();
  }

  // ==================== Save Slots ====================

  /**
   * Create save slot
   */
  createSlot(
    name: string,
    allowMultipleSaves: boolean = true,
    maxSize?: number,
    description?: string
  ): SaveSlot {
    const slot: SaveSlot = {
      slotId: uuidv4(),
      name,
      description,
      maxSize,
      allowMultipleSaves,
    };

    this.slots.set(slot.slotId, slot);
    return slot;
  }

  /**
   * Get save slot
   */
  getSlot(slotId: string): SaveSlot | undefined {
    return this.slots.get(slotId);
  }

  // ==================== Save Management ====================

  /**
   * Upload save file
   */
  async uploadSave(
    playerId: string,
    fileName: string,
    data: Buffer | string,
    metadata: SaveMetadata,
    options?: {
      encrypt?: boolean;
      compress?: boolean;
      createBackup?: boolean;
    }
  ): Promise<SaveFile> {
    // Check quota
    const quota = this.getOrCreateQuota(playerId);
    const dataSize = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data);

    if (quota.totalSize + dataSize > quota.maxSize) {
      this.emit('quotaExceeded', playerId, quota);
      throw new Error('Quota exceeded');
    }

    if (quota.fileCount >= quota.maxFiles) {
      throw new Error('Maximum file count reached');
    }

    // Check for existing save
    const existingSave = this.findSave(playerId, fileName);

    let processedData = data;
    let compressed = options?.compress ?? this.config.enableCompression;
    let encrypted = options?.encrypt ?? this.config.enableEncryption;

    // Compress if enabled
    if (compressed && typeof processedData === 'string') {
      // In real implementation, use zlib or similar
      processedData = Buffer.from(processedData, 'utf-8');
    }

    // Encrypt if enabled
    if (encrypted) {
      processedData = this.encryptData(processedData);
    }

    const hash = this.calculateHash(processedData);
    const size = Buffer.isBuffer(processedData) ? processedData.length : Buffer.byteLength(processedData);

    const save: SaveFile = {
      saveId: existingSave?.saveId || uuidv4(),
      playerId,
      fileName,
      data: processedData,
      metadata,
      version: existingSave ? existingSave.version + 1 : 1,
      hash,
      encrypted,
      compressed,
      size,
      createdAt: existingSave?.createdAt || new Date(),
      updatedAt: new Date(),
      syncedAt: new Date(),
    };

    // Create backup if enabled
    if ((options?.createBackup ?? this.config.autoBackup) && existingSave) {
      this.createBackup(existingSave);
    }

    // Update or create save
    this.saves.set(save.saveId, save);

    if (!this.playerSaves.has(playerId)) {
      this.playerSaves.set(playerId, new Set());
    }
    this.playerSaves.get(playerId)!.add(save.saveId);

    // Update quota
    if (existingSave) {
      quota.totalSize = quota.totalSize - existingSave.size + size;
    } else {
      quota.totalSize += size;
      quota.fileCount++;
    }

    quota.utilizationPercentage = (quota.totalSize / quota.maxSize) * 100;

    this.emit('saveUploaded', save);
    return save;
  }

  /**
   * Download save file
   */
  async downloadSave(playerId: string, fileName: string): Promise<SaveFile | null> {
    const save = this.findSave(playerId, fileName);
    if (!save) {
      return null;
    }

    let data = save.data;

    // Decrypt if encrypted
    if (save.encrypted) {
      data = this.decryptData(data);
    }

    // Decompress if compressed
    if (save.compressed) {
      // In real implementation, use zlib or similar
      data = data.toString('utf-8');
    }

    const downloadedSave: SaveFile = {
      ...save,
      data,
      encrypted: false,
      compressed: false,
    };

    this.emit('saveDownloaded', downloadedSave);
    return downloadedSave;
  }

  /**
   * Delete save file
   */
  deleteSave(playerId: string, fileName: string): void {
    const save = this.findSave(playerId, fileName);
    if (!save) {
      throw new Error('Save not found');
    }

    // Update quota
    const quota = this.quotas.get(playerId);
    if (quota) {
      quota.totalSize -= save.size;
      quota.fileCount--;
      quota.utilizationPercentage = (quota.totalSize / quota.maxSize) * 100;
    }

    // Remove from maps
    this.saves.delete(save.saveId);
    this.playerSaves.get(playerId)?.delete(save.saveId);

    // Delete backups
    this.backups.delete(save.saveId);

    this.emit('saveDeleted', save.saveId);
  }

  /**
   * List player saves
   */
  listSaves(playerId: string, gameId?: string): SaveFile[] {
    const saveIds = this.playerSaves.get(playerId);
    if (!saveIds) {
      return [];
    }

    const saves: SaveFile[] = [];

    for (const saveId of saveIds) {
      const save = this.saves.get(saveId);
      if (save && (!gameId || save.metadata.gameId === gameId)) {
        saves.push(save);
      }
    }

    return saves.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  // ==================== Sync & Conflicts ====================

  /**
   * Sync saves
   */
  async syncSaves(playerId: string, localSaves: SaveFile[]): Promise<{
    uploaded: SaveFile[];
    downloaded: SaveFile[];
    conflicts: SyncConflict[];
  }> {
    const uploaded: SaveFile[] = [];
    const downloaded: SaveFile[] = [];
    const conflicts: SyncConflict[] = [];

    const cloudSaves = this.listSaves(playerId);

    // Check each local save
    for (const localSave of localSaves) {
      const cloudSave = this.findSave(playerId, localSave.fileName);

      if (!cloudSave) {
        // Upload new save
        const save = await this.uploadSave(
          playerId,
          localSave.fileName,
          localSave.data,
          localSave.metadata
        );
        uploaded.push(save);
      } else if (cloudSave.hash !== localSave.hash) {
        // Conflict - different versions
        if (cloudSave.updatedAt > localSave.updatedAt) {
          // Cloud is newer - download
          const save = await this.downloadSave(playerId, localSave.fileName);
          if (save) downloaded.push(save);
        } else if (localSave.updatedAt > cloudSave.updatedAt) {
          // Local is newer - upload
          const save = await this.uploadSave(
            playerId,
            localSave.fileName,
            localSave.data,
            localSave.metadata
          );
          uploaded.push(save);
        } else {
          // Same timestamp but different data - conflict
          const conflict = this.createConflict(playerId, localSave, cloudSave);
          conflicts.push(conflict);
        }
      }
    }

    // Check for cloud saves not in local
    for (const cloudSave of cloudSaves) {
      const hasLocal = localSaves.some(s => s.fileName === cloudSave.fileName);
      if (!hasLocal) {
        const save = await this.downloadSave(playerId, cloudSave.fileName);
        if (save) downloaded.push(save);
      }
    }

    return { uploaded, downloaded, conflicts };
  }

  /**
   * Create sync conflict
   */
  private createConflict(
    playerId: string,
    localSave: SaveFile,
    cloudSave: SaveFile
  ): SyncConflict {
    const conflict: SyncConflict = {
      conflictId: uuidv4(),
      playerId,
      fileName: localSave.fileName,
      localSave,
      cloudSave,
      timestamp: new Date(),
    };

    this.conflicts.set(conflict.conflictId, conflict);
    this.emit('syncConflict', conflict);

    return conflict;
  }

  /**
   * Resolve conflict
   */
  async resolveConflict(
    conflictId: string,
    resolution: SyncConflict['resolution']
  ): Promise<void> {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) {
      throw new Error('Conflict not found');
    }

    conflict.resolution = resolution;

    switch (resolution) {
      case 'local':
        await this.uploadSave(
          conflict.playerId,
          conflict.localSave.fileName,
          conflict.localSave.data,
          conflict.localSave.metadata
        );
        break;

      case 'cloud':
        // Keep cloud version - no action needed
        break;

      case 'keep_both':
        // Rename local save and upload
        const newFileName = `${conflict.localSave.fileName}.conflict.${Date.now()}`;
        await this.uploadSave(
          conflict.playerId,
          newFileName,
          conflict.localSave.data,
          conflict.localSave.metadata
        );
        break;

      case 'merge':
        // Merge logic would be game-specific
        throw new Error('Merge resolution not implemented');
    }

    this.conflicts.delete(conflictId);
  }

  // ==================== Backups ====================

  /**
   * Create backup
   */
  private createBackup(save: SaveFile): void {
    const backup: SaveBackup = {
      backupId: uuidv4(),
      saveId: save.saveId,
      playerId: save.playerId,
      fileName: save.fileName,
      data: save.data,
      timestamp: new Date(),
      retentionDays: this.config.backupRetentionDays,
    };

    if (!this.backups.has(save.saveId)) {
      this.backups.set(save.saveId, []);
    }

    const saveBackups = this.backups.get(save.saveId)!;
    saveBackups.unshift(backup);

    // Keep only max backups
    if (saveBackups.length > this.config.maxBackupsPerSave) {
      saveBackups.splice(this.config.maxBackupsPerSave);
    }

    this.emit('backupCreated', backup);
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup(backupId: string): Promise<SaveFile> {
    let backup: SaveBackup | undefined;
    let saveId: string | undefined;

    for (const [sid, backups] of this.backups) {
      backup = backups.find(b => b.backupId === backupId);
      if (backup) {
        saveId = sid;
        break;
      }
    }

    if (!backup || !saveId) {
      throw new Error('Backup not found');
    }

    const currentSave = this.saves.get(saveId);
    if (!currentSave) {
      throw new Error('Current save not found');
    }

    // Create backup of current state
    this.createBackup(currentSave);

    // Restore from backup
    const restoredSave: SaveFile = {
      ...currentSave,
      data: backup.data,
      version: currentSave.version + 1,
      updatedAt: new Date(),
      hash: this.calculateHash(backup.data),
    };

    this.saves.set(saveId, restoredSave);
    return restoredSave;
  }

  /**
   * List backups
   */
  listBackups(saveId: string): SaveBackup[] {
    return this.backups.get(saveId) || [];
  }

  // ==================== Quota Management ====================

  /**
   * Get or create quota
   */
  private getOrCreateQuota(playerId: string): SaveQuota {
    let quota = this.quotas.get(playerId);

    if (!quota) {
      quota = {
        playerId,
        totalSize: 0,
        maxSize: this.config.defaultMaxSize,
        fileCount: 0,
        maxFiles: this.config.defaultMaxFiles,
        utilizationPercentage: 0,
      };
      this.quotas.set(playerId, quota);
    }

    return quota;
  }

  /**
   * Get quota
   */
  getQuota(playerId: string): SaveQuota {
    return this.getOrCreateQuota(playerId);
  }

  /**
   * Set quota limits
   */
  setQuotaLimits(playerId: string, maxSize?: number, maxFiles?: number): void {
    const quota = this.getOrCreateQuota(playerId);

    if (maxSize !== undefined) {
      quota.maxSize = maxSize;
    }

    if (maxFiles !== undefined) {
      quota.maxFiles = maxFiles;
    }

    quota.utilizationPercentage = (quota.totalSize / quota.maxSize) * 100;
  }

  // ==================== Utilities ====================

  /**
   * Find save by player and filename
   */
  private findSave(playerId: string, fileName: string): SaveFile | undefined {
    const saveIds = this.playerSaves.get(playerId);
    if (!saveIds) {
      return undefined;
    }

    for (const saveId of saveIds) {
      const save = this.saves.get(saveId);
      if (save && save.fileName === fileName) {
        return save;
      }
    }

    return undefined;
  }

  /**
   * Calculate hash
   */
  private calculateHash(data: Buffer | string): string {
    const hash = crypto.createHash('sha256');
    hash.update(Buffer.isBuffer(data) ? data : Buffer.from(data));
    return hash.digest('hex');
  }

  /**
   * Encrypt data
   */
  private encryptData(data: Buffer | string): Buffer {
    // Simple XOR encryption for demo (use AES in production)
    const key = Buffer.from('encryption-key-should-be-secure');
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const encrypted = Buffer.alloc(buffer.length);

    for (let i = 0; i < buffer.length; i++) {
      encrypted[i] = buffer[i] ^ key[i % key.length];
    }

    return encrypted;
  }

  /**
   * Decrypt data
   */
  private decryptData(data: Buffer | string): Buffer {
    // XOR encryption is symmetric
    return this.encryptData(data);
  }

  /**
   * Clean up old backups
   */
  cleanupOldBackups(): void {
    const now = Date.now();

    for (const [saveId, backups] of this.backups) {
      const filtered = backups.filter(backup => {
        const age = now - backup.timestamp.getTime();
        const maxAge = backup.retentionDays * 86400000; // days to ms
        return age < maxAge;
      });

      if (filtered.length === 0) {
        this.backups.delete(saveId);
      } else if (filtered.length !== backups.length) {
        this.backups.set(saveId, filtered);
      }
    }
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalSaves: number;
    totalPlayers: number;
    totalStorageUsed: number;
    averageFileSize: number;
    totalBackups: number;
    averageQuotaUtilization: number;
  } {
    let totalStorage = 0;
    let totalBackups = 0;
    let totalUtilization = 0;

    for (const save of this.saves.values()) {
      totalStorage += save.size;
    }

    for (const backups of this.backups.values()) {
      totalBackups += backups.length;
    }

    for (const quota of this.quotas.values()) {
      totalUtilization += quota.utilizationPercentage;
    }

    const averageQuotaUtilization = this.quotas.size > 0
      ? totalUtilization / this.quotas.size
      : 0;

    const averageFileSize = this.saves.size > 0
      ? totalStorage / this.saves.size
      : 0;

    return {
      totalSaves: this.saves.size,
      totalPlayers: this.playerSaves.size,
      totalStorageUsed: totalStorage,
      averageFileSize,
      totalBackups,
      averageQuotaUtilization,
    };
  }
}
