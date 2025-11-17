import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

/**
 * Chat System
 * Real-time messaging for players, parties, and global channels
 * Supports DMs, party chat, team chat, and global channels
 */
export class ChatSystem extends EventEmitter {
  private channels: Map<string, ChatChannel>;
  private directMessages: Map<string, DirectMessage[]>; // conversationId -> messages
  private userMutes: Map<string, string[]>; // userId -> muted user IDs
  private channelMembers: Map<string, Set<string>>; // channelId -> member IDs
  private messageHistory: Map<string, ChatMessage[]>; // channelId -> messages

  constructor() {
    super();
    this.channels = new Map();
    this.directMessages = new Map();
    this.userMutes = new Map();
    this.channelMembers = new Map();
    this.messageHistory = new Map();

    // Create default channels
    this.createDefaultChannels();
  }

  /**
   * Send message to channel
   */
  sendChannelMessage(
    channelId: string,
    senderId: string,
    content: string,
    metadata?: Record<string, any>
  ): ChatMessage {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Check if user is in channel
    const members = this.channelMembers.get(channelId);
    if (!members || !members.has(senderId)) {
      throw new Error('User is not in this channel');
    }

    // Check if channel allows messages
    if (channel.type === 'announcement' && !channel.moderators.includes(senderId)) {
      throw new Error('Only moderators can send messages in announcement channels');
    }

    const message: ChatMessage = {
      id: uuidv4(),
      channelId,
      senderId,
      content: this.filterProfanity(content),
      timestamp: Date.now(),
      type: 'text',
      metadata,
    };

    if (!this.messageHistory.has(channelId)) {
      this.messageHistory.set(channelId, []);
    }

    this.messageHistory.get(channelId)!.push(message);

    // Limit history to last 1000 messages per channel
    const history = this.messageHistory.get(channelId)!;
    if (history.length > 1000) {
      history.shift();
    }

    console.log(`💬 [${channel.name}] Message sent`);
    this.emit('message:channel', message);

    return message;
  }

  /**
   * Send direct message
   */
  sendDirectMessage(
    senderId: string,
    receiverId: string,
    content: string,
    metadata?: Record<string, any>
  ): DirectMessage {
    // Check if receiver has blocked sender
    const receiverMutes = this.userMutes.get(receiverId) || [];
    if (receiverMutes.includes(senderId)) {
      throw new Error('Cannot send message to this user');
    }

    const conversationId = this.getConversationId(senderId, receiverId);

    const message: DirectMessage = {
      id: uuidv4(),
      senderId,
      receiverId,
      content: this.filterProfanity(content),
      timestamp: Date.now(),
      read: false,
      metadata,
    };

    if (!this.directMessages.has(conversationId)) {
      this.directMessages.set(conversationId, []);
    }

    this.directMessages.get(conversationId)!.push(message);

    console.log(`📨 Direct message sent`);
    this.emit('message:direct', message);

    return message;
  }

  /**
   * Create a new chat channel
   */
  createChannel(name: string, type: ChatChannelType, creatorId: string): ChatChannel {
    const channel: ChatChannel = {
      id: uuidv4(),
      name,
      type,
      creatorId,
      moderators: [creatorId],
      createdAt: Date.now(),
      settings: {
        maxMembers: type === 'party' ? 10 : 1000,
        slowMode: false,
        slowModeDelay: 0,
      },
    };

    this.channels.set(channel.id, channel);
    this.channelMembers.set(channel.id, new Set([creatorId]));
    this.messageHistory.set(channel.id, []);

    console.log(`📢 Channel created: ${name}`);
    this.emit('channel:created', channel);

    return channel;
  }

  /**
   * Join a channel
   */
  joinChannel(channelId: string, userId: string): void {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    const members = this.channelMembers.get(channelId)!;

    // Check if already in channel
    if (members.has(userId)) {
      return;
    }

    // Check capacity
    if (members.size >= channel.settings.maxMembers) {
      throw new Error('Channel is full');
    }

    members.add(userId);

    console.log(`✅ User joined channel: ${channel.name}`);
    this.emit('channel:joined', { channelId, userId });
  }

  /**
   * Leave a channel
   */
  leaveChannel(channelId: string, userId: string): void {
    const members = this.channelMembers.get(channelId);
    if (!members) {
      throw new Error('Channel not found');
    }

    members.delete(userId);

    const channel = this.channels.get(channelId);
    console.log(`🚪 User left channel: ${channel?.name}`);
    this.emit('channel:left', { channelId, userId });
  }

  /**
   * Mute a user
   */
  muteUser(userId: string, mutedUserId: string): void {
    if (!this.userMutes.has(userId)) {
      this.userMutes.set(userId, []);
    }

    const muted = this.userMutes.get(userId)!;

    if (!muted.includes(mutedUserId)) {
      muted.push(mutedUserId);
    }

    console.log(`🔇 User muted`);
    this.emit('user:muted', { userId, mutedUserId });
  }

  /**
   * Unmute a user
   */
  unmuteUser(userId: string, mutedUserId: string): void {
    const muted = this.userMutes.get(userId) || [];
    this.userMutes.set(
      userId,
      muted.filter(id => id !== mutedUserId)
    );

    console.log(`🔊 User unmuted`);
    this.emit('user:unmuted', { userId, mutedUserId });
  }

