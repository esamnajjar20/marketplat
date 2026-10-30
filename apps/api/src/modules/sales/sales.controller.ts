import { Request, Response, NextFunction } from 'express';
import { salesService } from './sales.service';
import { salesAutomationService } from './salesAutomation.service';
import { salesInsightsService } from './salesInsights.service';
import { requestJsonWithGoFallback } from '../../shared/go-worker/requestJsonWithFallback';
import { streamCsvWithGoFallback } from '../../shared/go-worker/streamCsvWithFallback';
import { buildSalesReportCsv } from './salesReportCsv';
import {
  createSaleSchema,
  updateSaleSchema,
  saleIdSchema,
  listSalesSchema,
  addPaymentSchema,
  returnSaleSchema,
  statsPeriodSchema,
  compareSchema,
  topSchema,
  updateCostSettingsSchema,
  updateProductCostSchema,
  reportQuerySchema,
} from './sales.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';
import { paginationQuerySchema } from '../../shared/utils/pagination';

export const salesController = {
  costSettings: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      res.json(
        successResponse(
          'Sales cost settings fetched',
          await salesService.getCostSettings(user.userId)
        )
      );
    } catch (e) {
      next(e);
    }
  },
  updateCostSettings: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { body } = updateCostSettingsSchema.parse({ body: req.body });
      res.json(
        successResponse(
          'Sales cost settings updated',
          await salesService.updateCostSettings(user.userId, body)
        )
      );
    } catch (e) {
      next(e);
    }
  },
  costProducts: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      res.json(
        successResponse(
          'Sales cost products fetched',
          await salesService.listCostProducts(user.userId)
        )
      );
    } catch (e) {
      next(e);
    }
  },
  updateProductCost: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const parsed = updateProductCostSchema.parse({ params: req.params, body: req.body });
      res.json(
        successResponse(
          'Product cost updated',
          await salesService.updateProductCost(user.userId, parsed.params.productId, parsed.body)
        )
      );
    } catch (e) {
      next(e);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { body } = createSaleSchema.parse({ body: req.body });
      res
        .status(201)
        .json(
          successResponse(
            'Sale created',
            await salesService.create(
              user.userId,
              body,
              (req.headers['x-offline-op-id'] as string | undefined) ??
                (req.headers['X-Offline-Op-Id'] as string | undefined)
            )
          )
        );
    } catch (e) {
      next(e);
    }
  },
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { query } = listSalesSchema.parse({ query: req.query });
      res.json(successResponse('Sales fetched', await salesService.list(user.userId, query)));
    } catch (e) {
      next(e);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { params } = saleIdSchema.parse({ params: req.params });
      res.json(successResponse('Sale fetched', await salesService.getById(user.userId, params.id)));
    } catch (e) {
      next(e);
    }
  },
  receipt: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { params } = saleIdSchema.parse({ params: req.params });
      const sale = await salesService.getById(user.userId, params.id);
      res.json(
        successResponse('Receipt data fetched', { invoiceNumber: sale.invoiceNumber, sale })
      );
    } catch (e) {
      next(e);
    }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const parsed = updateSaleSchema.parse({ params: req.params, body: req.body });
      res.json(
        successResponse(
          'Sale updated',
          await salesService.update(user.userId, parsed.params.id, parsed.body)
        )
      );
    } catch (e) {
      next(e);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { params } = saleIdSchema.parse({ params: req.params });
      await salesService.remove(user.userId, params.id);
      res.json(successResponse('Sale deleted'));
    } catch (e) {
      next(e);
    }
  },
  addPayment: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const parsed = addPaymentSchema.parse({ params: req.params, body: req.body });
      res.json(
        successResponse(
          'Payment added',
          await salesService.addPayment(user.userId, parsed.params.id, parsed.body)
        )
      );
    } catch (e) {
      next(e);
    }
  },
  addReturn: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const parsed = returnSaleSchema.parse({ params: req.params, body: req.body });
      res.json(
        successResponse(
          'Return recorded',
          await salesService.addReturn(user.userId, parsed.params.id, parsed.body)
        )
      );
    } catch (e) {
      next(e);
    }
  },
  summary: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { query } = statsPeriodSchema.parse({ query: req.query });
      res.json(
        successResponse(
          'Sales summary fetched',
          await salesService.summary(user.userId, query.period)
        )
      );
    } catch (e) {
      next(e);
    }
  },
  chart: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { query } = statsPeriodSchema.parse({ query: req.query });
      const to = query.to ?? new Date();
      const from = query.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      res.json(
        successResponse(
          'Sales chart fetched',
          await salesService.chart(user.userId, from, to, query.period)
        )
      );
    } catch (e) {
      next(e);
    }
  },
  compare: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { query } = compareSchema.parse({ query: req.query });
      res.json(
        successResponse(
          'Sales comparison fetched',
          await salesService.compare(user.userId, query.period)
        )
      );
    } catch (e) {
      next(e);
    }
  },
  top: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { query } = topSchema.parse({ query: req.query });
      const [products, customers] = await salesService.top(user.userId, query.limit);
      res.json(successResponse('Top sales fetched', { products, customers }));
    } catch (e) {
      next(e);
    }
  },
  dashboard: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      res.json(
        successResponse('Sales dashboard fetched', await salesService.dashboard(user.userId))
      );
    } catch (e) {
      next(e);
    }
  },
  report: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { query } = reportQuerySchema.parse({ query: req.query });
      res.json(
        successResponse('Sales report fetched', await salesService.report(user.userId, query))
      );
    } catch (e) {
      next(e);
    }
  },
  reportCsv: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { query } = reportQuerySchema.parse({ query: req.query });
      await streamCsvWithGoFallback({
        jobName: 'seller-sales-csv',
        path: '/internal/exports/sales.csv',
        filename: 'sales-report.csv',
        method: 'POST',
        response: res,
        body: {
          userId: user.userId,
          from: query.from?.toISOString(),
          to: query.to?.toISOString(),
          storeId: query.storeId,
          status: query.status,
          limit: String(query.limit),
        },
        runExpressFallback: async () => {
          const report = await salesService.report(user.userId, query);
          return buildSalesReportCsv(report.rows);
        },
      });
    } catch (e) {
      next(e);
    }
  },
  debtSummary: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      res.json(
        successResponse('Debt summary fetched', await salesService.debtSummary(user.userId))
      );
    } catch (e) {
      next(e);
    }
  },
  debts: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const query = paginationQuerySchema.parse(req.query);
      res.json(
        successResponse(
          'Sales debts fetched',
          await salesService.debts(user.userId, query.page ?? 1, query.limit ?? 20)
        )
      );
    } catch (e) {
      next(e);
    }
  },
  automationRun: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      res.json(
        successResponse('Sales automation completed', await salesAutomationService.run(user.userId))
      );
    } catch (e) {
      next(e);
    }
  },
  smartInsights: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      type SalesInsightsResult = Awaited<ReturnType<typeof salesInsightsService.get>>;
      const isSalesInsightsResult = (value: unknown): value is SalesInsightsResult => {
        if (!value || typeof value !== 'object') return false;
        const result = value as Record<string, unknown>;
        const kpis = result.kpis as Record<string, unknown> | undefined;
        const forecast = result.forecast as Record<string, unknown> | undefined;
        const isNumber = (candidate: unknown): candidate is number =>
          typeof candidate === 'number' && Number.isFinite(candidate);
        return (
          typeof result.generatedAt === 'string' && Number.isFinite(Date.parse(result.generatedAt)) &&
          result.periodDays === 30 &&
          Boolean(kpis) &&
          isNumber(kpis?.revenue) &&
          isNumber(kpis?.previousRevenue) &&
          isNumber(kpis?.revenueChange) &&
          isNumber(kpis?.orders) &&
          isNumber(kpis?.averageTicket) &&
          isNumber(kpis?.overdueAmount) &&
          isNumber(kpis?.lowStockProducts) &&
          Boolean(forecast) &&
          isNumber(forecast?.next30DaysRevenue) &&
          forecast?.method === '30-day run-rate adjusted by 7-day trend' &&
          Array.isArray(result.topProducts) &&
          result.topProducts.every(item => {
            if (!item || typeof item !== 'object') return false;
            const product = item as Record<string, unknown>;
            return (
              typeof product.title === 'string' &&
              isNumber(product.revenue) &&
              isNumber(product.cost) &&
              isNumber(product.quantity) &&
              isNumber(product.profit) &&
              isNumber(product.margin)
            );
          }) &&
          Array.isArray(result.insights) &&
          result.insights.every(item => {
            if (!item || typeof item !== 'object') return false;
            const insight = item as Record<string, unknown>;
            return (
              typeof insight.id === 'string' &&
              typeof insight.severity === 'string' &&
              typeof insight.category === 'string' &&
              typeof insight.title === 'string' &&
              typeof insight.body === 'string' &&
              isNumber(insight.metric) &&
              typeof insight.unit === 'string'
            );
          })
        );
      };
      const insights = await requestJsonWithGoFallback<SalesInsightsResult>({
        jobName: 'sales-smart-insights',
        path: '/internal/reports/sales-insights',
        body: { userId: user.userId },
        validateResult: isSalesInsightsResult,
        timeoutMs: 2_500,
        runExpressFallback: () => salesInsightsService.get(user.userId),
      });
      res.json(successResponse('Sales smart insights fetched', insights));
    } catch (e) {
      next(e);
    }
  },
};
