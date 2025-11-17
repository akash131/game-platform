import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

/**
 * Friend System
 * Player social connections and friend management
 * Similar to Steam, Xbox Live, PlayStation Network friend systems
 */
export class FriendSystem extends EventEmitter {
  private friendships: Map<string, Friendship[]>; // playerId -> friendships
  private friendRequests: Map<string, FriendRequest[]>; // playerId -> requests
  private blockedPlayers: Map<string, string[]>; // playerId -> blocked player IDs

  constructor() {
    super();
    this.friendships = new Map();
    this.friendRequests = new Map();
    this.blockedPlayers = new Map();
  }

  /**
   * Send friend request
   */
  sendFriendRequest(senderId: string, receiverId: string, message?: string): FriendRequest {
    // Cannot send to yourself
    if (senderId === receiverId) {
      throw new Error('Cannot send friend request to yourself');
    }

    // Check if already friends
    if (this.areFriends(senderId, receiverId)) {
      throw new Error('Already friends with this player');
    }

    // Check if blocked
    if (this.isBlocked(receiverId, senderId)) {
      throw new Error('Cannot send friend request to this player');
    }

    // Check for existing pending request
    const existingRequest = this.getPendingRequest(senderId, receiverId);
    if (existingRequest) {
      throw new Error('Friend request already sent');
    }

    const request: FriendRequest = {
      id: uuidv4(),
      senderId,
      receiverId,
      message,
      status: 'pending',
      sentAt: Date.now(),
    };

    if (!this.friendRequests.has(receiverId)) {
      this.friendRequests.set(receiverId, []);
    }

    this.friendRequests.get(receiverId)!.push(request);

    console.log(`📨 Friend request sent`);
    this.emit('friend:request:sent', request);

    return request;
  }

  /**
   * Accept friend request
   */
  acceptFriendRequest(playerId: string, requestId: string): void {
    const requests = this.friendRequests.get(playerId) || [];
    const request = requests.find(req => req.id === requestId);

    if (!request) {
      throw new Error('Friend request not found');
    }

    if (request.status !== 'pending') {
      throw new Error('Friend request is no longer valid');
    }

    // Create friendship
    const friendship: Friendship = {
      id: uuidv4(),
      player1Id: request.senderId,
      player2Id: request.receiverId,
      createdAt: Date.now(),
      status: 'active',
    };

    // Add to both players' friend lists
    if (!this.friendships.has(request.senderId)) {
      this.friendships.set(request.senderId, []);
    }
    if (!this.friendships.has(request.receiverId)) {
      this.friendships.set(request.receiverId, []);
    }

    this.friendships.get(request.senderId)!.push(friendship);
    this.friendships.get(request.receiverId)!.push(friendship);

    request.status = 'accepted';

    console.log(`✅ Friend request accepted`);
    this.emit('friend:added', { friendship, request });
  }

  /**
   * Decline friend request
   */
  declineFriendRequest(playerId: string, requestId: string): void {
    const requests = this.friendRequests.get(playerId) || [];
    const request = requests.find(req => req.id === requestId);

    if (!request) {
      throw new Error('Friend request not found');
    }

    request.status = 'declined';

    console.log(`❌ Friend request declined`);
    this.emit('friend:request:declined', request);
  }

  /**
   * Remove friend
   */
  removeFriend(playerId: string, friendId: string): void {
    const friendship = this.getFriendship(playerId, friendId);
    if (!friendship) {
      throw new Error('Not friends with this player');
    }

    // Remove from both players' friend lists
    const player1Friendships = this.friendships.get(friendship.player1Id) || [];
    const player2Friendships = this.friendships.get(friendship.player2Id) || [];

    this.friendships.set(
      friendship.player1Id,
      player1Friendships.filter(f => f.id !== friendship.id)
    );

    this.friendships.set(
      friendship.player2Id,
      player2Friendships.filter(f => f.id !== friendship.id)
    );

    console.log(`💔 Friend removed`);
    this.emit('friend:removed', { playerId, friendId });
  }

  /**
   * Block player
   */
  blockPlayer(playerId: string, blockedPlayerId: string): void {
    if (playerId === blockedPlayerId) {
      throw new Error('Cannot block yourself');
    }

    if (!this.blockedPlayers.has(playerId)) {
      this.blockedPlayers.set(playerId, []);
    }

    const blocked = this.blockedPlayers.get(playerId)!;

    if (blocked.includes(blockedPlayerId)) {
      throw new Error('Player is already blocked');
    }

    blocked.push(blockedPlayerId);

    // Remove friendship if exists
    if (this.areFriends(playerId, blockedPlayerId)) {
      this.removeFriend(playerId, blockedPlayerId);
    }

    console.log(`🚫 Player blocked`);
    this.emit('player:blocked', { playerId, blockedPlayerId });
  }

