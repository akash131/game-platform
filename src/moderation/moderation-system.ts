/**
 * Content Moderation System
 *
 * Discord / Twitch / Reddit-style moderation and community safety
 *
 * Features:
 * - Automated content filtering (profanity, toxicity)
 * - User reporting and flagging
 * - Moderation queue and review
 * - Ban and mute system
 * - Warning and strike system
 * - Appeal process
 * - Automated moderation (AutoMod)
 * - Moderation logs and audit trail
 * - Community guidelines enforcement
 * - AI-powered toxicity detection
 * - Image and link filtering
 * - Spam detection
 */

import { EventEmitter } from 'eventemitter3';

export enum ModerationAction {
  WARN = 'warn',
  MUTE = 'mute',
  KICK = 'kick',
  BAN = 'ban',
  DELETE_CONTENT = 'delete_content',
  RESTRICT_FEATURES = 'restrict_features',
}

export enum ReportReason {
  HARASSMENT = 'harassment',
  HATE_SPEECH = 'hate_speech',
  SPAM = 'spam',
  NSFW_CONTENT = 'nsfw_content',
  CHEATING = 'cheating',
  IMPERSONATION = 'impersonation',
  THREATS = 'threats',
  DOXXING = 'doxxing',
  SELF_HARM = 'self_harm',
  UNDERAGE = 'underage',
  COPYRIGHT = 'copyright',
  OTHER = 'other',
}

export enum ContentType {
  CHAT_MESSAGE = 'chat_message',
  USERNAME = 'username',
  USER_BIO = 'user_bio',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  LINK = 'link',
  UGC = 'ugc', // User-generated content
}

export enum ModerationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ESCALATED = 'escalated',
}

export enum AppealStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  IN_REVIEW = 'in_review',
}

export interface ModerationRule {
  ruleId: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';

  // Conditions
  conditions: RuleCondition[];

  // Actions
  actions: AutoModAction[];

  // Exemptions
  exemptRoles?: string[];
  exemptUsers?: string[];

  // Stats
  triggeredCount: number;
  lastTriggered?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export interface RuleCondition {
  type: 'keyword' | 'regex' | 'link' | 'caps' | 'spam' | 'mention_spam' | 'toxicity_score';
  value: any;
  options?: {
    caseSensitive?: boolean;
    wholeWord?: boolean;
    threshold?: number;
  };
}

export interface AutoModAction {
  type: ModerationAction;
  duration?: number; // For mute/ban in milliseconds
  reason: string;
  notifyUser: boolean;
  notifyModerators: boolean;
}

export interface Report {
  reportId: string;
  reporterId: string;
  reportedUserId: string;
  reason: ReportReason;
  category: ContentType;
  description: string;

  // Evidence
  contentId?: string;
  contentSnapshot?: string; // Screenshot/copy of content
  additionalContext?: string;
  attachments?: string[];

  // Status
  status: ModerationStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';

  // Review
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  actionTaken?: ModerationAction;

  createdAt: Date;
  updatedAt: Date;
}

export interface ModerationCase {
  caseId: string;
  userId: string;
  moderatorId: string;
  action: ModerationAction;
  reason: string;
  details?: string;

  // Duration (for temporary actions)
  duration?: number;
  expiresAt?: Date;

  // Related
  reportIds: string[];
  evidenceUrls: string[];

  // Status
  isActive: boolean;
  wasAppealed: boolean;
  appealId?: string;

  createdAt: Date;
  revokedAt?: Date;
}

export interface UserStrike {
  strikeId: string;
  userId: string;
  moderatorId: string;
  reason: string;
  severity: 'minor' | 'major' | 'severe';
  caseId: string;

  // Expiration
  expiresAt?: Date;
  isActive: boolean;

  createdAt: Date;
}

export interface Appeal {
  appealId: string;
  userId: string;
  caseId: string;
  message: string;
  evidence?: string[];

  status: AppealStatus;

  // Review
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  decision?: 'overturn' | 'uphold' | 'modify';

