import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import { Player } from '../types/core.types';

/**
 * Party System
 * Allows players to form groups before matchmaking
 * Similar to party systems in Fortnite, Overwatch, Apex Legends
 */
export class PartySystem extends EventEmitter {
  private parties: Map<string, Party>;
  private playerParties: Map<string, string>; // playerId -> partyId
  private invitations: Map<string, PartyInvitation[]>; // playerId -> invitations

  constructor() {
    super();
    this.parties = new Map();
    this.playerParties = new Map();
    this.invitations = new Map();
  }

  /**
   * Create a new party
   */
  createParty(leaderId: string, settings: PartySettings = {}): Party {
    // Check if player is already in a party
    if (this.playerParties.has(leaderId)) {
      throw new Error('Player is already in a party');
    }

    const party: Party = {
      id: uuidv4(),
      leaderId,
      members: [leaderId],
      maxSize: settings.maxSize || 4,
      isOpen: settings.isOpen ?? true,
      settings,
      createdAt: Date.now(),
    };

    this.parties.set(party.id, party);
    this.playerParties.set(leaderId, party.id);

    console.log(`🎉 Party created by leader`);
    this.emit('party:created', party);

    return party;
  }

  /**
   * Invite player to party
   */
  invitePlayer(partyId: string, inviterId: string, inviteeId: string): PartyInvitation {
    const party = this.parties.get(partyId);
    if (!party) {
      throw new Error('Party not found');
    }

    // Check if inviter is in the party
    if (!party.members.includes(inviterId)) {
      throw new Error('Only party members can invite');
    }

    // Check if invitee is already in a party
    if (this.playerParties.has(inviteeId)) {
      throw new Error('Player is already in a party');
    }

    // Check if party is full
    if (party.members.length >= party.maxSize) {
      throw new Error('Party is full');
    }

    const invitation: PartyInvitation = {
      id: uuidv4(),
      partyId,
      inviterId,
      inviteeId,
      status: 'pending',
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000, // 5 minutes
    };

    if (!this.invitations.has(inviteeId)) {
      this.invitations.set(inviteeId, []);
    }

    this.invitations.get(inviteeId)!.push(invitation);

    console.log(`📨 Party invitation sent`);
    this.emit('party:invitation:sent', invitation);

    // Auto-expire invitation
    setTimeout(() => {
      if (invitation.status === 'pending') {
        this.declineInvitation(inviteeId, invitation.id);
      }
    }, 300000);

    return invitation;
  }

  /**
   * Accept party invitation
   */
  acceptInvitation(playerId: string, invitationId: string): void {
    const invitations = this.invitations.get(playerId) || [];
    const invitation = invitations.find(inv => inv.id === invitationId);

    if (!invitation) {
      throw new Error('Invitation not found');
    }

    if (invitation.status !== 'pending') {
      throw new Error('Invitation is no longer valid');
    }

    const party = this.parties.get(invitation.partyId);
    if (!party) {
      throw new Error('Party no longer exists');
    }

    // Check if player is already in a party
    if (this.playerParties.has(playerId)) {
      throw new Error('Player is already in a party');
    }

    // Check if party is full
    if (party.members.length >= party.maxSize) {
      throw new Error('Party is full');
    }

    // Add player to party
    party.members.push(playerId);
    this.playerParties.set(playerId, party.id);
    invitation.status = 'accepted';

    console.log(`✅ Player joined party (${party.members.length}/${party.maxSize})`);
    this.emit('party:member:joined', { partyId: party.id, playerId });
  }

  /**
   * Decline party invitation
   */
  declineInvitation(playerId: string, invitationId: string): void {
    const invitations = this.invitations.get(playerId) || [];
    const invitation = invitations.find(inv => inv.id === invitationId);

    if (!invitation) {
      throw new Error('Invitation not found');
    }

    invitation.status = 'declined';

    console.log(`❌ Party invitation declined`);
    this.emit('party:invitation:declined', invitation);
  }

  /**
   * Leave party
   */
  leaveParty(playerId: string): void {
    const partyId = this.playerParties.get(playerId);
    if (!partyId) {
      throw new Error('Player is not in a party');
    }

    const party = this.parties.get(partyId);
    if (!party) return;

    // Remove player from party
    party.members = party.members.filter(id => id !== playerId);
    this.playerParties.delete(playerId);

    // If leader left, assign new leader or disband
    if (party.leaderId === playerId) {
      if (party.members.length > 0) {
        party.leaderId = party.members[0];
        console.log(`👑 New party leader assigned`);
        this.emit('party:leader:changed', { partyId: party.id, newLeaderId: party.leaderId });
      } else {
        // Disband party if empty
        this.disbandParty(partyId);
        return;
      }
    }

    console.log(`🚪 Player left party (${party.members.length}/${party.maxSize})`);
    this.emit('party:member:left', { partyId: party.id, playerId });
  }

