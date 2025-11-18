/**
 * Player-to-Player Trading System
 *
 * Steam Trading / Rocket League / Path of Exile-style trading platform
 *
 * Features:
 * - Direct player-to-player trades
 * - Trade offers and negotiations
 * - Item verification and escrow
 * - Trade history and receipts
 * - Security measures (trade holds, confirmations)
 * - Market listings and auctions
 * - Price suggestions and market trends
 * - Trade-up contracts
 * - Gift system
 * - Scam protection and fraud detection
 */

import { EventEmitter } from 'eventemitter3';

export enum TradeStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
  DISPUTED = 'disputed',
}

export enum ItemRarity {
  COMMON = 'common',
  UNCOMMON = 'uncommon',
  RARE = 'rare',
  EPIC = 'epic',
  LEGENDARY = 'legendary',
  MYTHIC = 'mythic',
}

export enum TradeableItemType {
  WEAPON = 'weapon',
  ARMOR = 'armor',
  CONSUMABLE = 'consumable',
  COSMETIC = 'cosmetic',
  CURRENCY = 'currency',
  MATERIAL = 'material',
  COLLECTIBLE = 'collectible',
  BLUEPRINT = 'blueprint',
}

export interface TradeableItem {
  itemId: string;
  name: string;
  type: TradeableItemType;
  rarity: ItemRarity;
  description: string;
  imageUrl?: string;
  level?: number;
  stats?: Record<string, number>;
  isTradeable: boolean;
  isMarketable: boolean;
  tradeHoldUntil?: Date;
  acquiredAt: Date;
  metadata?: Record<string, any>;
}

export interface PlayerInventory {
  userId: string;
  items: Map<string, TradeableItem>;
  currency: Map<string, number>;
  updatedAt: Date;
}

export interface TradeOffer {
  tradeId: string;
  senderId: string;
  receiverId: string;
  status: TradeStatus;

  // Items being traded
  senderItems: string[]; // itemIds
  receiverItems: string[];
  senderCurrency: Map<string, number>;
  receiverCurrency: Map<string, number>;

  // Security
  requiresConfirmation: boolean;
  senderConfirmed: boolean;
  receiverConfirmed: boolean;
  escrowHoldDays?: number;
  escrowReleaseDate?: Date;

  // Message
  message?: string;

  // Timestamps
  createdAt: Date;
  expiresAt: Date;
  completedAt?: Date;
  cancelledAt?: Date;
}

export interface TradeHistory {
  tradeId: string;
  player1Id: string;
  player2Id: string;
  player1Items: TradeableItem[];
  player2Items: TradeableItem[];
  player1Currency: Map<string, number>;
  player2Currency: Map<string, number>;
  completedAt: Date;
  receiptId: string;
}

export interface MarketListing {
  listingId: string;
  sellerId: string;
  itemId: string;
  item: TradeableItem;
  price: {
    currency: string;
    amount: number;
  };
  quantity: number;
  status: 'active' | 'sold' | 'cancelled' | 'expired';
  createdAt: Date;
  expiresAt: Date;
  soldAt?: Date;
  buyerId?: string;
}

export interface Auction {
  auctionId: string;
  sellerId: string;
  itemId: string;
  item: TradeableItem;
  startingBid: number;
  currentBid: number;
  buyoutPrice?: number;
  currency: string;
  bids: AuctionBid[];
  status: 'active' | 'sold' | 'cancelled' | 'expired';
  startTime: Date;
  endTime: Date;
  winnerId?: string;
}

export interface AuctionBid {
  bidId: string;
  bidderId: string;
  amount: number;
  timestamp: Date;
  isAutoBid: boolean;
}

export interface PriceSuggestion {
  itemId: string;
  itemName: string;
  currency: string;
  averagePrice: number;
  medianPrice: number;
  lowestPrice: number;
  highestPrice: number;
  volume24h: number;
  priceChange24h: number;
  priceChange7d: number;
  lastUpdated: Date;
  priceHistory: PricePoint[];
}

export interface PricePoint {
  timestamp: Date;
  price: number;
  volume: number;
}

