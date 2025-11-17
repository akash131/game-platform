/**
 * REST API Server for Game Platform
 * Express-based API with authentication, rate limiting, and comprehensive endpoints
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { GamePlatform } from '../core/game-platform';
import { MatchmakingSystem } from '../core/matchmaking';
import { PartySystem } from '../social/party-system';
import { FriendSystem } from '../social/friend-system';
import { ChatSystem } from '../social/chat-system';
import { EconomySystem } from '../economy/economy-system';
import { TournamentSystem } from '../tournaments/tournament-system';

// Routes
import { createPlayerRoutes } from './routes/players';
import { createSessionRoutes } from './routes/sessions';
import { createMatchmakingRoutes } from './routes/matchmaking';
import { createSocialRoutes } from './routes/social';
import { createEconomyRoutes } from './routes/economy';
import { createTournamentRoutes } from './routes/tournaments';
import { createAnalyticsRoutes } from './routes/analytics';

export class GamePlatformAPI {
  private app: Application;
  private platform: GamePlatform;
  private matchmaking: MatchmakingSystem;
  private partySystem: PartySystem;
  private friendSystem: FriendSystem;
  private chatSystem: ChatSystem;
  private economySystem: EconomySystem;
  private tournamentSystem: TournamentSystem;
  private port: number;

  constructor(port: number = 3000) {
    this.app = express();
    this.port = port;

    // Initialize systems
    this.platform = new GamePlatform();
    this.matchmaking = new MatchmakingSystem();
    this.partySystem = new PartySystem();
    this.friendSystem = new FriendSystem();
    this.chatSystem = new ChatSystem();
    this.economySystem = new EconomySystem();
    this.tournamentSystem = new TournamentSystem();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security
    this.app.use(helmet());

    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true,
    }));

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Logging
    this.app.use(morgan('combined'));

    // Request ID
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      req.headers['x-request-id'] = req.headers['x-request-id'] || Math.random().toString(36).substring(7);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    // API info
    this.app.get('/api', (req: Request, res: Response) => {
      res.json({
        name: 'Game Platform API',
        version: '1.0.0',
        endpoints: {
          players: '/api/players',
          sessions: '/api/sessions',
          matchmaking: '/api/matchmaking',
          social: '/api/social',
          economy: '/api/economy',
          tournaments: '/api/tournaments',
          analytics: '/api/analytics',
        },
      });
    });

    // Mount route modules
    this.app.use('/api/players', createPlayerRoutes(this.platform));
    this.app.use('/api/sessions', createSessionRoutes(this.platform));
    this.app.use('/api/matchmaking', createMatchmakingRoutes(this.matchmaking, this.platform));
    this.app.use('/api/social', createSocialRoutes(
      this.partySystem,
      this.friendSystem,
      this.chatSystem
    ));
    this.app.use('/api/economy', createEconomyRoutes(this.economySystem));
    this.app.use('/api/tournaments', createTournamentRoutes(this.tournamentSystem));
    this.app.use('/api/analytics', createAnalyticsRoutes(this.platform));

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.path}`,
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('Error:', err);

      res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        requestId: req.headers['x-request-id'],
      });
    });
  }

  async start(): Promise<void> {
    // Initialize platform
    await this.platform.initialize();

    // Start server
    this.app.listen(this.port, () => {
      console.log('='.repeat(60));
      console.log(`🚀 Game Platform API Server`);
      console.log('='.repeat(60));
      console.log(`📍 Server: http://localhost:${this.port}`);
      console.log(`📊 Health: http://localhost:${this.port}/health`);
      console.log(`📚 API Docs: http://localhost:${this.port}/api`);
      console.log('='.repeat(60));
    });
  }

  getApp(): Application {
    return this.app;
  }
}

// Start server if run directly
if (require.main === module) {
  const port = parseInt(process.env.PORT || '3000', 10);
  const api = new GamePlatformAPI(port);

  api.start().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
