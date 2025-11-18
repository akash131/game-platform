import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

/**
 * CDN Service - Content Delivery Network for game assets
 * Similar to Cloudflare, AWS CloudFront, Akamai
 */

export interface CDNAsset {
  assetId: string;
  gameId: string;
  fileName: string;
  path: string;
  contentType: string;
  size: number; // bytes
  hash: string;
  version: string;
  tags: string[];
  uploaded: Date;
  lastAccessed?: Date;
  downloadCount: number;
  cdn URLs: CDNUrl[];
  cacheControl: CacheControl;
  compression: 'none' | 'gzip' | 'brotli';
  encrypted: boolean;
}

export interface CDNUrl {
  region: string;
  url: string;
  priority: number;
}

export interface CacheControl {
  maxAge: number; // seconds
  sMaxAge?: number; // seconds for CDN
  mustRevalidate: boolean;
  public: boolean;
}

export interface CDNNode {
  nodeId: string;
  region: string;
  location: string;
  status: 'online' | 'offline' | 'maintenance';
  capacity: number; // GB
  used: number; // GB
  bandwidth: number; // Mbps
  latency: Map<string, number>; // region -> latency ms
  assets: Set<string>; // cached assetIds
}

export interface DownloadRequest {
  assetId: string;
  region?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface UploadRequest {
  gameId: string;
  fileName: string;
  content: Buffer | string;
  contentType: string;
  version: string;
  tags?: string[];
  cacheMaxAge?: number;
  compression?: CDNAsset['compression'];
  encrypt?: boolean;
}

export interface AssetBundle {
  bundleId: string;
  name: string;
  gameId: string;
  assets: string[]; // assetIds
  size: number;
  version: string;
  manifest: AssetManifest;
  created: Date;
}

export interface AssetManifest {
  version: string;
  files: Array<{
    path: string;
    hash: string;
    size: number;
  }>;
  dependencies?: string[];
}

export interface CDNMetrics {
  nodeId: string;
  timestamp: Date;
  requests: number;
  bandwidth: number; // bytes
  cacheHitRate: number; // 0-100
  averageLatency: number; // ms
  errorRate: number; // 0-100
}

export interface CDNEvents {
  'assetUploaded': (asset: CDNAsset) => void;
  'assetDownloaded': (assetId: string, region: string) => void;
  'cachePurged': (assetId: string) => void;
  'nodeStatusChanged': (nodeId: string, status: CDNNode['status']) => void;
}

export class CDNService extends EventEmitter<CDNEvents> {
  private assets: Map<string, CDNAsset> = new Map();
  private nodes: Map<string, CDNNode> = new Map();
  private bundles: Map<string, AssetBundle> = new Map();
  private metrics: Map<string, CDNMetrics[]> = new Map(); // nodeId -> metrics
  private assetData: Map<string, Buffer> = new Map(); // assetId -> data

  constructor() {
    super();
  }

  // ==================== CDN Nodes ====================

  /**
   * Register CDN node
   */
  registerNode(
    region: string,
    location: string,
    capacity: number,
    bandwidth: number
  ): CDNNode {
    const node: CDNNode = {
      nodeId: uuidv4(),
      region,
      location,
      status: 'online',
      capacity,
      used: 0,
      bandwidth,
      latency: new Map(),
      assets: new Set(),
    };

    this.nodes.set(node.nodeId, node);
    return node;
  }

