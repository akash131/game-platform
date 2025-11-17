import { Router, Request, Response } from 'express';
import { EconomySystem } from '../../economy/economy-system';

export function createEconomyRoutes(economySystem: EconomySystem): Router {
  const router = Router();

  /**
   * Get player wallet
   * GET /api/economy/wallet/:playerId
   */
  router.get('/wallet/:playerId', (req: Request, res: Response) => {
    const wallet = economySystem.getWallet(req.params.playerId);

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.json({ wallet });
  });

  /**
   * Add soft currency
   * POST /api/economy/wallet/:playerId/soft
   */
  router.post('/wallet/:playerId/soft', (req: Request, res: Response) => {
    try {
      const { amount, reason } = req.body;

      if (!amount || !reason) {
        return res.status(400).json({ error: 'Amount and reason required' });
      }

      economySystem.addSoftCurrency(req.params.playerId, amount, reason);

      res.json({ success: true, message: 'Soft currency added' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Get store items
   * GET /api/economy/store
   */
  router.get('/store', (req: Request, res: Response) => {
    const items = economySystem.getStoreItems();

    res.json({ items });
  });

  /**
   * Get store items by type
   * GET /api/economy/store/type/:type
   */
  router.get('/store/type/:type', (req: Request, res: Response) => {
    const items = economySystem.getStoreItemsByType(req.params.type);

    res.json({ items });
  });

  /**
   * Purchase item
   * POST /api/economy/store/purchase
   */
  router.post('/store/purchase', (req: Request, res: Response) => {
    try {
      const { playerId, itemId, currencyType } = req.body;

      if (!playerId || !itemId || !currencyType) {
        return res.status(400).json({ error: 'Player ID, item ID, and currency type required' });
      }

      economySystem.purchaseItem(playerId, itemId, currencyType);

      res.json({ success: true, message: 'Item purchased' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Get player inventory
   * GET /api/economy/inventory/:playerId
   */
  router.get('/inventory/:playerId', (req: Request, res: Response) => {
    const inventory = economySystem.getInventory(req.params.playerId);

    res.json({ inventory });
  });

  /**
   * Get transaction history
   * GET /api/economy/transactions/:playerId
   */
  router.get('/transactions/:playerId', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const transactions = economySystem.getTransactionHistory(req.params.playerId, limit);

    res.json({ transactions });
  });

  /**
   * Get bundles
   * GET /api/economy/bundles
   */
  router.get('/bundles', (req: Request, res: Response) => {
    const bundles = economySystem.getBundles();

    res.json({ bundles });
  });

  return router;
}
