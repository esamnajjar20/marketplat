import { redis } from '../../config/redis';
import { logger } from '../../shared/utils/logger';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { isPrismaError } from '../../shared/utils/prismaErrors';
import { serviceTypesRepository } from './service-types.repository';
import { CreateServiceTypeFieldInput, CreateServiceTypeInput, UpdateServiceTypeFieldInput, UpdateServiceTypeInput, validateServiceTypeFieldDefinition, validateServiceTypeCapabilitiesDefinition } from './service-types.validation';
export { validateServiceTypeFieldDefinition, validateServiceTypeCapabilitiesDefinition } from './service-types.validation';

const CACHE_KEY = 'service_types:active:v1';
const CACHE_TTL = 30 * 60;

export interface ServiceTypeCapabilities {
  appointments?: boolean; requestQuote?: boolean; remote?: boolean; atCustomer?: boolean; atProvider?: boolean;
  allowedPricingTypes?: Array<'FIXED' | 'STARTING_FROM' | 'NEGOTIABLE'>;
  allowedLocations?: Array<'AT_CUSTOMER' | 'AT_PROVIDER' | 'REMOTE'>;
}

export function getServiceTypeCapabilities(capabilities: unknown): ServiceTypeCapabilities {
  if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) return {};
  const raw = capabilities as Record<string, unknown>;
  const pricing = Array.isArray(raw.allowedPricingTypes) ? raw.allowedPricingTypes.filter((v): v is 'FIXED' | 'STARTING_FROM' | 'NEGOTIABLE' => ['FIXED','STARTING_FROM','NEGOTIABLE'].includes(String(v))) as Array<'FIXED' | 'STARTING_FROM' | 'NEGOTIABLE'> : undefined;
  const locations = Array.isArray(raw.allowedLocations) ? raw.allowedLocations.filter((v): v is 'AT_CUSTOMER' | 'AT_PROVIDER' | 'REMOTE' => ['AT_CUSTOMER','AT_PROVIDER','REMOTE'].includes(String(v))) as Array<'AT_CUSTOMER' | 'AT_PROVIDER' | 'REMOTE'> : undefined;
  return { appointments: typeof raw.appointments==='boolean'?raw.appointments:undefined, requestQuote: typeof raw.requestQuote==='boolean'?raw.requestQuote:undefined, remote: typeof raw.remote==='boolean'?raw.remote:undefined, atCustomer: typeof raw.atCustomer==='boolean'?raw.atCustomer:undefined, atProvider: typeof raw.atProvider==='boolean'?raw.atProvider:undefined, allowedPricingTypes: pricing, allowedLocations: locations };
}

export function validateServiceTypeCapabilities(serviceType: { capabilities: unknown }, pricingType: 'FIXED'|'STARTING_FROM'|'NEGOTIABLE', serviceLocation: 'AT_CUSTOMER'|'AT_PROVIDER'|'REMOTE'): void {
  const caps=getServiceTypeCapabilities(serviceType.capabilities);
  if (caps.allowedPricingTypes?.length && !caps.allowedPricingTypes.includes(pricingType)) throw new BadRequestError('This pricing type is not supported for this service type.','SERVICE_PRICING_TYPE_NOT_ALLOWED');
  if (caps.allowedLocations?.length && !caps.allowedLocations.includes(serviceLocation)) throw new BadRequestError('This service location is not supported for this service type.','SERVICE_LOCATION_NOT_ALLOWED');
  if (serviceLocation==='REMOTE' && caps.remote===false) throw new BadRequestError('Remote delivery is not supported for this service type.','SERVICE_REMOTE_NOT_ALLOWED');
  if (serviceLocation==='AT_CUSTOMER' && caps.atCustomer===false) throw new BadRequestError('Customer-location service is not supported for this service type.','SERVICE_AT_CUSTOMER_NOT_ALLOWED');
  if (serviceLocation==='AT_PROVIDER' && caps.atProvider===false) throw new BadRequestError('Provider-location service is not supported for this service type.','SERVICE_AT_PROVIDER_NOT_ALLOWED');
}

async function invalidate(): Promise<void> {
  try { await redis.del(CACHE_KEY); } catch { logger.warn('Service types cache invalidation failed'); }
}

export async function validateServiceTypeAttributes(
  serviceTypeId: string,
  attributes: Record<string, unknown> | undefined,
  scope: 'LISTING' | 'PROVIDER',
  options: { allowInactive?: boolean; allowInactiveFields?: boolean } = {},
): Promise<void> {
  const serviceType = options.allowInactive
    ? await serviceTypesRepository.findByIdWithAllFields(serviceTypeId)
    : await serviceTypesRepository.findActiveById(serviceTypeId);
  if (!serviceType || (!options.allowInactive && !serviceType.isActive)) {
    throw new BadRequestError('Invalid or inactive service type.', 'SERVICE_TYPE_INVALID');
  }
  const fields = serviceType.fields.filter((field) => field.scope === scope && (field.isActive || options.allowInactiveFields));
  const values = attributes ?? {};
  const allowed = new Map(fields.map((field) => [field.key, field]));

  for (const key of Object.keys(values)) {
    if (!allowed.has(key)) {
      throw new BadRequestError(`Unknown service ${scope.toLowerCase()} attribute: ${key}`, 'SERVICE_ATTRIBUTE_NOT_ALLOWED');
    }
  }

  for (const field of fields) {
    const value = values[field.key];
    if (field.required && field.isActive && (value === undefined || value === null || value === '')) {
      throw new BadRequestError(`${field.labelAr} is required.`, 'SERVICE_ATTRIBUTE_REQUIRED');
    }
    if (value === undefined || value === null || value === '') continue;
    const fieldOptions = Array.isArray(field.options) ? field.options as Array<{ value: string }> : [];
    if (field.type === 'TEXT' || field.type === 'TEXTAREA' || field.type === 'SELECT') {
      if (typeof value !== 'string') throw new BadRequestError(`Invalid value for ${field.key}.`, 'SERVICE_ATTRIBUTE_INVALID');
    }
    if (field.type === 'NUMBER' && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new BadRequestError(`Invalid value for ${field.key}.`, 'SERVICE_ATTRIBUTE_INVALID');
    }
    if (field.type === 'BOOLEAN' && typeof value !== 'boolean') {
      throw new BadRequestError(`Invalid value for ${field.key}.`, 'SERVICE_ATTRIBUTE_INVALID');
    }
    if (field.type === 'MULTI_SELECT' && (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))) {
      throw new BadRequestError(`Invalid value for ${field.key}.`, 'SERVICE_ATTRIBUTE_INVALID');
    }
    if (fieldOptions.length > 0) {
      const valid = new Set(fieldOptions.map((option) => option.value));
      if (field.type === 'SELECT' && !valid.has(value as string)) {
        throw new BadRequestError(`Invalid option for ${field.key}.`, 'SERVICE_ATTRIBUTE_INVALID');
      }
      if (field.type === 'MULTI_SELECT' && (value as string[]).some((item) => !valid.has(item))) {
        throw new BadRequestError(`Invalid option for ${field.key}.`, 'SERVICE_ATTRIBUTE_INVALID');
      }
    }
  }
}

