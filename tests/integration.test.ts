/**
 * Comprehensive Integration Tests
 * Tests all major platform features end-to-end
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createAPIServer, IntegratedAPIServer } from '../src/api/integrated-api-server';
import axios, { AxiosInstance } from 'axios';

describe('Game Platform Integration Tests', () => {
  let server: IntegratedAPIServer;
  let api: AxiosInstance;
  let authToken: string;
  let userId: string;
  let sessionId: string;

  beforeAll(async () => {
    // Start test server
    server = createAPIServer({
      port: 3001,
      environment: 'test',
      corsOrigins: ['http://localhost'],
      enableDocs: false,
      enableMetrics: false,
      rateLimit: { windowMs: 900000, max: 1000 }
    });

    await server.start();

    api = axios.create({
      baseURL: 'http://localhost:3001/api/v1',
      validateStatus: () => true
    });
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('Authentication Flow', () => {
    it('should register a new user', async () => {
      const response = await api.post('/auth/register', {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Test123!'
      });

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('token');
      expect(response.data.data).toHaveProperty('userId');

      authToken = response.data.data.token;
      userId = response.data.data.userId;
    });

    it('should login existing user', async () => {
      const response = await api.post('/auth/login', {
        username: 'testuser',
        password: 'Test123!'
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('token');
    });

    it('should reject invalid credentials', async () => {
      const response = await api.post('/auth/login', {
        username: 'testuser',
        password: 'wrongpassword'
      });

      expect(response.status).toBe(401);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Player Management', () => {
    it('should get player profile', async () => {
      const response = await api.get(`/players/${userId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('id');
      expect(response.data.data).toHaveProperty('username');
    });

    it('should update player profile', async () => {
      const response = await api.put(`/players/${userId}`, {
        displayName: 'Test Player'
      }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it('should get player stats', async () => {
      const response = await api.get(`/players/${userId}/stats`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });
  });

  describe('Matchmaking System', () => {
    it('should join matchmaking queue', async () => {
      const response = await api.post('/matchmaking/queue', {
        gameType: 'fps',
        region: 'us-east',
        preferences: {}
      }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('queuePosition');
    });

    it('should get matchmaking status', async () => {
      const response = await api.get('/matchmaking/status', {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it('should get player rating', async () => {
      const response = await api.get(`/matchmaking/rating/${userId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('rating');
    });

    it('should leave matchmaking queue', async () => {
      const response = await api.delete('/matchmaking/queue', {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });
  });

  describe('Game Sessions', () => {
    it('should create game session', async () => {
      const response = await api.post('/sessions', {
        gameType: 'fps',
        maxPlayers: 10,
        settings: { map: 'dust2', mode: 'deathmatch' }
      }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('id');

      sessionId = response.data.data.id;
    });

    it('should join session', async () => {
      const response = await api.post(`/sessions/${sessionId}/join`, {}, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it('should get session info', async () => {
      const response = await api.get(`/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it('should list sessions', async () => {
      const response = await api.get('/sessions?limit=10', {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(Array.isArray(response.data.data)).toBe(true);
    });
  });

  describe('Payment System', () => {
    let paymentIntentId: string;

    it('should create payment intent', async () => {
      const response = await api.post('/payments/intent', {
        amount: 99.99,
        currency: 'USD',
        provider: 'stripe',
        method: 'card',
        description: 'Test purchase'
      }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('id');

      paymentIntentId = response.data.data.id;
    });

    it('should process payment', async () => {
      const response = await api.post('/payments/process', {
        paymentIntentId
      }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });
  });

  describe('Subscription Management', () => {
    it('should get subscription plans', async () => {
      const response = await api.get('/subscriptions/plans', {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(Array.isArray(response.data.data)).toBe(true);
    });

    it('should subscribe to plan', async () => {
      const plans = await api.get('/subscriptions/plans', {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      if (plans.data.data.length > 0) {
        const planId = plans.data.data[0].id;

        const response = await api.post('/subscriptions/subscribe', {
          planId,
          interval: 'monthly',
          paymentMethod: 'card'
        }, {
          headers: { Authorization: `Bearer ${authToken}` }
        });

        expect(response.status).toBe(201);
        expect(response.data.success).toBe(true);
      }
    });
  });

  describe('Analytics', () => {
    it('should track event', async () => {
      const response = await api.post('/analytics/track', {
        userId,
        gameId: 'test-game',
        eventType: 'custom',
        eventName: 'test_event',
        properties: { test: true }
      }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
    });

    it('should calculate LTV', async () => {
      const response = await api.get(`/analytics/ltv?userId=${userId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('ltv');
    });
  });

  describe('Social Features', () => {
    it('should create party', async () => {
      const response = await api.post('/social/party/create', {
        maxSize: 4,
        settings: {}
      }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
    });
  });

  describe('Developer Portal', () => {
    let developerId: string;

    it('should register as developer', async () => {
      const response = await api.post('/developers/register', {
        email: 'dev@example.com',
        companyName: 'Test Studios',
        displayName: 'Test Dev',
        tier: 'indie'
      }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('id');

      developerId = response.data.data.id;
    });

    it('should create app', async () => {
      const response = await api.post(`/developers/${developerId}/apps`, {
        name: 'Test Game',
        description: 'A test game',
        category: 'fps'
      }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
    });

    it('should generate API key', async () => {
      const response = await api.post(`/developers/${developerId}/api-keys`, {
        name: 'Test API Key',
        scopes: ['read', 'write'],
        appIds: []
      }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('key');
      expect(response.data.data).toHaveProperty('secret');
    });
  });

  describe('Admin Features', () => {
    it('should get system stats', async () => {
      const response = await api.get('/admin/stats', {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('platform');
    });

    it('should get metrics', async () => {
      const response = await api.get('/admin/metrics', {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(Array.isArray(response.data.data)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should require authentication', async () => {
      const response = await api.get(`/players/${userId}`);

      expect(response.status).toBe(401);
    });

    it('should handle not found', async () => {
      const response = await api.get('/players/invalid-id', {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.status).toBe(404);
    });
  });
});
