import { Router } from 'express';
import authRoutes from './authRoutes';
import itemRoutes from './itemRoutes';
import userRoutes from './userRoutes';

const router = Router();

// Mount extracted route modules
router.use(authRoutes);           // /api/auth-status, /api/session, /api/auth/*
router.use('/items', itemRoutes); // /api/items/*
router.use('/users', userRoutes); // /api/users/*

// Future route modules will be added here:
// router.use('/trades', tradeRoutes);
// router.use('/chains', chainRoutes);
// router.use('/disputes', disputeRoutes);
// router.use('/notifications', notificationRoutes);
// router.use('/subscription', subscriptionRoutes);
// router.use('/ebay', ebayRoutes);
// router.use('/admin', adminRoutes);

export default router;