export const validateServiceListingAttributes = (
  serviceTypeId: string,
  attributes: Record<string, unknown> | undefined,
  options: { allowInactive?: boolean; allowInactiveFields?: boolean } = {},
) => validateServiceTypeAttributes(serviceTypeId, attributes, 'LISTING', options);

export const validateServiceProviderAttributes = (
  serviceTypeId: string,
  attributes: Record<string, unknown> | undefined,
  options: { allowInactive?: boolean; allowInactiveFields?: boolean } = {},
) => validateServiceTypeAttributes(serviceTypeId, attributes, 'PROVIDER', options);

export const serviceTypesService = {
  getActive: async () => {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch { logger.warn('Service types cache read failed'); }
    const result = await serviceTypesRepository.findActive();
    try { await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(result)); } catch { logger.warn('Service types cache write failed'); }
    return result;
  },
  getAllForAdmin: () => serviceTypesRepository.findAllForAdmin(),
  create: async (input: CreateServiceTypeInput) => {
    if (input.capabilities !== undefined) {
      try { validateServiceTypeCapabilitiesDefinition(input.capabilities); }
      catch (error) { throw new BadRequestError((error as Error).message, 'SERVICE_TYPE_CAPABILITIES_INVALID'); }
    }
    if (await serviceTypesRepository.findBySlug(input.slug)) throw new BadRequestError('Service type slug already exists', 'SERVICE_TYPE_SLUG_EXISTS');
    try { const result = await serviceTypesRepository.create(input); await invalidate(); return result; }
    catch (error) { if (isPrismaError(error, 'P2002')) throw new BadRequestError('Service type already exists', 'SERVICE_TYPE_EXISTS'); throw error; }
  },
  update: async (id: string, input: UpdateServiceTypeInput) => {
    if (input.capabilities !== undefined) {
      try { validateServiceTypeCapabilitiesDefinition(input.capabilities); }
      catch (error) { throw new BadRequestError((error as Error).message, 'SERVICE_TYPE_CAPABILITIES_INVALID'); }
    }
    if (!(await serviceTypesRepository.findById(id))) throw new NotFoundError('Service type not found', 'SERVICE_TYPE_NOT_FOUND');
    try { const result = await serviceTypesRepository.update(id, input); await invalidate(); return result; }
    catch (error) { if (isPrismaError(error, 'P2002')) throw new BadRequestError('Service type already exists', 'SERVICE_TYPE_EXISTS'); throw error; }
  },
  createField: async (input: CreateServiceTypeFieldInput) => {
    if (!(await serviceTypesRepository.findById(input.serviceTypeId))) throw new BadRequestError('Service type not found', 'SERVICE_TYPE_NOT_FOUND');
    try {
      validateServiceTypeFieldDefinition({ type: input.type, options: input.options });
    } catch (error) {
      throw new BadRequestError((error as Error).message, 'SERVICE_TYPE_FIELD_DEFINITION_INVALID');
    }
    try { const result = await serviceTypesRepository.createField(input); await invalidate(); return result; }
    catch (error) { if (isPrismaError(error, 'P2002')) throw new BadRequestError('Field key already exists for this service type', 'SERVICE_TYPE_FIELD_EXISTS'); throw error; }
  },
  updateField: async (id: string, input: UpdateServiceTypeFieldInput) => {
    const current = await serviceTypesRepository.findFieldById(id);
    if (!current) throw new NotFoundError('Service type field not found', 'SERVICE_TYPE_FIELD_NOT_FOUND');
    try {
      validateServiceTypeFieldDefinition({
        type: current.type,
        options: input.options !== undefined ? (input.options as Array<{ value: string; labelAr: string }> | null) : (current.options as Array<{ value: string; labelAr: string }> | null),
      });
    } catch (error) {
      throw new BadRequestError((error as Error).message, 'SERVICE_TYPE_FIELD_DEFINITION_INVALID');
    }
    const result = await serviceTypesRepository.updateField(id, input); await invalidate(); return result;
  },
  deleteField: async (id: string) => {
    if (!(await serviceTypesRepository.findFieldById(id))) throw new NotFoundError('Service type field not found', 'SERVICE_TYPE_FIELD_NOT_FOUND');
    await serviceTypesRepository.deleteField(id); await invalidate();
  },
};
