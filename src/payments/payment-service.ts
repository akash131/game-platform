/**
 * Payment Processing Service
 * Multi-provider payment integration for game platform monetization
 * Supports Stripe, PayPal, Steam Wallet, Epic, Apple IAP, Google Play
 */

import { EventEmitter } from 'events';

export type PaymentProvider = 'stripe' | 'paypal' | 'steam' | 'epic' | 'apple' | 'google' | 'xbox' | 'playstation';
export type PaymentMethod = 'card' | 'paypal' | 'wallet' | 'crypto' | 'wire' | 'apple_pay' | 'google_pay';
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'disputed' | 'cancelled';
export type RefundReason = 'duplicate' | 'fraudulent' | 'requested_by_customer' | 'product_not_delivered' | 'defective';

export interface PaymentConfig {
  providers: {
    stripe?: {
      secretKey: string;
      publishableKey: string;
      webhookSecret: string;
    };
    paypal?: {
      clientId: string;
      clientSecret: string;
      mode: 'sandbox' | 'live';
    };
    steam?: {
      apiKey: string;
      partnerId: string;
    };
    epic?: {
      apiKey: string;
      sandboxId: string;
    };
  };
  defaultCurrency: string;
  supportedCurrencies: string[];
  enableFraudDetection: boolean;
  taxCalculation: boolean;
}

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  method: PaymentMethod;
  customerId: string;
  description: string;
  metadata: Record<string, any>;
  status: PaymentStatus;
  createdAt: Date;
  completedAt?: Date;
  failureReason?: string;
  receiptUrl?: string;
  transactionId?: string;
}

export interface Customer {
  id: string;
  email: string;
  name: string;
  paymentMethods: SavedPaymentMethod[];
  walletBalance: Record<string, number>; // Currency -> balance
  purchaseHistory: Purchase[];
  totalSpent: number;
  tier?: 'free' | 'bronze' | 'silver' | 'gold' | 'platinum';
}

export interface SavedPaymentMethod {
  id: string;
  provider: PaymentProvider;
  type: PaymentMethod;
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

export interface Purchase {
  id: string;
  customerId: string;
  items: PurchaseItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  status: PaymentStatus;
  paymentIntent: string;
  createdAt: Date;
  refundedAmount?: number;
}

export interface PurchaseItem {
  itemId: string;
  name: string;
  type: 'game' | 'dlc' | 'currency' | 'cosmetic' | 'subscription' | 'bundle';
  quantity: number;
  unitPrice: number;
  total: number;
  discount?: number;
}

export interface Refund {
  id: string;
  purchaseId: string;
  amount: number;
  currency: string;
  reason: RefundReason;
  status: 'pending' | 'completed' | 'failed';
  requestedAt: Date;
  processedAt?: Date;
  notes?: string;
}

export interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  interval: 'monthly' | 'quarterly' | 'yearly';
  status: 'active' | 'cancelled' | 'past_due' | 'expired';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAt?: Date;
  trialEnd?: Date;
}

export interface FraudCheck {
  score: number; // 0-100, higher = more suspicious
  riskLevel: 'low' | 'medium' | 'high';
  reasons: string[];
  blockedCountries?: string[];
  ipAddress?: string;
  deviceFingerprint?: string;
}

export interface TaxCalculation {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  jurisdiction: string;
}

export class PaymentService extends EventEmitter {
  private config: PaymentConfig;
  private customers: Map<string, Customer> = new Map();
  private paymentIntents: Map<string, PaymentIntent> = new Map();
  private purchases: Map<string, Purchase> = new Map();
  private refunds: Map<string, Refund> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private fraudRules: Map<string, any> = new Map();

  constructor(config: PaymentConfig) {
    super();
    this.config = config;
    this.initializeFraudRules();
  }

