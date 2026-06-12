export class UsageError extends Error {
  readonly code = 2;
}

export class BackendError extends Error {
  readonly code = 1;
}
