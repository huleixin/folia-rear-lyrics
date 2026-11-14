// src/services/feedback/endpoints.mjs: only these HTTPS origins share feedback storage and secrets.
export const PRIMARY_API = 'https://feedback.20262000.xyz';
export const BACKUP_API = 'https://tingyu-feedback-api.2473297053.workers.dev';
export const API_ORIGINS = Object.freeze([PRIMARY_API, BACKUP_API]);
export const retryable = error => ['network_failed', 'gateway_failed'].includes(error?.message);

// One user action makes at most one attempt per origin. Validation, quota and pause errors stop here.
export async function withFeedbackFallback(attempt) {
  for (let i = 0; i < API_ORIGINS.length; i++) {
    try { return await attempt(API_ORIGINS[i]); }
    catch (error) { if (i === API_ORIGINS.length - 1 || !retryable(error)) throw error; }
  }
}
