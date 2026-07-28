import { appointmentsController } from '../../src/modules/appointments/appointments.controller';
import { appointmentsService } from '../../src/modules/appointments/appointments.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/appointments/appointments.service');
jest.mock('../../src/shared/utils/requireUser');

const mockAppointment = {
  id: 'appt-1',
  providerId: 'provider-1',
  status: 'SCHEDULED',
  scheduledStart: new Date('2099-08-01T10:00:00.000Z'),
  scheduledEnd: new Date('2099-08-01T11:00:00.000Z'),
} as any;

describe('appointmentsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId: 'user-1' });
  });

  describe('createAppointment', () => {
    it('returns 201 with the created appointment on success', async () => {
      const req = mockRequest({
        body: {
          scheduledStart: '2099-08-01T10:00:00.000Z',
          scheduledEnd: '2099-08-01T11:00:00.000Z',
        },
      });
      const res = mockResponse();
      const next = mockNext();
      (appointmentsService.createAppointment as jest.Mock).mockResolvedValue(mockAppointment);

      await appointmentsController.createAppointment(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: mockAppointment })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next(error) when the caller is unauthenticated', async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError('Authentication required');
      });

      await appointmentsController.createAppointment(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      expect(res.status).not.toHaveBeenCalled();
    });

    it('calls next(error) when the request body fails validation', async () => {
      const req = mockRequest({ body: { scheduledStart: 'not-a-date', scheduledEnd: 'also-not-a-date' } });
      const res = mockResponse();
      const next = mockNext();

      await appointmentsController.createAppointment(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(appointmentsService.createAppointment).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws', async () => {
      const req = mockRequest({
        body: {
          scheduledStart: '2099-08-01T10:00:00.000Z',
          scheduledEnd: '2099-08-01T11:00:00.000Z',
        },
      });
      const res = mockResponse();
      const next = mockNext();
      (appointmentsService.createAppointment as jest.Mock).mockRejectedValue(
        new NotFoundError('Service request not found')
      );

      await appointmentsController.createAppointment(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('getMyAppointments', () => {
    it('returns 200 with items and pagination meta on success', async () => {
      const req = mockRequest({ query: { page: '1', limit: '20' } });
      const res = mockResponse();
      const next = mockNext();
      (appointmentsService.getMyAppointments as jest.Mock).mockResolvedValue({
        items: [mockAppointment],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      });

      await appointmentsController.getMyAppointments(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: [mockAppointment],
          meta: expect.objectContaining({ pagination: expect.objectContaining({ total: 1 }) }),
        })
      );
    });

    it('calls next(error) when the caller is unauthenticated', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await appointmentsController.getMyAppointments(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) when query params fail validation', async () => {
      const req = mockRequest({ query: { page: '0' } });
      const res = mockResponse();
      const next = mockNext();

      await appointmentsController.getMyAppointments(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(appointmentsService.getMyAppointments).not.toHaveBeenCalled();
    });
  });

  describe('updateAppointmentStatus', () => {
    it('returns 200 with the updated appointment on success', async () => {
      const req = mockRequest({ params: { id: 'appt-1' }, body: { status: 'COMPLETED' } });
      const res = mockResponse();
      const next = mockNext();
      (appointmentsService.updateAppointmentStatus as jest.Mock).mockResolvedValue({
        ...mockAppointment,
        status: 'COMPLETED',
      });

      await appointmentsController.updateAppointmentStatus(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(appointmentsService.updateAppointmentStatus).toHaveBeenCalledWith(
        'user-1',
        'appt-1',
        'COMPLETED'
      );
    });

    it('calls next(error) for an invalid status value', async () => {
      const req = mockRequest({ params: { id: 'appt-1' }, body: { status: 'BOGUS' } });
      const res = mockResponse();
      const next = mockNext();

      await appointmentsController.updateAppointmentStatus(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(appointmentsService.updateAppointmentStatus).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws', async () => {
      const req = mockRequest({ params: { id: 'appt-1' }, body: { status: 'COMPLETED' } });
      const res = mockResponse();
      const next = mockNext();
      (appointmentsService.updateAppointmentStatus as jest.Mock).mockRejectedValue(
        new NotFoundError('Appointment not found')
      );

      await appointmentsController.updateAppointmentStatus(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('getAvailability', () => {
    it('returns 200 with availability on success (no auth required)', async () => {
      const req = mockRequest({ params: { providerId: 'provider-1' }, query: { date: '2026-08-03' } });
      const res = mockResponse();
      const next = mockNext();
      const availability = { date: '2026-08-03', available: true, freeRanges: [] };
      (appointmentsService.getAvailability as jest.Mock).mockResolvedValue(availability);

      await appointmentsController.getAvailability(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: availability })
      );
      // This endpoint is public — requireUser must never be called.
      expect(requireUser).not.toHaveBeenCalled();
    });

    it('calls next(error) for a malformed date', async () => {
      const req = mockRequest({ params: { providerId: 'provider-1' }, query: { date: 'not-a-date' } });
      const res = mockResponse();
      const next = mockNext();

      await appointmentsController.getAvailability(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(appointmentsService.getAvailability).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { providerId: 'provider-1' }, query: { date: '2026-08-03' } });
      const res = mockResponse();
      const next = mockNext();
      (appointmentsService.getAvailability as jest.Mock).mockRejectedValue(
        new NotFoundError('Service provider not found')
      );

      await appointmentsController.getAvailability(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });
});
