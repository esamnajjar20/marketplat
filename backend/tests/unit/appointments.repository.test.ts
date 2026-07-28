import { appointmentsRepository } from '../../src/modules/appointments/appointments.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    appointment: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const providerId = 'provider-1';

describe('appointmentsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('findOverlapping', () => {
    it('queries for a SCHEDULED overlap using the interval-overlap condition', async () => {
      const start = new Date('2026-08-01T10:00:00.000Z');
      const end = new Date('2026-08-01T11:00:00.000Z');
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);

      await appointmentsRepository.findOverlapping(providerId, start, end);

      expect(prisma.appointment.findFirst).toHaveBeenCalledWith({
        where: {
          providerId,
          status: 'SCHEDULED',
          scheduledStart: { lt: end },
          scheduledEnd: { gt: start },
        },
      });
    });
  });

  describe('create', () => {
    it('creates an appointment with all fields including requestId and notes', async () => {
      const data = {
        requestId: 'req-1',
        scheduledStart: new Date('2026-08-01T10:00:00.000Z'),
        scheduledEnd: new Date('2026-08-01T11:00:00.000Z'),
        notes: 'Bring documents',
      };
      (prisma.appointment.create as jest.Mock).mockResolvedValue({ id: 'appt-1', ...data });

      await appointmentsRepository.create(providerId, data);

      expect(prisma.appointment.create).toHaveBeenCalledWith({
        data: {
          providerId,
          requestId: data.requestId,
          scheduledStart: data.scheduledStart,
          scheduledEnd: data.scheduledEnd,
          notes: data.notes,
        },
      });
    });

    it('creates an appointment with requestId and notes omitted', async () => {
      const data = {
        scheduledStart: new Date('2026-08-01T10:00:00.000Z'),
        scheduledEnd: new Date('2026-08-01T11:00:00.000Z'),
      };
      (prisma.appointment.create as jest.Mock).mockResolvedValue({ id: 'appt-1', ...data });

      await appointmentsRepository.create(providerId, data);

      expect(prisma.appointment.create).toHaveBeenCalledWith({
        data: {
          providerId,
          requestId: undefined,
          scheduledStart: data.scheduledStart,
          scheduledEnd: data.scheduledEnd,
          notes: undefined,
        },
      });
    });
  });

  describe('findById', () => {
    it('queries by id', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(null);

      await appointmentsRepository.findById('appt-1');

      expect(prisma.appointment.findUnique).toHaveBeenCalledWith({ where: { id: 'appt-1' } });
    });
  });

  describe('updateStatus', () => {
    it('updates the status field for the given id', async () => {
      (prisma.appointment.update as jest.Mock).mockResolvedValue({ id: 'appt-1', status: 'COMPLETED' });

      await appointmentsRepository.updateStatus('appt-1', 'COMPLETED');

      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-1' },
        data: { status: 'COMPLETED' },
      });
    });
  });

  describe('findManyInRange', () => {
    it('queries SCHEDULED appointments overlapping the range, ordered by start time', async () => {
      const rangeStart = new Date('2026-08-01T09:00:00.000Z');
      const rangeEnd = new Date('2026-08-01T17:00:00.000Z');
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);

      await appointmentsRepository.findManyInRange(providerId, rangeStart, rangeEnd);

      expect(prisma.appointment.findMany).toHaveBeenCalledWith({
        where: {
          providerId,
          status: 'SCHEDULED',
          scheduledStart: { lt: rangeEnd },
          scheduledEnd: { gt: rangeStart },
        },
        orderBy: { scheduledStart: 'asc' },
      });
    });
  });

  describe('findManyByProviderId', () => {
    it('applies default page/limit and no date filter when the query is empty', async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);

      await appointmentsRepository.findManyByProviderId(providerId, {});

      expect(prisma.appointment.findMany).toHaveBeenCalledWith({
        where: { providerId },
        orderBy: { scheduledStart: 'asc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.appointment.count).toHaveBeenCalledWith({ where: { providerId } });
    });

    it('applies pagination skip/take from page and limit', async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);

      await appointmentsRepository.findManyByProviderId(providerId, { page: 3, limit: 10 });

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 })
      );
    });

    it('adds a scheduledStart.gte filter when only "from" is given', async () => {
      const from = new Date('2026-08-01T00:00:00.000Z');
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);

      await appointmentsRepository.findManyByProviderId(providerId, { from });

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { providerId, scheduledStart: { gte: from } },
        })
      );
    });

    it('adds a scheduledStart.lte filter when only "to" is given', async () => {
      const to = new Date('2026-08-31T23:59:59.000Z');
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);

      await appointmentsRepository.findManyByProviderId(providerId, { to });

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { providerId, scheduledStart: { lte: to } },
        })
      );
    });

    it('combines gte and lte when both from and to are given', async () => {
      const from = new Date('2026-08-01T00:00:00.000Z');
      const to = new Date('2026-08-31T23:59:59.000Z');
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);

      await appointmentsRepository.findManyByProviderId(providerId, { from, to });

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { providerId, scheduledStart: { gte: from, lte: to } },
        })
      );
    });

    it('returns the appointments and total from the parallel queries', async () => {
      const appointments = [{ id: 'appt-1' }, { id: 'appt-2' }];
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue(appointments);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(2);

      const result = await appointmentsRepository.findManyByProviderId(providerId, {});

      expect(result).toEqual({ appointments, total: 2 });
    });
  });
});
