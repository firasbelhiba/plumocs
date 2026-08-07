'use client';

/**
 * One thin function per backend endpoint — the complete surface of the
 * Plumo CS API (§7 of the backend doc). No shape translation here; that
 * lives in adapter.js.
 */
import { request, requestRoot, qs } from './client';

// ---- auth ----
export const auth = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  refresh: (refreshToken) => request('/auth/refresh', { method: 'POST', body: { refreshToken }, auth: false }),
  logout: (refreshToken) => request('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),
  resetPassword: (token, newPassword) =>
    request('/auth/reset-password', { method: 'POST', body: { token, newPassword }, auth: false }),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
  me: () => request('/auth/me'),
};

// ---- tickets ----
// Linking this CS account and desk to a Plumo PM account.
export const pm = {
  status: () => request('/auth/pm/status'),
  // Returns a URL rather than redirecting: a 302 from fetch() is followed
  // opaquely by the browser instead of navigating the page, so the caller has
  // to do the navigation itself.
  start: (returnTo) => request(`/auth/pm/start${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`),
  unlink: () => request('/auth/pm/unlink'),
};

export const tickets = {
  setBotEnabled: (id, enabled) => request(`/tickets/${id}/bot-enabled`, { method: 'POST', body: { enabled } }),
  list: (params) => request(`/tickets${qs(params)}`),
  counts: () => request('/tickets/counts'),
  get: (id) => request(`/tickets/${id}`),
  create: (body) => request('/tickets', { method: 'POST', body }),
  patch: (id, body) => request(`/tickets/${id}`, { method: 'PATCH', body }),
  assign: (id, body) => request(`/tickets/${id}/assign`, { method: 'POST', body }),
  transition: (id, status) => request(`/tickets/${id}/status`, { method: 'POST', body: { status } }),
  addMessage: (id, body) => request(`/tickets/${id}/messages`, { method: 'POST', body }),
  bulk: (body) => request('/tickets/bulk', { method: 'POST', body }),
  merge: (id, targetId) => request(`/tickets/${id}/merge`, { method: 'POST', body: { targetId } }),
  audit: (id) => request(`/tickets/${id}/audit`),
  remove: (id) => request(`/tickets/${id}`, { method: 'DELETE' }),
};

// ---- customers / organizations ----
export const customers = {
  list: (params) => request(`/customers${qs(params)}`),
  get: (id) => request(`/customers/${id}`),
  create: (body) => request('/customers', { method: 'POST', body }),
  patch: (id, body) => request(`/customers/${id}`, { method: 'PATCH', body }),
  anonymize: (id) => request(`/customers/${id}`, { method: 'DELETE' }),
};

export const organizations = {
  list: () => request('/organizations'),
  get: (id) => request(`/organizations/${id}`),
  create: (body) => request('/organizations', { method: 'POST', body }),
  patch: (id, body) => request(`/organizations/${id}`, { method: 'PATCH', body }),
};

// ---- people & config ----
export const users = {
  list: (includeInactive = false) => request(`/users${qs({ includeInactive: includeInactive || undefined })}`),
  get: (id) => request(`/users/${id}`),
  create: (body) => request('/users', { method: 'POST', body }),
  patch: (id, body) => request(`/users/${id}`, { method: 'PATCH', body }),
  deactivate: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  updateSelf: (body) => request('/users/me', { method: 'PATCH', body }),
};

export const teams = {
  list: () => request('/teams'),
  get: (id) => request(`/teams/${id}`),
  create: (body) => request('/teams', { method: 'POST', body }),
  patch: (id, body) => request(`/teams/${id}`, { method: 'PATCH', body }),
  remove: (id) => request(`/teams/${id}`, { method: 'DELETE' }),
  addMember: (id, userId) => request(`/teams/${id}/members`, { method: 'POST', body: { userId } }),
  removeMember: (id, userId) => request(`/teams/${id}/members/${userId}`, { method: 'DELETE' }),
};

export const slaPolicies = {
  list: () => request('/sla-policies'),
  create: (body) => request('/sla-policies', { method: 'POST', body }),
  patch: (id, body) => request(`/sla-policies/${id}`, { method: 'PATCH', body }),
  remove: (id) => request(`/sla-policies/${id}`, { method: 'DELETE' }),
};

export const businessHours = {
  list: () => request('/business-hours'),
  create: (body) => request('/business-hours', { method: 'POST', body }),
  patch: (id, body) => request(`/business-hours/${id}`, { method: 'PATCH', body }),
};

export const cannedResponses = {
  list: (q) => request(`/canned-responses${qs({ q })}`),
  create: (body) => request('/canned-responses', { method: 'POST', body }),
  patch: (id, body) => request(`/canned-responses/${id}`, { method: 'PATCH', body }),
  remove: (id) => request(`/canned-responses/${id}`, { method: 'DELETE' }),
};

export const tags = {
  list: () => request('/tags'),
  create: (body) => request('/tags', { method: 'POST', body }),
  patch: (id, body) => request(`/tags/${id}`, { method: 'PATCH', body }),
  remove: (id) => request(`/tags/${id}`, { method: 'DELETE' }),
};

export const webhooks = {
  list: () => request('/webhooks'),
  create: (body) => request('/webhooks', { method: 'POST', body }),
  patch: (id, body) => request(`/webhooks/${id}`, { method: 'PATCH', body }),
  remove: (id) => request(`/webhooks/${id}`, { method: 'DELETE' }),
  deliveries: (id) => request(`/webhooks/${id}/deliveries`),
};

export const apiKeys = {
  list: () => request('/api-keys'),
  create: (body) => request('/api-keys', { method: 'POST', body }),
  revoke: (id) => request(`/api-keys/${id}`, { method: 'DELETE' }),
};

// ---- attachments ----
export const attachments = {
  presign: (body) => request('/attachments/presign', { method: 'POST', body }),
  downloadUrl: (id) => request(`/attachments/${id}/url`),
};

// ---- search / notifications / reports / integrations / health ----
export const search = (q) => request(`/search${qs({ q })}`);

export const notifications = {
  list: (unreadOnly = false) => request(`/notifications${qs({ unread: unreadOnly || undefined })}`),
  unreadCount: () => request('/notifications/unread-count'),
  markRead: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => request('/notifications/read-all', { method: 'POST' }),
};

export const reports = {
  summary: (params = {}) => request(`/reports/summary${qs(params)}`),
  volume: (params = {}) => request(`/reports/volume${qs(params)}`),
  byChannel: (params = {}) => request(`/reports/by-channel${qs(params)}`),
  byAgent: (params = {}) => request(`/reports/by-agent${qs(params)}`),
};

export const integrations = {
  metrics: () => request('/integrations/metrics'),
  runExport: () => request('/integrations/export/run', { method: 'POST' }),
};

export const audit = {
  search: (params = {}) => request(`/audit${qs(params)}`),
};

// mounted at the server root, outside the /api/v1 prefix
export const health = {
  liveness: () => requestRoot('/health'),
  readiness: () => requestRoot('/ready'),
};
