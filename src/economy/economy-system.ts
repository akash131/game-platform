import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

/**
 * Economy System
 * Virtual currency, store, and monetization
 * Similar to V-Bucks (Fortnite), Riot Points (League), COD Points
 */
export class EconomySystem extends EventEmitter {
  private wallets: Map<string, Wallet>;
  private transactions: Map<string, Transaction[]>; // playerId -> transactions
  private store: Map<string, StoreItem>;
  private inventory: Map<string, InventoryItem[]>; // playerId -> items
  private bundles: Map<string, Bundle>;

  constructor() {
    super();
    this.wallets = new Map();
    this.transactions = new Map();
    this.store = new Map();
    this.inventory = new Map();
    this.bundles = new Map();

    // Initialize store
    this.initializeStore();
  }

  /**
   * Create wallet for player
   */
  createWallet(playerId: string, initialCurrency: number = 0): Wallet {
    if (this.wallets.has(playerId)) {
      throw new Error('Wallet already exists for this player');
    }

    const wallet: Wallet = {
      playerId,
      softCurrency: initialCurrency, // Free currency (earned in-game)
      hardCurrency: 0, // Premium currency (purchased with real money)
      lastUpdated: Date.now(),
    };

    this.wallets.set(playerId, wallet);

    console.log(`💰 Wallet created for player`);
    this.emit('wallet:created', wallet);

    return wallet;
  }

  /**
   * Add soft currency (earned in-game)
   */
  addSoftCurrency(playerId: string, amount: number, reason: string): void {
    const wallet = this.getOrCreateWallet(playerId);

    wallet.softCurrency += amount;
    wallet.lastUpdated = Date.now();

    this.recordTransaction(playerId, {
      id: uuidv4(),
      type: 'earn',
      currencyType: 'soft',
      amount,
      reason,
      timestamp: Date.now(),
    });

    console.log(`💵 +${amount} soft currency (${reason})`);
    this.emit('currency:added', { playerId, amount, type: 'soft' });
  }

  /**
   * Add hard currency (purchased)
   */
  addHardCurrency(playerId: string, amount: number, purchaseId?: string): void {
    const wallet = this.getOrCreateWallet(playerId);

    wallet.hardCurrency += amount;
    wallet.lastUpdated = Date.now();

    this.recordTransaction(playerId, {
      id: uuidv4(),
      type: 'purchase',
      currencyType: 'hard',
      amount,
      reason: 'Real money purchase',
      purchaseId,
      timestamp: Date.now(),
    });

    console.log(`💎 +${amount} hard currency (purchase)`);
    this.emit('currency:purchased', { playerId, amount, purchaseId });
  }

  /**
   * Purchase item from store
   */
  purchaseItem(playerId: string, itemId: string, currencyType: 'soft' | 'hard'): void {
    const item = this.store.get(itemId);
    if (!item) {
      throw new Error('Item not found in store');
    }

    if (!item.available) {
      throw new Error('Item is not available');
    }

    const wallet = this.getOrCreateWallet(playerId);
    const price = currencyType === 'soft' ? item.softPrice : item.hardPrice;

    if (price === undefined) {
      throw new Error(`Item cannot be purchased with ${currencyType} currency`);
    }

    // Check balance
    const balance = currencyType === 'soft' ? wallet.softCurrency : wallet.hardCurrency;
    if (balance < price) {
      throw new Error('Insufficient funds');
    }

    // Deduct currency
    if (currencyType === 'soft') {
      wallet.softCurrency -= price;
    } else {
      wallet.hardCurrency -= price;
    }

    wallet.lastUpdated = Date.now();

    // Add item to inventory
    this.addToInventory(playerId, {
      id: uuidv4(),
      itemId: item.id,
      name: item.name,
      type: item.type,
      rarity: item.rarity,
      acquiredAt: Date.now(),
      metadata: item.metadata,
    });

    // Record transaction
    this.recordTransaction(playerId, {
      id: uuidv4(),
      type: 'spend',
      currencyType,
      amount: price,
      reason: `Purchased ${item.name}`,
      itemId: item.id,
      timestamp: Date.now(),
    });

    console.log(`🛒 Purchased: ${item.name} for ${price} ${currencyType} currency`);
    this.emit('item:purchased', { playerId, item, price, currencyType });
  }

