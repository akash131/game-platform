import { Router, Request, Response } from 'express';
import { GamePlatform } from '../../core/game-platform';
import { GameType } from '../../types/core.types';

export function createAnalyticsRoutes(platform: GamePlatform): Router {
  const router = Router();

  /**
   * Get platform statistics
   * GET /api/analytics/stats
   */
  router.get('/stats', (req: Request, res: Response) => {
    const stats = platform.getStatistics();

    res.json({ stats });
  });

  /**
   * Get leaderboard for game type
   * GET /api/analytics/leaderboard/:gameType
   */
  router.get('/leaderboard/:gameType', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const leaderboard = platform.getLeaderboard(req.params.gameType as GameType, limit);

    res.json({ leaderboard });
  });

  /**
   * Get global leaderboard
   * GET /api/analytics/leaderboard/global
   */
  router.get('/leaderboard/global', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const leaderboard = platform.getGlobalLeaderboard(limit);

    res.json({ leaderboard });
  });

  /**
   * Get player rank
   * GET /api/analytics/rank/:gameType/:playerId
   */
  router.get('/rank/:gameType/:playerId', (req: Request, res: Response) => {
    const rank = platform.getPlayerRank(req.params.gameType as GameType, req.params.playerId);

    res.json({ rank });
  });

  /**
   * Generate analytics report
   * GET /api/analytics/report
   */
  router.get('/report', (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string | undefined;
    const report = platform.generateAnalyticsReport(sessionId);

    res.json({ report });
  });

  return router;
}
