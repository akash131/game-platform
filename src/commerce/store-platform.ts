import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

/**
 * Store Platform - In-game commerce and marketplace
 * Similar to Epic Games Store, Steam Store, PlayStation Store
 */

export interface StoreItem {
  itemId: string;
  sku: string;
  name: string;
  description: string;
  category: 'game' | 'dlc' | 'currency' | 'consumable' | 'cosmetic' | 'bundle' | 'subscription';
  price: Price;
  images: string[];
  tags: string[];
  availability: ItemAvailability;
  requirements?: ItemRequirements;
  bundleContents?: string[]; // itemIds if bundle
  metadata: ItemMetadata;
  stats: ItemStats;
  featured: boolean;
  newRelease: boolean;
  onSale: boolean;
}

export interface Price {
  currency: string;
  amount: number;
  originalAmount?: number; // For sales
  discount?: number; // Percentage
}

export interface ItemAvailability {
  status: 'available' | 'coming_soon' | 'unavailable' | 'delisted';
  releaseDate?: Date;
  endDate?: Date; // For limited time items
  regions?: string[]; // Geographic restrictions
  platforms?: string[];
}

export interface ItemRequirements {
  minLevel?: number;
  requiredItems?: string[]; // Must own these items
  requiredAchievements?: string[];
  subscription?: string; // Required subscription tier
}

export interface ItemMetadata {
  developer: string;
  publisher: string;
  releaseDate: Date;
  lastUpdated: Date;
  version: string;
  size?: number; // bytes
  contentRating: string;
  languages: string[];
}

export interface ItemStats {
  purchases: number;
  views: number;
  wishlists: number;
  rating: number; // 0-5
  totalReviews: number;
  revenue: number;
}

export interface Purchase {
  purchaseId: string;
  userId: string;
  itemId: string;
  quantity: number;
  price: Price;
  paymentMethod: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  timestamp: Date;
  completedAt?: Date;
  transactionId?: string;
  receiptUrl?: string;
}

export interface Cart {
  cartId: string;
  userId: string;
  items: CartItem[];
  total: Price;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface CartItem {
  itemId: string;
  quantity: number;
  price: Price;
}

export interface Wishlist {
  wishlistId: string;
  userId: string;
  items: string[]; // itemIds
  createdAt: Date;
  notifyOnSale: boolean;
}

export interface Subscription {
  subscriptionId: string;
  userId: string;
  tierId: string;
  status: 'active' | 'cancelled' | 'expired' | 'payment_failed';
  startDate: Date;
  endDate?: Date;
  nextBillingDate?: Date;
  autoRenew: boolean;
  price: Price;
  benefits: string[];
}

export interface SubscriptionTier {
  tierId: string;
  name: string;
  description: string;
  price: Price;
  billingPeriod: 'monthly' | 'quarterly' | 'yearly';
  benefits: SubscriptionBenefit[];
  trialDays?: number;
}

export interface SubscriptionBenefit {
  type: 'discount' | 'content' | 'feature' | 'currency';
  description: string;
  value?: any;
}

export interface PaymentMethod {
  paymentMethodId: string;
  userId: string;
  type: 'credit_card' | 'paypal' | 'crypto' | 'gift_card' | 'carrier_billing';
  details: any; // Encrypted payment details
  isDefault: boolean;
  createdAt: Date;
}

export interface Refund {
  refundId: string;
  purchaseId: string;
  userId: string;
  reason: string;
  amount: number;
  status: 'pending' | 'approved' | 'denied' | 'completed';
  requestedAt: Date;
  processedAt?: Date;
}

export interface Promotion {
  promotionId: string;
  name: string;
  type: 'percentage' | 'fixed' | 'bundle' | 'bogo';
  discount: number;
  applicableItems?: string[]; // If null, applies to all
  code?: string; // Promo code
  startDate: Date;
  endDate: Date;
  maxUses?: number;
  usedCount: number;
  conditions?: PromotionCondition[];
}

export interface PromotionCondition {
  type: 'min_purchase' | 'first_time' | 'user_segment';
  value: any;
}

export interface StoreEvents {
  'itemPurchased': (purchase: Purchase) => void;
  'cartUpdated': (cart: Cart) => void;
  'subscriptionActivated': (subscription: Subscription) => void;
  'refundRequested': (refund: Refund) => void;
  'promotionApplied': (promotion: Promotion, userId: string) => void;
  'wishlistUpdated': (wishlist: Wishlist) => void;
}

export class StorePlatform extends EventEmitter<StoreEvents> {
  private items: Map<string, StoreItem> = new Map();
  private purchases: Map<string, Purchase> = new Map();
  private userPurchases: Map<string, Set<string>> = new Map(); // userId -> purchaseIds
  private carts: Map<string, Cart> = new Map(); // userId -> cart
  private wishlists: Map<string, Wishlist> = new Map(); // userId -> wishlist
  private subscriptions: Map<string, Subscription> = new Map(); // userId -> subscription
  private tiers: Map<string, SubscriptionTier> = new Map();
  private paymentMethods: Map<string, PaymentMethod[]> = new Map(); // userId -> methods
  private refunds: Map<string, Refund> = new Map();
  private promotions: Map<string, Promotion> = new Map();

