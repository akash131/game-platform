/**
 * Guild/Clan Management System
 *
 * World of Warcraft / Destiny / Discord-style guild and clan management
 *
 * Features:
 * - Guild creation and customization
 * - Hierarchical ranks and permissions
 * - Member management and roles
 * - Guild bank and treasury
 * - Guild events and calendar
 * - Guild chat and announcements
 * - Guild progression and perks
 * - Guild wars and alliances
 * - Guild statistics and leaderboards
 * - Guild recruitment
 */

import { EventEmitter } from 'eventemitter3';

export enum GuildPermission {
  INVITE_MEMBERS = 'invite_members',
  KICK_MEMBERS = 'kick_members',
  PROMOTE_MEMBERS = 'promote_members',
  DEMOTE_MEMBERS = 'demote_members',
  MANAGE_RANKS = 'manage_ranks',
  EDIT_GUILD_INFO = 'edit_guild_info',
  MANAGE_BANK = 'manage_bank',
  WITHDRAW_BANK = 'withdraw_bank',
  CREATE_EVENTS = 'create_events',
  SEND_ANNOUNCEMENTS = 'send_announcements',
  MANAGE_ALLIANCES = 'manage_alliances',
  DECLARE_WAR = 'declare_war',
  DISBAND_GUILD = 'disband_guild',
}

export interface Guild {
  guildId: string;
  name: string;
  tag: string; // Short guild tag (e.g., "EPIC")
  description: string;
  motto?: string;
  iconUrl?: string;
  bannerUrl?: string;
  founderId: string;
  foundedAt: Date;

  // Settings
  isPublic: boolean;
  requiresApproval: boolean;
  minimumLevel?: number;
  language?: string;
  region?: string;
  timeZone?: string;

  // Stats
  memberCount: number;
  maxMembers: number;
  level: number;
  experience: number;
  experienceToNextLevel: number;

  // Progression
  perks: GuildPerk[];
  achievements: GuildAchievement[];

  // Treasury
  treasury: Map<string, number>; // currency -> amount

  // Status
  status: 'active' | 'recruiting' | 'inactive' | 'disbanded';

  createdAt: Date;
  updatedAt: Date;
}

export interface GuildRank {
  rankId: string;
  guildId: string;
  name: string;
  level: number; // 0 = leader, higher = lower rank
  permissions: GuildPermission[];
  canInvite: boolean;
  bankQuota?: number; // Daily withdrawal limit
  color?: string; // Display color
  memberCount: number;
}

export interface GuildMember {
  userId: string;
  guildId: string;
  rankId: string;
  nickname?: string;
  joinedAt: Date;
  lastSeen: Date;
  contribution: {
    experience: number;
    donations: Map<string, number>;
    eventsAttended: number;
    warsParticipated: number;
  };
  notes?: string; // Officer notes
  status: 'active' | 'away' | 'inactive';
}

export interface GuildInvitation {
  invitationId: string;
  guildId: string;
  inviterId: string;
  inviteeId: string;
  message?: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: Date;
  expiresAt: Date;
}

export interface GuildApplication {
  applicationId: string;
  guildId: string;
  applicantId: string;
  message: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
}

export interface GuildEvent {
  eventId: string;
  guildId: string;
  creatorId: string;
  name: string;
  description: string;
  type: 'raid' | 'pvp' | 'social' | 'tournament' | 'training' | 'other';
  startTime: Date;
  endTime: Date;
  location?: string;
  maxParticipants?: number;
  participants: EventParticipant[];
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  createdAt: Date;
}

export interface EventParticipant {
  userId: string;
  status: 'confirmed' | 'tentative' | 'declined';
  role?: string; // e.g., "tank", "healer", "dps"
  joinedAt: Date;
}