  /**
   * Purchase bundle
   */
  purchaseBundle(playerId: string, bundleId: string, currencyType: 'soft' | 'hard'): void {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) {
      throw new Error('Bundle not found');
    }

    if (!bundle.available) {
      throw new Error('Bundle is not available');
    }

    const wallet = this.getOrCreateWallet(playerId);
    const price = currencyType === 'soft' ? bundle.softPrice : bundle.hardPrice;

    if (price === undefined) {
      throw new Error(`Bundle cannot be purchased with ${currencyType} currency`);
    }

    // Check balance
    const balance = currencyType === 'soft' ? wallet.softCurrency : wallet.hardCurrency;
    if (balance < price) {
      throw new Error('Insufficient funds');
    }

    // Deduct currency
    if (currencyType === 'soft') {
      wallet.softCurrency -= price;
    } else {
      wallet.hardCurrency -= price;
    }

    // Add all items from bundle
    for (const itemId of bundle.items) {
      const item = this.store.get(itemId);
      if (item) {
        this.addToInventory(playerId, {
          id: uuidv4(),
          itemId: item.id,
          name: item.name,
          type: item.type,
          rarity: item.rarity,
          acquiredAt: Date.now(),
          metadata: item.metadata,
        });
      }
    }

    // Record transaction
    this.recordTransaction(playerId, {
      id: uuidv4(),
      type: 'spend',
      currencyType,
      amount: price,
      reason: `Purchased bundle: ${bundle.name}`,
      bundleId: bundle.id,
      timestamp: Date.now(),
    });

