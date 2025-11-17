import { Router, Request, Response } from 'express';
import { GamePlatform } from '../../core/game-platform';
import { GameType, ProviderType } from '../../types/core.types';

export function createSessionRoutes(platform: GamePlatform): Router {
  const router = Router();

  /**
   * Create game session
   * POST /api/sessions
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { gameType, players, settings, providerType } = req.body;

      if (!gameType || !players || !Array.isArray(players)) {
        return res.status(400).json({ error: 'Invalid request body' });
      }

      const session = await platform.createSession(
        gameType as GameType,
        players,
        settings,
        providerType as ProviderType | undefined
      );

      res.status(201).json({ session });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Get session by ID
   * GET /api/sessions/:id
   */
  router.get('/:id', (req: Request, res: Response) => {
    const session = platform.getSession(req.params.id);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ session });
  });

  /**
   * End session
   * POST /api/sessions/:id/end
   */
  router.post('/:id/end', async (req: Request, res: Response) => {
    try {
      await platform.endSession(req.params.id);

      res.json({ success: true, message: 'Session ended' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Get session metrics
   * GET /api/sessions/:id/metrics
   */
  router.get('/:id/metrics', async (req: Request, res: Response) => {
    try {
      const metrics = await platform.getSessionMetrics(req.params.id);

      res.json({ metrics });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
