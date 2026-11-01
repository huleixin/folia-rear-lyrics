// src/utils/diagnosticRedaction.ts
// The stability export reuses the existing report/share route, with credentials and full URLs removed.
export const redactDiagnosticReport = (report: string): string => report
    .replace(/\b(?:https?|wss?):\/\/[^\s<>"']+/gi, '[url-redacted]')
    .replace(/^.*(?:authorization|bearer|cookie|(?:access|refresh|api|sync)[_-]?(?:token|key)|["']?token["']?\s*[:=]).*$/gim, '[credential-redacted]');