  createdAt: Date;
  updatedAt: Date;
}

export interface ModerationLog {
  logId: string;
  moderatorId: string;
  action: string;
  targetUserId?: string;
  details: Record<string, any>;
  timestamp: Date;
}

export interface ToxicityScore {
  contentId: string;
  content: string;
  score: number; // 0-1
  categories: {
    toxicity: number;
    severeToxicity: number;
    identityAttack: number;
    insult: number;
    profanity: number;
    threat: number;
  };
  flagged: boolean;
  timestamp: Date;
}

export interface FilteredContent {
  contentId: string;
  originalContent: string;
  filteredContent: string;
  matchedWords: string[];
  filterType: 'profanity' | 'slur' | 'spam' | 'link' | 'custom';
  action: 'censor' | 'block' | 'flag';
  timestamp: Date;
}

export interface ModerationStats {
  totalReports: number;
  pendingReports: number;
  approvedReports: number;
  rejectedReports: number;

  totalBans: number;
  activeBans: number;
  appealedBans: number;

  totalWarnings: number;
  activeStrikes: number;

  autoModTriggered: number;
  manualActions: number;

  averageResponseTime: number; // milliseconds

  reportsByReason: Map<ReportReason, number>;
  actionsByType: Map<ModerationAction, number>;
}

interface ModerationEvents {
  'report:submitted': (report: Report) => void;
  'report:reviewed': (report: Report) => void;
  'case:created': (moderationCase: ModerationCase) => void;
  'user:warned': (userId: string, case: ModerationCase) => void;
  'user:muted': (userId: string, case: ModerationCase) => void;
  'user:banned': (userId: string, case: ModerationCase) => void;
  'strike:added': (strike: UserStrike) => void;
  'appeal:submitted': (appeal: Appeal) => void;
  'appeal:decided': (appeal: Appeal) => void;
  'content:filtered': (filtered: FilteredContent) => void;
  'automod:triggered': (rule: ModerationRule, userId: string) => void;
}

/**
 * ModerationSystem
 *
 * Comprehensive content moderation and community safety system
 */
export class ModerationSystem extends EventEmitter<ModerationEvents> {
  private rules: Map<string, ModerationRule> = new Map();
  private reports: Map<string, Report> = new Map();
  private cases: Map<string, ModerationCase> = new Map();
  private strikes: Map<string, UserStrike[]> = new Map(); // userId -> strikes
  private appeals: Map<string, Appeal> = new Map();
  private logs: ModerationLog[] = [];
  private bannedUsers: Set<string> = new Set();
  private mutedUsers: Map<string, Date> = new Map(); // userId -> expires at

  // Filters
  private profanityList: Set<string> = new Set();
  private slurList: Set<string> = new Set();
  private bannedLinks: Set<string> = new Set();

  constructor() {
    super();
    this.initializeDefaultRules();
    this.initializeFilters();
    this.startMaintenanceTasks();
  }

  /**
   * Create moderation rule
   */
  createRule(
    name: string,
    description: string,
    conditions: RuleCondition[],
    actions: AutoModAction[],
    options?: {
      severity?: 'low' | 'medium' | 'high' | 'critical';
      exemptRoles?: string[];
      exemptUsers?: string[];
    }
  ): ModerationRule {
    const rule: ModerationRule = {
      ruleId: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      enabled: true,
      severity: options?.severity || 'medium',
      conditions,
      actions,
      exemptRoles: options?.exemptRoles,
      exemptUsers: options?.exemptUsers,
      triggeredCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.rules.set(rule.ruleId, rule);
    return rule;
  }

  /**
   * Check content against moderation rules
   */
  async moderateContent(
    content: string,
    userId: string,
    contentType: ContentType,
    options?: {
      contentId?: string;
      userRoles?: string[];
    }
  ): Promise<{
    allowed: boolean;
    filtered?: string;
    triggeredRules: ModerationRule[];
    toxicityScore?: ToxicityScore;
  }> {
    const triggeredRules: ModerationRule[] = [];

    // Check each rule
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      // Check exemptions
      if (rule.exemptUsers?.includes(userId)) continue;
      if (rule.exemptRoles && options?.userRoles?.some(r => rule.exemptRoles!.includes(r))) {
        continue;
      }

      // Evaluate conditions
      if (this.evaluateRule(rule, content, userId)) {
        triggeredRules.push(rule);
        rule.triggeredCount++;
        rule.lastTriggered = new Date();

        this.emit('automod:triggered', rule, userId);

        // Execute actions
        for (const action of rule.actions) {
          await this.executeAutoModAction(userId, action, rule);
        }
      }
    }

    // Calculate toxicity score
    const toxicityScore = await this.calculateToxicity(content, options?.contentId);

    // Filter profanity
    const filtered = this.filterProfanity(content);

    return {
      allowed: triggeredRules.length === 0 && !toxicityScore.flagged,
      filtered: filtered.filteredContent,
      triggeredRules,
      toxicityScore,
    };
  }