  /**
   * Initialize fraud detection rules
   */
  private initializeFraudRules(): void {
    this.fraudRules.set('maxTransactionAmount', 10000);
    this.fraudRules.set('maxDailyTransactions', 50);
    this.fraudRules.set('velocityThreshold', 10); // Transactions per hour
    this.fraudRules.set('blockedCountries', ['NK', 'SY', 'IR']);
    this.fraudRules.set('suspiciousEmailPatterns', [/temp|disposable|fake/i]);
  }

  /**
   * Create or get customer
   */
  async createCustomer(
    id: string,
    email: string,
    name: string
  ): Promise<Customer> {
    if (this.customers.has(id)) {
      return this.customers.get(id)!;
    }

    const customer: Customer = {
      id,
      email,
      name,
      paymentMethods: [],
      walletBalance: {},
      purchaseHistory: [],
      totalSpent: 0,
      tier: 'free'
    };

    this.customers.set(id, customer);
    this.emit('customerCreated', customer);

    return customer;
  }

  /**
   * Add payment method to customer
   */
  async addPaymentMethod(
    customerId: string,
    provider: PaymentProvider,
    method: PaymentMethod,
    details: any
  ): Promise<SavedPaymentMethod> {
    const customer = this.customers.get(customerId);

    if (!customer) {
      throw new Error('Customer not found');
    }

    const paymentMethod: SavedPaymentMethod = {
      id: `pm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      provider,
      type: method,
      last4: details.last4,
      brand: details.brand,
      expiryMonth: details.expiryMonth,
      expiryYear: details.expiryYear,
      isDefault: customer.paymentMethods.length === 0
    };

    customer.paymentMethods.push(paymentMethod);

    this.emit('paymentMethodAdded', { customerId, paymentMethod });

    return paymentMethod;
  }

  /**
   * Create payment intent
   */
  async createPaymentIntent(
    customerId: string,
    amount: number,
    currency: string,
    provider: PaymentProvider,
    method: PaymentMethod,
    description: string,
    metadata: Record<string, any> = {}
  ): Promise<PaymentIntent> {
    // Fraud check
    if (this.config.enableFraudDetection) {
      const fraudCheck = await this.performFraudCheck(customerId, amount, currency);

      if (fraudCheck.riskLevel === 'high') {
        throw new Error(`Payment blocked due to fraud risk: ${fraudCheck.reasons.join(', ')}`);
      }
    }

    const intent: PaymentIntent = {
      id: `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      amount,
      currency,
      provider,
      method,
      customerId,
      description,
      metadata,
      status: 'pending',
      createdAt: new Date()
    };

    this.paymentIntents.set(intent.id, intent);

    this.emit('paymentIntentCreated', intent);

    return intent;
  }

  /**
   * Process payment
   */
  async processPayment(
    paymentIntentId: string
  ): Promise<PaymentIntent> {
    const intent = this.paymentIntents.get(paymentIntentId);

    if (!intent) {
      throw new Error('Payment intent not found');
    }

    intent.status = 'processing';

    this.emit('paymentProcessing', intent);

    try {
      // Simulate payment processing based on provider
      const result = await this.processWithProvider(intent);

      intent.status = 'completed';
      intent.completedAt = new Date();
      intent.transactionId = result.transactionId;
      intent.receiptUrl = result.receiptUrl;

      // Update customer
      const customer = this.customers.get(intent.customerId);
      if (customer) {
        customer.totalSpent += intent.amount;
        this.updateCustomerTier(customer);
      }

      this.emit('paymentCompleted', intent);

      return intent;
    } catch (error) {
      intent.status = 'failed';
      intent.failureReason = String(error);

      this.emit('paymentFailed', { intent, error });

      throw error;
    }
  }

