import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

/**
 * Workshop / UGC System - User-Generated Content platform like Steam Workshop
 * Enables players to create, share, and download mods, maps, skins, and other content
 */

export interface WorkshopItem {
  itemId: string;
  gameId: string;
  creatorId: string;
  creatorName: string;
  title: string;
  description: string;
  type: 'mod' | 'map' | 'skin' | 'model' | 'sound' | 'script' | 'collection' | 'other';
  tags: string[];
  version: string;
  fileSize: number; // bytes
  downloadUrl?: string;
  thumbnailUrl?: string;
  screenshotUrls: string[];
  videoUrl?: string;
  status: 'draft' | 'published' | 'under_review' | 'rejected' | 'removed';
  visibility: 'public' | 'friends_only' | 'private' | 'unlisted';
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  stats: WorkshopStats;
  metadata: WorkshopMetadata;
  compatibility: CompatibilityInfo;
  dependencies: string[]; // Other itemIds required
  changeNotes?: string;
}

export interface WorkshopStats {
  downloads: number;
  subscribers: number;
  favorites: number;
  views: number;
  rating: number; // 0-5
  totalRatings: number;
  comments: number;
  reports: number;
}

export interface WorkshopMetadata {
  fileHash: string;
  virusScanStatus: 'pending' | 'clean' | 'infected' | 'error';
  contentRating: 'everyone' | 'teen' | 'mature' | 'adult';
  languages: string[];
  requiredDLC?: string[];
  installSize: number;
  customData?: Record<string, any>;
}

export interface CompatibilityInfo {
  gameVersion: string;
  minGameVersion: string;
  maxGameVersion?: string;
  platforms: Array<'windows' | 'mac' | 'linux' | 'console'>;
  conflicts: string[]; // Conflicting mod IDs
}

export interface WorkshopSubscription {
  subscriptionId: string;
  userId: string;
  itemId: string;
  subscribedAt: Date;
  autoUpdate: boolean;
  installStatus: 'not_installed' | 'downloading' | 'installed' | 'update_available' | 'error';
  installedVersion?: string;
  installPath?: string;
  lastUpdated?: Date;
}

export interface WorkshopCollection {
  collectionId: string;
  creatorId: string;
  title: string;
  description: string;
  items: string[]; // itemIds
  thumbnailUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  stats: {
    subscribers: number;
    views: number;
  };
}

export interface WorkshopRating {
  ratingId: string;
  itemId: string;
  userId: string;
  rating: number; // 1-5
  review?: string;
  helpful: number;
  unhelpful: number;
  createdAt: Date;
  updatedAt?: Date;
}

export interface WorkshopComment {
  commentId: string;
  itemId: string;
  userId: string;
  userName: string;
  content: string;
  parentCommentId?: string; // For replies
  createdAt: Date;
  updatedAt?: Date;
  likes: number;
  edited: boolean;
}

export interface WorkshopReport {
  reportId: string;
  itemId: string;
  reporterId: string;
  reason: 'copyright' | 'inappropriate' | 'broken' | 'malware' | 'spam' | 'other';
  description: string;
  status: 'pending' | 'investigating' | 'resolved' | 'dismissed';
  createdAt: Date;
  resolvedAt?: Date;
}

export interface UploadRequest {
  gameId: string;
  creatorId: string;
  title: string;
  description: string;
  type: WorkshopItem['type'];
  tags: string[];
  version: string;
  file: Buffer | string;
  thumbnailUrl?: string;
  visibility?: WorkshopItem['visibility'];
  changeNotes?: string;
}

export interface SearchFilters {
  gameId?: string;
  type?: WorkshopItem['type'];
  tags?: string[];
  creatorId?: string;
  sortBy?: 'recent' | 'popular' | 'top_rated' | 'most_subscribed';
  timeRange?: 'day' | 'week' | 'month' | 'year' | 'all_time';
  searchTerm?: string;
}

export interface WorkshopEvents {
  'itemPublished': (item: WorkshopItem) => void;
  'itemUpdated': (item: WorkshopItem) => void;
  'itemRemoved': (itemId: string) => void;
  'subscriptionAdded': (subscription: WorkshopSubscription) => void;
  'subscriptionRemoved': (subscriptionId: string) => void;
  'downloadComplete': (itemId: string, userId: string) => void;
  'reportSubmitted': (report: WorkshopReport) => void;
}

export class WorkshopService extends EventEmitter<WorkshopEvents> {
  private items: Map<string, WorkshopItem> = new Map();
  private subscriptions: Map<string, WorkshopSubscription> = new Map(); // subscriptionId -> subscription
  private userSubscriptions: Map<string, Set<string>> = new Map(); // userId -> subscriptionIds
  private collections: Map<string, WorkshopCollection> = new Map();
  private ratings: Map<string, WorkshopRating[]> = new Map(); // itemId -> ratings
  private comments: Map<string, WorkshopComment[]> = new Map(); // itemId -> comments
  private reports: Map<string, WorkshopReport> = new Map();