export interface GuildAnnouncement {
  announcementId: string;
  guildId: string;
  authorId: string;
  title: string;
  content: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface GuildPerk {
  perkId: string;
  name: string;
  description: string;
  level: number; // Guild level required
  icon?: string;
  effects: PerkEffect[];
  isUnlocked: boolean;
  unlockedAt?: Date;
}

export interface PerkEffect {
  type: 'experience_boost' | 'resource_bonus' | 'stat_bonus' | 'special_ability' | 'cosmetic';
  value: number;
  description: string;
}

export interface GuildAchievement {
  achievementId: string;
  name: string;
  description: string;
  icon?: string;
  points: number;
  isCompleted: boolean;
  completedAt?: Date;
  progress?: {
    current: number;
    required: number;
  };
}

export interface GuildWar {
  warId: string;
  attackingGuildId: string;
  defendingGuildId: string;
  startTime: Date;
  endTime: Date;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  score: {
    attacking: number;
    defending: number;
  };
  prizes: {
    winner: WarPrize[];
    loser: WarPrize[];
  };
  history: WarEvent[];
}

export interface WarPrize {
  type: 'currency' | 'item' | 'experience' | 'perk';
  value: number;
  description: string;
}

export interface WarEvent {
  timestamp: Date;
  type: 'kill' | 'objective' | 'bonus';
  guildId: string;
  playerId: string;
  points: number;
  description: string;
}

export interface GuildAlliance {
  allianceId: string;
  guild1Id: string;
  guild2Id: string;
  status: 'pending' | 'active' | 'broken';
  proposedBy: string;
  acceptedBy?: string;
  createdAt: Date;
  acceptedAt?: Date;
  benefits: {
    sharedChat: boolean;
    sharedEvents: boolean;
    tradingBonus: number;
  };
}

export interface GuildBankTab {
  tabId: string;
  guildId: string;
  name: string;
  icon?: string;
  items: BankItem[];
  permissions: {
    rankId: string;
    canView: boolean;
    canDeposit: boolean;
    canWithdraw: boolean;
    dailyWithdrawLimit?: number;
  }[];
}

export interface BankItem {
  itemId: string;
  quantity: number;
  depositedBy: string;
  depositedAt: Date;
}

export interface GuildStats {
  totalMembers: number;
  activeMembers: number; // Active in last 7 days
  totalExperience: number;
  level: number;

  achievements: {
    total: number;
    completed: number;
  };

  pvp: {
    wins: number;
    losses: number;
    winRate: number;
  };

  wars: {
    won: number;
    lost: number;
    winRate: number;
  };

  events: {
    total: number;
    completed: number;
    averageAttendance: number;
  };

  treasury: {
    totalDonations: number;
    totalWithdrawals: number;
    currentBalance: number;
  };

  rankings: {
    global: number;
    regional: number;
    category: Map<string, number>;
  };
}

interface GuildEvents {
  'guild:created': (guild: Guild) => void;
  'guild:updated': (guild: Guild) => void;
  'guild:disbanded': (guild: Guild) => void;
  'member:joined': (member: GuildMember) => void;
  'member:left': (member: GuildMember) => void;
  'member:promoted': (member: GuildMember, newRank: GuildRank) => void;
  'member:demoted': (member: GuildMember, newRank: GuildRank) => void;
  'rank:created': (rank: GuildRank) => void;
  'rank:updated': (rank: GuildRank) => void;
  'event:created': (event: GuildEvent) => void;
  'event:started': (event: GuildEvent) => void;
  'event:completed': (event: GuildEvent) => void;
  'announcement:posted': (announcement: GuildAnnouncement) => void;
  'perk:unlocked': (perk: GuildPerk) => void;
  'achievement:completed': (achievement: GuildAchievement) => void;
  'war:declared': (war: GuildWar) => void;
  'war:ended': (war: GuildWar) => void;
  'alliance:formed': (alliance: GuildAlliance) => void;
  'alliance:broken': (alliance: GuildAlliance) => void;
  'level:up': (guild: Guild, newLevel: number) => void;
}

/**
 * GuildSystem
 *
 * Comprehensive guild/clan management system
 */
export class GuildSystem extends EventEmitter<GuildEvents> {
  private guilds: Map<string, Guild> = new Map();
  private members: Map<string, GuildMember[]> = new Map(); // guildId -> members
  private userGuilds: Map<string, string> = new Map(); // userId -> guildId
  private ranks: Map<string, GuildRank[]> = new Map(); // guildId -> ranks
  private invitations: Map<string, GuildInvitation> = new Map();
  private applications: Map<string, GuildApplication> = new Map();
  private events: Map<string, GuildEvent> = new Map();
  private announcements: Map<string, GuildAnnouncement[]> = new Map();
  private wars: Map<string, GuildWar> = new Map();
  private alliances: Map<string, GuildAlliance[]> = new Map();
  private bankTabs: Map<string, GuildBankTab[]> = new Map();