  /**
   * Process payment with specific provider
   */
  private async processWithProvider(
    intent: PaymentIntent
  ): Promise<{ transactionId: string; receiptUrl: string }> {
    // Mock provider-specific processing
    switch (intent.provider) {
      case 'stripe':
        return this.processStripePayment(intent);

      case 'paypal':
        return this.processPayPalPayment(intent);

      case 'steam':
        return this.processSteamPayment(intent);

      case 'epic':
        return this.processEpicPayment(intent);

      case 'apple':
        return this.processApplePayment(intent);

      case 'google':
        return this.processGooglePayment(intent);

      default:
        throw new Error(`Unsupported provider: ${intent.provider}`);
    }
  }

  private async processStripePayment(
    intent: PaymentIntent
  ): Promise<{ transactionId: string; receiptUrl: string }> {
    // Mock Stripe API call
    return {
      transactionId: `stripe_${Date.now()}`,
      receiptUrl: `https://stripe.com/receipts/${intent.id}`
    };
  }

  private async processPayPalPayment(
    intent: PaymentIntent
  ): Promise<{ transactionId: string; receiptUrl: string }> {
    // Mock PayPal API call
    return {
      transactionId: `paypal_${Date.now()}`,
      receiptUrl: `https://paypal.com/receipts/${intent.id}`
    };
  }

  private async processSteamPayment(
    intent: PaymentIntent
  ): Promise<{ transactionId: string; receiptUrl: string }> {
    // Mock Steam Wallet API call
    return {
      transactionId: `steam_${Date.now()}`,
      receiptUrl: `https://store.steampowered.com/account/history/${intent.id}`
    };
  }

  private async processEpicPayment(
    intent: PaymentIntent
  ): Promise<{ transactionId: string; receiptUrl: string }> {
    // Mock Epic Games Store API call
    return {
      transactionId: `epic_${Date.now()}`,
      receiptUrl: `https://www.epicgames.com/account/transactions/${intent.id}`
    };
  }

  private async processApplePayment(
    intent: PaymentIntent
  ): Promise<{ transactionId: string; receiptUrl: string }> {
    // Mock Apple IAP validation
    return {
      transactionId: `apple_${Date.now()}`,
      receiptUrl: `https://apps.apple.com/account/subscriptions`
    };
  }

  private async processGooglePayment(
    intent: PaymentIntent
  ): Promise<{ transactionId: string; receiptUrl: string }> {
    // Mock Google Play billing
    return {
      transactionId: `google_${Date.now()}`,
      receiptUrl: `https://play.google.com/store/account/orderhistory`
    };
  }

  /**
   * Create purchase from items
   */
  async createPurchase(
    customerId: string,
    items: PurchaseItem[],
    currency: string
  ): Promise<Purchase> {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);

    // Calculate tax
    let tax = 0;
    let total = subtotal;

    if (this.config.taxCalculation) {
      const taxCalc = await this.calculateTax(subtotal, currency, customerId);
      tax = taxCalc.taxAmount;
      total = taxCalc.total;
    }

    const purchase: Purchase = {
      id: `pur_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      customerId,
      items,
      subtotal,
      tax,
      total,
      currency,
      status: 'pending',
      paymentIntent: '',
      createdAt: new Date()
    };

    this.purchases.set(purchase.id, purchase);

    // Add to customer history
    const customer = this.customers.get(customerId);
    if (customer) {
      customer.purchaseHistory.push(purchase);
    }

    this.emit('purchaseCreated', purchase);

    return purchase;
  }

  /**
   * Complete purchase with payment
   */
  async completePurchase(
    purchaseId: string,
    paymentIntentId: string
  ): Promise<Purchase> {
    const purchase = this.purchases.get(purchaseId);

    if (!purchase) {
      throw new Error('Purchase not found');
    }

    const intent = await this.processPayment(paymentIntentId);

    if (intent.status !== 'completed') {
      throw new Error('Payment not completed');
    }

    purchase.status = 'completed';
    purchase.paymentIntent = paymentIntentId;

    this.emit('purchaseCompleted', purchase);

    return purchase;
  }

  /**
   * Request refund
   */
  async refundPurchase(
    purchaseId: string,
    amount: number,
    reason: RefundReason,
    notes?: string
  ): Promise<Refund> {
    const purchase = this.purchases.get(purchaseId);

    if (!purchase) {
      throw new Error('Purchase not found');
    }

    if (purchase.status !== 'completed') {
      throw new Error('Only completed purchases can be refunded');
    }

    const refundableAmount = purchase.total - (purchase.refundedAmount || 0);

    if (amount > refundableAmount) {
      throw new Error(`Refund amount exceeds refundable amount (${refundableAmount})`);
    }

    const refund: Refund = {
      id: `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      purchaseId,
      amount,
      currency: purchase.currency,
      reason,
      status: 'pending',
      requestedAt: new Date(),
      notes
    };