  /**
   * Submit report
   */
  submitReport(
    reporterId: string,
    reportedUserId: string,
    reason: ReportReason,
    category: ContentType,
    description: string,
    options?: {
      contentId?: string;
      contentSnapshot?: string;
      additionalContext?: string;
      attachments?: string[];
    }
  ): Report {
    const report: Report = {
      reportId: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      reporterId,
      reportedUserId,
      reason,
      category,
      description,
      contentId: options?.contentId,
      contentSnapshot: options?.contentSnapshot,
      additionalContext: options?.additionalContext,
      attachments: options?.attachments,
      status: ModerationStatus.PENDING,
      priority: this.calculateReportPriority(reason),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.reports.set(report.reportId, report);
    this.emit('report:submitted', report);

    // Auto-escalate critical reports
    if (report.priority === 'urgent') {
      report.status = ModerationStatus.ESCALATED;
    }

    return report;
  }

  /**
   * Review report
   */
  reviewReport(
    reportId: string,
    moderatorId: string,
    decision: ModerationStatus,
    options?: {
      notes?: string;
      action?: ModerationAction;
      actionDuration?: number;
    }
  ): Report {
    const report = this.reports.get(reportId);
    if (!report) throw new Error('Report not found');

    report.status = decision;
    report.reviewedBy = moderatorId;
    report.reviewedAt = new Date();
    report.reviewNotes = options?.notes;
    report.actionTaken = options?.action;
    report.updatedAt = new Date();

    // Take action if approved
    if (decision === ModerationStatus.APPROVED && options?.action) {
      this.takeAction(
        report.reportedUserId,
        moderatorId,
        options.action,
        report.reason,
        {
          duration: options.actionDuration,
          reportId,
        }
      );
    }

    this.emit('report:reviewed', report);
    this.logAction(moderatorId, 'review_report', report.reportedUserId, { reportId, decision });

    return report;
  }

  /**
   * Take moderation action
   */
  takeAction(
    userId: string,
    moderatorId: string,
    action: ModerationAction,
    reason: string,
    options?: {
      duration?: number;
      details?: string;
      reportId?: string;
      evidence?: string[];
    }
  ): ModerationCase {
    const moderationCase: ModerationCase = {
      caseId: `case_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      moderatorId,
      action,
      reason,
      details: options?.details,
      duration: options?.duration,
      expiresAt: options?.duration ? new Date(Date.now() + options.duration) : undefined,
      reportIds: options?.reportId ? [options.reportId] : [],
      evidenceUrls: options?.evidence || [],
      isActive: true,
      wasAppealed: false,
      createdAt: new Date(),
    };

    this.cases.set(moderationCase.caseId, moderationCase);

    // Execute action
    switch (action) {
      case ModerationAction.WARN:
        this.warnUser(userId, moderationCase);
        break;
      case ModerationAction.MUTE:
        this.muteUser(userId, moderationCase);
        break;
      case ModerationAction.BAN:
        this.banUser(userId, moderationCase);
        break;
      case ModerationAction.KICK:
        // Implementation depends on your session management
        break;
    }

    this.emit('case:created', moderationCase);
    this.logAction(moderatorId, `action_${action}`, userId, { caseId: moderationCase.caseId, reason });

    return moderationCase;
  }

  /**
   * Warn user
   */
  private warnUser(userId: string, moderationCase: ModerationCase): void {
    const strike: UserStrike = {
      strikeId: `strike_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      moderatorId: moderationCase.moderatorId,
      reason: moderationCase.reason,
      severity: 'minor',
      caseId: moderationCase.caseId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      isActive: true,
      createdAt: new Date(),
    };

    if (!this.strikes.has(userId)) {
      this.strikes.set(userId, []);
    }
    this.strikes.get(userId)!.push(strike);

    this.emit('user:warned', userId, moderationCase);
    this.emit('strike:added', strike);

    // Auto-escalate if too many strikes
    const activeStrikes = this.getActiveStrikes(userId).length;
    if (activeStrikes >= 3) {
      this.takeAction(
        userId,
        moderationCase.moderatorId,
        ModerationAction.BAN,
        'Excessive violations (3+ strikes)',
        { duration: 7 * 24 * 60 * 60 * 1000 } // 7 days
      );
    }
  }

  /**
   * Mute user
   */
  private muteUser(userId: string, moderationCase: ModerationCase): void {
    const expiresAt = moderationCase.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000);
    this.mutedUsers.set(userId, expiresAt);
    this.emit('user:muted', userId, moderationCase);
  }