  constructor() {
    super();
  }

  /**
   * Create new guild
   */
  createGuild(
    founderId: string,
    name: string,
    tag: string,
    options?: {
      description?: string;
      motto?: string;
      iconUrl?: string;
      bannerUrl?: string;
      isPublic?: boolean;
      requiresApproval?: boolean;
      minimumLevel?: number;
      maxMembers?: number;
    }
  ): Guild {
    // Check if user is already in a guild
    if (this.userGuilds.has(founderId)) {
      throw new Error('User is already in a guild');
    }

    // Check if guild name or tag is taken
    for (const guild of this.guilds.values()) {
      if (guild.name.toLowerCase() === name.toLowerCase()) {
        throw new Error('Guild name is already taken');
      }
      if (guild.tag.toLowerCase() === tag.toLowerCase()) {
        throw new Error('Guild tag is already taken');
      }
    }

    const guild: Guild = {
      guildId: `guild_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      tag,
      description: options?.description || '',
      motto: options?.motto,
      iconUrl: options?.iconUrl,
      bannerUrl: options?.bannerUrl,
      founderId,
      foundedAt: new Date(),
      isPublic: options?.isPublic ?? true,
      requiresApproval: options?.requiresApproval ?? false,
      minimumLevel: options?.minimumLevel,
      memberCount: 1,
      maxMembers: options?.maxMembers || 100,
      level: 1,
      experience: 0,
      experienceToNextLevel: 1000,
      perks: this.getAvailablePerks(),
      achievements: this.getAvailableAchievements(),
      treasury: new Map([['gold', 0]]),
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.guilds.set(guild.guildId, guild);

    // Create default ranks
    this.createDefaultRanks(guild.guildId);

    // Add founder as member with leader rank
    const leaderRank = this.ranks.get(guild.guildId)![0];
    const founderMember: GuildMember = {
      userId: founderId,
      guildId: guild.guildId,
      rankId: leaderRank.rankId,
      joinedAt: new Date(),
      lastSeen: new Date(),
      contribution: {
        experience: 0,
        donations: new Map(),
        eventsAttended: 0,
        warsParticipated: 0,
      },
      status: 'active',
    };

    this.members.set(guild.guildId, [founderMember]);
    this.userGuilds.set(founderId, guild.guildId);

    // Create default bank tabs
    this.createDefaultBankTabs(guild.guildId);

    this.emit('guild:created', guild);
    return guild;
  }

  /**
   * Disband guild
   */
  disbandGuild(guildId: string, userId: string): void {
    const guild = this.guilds.get(guildId);
    if (!guild) throw new Error('Guild not found');

    if (guild.founderId !== userId) {
      throw new Error('Only the guild founder can disband the guild');
    }

    // Remove all members
    const members = this.members.get(guildId) || [];
    for (const member of members) {
      this.userGuilds.delete(member.userId);
    }

    guild.status = 'disbanded';
    guild.updatedAt = new Date();

    this.emit('guild:disbanded', guild);
  }

  /**
   * Invite player to guild
   */
  invitePlayer(
    guildId: string,
    inviterId: string,
    inviteeId: string,
    message?: string
  ): GuildInvitation {
    const guild = this.guilds.get(guildId);
    if (!guild) throw new Error('Guild not found');

    // Check if inviter has permission
    if (!this.hasPermission(guildId, inviterId, GuildPermission.INVITE_MEMBERS)) {
      throw new Error('No permission to invite members');
    }

    // Check if invitee is already in a guild
    if (this.userGuilds.has(inviteeId)) {
      throw new Error('Player is already in a guild');
    }

    // Check if guild is full
    if (guild.memberCount >= guild.maxMembers) {
      throw new Error('Guild is full');
    }

    const invitation: GuildInvitation = {
      invitationId: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      guildId,
      inviterId,
      inviteeId,
      message,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    };

    this.invitations.set(invitation.invitationId, invitation);
    return invitation;
  }

  /**
   * Accept guild invitation
   */
  acceptInvitation(invitationId: string): GuildMember {
    const invitation = this.invitations.get(invitationId);
    if (!invitation) throw new Error('Invitation not found');

    if (invitation.status !== 'pending') {
      throw new Error('Invitation is no longer valid');
    }

    if (invitation.expiresAt < new Date()) {
      invitation.status = 'expired';
      throw new Error('Invitation has expired');
    }

    invitation.status = 'accepted';

    return this.addMember(invitation.guildId, invitation.inviteeId);
  }

  /**
   * Apply to join guild
   */
  applyToGuild(guildId: string, applicantId: string, message: string): GuildApplication {
    const guild = this.guilds.get(guildId);
    if (!guild) throw new Error('Guild not found');

    if (!guild.isPublic) {
      throw new Error('Guild is not accepting applications');
    }

    if (this.userGuilds.has(applicantId)) {
      throw new Error('You are already in a guild');
    }

    const application: GuildApplication = {
      applicationId: `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      guildId,
      applicantId,
      message,
      status: 'pending',
      createdAt: new Date(),
    };

    this.applications.set(application.applicationId, application);
    return application;
  }