  /**
   * Unblock player
   */
  unblockPlayer(playerId: string, blockedPlayerId: string): void {
    const blocked = this.blockedPlayers.get(playerId) || [];

    if (!blocked.includes(blockedPlayerId)) {
      throw new Error('Player is not blocked');
    }

    this.blockedPlayers.set(
      playerId,
      blocked.filter(id => id !== blockedPlayerId)
    );

    console.log(`✅ Player unblocked`);
    this.emit('player:unblocked', { playerId, blockedPlayerId });
  }

  /**
   * Get player's friends
   */
  getFriends(playerId: string): string[] {
    const friendships = this.friendships.get(playerId) || [];

    return friendships
      .filter(f => f.status === 'active')
      .map(f => (f.player1Id === playerId ? f.player2Id : f.player1Id));
  }

  /**
   * Get pending friend requests
   */
  getPendingRequests(playerId: string): FriendRequest[] {
    return (this.friendRequests.get(playerId) || []).filter(req => req.status === 'pending');
  }

  /**
   * Get sent friend requests
   */
  getSentRequests(playerId: string): FriendRequest[] {
    const sent: FriendRequest[] = [];

    for (const requests of this.friendRequests.values()) {
      for (const request of requests) {
        if (request.senderId === playerId && request.status === 'pending') {
          sent.push(request);
        }
      }
    }

    return sent;
  }

  /**
   * Get blocked players
   */
  getBlockedPlayers(playerId: string): string[] {
    return this.blockedPlayers.get(playerId) || [];
  }

  /**
   * Check if two players are friends
   */
  areFriends(playerId1: string, playerId2: string): boolean {
    const friendship = this.getFriendship(playerId1, playerId2);
    return friendship !== null && friendship.status === 'active';
  }

  /**
   * Check if player is blocked
   */
  isBlocked(playerId: string, potentialBlockerId: string): boolean {
    const blocked = this.blockedPlayers.get(potentialBlockerId) || [];
    return blocked.includes(playerId);
  }

  /**
   * Get friend count
   */
  getFriendCount(playerId: string): number {
    return this.getFriends(playerId).length;
  }

  /**
   * Get online friends (would need integration with presence system)
   */
  getOnlineFriends(playerId: string, onlinePlayerIds: string[]): string[] {
    const friends = this.getFriends(playerId);
    return friends.filter(friendId => onlinePlayerIds.includes(friendId));
  }

  /**
   * Get friend statistics
   */
  getStatistics(): FriendStatistics {
    let totalFriendships = 0;
    let totalRequests = 0;
    let totalBlocked = 0;

    for (const friendships of this.friendships.values()) {
      totalFriendships += friendships.length;
    }

    for (const requests of this.friendRequests.values()) {
      totalRequests += requests.filter(r => r.status === 'pending').length;
    }

    for (const blocked of this.blockedPlayers.values()) {
      totalBlocked += blocked.length;
    }

    return {
      totalFriendships: totalFriendships / 2, // Divide by 2 as each friendship is counted twice
      pendingRequests: totalRequests,
      blockedPlayers: totalBlocked,
      averageFriendsPerPlayer: this.calculateAverageFriends(),
    };
  }

  private getFriendship(playerId1: string, playerId2: string): Friendship | null {
    const friendships = this.friendships.get(playerId1) || [];

    return (
      friendships.find(
        f =>
          (f.player1Id === playerId1 && f.player2Id === playerId2) ||
          (f.player1Id === playerId2 && f.player2Id === playerId1)
      ) || null
    );
  }

  private getPendingRequest(senderId: string, receiverId: string): FriendRequest | undefined {
    const requests = this.friendRequests.get(receiverId) || [];
    return requests.find(req => req.senderId === senderId && req.status === 'pending');
  }

  private calculateAverageFriends(): number {
    if (this.friendships.size === 0) return 0;

    let totalFriends = 0;

    for (const friendships of this.friendships.values()) {
      totalFriends += friendships.filter(f => f.status === 'active').length;
    }

    return totalFriends / this.friendships.size;
  }
}

export interface Friendship {
  id: string;
  player1Id: string;
  player2Id: string;
  createdAt: number;
  status: 'active' | 'removed';
}

export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  message?: string;
  status: 'pending' | 'accepted' | 'declined';
  sentAt: number;
}

export interface FriendStatistics {
  totalFriendships: number;
  pendingRequests: number;
  blockedPlayers: number;
  averageFriendsPerPlayer: number;
}
