/**
 * Integrated API Server
 * Complete REST API with all platform features integrated
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer, Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { GamePlatform } from '../core/game-platform';
import { DatabaseService } from '../database/database-service';
import { SkillRatingSystem } from '../matchmaking/skill-rating-system';
import { PaymentService } from '../payments/payment-service';
import { DRMService } from '../licensing/drm-service';
import { DeveloperPortal } from '../developer/developer-portal';
import { CrossProgressionSystem } from '../progression/cross-progression';
import { AdvancedAnalytics } from '../analytics/advanced-analytics';
import { SubscriptionManager } from '../subscriptions/subscription-manager';

interface APIConfig {
  port: number;
  environment: 'development' | 'production' | 'test';
  enableDocs: boolean;
  enableMetrics: boolean;
  corsOrigins: string[];
  rateLimit: {
    windowMs: number;
    max: number;
  };
}

export class IntegratedAPIServer {
  private app: Express;
  private httpServer: HTTPServer;
  private io: SocketIOServer;
  private config: APIConfig;

  // Core services
  private platform: GamePlatform;
  private database: DatabaseService;
  private skillRating: SkillRatingSystem;
  private payments: PaymentService;
  private drm: DRMService;
  private devPortal: DeveloperPortal;
  private crossProgression: CrossProgressionSystem;
  private analytics: AdvancedAnalytics;
  private subscriptions: SubscriptionManager;

  // Connection tracking
  private activeSessions: Map<string, any> = new Map();
  private metrics: Map<string, number> = new Map();

  constructor(config: APIConfig) {
    this.config = config;
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: config.corsOrigins,
        credentials: true
      }
    });

    this.initializeServices();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSockets();
    this.setupErrorHandling();
  }

  /**
   * Initialize all platform services
   */
  private initializeServices(): void {
    // Initialize database
    this.database = new DatabaseService({
      type: 'postgresql',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'game_platform',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      enableCaching: true,
      enableLogging: this.config.environment === 'development'
    });

    // Initialize core platform
    this.platform = new GamePlatform();

    // Initialize specialized services
    this.skillRating = new SkillRatingSystem('elo');

    this.payments = new PaymentService({
      providers: {
        stripe: {
          secretKey: process.env.STRIPE_SECRET_KEY || '',
          publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
          webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || ''
        }
      },
      defaultCurrency: 'USD',
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'JPY'],
      enableFraudDetection: true,
      taxCalculation: true
    });

    this.drm = new DRMService({
      requireOnlineActivation: true,
      allowOfflineMode: true,
      offlineGracePeriod: 72,
      maxActivations: 5,
      maxConcurrentSessions: 1,
      hardwareBindingEnabled: true,
      enableTamperDetection: true,
      enableEncryption: true,
      heartbeatInterval: 300
    });

    this.devPortal = new DeveloperPortal();

    this.crossProgression = new CrossProgressionSystem({
      enableAutoSync: true,
      syncInterval: 300,
      conflictResolution: 'latest',
      enableCloudBackup: true,
      maxBackups: 10,
      enableEncryption: true
    });

    this.analytics = new AdvancedAnalytics();
    this.subscriptions = new SubscriptionManager();

    console.log('[API] All services initialized');
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Security
    this.app.use(helmet());
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true
    }));

    // Performance
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - start;
        const key = `${req.method}:${req.path}`;
        this.metrics.set(key, (this.metrics.get(key) || 0) + 1);

        console.log(`[API] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
      });

      next();
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
          database: this.database ? 'connected' : 'disconnected',
          platform: 'running',
          analytics: 'running'
        }
      });
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    const router = express.Router();

    // ==================== AUTHENTICATION ====================
    router.post('/auth/register', this.handleRegister.bind(this));
    router.post('/auth/login', this.handleLogin.bind(this));
    router.post('/auth/logout', this.handleLogout.bind(this));
    router.post('/auth/refresh', this.handleRefreshToken.bind(this));

    // ==================== PLAYERS ====================
    router.get('/players/:id', this.handleGetPlayer.bind(this));
    router.put('/players/:id', this.handleUpdatePlayer.bind(this));
    router.get('/players/:id/stats', this.handleGetPlayerStats.bind(this));
    router.get('/players/:id/achievements', this.handleGetAchievements.bind(this));

    // ==================== MATCHMAKING ====================
    router.post('/matchmaking/queue', this.handleJoinQueue.bind(this));
    router.delete('/matchmaking/queue', this.handleLeaveQueue.bind(this));
    router.get('/matchmaking/status', this.handleMatchmakingStatus.bind(this));
    router.get('/matchmaking/rating/:userId', this.handleGetRating.bind(this));

    // ==================== SESSIONS ====================
    router.post('/sessions', this.handleCreateSession.bind(this));
    router.get('/sessions/:id', this.handleGetSession.bind(this));
    router.post('/sessions/:id/join', this.handleJoinSession.bind(this));
    router.delete('/sessions/:id/leave', this.handleLeaveSession.bind(this));
    router.get('/sessions', this.handleListSessions.bind(this));

    // ==================== PAYMENTS ====================
    router.post('/payments/intent', this.handleCreatePaymentIntent.bind(this));
    router.post('/payments/process', this.handleProcessPayment.bind(this));
    router.post('/payments/purchase', this.handleCreatePurchase.bind(this));
    router.post('/payments/refund', this.handleRefund.bind(this));
    router.get('/payments/customer/:id', this.handleGetCustomer.bind(this));

    // ==================== SUBSCRIPTIONS ====================
    router.get('/subscriptions/plans', this.handleGetPlans.bind(this));
    router.post('/subscriptions/subscribe', this.handleSubscribe.bind(this));
    router.delete('/subscriptions/:id/cancel', this.handleCancelSubscription.bind(this));
    router.post('/subscriptions/:id/pause', this.handlePauseSubscription.bind(this));
    router.post('/subscriptions/:id/resume', this.handleResumeSubscription.bind(this));
    router.put('/subscriptions/:id/change-plan', this.handleChangePlan.bind(this));

    // ==================== DRM & LICENSING ====================
    router.post('/licenses/generate-keys', this.handleGenerateKeys.bind(this));
    router.post('/licenses/redeem', this.handleRedeemKey.bind(this));
    router.post('/licenses/activate', this.handleActivateLicense.bind(this));
    router.post('/licenses/validate', this.handleValidateLicense.bind(this));
    router.post('/licenses/heartbeat', this.handleHeartbeat.bind(this));
    router.get('/builds/:gameId/latest', this.handleCheckUpdates.bind(this));

    // ==================== DEVELOPER PORTAL ====================
    router.post('/developers/register', this.handleRegisterDeveloper.bind(this));
    router.post('/developers/:id/apps', this.handleCreateApp.bind(this));
    router.post('/developers/:id/api-keys', this.handleGenerateAPIKey.bind(this));
    router.post('/apps/:id/builds', this.handleUploadBuild.bind(this));
    router.post('/apps/:id/submit', this.handleSubmitForReview.bind(this));
    router.get('/apps/:id/analytics', this.handleGetAppAnalytics.bind(this));

    // ==================== CROSS-PROGRESSION ====================
    router.post('/progression/link-platform', this.handleLinkPlatform.bind(this));
    router.post('/progression/sync', this.handleSyncProgression.bind(this));
    router.get('/progression/:userId', this.handleGetProgression.bind(this));
    router.post('/progression/transfer-item', this.handleTransferItem.bind(this));
    router.get('/progression/:userId/backups', this.handleGetBackups.bind(this));

    // ==================== ANALYTICS ====================
    router.post('/analytics/track', this.handleTrackEvent.bind(this));
    router.post('/analytics/cohorts', this.handleCreateCohort.bind(this));
    router.post('/analytics/funnels', this.handleCreateFunnel.bind(this));
    router.get('/analytics/ltv', this.handleCalculateLTV.bind(this));
    router.get('/analytics/retention', this.handleGetRetention.bind(this));

    // ==================== LEADERBOARDS ====================
    router.get('/leaderboards/:gameType', this.handleGetLeaderboard.bind(this));
    router.post('/leaderboards/:gameType/submit', this.handleSubmitScore.bind(this));

    // ==================== SOCIAL ====================
    router.post('/social/friends/add', this.handleAddFriend.bind(this));
    router.get('/social/friends/:userId', this.handleGetFriends.bind(this));
    router.post('/social/party/create', this.handleCreateParty.bind(this));
    router.post('/social/party/:id/join', this.handleJoinParty.bind(this));

    // ==================== ADMIN ====================
    router.get('/admin/stats', this.handleGetSystemStats.bind(this));
    router.get('/admin/metrics', this.handleGetMetrics.bind(this));
    router.post('/admin/moderate', this.handleModerateContent.bind(this));

    // Mount router
    this.app.use('/api/v1', router);

    // API documentation
    if (this.config.enableDocs) {
      this.app.get('/api/docs', (req, res) => {
        res.json({
          version: '1.0.0',
          endpoints: this.getEndpointsList(),
          documentation: 'https://docs.gameplatform.io'
        });
      });
    }
  }

  // ==================== HANDLER IMPLEMENTATIONS ====================

  private async handleRegister(req: Request, res: Response): Promise<void> {
    try {
      const { email, username, password } = req.body;

      // Create player in platform
      const player = await this.platform.createPlayer(username, {
        email,
        country: req.body.country || 'US'
      });

      // Track registration event
      await this.analytics.trackEvent(
        player.id,
        'platform',
        'custom',
        'user_registered',
        { platform: req.body.platform || 'web' }
      );

      res.status(201).json({
        success: true,
        data: {
          userId: player.id,
          username: player.username,
          token: this.generateToken(player.id)
        }
      });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleLogin(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body;

      // Authenticate (simplified - should verify password)
      const player = await this.platform.getPlayer(username);

      if (!player) {
        throw new Error('Invalid credentials');
      }

      // Track login
      await this.analytics.trackEvent(
        player.id,
        'platform',
        'session_start',
        'user_login',
        { platform: req.body.platform || 'web' }
      );

      res.json({
        success: true,
        data: {
          userId: player.id,
          username: player.username,
          token: this.generateToken(player.id)
        }
      });
    } catch (error) {
      res.status(401).json({ success: false, error: String(error) });
    }
  }

  private async handleLogout(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserIdFromToken(req);

      await this.analytics.trackEvent(
        userId,
        'platform',
        'session_end',
        'user_logout',
        {}
      );

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleRefreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;
      // Simplified - should verify refresh token
      const userId = this.getUserIdFromToken(req);

      res.json({
        success: true,
        data: {
          token: this.generateToken(userId)
        }
      });
    } catch (error) {
      res.status(401).json({ success: false, error: String(error) });
    }
  }

  private async handleGetPlayer(req: Request, res: Response): Promise<void> {
    try {
      const player = await this.platform.getPlayer(req.params.id);

      if (!player) {
        throw new Error('Player not found');
      }

      res.json({ success: true, data: player });
    } catch (error) {
      res.status(404).json({ success: false, error: String(error) });
    }
  }

  private async handleUpdatePlayer(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserIdFromToken(req);

      if (userId !== req.params.id) {
        throw new Error('Unauthorized');
      }

      // Update player data in database
      const updated = await this.database.updateById('players', req.params.id, req.body);

      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleGetPlayerStats(req: Request, res: Response): Promise<void> {
    try {
      const player = await this.platform.getPlayer(req.params.id);

      if (!player) {
        throw new Error('Player not found');
      }

      res.json({
        success: true,
        data: player.stats
      });
    } catch (error) {
      res.status(404).json({ success: false, error: String(error) });
    }
  }

  private async handleGetAchievements(req: Request, res: Response): Promise<void> {
    try {
      const achievements = await this.database.find('achievements', {
        userId: req.params.id
      });

      res.json({ success: true, data: achievements });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleJoinQueue(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserIdFromToken(req);
      const { gameType, region, preferences } = req.body;

      const player = await this.platform.getPlayer(userId);

      if (!player) {
        throw new Error('Player not found');
      }

      await this.platform.joinMatchmaking(player, gameType, preferences);

      res.json({
        success: true,
        data: {
          queuePosition: 1,
          estimatedWait: 30
        }
      });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleLeaveQueue(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserIdFromToken(req);
      const player = await this.platform.getPlayer(userId);

      if (player) {
        await this.platform.leaveMatchmaking(player);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleMatchmakingStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserIdFromToken(req);

      // Get matchmaking status
      const status = await this.database.findOne('matchmaking_queue', { userId });

      res.json({
        success: true,
        data: status || { inQueue: false }
      });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleGetRating(req: Request, res: Response): Promise<void> {
    try {
      const rating = this.skillRating.getPlayerRating(req.params.userId);

      res.json({ success: true, data: rating });
    } catch (error) {
      res.status(404).json({ success: false, error: String(error) });
    }
  }

  private async handleCreateSession(req: Request, res: Response): Promise<void> {
    try {
      const { gameType, maxPlayers, settings } = req.body;

      const session = await this.platform.createSession(gameType, maxPlayers, settings);

      res.status(201).json({ success: true, data: session });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleGetSession(req: Request, res: Response): Promise<void> {
    try {
      const session = await this.platform.getSession(req.params.id);

      if (!session) {
        throw new Error('Session not found');
      }

      res.json({ success: true, data: session });
    } catch (error) {
      res.status(404).json({ success: false, error: String(error) });
    }
  }

  private async handleJoinSession(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserIdFromToken(req);
      const player = await this.platform.getPlayer(userId);

      if (!player) {
        throw new Error('Player not found');
      }

      await this.platform.joinSession(req.params.id, player);

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleLeaveSession(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserIdFromToken(req);
      const player = await this.platform.getPlayer(userId);

      if (player) {
        await this.platform.leaveSession(req.params.id, player);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleListSessions(req: Request, res: Response): Promise<void> {
    try {
      const sessions = await this.database.find('sessions', {}, {
        limit: parseInt(req.query.limit as string) || 20
      });

      res.json({ success: true, data: sessions });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleCreatePaymentIntent(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserIdFromToken(req);
      const { amount, currency, provider, method, description } = req.body;

      const intent = await this.payments.createPaymentIntent(
        userId,
        amount,
        currency,
        provider,
        method,
        description
      );

      res.status(201).json({ success: true, data: intent });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleProcessPayment(req: Request, res: Response): Promise<void> {
    try {
      const { paymentIntentId } = req.body;

      const result = await this.payments.processPayment(paymentIntentId);

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleCreatePurchase(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserIdFromToken(req);
      const { items, currency } = req.body;

      const purchase = await this.payments.createPurchase(userId, items, currency);

      res.status(201).json({ success: true, data: purchase });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleRefund(req: Request, res: Response): Promise<void> {
    try {
      const { purchaseId, amount, reason, notes } = req.body;

      const refund = await this.payments.refundPurchase(purchaseId, amount, reason, notes);

      res.json({ success: true, data: refund });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleGetCustomer(req: Request, res: Response): Promise<void> {
    try {
      const customer = await this.database.findById('customers', req.params.id);

      res.json({ success: true, data: customer });
    } catch (error) {
      res.status(404).json({ success: false, error: String(error) });
    }
  }

  private async handleGetPlans(req: Request, res: Response): Promise<void> {
    try {
      const plans = await this.database.find('subscription_plans', { isActive: true });

      res.json({ success: true, data: plans });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleSubscribe(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserIdFromToken(req);
      const { planId, interval, paymentMethod } = req.body;

      const subscription = await this.subscriptions.subscribe(
        userId,
        planId,
        interval,
        paymentMethod
      );

      res.status(201).json({ success: true, data: subscription });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleCancelSubscription(req: Request, res: Response): Promise<void> {
    try {
      const { immediate, reason } = req.body;

      const subscription = await this.subscriptions.cancelSubscription(
        req.params.id,
        immediate,
        reason
      );

      res.json({ success: true, data: subscription });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handlePauseSubscription(req: Request, res: Response): Promise<void> {
    try {
      const { resumeDate } = req.body;

      const subscription = await this.subscriptions.pauseSubscription(
        req.params.id,
        resumeDate ? new Date(resumeDate) : undefined
      );

      res.json({ success: true, data: subscription });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleResumeSubscription(req: Request, res: Response): Promise<void> {
    try {
      const subscription = await this.subscriptions.resumeSubscription(req.params.id);

      res.json({ success: true, data: subscription });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleChangePlan(req: Request, res: Response): Promise<void> {
    try {
      const { newPlanId, immediate } = req.body;

      const subscription = await this.subscriptions.changeSubscriptionPlan(
        req.params.id,
        newPlanId,
        immediate
      );

      res.json({ success: true, data: subscription });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleGenerateKeys(req: Request, res: Response): Promise<void> {
    try {
      const { gameId, type, count, expiresAt } = req.body;

      const keys = await this.drm.generateProductKeys(
        gameId,
        type,
        count,
        expiresAt ? new Date(expiresAt) : undefined
      );

      res.status(201).json({ success: true, data: keys });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleRedeemKey(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserIdFromToken(req);
      const { key, hardwareProfile } = req.body;

      const license = await this.drm.redeemProductKey(key, userId, hardwareProfile);

      res.json({ success: true, data: license });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleActivateLicense(req: Request, res: Response): Promise<void> {
    try {
      const { licenseId, hardwareProfile, ipAddress } = req.body;

      const activation = await this.drm.activateLicense(
        licenseId,
        hardwareProfile,
        ipAddress
      );

      res.json({ success: true, data: activation });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleValidateLicense(req: Request, res: Response): Promise<void> {
    try {
      const { licenseId, hardwareProfile } = req.body;

      const validation = await this.drm.validateLicense(licenseId, hardwareProfile);

      res.json({ success: true, data: validation });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleHeartbeat(req: Request, res: Response): Promise<void> {
    try {
      const { activationId } = req.body;

      await this.drm.sendHeartbeat(activationId);

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleCheckUpdates(req: Request, res: Response): Promise<void> {
    try {
      const { currentVersion, platform } = req.query;

      const update = await this.drm.checkForUpdates(
        req.params.gameId,
        currentVersion as string,
        platform as string
      );

      res.json({ success: true, data: update });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleRegisterDeveloper(req: Request, res: Response): Promise<void> {
    try {
      const { email, companyName, displayName, tier } = req.body;

      const developer = await this.devPortal.registerDeveloper(
        email,
        companyName,
        displayName,
        tier
      );

      res.status(201).json({ success: true, data: developer });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleCreateApp(req: Request, res: Response): Promise<void> {
    try {
      const { name, description, category } = req.body;

      const app = await this.devPortal.createApplication(
        req.params.id,
        name,
        description,
        category
      );

      res.status(201).json({ success: true, data: app });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleGenerateAPIKey(req: Request, res: Response): Promise<void> {
    try {
      const { name, scopes, appIds, expiresIn } = req.body;

      const apiKey = await this.devPortal.generateAPIKey(
        req.params.id,
        name,
        scopes,
        appIds,
        expiresIn
      );

      res.status(201).json({ success: true, data: apiKey });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleUploadBuild(req: Request, res: Response): Promise<void> {
    try {
      const { version, platform, size } = req.body;

      const build = await this.devPortal.uploadBuild(
        req.params.id,
        version,
        platform,
        size
      );

      res.status(201).json({ success: true, data: build });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleSubmitForReview(req: Request, res: Response): Promise<void> {
    try {
      await this.devPortal.submitForReview(req.params.id);

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleGetAppAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const period = (req.query.period as any) || 'week';

      const analytics = await this.devPortal.getAnalytics(req.params.id, period);

      res.json({ success: true, data: analytics });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleLinkPlatform(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserIdFromToken(req);
      const { gameId, platform, platformUserId } = req.body;

      const profile = await this.crossProgression.linkPlatform(
        userId,
        gameId,
        platform,
        platformUserId
      );

      res.json({ success: true, data: profile });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleSyncProgression(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserIdFromToken(req);
      const { gameId, sourcePlatform } = req.body;

      const operation = await this.crossProgression.syncToAllPlatforms(
        userId,
        gameId,
        sourcePlatform
      );

      res.json({ success: true, data: operation });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleGetProgression(req: Request, res: Response): Promise<void> {
    try {
      const { gameId, platform } = req.query;

      const profile = await this.crossProgression.getPlayerProfile(
        req.params.userId,
        gameId as string,
        platform as any
      );

      res.json({ success: true, data: profile });
    } catch (error) {
      res.status(404).json({ success: false, error: String(error) });
    }
  }

  private async handleTransferItem(req: Request, res: Response): Promise<void> {
    try {
      const { userId, gameId, itemId, fromPlatform, toPlatform } = req.body;

      await this.crossProgression.transferItem(
        userId,
        gameId,
        itemId,
        fromPlatform,
        toPlatform
      );

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleGetBackups(req: Request, res: Response): Promise<void> {
    try {
      const { gameId } = req.query;

      const backups = this.crossProgression.getBackups(
        req.params.userId,
        gameId as string
      );

      res.json({ success: true, data: backups });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleTrackEvent(req: Request, res: Response): Promise<void> {
    try {
      const { userId, gameId, eventType, eventName, properties, sessionId } = req.body;

      const event = await this.analytics.trackEvent(
        userId,
        gameId,
        eventType,
        eventName,
        properties,
        sessionId
      );

      res.status(201).json({ success: true, data: event });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleCreateCohort(req: Request, res: Response): Promise<void> {
    try {
      const { name, type, startDate, endDate } = req.body;

      const cohort = await this.analytics.createCohort(
        name,
        type,
        new Date(startDate),
        new Date(endDate)
      );

      res.status(201).json({ success: true, data: cohort });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleCreateFunnel(req: Request, res: Response): Promise<void> {
    try {
      const { name, steps } = req.body;

      const funnel = await this.analytics.createFunnel(name, steps);

      res.status(201).json({ success: true, data: funnel });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleCalculateLTV(req: Request, res: Response): Promise<void> {
    try {
      const { userId, segment, cohort } = req.query;

      const ltv = await this.analytics.calculateLTV(
        userId as string,
        segment as string,
        cohort as string
      );

      res.json({ success: true, data: ltv });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleGetRetention(req: Request, res: Response): Promise<void> {
    try {
      const period = (req.query.period as any) || 'day';

      const retention = await this.analytics.analyzeRetention(period);

      res.json({ success: true, data: retention });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleGetLeaderboard(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 100;

      const leaderboard = this.skillRating.getLeaderboard(limit);

      res.json({ success: true, data: leaderboard });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleSubmitScore(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserIdFromToken(req);
      const { score, metadata } = req.body;

      // Submit score to leaderboard
      await this.database.insert('leaderboard_entries', {
        userId,
        gameType: req.params.gameType,
        score,
        metadata,
        timestamp: new Date()
      });

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleAddFriend(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserIdFromToken(req);
      const { friendId } = req.body;

      await this.database.insert('friend_requests', {
        fromUserId: userId,
        toUserId: friendId,
        status: 'pending',
        createdAt: new Date()
      });

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleGetFriends(req: Request, res: Response): Promise<void> {
    try {
      const friends = await this.database.find('friends', {
        userId: req.params.userId
      });

      res.json({ success: true, data: friends });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleCreateParty(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserIdFromToken(req);
      const { maxSize, settings } = req.body;

      const party = await this.database.insert('parties', {
        leaderId: userId,
        maxSize,
        settings,
        members: [userId],
        createdAt: new Date()
      });

      res.status(201).json({ success: true, data: party });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleJoinParty(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserIdFromToken(req);

      const party = await this.database.findById('parties', req.params.id);

      if (!party) {
        throw new Error('Party not found');
      }

      party.members.push(userId);

      await this.database.updateById('parties', req.params.id, party);

      res.json({ success: true, data: party });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleGetSystemStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = {
        platform: await this.platform.getStats(),
        payments: await this.payments.getStats(),
        subscriptions: await this.subscriptions.getStats(),
        analytics: await this.analytics.getStats(),
        crossProgression: await this.crossProgression.getStats(),
        drm: await this.drm.getStats(),
        skillRating: this.skillRating.getStats()
      };

      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleGetMetrics(req: Request, res: Response): Promise<void> {
    try {
      const metrics = Array.from(this.metrics.entries()).map(([key, count]) => ({
        endpoint: key,
        requests: count
      }));

      res.json({ success: true, data: metrics });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  private async handleModerateContent(req: Request, res: Response): Promise<void> {
    try {
      const { contentId, contentType, action, reason } = req.body;

      await this.database.insert('moderation_actions', {
        contentId,
        contentType,
        action,
        reason,
        timestamp: new Date()
      });

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ success: false, error: String(error) });
    }
  }

  // ==================== WEBSOCKET SETUP ====================

  private setupWebSockets(): void {
    this.io.on('connection', (socket) => {
      console.log(`[WebSocket] Client connected: ${socket.id}`);

      socket.on('authenticate', async (data) => {
        try {
          const { token } = data;
          // Verify token and associate socket with user
          const userId = this.verifyToken(token);

          this.activeSessions.set(socket.id, {
            userId,
            connectedAt: new Date()
          });

          socket.emit('authenticated', { userId });
        } catch (error) {
          socket.emit('error', { message: 'Authentication failed' });
        }
      });

      socket.on('join_match', async (data) => {
        const session = this.activeSessions.get(socket.id);
        if (!session) return;

        socket.join(`match_${data.matchId}`);
        this.io.to(`match_${data.matchId}`).emit('player_joined', {
          userId: session.userId
        });
      });

      socket.on('match_event', async (data) => {
        const session = this.activeSessions.get(socket.id);
        if (!session) return;

        this.io.to(`match_${data.matchId}`).emit('match_update', data);
      });

      socket.on('chat_message', async (data) => {
        const session = this.activeSessions.get(socket.id);
        if (!session) return;

        this.io.to(data.channel).emit('message', {
          userId: session.userId,
          message: data.message,
          timestamp: new Date()
        });
      });

      socket.on('disconnect', () => {
        console.log(`[WebSocket] Client disconnected: ${socket.id}`);
        this.activeSessions.delete(socket.id);
      });
    });
  }

  // ==================== UTILITY METHODS ====================

  private setupErrorHandling(): void {
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('[API Error]', err);

      res.status(500).json({
        success: false,
        error: this.config.environment === 'development' ? err.message : 'Internal server error'
      });
    });
  }

  private generateToken(userId: string): string {
    // Simplified - should use JWT
    return Buffer.from(`${userId}:${Date.now()}`).toString('base64');
  }

  private getUserIdFromToken(req: Request): string {
    const auth = req.headers.authorization;

    if (!auth) {
      throw new Error('No authorization header');
    }

    const token = auth.replace('Bearer ', '');
    return this.verifyToken(token);
  }

  private verifyToken(token: string): string {
    try {
      const decoded = Buffer.from(token, 'base64').toString();
      const [userId] = decoded.split(':');
      return userId;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  private getEndpointsList(): any[] {
    const routes: any[] = [];

    this.app._router.stack.forEach((middleware: any) => {
      if (middleware.route) {
        routes.push({
          path: middleware.route.path,
          methods: Object.keys(middleware.route.methods)
        });
      }
    });

    return routes;
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      // Connect to database
      await this.database.connect();
      console.log('[API] Database connected');

      // Start HTTP server
      await new Promise<void>((resolve) => {
        this.httpServer.listen(this.config.port, () => {
          console.log(`[API] Server running on port ${this.config.port}`);
          console.log(`[API] Environment: ${this.config.environment}`);
          console.log(`[API] WebSocket server ready`);
          resolve();
        });
      });
    } catch (error) {
      console.error('[API] Failed to start server:', error);
      throw error;
    }
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    await this.database.disconnect();

    await new Promise<void>((resolve, reject) => {
      this.httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log('[API] Server stopped');
  }

  /**
   * Get server instance
   */
  getApp(): Express {
    return this.app;
  }

  /**
   * Get HTTP server instance
   */
  getHTTPServer(): HTTPServer {
    return this.httpServer;
  }

  /**
   * Get Socket.IO server instance
   */
  getSocketServer(): SocketIOServer {
    return this.io;
  }
}

// Export server instance creation
export function createAPIServer(config: Partial<APIConfig> = {}): IntegratedAPIServer {
  const defaultConfig: APIConfig = {
    port: parseInt(process.env.PORT || '3000'),
    environment: (process.env.NODE_ENV as any) || 'development',
    enableDocs: true,
    enableMetrics: true,
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      max: 100
    }
  };

  return new IntegratedAPIServer({ ...defaultConfig, ...config });
}
