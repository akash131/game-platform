import axios, { AxiosInstance } from 'axios';
import { io, Socket } from 'socket.io-client';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

class APIClient {
  private http: AxiosInstance;
  private socket: Socket | null = null;

  constructor() {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    this.http.interceptors.request.use((config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    this.http.interceptors.response.use(
      (response) => response.data,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Authentication
  async register(username: string, email: string, password: string) {
    return this.http.post('/auth/register', { username, email, password });
  }

  async login(username: string, password: string) {
    const response = await this.http.post('/auth/login', { username, password });
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
    }
    return response;
  }

  async logout() {
    await this.http.post('/auth/logout');
    localStorage.removeItem('token');
  }

  // Players
  async getPlayer(id: string) {
    return this.http.get(`/players/${id}`);
  }

  async updatePlayer(id: string, data: any) {
    return this.http.put(`/players/${id}`, data);
  }

  async getPlayerStats(id: string) {
    return this.http.get(`/players/${id}/stats`);
  }

  // Matchmaking
  async joinQueue(gameType: string, preferences: any) {
    return this.http.post('/matchmaking/queue', { gameType, preferences });
  }

  async leaveQueue() {
    return this.http.delete('/matchmaking/queue');
  }

  async getMatchmakingStatus() {
    return this.http.get('/matchmaking/status');
  }

  async getRating(userId: string) {
    return this.http.get(`/matchmaking/rating/${userId}`);
  }

  // Sessions
  async createSession(gameType: string, maxPlayers: number, settings: any) {
    return this.http.post('/sessions', { gameType, maxPlayers, settings });
  }

  async getSession(id: string) {
    return this.http.get(`/sessions/${id}`);
  }

  async joinSession(id: string) {
    return this.http.post(`/sessions/${id}/join`);
  }

  async leaveSession(id: string) {
    return this.http.delete(`/sessions/${id}/leave`);
  }

  async listSessions(limit: number = 20) {
    return this.http.get(`/sessions?limit=${limit}`);
  }

  // Payments & Store
  async getSubscriptionPlans() {
    return this.http.get('/subscriptions/plans');
  }

  async subscribe(planId: string, interval: string, paymentMethod: string) {
    return this.http.post('/subscriptions/subscribe', { planId, interval, paymentMethod });
  }

  async createPaymentIntent(amount: number, currency: string, provider: string, method: string) {
    return this.http.post('/payments/intent', { amount, currency, provider, method });
  }

  async createPurchase(items: any[], currency: string) {
    return this.http.post('/payments/purchase', { items, currency });
  }

  // Leaderboards
  async getLeaderboard(gameType: string, limit: number = 100) {
    return this.http.get(`/leaderboards/${gameType}?limit=${limit}`);
  }

  async submitScore(gameType: string, score: number, metadata: any) {
    return this.http.post(`/leaderboards/${gameType}/submit`, { score, metadata });
  }

  // Social
  async addFriend(friendId: string) {
    return this.http.post('/social/friends/add', { friendId });
  }

  async getFriends(userId: string) {
    return this.http.get(`/social/friends/${userId}`);
  }

  async createParty(maxSize: number, settings: any) {
    return this.http.post('/social/party/create', { maxSize, settings });
  }

  async joinParty(partyId: string) {
    return this.http.post(`/social/party/${partyId}/join`);
  }

  // Analytics
  async trackEvent(userId: string, gameId: string, eventType: string, eventName: string, properties: any) {
    return this.http.post('/analytics/track', { userId, gameId, eventType, eventName, properties });
  }

  async getRetention(period: string) {
    return this.http.get(`/analytics/retention?period=${period}`);
  }

  async calculateLTV(userId?: string, segment?: string, cohort?: string) {
    return this.http.get('/analytics/ltv', { params: { userId, segment, cohort } });
  }

  // Developer Portal
  async registerDeveloper(email: string, companyName: string, displayName: string, tier: string) {
    return this.http.post('/developers/register', { email, companyName, displayName, tier });
  }

  async createApp(developerId: string, name: string, description: string, category: string) {
    return this.http.post(`/developers/${developerId}/apps`, { name, description, category });
  }

  async generateAPIKey(developerId: string, name: string, scopes: string[], appIds: string[]) {
    return this.http.post(`/developers/${developerId}/api-keys`, { name, scopes, appIds });
  }

  async getAppAnalytics(appId: string, period: string) {
    return this.http.get(`/apps/${appId}/analytics?period=${period}`);
  }

  // Cross-Progression
  async linkPlatform(gameId: string, platform: string, platformUserId: string) {
    return this.http.post('/progression/link-platform', { gameId, platform, platformUserId });
  }

  async syncProgression(gameId: string, sourcePlatform: string) {
    return this.http.post('/progression/sync', { gameId, sourcePlatform });
  }

  async getProgression(userId: string, gameId: string, platform: string) {
    return this.http.get(`/progression/${userId}?gameId=${gameId}&platform=${platform}`);
  }

  // Admin
  async getSystemStats() {
    return this.http.get('/admin/stats');
  }

  async getMetrics() {
    return this.http.get('/admin/metrics');
  }

  // WebSocket
  connectWebSocket(token: string) {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      console.log('[WebSocket] Connected');
      this.socket?.emit('authenticate', { token });
    });

    this.socket.on('disconnect', () => {
      console.log('[WebSocket] Disconnected');
    });

    this.socket.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
    });

    return this.socket;
  }

  disconnectWebSocket() {
    this.socket?.disconnect();
    this.socket = null;
  }

  on(event: string, handler: (...args: any[]) => void) {
    this.socket?.on(event, handler);
  }

  emit(event: string, data: any) {
    this.socket?.emit(event, data);
  }
}

export const apiClient = new APIClient();
export default apiClient;