  /**
   * Approve application
   */
  approveApplication(applicationId: string, reviewerId: string): GuildMember {
    const application = this.applications.get(applicationId);
    if (!application) throw new Error('Application not found');

    if (!this.hasPermission(application.guildId, reviewerId, GuildPermission.INVITE_MEMBERS)) {
      throw new Error('No permission to approve applications');
    }

    application.status = 'approved';
    application.reviewedBy = reviewerId;
    application.reviewedAt = new Date();

    return this.addMember(application.guildId, application.applicantId);
  }

  /**
   * Leave guild
   */
  leaveGuild(guildId: string, userId: string): void {
    const guild = this.guilds.get(guildId);
    if (!guild) throw new Error('Guild not found');

    if (guild.founderId === userId) {
      throw new Error('Guild founder cannot leave. Transfer leadership or disband the guild.');
    }

    const members = this.members.get(guildId) || [];
    const memberIndex = members.findIndex(m => m.userId === userId);

    if (memberIndex === -1) {
      throw new Error('You are not a member of this guild');
    }

    const member = members[memberIndex];
    members.splice(memberIndex, 1);
    this.userGuilds.delete(userId);

    guild.memberCount--;
    guild.updatedAt = new Date();

    this.emit('member:left', member);
  }

  /**
   * Kick member from guild
   */
  kickMember(guildId: string, kickerId: string, targetId: string): void {
    const guild = this.guilds.get(guildId);
    if (!guild) throw new Error('Guild not found');

    if (!this.hasPermission(guildId, kickerId, GuildPermission.KICK_MEMBERS)) {
      throw new Error('No permission to kick members');
    }

    if (guild.founderId === targetId) {
      throw new Error('Cannot kick the guild founder');
    }

    const members = this.members.get(guildId) || [];
    const memberIndex = members.findIndex(m => m.userId === targetId);

    if (memberIndex === -1) {
      throw new Error('Member not found');
    }

    const member = members[memberIndex];
    members.splice(memberIndex, 1);
    this.userGuilds.delete(targetId);

    guild.memberCount--;
    guild.updatedAt = new Date();

    this.emit('member:left', member);
  }

  /**
   * Promote member
   */
  promoteMember(guildId: string, promoterId: string, targetId: string): void {
    if (!this.hasPermission(guildId, promoterId, GuildPermission.PROMOTE_MEMBERS)) {
      throw new Error('No permission to promote members');
    }

    const member = this.getMember(guildId, targetId);
    if (!member) throw new Error('Member not found');

    const ranks = this.ranks.get(guildId) || [];
    const currentRank = ranks.find(r => r.rankId === member.rankId);
    if (!currentRank) throw new Error('Current rank not found');

    // Find next higher rank (lower level number)
    const higherRank = ranks.find(r => r.level === currentRank.level - 1);
    if (!higherRank) throw new Error('Already at highest rank');

    currentRank.memberCount--;
    member.rankId = higherRank.rankId;
    higherRank.memberCount++;

    this.emit('member:promoted', member, higherRank);
  }

  /**
   * Demote member
   */
  demoteMember(guildId: string, demoterId: string, targetId: string): void {
    if (!this.hasPermission(guildId, demoterId, GuildPermission.DEMOTE_MEMBERS)) {
      throw new Error('No permission to demote members');
    }

    const member = this.getMember(guildId, targetId);
    if (!member) throw new Error('Member not found');

    const ranks = this.ranks.get(guildId) || [];
    const currentRank = ranks.find(r => r.rankId === member.rankId);
    if (!currentRank) throw new Error('Current rank not found');

    // Find next lower rank (higher level number)
    const lowerRank = ranks.find(r => r.level === currentRank.level + 1);
    if (!lowerRank) throw new Error('Already at lowest rank');

    currentRank.memberCount--;
    member.rankId = lowerRank.rankId;
    lowerRank.memberCount++;

    this.emit('member:demoted', member, lowerRank);
  }