export interface TradeUpContract {
  contractId: string;
  userId: string;
  inputItems: TradeableItem[];
  requiredRarity: ItemRarity;
  requiredCount: number;
  possibleOutputs: TradeableItem[];
  outputItem?: TradeableItem;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: Date;
  completedAt?: Date;
}

export interface Gift {
  giftId: string;
  senderId: string;
  receiverId: string;
  items: TradeableItem[];
  currency: Map<string, number>;
  message?: string;
  isAnonymous: boolean;
  status: 'pending' | 'accepted' | 'declined';
  sentAt: Date;
  acceptedAt?: Date;
}

export interface TradeRestriction {
  userId: string;
  reason: 'suspicious_activity' | 'scam_report' | 'chargeback' | 'violation';
  restrictedUntil: Date;
  isPermanent: boolean;
  createdAt: Date;
}

export interface FraudAlert {
  alertId: string;
  tradeId: string;
  userId: string;
  type: 'price_manipulation' | 'duplicate_item' | 'stolen_item' | 'suspicious_pattern';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  timestamp: Date;
  resolved: boolean;
}

interface TradingEvents {
  'trade:offered': (trade: TradeOffer) => void;
  'trade:accepted': (trade: TradeOffer) => void;
  'trade:declined': (trade: TradeOffer) => void;
  'trade:completed': (trade: TradeOffer) => void;
  'trade:cancelled': (trade: TradeOffer) => void;
  'listing:created': (listing: MarketListing) => void;
  'listing:sold': (listing: MarketListing) => void;
  'auction:created': (auction: Auction) => void;
  'auction:bid': (auction: Auction, bid: AuctionBid) => void;
  'auction:ended': (auction: Auction) => void;
  'gift:sent': (gift: Gift) => void;
  'gift:received': (gift: Gift) => void;
  'fraud:detected': (alert: FraudAlert) => void;
  'restriction:applied': (restriction: TradeRestriction) => void;
}

/**
 * TradingSystem
 *
 * Comprehensive player-to-player trading and marketplace system
 */
export class TradingSystem extends EventEmitter<TradingEvents> {
  private inventories: Map<string, PlayerInventory> = new Map();
  private trades: Map<string, TradeOffer> = new Map();
  private tradeHistory: Map<string, TradeHistory[]> = new Map(); // userId -> history
  private listings: Map<string, MarketListing> = new Map();
  private auctions: Map<string, Auction> = new Map();
  private priceSuggestions: Map<string, PriceSuggestion> = new Map();
  private tradeUpContracts: Map<string, TradeUpContract> = new Map();
  private gifts: Map<string, Gift> = new Map();
  private restrictions: Map<string, TradeRestriction> = new Map();
  private fraudAlerts: Map<string, FraudAlert[]> = new Map();

  constructor() {
    super();
    this.startMaintenanceTasks();
  }

  /**
   * Create trade offer
   */
  createTradeOffer(
    senderId: string,
    receiverId: string,
    senderItems: string[],
    receiverItems: string[],
    options?: {
      senderCurrency?: Map<string, number>;
      receiverCurrency?: Map<string, number>;
      message?: string;
      expiresIn?: number; // milliseconds
      requiresConfirmation?: boolean;
      escrowHoldDays?: number;
    }
  ): TradeOffer {
    // Check for trade restrictions
    this.checkTradeRestrictions(senderId);
    this.checkTradeRestrictions(receiverId);

    // Verify items are tradeable and owned
    this.verifyItemsForTrade(senderId, senderItems);
    this.verifyItemsForTrade(receiverId, receiverItems);

    const trade: TradeOffer = {
      tradeId: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      senderId,
      receiverId,
      status: TradeStatus.PENDING,
      senderItems,
      receiverItems,
      senderCurrency: options?.senderCurrency || new Map(),
      receiverCurrency: options?.receiverCurrency || new Map(),
      requiresConfirmation: options?.requiresConfirmation ?? true,
      senderConfirmed: false,
      receiverConfirmed: false,
      escrowHoldDays: options?.escrowHoldDays,
      message: options?.message,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + (options?.expiresIn || 7 * 24 * 60 * 60 * 1000)),
    };