  /**
   * Ban user
   */
  private banUser(userId: string, moderationCase: ModerationCase): void {
    this.bannedUsers.add(userId);
    this.emit('user:banned', userId, moderationCase);
  }

  /**
   * Submit appeal
   */
  submitAppeal(
    userId: string,
    caseId: string,
    message: string,
    evidence?: string[]
  ): Appeal {
    const moderationCase = this.cases.get(caseId);
    if (!moderationCase) throw new Error('Case not found');
    if (moderationCase.userId !== userId) throw new Error('Not authorized');

    const appeal: Appeal = {
      appealId: `appeal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      caseId,
      message,
      evidence,
      status: AppealStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.appeals.set(appeal.appealId, appeal);
    moderationCase.wasAppealed = true;
    moderationCase.appealId = appeal.appealId;

    this.emit('appeal:submitted', appeal);
    return appeal;
  }

  /**
   * Review appeal
   */
  reviewAppeal(
    appealId: string,
    moderatorId: string,
    decision: 'overturn' | 'uphold' | 'modify',
    notes?: string
  ): Appeal {
    const appeal = this.appeals.get(appealId);
    if (!appeal) throw new Error('Appeal not found');

    appeal.status = decision === 'overturn' ? AppealStatus.APPROVED : AppealStatus.REJECTED;
    appeal.reviewedBy = moderatorId;
    appeal.reviewedAt = new Date();
    appeal.reviewNotes = notes;
    appeal.decision = decision;
    appeal.updatedAt = new Date();

    // Execute decision
    const moderationCase = this.cases.get(appeal.caseId);
    if (moderationCase) {
      if (decision === 'overturn') {
        this.revokeCase(appeal.caseId, moderatorId);
      }
    }

    this.emit('appeal:decided', appeal);
    this.logAction(moderatorId, 'review_appeal', appeal.userId, { appealId, decision });

    return appeal;
  }

  /**
   * Revoke moderation case
   */
  revokeCase(caseId: string, moderatorId: string): void {
    const moderationCase = this.cases.get(caseId);
    if (!moderationCase) return;

    moderationCase.isActive = false;
    moderationCase.revokedAt = new Date();

    // Undo actions
    switch (moderationCase.action) {
      case ModerationAction.BAN:
        this.bannedUsers.delete(moderationCase.userId);
        break;
      case ModerationAction.MUTE:
        this.mutedUsers.delete(moderationCase.userId);
        break;
    }

    this.logAction(moderatorId, 'revoke_case', moderationCase.userId, { caseId });
  }

  /**
   * Check if user is banned
   */
  isUserBanned(userId: string): boolean {
    return this.bannedUsers.has(userId);
  }

  /**
   * Check if user is muted
   */
  isUserMuted(userId: string): boolean {
    const muteExpiry = this.mutedUsers.get(userId);
    if (!muteExpiry) return false;

    if (muteExpiry < new Date()) {
      this.mutedUsers.delete(userId);
      return false;
    }

    return true;
  }

  /**
   * Get active strikes for user
   */
  getActiveStrikes(userId: string): UserStrike[] {
    const strikes = this.strikes.get(userId) || [];
    const now = new Date();

    return strikes.filter(s => {
      if (!s.isActive) return false;
      if (s.expiresAt && s.expiresAt < now) {
        s.isActive = false;
        return false;
      }
      return true;
    });
  }

  /**
   * Get pending reports
   */
  getPendingReports(options?: {
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    reason?: ReportReason;
    limit?: number;
  }): Report[] {
    let reports = Array.from(this.reports.values())
      .filter(r => r.status === ModerationStatus.PENDING);

    if (options?.priority) {
      reports = reports.filter(r => r.priority === options.priority);
    }

    if (options?.reason) {
      reports = reports.filter(r => r.reason === options.reason);
    }

    reports.sort((a, b) => {
      const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    if (options?.limit) {
      reports = reports.slice(0, options.limit);
    }

    return reports;
  }

  /**
   * Get moderation stats
   */
  getStats(): ModerationStats {
    const reports = Array.from(this.reports.values());
    const cases = Array.from(this.cases.values());

    const reportsByReason = new Map<ReportReason, number>();
    const actionsByType = new Map<ModerationAction, number>();

    for (const report of reports) {
      reportsByReason.set(report.reason, (reportsByReason.get(report.reason) || 0) + 1);
    }

    for (const moderationCase of cases) {
      actionsByType.set(moderationCase.action, (actionsByType.get(moderationCase.action) || 0) + 1);
    }

    // Calculate average response time
    const reviewedReports = reports.filter(r => r.reviewedAt);
    const responseTimes = reviewedReports.map(r =>
      r.reviewedAt!.getTime() - r.createdAt.getTime()
    );
    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    let activeStrikes = 0;
    for (const strikes of this.strikes.values()) {
      activeStrikes += strikes.filter(s => s.isActive).length;
    }

    return {
      totalReports: reports.length,
      pendingReports: reports.filter(r => r.status === ModerationStatus.PENDING).length,
      approvedReports: reports.filter(r => r.status === ModerationStatus.APPROVED).length,
      rejectedReports: reports.filter(r => r.status === ModerationStatus.REJECTED).length,
      totalBans: cases.filter(c => c.action === ModerationAction.BAN).length,
      activeBans: cases.filter(c => c.action === ModerationAction.BAN && c.isActive).length,
      appealedBans: cases.filter(c => c.action === ModerationAction.BAN && c.wasAppealed).length,
      totalWarnings: cases.filter(c => c.action === ModerationAction.WARN).length,
      activeStrikes,
      autoModTriggered: Array.from(this.rules.values()).reduce((sum, r) => sum + r.triggeredCount, 0),
      manualActions: cases.filter(c => c.reportIds.length > 0).length,
      averageResponseTime,
      reportsByReason,
      actionsByType,
    };
  }

  // Private helper methods

  private evaluateRule(rule: ModerationRule, content: string, userId: string): boolean {
    for (const condition of rule.conditions) {
      if (!this.evaluateCondition(condition, content, userId)) {
        return false;
      }
    }
    return true;
  }

  private evaluateCondition(condition: RuleCondition, content: string, userId: string): boolean {
    switch (condition.type) {
      case 'keyword':
        return this.checkKeyword(content, condition.value, condition.options);
      case 'regex':
        return new RegExp(condition.value).test(content);
      case 'caps':
        return this.checkCaps(content, condition.options?.threshold || 0.7);
      case 'spam':
        return this.checkSpam(content);
      case 'link':
        return this.checkLinks(content);
      default:
        return false;
    }
  }

  private checkKeyword(content: string, keyword: string, options?: RuleCondition['options']): boolean {
    let text = content;
    let term = keyword;

    if (!options?.caseSensitive) {
      text = text.toLowerCase();
      term = term.toLowerCase();
    }

    if (options?.wholeWord) {
      const regex = new RegExp(`\\b${term}\\b`);
      return regex.test(text);
    }

    return text.includes(term);
  }

  private checkCaps(content: string, threshold: number): boolean {
    const letters = content.replace(/[^a-zA-Z]/g, '');
    if (letters.length < 5) return false;

    const caps = content.replace(/[^A-Z]/g, '');
    return caps.length / letters.length > threshold;
  }

  private checkSpam(content: string): boolean {
    // Simple spam detection - repeated characters
    const repeatedPattern = /(.)\1{4,}/;
    return repeatedPattern.test(content);
  }

  private checkLinks(content: string): boolean {
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const matches = content.match(urlPattern);
    if (!matches) return false;

    // Check against banned links
    for (const url of matches) {
      for (const bannedLink of this.bannedLinks) {
        if (url.includes(bannedLink)) {
          return true;
        }
      }
    }

    return false;
  }

  private async executeAutoModAction(userId: string, action: AutoModAction, rule: ModerationRule): Promise<void> {
    this.takeAction(
      userId,
      'system',
      action.type,
      `AutoMod: ${action.reason}`,
      {
        duration: action.duration,
        details: `Triggered by rule: ${rule.name}`,
      }
    );
  }

  private async calculateToxicity(content: string, contentId?: string): Promise<ToxicityScore> {
    // Simplified toxicity calculation (in real app, use ML model like Perspective API)
    const profanityCount = Array.from(this.profanityList).filter(word =>
      content.toLowerCase().includes(word)
    ).length;

    const slurCount = Array.from(this.slurList).filter(word =>
      content.toLowerCase().includes(word)
    ).length;

    const toxicityScore = Math.min((profanityCount * 0.2 + slurCount * 0.5), 1.0);

    const score: ToxicityScore = {
      contentId: contentId || `content_${Date.now()}`,
      content,
      score: toxicityScore,
      categories: {
        toxicity: toxicityScore,
        severeToxicity: slurCount > 0 ? 0.8 : 0,
        identityAttack: 0,
        insult: profanityCount > 0 ? 0.5 : 0,
        profanity: profanityCount > 0 ? 0.7 : 0,
        threat: 0,
      },
      flagged: toxicityScore > 0.5,
      timestamp: new Date(),
    };

    return score;
  }

  private filterProfanity(content: string): FilteredContent {
    let filteredContent = content;
    const matchedWords: string[] = [];

    for (const word of this.profanityList) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      if (regex.test(filteredContent)) {
        matchedWords.push(word);
        filteredContent = filteredContent.replace(regex, '*'.repeat(word.length));
      }
    }

    return {
      contentId: `filtered_${Date.now()}`,
      originalContent: content,
      filteredContent,
      matchedWords,
      filterType: 'profanity',
      action: matchedWords.length > 0 ? 'censor' : 'block',
      timestamp: new Date(),
    };
  }

  private calculateReportPriority(reason: ReportReason): 'low' | 'normal' | 'high' | 'urgent' {
    const urgentReasons = [ReportReason.THREATS, ReportReason.DOXXING, ReportReason.SELF_HARM];
    const highReasons = [ReportReason.HATE_SPEECH, ReportReason.HARASSMENT];

    if (urgentReasons.includes(reason)) return 'urgent';
    if (highReasons.includes(reason)) return 'high';
    return 'normal';
  }

  private logAction(moderatorId: string, action: string, targetUserId?: string, details?: Record<string, any>): void {
    this.logs.push({
      logId: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      moderatorId,
      action,
      targetUserId,
      details: details || {},
      timestamp: new Date(),
    });
  }

  private initializeDefaultRules(): void {
    // Profanity filter
    this.createRule(
      'Profanity Filter',
      'Automatically filter profane language',
      [{ type: 'keyword', value: 'profanity_check' }],
      [{ type: ModerationAction.DELETE_CONTENT, reason: 'Profane language', notifyUser: false, notifyModerators: false }],
      { severity: 'low' }
    );

    // Spam detection
    this.createRule(
      'Spam Detection',
      'Detect and remove spam messages',
      [{ type: 'spam', value: true }],
      [
        { type: ModerationAction.DELETE_CONTENT, reason: 'Spam detected', notifyUser: false, notifyModerators: true },
        { type: ModerationAction.MUTE, duration: 5 * 60 * 1000, reason: 'Spamming', notifyUser: true, notifyModerators: false }
      ],
      { severity: 'medium' }
    );
  }

  private initializeFilters(): void {
    // Add common profanity (simplified list)
    this.profanityList.add('damn');
    this.profanityList.add('hell');
    // In real app, load comprehensive list

    // Add slurs/hate speech (very simplified)
    // In real app, load comprehensive list with context awareness
  }

  private startMaintenanceTasks(): void {
    // Clean up expired mutes and strikes every hour
    setInterval(() => {
      const now = new Date();

      // Clean up mutes
      for (const [userId, expiresAt] of this.mutedUsers.entries()) {
        if (expiresAt < now) {
          this.mutedUsers.delete(userId);
        }
      }

      // Clean up strikes
      for (const strikes of this.strikes.values()) {
        for (const strike of strikes) {
          if (strike.expiresAt && strike.expiresAt < now && strike.isActive) {
            strike.isActive = false;
          }
        }
      }

      // Clean up temporary bans
      for (const moderationCase of this.cases.values()) {
        if (
          moderationCase.action === ModerationAction.BAN &&
          moderationCase.isActive &&
          moderationCase.expiresAt &&
          moderationCase.expiresAt < now
        ) {
          this.revokeCase(moderationCase.caseId, 'system');
        }
      }
    }, 60 * 60 * 1000); // Every hour
  }
}
