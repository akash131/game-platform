/**
 * DRM and Licensing System
 * Game distribution, license management, and copy protection
 * Vendor parity with Steam DRM, Epic DRM, Denuvo
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export type LicenseType = 'full' | 'trial' | 'subscription' | 'rental' | 'educational' | 'press';
export type LicenseStatus = 'active' | 'suspended' | 'revoked' | 'expired' | 'pending';
export type ActivationMethod = 'online' | 'offline' | 'hardware';

export interface DRMConfig {
  requireOnlineActivation: boolean;
  allowOfflineMode: boolean;
  offlineGracePeriod: number; // hours
  maxActivations: number;
  maxConcurrentSessions: number;
  hardwareBindingEnabled: boolean;
  enableTamperDetection: boolean;
  enableEncryption: boolean;
  heartbeatInterval: number; // seconds
}

export interface License {
  id: string;
  key: string;
  gameId: string;
  userId: string;
  type: LicenseType;
  status: LicenseStatus;
  activations: Activation[];
  maxActivations: number;
  features: string[];
  restrictions: LicenseRestrictions;
  metadata: Record<string, any>;
  issuedAt: Date;
  activatedAt?: Date;
  expiresAt?: Date;
  lastValidated?: Date;
}

export interface Activation {
  id: string;
  licenseId: string;
  deviceId: string;
  hardwareHash: string;
  ipAddress: string;
  location?: string;
  activatedAt: Date;
  lastSeen: Date;
  isActive: boolean;
}

export interface LicenseRestrictions {
  regions?: string[]; // Allowed regions
  platforms?: string[]; // Allowed platforms
  maxPlayTime?: number; // Hours
  expiryDate?: Date;
  requiresInternet?: boolean;
  allowedIPs?: string[];
}

export interface ProductKey {
  key: string;
  gameId: string;
  type: LicenseType;
  batchId: string;
  isRedeemed: boolean;
  redeemedBy?: string;
  redeemedAt?: Date;
  createdAt: Date;
  expiresAt?: Date;
}

export interface HardwareProfile {
  deviceId: string;
  cpuId: string;
  motherboardId: string;
  diskId: string;
  macAddress: string;
  hash: string;
}

export interface ValidationResult {
  valid: boolean;
  license?: License;
  activation?: Activation;
  errors: string[];
  warnings: string[];
  remainingPlayTime?: number;
  nextValidation?: Date;
}

export interface BuildVersion {
  gameId: string;
  version: string;
  buildNumber: number;
  platform: string;
  size: number;
  releaseNotes: string;
  isDeltaPatch: boolean;
  requiredVersion?: string;
  downloadUrl: string;
  checksum: string;
  uploadedAt: Date;
  isPublic: boolean;
  isMandatory: boolean;
}

export class DRMService extends EventEmitter {
  private config: DRMConfig;
  private licenses: Map<string, License> = new Map();
  private activations: Map<string, Activation> = new Map();
  private productKeys: Map<string, ProductKey> = new Map();
  private buildVersions: Map<string, BuildVersion[]> = new Map();
  private encryptionKey: Buffer;
  private heartbeats: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: DRMConfig) {
    super();
    this.config = {
      requireOnlineActivation: true,
      allowOfflineMode: true,
      offlineGracePeriod: 72,
      maxActivations: 5,
      maxConcurrentSessions: 1,
      hardwareBindingEnabled: true,
      enableTamperDetection: true,
      enableEncryption: true,
      heartbeatInterval: 300, // 5 minutes
      ...config
    };

    this.encryptionKey = crypto.randomBytes(32);
  }

  /**
   * Generate product keys batch
   */
  async generateProductKeys(
    gameId: string,
    type: LicenseType,
    count: number,
    expiresAt?: Date
  ): Promise<ProductKey[]> {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const keys: ProductKey[] = [];

    for (let i = 0; i < count; i++) {
      const key = this.generateLicenseKey(gameId);

      const productKey: ProductKey = {
        key,
        gameId,
        type,
        batchId,
        isRedeemed: false,
        createdAt: new Date(),
        expiresAt
      };

      this.productKeys.set(key, productKey);
      keys.push(productKey);
    }

    this.emit('keysGenerated', { batchId, count, gameId });

    return keys;
  }

  /**
   * Generate license key with checksum
   */
  private generateLicenseKey(gameId: string): string {
    // Format: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
    const segments: string[] = [];

    for (let i = 0; i < 4; i++) {
      const segment = Math.random().toString(36).substr(2, 5).toUpperCase();
      segments.push(segment);
    }

    // Add checksum segment
    const data = segments.join('') + gameId;
    const checksum = crypto.createHash('md5').update(data).digest('hex').substr(0, 5).toUpperCase();
    segments.push(checksum);

    return segments.join('-');
  }

  /**
   * Validate license key format
   */
  private validateKeyFormat(key: string): boolean {
    const pattern = /^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/;
    return pattern.test(key);
  }

  /**
   * Redeem product key
   */
  async redeemProductKey(
    key: string,
    userId: string,
    hardwareProfile: HardwareProfile
  ): Promise<License> {
    if (!this.validateKeyFormat(key)) {
      throw new Error('Invalid key format');
    }

    const productKey = this.productKeys.get(key);

    if (!productKey) {
      throw new Error('Product key not found');
    }

    if (productKey.isRedeemed) {
      throw new Error('Product key already redeemed');
    }

    if (productKey.expiresAt && productKey.expiresAt < new Date()) {
      throw new Error('Product key expired');
    }

    // Create license
    const license = await this.createLicense(
      productKey.gameId,
      userId,
      productKey.type,
      key
    );

    // Activate on current device
    await this.activateLicense(license.id, hardwareProfile);

    // Mark key as redeemed
    productKey.isRedeemed = true;
    productKey.redeemedBy = userId;
    productKey.redeemedAt = new Date();

    this.emit('keyRedeemed', { key, userId, license });

    return license;
  }

  /**
   * Create license
   */
  async createLicense(
    gameId: string,
    userId: string,
    type: LicenseType,
    key?: string
  ): Promise<License> {
    const licenseKey = key || this.generateLicenseKey(gameId);

    const license: License = {
      id: `lic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      key: licenseKey,
      gameId,
      userId,
      type,
      status: 'active',
      activations: [],
      maxActivations: this.config.maxActivations,
      features: [],
      restrictions: {},
      metadata: {},
      issuedAt: new Date()
    };

    // Set expiry for time-limited licenses
    if (type === 'trial') {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 14); // 14-day trial
      license.expiresAt = expiresAt;
      license.restrictions.maxPlayTime = 10; // 10 hours
    } else if (type === 'rental') {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7-day rental
      license.expiresAt = expiresAt;
    }

    this.licenses.set(license.id, license);

    this.emit('licenseCreated', license);

    return license;
  }

  /**
   * Activate license on device
   */
  async activateLicense(
    licenseId: string,
    hardwareProfile: HardwareProfile,
    ipAddress: string = '0.0.0.0'
  ): Promise<Activation> {
    const license = this.licenses.get(licenseId);

    if (!license) {
      throw new Error('License not found');
    }

    if (license.status !== 'active') {
      throw new Error(`License is ${license.status}`);
    }

    // Check activation limit
    const activeActivations = license.activations.filter(a => a.isActive);

    if (activeActivations.length >= license.maxActivations) {
      throw new Error(`Maximum activations (${license.maxActivations}) reached`);
    }

    // Check if already activated on this device
    const existingActivation = license.activations.find(
      a => a.hardwareHash === hardwareProfile.hash
    );

    if (existingActivation) {
      existingActivation.isActive = true;
      existingActivation.lastSeen = new Date();
      this.emit('licenseReactivated', existingActivation);
      return existingActivation;
    }

    // Create new activation
    const activation: Activation = {
      id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      licenseId,
      deviceId: hardwareProfile.deviceId,
      hardwareHash: hardwareProfile.hash,
      ipAddress,
      activatedAt: new Date(),
      lastSeen: new Date(),
      isActive: true
    };

    license.activations.push(activation);
    license.activatedAt = license.activatedAt || new Date();

    this.activations.set(activation.id, activation);

    // Start heartbeat monitoring
    if (this.config.heartbeatInterval > 0) {
      this.startHeartbeat(activation.id);
    }

    this.emit('licenseActivated', { license, activation });

    return activation;
  }

  /**
   * Deactivate license on device
   */
  async deactivateLicense(
    licenseId: string,
    deviceId: string
  ): Promise<void> {
    const license = this.licenses.get(licenseId);

    if (!license) {
      throw new Error('License not found');
    }

    const activation = license.activations.find(a => a.deviceId === deviceId);

    if (!activation) {
      throw new Error('Activation not found for this device');
    }

    activation.isActive = false;

    // Stop heartbeat
    this.stopHeartbeat(activation.id);

    this.emit('licenseDeactivated', { license, activation });
  }

  /**
   * Validate license
   */
  async validateLicense(
    licenseId: string,
    hardwareProfile: HardwareProfile
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const license = this.licenses.get(licenseId);

    if (!license) {
      errors.push('License not found');
      return { valid: false, errors, warnings };
    }

    // Check license status
    if (license.status !== 'active') {
      errors.push(`License is ${license.status}`);
    }

    // Check expiry
    if (license.expiresAt && license.expiresAt < new Date()) {
      errors.push('License expired');
      license.status = 'expired';
    }

    // Find activation
    const activation = license.activations.find(
      a => a.hardwareHash === hardwareProfile.hash
    );

    if (!activation) {
      if (this.config.requireOnlineActivation) {
        errors.push('License not activated on this device');
      }
    } else if (!activation.isActive) {
      errors.push('License activation is inactive');
    }

    // Hardware binding check
    if (this.config.hardwareBindingEnabled && activation) {
      if (activation.hardwareHash !== hardwareProfile.hash) {
        errors.push('Hardware mismatch detected');
      }
    }

    // Check concurrent sessions
    if (activation) {
      const concurrentSessions = license.activations.filter(
        a => a.isActive && a.id !== activation.id
      ).length;

      if (concurrentSessions >= this.config.maxConcurrentSessions) {
        errors.push('Maximum concurrent sessions reached');
      }
    }

    // Check restrictions
    if (license.restrictions.requiresInternet && !this.isOnline()) {
      errors.push('Internet connection required');
    }

    // Update last validated
    license.lastValidated = new Date();

    // Calculate next validation time
    const nextValidation = new Date();
    nextValidation.setSeconds(nextValidation.getSeconds() + this.config.heartbeatInterval);

    const valid = errors.length === 0;

    this.emit('licenseValidated', { license, valid, errors, warnings });

    return {
      valid,
      license,
      activation,
      errors,
      warnings,
      nextValidation
    };
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(activationId: string): void {
    const interval = setInterval(() => {
      const activation = this.activations.get(activationId);

      if (!activation || !activation.isActive) {
        clearInterval(interval);
        this.heartbeats.delete(activationId);
        return;
      }

      // Check if heartbeat missed
      const timeSinceLastSeen = Date.now() - activation.lastSeen.getTime();
      const missedThreshold = this.config.heartbeatInterval * 1000 * 3; // 3 missed heartbeats

      if (timeSinceLastSeen > missedThreshold) {
        activation.isActive = false;
        this.emit('heartbeatMissed', activation);
        clearInterval(interval);
        this.heartbeats.delete(activationId);
      }
    }, this.config.heartbeatInterval * 1000);

    this.heartbeats.set(activationId, interval);
  }

  /**
   * Stop heartbeat monitoring
   */
  private stopHeartbeat(activationId: string): void {
    const interval = this.heartbeats.get(activationId);

    if (interval) {
      clearInterval(interval);
      this.heartbeats.delete(activationId);
    }
  }

  /**
   * Send heartbeat
   */
  async sendHeartbeat(activationId: string): Promise<void> {
    const activation = this.activations.get(activationId);

    if (!activation) {
      throw new Error('Activation not found');
    }

    activation.lastSeen = new Date();

    this.emit('heartbeat', activation);
  }

  /**
   * Create hardware profile
   */
  createHardwareProfile(
    cpuId: string,
    motherboardId: string,
    diskId: string,
    macAddress: string
  ): HardwareProfile {
    const deviceId = `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const hash = crypto
      .createHash('sha256')
      .update(`${cpuId}:${motherboardId}:${diskId}:${macAddress}`)
      .digest('hex');

    return {
      deviceId,
      cpuId,
      motherboardId,
      diskId,
      macAddress,
      hash
    };
  }

  /**
   * Upload build version
   */
  async uploadBuildVersion(
    gameId: string,
    version: string,
    platform: string,
    downloadUrl: string,
    size: number,
    releaseNotes: string,
    isDeltaPatch: boolean = false,
    requiredVersion?: string
  ): Promise<BuildVersion> {
    const builds = this.buildVersions.get(gameId) || [];

    const buildNumber = builds.length + 1;

    // Calculate checksum
    const checksum = crypto
      .createHash('sha256')
      .update(`${gameId}:${version}:${buildNumber}`)
      .digest('hex');

    const build: BuildVersion = {
      gameId,
      version,
      buildNumber,
      platform,
      size,
      releaseNotes,
      isDeltaPatch,
      requiredVersion,
      downloadUrl,
      checksum,
      uploadedAt: new Date(),
      isPublic: false,
      isMandatory: false
    };

    builds.push(build);
    this.buildVersions.set(gameId, builds);

    this.emit('buildUploaded', build);

    return build;
  }

  /**
   * Check for updates
   */
  async checkForUpdates(
    gameId: string,
    currentVersion: string,
    platform: string
  ): Promise<BuildVersion | null> {
    const builds = this.buildVersions.get(gameId) || [];

    // Filter by platform and public builds
    const availableBuilds = builds.filter(
      b => b.platform === platform && b.isPublic && b.version !== currentVersion
    );

    if (availableBuilds.length === 0) {
      return null;
    }

    // Return latest build
    return availableBuilds[availableBuilds.length - 1];
  }

  /**
   * Encrypt game file
   */
  encryptFile(data: Buffer): Buffer {
    if (!this.config.enableEncryption) {
      return data;
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);

    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);

    // Prepend IV to encrypted data
    return Buffer.concat([iv, encrypted]);
  }

  /**
   * Decrypt game file
   */
  decryptFile(data: Buffer): Buffer {
    if (!this.config.enableEncryption) {
      return data;
    }

    const iv = data.slice(0, 16);
    const encrypted = data.slice(16);

    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  /**
   * Detect tampering
   */
  async detectTampering(
    gameId: string,
    fileChecksums: Record<string, string>
  ): Promise<string[]> {
    if (!this.config.enableTamperDetection) {
      return [];
    }

    const tamperedFiles: string[] = [];

    // Get latest build for verification
    const builds = this.buildVersions.get(gameId) || [];
    if (builds.length === 0) {
      return [];
    }

    // In production, compare checksums with original files
    // For now, mock tampering detection

    this.emit('tamperCheck', { gameId, fileCount: Object.keys(fileChecksums).length });

    return tamperedFiles;
  }

  /**
   * Revoke license
   */
  async revokeLicense(licenseId: string, reason: string): Promise<void> {
    const license = this.licenses.get(licenseId);

    if (!license) {
      throw new Error('License not found');
    }

    license.status = 'revoked';
    license.metadata.revocationReason = reason;
    license.metadata.revokedAt = new Date();

    // Deactivate all activations
    for (const activation of license.activations) {
      activation.isActive = false;
      this.stopHeartbeat(activation.id);
    }

    this.emit('licenseRevoked', { license, reason });
  }

  /**
   * Transfer license to another user
   */
  async transferLicense(
    licenseId: string,
    newUserId: string
  ): Promise<License> {
    const license = this.licenses.get(licenseId);

    if (!license) {
      throw new Error('License not found');
    }

    if (license.type === 'trial' || license.type === 'press') {
      throw new Error('This license type cannot be transferred');
    }

    const oldUserId = license.userId;
    license.userId = newUserId;

    // Deactivate all current activations
    for (const activation of license.activations) {
      activation.isActive = false;
      this.stopHeartbeat(activation.id);
    }

    this.emit('licenseTransferred', { license, oldUserId, newUserId });

    return license;
  }

  /**
   * Get license statistics
   */
  async getStats(): Promise<any> {
    const allLicenses = Array.from(this.licenses.values());
    const allActivations = Array.from(this.activations.values());

    return {
      totalLicenses: allLicenses.length,
      activeLicenses: allLicenses.filter(l => l.status === 'active').length,
      expiredLicenses: allLicenses.filter(l => l.status === 'expired').length,
      revokedLicenses: allLicenses.filter(l => l.status === 'revoked').length,
      totalActivations: allActivations.length,
      activeActivations: allActivations.filter(a => a.isActive).length,
      totalProductKeys: this.productKeys.size,
      redeemedKeys: Array.from(this.productKeys.values()).filter(k => k.isRedeemed).length,
      activeHeartbeats: this.heartbeats.size
    };
  }

  /**
   * Check if system is online
   */
  private isOnline(): boolean {
    // In production, check actual network connectivity
    return true;
  }
}
