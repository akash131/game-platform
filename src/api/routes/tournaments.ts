import { Router, Request, Response } from 'express';
import { TournamentSystem } from '../../tournaments/tournament-system';

export function createTournamentRoutes(tournamentSystem: TournamentSystem): Router {
  const router = Router();

  /**
   * Create tournament
   * POST /api/tournaments
   */
  router.post('/', (req: Request, res: Response) => {
    try {
      const config = req.body;

      if (!config.name || !config.gameType || !config.format) {
        return res.status(400).json({ error: 'Name, game type, and format required' });
      }

      const tournament = tournamentSystem.createTournament(config);

      res.status(201).json({ tournament });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Register for tournament
   * POST /api/tournaments/:tournamentId/register
   */
  router.post('/:tournamentId/register', (req: Request, res: Response) => {
    try {
      const { playerId, teamId } = req.body;

      if (!playerId) {
        return res.status(400).json({ error: 'Player ID required' });
      }

      const registration = tournamentSystem.registerForTournament(
        req.params.tournamentId,
        playerId,
        teamId
      );

      res.status(201).json({ registration });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Start tournament
   * POST /api/tournaments/:tournamentId/start
   */
  router.post('/:tournamentId/start', (req: Request, res: Response) => {
    try {
      tournamentSystem.startTournament(req.params.tournamentId);

      res.json({ success: true, message: 'Tournament started' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Report match result
   * POST /api/tournaments/:tournamentId/match/:matchId/result
   */
  router.post('/:tournamentId/match/:matchId/result', (req: Request, res: Response) => {
    try {
      const { winnerId, score } = req.body;

      if (!winnerId) {
        return res.status(400).json({ error: 'Winner ID required' });
      }

      tournamentSystem.reportMatchResult(
        req.params.tournamentId,
        req.params.matchId,
        winnerId,
        score
      );

      res.json({ success: true, message: 'Match result reported' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Get tournament
   * GET /api/tournaments/:tournamentId
   */
  router.get('/:tournamentId', (req: Request, res: Response) => {
    const tournament = tournamentSystem.getTournament(req.params.tournamentId);

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    res.json({ tournament });
  });

  /**
   * Get tournament bracket
   * GET /api/tournaments/:tournamentId/bracket
   */
  router.get('/:tournamentId/bracket', (req: Request, res: Response) => {
    const bracket = tournamentSystem.getBracket(req.params.tournamentId);

    if (!bracket) {
      return res.status(404).json({ error: 'Bracket not found' });
    }

    res.json({ bracket });
  });

  /**
   * Get tournament matches
   * GET /api/tournaments/:tournamentId/matches
   */
  router.get('/:tournamentId/matches', (req: Request, res: Response) => {
    const round = req.query.round ? parseInt(req.query.round as string) : undefined;
    const matches = tournamentSystem.getMatches(req.params.tournamentId, round);

    res.json({ matches });
  });

  /**
   * Get tournament standings
   * GET /api/tournaments/:tournamentId/standings
   */
  router.get('/:tournamentId/standings', (req: Request, res: Response) => {
    const standings = tournamentSystem.getStandings(req.params.tournamentId);

    res.json({ standings });
  });

  /**
   * Get active tournaments
   * GET /api/tournaments/list/active
   */
  router.get('/list/active', (req: Request, res: Response) => {
    const tournaments = tournamentSystem.getActiveTournaments();

    res.json({ tournaments });
  });

  /**
   * Get upcoming tournaments
   * GET /api/tournaments/list/upcoming
   */
  router.get('/list/upcoming', (req: Request, res: Response) => {
    const tournaments = tournamentSystem.getUpcomingTournaments();

    res.json({ tournaments });
  });

  return router;
}
