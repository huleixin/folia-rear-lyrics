// src/services/feedback/endpoints.mjs: only these HTTPS origins share feedback storage and secrets.
export const PRIMARY_API = 'https://feedback.20262000.xyz';
export const BACKUP_API = 'https://tingyu-feedback-api.2473297053.workers.dev';
export const API_ORIGINS = Object.freeze([PRIMARY_API, BACKUP_API]);
export const retryable = error => {
  if(error?.details?.httpStatus>=400&&error.details.httpStatus<500&&!['submission_in_progress','submission_conflict_retry','challenge_used'].includes(error.message))return false;
  return ['network_failed','request_timeout','gateway_failed','response_invalid','storage_retry','d1_unavailable','r2_unavailable','request_failed','submission_in_progress','submission_conflict_retry','challenge_used'].includes(error?.message);
};

// One explicit action makes at most three attempts with backoff; permanent errors stop immediately.
export async function withFeedbackFallback(attempt,{maxAttempts=2,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
  const attempts=[];maxAttempts=Math.min(3,Math.max(1,maxAttempts));
  for (let i = 0; i < maxAttempts; i++) {
    try { return await attempt(API_ORIGINS[i%API_ORIGINS.length],i); }
    catch (error) {
      if(error.details)attempts.push({...error.details,retries:i});
      error.attempts=attempts;
      if (i === maxAttempts - 1 || !retryable(error)) throw error;
      await wait(Math.round(600*2**i+Math.random()*200));
    }
  }
}