  /**
   * Get channel messages
   */
  getChannelMessages(channelId: string, limit: number = 100): ChatMessage[] {
    const messages = this.messageHistory.get(channelId) || [];
    return messages.slice(-limit);
  }

  /**
   * Get direct messages between two users
   */
  getDirectMessages(userId1: string, userId2: string, limit: number = 100): DirectMessage[] {
    const conversationId = this.getConversationId(userId1, userId2);
    const messages = this.directMessages.get(conversationId) || [];
    return messages.slice(-limit);
  }

  /**
   * Mark direct message as read
   */
  markAsRead(userId: string, messageId: string): void {
    for (const messages of this.directMessages.values()) {
      const message = messages.find(m => m.id === messageId && m.receiverId === userId);
      if (message) {
        message.read = true;
        this.emit('message:read', { messageId, userId });
        break;
      }
    }
  }

  /**
   * Get unread message count
   */
  getUnreadCount(userId: string): number {
    let count = 0;

    for (const messages of this.directMessages.values()) {
      count += messages.filter(m => m.receiverId === userId && !m.read).length;
    }

    return count;
  }

  /**
   * Delete message
   */
  deleteMessage(channelId: string, messageId: string, userId: string): void {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    const messages = this.messageHistory.get(channelId);
    if (!messages) return;

    const message = messages.find(m => m.id === messageId);
    if (!message) {
      throw new Error('Message not found');
    }

    // Only sender or moderators can delete
    if (message.senderId !== userId && !channel.moderators.includes(userId)) {
      throw new Error('No permission to delete this message');
    }

    this.messageHistory.set(
      channelId,
      messages.filter(m => m.id !== messageId)
    );

    console.log(`🗑️  Message deleted`);
    this.emit('message:deleted', { channelId, messageId });
  }

  /**
   * Add moderator to channel
   */
  addModerator(channelId: string, requesterId: string, userId: string): void {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Only creator can add moderators
    if (channel.creatorId !== requesterId) {
      throw new Error('Only channel creator can add moderators');
    }

    if (!channel.moderators.includes(userId)) {
      channel.moderators.push(userId);
    }

    console.log(`👮 Moderator added to channel`);
    this.emit('channel:moderator:added', { channelId, userId });
  }

  /**
   * Update channel settings
   */
  updateChannelSettings(
    channelId: string,
    userId: string,
    settings: Partial<ChatChannelSettings>
  ): void {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Only moderators can update settings
    if (!channel.moderators.includes(userId)) {
      throw new Error('Only moderators can update channel settings');
    }

    channel.settings = { ...channel.settings, ...settings };

    console.log(`⚙️  Channel settings updated`);
    this.emit('channel:settings:updated', { channelId, settings });
  }

  /**
   * Get chat statistics
   */
  getStatistics(): ChatStatistics {
    let totalMessages = 0;
    let totalDirectMessages = 0;

    for (const messages of this.messageHistory.values()) {
      totalMessages += messages.length;
    }

    for (const messages of this.directMessages.values()) {
      totalDirectMessages += messages.length;
    }

    return {
      totalChannels: this.channels.size,
      totalMessages,
      totalDirectMessages,
      activeUsers: this.getActiveUserCount(),
    };
  }

  private createDefaultChannels(): void {
    // Global channel
    const global = this.createChannel('Global', 'global', 'system');

    // Help channel
    this.createChannel('Help', 'public', 'system');

    // Trading channel
    this.createChannel('Trading', 'public', 'system');
  }

  private getConversationId(userId1: string, userId2: string): string {
    return [userId1, userId2].sort().join('-');
  }

  private filterProfanity(content: string): string {
    // Basic profanity filter (would use a comprehensive library in production)
    const profanityList = ['badword1', 'badword2']; // Example
    let filtered = content;

    for (const word of profanityList) {
      const regex = new RegExp(word, 'gi');
      filtered = filtered.replace(regex, '*'.repeat(word.length));
    }

    return filtered;
  }

  private getActiveUserCount(): number {
    const activeUsers = new Set<string>();

    for (const members of this.channelMembers.values()) {
      for (const userId of members) {
        activeUsers.add(userId);
      }
    }

    return activeUsers.size;
  }
}

export interface ChatChannel {
  id: string;
  name: string;
  type: ChatChannelType;
  creatorId: string;
  moderators: string[];
  createdAt: number;
  settings: ChatChannelSettings;
}

export interface ChatChannelSettings {
  maxMembers: number;
  slowMode: boolean;
  slowModeDelay: number;
}

export type ChatChannelType = 'global' | 'public' | 'party' | 'team' | 'guild' | 'announcement';

export interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  content: string;
  timestamp: number;
  type: 'text' | 'system' | 'emote';
  metadata?: Record<string, any>;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: number;
  read: boolean;
  metadata?: Record<string, any>;
}

export interface ChatStatistics {
  totalChannels: number;
  totalMessages: number;
  totalDirectMessages: number;
  activeUsers: number;
}
