import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

/**
 * Identity Service - Cross-platform identity and authentication
 * Similar to Epic Games Account Services, Xbox Live, PlayStation Network
 */

export interface Account {
  accountId: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  phoneNumber?: string;
  phoneVerified: boolean;
  dateOfBirth?: Date;
  country: string;
  language: string;
  avatar?: string;
  status: 'active' | 'suspended' | 'banned' | 'deleted';
  createdAt: Date;
  lastLogin?: Date;
  twoFactorEnabled: boolean;
  parentalControls?: ParentalControls;
  preferences: AccountPreferences;
}

export interface AccountPreferences {
  privacyLevel: 'public' | 'friends' | 'private';
  showOnlineStatus: boolean;
  allowFriendRequests: boolean;
  allowPartyInvites: boolean;
  allowVoiceChat: boolean;
  language: string;
  notifications: NotificationPreferences;
}

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  inGame: boolean;
  friendRequests: boolean;
  partyInvites: boolean;
  gameInvites: boolean;
  achievements: boolean;
  news: boolean;
}

export interface ParentalControls {
  enabled: boolean;
  maxPlayTimePerDay?: number; // minutes
  allowedRatings: string[]; // ESRB ratings
  allowSocialFeatures: boolean;
  allowPurchases: boolean;
  requireApprovalForFriends: boolean;
}

export interface LinkedAccount {
  linkedId: string;
  accountId: string;
  provider: 'steam' | 'epic' | 'xbox' | 'psn' | 'nintendo' | 'google' | 'apple' | 'twitch' | 'discord';
  providerAccountId: string;
  providerUsername?: string;
  linkedAt: Date;
  lastSync?: Date;
  permissions: string[];
}

export interface AuthSession {
  sessionId: string;
  accountId: string;
  deviceId: string;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  createdAt: Date;
  expiresAt: Date;
  refreshToken: string;
  accessToken: string;
  scope: string[];
}

export interface DeviceInfo {
  platform: 'windows' | 'mac' | 'linux' | 'ios' | 'android' | 'ps5' | 'xbox' | 'switch';
  deviceModel?: string;
  osVersion?: string;
  appVersion: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  deviceId: string;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  twoFactorCode?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  dateOfBirth?: Date;
  country: string;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
}

export interface PasswordResetRequest {
  email: string;
  resetToken?: string;
  newPassword?: string;
}

export interface TwoFactorSetup {
  accountId: string;
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface AccountVerification {
  verificationId: string;
  accountId: string;
  type: 'email' | 'phone';
  code: string;
  expiresAt: Date;
  attempts: number;
}

export interface IdentityEvents {
  'accountCreated': (account: Account) => void;
  'accountLinked': (linkedAccount: LinkedAccount) => void;
  'sessionCreated': (session: AuthSession) => void;
  'sessionExpired': (sessionId: string) => void;
  'twoFactorEnabled': (accountId: string) => void;
  'passwordChanged': (accountId: string) => void;
  'accountSuspended': (accountId: string, reason: string) => void;
}

export class IdentityService extends EventEmitter<IdentityEvents> {
  private accounts: Map<string, Account> = new Map();
  private sessions: Map<string, AuthSession> = new Map();
  private linkedAccounts: Map<string, LinkedAccount[]> = new Map(); // accountId -> linked accounts
  private verifications: Map<string, AccountVerification> = new Map();
  private passwordResets: Map<string, string> = new Map(); // email -> resetToken
  private twoFactorSecrets: Map<string, string> = new Map(); // accountId -> secret

  // Password hashing (simplified - use bcrypt in production)
  private passwords: Map<string, string> = new Map(); // accountId -> hashedPassword

  constructor() {
    super();

    // Clean up expired sessions periodically
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 300000); // Every 5 minutes
  }

  // ==================== Registration ====================