  constructor() {
    super();

    // Clean up expired carts periodically
    setInterval(() => {
      this.cleanupExpiredCarts();
    }, 300000); // Every 5 minutes
  }

  // ==================== Store Items ====================

  /**
   * Add store item
   */
  addStoreItem(item: Omit<StoreItem, 'itemId' | 'stats' | 'featured' | 'newRelease' | 'onSale'>): StoreItem {
    const fullItem: StoreItem = {
      itemId: uuidv4(),
      stats: {
        purchases: 0,
        views: 0,
        wishlists: 0,
        rating: 0,
        totalReviews: 0,
        revenue: 0,
      },
      featured: false,
      newRelease: false,
      onSale: false,
      ...item,
    };

    // Check if on sale
    if (fullItem.price.originalAmount && fullItem.price.amount < fullItem.price.originalAmount) {
      fullItem.onSale = true;
    }

    // Check if new release (within 30 days)
    const daysSinceRelease = Math.floor(
      (Date.now() - fullItem.metadata.releaseDate.getTime()) / 86400000
    );
    fullItem.newRelease = daysSinceRelease <= 30;

    this.items.set(fullItem.itemId, fullItem);
    return fullItem;
  }

  /**
   * Get store item
   */
  getStoreItem(itemId: string): StoreItem | undefined {
    const item = this.items.get(itemId);

    if (item) {
      item.stats.views++;
    }

    return item;
  }

  /**
   * List store items
   */
  listStoreItems(filters?: {
    category?: StoreItem['category'];
    tags?: string[];
    onSale?: boolean;
    featured?: boolean;
    newRelease?: boolean;
    sortBy?: 'price' | 'name' | 'popularity' | 'release_date';
  }): StoreItem[] {
    let items = Array.from(this.items.values())
      .filter(item => item.availability.status === 'available');

    // Apply filters
    if (filters) {
      if (filters.category) {
        items = items.filter(item => item.category === filters.category);
      }

      if (filters.tags && filters.tags.length > 0) {
        items = items.filter(item =>
          filters.tags!.some(tag => item.tags.includes(tag))
        );
      }

      if (filters.onSale !== undefined) {
        items = items.filter(item => item.onSale === filters.onSale);
      }

      if (filters.featured !== undefined) {
        items = items.filter(item => item.featured === filters.featured);
      }

      if (filters.newRelease !== undefined) {
        items = items.filter(item => item.newRelease === filters.newRelease);
      }

      // Sorting
      switch (filters.sortBy) {
        case 'price':
          items.sort((a, b) => a.price.amount - b.price.amount);
          break;
        case 'name':
          items.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case 'popularity':
          items.sort((a, b) => b.stats.purchases - a.stats.purchases);
          break;
        case 'release_date':
          items.sort((a, b) => b.metadata.releaseDate.getTime() - a.metadata.releaseDate.getTime());
          break;
      }
    }

    return items;
  }