  /**
   * Update node status
   */
  updateNodeStatus(nodeId: string, status: CDNNode['status']): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.status = status;
      this.emit('nodeStatusChanged', nodeId, status);
    }
  }

  /**
   * Find best node for region
   */
  private findBestNode(region?: string): CDNNode | null {
    const availableNodes = Array.from(this.nodes.values())
      .filter(n => n.status === 'online');

    if (availableNodes.length === 0) return null;

    if (region) {
      // Prefer nodes in same region
      const sameRegion = availableNodes.filter(n => n.region === region);
      if (sameRegion.length > 0) {
        // Sort by available capacity
        sameRegion.sort((a, b) => {
          const availA = a.capacity - a.used;
          const availB = b.capacity - b.used;
          return availB - availA;
        });
        return sameRegion[0];
      }
    }

    // Sort by load
    availableNodes.sort((a, b) => {
      const loadA = a.used / a.capacity;
      const loadB = b.used / b.capacity;
      return loadA - loadB;
    });

    return availableNodes[0];
  }

  // ==================== Asset Management ====================

  /**
   * Upload asset
   */
  async uploadAsset(request: UploadRequest): Promise<CDNAsset> {
    const content = Buffer.isBuffer(request.content)
      ? request.content
      : Buffer.from(request.content);

    // Compress if requested
    let processedContent = content;
    if (request.compression && request.compression !== 'none') {
      // Would use zlib for actual compression
      console.log(`Compressing with ${request.compression}`);
    }

    // Encrypt if requested
    if (request.encrypt) {
      processedContent = this.encryptContent(processedContent);
    }

    const hash = this.calculateHash(processedContent);

    const asset: CDNAsset = {
      assetId: uuidv4(),
      gameId: request.gameId,
      fileName: request.fileName,
      path: `/${request.gameId}/${request.fileName}`,
      contentType: request.contentType,
      size: processedContent.length,
      hash,
      version: request.version,
      tags: request.tags || [],
      uploaded: new Date(),
      downloadCount: 0,
      cdnUrls: [],
      cacheControl: {
        maxAge: request.cacheMaxAge || 3600,
        sMaxAge: (request.cacheMaxAge || 3600) * 24,
        mustRevalidate: false,
        public: true,
      },
      compression: request.compression || 'none',
      encrypted: request.encrypt || false,
    };

    // Store asset data
    this.assetData.set(asset.assetId, processedContent);
    this.assets.set(asset.assetId, asset);

    // Distribute to CDN nodes
    await this.distributeAsset(asset, processedContent);

    this.emit('assetUploaded', asset);

    return asset;
  }

  /**
   * Distribute asset to CDN nodes
   */
  private async distributeAsset(asset: CDNAsset, content: Buffer): Promise<void> {
    const targetNodes = 3; // Replicate to 3 nodes
    const distributed: CDNNode[] = [];

    // Find best nodes
    for (let i = 0; i < targetNodes; i++) {
      const node = this.findBestNode();
      if (!node) break;

      // Check if node has capacity
      if (node.used + asset.size / (1024 * 1024 * 1024) <= node.capacity) {
        node.assets.add(asset.assetId);
        node.used += asset.size / (1024 * 1024 * 1024); // Convert to GB
        distributed.push(node);

        // Add CDN URL
        asset.cdnUrls.push({
          region: node.region,
          url: `https://cdn-${node.region}.gameplatform.com/${asset.path}`,
          priority: i + 1,
        });
      }
    }

    // Sort URLs by priority
    asset.cdnUrls.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Download asset
   */
  async downloadAsset(request: DownloadRequest): Promise<Buffer> {
    const asset = this.assets.get(request.assetId);
    if (!asset) {
      throw new Error('Asset not found');
    }

    // Find best node
    const node = this.findBestNode(request.region);
    if (!node) {
      throw new Error('No CDN nodes available');
    }

    // Check if node has asset cached
    if (!node.assets.has(request.assetId)) {
      // Cache miss - fetch from storage and cache
      await this.cacheAssetOnNode(request.assetId, node.nodeId);
    }

    // Get asset data
    const data = this.assetData.get(request.assetId);
    if (!data) {
      throw new Error('Asset data not found');
    }

    // Update stats
    asset.downloadCount++;
    asset.lastAccessed = new Date();

    this.emit('assetDownloaded', request.assetId, node.region);

    // Record metrics
    this.recordDownloadMetrics(node.nodeId, asset.size);

    // Return decrypted content if encrypted
    if (asset.encrypted) {
      return this.decryptContent(data);
    }

    return data;
  }

  /**
   * Cache asset on node
   */
  private async cacheAssetOnNode(assetId: string, nodeId: string): Promise<void> {
    const node = this.nodes.get(nodeId);
    const asset = this.assets.get(assetId);

    if (node && asset) {
      node.assets.add(assetId);
      node.used += asset.size / (1024 * 1024 * 1024);
    }
  }

  /**
   * Purge asset from cache
   */
  purgeAsset(assetId: string): void {
    const asset = this.assets.get(assetId);
    if (!asset) return;

    // Remove from all nodes
    for (const node of this.nodes.values()) {
      if (node.assets.has(assetId)) {
        node.assets.delete(assetId);
        node.used = Math.max(0, node.used - asset.size / (1024 * 1024 * 1024));
      }
    }

    this.emit('cachePurged', assetId);
  }

  /**
   * Delete asset
   */
  deleteAsset(assetId: string): void {
    this.purgeAsset(assetId);
    this.assets.delete(assetId);
    this.assetData.delete(assetId);
  }

  // ==================== Asset Bundles ====================

  /**
   * Create asset bundle
   */
  createBundle(
    name: string,
    gameId: string,
    assetIds: string[],
    version: string
  ): AssetBundle {
    let totalSize = 0;
    const files: AssetManifest['files'] = [];

    for (const assetId of assetIds) {
      const asset = this.assets.get(assetId);
      if (asset) {
        totalSize += asset.size;
        files.push({
          path: asset.path,
          hash: asset.hash,
          size: asset.size,
        });
      }
    }

    const bundle: AssetBundle = {
      bundleId: uuidv4(),
      name,
      gameId,
      assets: assetIds,
      size: totalSize,
      version,
      manifest: {
        version,
        files,
      },
      created: new Date(),
    };

    this.bundles.set(bundle.bundleId, bundle);
    return bundle;
  }

  /**
   * Get bundle
   */
  getBundle(bundleId: string): AssetBundle | undefined {
    return this.bundles.get(bundleId);
  }

  /**
   * Download bundle
   */
  async downloadBundle(bundleId: string, region?: string): Promise<Map<string, Buffer>> {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) {
      throw new Error('Bundle not found');
    }

    const files = new Map<string, Buffer>();

    for (const assetId of bundle.assets) {
      const data = await this.downloadAsset({ assetId, region });
      const asset = this.assets.get(assetId);
      if (asset) {
        files.set(asset.path, data);
      }
    }

    return files;
  }

  // ==================== Search & Discovery ====================

  /**
   * Get asset
   */
  getAsset(assetId: string): CDNAsset | undefined {
    return this.assets.get(assetId);
  }

  /**
   * List assets
   */
  listAssets(gameId?: string, tags?: string[]): CDNAsset[] {
    let assets = Array.from(this.assets.values());

    if (gameId) {
      assets = assets.filter(a => a.gameId === gameId);
    }

    if (tags && tags.length > 0) {
      assets = assets.filter(a =>
        tags.some(tag => a.tags.includes(tag))
      );
    }

    return assets;
  }

  // ==================== Metrics ====================

  /**
   * Record download metrics
   */
  private recordDownloadMetrics(nodeId: string, bytes: number): void {
    if (!this.metrics.has(nodeId)) {
      this.metrics.set(nodeId, []);
    }

    const nodeMetrics = this.metrics.get(nodeId)!;
    const lastMetric = nodeMetrics[nodeMetrics.length - 1];

    if (lastMetric && Date.now() - lastMetric.timestamp.getTime() < 60000) {
      // Update current minute
      lastMetric.requests++;
      lastMetric.bandwidth += bytes;
    } else {
      // New minute
      const metric: CDNMetrics = {
        nodeId,
        timestamp: new Date(),
        requests: 1,
        bandwidth: bytes,
        cacheHitRate: 100,
        averageLatency: 50,
        errorRate: 0,
      };

      nodeMetrics.push(metric);

      // Keep last 60 minutes
      if (nodeMetrics.length > 60) {
        nodeMetrics.shift();
      }
    }
  }

  /**
   * Get node metrics
   */
  getNodeMetrics(nodeId: string): CDNMetrics[] {
    return this.metrics.get(nodeId) || [];
  }

  // ==================== Utilities ====================

  /**
   * Calculate hash
   */
  private calculateHash(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Encrypt content
   */
  private encryptContent(data: Buffer): Buffer {
    // Simple XOR encryption for demo
    const key = Buffer.from('encryption-key');
    const encrypted = Buffer.alloc(data.length);

    for (let i = 0; i < data.length; i++) {
      encrypted[i] = data[i] ^ key[i % key.length];
    }

    return encrypted;
  }

  /**
   * Decrypt content
   */
  private decryptContent(data: Buffer): Buffer {
    // XOR is symmetric
    return this.encryptContent(data);
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalAssets: number;
    totalSize: number;
    totalNodes: number;
    onlineNodes: number;
    totalDownloads: number;
    averageCacheHitRate: number;
    totalBandwidth: number;
  } {
    let totalSize = 0;
    let totalDownloads = 0;

    for (const asset of this.assets.values()) {
      totalSize += asset.size;
      totalDownloads += asset.downloadCount;
    }

    const onlineNodes = Array.from(this.nodes.values())
      .filter(n => n.status === 'online').length;

    let totalCacheHits = 0;
    let totalBandwidth = 0;
    let metricsCount = 0;

    for (const nodeMetrics of this.metrics.values()) {
      for (const metric of nodeMetrics) {
        totalCacheHits += metric.cacheHitRate;
        totalBandwidth += metric.bandwidth;
        metricsCount++;
      }
    }

    const averageCacheHitRate = metricsCount > 0 ? totalCacheHits / metricsCount : 0;

    return {
      totalAssets: this.assets.size,
      totalSize,
      totalNodes: this.nodes.size,
      onlineNodes,
      totalDownloads,
      averageCacheHitRate,
      totalBandwidth,
    };
  }
}
