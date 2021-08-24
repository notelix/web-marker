export default class DeserializationError extends Error {}

export function isDeserializationError(err: Error): boolean {
  return err instanceof DeserializationError;
}