  // ==================== Cart ====================

  /**
   * Get or create cart
   */
  getCart(userId: string): Cart {
    let cart = this.carts.get(userId);

    if (!cart) {
      cart = {
        cartId: uuidv4(),
        userId,
        items: [],
        total: { currency: 'USD', amount: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000), // 24 hours
      };
      this.carts.set(userId, cart);
    }

    return cart;
  }

  /**
   * Add to cart
   */
  addToCart(userId: string, itemId: string, quantity: number = 1): Cart {
    const cart = this.getCart(userId);
    const item = this.items.get(itemId);

    if (!item) {
      throw new Error('Item not found');
    }

    // Check if item already in cart
    const existingIndex = cart.items.findIndex(ci => ci.itemId === itemId);

    if (existingIndex >= 0) {
      cart.items[existingIndex].quantity += quantity;
    } else {
      cart.items.push({
        itemId,
        quantity,
        price: item.price,
      });
    }

    this.updateCartTotal(cart);
    cart.updatedAt = new Date();

    this.emit('cartUpdated', cart);
    return cart;
  }

  /**
   * Remove from cart
   */
  removeFromCart(userId: string, itemId: string): Cart {
    const cart = this.getCart(userId);

    cart.items = cart.items.filter(ci => ci.itemId !== itemId);
    this.updateCartTotal(cart);
    cart.updatedAt = new Date();

    this.emit('cartUpdated', cart);
    return cart;
  }

  /**
   * Update cart total
   */
  private updateCartTotal(cart: Cart): void {
    let total = 0;

    for (const item of cart.items) {
      total += item.price.amount * item.quantity;
    }

    cart.total.amount = total;
  }

  /**
   * Clear cart
   */
  clearCart(userId: string): void {
    const cart = this.getCart(userId);
    cart.items = [];
    cart.total.amount = 0;
    cart.updatedAt = new Date();

    this.emit('cartUpdated', cart);
  }

  // ==================== Purchases ====================

  /**
   * Purchase cart
   */
  async purchaseCart(userId: string, paymentMethodId: string): Promise<Purchase[]> {
    const cart = this.getCart(userId);

    if (cart.items.length === 0) {
      throw new Error('Cart is empty');
    }

    const purchases: Purchase[] = [];

    for (const cartItem of cart.items) {
      const purchase = await this.purchaseItem(
        userId,
        cartItem.itemId,
        cartItem.quantity,
        paymentMethodId
      );
      purchases.push(purchase);
    }

    this.clearCart(userId);
    return purchases;
  }

  /**
   * Purchase item
   */
  async purchaseItem(
    userId: string,
    itemId: string,
    quantity: number,
    paymentMethodId: string
  ): Promise<Purchase> {
    const item = this.items.get(itemId);

    if (!item) {
      throw new Error('Item not found');
    }

    // Check requirements
    if (item.requirements) {
      this.checkRequirements(userId, item.requirements);
    }

    const purchase: Purchase = {
      purchaseId: uuidv4(),
      userId,
      itemId,
      quantity,
      price: item.price,
      paymentMethod: paymentMethodId,
      status: 'pending',
      timestamp: new Date(),
    };

    this.purchases.set(purchase.purchaseId, purchase);

    if (!this.userPurchases.has(userId)) {
      this.userPurchases.set(userId, new Set());
    }
    this.userPurchases.get(userId)!.add(purchase.purchaseId);

    // Simulate payment processing
    setTimeout(() => {
      purchase.status = 'completed';
      purchase.completedAt = new Date();
      purchase.transactionId = uuidv4();

      // Update item stats
      item.stats.purchases += quantity;
      item.stats.revenue += item.price.amount * quantity;

      this.emit('itemPurchased', purchase);
    }, 1000);

    return purchase;
  }

