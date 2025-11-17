import { Router, Request, Response } from 'express';
import { MatchmakingSystem } from '../../core/matchmaking';
import { GamePlatform } from '../../core/game-platform';
import { GameType } from '../../types/core.types';

export function createMatchmakingRoutes(
  matchmaking: MatchmakingSystem,
  platform: GamePlatform
): Router {
  const router = Router();

  /**
   * Join matchmaking queue
   * POST /api/matchmaking/queue
   */
  router.post('/queue', (req: Request, res: Response) => {
    try {
      const { playerId, gameType, preferences } = req.body;

      if (!playerId || !gameType) {
        return res.status(400).json({ error: 'Player ID and game type required' });
      }

      const player = platform.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }

      const ticket = matchmaking.joinQueue(player, gameType as GameType, preferences);

      res.status(201).json({ ticket });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Leave matchmaking queue
   * DELETE /api/matchmaking/queue/:playerId
   */
  router.delete('/queue/:playerId', (req: Request, res: Response) => {
    try {
      matchmaking.leaveQueue(req.params.playerId);

      res.json({ success: true, message: 'Left queue' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Get queue status
   * GET /api/matchmaking/queue/:queueId/status
   */
  router.get('/queue/:queueId/status', (req: Request, res: Response) => {
    const status = matchmaking.getQueueStatus(req.params.queueId);

    if (!status) {
      return res.status(404).json({ error: 'Queue not found' });
    }

    res.json({ status });
  });

  /**
   * Get all queue statuses
   * GET /api/matchmaking/queues
   */
  router.get('/queues', (req: Request, res: Response) => {
    const queues = matchmaking.getAllQueueStatuses();

    res.json({ queues });
  });

  /**
   * Accept match
   * POST /api/matchmaking/match/:lobbyId/accept
   */
  router.post('/match/:lobbyId/accept', (req: Request, res: Response) => {
    try {
      const { playerId } = req.body;

      if (!playerId) {
        return res.status(400).json({ error: 'Player ID required' });
      }

      matchmaking.acceptMatch(req.params.lobbyId, playerId);

      res.json({ success: true, message: 'Match accepted' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Decline match
   * POST /api/matchmaking/match/:lobbyId/decline
   */
  router.post('/match/:lobbyId/decline', (req: Request, res: Response) => {
    try {
      const { playerId } = req.body;

      if (!playerId) {
        return res.status(400).json({ error: 'Player ID required' });
      }

      matchmaking.declineMatch(req.params.lobbyId, playerId);

      res.json({ success: true, message: 'Match declined' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