  /**
   * Register new account
   */
  async register(request: RegisterRequest): Promise<Account> {
    // Validate
    if (!request.acceptedTerms || !request.acceptedPrivacy) {
      throw new Error('Must accept terms and privacy policy');
    }

    if (!this.validateEmail(request.email)) {
      throw new Error('Invalid email address');
    }

    if (!this.validatePassword(request.password)) {
      throw new Error('Password must be at least 8 characters with uppercase, lowercase, and numbers');
    }

    // Check if email already exists
    for (const account of this.accounts.values()) {
      if (account.email === request.email) {
        throw new Error('Email already registered');
      }
    }

    const account: Account = {
      accountId: uuidv4(),
      displayName: request.displayName,
      email: request.email,
      emailVerified: false,
      phoneVerified: false,
      dateOfBirth: request.dateOfBirth,
      country: request.country,
      language: 'en',
      status: 'active',
      createdAt: new Date(),
      twoFactorEnabled: false,
      preferences: {
        privacyLevel: 'friends',
        showOnlineStatus: true,
        allowFriendRequests: true,
        allowPartyInvites: true,
        allowVoiceChat: true,
        language: 'en',
        notifications: {
          email: true,
          push: true,
          inGame: true,
          friendRequests: true,
          partyInvites: true,
          gameInvites: true,
          achievements: true,
          news: false,
        },
      },
    };

    this.accounts.set(account.accountId, account);

    // Store hashed password
    this.passwords.set(account.accountId, this.hashPassword(request.password));

    // Send verification email
    this.sendVerificationEmail(account);

    this.emit('accountCreated', account);

    return account;
  }

  // ==================== Authentication ====================

  /**
   * Login
   */
  async login(request: LoginRequest): Promise<AuthSession> {
    // Find account by email
    let account: Account | undefined;

    for (const acc of this.accounts.values()) {
      if (acc.email === request.email) {
        account = acc;
        break;
      }
    }

    if (!account) {
      throw new Error('Invalid credentials');
    }

    // Check password
    const hashedPassword = this.passwords.get(account.accountId);
    if (!hashedPassword || hashedPassword !== this.hashPassword(request.password)) {
      throw new Error('Invalid credentials');
    }

    // Check account status
    if (account.status !== 'active') {
      throw new Error(`Account is ${account.status}`);
    }

    // Check 2FA
    if (account.twoFactorEnabled) {
      if (!request.twoFactorCode) {
        throw new Error('Two-factor authentication code required');
      }

      if (!this.verifyTwoFactorCode(account.accountId, request.twoFactorCode)) {
        throw new Error('Invalid two-factor code');
      }
    }

    // Create session
    const session = this.createSession(account.accountId, request.deviceId, request.deviceInfo, request.ipAddress);

    // Update last login
    account.lastLogin = new Date();

    return session;
  }

  /**
   * Logout
   */
  logout(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Refresh session
   */
  refreshSession(refreshToken: string): AuthSession {
    // Find session by refresh token
    for (const session of this.sessions.values()) {
      if (session.refreshToken === refreshToken) {
        // Create new session
        return this.createSession(
          session.accountId,
          session.deviceId,
          session.deviceInfo,
          session.ipAddress
        );
      }
    }

    throw new Error('Invalid refresh token');
  }

  /**
   * Validate session
   */
  validateSession(accessToken: string): AuthSession | null {
    for (const session of this.sessions.values()) {
      if (session.accessToken === accessToken) {
        if (session.expiresAt > new Date()) {
          return session;
        } else {
          this.sessions.delete(session.sessionId);
          this.emit('sessionExpired', session.sessionId);
          return null;
        }
      }
    }

    return null;
  }

  /**
   * Create session
   */
  private createSession(
    accountId: string,
    deviceId: string,
    deviceInfo: DeviceInfo,
    ipAddress: string
  ): AuthSession {
    const session: AuthSession = {
      sessionId: uuidv4(),
      accountId,
      deviceId,
      deviceInfo,
      ipAddress,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000), // 1 hour
      refreshToken: this.generateToken(),
      accessToken: this.generateToken(),
      scope: ['read', 'write'],
    };

    this.sessions.set(session.sessionId, session);
    this.emit('sessionCreated', session);

    return session;
  }

  // ==================== Account Management ====================

  /**
   * Get account
   */
  getAccount(accountId: string): Account | undefined {
    return this.accounts.get(accountId);
  }

  /**
   * Update account
   */
  updateAccount(accountId: string, updates: Partial<Account>): Account {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    Object.assign(account, updates);
    return account;
  }