  constructor() {
    super();
  }

  // ==================== Item Management ====================

  /**
   * Upload workshop item
   */
  async uploadItem(request: UploadRequest): Promise<WorkshopItem> {
    const fileSize = Buffer.isBuffer(request.file)
      ? request.file.length
      : Buffer.byteLength(request.file);

    const fileHash = this.calculateHash(request.file);

    const item: WorkshopItem = {
      itemId: uuidv4(),
      gameId: request.gameId,
      creatorId: request.creatorId,
      creatorName: `Creator ${request.creatorId.substring(0, 8)}`, // Would get from user service
      title: request.title,
      description: request.description,
      type: request.type,
      tags: request.tags,
      version: request.version,
      fileSize,
      thumbnailUrl: request.thumbnailUrl,
      screenshotUrls: [],
      status: 'draft',
      visibility: request.visibility || 'private',
      createdAt: new Date(),
      updatedAt: new Date(),
      changeNotes: request.changeNotes,
      stats: {
        downloads: 0,
        subscribers: 0,
        favorites: 0,
        views: 0,
        rating: 0,
        totalRatings: 0,
        comments: 0,
        reports: 0,
      },
      metadata: {
        fileHash,
        virusScanStatus: 'pending',
        contentRating: 'everyone',
        languages: ['en'],
        installSize: fileSize,
      },
      compatibility: {
        gameVersion: '1.0.0',
        minGameVersion: '1.0.0',
        platforms: ['windows', 'mac', 'linux'],
        conflicts: [],
      },
      dependencies: [],
    };

    this.items.set(item.itemId, item);

    // Simulate virus scan
    setTimeout(() => {
      item.metadata.virusScanStatus = 'clean';
    }, 2000);

    return item;
  }

  /**
   * Publish item
   */
  publishItem(itemId: string): void {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    if (item.metadata.virusScanStatus !== 'clean') {
      throw new Error('Item must pass virus scan before publishing');
    }

    item.status = 'published';
    item.publishedAt = new Date();
    item.visibility = 'public';

    this.emit('itemPublished', item);
  }

  /**
   * Update item
   */
  async updateItem(
    itemId: string,
    updates: Partial<Pick<WorkshopItem, 'title' | 'description' | 'tags' | 'visibility' | 'changeNotes'>>
  ): Promise<WorkshopItem> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    Object.assign(item, updates);
    item.updatedAt = new Date();

