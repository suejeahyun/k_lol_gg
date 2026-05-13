export function getOptionalSecret(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

export function getRequiredSecret(name: string) {
  const value = getOptionalSecret(name);

  if (!value) {
    throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  }

  return value;
}

export function getRequiredSecretInProduction(name: string) {
  const value = getOptionalSecret(name);

  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  }

  return value;
}