  /**
   * Change password
   */
  changePassword(accountId: string, oldPassword: string, newPassword: string): void {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    const hashedOld = this.passwords.get(accountId);
    if (!hashedOld || hashedOld !== this.hashPassword(oldPassword)) {
      throw new Error('Invalid current password');
    }

    if (!this.validatePassword(newPassword)) {
      throw new Error('Password must be at least 8 characters with uppercase, lowercase, and numbers');
    }

    this.passwords.set(accountId, this.hashPassword(newPassword));
    this.emit('passwordChanged', accountId);

    // Invalidate all sessions except current
    for (const [sessionId, session] of this.sessions) {
      if (session.accountId === accountId) {
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Request password reset
   */
  requestPasswordReset(email: string): void {
    // Find account
    let account: Account | undefined;

    for (const acc of this.accounts.values()) {
      if (acc.email === email) {
        account = acc;
        break;
      }
    }

    if (!account) {
      // Don't reveal if email exists
      return;
    }

    const resetToken = this.generateToken();
    this.passwordResets.set(email, resetToken);

    // Would send email with reset link
    console.log(`Password reset token for ${email}: ${resetToken}`);

    // Token expires in 1 hour
    setTimeout(() => {
      this.passwordResets.delete(email);
    }, 3600000);
  }

  /**
   * Reset password
   */
  resetPassword(email: string, resetToken: string, newPassword: string): void {
    const storedToken = this.passwordResets.get(email);
    if (!storedToken || storedToken !== resetToken) {
      throw new Error('Invalid or expired reset token');
    }

    // Find account
    let account: Account | undefined;

    for (const acc of this.accounts.values()) {
      if (acc.email === email) {
        account = acc;
        break;
      }
    }

    if (!account) {
      throw new Error('Account not found');
    }

    if (!this.validatePassword(newPassword)) {
      throw new Error('Password must be at least 8 characters with uppercase, lowercase, and numbers');
    }

    this.passwords.set(account.accountId, this.hashPassword(newPassword));
    this.passwordResets.delete(email);
    this.emit('passwordChanged', account.accountId);
  }

  // ==================== Two-Factor Authentication ====================

  /**
   * Setup 2FA
   */
  setupTwoFactor(accountId: string): TwoFactorSetup {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    const secret = this.generateSecret();
    const backupCodes = this.generateBackupCodes(10);

    this.twoFactorSecrets.set(accountId, secret);

    return {
      accountId,
      secret,
      qrCodeUrl: `otpauth://totp/${account.email}?secret=${secret}&issuer=GamePlatform`,
      backupCodes,
    };
  }

  /**
   * Enable 2FA
   */
  enableTwoFactor(accountId: string, code: string): void {
    if (!this.verifyTwoFactorCode(accountId, code)) {
      throw new Error('Invalid verification code');
    }

    const account = this.accounts.get(accountId);
    if (account) {
      account.twoFactorEnabled = true;
      this.emit('twoFactorEnabled', accountId);
    }
  }

  /**
   * Disable 2FA
   */
  disableTwoFactor(accountId: string, password: string): void {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    const hashedPassword = this.passwords.get(accountId);
    if (!hashedPassword || hashedPassword !== this.hashPassword(password)) {
      throw new Error('Invalid password');
    }

    account.twoFactorEnabled = false;
    this.twoFactorSecrets.delete(accountId);
  }

  /**
   * Verify 2FA code
   */
  private verifyTwoFactorCode(accountId: string, code: string): boolean {
    // Simplified verification - would use TOTP in production
    const secret = this.twoFactorSecrets.get(accountId);
    if (!secret) return false;

    // Mock verification
    return code.length === 6;
  }

  // ==================== Account Linking ====================

  /**
   * Link external account
   */
  linkAccount(
    accountId: string,
    provider: LinkedAccount['provider'],
    providerAccountId: string,
    providerUsername?: string,
    permissions: string[] = []
  ): LinkedAccount {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    let accountLinks = this.linkedAccounts.get(accountId);
    if (!accountLinks) {
      accountLinks = [];
      this.linkedAccounts.set(accountId, accountLinks);
    }

    // Check if already linked
    const existing = accountLinks.find(l => l.provider === provider);
    if (existing) {
      throw new Error(`${provider} account already linked`);
    }

    const linkedAccount: LinkedAccount = {
      linkedId: uuidv4(),
      accountId,
      provider,
      providerAccountId,
      providerUsername,
      linkedAt: new Date(),
      permissions,
    };

    accountLinks.push(linkedAccount);
    this.emit('accountLinked', linkedAccount);

    return linkedAccount;
  }

  /**
   * Unlink external account
   */
  unlinkAccount(accountId: string, provider: LinkedAccount['provider']): void {
    const accountLinks = this.linkedAccounts.get(accountId);
    if (!accountLinks) return;

    const index = accountLinks.findIndex(l => l.provider === provider);
    if (index >= 0) {
      accountLinks.splice(index, 1);
    }
  }

  /**
   * Get linked accounts
   */
  getLinkedAccounts(accountId: string): LinkedAccount[] {
    return this.linkedAccounts.get(accountId) || [];
  }

  // ==================== Verification ====================

  /**
   * Send verification email
   */
  private sendVerificationEmail(account: Account): void {
    const verification: AccountVerification = {
      verificationId: uuidv4(),
      accountId: account.accountId,
      type: 'email',
      code: this.generateVerificationCode(),
      expiresAt: new Date(Date.now() + 3600000), // 1 hour
      attempts: 0,
    };

    this.verifications.set(verification.verificationId, verification);

    // Would send email
    console.log(`Verification code for ${account.email}: ${verification.code}`);
  }

  /**
   * Verify email
   */
  verifyEmail(accountId: string, code: string): boolean {
    for (const verification of this.verifications.values()) {
      if (verification.accountId === accountId && verification.type === 'email') {
        if (verification.expiresAt < new Date()) {
          throw new Error('Verification code expired');
        }

        if (verification.attempts >= 3) {
          throw new Error('Too many attempts');
        }

        if (verification.code === code) {
          const account = this.accounts.get(accountId);
          if (account) {
            account.emailVerified = true;
          }

          this.verifications.delete(verification.verificationId);
          return true;
        }

        verification.attempts++;
        return false;
      }
    }

    throw new Error('Verification not found');
  }

  // ==================== Admin Functions ====================

  /**
   * Suspend account
   */
  suspendAccount(accountId: string, reason: string): void {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    account.status = 'suspended';

    // Invalidate all sessions
    for (const [sessionId, session] of this.sessions) {
      if (session.accountId === accountId) {
        this.sessions.delete(sessionId);
      }
    }

    this.emit('accountSuspended', accountId, reason);
  }

  /**
   * Ban account
   */
  banAccount(accountId: string, reason: string): void {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    account.status = 'banned';

    // Invalidate all sessions
    for (const [sessionId, session] of this.sessions) {
      if (session.accountId === accountId) {
        this.sessions.delete(sessionId);
      }
    }

    this.emit('accountSuspended', accountId, reason);
  }

  // ==================== Utilities ====================

  /**
   * Hash password
   */
  private hashPassword(password: string): string {
    // Simple hash for demo - use bcrypt in production
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  /**
   * Generate token
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate secret
   */
  private generateSecret(): string {
    return crypto.randomBytes(20).toString('base32');
  }

  /**
   * Generate backup codes
   */
  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];

    for (let i = 0; i < count; i++) {
      codes.push(crypto.randomBytes(4).toString('hex'));
    }

    return codes;
  }

  /**
   * Generate verification code
   */
  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Validate email
   */
  private validateEmail(email: string): boolean {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  /**
   * Validate password
   */
  private validatePassword(password: string): boolean {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
    const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    return re.test(password);
  }

  /**
   * Cleanup expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();

    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt < now) {
        this.sessions.delete(sessionId);
        this.emit('sessionExpired', sessionId);
      }
    }
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalAccounts: number;
    activeAccounts: number;
    verifiedAccounts: number;
    activeSessions: number;
    linkedAccounts: number;
    twoFactorEnabled: number;
  } {
    const activeAccounts = Array.from(this.accounts.values())
      .filter(a => a.status === 'active').length;

    const verifiedAccounts = Array.from(this.accounts.values())
      .filter(a => a.emailVerified).length;

    let linkedAccountsCount = 0;
    for (const links of this.linkedAccounts.values()) {
      linkedAccountsCount += links.length;
    }

    const twoFactorEnabled = Array.from(this.accounts.values())
      .filter(a => a.twoFactorEnabled).length;

    return {
      totalAccounts: this.accounts.size,
      activeAccounts,
      verifiedAccounts,
      activeSessions: this.sessions.size,
      linkedAccounts: linkedAccountsCount,
      twoFactorEnabled,
    };
  }
}