    this.emit('itemUpdated', item);
    return item;
  }

  /**
   * Update item file (new version)
   */
  async updateItemFile(itemId: string, file: Buffer | string, version: string, changeNotes?: string): Promise<void> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    const fileSize = Buffer.isBuffer(file) ? file.length : Buffer.byteLength(file);
    const fileHash = this.calculateHash(file);

    item.version = version;
    item.fileSize = fileSize;
    item.metadata.fileHash = fileHash;
    item.metadata.virusScanStatus = 'pending';
    item.changeNotes = changeNotes;
    item.updatedAt = new Date();

    // Notify subscribers of update
    this.notifySubscribersOfUpdate(itemId);

    // Virus scan
    setTimeout(() => {
      item.metadata.virusScanStatus = 'clean';
    }, 2000);
  }

  /**
   * Delete item
   */
  deleteItem(itemId: string, creatorId: string): void {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    if (item.creatorId !== creatorId) {
      throw new Error('Only creator can delete item');
    }

    item.status = 'removed';
    this.items.delete(itemId);

    // Remove all subscriptions
    for (const [subId, sub] of this.subscriptions) {
      if (sub.itemId === itemId) {
        this.subscriptions.delete(subId);
      }
    }

    this.emit('itemRemoved', itemId);
  }

  /**
   * Get item
   */
  getItem(itemId: string): WorkshopItem | undefined {
    const item = this.items.get(itemId);

    // Increment view count
    if (item) {
      item.stats.views++;
    }

    return item;
  }

  // ==================== Subscriptions ====================

  /**
   * Subscribe to item
   */
  subscribeToItem(userId: string, itemId: string, autoUpdate: boolean = true): WorkshopSubscription {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    const subscription: WorkshopSubscription = {
      subscriptionId: uuidv4(),
      userId,
      itemId,
      subscribedAt: new Date(),
      autoUpdate,
      installStatus: 'not_installed',
    };

    this.subscriptions.set(subscription.subscriptionId, subscription);

    if (!this.userSubscriptions.has(userId)) {
      this.userSubscriptions.set(userId, new Set());
    }
    this.userSubscriptions.get(userId)!.add(subscription.subscriptionId);

    // Update item stats
    item.stats.subscribers++;

    this.emit('subscriptionAdded', subscription);

    return subscription;
  }

  /**
   * Unsubscribe from item
   */
  unsubscribeFromItem(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const item = this.items.get(subscription.itemId);
    if (item) {
      item.stats.subscribers = Math.max(0, item.stats.subscribers - 1);
    }

    this.userSubscriptions.get(subscription.userId)?.delete(subscriptionId);
    this.subscriptions.delete(subscriptionId);

    this.emit('subscriptionRemoved', subscriptionId);
  }

  /**
   * Get user subscriptions
   */
  getUserSubscriptions(userId: string): WorkshopSubscription[] {
    const subIds = this.userSubscriptions.get(userId);
    if (!subIds) return [];

    const subscriptions: WorkshopSubscription[] = [];

    for (const subId of subIds) {
      const sub = this.subscriptions.get(subId);
      if (sub) {
        subscriptions.push(sub);
      }
    }

    return subscriptions;
  }

  /**
   * Download item
   */
  async downloadItem(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const item = this.items.get(subscription.itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    subscription.installStatus = 'downloading';

    // Simulate download
    setTimeout(() => {
      subscription.installStatus = 'installed';
      subscription.installedVersion = item.version;
      subscription.lastUpdated = new Date();
      subscription.installPath = `/mods/${item.itemId}`;

      // Update stats
      item.stats.downloads++;

      this.emit('downloadComplete', item.itemId, subscription.userId);
    }, 3000);
  }

  /**
   * Notify subscribers of update
   */
  private notifySubscribersOfUpdate(itemId: string): void {
    for (const subscription of this.subscriptions.values()) {
      if (subscription.itemId === itemId && subscription.installStatus === 'installed') {
        subscription.installStatus = 'update_available';
      }
    }
  }

  // ==================== Collections ====================

  /**
   * Create collection
   */
  createCollection(
    creatorId: string,
    title: string,
    description: string,
    items: string[]
  ): WorkshopCollection {
    const collection: WorkshopCollection = {
      collectionId: uuidv4(),
      creatorId,
      title,
      description,
      items,
      createdAt: new Date(),
      updatedAt: new Date(),
      stats: {
        subscribers: 0,
        views: 0,
      },
    };

    this.collections.set(collection.collectionId, collection);
    return collection;
  }

  /**
   * Add item to collection
   */
  addToCollection(collectionId: string, itemId: string): void {
    const collection = this.collections.get(collectionId);
    if (!collection) {
      throw new Error('Collection not found');
    }

    if (!collection.items.includes(itemId)) {
      collection.items.push(itemId);
      collection.updatedAt = new Date();
    }
  }

  /**
   * Get collection
   */
  getCollection(collectionId: string): WorkshopCollection | undefined {
    const collection = this.collections.get(collectionId);

    if (collection) {
      collection.stats.views++;
    }

    return collection;
  }

  // ==================== Ratings & Reviews ====================

  /**
   * Rate item
   */
  rateItem(itemId: string, userId: string, rating: number, review?: string): WorkshopRating {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    let itemRatings = this.ratings.get(itemId);
    if (!itemRatings) {
      itemRatings = [];
      this.ratings.set(itemId, itemRatings);
    }

    // Check for existing rating
    const existingIndex = itemRatings.findIndex(r => r.userId === userId);

    const ratingObj: WorkshopRating = {
      ratingId: existingIndex >= 0 ? itemRatings[existingIndex].ratingId : uuidv4(),
      itemId,
      userId,
      rating,
      review,
      helpful: 0,
      unhelpful: 0,
      createdAt: existingIndex >= 0 ? itemRatings[existingIndex].createdAt : new Date(),
      updatedAt: existingIndex >= 0 ? new Date() : undefined,
    };

    if (existingIndex >= 0) {
      itemRatings[existingIndex] = ratingObj;
    } else {
      itemRatings.push(ratingObj);
    }

    // Recalculate item rating
    this.recalculateRating(item);

    return ratingObj;
  }

  /**
   * Recalculate item rating
   */
  private recalculateRating(item: WorkshopItem): void {
    const ratings = this.ratings.get(item.itemId);
    if (!ratings || ratings.length === 0) {
      item.stats.rating = 0;
      item.stats.totalRatings = 0;
      return;
    }

    const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
    item.stats.rating = totalRating / ratings.length;
    item.stats.totalRatings = ratings.length;
  }

  /**
   * Get item ratings
   */
  getItemRatings(itemId: string): WorkshopRating[] {
    return this.ratings.get(itemId) || [];
  }

  // ==================== Comments ====================

  /**
   * Add comment
   */
  addComment(itemId: string, userId: string, userName: string, content: string, parentCommentId?: string): WorkshopComment {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    let itemComments = this.comments.get(itemId);
    if (!itemComments) {
      itemComments = [];
      this.comments.set(itemId, itemComments);
    }

    const comment: WorkshopComment = {
      commentId: uuidv4(),
      itemId,
      userId,
      userName,
      content,
      parentCommentId,
      createdAt: new Date(),
      likes: 0,
      edited: false,
    };

    itemComments.push(comment);
    item.stats.comments++;

    return comment;
  }

  /**
   * Get comments
   */
  getComments(itemId: string): WorkshopComment[] {
    return this.comments.get(itemId) || [];
  }

  // ==================== Reports ====================

  /**
   * Report item
   */
  reportItem(itemId: string, reporterId: string, reason: WorkshopReport['reason'], description: string): WorkshopReport {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    const report: WorkshopReport = {
      reportId: uuidv4(),
      itemId,
      reporterId,
      reason,
      description,
      status: 'pending',
      createdAt: new Date(),
    };

    this.reports.set(report.reportId, report);
    item.stats.reports++;

    this.emit('reportSubmitted', report);

    return report;
  }

  /**
   * Get item reports
   */
  getItemReports(itemId: string): WorkshopReport[] {
    return Array.from(this.reports.values())
      .filter(r => r.itemId === itemId);
  }

  // ==================== Search & Discovery ====================

  /**
   * Search items
   */
  searchItems(filters: SearchFilters, limit: number = 50): WorkshopItem[] {
    let results = Array.from(this.items.values())
      .filter(item => item.status === 'published');

    // Apply filters
    if (filters.gameId) {
      results = results.filter(item => item.gameId === filters.gameId);
    }

    if (filters.type) {
      results = results.filter(item => item.type === filters.type);
    }

    if (filters.tags && filters.tags.length > 0) {
      results = results.filter(item =>
        filters.tags!.some(tag => item.tags.includes(tag))
      );
    }

    if (filters.creatorId) {
      results = results.filter(item => item.creatorId === filters.creatorId);
    }

    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      results = results.filter(item =>
        item.title.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        item.tags.some(tag => tag.toLowerCase().includes(term))
      );
    }

    // Apply time range
    if (filters.timeRange && filters.timeRange !== 'all_time') {
      const now = Date.now();
      const ranges: Record<string, number> = {
        day: 86400000,
        week: 604800000,
        month: 2592000000,
        year: 31536000000,
      };

      const range = ranges[filters.timeRange];
      if (range) {
        results = results.filter(item =>
          item.publishedAt && (now - item.publishedAt.getTime()) < range
        );
      }
    }

    // Sort
    switch (filters.sortBy || 'recent') {
      case 'recent':
        results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        break;
      case 'popular':
        results.sort((a, b) => b.stats.views - a.stats.views);
        break;
      case 'top_rated':
        results.sort((a, b) => b.stats.rating - a.stats.rating);
        break;
      case 'most_subscribed':
        results.sort((a, b) => b.stats.subscribers - a.stats.subscribers);
        break;
    }

    return results.slice(0, limit);
  }

  /**
   * Get featured items
   */
  getFeaturedItems(gameId?: string, limit: number = 10): WorkshopItem[] {
    let items = Array.from(this.items.values())
      .filter(item => item.status === 'published');

    if (gameId) {
      items = items.filter(item => item.gameId === gameId);
    }

    // Featured = high rating + high subscribers
    items.sort((a, b) => {
      const scoreA = a.stats.rating * a.stats.subscribers;
      const scoreB = b.stats.rating * b.stats.subscribers;
      return scoreB - scoreA;
    });

    return items.slice(0, limit);
  }

  // ==================== Utilities ====================

  /**
   * Calculate file hash
   */
  private calculateHash(data: Buffer | string): string {
    const hash = crypto.createHash('sha256');
    hash.update(Buffer.isBuffer(data) ? data : Buffer.from(data));
    return hash.digest('hex');
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalItems: number;
    publishedItems: number;
    totalDownloads: number;
    totalSubscriptions: number;
    averageRating: number;
    totalCollections: number;
    pendingReports: number;
  } {
    let totalDownloads = 0;
    let totalRatings = 0;
    let ratingSum = 0;

    for (const item of this.items.values()) {
      totalDownloads += item.stats.downloads;
      totalRatings += item.stats.totalRatings;
      ratingSum += item.stats.rating * item.stats.totalRatings;
    }

    const averageRating = totalRatings > 0 ? ratingSum / totalRatings : 0;

    const publishedItems = Array.from(this.items.values())
      .filter(i => i.status === 'published').length;

    const pendingReports = Array.from(this.reports.values())
      .filter(r => r.status === 'pending').length;

    return {
      totalItems: this.items.size,
      publishedItems,
      totalDownloads,
      totalSubscriptions: this.subscriptions.size,
      averageRating,
      totalCollections: this.collections.size,
      pendingReports,
    };
  }
}
