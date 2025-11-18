/**
 * Push Notification Service
 *
 * Firebase Cloud Messaging / Apple Push Notification Service-style notification system
 *
 * Features:
 * - Multi-channel notifications (push, in-app, email, SMS)
 * - Notification templates and personalization
 * - Scheduling and time zone support
 * - User preferences and opt-out management
 * - Campaign management and segmentation
 * - A/B testing for notifications
 * - Rich notifications with actions
 * - Notification analytics and tracking
 */

import { EventEmitter } from 'eventemitter3';

export enum NotificationChannel {
  PUSH = 'push',
  IN_APP = 'in_app',
  EMAIL = 'email',
  SMS = 'sms',
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum NotificationCategory {
  GAME_UPDATE = 'game_update',
  FRIEND_ACTIVITY = 'friend_activity',
  ACHIEVEMENT = 'achievement',
  TOURNAMENT = 'tournament',
  ECONOMY = 'economy',
  SOCIAL = 'social',
  PROMOTION = 'promotion',
  SYSTEM = 'system',
}

export interface DeviceToken {
  userId: string;
  deviceId: string;
  platform: 'ios' | 'android' | 'web' | 'desktop';
  token: string;
  registeredAt: Date;
  lastUsed: Date;
  isActive: boolean;
}

export interface NotificationTemplate {
  templateId: string;
  name: string;
  category: NotificationCategory;
  channels: NotificationChannel[];
  subject?: string; // For email
  title: string;
  body: string;
  imageUrl?: string;
  iconUrl?: string;
  actions?: NotificationAction[];
  data?: Record<string, any>;
  variables: string[]; // e.g., ['playerName', 'itemName']
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationAction {
  actionId: string;
  title: string;
  icon?: string;
  deepLink?: string; // Deep link URL
  openUrl?: string; // External URL
}

export interface Notification {
  notificationId: string;
  userId: string;
  templateId?: string;
  category: NotificationCategory;
  channel: NotificationChannel;
  priority: NotificationPriority;
  title: string;
  body: string;
  subject?: string;
  imageUrl?: string;
  iconUrl?: string;
  actions?: NotificationAction[];
  data?: Record<string, any>;
  deepLink?: string;
  scheduledFor?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  clickedAt?: Date;
  expiresAt?: Date;
  status: 'pending' | 'scheduled' | 'sent' | 'delivered' | 'read' | 'clicked' | 'failed' | 'expired';
  failureReason?: string;
  campaignId?: string;
}

export interface UserPreferences {
  userId: string;
  channels: {
    [key in NotificationChannel]: boolean;
  };
  categories: {
    [key in NotificationCategory]: {
      enabled: boolean;
      channels: NotificationChannel[];
    };
  };
  quietHours?: {
    start: string; // HH:MM format
    end: string;
    timezone: string;
  };
  frequency?: {
    maxPerDay: number;
    maxPerWeek: number;
  };
  updatedAt: Date;
}

export interface NotificationCampaign {
  campaignId: string;
  name: string;
  description: string;
  templateId: string;
  segmentId?: string;
  channels: NotificationChannel[];
  priority: NotificationPriority;
  scheduledFor?: Date;
  startDate?: Date;
  endDate?: Date;
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'completed' | 'cancelled';
  targeting: {
    userIds?: string[];
    segments?: string[];
    filters?: CampaignFilter[];
  };
  abTest?: {
    enabled: boolean;
    variants: CampaignVariant[];
    splitPercentage: number; // Percentage for variant A
  };
  stats: {
    totalSent: number;
    totalDelivered: number;
    totalRead: number;
    totalClicked: number;
    totalFailed: number;
    conversionRate: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignFilter {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'in' | 'not_in';
  value: any;
}

export interface CampaignVariant {
  variantId: string;
  name: string;
  templateId: string;
  percentage: number;
  stats: {
    sent: number;
    delivered: number;
    read: number;
    clicked: number;
    conversionRate: number;
  };
}

export interface UserSegment {
  segmentId: string;
  name: string;
  description: string;
  filters: CampaignFilter[];
  userCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationStats {
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalClicked: number;
  totalFailed: number;
  deliveryRate: number;
  readRate: number;
  clickRate: number;
  byChannel: {
    [key in NotificationChannel]: {
      sent: number;
      delivered: number;
      read: number;
      clicked: number;
    };
  };
  byCategory: {
    [key in NotificationCategory]: {
      sent: number;
      delivered: number;
      read: number;
      clicked: number;
    };
  };
  byCampaign: Map<string, {
    sent: number;
    delivered: number;
    read: number;
    clicked: number;
    conversionRate: number;
  }>;
}

interface NotificationEvents {
  'notification:sent': (notification: Notification) => void;
  'notification:delivered': (notification: Notification) => void;
  'notification:read': (notification: Notification) => void;
  'notification:clicked': (notification: Notification) => void;
  'notification:failed': (notification: Notification, error: Error) => void;
  'campaign:started': (campaign: NotificationCampaign) => void;
  'campaign:completed': (campaign: NotificationCampaign) => void;
  'device:registered': (device: DeviceToken) => void;
  'preferences:updated': (preferences: UserPreferences) => void;
}

/**
 * NotificationService
 *
 * Complete notification management system supporting multiple channels,
 * campaigns, scheduling, and comprehensive analytics
 */
export class NotificationService extends EventEmitter<NotificationEvents> {
  private notifications: Map<string, Notification> = new Map();
  private templates: Map<string, NotificationTemplate> = new Map();
  private devices: Map<string, DeviceToken[]> = new Map(); // userId -> devices
  private userPreferences: Map<string, UserPreferences> = new Map();
  private campaigns: Map<string, NotificationCampaign> = new Map();
  private segments: Map<string, UserSegment> = new Map();
  private notificationQueue: Notification[] = [];
  private stats: NotificationStats;

  constructor() {
    super();
    this.stats = this.initializeStats();
    this.startScheduler();
  }

  /**
   * Register device token for push notifications
   */
  registerDevice(
    userId: string,
    deviceId: string,
    platform: 'ios' | 'android' | 'web' | 'desktop',
    token: string
  ): DeviceToken {
    const device: DeviceToken = {
      userId,
      deviceId,
      platform,
      token,
      registeredAt: new Date(),
      lastUsed: new Date(),
      isActive: true,
    };

    const userDevices = this.devices.get(userId) || [];
    const existingIndex = userDevices.findIndex(d => d.deviceId === deviceId);

    if (existingIndex >= 0) {
      userDevices[existingIndex] = device;
    } else {
      userDevices.push(device);
    }

    this.devices.set(userId, userDevices);
    this.emit('device:registered', device);

    return device;
  }

  /**
   * Unregister device
   */
  unregisterDevice(userId: string, deviceId: string): void {
    const userDevices = this.devices.get(userId);
    if (!userDevices) return;

    const filtered = userDevices.filter(d => d.deviceId !== deviceId);
    this.devices.set(userId, filtered);
  }

  /**
   * Create notification template
   */
  createTemplate(
    name: string,
    category: NotificationCategory,
    channels: NotificationChannel[],
    title: string,
    body: string,
    options: {
      subject?: string;
      imageUrl?: string;
      iconUrl?: string;
      actions?: NotificationAction[];
      data?: Record<string, any>;
      variables?: string[];
    } = {}
  ): NotificationTemplate {
    const template: NotificationTemplate = {
      templateId: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      category,
      channels,
      title,
      body,
      subject: options.subject,
      imageUrl: options.imageUrl,
      iconUrl: options.iconUrl,
      actions: options.actions,
      data: options.data,
      variables: options.variables || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.templates.set(template.templateId, template);
    return template;
  }

  /**
   * Send notification
   */
  async sendNotification(
    userId: string,
    channel: NotificationChannel,
    title: string,
    body: string,
    options: {
      category?: NotificationCategory;
      priority?: NotificationPriority;
      subject?: string;
      imageUrl?: string;
      iconUrl?: string;
      actions?: NotificationAction[];
      data?: Record<string, any>;
      deepLink?: string;
      scheduledFor?: Date;
      expiresAt?: Date;
      templateId?: string;
      campaignId?: string;
    } = {}
  ): Promise<Notification> {
    // Check user preferences
    const preferences = this.getUserPreferences(userId);
    if (!this.canSendNotification(userId, channel, options.category || NotificationCategory.SYSTEM, preferences)) {
      throw new Error('User has opted out of this notification type');
    }

    const notification: Notification = {
      notificationId: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      templateId: options.templateId,
      category: options.category || NotificationCategory.SYSTEM,
      channel,
      priority: options.priority || NotificationPriority.NORMAL,
      title,
      body,
      subject: options.subject,
      imageUrl: options.imageUrl,
      iconUrl: options.iconUrl,
      actions: options.actions,
      data: options.data,
      deepLink: options.deepLink,
      scheduledFor: options.scheduledFor,
      expiresAt: options.expiresAt,
      status: options.scheduledFor ? 'scheduled' : 'pending',
      campaignId: options.campaignId,
    };

    this.notifications.set(notification.notificationId, notification);

    if (options.scheduledFor && options.scheduledFor > new Date()) {
      this.notificationQueue.push(notification);
      return notification;
    }

    await this.deliverNotification(notification);
    return notification;
  }

  /**
   * Send notification from template
   */
  async sendFromTemplate(
    userId: string,
    templateId: string,
    variables: Record<string, any> = {},
    options: {
      scheduledFor?: Date;
      campaignId?: string;
    } = {}
  ): Promise<Notification[]> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    const title = this.replaceVariables(template.title, variables);
    const body = this.replaceVariables(template.body, variables);
    const subject = template.subject ? this.replaceVariables(template.subject, variables) : undefined;

    const notifications: Notification[] = [];

    for (const channel of template.channels) {
      try {
        const notification = await this.sendNotification(
          userId,
          channel,
          title,
          body,
          {
            category: template.category,
            subject,
            imageUrl: template.imageUrl,
            iconUrl: template.iconUrl,
            actions: template.actions,
            data: { ...template.data, ...variables },
            templateId,
            scheduledFor: options.scheduledFor,
            campaignId: options.campaignId,
          }
        );
        notifications.push(notification);
      } catch (error) {
        console.error(`Failed to send notification via ${channel}:`, error);
      }
    }

    return notifications;
  }

  /**
   * Create and launch notification campaign
   */
  createCampaign(
    name: string,
    description: string,
    templateId: string,
    channels: NotificationChannel[],
    options: {
      segmentId?: string;
      priority?: NotificationPriority;
      scheduledFor?: Date;
      startDate?: Date;
      endDate?: Date;
      targeting?: {
        userIds?: string[];
        segments?: string[];
        filters?: CampaignFilter[];
      };
      abTest?: {
        enabled: boolean;
        variants: Omit<CampaignVariant, 'stats'>[];
        splitPercentage: number;
      };
    } = {}
  ): NotificationCampaign {
    const campaign: NotificationCampaign = {
      campaignId: `campaign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      templateId,
      segmentId: options.segmentId,
      channels,
      priority: options.priority || NotificationPriority.NORMAL,
      scheduledFor: options.scheduledFor,
      startDate: options.startDate,
      endDate: options.endDate,
      status: options.scheduledFor ? 'scheduled' : 'draft',
      targeting: options.targeting || {},
      abTest: options.abTest ? {
        enabled: options.abTest.enabled,
        variants: options.abTest.variants.map(v => ({
          ...v,
          stats: { sent: 0, delivered: 0, read: 0, clicked: 0, conversionRate: 0 },
        })),
        splitPercentage: options.abTest.splitPercentage,
      } : undefined,
      stats: {
        totalSent: 0,
        totalDelivered: 0,
        totalRead: 0,
        totalClicked: 0,
        totalFailed: 0,
        conversionRate: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.campaigns.set(campaign.campaignId, campaign);
    return campaign;
  }

  /**
   * Launch campaign
   */
  async launchCampaign(campaignId: string): Promise<void> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    campaign.status = 'active';
    campaign.updatedAt = new Date();
    this.emit('campaign:started', campaign);

    // Get target users
    const targetUsers = await this.getTargetUsers(campaign);

    // Send notifications to all target users
    for (const userId of targetUsers) {
      try {
        // A/B testing logic
        let templateId = campaign.templateId;
        if (campaign.abTest?.enabled && campaign.abTest.variants.length > 0) {
          const random = Math.random() * 100;
          if (random < campaign.abTest.splitPercentage) {
            templateId = campaign.abTest.variants[0].templateId;
          }
        }

        await this.sendFromTemplate(userId, templateId, {}, { campaignId });
        campaign.stats.totalSent++;
      } catch (error) {
        campaign.stats.totalFailed++;
        console.error(`Failed to send campaign notification to user ${userId}:`, error);
      }
    }

    campaign.status = 'completed';
    this.emit('campaign:completed', campaign);
  }

  /**
   * Create user segment
   */
  createSegment(
    name: string,
    description: string,
    filters: CampaignFilter[]
  ): UserSegment {
    const segment: UserSegment = {
      segmentId: `segment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      filters,
      userCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.segments.set(segment.segmentId, segment);
    return segment;
  }

  /**
   * Set user notification preferences
   */
  setUserPreferences(userId: string, preferences: Partial<UserPreferences>): UserPreferences {
    const existing = this.userPreferences.get(userId) || this.getDefaultPreferences(userId);

    const updated: UserPreferences = {
      ...existing,
      ...preferences,
      userId,
      updatedAt: new Date(),
    };

    this.userPreferences.set(userId, updated);
    this.emit('preferences:updated', updated);

    return updated;
  }

  /**
   * Get user preferences
   */
  getUserPreferences(userId: string): UserPreferences {
    return this.userPreferences.get(userId) || this.getDefaultPreferences(userId);
  }

  /**
   * Mark notification as read
   */
  markAsRead(notificationId: string): void {
    const notification = this.notifications.get(notificationId);
    if (!notification) return;

    notification.readAt = new Date();
    notification.status = 'read';

    this.updateStats('read', notification);
    this.emit('notification:read', notification);
  }

  /**
   * Mark notification as clicked
   */
  markAsClicked(notificationId: string): void {
    const notification = this.notifications.get(notificationId);
    if (!notification) return;

    notification.clickedAt = new Date();
    notification.status = 'clicked';

    this.updateStats('clicked', notification);
    this.emit('notification:clicked', notification);
  }

  /**
   * Get user notifications
   */
  getUserNotifications(
    userId: string,
    options: {
      channel?: NotificationChannel;
      category?: NotificationCategory;
      unreadOnly?: boolean;
      limit?: number;
    } = {}
  ): Notification[] {
    let notifications = Array.from(this.notifications.values())
      .filter(n => n.userId === userId);

    if (options.channel) {
      notifications = notifications.filter(n => n.channel === options.channel);
    }

    if (options.category) {
      notifications = notifications.filter(n => n.category === options.category);
    }

    if (options.unreadOnly) {
      notifications = notifications.filter(n => !n.readAt);
    }

    notifications.sort((a, b) => {
      const aTime = a.sentAt?.getTime() || 0;
      const bTime = b.sentAt?.getTime() || 0;
      return bTime - aTime;
    });

    if (options.limit) {
      notifications = notifications.slice(0, options.limit);
    }

    return notifications;
  }

  /**
   * Get notification statistics
   */
  getStats(timeRange?: { start: Date; end: Date }): NotificationStats {
    if (!timeRange) {
      return this.stats;
    }

    // Calculate stats for specific time range
    const notifications = Array.from(this.notifications.values())
      .filter(n => {
        if (!n.sentAt) return false;
        return n.sentAt >= timeRange.start && n.sentAt <= timeRange.end;
      });

    return this.calculateStats(notifications);
  }

  /**
   * Get campaign stats
   */
  getCampaignStats(campaignId: string): NotificationCampaign['stats'] | null {
    const campaign = this.campaigns.get(campaignId);
    return campaign ? campaign.stats : null;
  }

  // Private helper methods

  private async deliverNotification(notification: Notification): Promise<void> {
    try {
      // Simulate notification delivery based on channel
      switch (notification.channel) {
        case NotificationChannel.PUSH:
          await this.sendPushNotification(notification);
          break;
        case NotificationChannel.IN_APP:
          await this.sendInAppNotification(notification);
          break;
        case NotificationChannel.EMAIL:
          await this.sendEmailNotification(notification);
          break;
        case NotificationChannel.SMS:
          await this.sendSMSNotification(notification);
          break;
      }

      notification.sentAt = new Date();
      notification.deliveredAt = new Date();
      notification.status = 'delivered';

      this.updateStats('sent', notification);
      this.updateStats('delivered', notification);

      this.emit('notification:sent', notification);
      this.emit('notification:delivered', notification);
    } catch (error) {
      notification.status = 'failed';
      notification.failureReason = (error as Error).message;
      this.updateStats('failed', notification);
      this.emit('notification:failed', notification, error as Error);
    }
  }

  private async sendPushNotification(notification: Notification): Promise<void> {
    const devices = this.devices.get(notification.userId) || [];
    const activeDevices = devices.filter(d => d.isActive);

    if (activeDevices.length === 0) {
      throw new Error('No active devices found for user');
    }

    // Simulate push notification delivery
    // In real implementation, this would call FCM, APNS, etc.
    for (const device of activeDevices) {
      device.lastUsed = new Date();
    }
  }

  private async sendInAppNotification(notification: Notification): Promise<void> {
    // In-app notifications are stored and displayed when user opens the app
    // No external service needed
  }

  private async sendEmailNotification(notification: Notification): Promise<void> {
    // Simulate email delivery
    // In real implementation, this would call SendGrid, AWS SES, etc.
  }

  private async sendSMSNotification(notification: Notification): Promise<void> {
    // Simulate SMS delivery
    // In real implementation, this would call Twilio, AWS SNS, etc.
  }

  private canSendNotification(
    userId: string,
    channel: NotificationChannel,
    category: NotificationCategory,
    preferences: UserPreferences
  ): boolean {
    // Check if channel is enabled
    if (!preferences.channels[channel]) {
      return false;
    }

    // Check if category is enabled for this channel
    const categoryPref = preferences.categories[category];
    if (!categoryPref.enabled || !categoryPref.channels.includes(channel)) {
      return false;
    }

    // Check quiet hours
    if (preferences.quietHours) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      if (currentTime >= preferences.quietHours.start && currentTime <= preferences.quietHours.end) {
        return false;
      }
    }

    // Check frequency limits
    if (preferences.frequency) {
      const userNotifications = this.getUserNotifications(userId);
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const dailyCount = userNotifications.filter(n => n.sentAt && n.sentAt >= oneDayAgo).length;
      const weeklyCount = userNotifications.filter(n => n.sentAt && n.sentAt >= oneWeekAgo).length;

      if (dailyCount >= preferences.frequency.maxPerDay || weeklyCount >= preferences.frequency.maxPerWeek) {
        return false;
      }
    }

    return true;
  }

  private replaceVariables(template: string, variables: Record<string, any>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }
    return result;
  }

  private async getTargetUsers(campaign: NotificationCampaign): Promise<string[]> {
    let users: string[] = [];

    if (campaign.targeting.userIds) {
      users = campaign.targeting.userIds;
    } else if (campaign.segmentId) {
      const segment = this.segments.get(campaign.segmentId);
      if (segment) {
        // In real implementation, evaluate segment filters against user database
        users = []; // Placeholder
      }
    }

    return users;
  }

  private getDefaultPreferences(userId: string): UserPreferences {
    return {
      userId,
      channels: {
        [NotificationChannel.PUSH]: true,
        [NotificationChannel.IN_APP]: true,
        [NotificationChannel.EMAIL]: true,
        [NotificationChannel.SMS]: false,
      },
      categories: {
        [NotificationCategory.GAME_UPDATE]: { enabled: true, channels: [NotificationChannel.PUSH, NotificationChannel.EMAIL] },
        [NotificationCategory.FRIEND_ACTIVITY]: { enabled: true, channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP] },
        [NotificationCategory.ACHIEVEMENT]: { enabled: true, channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP] },
        [NotificationCategory.TOURNAMENT]: { enabled: true, channels: [NotificationChannel.PUSH, NotificationChannel.EMAIL] },
        [NotificationCategory.ECONOMY]: { enabled: true, channels: [NotificationChannel.IN_APP] },
        [NotificationCategory.SOCIAL]: { enabled: true, channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP] },
        [NotificationCategory.PROMOTION]: { enabled: true, channels: [NotificationChannel.PUSH, NotificationChannel.EMAIL] },
        [NotificationCategory.SYSTEM]: { enabled: true, channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP, NotificationChannel.EMAIL] },
      },
      updatedAt: new Date(),
    };
  }