  /**
   * Kick player from party
   */
  kickPlayer(partyId: string, kickerId: string, playerId: string): void {
    const party = this.parties.get(partyId);
    if (!party) {
      throw new Error('Party not found');
    }

    // Only leader can kick
    if (party.leaderId !== kickerId) {
      throw new Error('Only party leader can kick members');
    }

    // Cannot kick yourself
    if (kickerId === playerId) {
      throw new Error('Cannot kick yourself. Use leaveParty instead');
    }

    // Check if player is in party
    if (!party.members.includes(playerId)) {
      throw new Error('Player is not in the party');
    }

    // Remove player
    party.members = party.members.filter(id => id !== playerId);
    this.playerParties.delete(playerId);

    console.log(`⚠️  Player kicked from party`);
    this.emit('party:member:kicked', { partyId: party.id, playerId, kickerId });
  }

  /**
   * Promote player to leader
   */
  promoteToLeader(partyId: string, currentLeaderId: string, newLeaderId: string): void {
    const party = this.parties.get(partyId);
    if (!party) {
      throw new Error('Party not found');
    }

    // Only current leader can promote
    if (party.leaderId !== currentLeaderId) {
      throw new Error('Only party leader can promote');
    }

    // Check if new leader is in party
    if (!party.members.includes(newLeaderId)) {
      throw new Error('Player is not in the party');
    }

    party.leaderId = newLeaderId;

    console.log(`👑 Party leadership transferred`);
    this.emit('party:leader:changed', { partyId: party.id, newLeaderId });
  }

  /**
   * Disband party
   */
  disbandParty(partyId: string): void {
    const party = this.parties.get(partyId);
    if (!party) return;

    // Remove all members from party map
    for (const memberId of party.members) {
      this.playerParties.delete(memberId);
    }

    this.parties.delete(partyId);

    console.log(`💔 Party disbanded`);
    this.emit('party:disbanded', { partyId });
  }

  /**
   * Get party by ID
   */
  getParty(partyId: string): Party | undefined {
    return this.parties.get(partyId);
  }

  /**
   * Get player's current party
   */
  getPlayerParty(playerId: string): Party | undefined {
    const partyId = this.playerParties.get(playerId);
    return partyId ? this.parties.get(partyId) : undefined;
  }

  /**
   * Get player's pending invitations
   */
  getPlayerInvitations(playerId: string): PartyInvitation[] {
    return (this.invitations.get(playerId) || []).filter(inv => inv.status === 'pending');
  }

  /**
   * Update party settings
   */
  updatePartySettings(partyId: string, leaderId: string, settings: Partial<PartySettings>): void {
    const party = this.parties.get(partyId);
    if (!party) {
      throw new Error('Party not found');
    }

    // Only leader can update settings
    if (party.leaderId !== leaderId) {
      throw new Error('Only party leader can update settings');
    }

    party.settings = { ...party.settings, ...settings };

    if (settings.isOpen !== undefined) {
      party.isOpen = settings.isOpen;
    }

    if (settings.maxSize !== undefined && settings.maxSize >= party.members.length) {
      party.maxSize = settings.maxSize;
    }

    console.log(`⚙️  Party settings updated`);
    this.emit('party:settings:updated', { partyId, settings });
  }

  /**
   * Get party statistics
   */
  getStatistics(): PartyStatistics {
    return {
      totalParties: this.parties.size,
      totalPlayersInParties: this.playerParties.size,
      averagePartySize: this.calculateAveragePartySize(),
      largestParty: this.findLargestParty(),
    };
  }

  private calculateAveragePartySize(): number {
    if (this.parties.size === 0) return 0;

    const totalMembers = Array.from(this.parties.values()).reduce(
      (sum, party) => sum + party.members.length,
      0
    );

    return totalMembers / this.parties.size;
  }

  private findLargestParty(): number {
    let largest = 0;

    for (const party of this.parties.values()) {
      if (party.members.length > largest) {
        largest = party.members.length;
      }
    }

    return largest;
  }
}

export interface Party {
  id: string;
  leaderId: string;
  members: string[];
  maxSize: number;
  isOpen: boolean;
  settings: PartySettings;
  createdAt: number;
}

export interface PartySettings {
  maxSize?: number;
  isOpen?: boolean;
  allowedGameTypes?: string[];
  voiceEnabled?: boolean;
}

export interface PartyInvitation {
  id: string;
  partyId: string;
  inviterId: string;
  inviteeId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
  expiresAt: number;
}

export interface PartyStatistics {
  totalParties: number;
  totalPlayersInParties: number;
  averagePartySize: number;
  largestParty: number;
}