  /**
   * Create guild event
   */
  createEvent(
    guildId: string,
    creatorId: string,
    name: string,
    description: string,
    type: GuildEvent['type'],
    startTime: Date,
    endTime: Date,
    options?: {
      location?: string;
      maxParticipants?: number;
    }
  ): GuildEvent {
    if (!this.hasPermission(guildId, creatorId, GuildPermission.CREATE_EVENTS)) {
      throw new Error('No permission to create events');
    }

    const event: GuildEvent = {
      eventId: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      guildId,
      creatorId,
      name,
      description,
      type,
      startTime,
      endTime,
      location: options?.location,
      maxParticipants: options?.maxParticipants,
      participants: [],
      status: 'scheduled',
      createdAt: new Date(),
    };

    this.events.set(event.eventId, event);
    this.emit('event:created', event);

    return event;
  }

  /**
   * Join event
   */
  joinEvent(eventId: string, userId: string, status: EventParticipant['status'], role?: string): void {
    const event = this.events.get(eventId);
    if (!event) throw new Error('Event not found');

    if (event.maxParticipants && event.participants.length >= event.maxParticipants) {
      throw new Error('Event is full');
    }

    const existing = event.participants.find(p => p.userId === userId);
    if (existing) {
      existing.status = status;
      existing.role = role;
    } else {
      event.participants.push({
        userId,
        status,
        role,
        joinedAt: new Date(),
      });
    }
  }

  /**
   * Post announcement
   */
  postAnnouncement(
    guildId: string,
    authorId: string,
    title: string,
    content: string,
    priority: GuildAnnouncement['priority'] = 'normal'
  ): GuildAnnouncement {
    if (!this.hasPermission(guildId, authorId, GuildPermission.SEND_ANNOUNCEMENTS)) {
      throw new Error('No permission to post announcements');
    }

    const announcement: GuildAnnouncement = {
      announcementId: `ann_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      guildId,
      authorId,
      title,
      content,
      priority,
      isPinned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (!this.announcements.has(guildId)) {
      this.announcements.set(guildId, []);
    }
    this.announcements.get(guildId)!.push(announcement);

    this.emit('announcement:posted', announcement);
    return announcement;
  }

  /**
   * Donate to guild treasury
   */
  donate(guildId: string, userId: string, currency: string, amount: number): void {
    const guild = this.guilds.get(guildId);
    if (!guild) throw new Error('Guild not found');

    const member = this.getMember(guildId, userId);
    if (!member) throw new Error('You are not a member of this guild');

    const currentAmount = guild.treasury.get(currency) || 0;
    guild.treasury.set(currency, currentAmount + amount);

    const memberDonations = member.contribution.donations.get(currency) || 0;
    member.contribution.donations.set(currency, memberDonations + amount);

    // Award guild experience
    this.addExperience(guildId, Math.floor(amount / 10));

    guild.updatedAt = new Date();
  }

  /**
   * Declare war on another guild
   */
  declareWar(guildId: string, declarerId: string, targetGuildId: string, duration: number): GuildWar {
    if (!this.hasPermission(guildId, declarerId, GuildPermission.DECLARE_WAR)) {
      throw new Error('No permission to declare war');
    }

    const attackingGuild = this.guilds.get(guildId);
    const defendingGuild = this.guilds.get(targetGuildId);

    if (!attackingGuild || !defendingGuild) {
      throw new Error('Guild not found');
    }

    const war: GuildWar = {
      warId: `war_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      attackingGuildId: guildId,
      defendingGuildId: targetGuildId,
      startTime: new Date(),
      endTime: new Date(Date.now() + duration),
      status: 'pending',
      score: {
        attacking: 0,
        defending: 0,
      },
      prizes: {
        winner: [
          { type: 'currency', value: 10000, description: '10,000 Gold' },
          { type: 'experience', value: 5000, description: '5,000 Guild XP' },
        ],
        loser: [
          { type: 'currency', value: -5000, description: '-5,000 Gold' },
        ],
      },
      history: [],
    };

    this.wars.set(war.warId, war);
    this.emit('war:declared', war);

    return war;
  }