    if (trade.escrowHoldDays) {
      trade.escrowReleaseDate = new Date(Date.now() + trade.escrowHoldDays * 24 * 60 * 60 * 1000);
    }

    this.trades.set(trade.tradeId, trade);
    this.emit('trade:offered', trade);

    // Check for fraud
    this.checkForFraud(trade);

    return trade;
  }

  /**
   * Accept trade offer
   */
  acceptTradeOffer(tradeId: string, userId: string): TradeOffer {
    const trade = this.trades.get(tradeId);
    if (!trade) throw new Error('Trade not found');

    if (trade.status !== TradeStatus.PENDING) {
      throw new Error('Trade is not pending');
    }

    if (trade.expiresAt < new Date()) {
      trade.status = TradeStatus.EXPIRED;
      throw new Error('Trade has expired');
    }

    if (userId !== trade.receiverId) {
      throw new Error('Only the receiver can accept this trade');
    }

    trade.receiverConfirmed = true;
    trade.status = TradeStatus.ACCEPTED;

    this.emit('trade:accepted', trade);

    // If no confirmation required, complete immediately
    if (!trade.requiresConfirmation || trade.senderConfirmed) {
      this.completeTrade(tradeId);
    }

    return trade;
  }

  /**
   * Confirm trade
   */
  confirmTrade(tradeId: string, userId: string): void {
    const trade = this.trades.get(tradeId);
    if (!trade) throw new Error('Trade not found');

    if (userId === trade.senderId) {
      trade.senderConfirmed = true;
    } else if (userId === trade.receiverId) {
      trade.receiverConfirmed = true;
    } else {
      throw new Error('User is not part of this trade');
    }

    // Complete if both confirmed
    if (trade.senderConfirmed && trade.receiverConfirmed && trade.status === TradeStatus.ACCEPTED) {
      this.completeTrade(tradeId);
    }
  }

  /**
   * Decline trade offer
   */
  declineTradeOffer(tradeId: string, userId: string): void {
    const trade = this.trades.get(tradeId);
    if (!trade) throw new Error('Trade not found');

    if (userId !== trade.receiverId) {
      throw new Error('Only the receiver can decline this trade');
    }

    trade.status = TradeStatus.DECLINED;
    this.emit('trade:declined', trade);
  }

  /**
   * Cancel trade offer
   */
  cancelTradeOffer(tradeId: string, userId: string): void {
    const trade = this.trades.get(tradeId);
    if (!trade) throw new Error('Trade not found');

    if (userId !== trade.senderId) {
      throw new Error('Only the sender can cancel this trade');
    }

    if (trade.status !== TradeStatus.PENDING) {
      throw new Error('Trade cannot be cancelled');
    }

    trade.status = TradeStatus.CANCELLED;
    trade.cancelledAt = new Date();
    this.emit('trade:cancelled', trade);
  }

  /**
   * Create market listing
   */
  createListing(
    sellerId: string,
    itemId: string,
    price: number,
    currency: string,
    options?: {
      quantity?: number;
      expiresIn?: number;
    }
  ): MarketListing {
    this.checkTradeRestrictions(sellerId);

    const inventory = this.getInventory(sellerId);
    const item = inventory.items.get(itemId);

    if (!item) throw new Error('Item not found in inventory');
    if (!item.isMarketable) throw new Error('Item is not marketable');

    const listing: MarketListing = {
      listingId: `listing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sellerId,
      itemId,
      item,
      price: { currency, amount: price },
      quantity: options?.quantity || 1,
      status: 'active',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + (options?.expiresIn || 30 * 24 * 60 * 60 * 1000)),
    };

    this.listings.set(listing.listingId, listing);
    this.emit('listing:created', listing);

    // Update price suggestions
    this.updatePriceSuggestion(item.name, currency, price);

    return listing;
  }

  /**
   * Buy listing
   */
  buyListing(listingId: string, buyerId: string): void {
    const listing = this.listings.get(listingId);
    if (!listing) throw new Error('Listing not found');

    if (listing.status !== 'active') {
      throw new Error('Listing is not active');
    }

    if (listing.sellerId === buyerId) {
      throw new Error('Cannot buy your own listing');
    }

    this.checkTradeRestrictions(buyerId);

    const buyerInventory = this.getInventory(buyerId);
    const buyerCurrency = buyerInventory.currency.get(listing.price.currency) || 0;

    if (buyerCurrency < listing.price.amount) {
      throw new Error('Insufficient funds');
    }

    // Transfer currency
    buyerInventory.currency.set(listing.price.currency, buyerCurrency - listing.price.amount);

    const sellerInventory = this.getInventory(listing.sellerId);
    const sellerCurrency = sellerInventory.currency.get(listing.price.currency) || 0;
    sellerInventory.currency.set(listing.price.currency, sellerCurrency + listing.price.amount);

    // Transfer item
    sellerInventory.items.delete(listing.itemId);
    buyerInventory.items.set(listing.itemId, listing.item);

    listing.status = 'sold';
    listing.soldAt = new Date();
    listing.buyerId = buyerId;

    buyerInventory.updatedAt = new Date();
    sellerInventory.updatedAt = new Date();

    this.emit('listing:sold', listing);

    // Update price suggestions
    this.updatePriceSuggestion(listing.item.name, listing.price.currency, listing.price.amount);

    // Record in trade history
    this.recordTradeHistory({
      tradeId: `market_${Date.now()}`,
      player1Id: listing.sellerId,
      player2Id: buyerId,
      player1Items: [],
      player2Items: [listing.item],
      player1Currency: new Map([[listing.price.currency, listing.price.amount]]),
      player2Currency: new Map(),
      completedAt: new Date(),
      receiptId: `receipt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });
  }

  /**
   * Create auction
   */
  createAuction(
    sellerId: string,
    itemId: string,
    startingBid: number,
    currency: string,
    duration: number,
    options?: {
      buyoutPrice?: number;
    }
  ): Auction {
    this.checkTradeRestrictions(sellerId);

    const inventory = this.getInventory(sellerId);
    const item = inventory.items.get(itemId);

    if (!item) throw new Error('Item not found in inventory');
    if (!item.isMarketable) throw new Error('Item is not marketable');

    const auction: Auction = {
      auctionId: `auction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sellerId,
      itemId,
      item,
      startingBid,
      currentBid: startingBid,
      buyoutPrice: options?.buyoutPrice,
      currency,
      bids: [],
      status: 'active',
      startTime: new Date(),
      endTime: new Date(Date.now() + duration),
    };

    this.auctions.set(auction.auctionId, auction);
    this.emit('auction:created', auction);

    return auction;
  }

  /**
   * Place bid on auction
   */
  placeBid(auctionId: string, bidderId: string, amount: number, isAutoBid: boolean = false): void {
    const auction = this.auctions.get(auctionId);
    if (!auction) throw new Error('Auction not found');

    if (auction.status !== 'active') {
      throw new Error('Auction is not active');
    }

    if (auction.endTime < new Date()) {
      this.endAuction(auctionId);
      throw new Error('Auction has ended');
    }

    if (auction.sellerId === bidderId) {
      throw new Error('Cannot bid on your own auction');
    }

    if (amount <= auction.currentBid) {
      throw new Error('Bid must be higher than current bid');
    }

    this.checkTradeRestrictions(bidderId);

    const bid: AuctionBid = {
      bidId: `bid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      bidderId,
      amount,
      timestamp: new Date(),
      isAutoBid,
    };

    auction.bids.push(bid);
    auction.currentBid = amount;

    this.emit('auction:bid', auction, bid);

    // Check for buyout
    if (auction.buyoutPrice && amount >= auction.buyoutPrice) {
      this.endAuction(auctionId, bidderId);
    }
  }

  /**
   * Create trade-up contract
   */
  createTradeUpContract(
    userId: string,
    inputItemIds: string[],
    requiredRarity: ItemRarity,
    requiredCount: number
  ): TradeUpContract {
    const inventory = this.getInventory(userId);
    const inputItems: TradeableItem[] = [];

    for (const itemId of inputItemIds) {
      const item = inventory.items.get(itemId);
      if (!item) throw new Error(`Item ${itemId} not found`);
      if (item.rarity !== requiredRarity) {
        throw new Error(`All items must be ${requiredRarity} rarity`);
      }
      inputItems.push(item);
    }

    if (inputItems.length !== requiredCount) {
      throw new Error(`Must provide exactly ${requiredCount} items`);
    }

    const contract: TradeUpContract = {
      contractId: `contract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      inputItems,
      requiredRarity,
      requiredCount,
      possibleOutputs: this.getPossibleTradeUpOutputs(requiredRarity),
      status: 'pending',
      createdAt: new Date(),
    };

    this.tradeUpContracts.set(contract.contractId, contract);
    return contract;
  }

  /**
   * Execute trade-up contract
   */
  executeTradeUpContract(contractId: string): TradeableItem {
    const contract = this.tradeUpContracts.get(contractId);
    if (!contract) throw new Error('Contract not found');

    if (contract.status !== 'pending') {
      throw new Error('Contract already executed');
    }

    const inventory = this.getInventory(contract.userId);

    // Remove input items
    for (const item of contract.inputItems) {
      inventory.items.delete(item.itemId);
    }

    // Select random output
    const outputItem = contract.possibleOutputs[
      Math.floor(Math.random() * contract.possibleOutputs.length)
    ];

    // Add output item
    inventory.items.set(outputItem.itemId, outputItem);

    contract.outputItem = outputItem;
    contract.status = 'completed';
    contract.completedAt = new Date();

    inventory.updatedAt = new Date();

    return outputItem;
  }

  /**
   * Send gift
   */
  sendGift(
    senderId: string,
    receiverId: string,
    itemIds: string[],
    options?: {
      currency?: Map<string, number>;
      message?: string;
      isAnonymous?: boolean;
    }
  ): Gift {
    const inventory = this.getInventory(senderId);
    const items: TradeableItem[] = [];

    for (const itemId of itemIds) {
      const item = inventory.items.get(itemId);
      if (!item) throw new Error(`Item ${itemId} not found`);
      if (!item.isTradeable) throw new Error(`Item ${item.name} is not tradeable`);
      items.push(item);
    }

    const gift: Gift = {
      giftId: `gift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      senderId,
      receiverId,
      items,
      currency: options?.currency || new Map(),
      message: options?.message,
      isAnonymous: options?.isAnonymous || false,
      status: 'pending',
      sentAt: new Date(),
    };

    this.gifts.set(gift.giftId, gift);
    this.emit('gift:sent', gift);

    // Auto-accept gifts (in real implementation, receiver would need to accept)
    this.acceptGift(gift.giftId);

    return gift;
  }

  /**
   * Accept gift
   */
  acceptGift(giftId: string): void {
    const gift = this.gifts.get(giftId);
    if (!gift) throw new Error('Gift not found');

    if (gift.status !== 'pending') {
      throw new Error('Gift already processed');
    }

    const senderInventory = this.getInventory(gift.senderId);
    const receiverInventory = this.getInventory(gift.receiverId);

    // Transfer items
    for (const item of gift.items) {
      senderInventory.items.delete(item.itemId);
      receiverInventory.items.set(item.itemId, item);
    }

    // Transfer currency
    for (const [currency, amount] of gift.currency.entries()) {
      const senderAmount = senderInventory.currency.get(currency) || 0;
      const receiverAmount = receiverInventory.currency.get(currency) || 0;

      senderInventory.currency.set(currency, senderAmount - amount);
      receiverInventory.currency.set(currency, receiverAmount + amount);
    }

    gift.status = 'accepted';
    gift.acceptedAt = new Date();

    senderInventory.updatedAt = new Date();
    receiverInventory.updatedAt = new Date();

    this.emit('gift:received', gift);
  }

  /**
   * Get price suggestion
   */
  getPriceSuggestion(itemName: string): PriceSuggestion | null {
    return this.priceSuggestions.get(itemName) || null;
  }

  /**
   * Search market listings
   */
  searchListings(filters?: {
    itemName?: string;
    type?: TradeableItemType;
    rarity?: ItemRarity;
    maxPrice?: number;
    currency?: string;
  }): MarketListing[] {
    let listings = Array.from(this.listings.values()).filter(l => l.status === 'active');

    if (filters?.itemName) {
      listings = listings.filter(l =>
        l.item.name.toLowerCase().includes(filters.itemName!.toLowerCase())
      );
    }

    if (filters?.type) {
      listings = listings.filter(l => l.item.type === filters.type);
    }

    if (filters?.rarity) {
      listings = listings.filter(l => l.item.rarity === filters.rarity);
    }

    if (filters?.maxPrice !== undefined && filters?.currency) {
      listings = listings.filter(l =>
        l.price.currency === filters.currency && l.price.amount <= filters.maxPrice!
      );
    }

    return listings.sort((a, b) => a.price.amount - b.price.amount);
  }

  /**
   * Get user's trade history
   */
  getTradeHistory(userId: string): TradeHistory[] {
    return this.tradeHistory.get(userId) || [];
  }

  /**
   * Get inventory
   */
  getInventory(userId: string): PlayerInventory {
    if (!this.inventories.has(userId)) {
      this.inventories.set(userId, {
        userId,
        items: new Map(),
        currency: new Map([['gold', 1000]]),
        updatedAt: new Date(),
      });
    }
    return this.inventories.get(userId)!;
  }

  /**
   * Add item to inventory
   */
  addItemToInventory(userId: string, item: TradeableItem): void {
    const inventory = this.getInventory(userId);
    inventory.items.set(item.itemId, item);
    inventory.updatedAt = new Date();
  }

  // Private helper methods

  private completeTrade(tradeId: string): void {
    const trade = this.trades.get(tradeId);
    if (!trade) return;

    // Check escrow
    if (trade.escrowReleaseDate && trade.escrowReleaseDate > new Date()) {
      // Trade will be completed later after escrow period
      return;
    }

    const senderInventory = this.getInventory(trade.senderId);
    const receiverInventory = this.getInventory(trade.receiverId);

    // Transfer items
    for (const itemId of trade.senderItems) {
      const item = senderInventory.items.get(itemId);
      if (item) {
        senderInventory.items.delete(itemId);
        receiverInventory.items.set(itemId, item);
      }
    }

    for (const itemId of trade.receiverItems) {
      const item = receiverInventory.items.get(itemId);
      if (item) {
        receiverInventory.items.delete(itemId);
        senderInventory.items.set(itemId, item);
      }
    }

    // Transfer currency
    for (const [currency, amount] of trade.senderCurrency.entries()) {
      const senderAmount = senderInventory.currency.get(currency) || 0;
      const receiverAmount = receiverInventory.currency.get(currency) || 0;

      senderInventory.currency.set(currency, senderAmount - amount);
      receiverInventory.currency.set(currency, receiverAmount + amount);
    }

    for (const [currency, amount] of trade.receiverCurrency.entries()) {
      const receiverAmount = receiverInventory.currency.get(currency) || 0;
      const senderAmount = senderInventory.currency.get(currency) || 0;

      receiverInventory.currency.set(currency, receiverAmount - amount);
      senderInventory.currency.set(currency, senderAmount + amount);
    }

    trade.status = TradeStatus.COMPLETED;
    trade.completedAt = new Date();

    senderInventory.updatedAt = new Date();
    receiverInventory.updatedAt = new Date();

    this.emit('trade:completed', trade);

    // Record in history
    const senderItems = trade.senderItems.map(id => senderInventory.items.get(id)!).filter(Boolean);
    const receiverItems = trade.receiverItems.map(id => receiverInventory.items.get(id)!).filter(Boolean);

    this.recordTradeHistory({
      tradeId: trade.tradeId,
      player1Id: trade.senderId,
      player2Id: trade.receiverId,
      player1Items: receiverItems,
      player2Items: senderItems,
      player1Currency: trade.receiverCurrency,
      player2Currency: trade.senderCurrency,
      completedAt: new Date(),
      receiptId: `receipt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });
  }

  private verifyItemsForTrade(userId: string, itemIds: string[]): void {
    const inventory = this.getInventory(userId);

    for (const itemId of itemIds) {
      const item = inventory.items.get(itemId);

      if (!item) {
        throw new Error(`Item ${itemId} not found in inventory`);
      }

      if (!item.isTradeable) {
        throw new Error(`Item ${item.name} is not tradeable`);
      }

      if (item.tradeHoldUntil && item.tradeHoldUntil > new Date()) {
        throw new Error(`Item ${item.name} is on trade hold until ${item.tradeHoldUntil.toISOString()}`);
      }
    }
  }

  private checkTradeRestrictions(userId: string): void {
    const restriction = this.restrictions.get(userId);

    if (!restriction) return;

    if (restriction.isPermanent) {
      throw new Error(`Trading is permanently disabled: ${restriction.reason}`);
    }

    if (restriction.restrictedUntil > new Date()) {
      throw new Error(`Trading is restricted until ${restriction.restrictedUntil.toISOString()}: ${restriction.reason}`);
    }
  }

  private checkForFraud(trade: TradeOffer): void {
    // Simple fraud detection based on value disparity
    const senderValue = this.calculateTradeValue(trade.senderId, trade.senderItems, trade.senderCurrency);
    const receiverValue = this.calculateTradeValue(trade.receiverId, trade.receiverItems, trade.receiverCurrency);

    const disparity = Math.abs(senderValue - receiverValue);
    const maxValue = Math.max(senderValue, receiverValue);

    if (maxValue > 0 && disparity / maxValue > 0.8) {
      // More than 80% value disparity
      const alert: FraudAlert = {
        alertId: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        tradeId: trade.tradeId,
        userId: senderValue > receiverValue ? trade.receiverId : trade.senderId,
        type: 'price_manipulation',
        severity: 'high',
        description: `Significant value disparity detected: ${senderValue} vs ${receiverValue}`,
        timestamp: new Date(),
        resolved: false,
      };

      if (!this.fraudAlerts.has(trade.tradeId)) {
        this.fraudAlerts.set(trade.tradeId, []);
      }
      this.fraudAlerts.get(trade.tradeId)!.push(alert);

      this.emit('fraud:detected', alert);
    }
  }

  private calculateTradeValue(userId: string, itemIds: string[], currency: Map<string, number>): number {
    let value = 0;

    const inventory = this.getInventory(userId);

    for (const itemId of itemIds) {
      const item = inventory.items.get(itemId);
      if (item) {
        const suggestion = this.priceSuggestions.get(item.name);
        value += suggestion?.averagePrice || 0;
      }
    }

    for (const amount of currency.values()) {
      value += amount;
    }

    return value;
  }

  private updatePriceSuggestion(itemName: string, currency: string, price: number): void {
    let suggestion = this.priceSuggestions.get(itemName);

    if (!suggestion) {
      suggestion = {
        itemId: `item_${itemName.toLowerCase().replace(/\s+/g, '_')}`,
        itemName,
        currency,
        averagePrice: price,
        medianPrice: price,
        lowestPrice: price,
        highestPrice: price,
        volume24h: 1,
        priceChange24h: 0,
        priceChange7d: 0,
        lastUpdated: new Date(),
        priceHistory: [{ timestamp: new Date(), price, volume: 1 }],
      };
      this.priceSuggestions.set(itemName, suggestion);
    } else {
      suggestion.priceHistory.push({ timestamp: new Date(), price, volume: 1 });
      suggestion.volume24h++;

      const prices = suggestion.priceHistory.map(p => p.price);
      suggestion.averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      suggestion.medianPrice = prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)];
      suggestion.lowestPrice = Math.min(...prices);
      suggestion.highestPrice = Math.max(...prices);
      suggestion.lastUpdated = new Date();

      // Calculate price changes
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const dayOldPrices = suggestion.priceHistory.filter(p => p.timestamp >= oneDayAgo);
      const weekOldPrices = suggestion.priceHistory.filter(p => p.timestamp >= oneWeekAgo);

      if (dayOldPrices.length > 1) {
        const oldPrice = dayOldPrices[0].price;
        suggestion.priceChange24h = ((price - oldPrice) / oldPrice) * 100;
      }

      if (weekOldPrices.length > 1) {
        const oldPrice = weekOldPrices[0].price;
        suggestion.priceChange7d = ((price - oldPrice) / oldPrice) * 100;
      }
    }
  }

  private endAuction(auctionId: string, winnerId?: string): void {
    const auction = this.auctions.get(auctionId);
    if (!auction) return;

    auction.status = 'sold';

    if (!winnerId && auction.bids.length > 0) {
      // Find highest bidder
      const highestBid = auction.bids.reduce((max, bid) =>
        bid.amount > max.amount ? bid : max
      );
      winnerId = highestBid.bidderId;
    }

    if (winnerId) {
      auction.winnerId = winnerId;

      // Transfer item and currency
      const sellerInventory = this.getInventory(auction.sellerId);
      const winnerInventory = this.getInventory(winnerId);

      sellerInventory.items.delete(auction.itemId);
      winnerInventory.items.set(auction.itemId, auction.item);

      const winnerCurrency = winnerInventory.currency.get(auction.currency) || 0;
      const sellerCurrency = sellerInventory.currency.get(auction.currency) || 0;

      winnerInventory.currency.set(auction.currency, winnerCurrency - auction.currentBid);
      sellerInventory.currency.set(auction.currency, sellerCurrency + auction.currentBid);

      sellerInventory.updatedAt = new Date();
      winnerInventory.updatedAt = new Date();
    }

    this.emit('auction:ended', auction);
  }

  private recordTradeHistory(history: TradeHistory): void {
    if (!this.tradeHistory.has(history.player1Id)) {
      this.tradeHistory.set(history.player1Id, []);
    }
    if (!this.tradeHistory.has(history.player2Id)) {
      this.tradeHistory.set(history.player2Id, []);
    }

    this.tradeHistory.get(history.player1Id)!.push(history);
    this.tradeHistory.get(history.player2Id)!.push(history);
  }

  private getPossibleTradeUpOutputs(inputRarity: ItemRarity): TradeableItem[] {
    // Return items of next higher rarity
    const rarityOrder = [
      ItemRarity.COMMON,
      ItemRarity.UNCOMMON,
      ItemRarity.RARE,
      ItemRarity.EPIC,
      ItemRarity.LEGENDARY,
      ItemRarity.MYTHIC,
    ];

    const currentIndex = rarityOrder.indexOf(inputRarity);
    const nextRarity = rarityOrder[currentIndex + 1];

    if (!nextRarity) return [];

    // In real implementation, fetch actual items of next rarity
    return [
      {
        itemId: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: `${nextRarity} Item`,
        type: TradeableItemType.COLLECTIBLE,
        rarity: nextRarity,
        description: `A ${nextRarity} quality item`,
        isTradeable: true,
        isMarketable: true,
        acquiredAt: new Date(),
      },
    ];
  }

  private startMaintenanceTasks(): void {
    // Clean up expired listings and auctions every hour
    setInterval(() => {
      const now = new Date();

      for (const listing of this.listings.values()) {
        if (listing.status === 'active' && listing.expiresAt < now) {
          listing.status = 'expired';
        }
      }

      for (const auction of this.auctions.values()) {
        if (auction.status === 'active' && auction.endTime < now) {
          this.endAuction(auction.auctionId);
        }
      }

      for (const trade of this.trades.values()) {
        if (trade.status === TradeStatus.PENDING && trade.expiresAt < now) {
          trade.status = TradeStatus.EXPIRED;
        }

        // Complete escrowed trades
        if (
          trade.status === TradeStatus.ACCEPTED &&
          trade.escrowReleaseDate &&
          trade.escrowReleaseDate <= now
        ) {
          this.completeTrade(trade.tradeId);
        }
      }
    }, 60 * 60 * 1000); // Every hour
  }
}
