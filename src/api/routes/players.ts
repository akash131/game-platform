import { Router, Request, Response } from 'express';
import { GamePlatform } from '../../core/game-platform';

export function createPlayerRoutes(platform: GamePlatform): Router {
  const router = Router();

  /**
   * Create a new player
   * POST /api/players
   */
  router.post('/', (req: Request, res: Response) => {
    try {
      const { username } = req.body;

      if (!username) {
        return res.status(400).json({ error: 'Username is required' });
      }

      const player = platform.createPlayer(username);

      res.status(201).json({
        success: true,
        player,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Get player by ID
   * GET /api/players/:id
   */
  router.get('/:id', (req: Request, res: Response) => {
    const player = platform.getPlayer(req.params.id);

    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json({ player });
  });

  /**
   * Get player by username
   * GET /api/players/username/:username
   */
  router.get('/username/:username', (req: Request, res: Response) => {
    const player = platform.getPlayerByUsername(req.params.username);

    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json({ player });
  });

  /**
   * Get top players
   * GET /api/players/leaderboard/top
   */
  router.get('/leaderboard/top', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 10;
    const players = platform.getTopPlayers(limit);

    res.json({ players });
  });

  return router;
}