  /**
   * Form alliance with another guild
   */
  formAlliance(guildId: string, proposerId: string, targetGuildId: string): GuildAlliance {
    if (!this.hasPermission(guildId, proposerId, GuildPermission.MANAGE_ALLIANCES)) {
      throw new Error('No permission to manage alliances');
    }

    const alliance: GuildAlliance = {
      allianceId: `alliance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      guild1Id: guildId,
      guild2Id: targetGuildId,
      status: 'pending',
      proposedBy: proposerId,
      createdAt: new Date(),
      benefits: {
        sharedChat: true,
        sharedEvents: true,
        tradingBonus: 10,
      },
    };

    if (!this.alliances.has(guildId)) {
      this.alliances.set(guildId, []);
    }
    this.alliances.get(guildId)!.push(alliance);

    return alliance;
  }

  /**
   * Get guild statistics
   */
  getGuildStats(guildId: string): GuildStats {
    const guild = this.guilds.get(guildId);
    if (!guild) throw new Error('Guild not found');

    const members = this.members.get(guildId) || [];
    const activeMembers = members.filter(m => {
      const daysSinceLastSeen = (Date.now() - m.lastSeen.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceLastSeen <= 7;
    });

    const guildEvents = Array.from(this.events.values()).filter(e => e.guildId === guildId);
    const completedEvents = guildEvents.filter(e => e.status === 'completed');

    const totalAttendance = completedEvents.reduce((sum, e) =>
      sum + e.participants.filter(p => p.status === 'confirmed').length, 0
    );

    const stats: GuildStats = {
      totalMembers: guild.memberCount,
      activeMembers: activeMembers.length,
      totalExperience: guild.experience,
      level: guild.level,
      achievements: {
        total: guild.achievements.length,
        completed: guild.achievements.filter(a => a.isCompleted).length,
      },
      pvp: {
        wins: 0,
        losses: 0,
        winRate: 0,
      },
      wars: {
        won: 0,
        lost: 0,
        winRate: 0,
      },
      events: {
        total: guildEvents.length,
        completed: completedEvents.length,
        averageAttendance: completedEvents.length > 0 ? totalAttendance / completedEvents.length : 0,
      },
      treasury: {
        totalDonations: 0,
        totalWithdrawals: 0,
        currentBalance: guild.treasury.get('gold') || 0,
      },
      rankings: {
        global: 0,
        regional: 0,
        category: new Map(),
      },
    };

    return stats;
  }

  /**
   * Get guild
   */
  getGuild(guildId: string): Guild | null {
    return this.guilds.get(guildId) || null;
  }

  /**
   * Get user's guild
   */
  getUserGuild(userId: string): Guild | null {
    const guildId = this.userGuilds.get(userId);
    return guildId ? this.guilds.get(guildId) || null : null;
  }

  /**
   * Get guild members
   */
  getMembers(guildId: string): GuildMember[] {
    return this.members.get(guildId) || [];
  }

  /**
   * Get member
   */
  getMember(guildId: string, userId: string): GuildMember | null {
    const members = this.members.get(guildId) || [];
    return members.find(m => m.userId === userId) || null;
  }

  /**
   * Get guild ranks
   */
  getRanks(guildId: string): GuildRank[] {
    return this.ranks.get(guildId) || [];
  }

  // Private helper methods

  private addMember(guildId: string, userId: string): GuildMember {
    const guild = this.guilds.get(guildId);
    if (!guild) throw new Error('Guild not found');

    if (guild.memberCount >= guild.maxMembers) {
      throw new Error('Guild is full');
    }

    const ranks = this.ranks.get(guildId) || [];
    const defaultRank = ranks[ranks.length - 1]; // Lowest rank

    const member: GuildMember = {
      userId,
      guildId,
      rankId: defaultRank.rankId,
      joinedAt: new Date(),
      lastSeen: new Date(),
      contribution: {
        experience: 0,
        donations: new Map(),
        eventsAttended: 0,
        warsParticipated: 0,
      },
      status: 'active',
    };

    if (!this.members.has(guildId)) {
      this.members.set(guildId, []);
    }
    this.members.get(guildId)!.push(member);
    this.userGuilds.set(userId, guildId);

    guild.memberCount++;
    defaultRank.memberCount++;
    guild.updatedAt = new Date();

    this.emit('member:joined', member);
    return member;
  }

  private hasPermission(guildId: string, userId: string, permission: GuildPermission): boolean {
    const member = this.getMember(guildId, userId);
    if (!member) return false;

    const ranks = this.ranks.get(guildId) || [];
    const rank = ranks.find(r => r.rankId === member.rankId);
    if (!rank) return false;

    return rank.permissions.includes(permission);
  }

  private createDefaultRanks(guildId: string): void {
    const defaultRanks: Omit<GuildRank, 'rankId' | 'guildId' | 'memberCount'>[] = [
      {
        name: 'Guild Leader',
        level: 0,
        permissions: Object.values(GuildPermission),
        canInvite: true,
        color: '#FFD700',
      },
      {
        name: 'Officer',
        level: 1,
        permissions: [
          GuildPermission.INVITE_MEMBERS,
          GuildPermission.KICK_MEMBERS,
          GuildPermission.CREATE_EVENTS,
          GuildPermission.SEND_ANNOUNCEMENTS,
          GuildPermission.MANAGE_BANK,
        ],
        canInvite: true,
        bankQuota: 10000,
        color: '#C0C0C0',
      },
      {
        name: 'Veteran',
        level: 2,
        permissions: [GuildPermission.INVITE_MEMBERS, GuildPermission.WITHDRAW_BANK],
        canInvite: true,
        bankQuota: 5000,
        color: '#CD7F32',
      },
      {
        name: 'Member',
        level: 3,
        permissions: [GuildPermission.WITHDRAW_BANK],
        canInvite: false,
        bankQuota: 1000,
        color: '#FFFFFF',
      },
    ];

    const ranks: GuildRank[] = defaultRanks.map(r => ({
      rankId: `rank_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      guildId,
      memberCount: 0,
      ...r,
    }));