  private initializeStats(): NotificationStats {
    return {
      totalSent: 0,
      totalDelivered: 0,
      totalRead: 0,
      totalClicked: 0,
      totalFailed: 0,
      deliveryRate: 0,
      readRate: 0,
      clickRate: 0,
      byChannel: {
        [NotificationChannel.PUSH]: { sent: 0, delivered: 0, read: 0, clicked: 0 },
        [NotificationChannel.IN_APP]: { sent: 0, delivered: 0, read: 0, clicked: 0 },
        [NotificationChannel.EMAIL]: { sent: 0, delivered: 0, read: 0, clicked: 0 },
        [NotificationChannel.SMS]: { sent: 0, delivered: 0, read: 0, clicked: 0 },
      },
      byCategory: {
        [NotificationCategory.GAME_UPDATE]: { sent: 0, delivered: 0, read: 0, clicked: 0 },
        [NotificationCategory.FRIEND_ACTIVITY]: { sent: 0, delivered: 0, read: 0, clicked: 0 },
        [NotificationCategory.ACHIEVEMENT]: { sent: 0, delivered: 0, read: 0, clicked: 0 },
        [NotificationCategory.TOURNAMENT]: { sent: 0, delivered: 0, read: 0, clicked: 0 },
        [NotificationCategory.ECONOMY]: { sent: 0, delivered: 0, read: 0, clicked: 0 },
        [NotificationCategory.SOCIAL]: { sent: 0, delivered: 0, read: 0, clicked: 0 },
        [NotificationCategory.PROMOTION]: { sent: 0, delivered: 0, read: 0, clicked: 0 },
        [NotificationCategory.SYSTEM]: { sent: 0, delivered: 0, read: 0, clicked: 0 },
      },
      byCampaign: new Map(),
    };
  }