    console.log(`📦 Purchased bundle: ${bundle.name}`);
    this.emit('bundle:purchased', { playerId, bundle, price, currencyType });
  }

  /**
   * Grant free item (reward, gift, etc.)
   */
  grantItem(playerId: string, itemId: string, reason: string): void {
    const item = this.store.get(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    this.addToInventory(playerId, {
      id: uuidv4(),
      itemId: item.id,
      name: item.name,
      type: item.type,
      rarity: item.rarity,
      acquiredAt: Date.now(),
      metadata: item.metadata,
    });

    console.log(`🎁 Granted item: ${item.name} (${reason})`);
    this.emit('item:granted', { playerId, item, reason });
  }

  /**
   * Get wallet
   */
  getWallet(playerId: string): Wallet | undefined {
    return this.wallets.get(playerId);
  }

  /**
   * Get inventory
   */
  getInventory(playerId: string): InventoryItem[] {
    return this.inventory.get(playerId) || [];
  }

  /**
   * Get transaction history
   */
  getTransactionHistory(playerId: string, limit: number = 100): Transaction[] {
    const transactions = this.transactions.get(playerId) || [];
    return transactions.slice(-limit);
  }

  /**
   * Get all store items
   */
  getStoreItems(): StoreItem[] {
    return Array.from(this.store.values()).filter(item => item.available);
  }

  /**
   * Get store items by type
   */
  getStoreItemsByType(type: string): StoreItem[] {
    return Array.from(this.store.values()).filter(
      item => item.type === type && item.available
    );
  }

  /**
   * Get all bundles
   */
  getBundles(): Bundle[] {
    return Array.from(this.bundles.values()).filter(bundle => bundle.available);
  }

  /**
   * Add item to store
   */
  addStoreItem(item: Omit<StoreItem, 'id'>): StoreItem {
    const storeItem: StoreItem = {
      id: uuidv4(),
      ...item,
    };

    this.store.set(storeItem.id, storeItem);

    console.log(`🏪 Added to store: ${storeItem.name}`);
    this.emit('store:item:added', storeItem);

    return storeItem;
  }

  /**
   * Create bundle
   */
  createBundle(bundle: Omit<Bundle, 'id'>): Bundle {
    const newBundle: Bundle = {
      id: uuidv4(),
      ...bundle,
    };

    this.bundles.set(newBundle.id, newBundle);

    console.log(`📦 Bundle created: ${newBundle.name}`);
    this.emit('store:bundle:created', newBundle);

    return newBundle;
  }

  /**
   * Get economy statistics
   */
  getStatistics(): EconomyStatistics {
    let totalSoftCurrency = 0;
    let totalHardCurrency = 0;
    let totalTransactions = 0;
    let totalItemsSold = 0;

    for (const wallet of this.wallets.values()) {
      totalSoftCurrency += wallet.softCurrency;
      totalHardCurrency += wallet.hardCurrency;
    }

    for (const transactions of this.transactions.values()) {
      totalTransactions += transactions.length;
      totalItemsSold += transactions.filter(t => t.type === 'spend').length;
    }

    return {
      totalPlayers: this.wallets.size,
      totalSoftCurrency,
      totalHardCurrency,
      totalTransactions,
      totalItemsSold,
      storeItems: this.store.size,
      bundles: this.bundles.size,
    };
  }

  private getOrCreateWallet(playerId: string): Wallet {
    let wallet = this.wallets.get(playerId);

    if (!wallet) {
      wallet = this.createWallet(playerId);
    }

    return wallet;
  }

  private addToInventory(playerId: string, item: InventoryItem): void {
    if (!this.inventory.has(playerId)) {
      this.inventory.set(playerId, []);
    }

    this.inventory.get(playerId)!.push(item);
  }

  private recordTransaction(playerId: string, transaction: Transaction): void {
    if (!this.transactions.has(playerId)) {
      this.transactions.set(playerId, []);
    }

    this.transactions.get(playerId)!.push(transaction);

    // Limit history to last 1000 transactions
    const history = this.transactions.get(playerId)!;
    if (history.length > 1000) {
      history.shift();
    }
  }

  private initializeStore(): void {
    // Cosmetic items
    this.addStoreItem({
      name: 'Epic Weapon Skin',
      description: 'Legendary weapon skin with particle effects',
      type: 'skin',
      rarity: 'epic',
      softPrice: 5000,
      hardPrice: 500,
      available: true,
      featured: true,
    });

    this.addStoreItem({
      name: 'Character Emote: Victory Dance',
      description: 'Show off your victory in style',
      type: 'emote',
      rarity: 'rare',
      softPrice: 2000,
      hardPrice: 200,
      available: true,
    });

    this.addStoreItem({
      name: 'Battle Pass',
      description: 'Season 1 Battle Pass with 100 tiers of rewards',
      type: 'battle_pass',
      rarity: 'legendary',
      hardPrice: 1000,
      available: true,
      featured: true,
    });

    this.addStoreItem({
      name: 'XP Boost',
      description: '50% XP boost for 24 hours',
      type: 'boost',
      rarity: 'common',
      softPrice: 1000,
      hardPrice: 100,
      available: true,
    });

    // Create starter bundle
    const starterItems = Array.from(this.store.values()).slice(0, 2).map(i => i.id);
    this.createBundle({
      name: 'Starter Pack',
      description: 'Everything you need to get started',
      items: starterItems,
      softPrice: 5000,
      hardPrice: 400,
      available: true,
      discount: 20,
    });
  }
}

export interface Wallet {
  playerId: string;
  softCurrency: number;
  hardCurrency: number;
  lastUpdated: number;
}

export interface StoreItem {
  id: string;
  name: string;
  description: string;
  type: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  softPrice?: number;
  hardPrice?: number;
  available: boolean;
  featured?: boolean;
  metadata?: Record<string, any>;
}

export interface Bundle {
  id: string;
  name: string;
  description: string;
  items: string[];
  softPrice?: number;
  hardPrice?: number;
  available: boolean;
  discount?: number;
}

export interface InventoryItem {
  id: string;
  itemId: string;
  name: string;
  type: string;
  rarity: string;
  acquiredAt: number;
  metadata?: Record<string, any>;
}

export interface Transaction {
  id: string;
  type: 'earn' | 'spend' | 'purchase' | 'grant';
  currencyType: 'soft' | 'hard';
  amount: number;
  reason: string;
  itemId?: string;
  bundleId?: string;
  purchaseId?: string;
  timestamp: number;
}

export interface EconomyStatistics {
  totalPlayers: number;
  totalSoftCurrency: number;
  totalHardCurrency: number;
  totalTransactions: number;
  totalItemsSold: number;
  storeItems: number;
  bundles: number;
}