    this.ranks.set(guildId, ranks);
  }

  private createDefaultBankTabs(guildId: string): void {
    const tabs: GuildBankTab[] = [
      {
        tabId: `tab_${Date.now()}_1`,
        guildId,
        name: 'General',
        items: [],
        permissions: [],
      },
      {
        tabId: `tab_${Date.now()}_2`,
        guildId,
        name: 'Crafting Materials',
        items: [],
        permissions: [],
      },
    ];

    this.bankTabs.set(guildId, tabs);
  }

  private getAvailablePerks(): GuildPerk[] {
    return [
      {
        perkId: 'perk_1',
        name: 'Fast Track',
        description: '+5% experience gain for all members',
        level: 2,
        effects: [{ type: 'experience_boost', value: 5, description: '+5% XP' }],
        isUnlocked: false,
      },
      {
        perkId: 'perk_2',
        name: 'Bountiful Bags',
        description: '+10% resource drops',
        level: 5,
        effects: [{ type: 'resource_bonus', value: 10, description: '+10% Resources' }],
        isUnlocked: false,
      },
    ];
  }

  private getAvailableAchievements(): GuildAchievement[] {
    return [
      {
        achievementId: 'ach_1',
        name: 'United We Stand',
        description: 'Reach 25 guild members',
        points: 10,
        isCompleted: false,
        progress: { current: 0, required: 25 },
      },
      {
        achievementId: 'ach_2',
        name: 'Mighty Guild',
        description: 'Reach guild level 10',
        points: 25,
        isCompleted: false,
        progress: { current: 0, required: 10 },
      },
    ];
  }

  private addExperience(guildId: string, amount: number): void {
    const guild = this.guilds.get(guildId);
    if (!guild) return;

    guild.experience += amount;

    while (guild.experience >= guild.experienceToNextLevel) {
      guild.experience -= guild.experienceToNextLevel;
      guild.level++;
      guild.experienceToNextLevel = Math.floor(guild.experienceToNextLevel * 1.5);

      // Unlock perks
      for (const perk of guild.perks) {
        if (perk.level === guild.level && !perk.isUnlocked) {
          perk.isUnlocked = true;
          perk.unlockedAt = new Date();
          this.emit('perk:unlocked', perk);
        }
      }

      this.emit('level:up', guild, guild.level);
    }

    guild.updatedAt = new Date();
  }
}
