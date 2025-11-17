import { Router, Request, Response } from 'express';
import { PartySystem } from '../../social/party-system';
import { FriendSystem } from '../../social/friend-system';
import { ChatSystem } from '../../social/chat-system';

export function createSocialRoutes(
  partySystem: PartySystem,
  friendSystem: FriendSystem,
  chatSystem: ChatSystem
): Router {
  const router = Router();

  // ===== PARTY ROUTES =====

  /**
   * Create party
   * POST /api/social/party
   */
  router.post('/party', (req: Request, res: Response) => {
    try {
      const { leaderId, settings } = req.body;

      if (!leaderId) {
        return res.status(400).json({ error: 'Leader ID required' });
      }

      const party = partySystem.createParty(leaderId, settings);

      res.status(201).json({ party });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Invite to party
   * POST /api/social/party/:partyId/invite
   */
  router.post('/party/:partyId/invite', (req: Request, res: Response) => {
    try {
      const { inviterId, inviteeId } = req.body;

      if (!inviterId || !inviteeId) {
        return res.status(400).json({ error: 'Inviter ID and invitee ID required' });
      }

      const invitation = partySystem.invitePlayer(req.params.partyId, inviterId, inviteeId);

      res.status(201).json({ invitation });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Accept party invitation
   * POST /api/social/party/invitation/:invitationId/accept
   */
  router.post('/party/invitation/:invitationId/accept', (req: Request, res: Response) => {
    try {
      const { playerId } = req.body;

      if (!playerId) {
        return res.status(400).json({ error: 'Player ID required' });
      }

      partySystem.acceptInvitation(playerId, req.params.invitationId);

      res.json({ success: true, message: 'Invitation accepted' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Leave party
   * POST /api/social/party/leave
   */
  router.post('/party/leave', (req: Request, res: Response) => {
    try {
      const { playerId } = req.body;

      if (!playerId) {
        return res.status(400).json({ error: 'Player ID required' });
      }

      partySystem.leaveParty(playerId);

      res.json({ success: true, message: 'Left party' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ===== FRIEND ROUTES =====

  /**
   * Send friend request
   * POST /api/social/friends/request
   */
  router.post('/friends/request', (req: Request, res: Response) => {
    try {
      const { senderId, receiverId, message } = req.body;

      if (!senderId || !receiverId) {
        return res.status(400).json({ error: 'Sender ID and receiver ID required' });
      }

      const request = friendSystem.sendFriendRequest(senderId, receiverId, message);

      res.status(201).json({ request });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Accept friend request
   * POST /api/social/friends/request/:requestId/accept
   */
  router.post('/friends/request/:requestId/accept', (req: Request, res: Response) => {
    try {
      const { playerId } = req.body;

      if (!playerId) {
        return res.status(400).json({ error: 'Player ID required' });
      }

      friendSystem.acceptFriendRequest(playerId, req.params.requestId);

      res.json({ success: true, message: 'Friend request accepted' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Get friends list
   * GET /api/social/friends/:playerId
   */
  router.get('/friends/:playerId', (req: Request, res: Response) => {
    const friends = friendSystem.getFriends(req.params.playerId);

    res.json({ friends });
  });

  /**
   * Remove friend
   * DELETE /api/social/friends
   */
  router.delete('/friends', (req: Request, res: Response) => {
    try {
      const { playerId, friendId } = req.body;

      if (!playerId || !friendId) {
        return res.status(400).json({ error: 'Player ID and friend ID required' });
      }

      friendSystem.removeFriend(playerId, friendId);

      res.json({ success: true, message: 'Friend removed' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ===== CHAT ROUTES =====

  /**
   * Send channel message
   * POST /api/social/chat/channel/:channelId
   */
  router.post('/chat/channel/:channelId', (req: Request, res: Response) => {
    try {
      const { senderId, content, metadata } = req.body;

      if (!senderId || !content) {
        return res.status(400).json({ error: 'Sender ID and content required' });
      }

      const message = chatSystem.sendChannelMessage(
        req.params.channelId,
        senderId,
        content,
        metadata
      );

      res.status(201).json({ message });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Send direct message
   * POST /api/social/chat/dm
   */
  router.post('/chat/dm', (req: Request, res: Response) => {
    try {
      const { senderId, receiverId, content, metadata } = req.body;

      if (!senderId || !receiverId || !content) {
        return res.status(400).json({ error: 'Sender ID, receiver ID, and content required' });
      }

      const message = chatSystem.sendDirectMessage(senderId, receiverId, content, metadata);

      res.status(201).json({ message });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Get channel messages
   * GET /api/social/chat/channel/:channelId/messages
   */
  router.get('/chat/channel/:channelId/messages', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const messages = chatSystem.getChannelMessages(req.params.channelId, limit);

    res.json({ messages });
  });

  return router;
}