    this.refunds.set(refund.id, refund);

    // Process refund
    await this.processRefund(refund.id);

    this.emit('refundRequested', refund);

    return refund;
  }

  /**
   * Process refund
   */
  private async processRefund(refundId: string): Promise<void> {
    const refund = this.refunds.get(refundId);

    if (!refund) {
      throw new Error('Refund not found');
    }

    try {
      // Simulate refund processing
      refund.status = 'completed';
      refund.processedAt = new Date();

      // Update purchase
      const purchase = this.purchases.get(refund.purchaseId);
      if (purchase) {
        purchase.refundedAmount = (purchase.refundedAmount || 0) + refund.amount;

        if (purchase.refundedAmount >= purchase.total) {
          purchase.status = 'refunded';
        }
      }

      this.emit('refundCompleted', refund);
    } catch (error) {
      refund.status = 'failed';
      this.emit('refundFailed', { refund, error });
      throw error;
    }
  }

  /**
   * Create subscription
   */
  async createSubscription(
    customerId: string,
    planId: string,
    planName: string,
    amount: number,
    currency: string,
    interval: 'monthly' | 'quarterly' | 'yearly',
    trialDays?: number
  ): Promise<Subscription> {
    const now = new Date();
    const trialEnd = trialDays ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000) : undefined;

    const periodEnd = new Date(now);
    switch (interval) {
      case 'monthly':
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        break;
      case 'quarterly':
        periodEnd.setMonth(periodEnd.getMonth() + 3);
        break;
      case 'yearly':
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        break;
    }

    const subscription: Subscription = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      customerId,
      planId,
      planName,
      amount,
      currency,
      interval,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      trialEnd
    };

    this.subscriptions.set(subscription.id, subscription);

    this.emit('subscriptionCreated', subscription);

    return subscription;
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    immediate: boolean = false
  ): Promise<Subscription> {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (immediate) {
      subscription.status = 'cancelled';
      subscription.cancelAt = new Date();
    } else {
      // Cancel at period end
      subscription.cancelAt = subscription.currentPeriodEnd;
    }

    this.emit('subscriptionCancelled', subscription);

    return subscription;
  }

  /**
   * Add funds to wallet
   */
  async addToWallet(
    customerId: string,
    amount: number,
    currency: string,
    paymentIntentId: string
  ): Promise<number> {
    const customer = this.customers.get(customerId);

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Verify payment
    const intent = this.paymentIntents.get(paymentIntentId);
    if (!intent || intent.status !== 'completed') {
      throw new Error('Invalid or incomplete payment');
    }

    if (!customer.walletBalance[currency]) {
      customer.walletBalance[currency] = 0;
    }

    customer.walletBalance[currency] += amount;

    this.emit('walletFunded', { customerId, amount, currency, balance: customer.walletBalance[currency] });

    return customer.walletBalance[currency];
  }

  /**
   * Deduct from wallet
   */
  async deductFromWallet(
    customerId: string,
    amount: number,
    currency: string
  ): Promise<number> {
    const customer = this.customers.get(customerId);

    if (!customer) {
      throw new Error('Customer not found');
    }

    const balance = customer.walletBalance[currency] || 0;

    if (balance < amount) {
      throw new Error('Insufficient wallet balance');
    }

    customer.walletBalance[currency] -= amount;

    this.emit('walletDeducted', { customerId, amount, currency, balance: customer.walletBalance[currency] });

    return customer.walletBalance[currency];
  }

  /**
   * Perform fraud detection check
   */
  private async performFraudCheck(
    customerId: string,
    amount: number,
    currency: string
  ): Promise<FraudCheck> {
    const reasons: string[] = [];
    let score = 0;

    // Check transaction amount
    const maxAmount = this.fraudRules.get('maxTransactionAmount');
    if (amount > maxAmount) {
      reasons.push(`Transaction amount exceeds limit (${maxAmount})`);
      score += 30;
    }

    // Check customer history
    const customer = this.customers.get(customerId);
    if (customer) {
      // Check velocity (transactions per hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentPurchases = customer.purchaseHistory.filter(
        p => p.createdAt > oneHourAgo
      );

      const velocityThreshold = this.fraudRules.get('velocityThreshold');
      if (recentPurchases.length > velocityThreshold) {
        reasons.push('High transaction velocity detected');
        score += 40;
      }

      // Check email patterns
      const suspiciousPatterns = this.fraudRules.get('suspiciousEmailPatterns');
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(customer.email)) {
          reasons.push('Suspicious email pattern');
          score += 25;
          break;
        }
      }
    }

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high';
    if (score < 30) {
      riskLevel = 'low';
    } else if (score < 60) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'high';
    }

    return {
      score,
      riskLevel,
      reasons
    };
  }

  /**
   * Calculate tax
   */
  private async calculateTax(
    subtotal: number,
    currency: string,
    customerId: string
  ): Promise<TaxCalculation> {
    // Simplified tax calculation
    // In production, use services like Stripe Tax or TaxJar

    let taxRate = 0;
    let jurisdiction = 'Unknown';

    // Mock tax rates
    if (currency === 'USD') {
      taxRate = 0.08; // 8% sales tax
      jurisdiction = 'US';
    } else if (currency === 'EUR') {
      taxRate = 0.20; // 20% VAT
      jurisdiction = 'EU';
    } else if (currency === 'GBP') {
      taxRate = 0.20; // 20% VAT
      jurisdiction = 'UK';
    }

    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;

    return {
      subtotal,
      taxRate,
      taxAmount,
      total,
      jurisdiction
    };
  }

  /**
   * Update customer tier based on spending
   */
  private updateCustomerTier(customer: Customer): void {
    if (customer.totalSpent >= 5000) {
      customer.tier = 'platinum';
    } else if (customer.totalSpent >= 2000) {
      customer.tier = 'gold';
    } else if (customer.totalSpent >= 500) {
      customer.tier = 'silver';
    } else if (customer.totalSpent >= 100) {
      customer.tier = 'bronze';
    } else {
      customer.tier = 'free';
    }
  }

  /**
   * Get payment statistics
   */
  async getStats(): Promise<any> {
    const completedPayments = Array.from(this.paymentIntents.values()).filter(
      p => p.status === 'completed'
    );

    const totalRevenue = completedPayments.reduce((sum, p) => sum + p.amount, 0);

    const subscriptionRevenue = Array.from(this.subscriptions.values())
      .filter(s => s.status === 'active')
      .reduce((sum, s) => sum + s.amount, 0);

    return {
      totalCustomers: this.customers.size,
      totalPayments: this.paymentIntents.size,
      completedPayments: completedPayments.length,
      totalRevenue,
      totalRefunds: this.refunds.size,
      activeSubscriptions: Array.from(this.subscriptions.values()).filter(s => s.status === 'active').length,
      monthlyRecurringRevenue: subscriptionRevenue,
      averageTransactionValue: totalRevenue / completedPayments.length || 0
    };
  }
}