  private updateStats(type: 'sent' | 'delivered' | 'read' | 'clicked' | 'failed', notification: Notification): void {
    if (type === 'sent') this.stats.totalSent++;
    if (type === 'delivered') this.stats.totalDelivered++;
    if (type === 'read') this.stats.totalRead++;
    if (type === 'clicked') this.stats.totalClicked++;
    if (type === 'failed') this.stats.totalFailed++;

    // Update channel stats
    if (type !== 'failed') {
      this.stats.byChannel[notification.channel][type]++;
    }

    // Update category stats
    if (type !== 'failed') {
      this.stats.byCategory[notification.category][type]++;
    }

    // Update campaign stats
    if (notification.campaignId && type !== 'failed') {
      const campaign = this.campaigns.get(notification.campaignId);
      if (campaign) {
        if (type === 'sent') campaign.stats.totalSent++;
        if (type === 'delivered') campaign.stats.totalDelivered++;
        if (type === 'read') campaign.stats.totalRead++;
        if (type === 'clicked') campaign.stats.totalClicked++;

        campaign.stats.conversionRate = campaign.stats.totalSent > 0
          ? (campaign.stats.totalClicked / campaign.stats.totalSent) * 100
          : 0;
      }

      if (!this.stats.byCampaign.has(notification.campaignId)) {
        this.stats.byCampaign.set(notification.campaignId, {
          sent: 0,
          delivered: 0,
          read: 0,
          clicked: 0,
          conversionRate: 0,
        });
      }

      const campaignStats = this.stats.byCampaign.get(notification.campaignId)!;
      if (type === 'sent') campaignStats.sent++;
      if (type === 'delivered') campaignStats.delivered++;
      if (type === 'read') campaignStats.read++;
      if (type === 'clicked') campaignStats.clicked++;

      campaignStats.conversionRate = campaignStats.sent > 0
        ? (campaignStats.clicked / campaignStats.sent) * 100
        : 0;
    }

    // Update rates
    this.stats.deliveryRate = this.stats.totalSent > 0
      ? (this.stats.totalDelivered / this.stats.totalSent) * 100
      : 0;

    this.stats.readRate = this.stats.totalDelivered > 0
      ? (this.stats.totalRead / this.stats.totalDelivered) * 100
      : 0;

    this.stats.clickRate = this.stats.totalDelivered > 0
      ? (this.stats.totalClicked / this.stats.totalDelivered) * 100
      : 0;
  }

