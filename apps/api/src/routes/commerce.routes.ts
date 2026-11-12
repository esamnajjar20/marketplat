import type { Router } from 'express';
import { storesRouter } from '../modules/commerce/stores';
import { storeTypesRouter, storeTypeFieldsRouter } from '../modules/commerce/store-types';
import { productsRouter } from '../modules/commerce/products';
import { marketplaceOrdersRouter } from '../modules/commerce/marketplace-orders';
import { productCategoriesRouter } from '../modules/commerce/product-categories';
import { promotionsRouter } from '../modules/commerce/promotions';
import { collectionsRouter } from '../modules/commerce/collections';
import { salesRouter, installmentsRouter, publicSalesStatsRouter } from '../modules/commerce/sales';
import { customersRouter } from '../modules/commerce/customers';

/** Stores, products, orders and the seller sales ledger. */
export function registerCommerceRoutes(router: Router): void {
  router.use('/stores', storesRouter);
  router.use('/store-types', storeTypesRouter);
  router.use('/store-types', storeTypeFieldsRouter);
  router.use('/products', productsRouter);
  router.use('/orders', marketplaceOrdersRouter);
  router.use('/product-categories', productCategoriesRouter);
  // PROMO-1: store-owner-only CRUD for scheduled product discounts — see
  // promotions.routes.ts's doc comment for why there's no public GET
  // here (public consumers see effects via products' effectivePrice
  // fields instead).
  router.use('/promotions', promotionsRouter);
  // COLLECTIONS (P1): owner CRUD + membership under /collections, plus
  // two public storefront reads (/collections/store/:storeId and
  // /collections/:id/products) — see collections.routes.ts's doc
  // comment for why those two public GETs don't collide with the
  // single-segment owner routes despite living in the same router.
  router.use('/collections', collectionsRouter);
  // SALES-LOG P1: private seller sales ledger and customer CRM.
  router.use('/sales', salesRouter);
  router.use('/sales/installments', installmentsRouter);
  router.use('/public/stores', publicSalesStatsRouter);
  router.use('/customers', customersRouter);
}
