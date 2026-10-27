import { appointmentsRepository } from '../../src/modules/appointments/appointments.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    appointment: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
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
    it('atomically transitions only a SCHEDULED appointment', async () => {
      const updated = { id: 'appt-1', status: 'COMPLETED' };
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue(updated);

      await expect(appointmentsRepository.updateStatus('appt-1', 'COMPLETED')).resolves.toEqual(updated);

      expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
        where: { id: 'appt-1', status: 'SCHEDULED' },
        data: { status: 'COMPLETED' },
      });
      expect(prisma.appointment.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 'appt-1' } });
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('rejects a stale concurrent transition when the appointment is no longer SCHEDULED', async () => {
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(appointmentsRepository.updateStatus('appt-1', 'CANCELLED')).rejects.toMatchObject({
        code: 'APPOINTMENT_NOT_SCHEDULED',
      });
      expect(prisma.appointment.findUniqueOrThrow).not.toHaveBeenCalled();
    });
  });

  describe('findManyInRange', () => {
    it('queries SCHEDULED appointments overlapping the range, ordered by start time', async () => {
      const rangeStart = new Date('2026-08-01T09:00:00.000Z');
      const rangeEnd = new Date('2026-08-01T17:00:00.000Z');
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);

      await appointmentsRepository.findManyInRange(providerId, rangeStart, rangeEnd);

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            providerId,
            status: 'SCHEDULED',
            scheduledStart: { lt: rangeEnd },
            scheduledEnd: { gt: rangeStart },
          }),
        })
      );
    });
  });

  describe('findManyByUserId', () => {
    it('applies default page/limit and no date filter when the query is empty', async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);

      await appointmentsRepository.findManyByUserId(providerId, 'user-1', {});

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
          orderBy: expect.anything(),
        })
      );
      expect(prisma.appointment.count).toHaveBeenCalled();
    });

    it('applies pagination skip/take from page and limit', async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);

      await appointmentsRepository.findManyByUserId(providerId, 'user-1', { page: 3, limit: 10 });

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 })
      );
    });

    it('adds a scheduledStart.gte filter when only "from" is given', async () => {
      const from = new Date('2026-08-01T00:00:00.000Z');
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);

      await appointmentsRepository.findManyByUserId(providerId, 'user-1', { from });

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            scheduledStart: expect.objectContaining({ gte: from }),
          }),
        })
      );
    });

    it('adds a scheduledStart.lte filter when only "to" is given', async () => {
      const to = new Date('2026-08-31T23:59:59.000Z');
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);

      await appointmentsRepository.findManyByUserId(providerId, 'user-1', { to });

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ providerId }, { request: { customerId: 'user-1' } }],
            scheduledStart: { lte: to },
          },
        })
      );
    });

    it('combines gte and lte when both from and to are given', async () => {
      const from = new Date('2026-08-01T00:00:00.000Z');
      const to = new Date('2026-08-31T23:59:59.000Z');
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);

      await appointmentsRepository.findManyByUserId(providerId, 'user-1', { from, to });

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ providerId }, { request: { customerId: 'user-1' } }],
            scheduledStart: { gte: from, lte: to },
          },
        })
      );
    });

    it('returns the appointments and total from the parallel queries', async () => {
      const appointments = [{ id: 'appt-1' }, { id: 'appt-2' }];
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue(appointments);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(2);

      const result = await appointmentsRepository.findManyByUserId(providerId, 'user-1', {});

      expect(result).toEqual({ appointments, total: 2 });
    });
  });
});