  private calculateStats(notifications: Notification[]): NotificationStats {
    const stats = this.initializeStats();

    for (const notification of notifications) {
      if (notification.status === 'sent' || notification.status === 'delivered' || notification.status === 'read' || notification.status === 'clicked') {
        stats.totalSent++;
        stats.byChannel[notification.channel].sent++;
        stats.byCategory[notification.category].sent++;
      }

      if (notification.status === 'delivered' || notification.status === 'read' || notification.status === 'clicked') {
        stats.totalDelivered++;
        stats.byChannel[notification.channel].delivered++;
        stats.byCategory[notification.category].delivered++;
      }

      if (notification.status === 'read' || notification.status === 'clicked') {
        stats.totalRead++;
        stats.byChannel[notification.channel].read++;
        stats.byCategory[notification.category].read++;
      }

      if (notification.status === 'clicked') {
        stats.totalClicked++;
        stats.byChannel[notification.channel].clicked++;
        stats.byCategory[notification.category].clicked++;
      }

      if (notification.status === 'failed') {
        stats.totalFailed++;
      }
    }

    stats.deliveryRate = stats.totalSent > 0 ? (stats.totalDelivered / stats.totalSent) * 100 : 0;
    stats.readRate = stats.totalDelivered > 0 ? (stats.totalRead / stats.totalDelivered) * 100 : 0;
    stats.clickRate = stats.totalDelivered > 0 ? (stats.totalClicked / stats.totalDelivered) * 100 : 0;

    return stats;
  }

  private startScheduler(): void {
    // Check for scheduled notifications every minute
    setInterval(() => {
      const now = new Date();
      const toSend = this.notificationQueue.filter(n =>
        n.scheduledFor && n.scheduledFor <= now
      );

      for (const notification of toSend) {
        this.deliverNotification(notification);
        this.notificationQueue = this.notificationQueue.filter(n => n.notificationId !== notification.notificationId);
      }

      // Clean up expired notifications
      for (const notification of this.notifications.values()) {
        if (notification.expiresAt && notification.expiresAt <= now && notification.status !== 'expired') {
          notification.status = 'expired';
        }
      }
    }, 60000); // Check every minute
  }
}