  /**
   * Check item requirements
   */
  private checkRequirements(userId: string, requirements: ItemRequirements): void {
    // Would check if user meets requirements
    if (requirements.requiredItems) {
      for (const requiredItemId of requirements.requiredItems) {
        if (!this.userOwnsItem(userId, requiredItemId)) {
          throw new Error('Missing required item');
        }
      }
    }
  }

  /**
   * Check if user owns item
   */
  userOwnsItem(userId: string, itemId: string): boolean {
    const userPurchaseIds = this.userPurchases.get(userId);
    if (!userPurchaseIds) return false;

    for (const purchaseId of userPurchaseIds) {
      const purchase = this.purchases.get(purchaseId);
      if (purchase && purchase.itemId === itemId && purchase.status === 'completed') {
        return true;
      }
    }

    return false;
  }

  /**
   * Get user purchases
   */
  getUserPurchases(userId: string): Purchase[] {
    const purchaseIds = this.userPurchases.get(userId);
    if (!purchaseIds) return [];

    const purchases: Purchase[] = [];

    for (const purchaseId of purchaseIds) {
      const purchase = this.purchases.get(purchaseId);
      if (purchase) {
        purchases.push(purchase);
      }
    }

    return purchases.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // ==================== Wishlist ====================

  /**
   * Get or create wishlist
   */
  getWishlist(userId: string): Wishlist {
    let wishlist = this.wishlists.get(userId);

    if (!wishlist) {
      wishlist = {
        wishlistId: uuidv4(),
        userId,
        items: [],
        createdAt: new Date(),
        notifyOnSale: true,
      };
      this.wishlists.set(userId, wishlist);
    }

    return wishlist;
  }

  /**
   * Add to wishlist
   */
  addToWishlist(userId: string, itemId: string): Wishlist {
    const wishlist = this.getWishlist(userId);
    const item = this.items.get(itemId);

    if (!item) {
      throw new Error('Item not found');
    }

    if (!wishlist.items.includes(itemId)) {
      wishlist.items.push(itemId);
      item.stats.wishlists++;
      this.emit('wishlistUpdated', wishlist);
    }

    return wishlist;
  }

  /**
   * Remove from wishlist
   */
  removeFromWishlist(userId: string, itemId: string): Wishlist {
    const wishlist = this.getWishlist(userId);
    const item = this.items.get(itemId);

    const index = wishlist.items.indexOf(itemId);
    if (index >= 0) {
      wishlist.items.splice(index, 1);
      if (item) {
        item.stats.wishlists = Math.max(0, item.stats.wishlists - 1);
      }
      this.emit('wishlistUpdated', wishlist);
    }

    return wishlist;
  }

  // ==================== Subscriptions ====================

  /**
   * Create subscription tier
   */
  createSubscriptionTier(tier: Omit<SubscriptionTier, 'tierId'>): SubscriptionTier {
    const fullTier: SubscriptionTier = {
      tierId: uuidv4(),
      ...tier,
    };

    this.tiers.set(fullTier.tierId, fullTier);
    return fullTier;
  }

  /**
   * Subscribe
   */
  subscribe(userId: string, tierId: string, paymentMethodId: string): Subscription {
    const tier = this.tiers.get(tierId);

    if (!tier) {
      throw new Error('Subscription tier not found');
    }

    // Calculate next billing date
    const nextBilling = new Date();
    switch (tier.billingPeriod) {
      case 'monthly':
        nextBilling.setMonth(nextBilling.getMonth() + 1);
        break;
      case 'quarterly':
        nextBilling.setMonth(nextBilling.getMonth() + 3);
        break;
      case 'yearly':
        nextBilling.setFullYear(nextBilling.getFullYear() + 1);
        break;
    }

    const subscription: Subscription = {
      subscriptionId: uuidv4(),
      userId,
      tierId,
      status: 'active',
      startDate: new Date(),
      nextBillingDate: nextBilling,
      autoRenew: true,
      price: tier.price,
      benefits: tier.benefits.map(b => b.description),
    };

    this.subscriptions.set(userId, subscription);
    this.emit('subscriptionActivated', subscription);

    return subscription;
  }

  /**
   * Cancel subscription
   */
  cancelSubscription(userId: string): void {
    const subscription = this.subscriptions.get(userId);

    if (subscription) {
      subscription.status = 'cancelled';
      subscription.autoRenew = false;
      subscription.endDate = subscription.nextBillingDate;
    }
  }

  // ==================== Refunds ====================

  /**
   * Request refund
   */
  requestRefund(purchaseId: string, reason: string): Refund {
    const purchase = this.purchases.get(purchaseId);

    if (!purchase) {
      throw new Error('Purchase not found');
    }

    if (purchase.status !== 'completed') {
      throw new Error('Can only refund completed purchases');
    }

    const refund: Refund = {
      refundId: uuidv4(),
      purchaseId,
      userId: purchase.userId,
      reason,
      amount: purchase.price.amount * purchase.quantity,
      status: 'pending',
      requestedAt: new Date(),
    };

    this.refunds.set(refund.refundId, refund);
    this.emit('refundRequested', refund);

    return refund;
  }

  /**
   * Process refund
   */
  processRefund(refundId: string, approved: boolean): Refund {
    const refund = this.refunds.get(refundId);

    if (!refund) {
      throw new Error('Refund not found');
    }

    refund.status = approved ? 'approved' : 'denied';
    refund.processedAt = new Date();

    if (approved) {
      const purchase = this.purchases.get(refund.purchaseId);
      if (purchase) {
        purchase.status = 'refunded';

        // Update item stats
        const item = this.items.get(purchase.itemId);
        if (item) {
          item.stats.revenue -= purchase.price.amount * purchase.quantity;
        }
      }

      refund.status = 'completed';
    }

    return refund;
  }

  // ==================== Promotions ====================

  /**
   * Create promotion
   */
  createPromotion(promotion: Omit<Promotion, 'promotionId' | 'usedCount'>): Promotion {
    const fullPromotion: Promotion = {
      promotionId: uuidv4(),
      usedCount: 0,
      ...promotion,
    };

    this.promotions.set(fullPromotion.promotionId, fullPromotion);
    return fullPromotion;
  }

  /**
   * Apply promotion code
   */
  applyPromotionCode(userId: string, code: string, cartTotal: number): Promotion {
    const promotion = Array.from(this.promotions.values())
      .find(p => p.code === code);

    if (!promotion) {
      throw new Error('Invalid promotion code');
    }

    const now = new Date();
    if (now < promotion.startDate || now > promotion.endDate) {
      throw new Error('Promotion is not active');
    }

    if (promotion.maxUses && promotion.usedCount >= promotion.maxUses) {
      throw new Error('Promotion has reached maximum uses');
    }

    promotion.usedCount++;
    this.emit('promotionApplied', promotion, userId);

    return promotion;
  }

  // ==================== Utilities ====================

  /**
   * Cleanup expired carts
   */
  private cleanupExpiredCarts(): void {
    const now = new Date();

    for (const [userId, cart] of this.carts) {
      if (cart.expiresAt < now) {
        this.carts.delete(userId);
      }
    }
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalItems: number;
    totalPurchases: number;
    totalRevenue: number;
    activeSubscriptions: number;
    activePromotions: number;
    avgOrderValue: number;
  } {
    let totalRevenue = 0;
    let completedPurchases = 0;

    for (const purchase of this.purchases.values()) {
      if (purchase.status === 'completed') {
        totalRevenue += purchase.price.amount * purchase.quantity;
        completedPurchases++;
      }
    }

    const activeSubscriptions = Array.from(this.subscriptions.values())
      .filter(s => s.status === 'active').length;

    const activePromotions = Array.from(this.promotions.values())
      .filter(p => {
        const now = new Date();
        return now >= p.startDate && now <= p.endDate;
      }).length;

    const avgOrderValue = completedPurchases > 0 ? totalRevenue / completedPurchases : 0;

    return {
      totalItems: this.items.size,
      totalPurchases: this.purchases.size,
      totalRevenue,
      activeSubscriptions,
      activePromotions,
      avgOrderValue,
    };
  }
}
