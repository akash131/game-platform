/**
 * Developer Portal and API Key Management
 * Developer account management, app registration, API keys, quotas, and analytics
 * Vendor parity with Steamworks, Epic Dev Portal, Unity Dashboard
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export type DeveloperTier = 'individual' | 'indie' | 'studio' | 'enterprise';
export type AppStatus = 'draft' | 'review' | 'approved' | 'rejected' | 'published' | 'suspended';
export type APIKeyScope = 'read' | 'write' | 'admin' | 'analytics' | 'commerce' | 'matchmaking';

export interface DeveloperAccount {
  id: string;
  email: string;
  companyName: string;
  displayName: string;
  tier: DeveloperTier;
  verified: boolean;
  taxId?: string;
  payoutMethod?: string;
  apps: string[];
  apiKeys: APIKey[];
  quotas: DeveloperQuota;
  createdAt: Date;
  verifiedAt?: Date;
  metadata: Record<string, any>;
}

export interface Application {
  id: string;
  developerId: string;
  name: string;
  description: string;
  category: string;
  status: AppStatus;
  platforms: string[];
  ageRating: string;
  tags: string[];
  pricing: AppPricing;
  builds: string[];
  screenshots: string[];
  videos: string[];
  website?: string;
  supportEmail?: string;
  privacyPolicy?: string;
  termsOfService?: string;
  createdAt: Date;
  publishedAt?: Date;
  lastUpdated: Date;
  statistics: AppStatistics;
  reviewNotes?: string;
}

export interface AppPricing {
  basePrice: number;
  currency: string;
  regionalPricing: Record<string, number>;
  discounts: Discount[];
  freeToPlay: boolean;
}

export interface Discount {
  name: string;
  percentage: number;
  startDate: Date;
  endDate: Date;
  regions?: string[];
}

export interface AppStatistics {
  downloads: number;
  activeUsers: number;
  revenue: number;
  averageRating: number;
  totalReviews: number;
  crashRate: number;
  averageSessionTime: number;
}

export interface APIKey {
  id: string;
  developerId: string;
  name: string;
  key: string;
  secret: string;
  scopes: APIKeyScope[];
  appIds: string[];
  ipWhitelist?: string[];
  rateLimit: number; // Requests per minute
  isActive: boolean;
  createdAt: Date;
  lastUsed?: Date;
  expiresAt?: Date;
  usageCount: number;
}

export interface DeveloperQuota {
  maxApps: number;
  maxBuilds: number;
  maxBuildSize: number; // MB
  maxAPIKeys: number;
  maxAPIRequests: number; // Per day
  maxBandwidth: number; // GB per month
  maxStorageSize: number; // GB
  customDomain: boolean;
  prioritySupport: boolean;
}

export interface BuildUpload {
  id: string;
  appId: string;
  version: string;
  platform: string;
  buildNumber: number;
  size: number;
  uploadProgress: number;
  status: 'uploading' | 'processing' | 'testing' | 'ready' | 'failed';
  downloadUrl?: string;
  createdAt: Date;
  publishedAt?: Date;
  errors?: string[];
}

export interface PayoutInfo {
  developerId: string;
  totalEarnings: number;
  availableBalance: number;
  pendingBalance: number;
  currency: string;
  payoutHistory: Payout[];
  nextPayoutDate: Date;
}

export interface Payout {
  id: string;
  amount: number;
  currency: string;
  method: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  initiatedAt: Date;
  completedAt?: Date;
  transactionId?: string;
}

export interface AnalyticsDashboard {
  appId: string;
  period: 'day' | 'week' | 'month' | 'year';
  metrics: {
    users: UserMetrics;
    revenue: RevenueMetrics;
    engagement: EngagementMetrics;
    performance: PerformanceMetrics;
  };
}

export interface UserMetrics {
  totalUsers: number;
  newUsers: number;
  activeUsers: number;
  returningUsers: number;
  churnRate: number;
  retentionRate: number;
}

export interface RevenueMetrics {
  totalRevenue: number;
  transactionCount: number;
  averageRevenuePerUser: number;
  topSellingItems: string[];
  revenueByRegion: Record<string, number>;
}

export interface EngagementMetrics {
  averageSessionTime: number;
  sessionsPerUser: number;
  dailyActiveUsers: number;
  monthlyActiveUsers: number;
  featureUsage: Record<string, number>;
}

export interface PerformanceMetrics {
  crashCount: number;
  crashRate: number;
  errorRate: number;
  averageLoadTime: number;
  apiLatency: number;
}

export class DeveloperPortal extends EventEmitter {
  private developers: Map<string, DeveloperAccount> = new Map();
  private applications: Map<string, Application> = new Map();
  private apiKeys: Map<string, APIKey> = new Map();
  private builds: Map<string, BuildUpload> = new Map();
  private payouts: Map<string, PayoutInfo> = new Map();
  private tierQuotas: Map<DeveloperTier, DeveloperQuota>;

  constructor() {
    super();
    this.initializeTierQuotas();
  }

  /**
   * Initialize quota limits per tier
   */
  private initializeTierQuotas(): void {
    this.tierQuotas = new Map([
      [
        'individual',
        {
          maxApps: 3,
          maxBuilds: 10,
          maxBuildSize: 500,
          maxAPIKeys: 2,
          maxAPIRequests: 10000,
          maxBandwidth: 10,
          maxStorageSize: 5,
          customDomain: false,
          prioritySupport: false
        }
      ],
      [
        'indie',
        {
          maxApps: 10,
          maxBuilds: 50,
          maxBuildSize: 2000,
          maxAPIKeys: 5,
          maxAPIRequests: 100000,
          maxBandwidth: 100,
          maxStorageSize: 50,
          customDomain: true,
          prioritySupport: false
        }
      ],
      [
        'studio',
        {
          maxApps: 50,
          maxBuilds: 200,
          maxBuildSize: 5000,
          maxAPIKeys: 20,
          maxAPIRequests: 1000000,
          maxBandwidth: 500,
          maxStorageSize: 500,
          customDomain: true,
          prioritySupport: true
        }
      ],
      [
        'enterprise',
        {
          maxApps: 999,
          maxBuilds: 999,
          maxBuildSize: 10000,
          maxAPIKeys: 100,
          maxAPIRequests: 10000000,
          maxBandwidth: 5000,
          maxStorageSize: 5000,
          customDomain: true,
          prioritySupport: true
        }
      ]
    ]);
  }

  /**
   * Register developer account
   */
  async registerDeveloper(
    email: string,
    companyName: string,
    displayName: string,
    tier: DeveloperTier = 'individual'
  ): Promise<DeveloperAccount> {
    const id = `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const quotas = this.tierQuotas.get(tier)!;

    const developer: DeveloperAccount = {
      id,
      email,
      companyName,
      displayName,
      tier,
      verified: false,
      apps: [],
      apiKeys: [],
      quotas,
      createdAt: new Date(),
      metadata: {}
    };

    this.developers.set(id, developer);

    this.emit('developerRegistered', developer);

    return developer;
  }

  /**
   * Verify developer account
   */
  async verifyDeveloper(developerId: string): Promise<void> {
    const developer = this.developers.get(developerId);

    if (!developer) {
      throw new Error('Developer not found');
    }

    developer.verified = true;
    developer.verifiedAt = new Date();

    this.emit('developerVerified', developer);
  }

  /**
   * Upgrade developer tier
   */
  async upgradeTier(
    developerId: string,
    newTier: DeveloperTier
  ): Promise<DeveloperAccount> {
    const developer = this.developers.get(developerId);

    if (!developer) {
      throw new Error('Developer not found');
    }

    const oldTier = developer.tier;
    developer.tier = newTier;
    developer.quotas = this.tierQuotas.get(newTier)!;

    this.emit('tierUpgraded', { developer, oldTier, newTier });

    return developer;
  }

  /**
   * Create application
   */
  async createApplication(
    developerId: string,
    name: string,
    description: string,
    category: string
  ): Promise<Application> {
    const developer = this.developers.get(developerId);

    if (!developer) {
      throw new Error('Developer not found');
    }

    if (!developer.verified) {
      throw new Error('Developer account not verified');
    }

    if (developer.apps.length >= developer.quotas.maxApps) {
      throw new Error(`Maximum app limit (${developer.quotas.maxApps}) reached`);
    }

    const id = `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const app: Application = {
      id,
      developerId,
      name,
      description,
      category,
      status: 'draft',
      platforms: [],
      ageRating: 'E',
      tags: [],
      pricing: {
        basePrice: 0,
        currency: 'USD',
        regionalPricing: {},
        discounts: [],
        freeToPlay: true
      },
      builds: [],
      screenshots: [],
      videos: [],
      createdAt: new Date(),
      lastUpdated: new Date(),
      statistics: {
        downloads: 0,
        activeUsers: 0,
        revenue: 0,
        averageRating: 0,
        totalReviews: 0,
        crashRate: 0,
        averageSessionTime: 0
      }
    };

    this.applications.set(id, app);
    developer.apps.push(id);

    this.emit('appCreated', app);

    return app;
  }

  /**
   * Submit app for review
   */
  async submitForReview(appId: string): Promise<void> {
    const app = this.applications.get(appId);

    if (!app) {
      throw new Error('Application not found');
    }

    if (app.status !== 'draft') {
      throw new Error('Only draft apps can be submitted for review');
    }

    // Validate app has required content
    if (app.builds.length === 0) {
      throw new Error('App must have at least one build');
    }

    if (app.screenshots.length < 3) {
      throw new Error('App must have at least 3 screenshots');
    }

    app.status = 'review';
    app.lastUpdated = new Date();

    this.emit('appSubmittedForReview', app);
  }

  /**
   * Approve app
   */
  async approveApp(appId: string): Promise<void> {
    const app = this.applications.get(appId);

    if (!app) {
      throw new Error('Application not found');
    }

    app.status = 'approved';
    app.lastUpdated = new Date();

    this.emit('appApproved', app);
  }

  /**
   * Publish app
   */
  async publishApp(appId: string): Promise<void> {
    const app = this.applications.get(appId);

    if (!app) {
      throw new Error('Application not found');
    }

    if (app.status !== 'approved') {
      throw new Error('Only approved apps can be published');
    }

    app.status = 'published';
    app.publishedAt = new Date();
    app.lastUpdated = new Date();

    this.emit('appPublished', app);
  }

  /**
   * Generate API key
   */
  async generateAPIKey(
    developerId: string,
    name: string,
    scopes: APIKeyScope[],
    appIds: string[] = [],
    expiresIn?: number // days
  ): Promise<APIKey> {
    const developer = this.developers.get(developerId);

    if (!developer) {
      throw new Error('Developer not found');
    }

    if (developer.apiKeys.length >= developer.quotas.maxAPIKeys) {
      throw new Error(`Maximum API key limit (${developer.quotas.maxAPIKeys}) reached`);
    }

    const id = `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Generate secure key and secret
    const key = `pk_${crypto.randomBytes(16).toString('hex')}`;
    const secret = `sk_${crypto.randomBytes(32).toString('hex')}`;

    const apiKey: APIKey = {
      id,
      developerId,
      name,
      key,
      secret,
      scopes,
      appIds,
      rateLimit: 1000, // Default 1000 req/min
      isActive: true,
      createdAt: new Date(),
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000) : undefined,
      usageCount: 0
    };

    this.apiKeys.set(id, apiKey);
    developer.apiKeys.push(apiKey);

    this.emit('apiKeyGenerated', { developerId, apiKey });

    return apiKey;
  }

  /**
   * Validate API key
   */
  async validateAPIKey(
    key: string,
    requiredScope?: APIKeyScope
  ): Promise<{ valid: boolean; apiKey?: APIKey; error?: string }> {
    const apiKey = Array.from(this.apiKeys.values()).find(k => k.key === key);

    if (!apiKey) {
      return { valid: false, error: 'Invalid API key' };
    }

    if (!apiKey.isActive) {
      return { valid: false, error: 'API key is inactive' };
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return { valid: false, error: 'API key expired' };
    }

    if (requiredScope && !apiKey.scopes.includes(requiredScope)) {
      return { valid: false, error: `Missing required scope: ${requiredScope}` };
    }

    // Update usage
    apiKey.lastUsed = new Date();
    apiKey.usageCount++;

    return { valid: true, apiKey };
  }

  /**
   * Revoke API key
   */
  async revokeAPIKey(keyId: string): Promise<void> {
    const apiKey = this.apiKeys.get(keyId);

    if (!apiKey) {
      throw new Error('API key not found');
    }

    apiKey.isActive = false;

    this.emit('apiKeyRevoked', apiKey);
  }

  /**
   * Upload build
   */
  async uploadBuild(
    appId: string,
    version: string,
    platform: string,
    size: number
  ): Promise<BuildUpload> {
    const app = this.applications.get(appId);

    if (!app) {
      throw new Error('Application not found');
    }

    const developer = this.developers.get(app.developerId);

    if (!developer) {
      throw new Error('Developer not found');
    }

    if (app.builds.length >= developer.quotas.maxBuilds) {
      throw new Error(`Maximum build limit (${developer.quotas.maxBuilds}) reached`);
    }

    if (size > developer.quotas.maxBuildSize * 1024 * 1024) {
      throw new Error(`Build size exceeds limit (${developer.quotas.maxBuildSize} MB)`);
    }

    const id = `build_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const build: BuildUpload = {
      id,
      appId,
      version,
      platform,
      buildNumber: app.builds.length + 1,
      size,
      uploadProgress: 0,
      status: 'uploading',
      createdAt: new Date()
    };

    this.builds.set(id, build);
    app.builds.push(id);

    this.emit('buildUploadStarted', build);

    // Simulate upload progress
    this.simulateUpload(id);

    return build;
  }

  /**
   * Simulate build upload
   */
  private simulateUpload(buildId: string): void {
    const build = this.builds.get(buildId);

    if (!build) return;

    const interval = setInterval(() => {
      build.uploadProgress += 10;

      if (build.uploadProgress >= 100) {
        build.uploadProgress = 100;
        build.status = 'processing';
        clearInterval(interval);

        this.emit('buildUploadCompleted', build);

        // Simulate processing
        setTimeout(() => {
          build.status = 'ready';
          build.downloadUrl = `https://cdn.platform.com/builds/${build.id}`;
          build.publishedAt = new Date();

          this.emit('buildReady', build);
        }, 5000);
      }
    }, 1000);
  }

  /**
   * Get app analytics
   */
  async getAnalytics(
    appId: string,
    period: 'day' | 'week' | 'month' | 'year'
  ): Promise<AnalyticsDashboard> {
    const app = this.applications.get(appId);

    if (!app) {
      throw new Error('Application not found');
    }

    // Mock analytics data
    const dashboard: AnalyticsDashboard = {
      appId,
      period,
      metrics: {
        users: {
          totalUsers: app.statistics.downloads,
          newUsers: Math.floor(app.statistics.downloads * 0.1),
          activeUsers: app.statistics.activeUsers,
          returningUsers: Math.floor(app.statistics.activeUsers * 0.6),
          churnRate: 0.15,
          retentionRate: 0.85
        },
        revenue: {
          totalRevenue: app.statistics.revenue,
          transactionCount: Math.floor(app.statistics.revenue / 10),
          averageRevenuePerUser: app.statistics.activeUsers > 0
            ? app.statistics.revenue / app.statistics.activeUsers
            : 0,
          topSellingItems: [],
          revenueByRegion: {
            'US': app.statistics.revenue * 0.5,
            'EU': app.statistics.revenue * 0.3,
            'ASIA': app.statistics.revenue * 0.2
          }
        },
        engagement: {
          averageSessionTime: app.statistics.averageSessionTime,
          sessionsPerUser: 3.5,
          dailyActiveUsers: Math.floor(app.statistics.activeUsers * 0.3),
          monthlyActiveUsers: app.statistics.activeUsers,
          featureUsage: {}
        },
        performance: {
          crashCount: Math.floor(app.statistics.activeUsers * app.statistics.crashRate),
          crashRate: app.statistics.crashRate,
          errorRate: 0.02,
          averageLoadTime: 2.5,
          apiLatency: 150
        }
      }
    };

    return dashboard;
  }

  /**
   * Get payout information
   */
  async getPayoutInfo(developerId: string): Promise<PayoutInfo> {
    if (!this.payouts.has(developerId)) {
      // Create default payout info
      const payoutInfo: PayoutInfo = {
        developerId,
        totalEarnings: 0,
        availableBalance: 0,
        pendingBalance: 0,
        currency: 'USD',
        payoutHistory: [],
        nextPayoutDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };

      this.payouts.set(developerId, payoutInfo);
    }

    return this.payouts.get(developerId)!;
  }

  /**
   * Request payout
   */
  async requestPayout(
    developerId: string,
    amount: number,
    method: string
  ): Promise<Payout> {
    const payoutInfo = await this.getPayoutInfo(developerId);

    if (amount > payoutInfo.availableBalance) {
      throw new Error('Insufficient balance');
    }

    if (amount < 100) {
      throw new Error('Minimum payout amount is $100');
    }

    const payout: Payout = {
      id: `payout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      amount,
      currency: payoutInfo.currency,
      method,
      status: 'pending',
      initiatedAt: new Date()
    };

    payoutInfo.availableBalance -= amount;
    payoutInfo.pendingBalance += amount;
    payoutInfo.payoutHistory.push(payout);

    this.emit('payoutRequested', payout);

    // Simulate payout processing
    setTimeout(() => {
      payout.status = 'completed';
      payout.completedAt = new Date();
      payout.transactionId = `txn_${Date.now()}`;

      payoutInfo.pendingBalance -= amount;

      this.emit('payoutCompleted', payout);
    }, 5000);

    return payout;
  }

  /**
   * Get developer statistics
   */
  async getDeveloperStats(developerId: string): Promise<any> {
    const developer = this.developers.get(developerId);

    if (!developer) {
      throw new Error('Developer not found');
    }

    const apps = developer.apps.map(id => this.applications.get(id)!).filter(Boolean);

    const totalDownloads = apps.reduce((sum, app) => sum + app.statistics.downloads, 0);
    const totalRevenue = apps.reduce((sum, app) => sum + app.statistics.revenue, 0);
    const totalActiveUsers = apps.reduce((sum, app) => sum + app.statistics.activeUsers, 0);

    return {
      developerId,
      tier: developer.tier,
      totalApps: apps.length,
      publishedApps: apps.filter(a => a.status === 'published').length,
      totalDownloads,
      totalRevenue,
      totalActiveUsers,
      apiKeyCount: developer.apiKeys.length,
      quotaUsage: {
        apps: `${apps.length}/${developer.quotas.maxApps}`,
        apiKeys: `${developer.apiKeys.length}/${developer.quotas.maxAPIKeys}`
      }
    };
  }
}
