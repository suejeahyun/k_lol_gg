export async function readJsonObject<T extends object>(
  request: Request,
): Promise<T | null> {
  try {
    const value: unknown = await request.json();
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value as T;
  } catch {
    return null;
  }
}
