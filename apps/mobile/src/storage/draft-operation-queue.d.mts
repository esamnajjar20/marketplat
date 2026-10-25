export function runSerializedByKey<T>(key: string, operation: () => Promise<T> | T): Promise<T>;
