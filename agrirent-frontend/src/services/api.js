// src/services/api.js
import axios from "axios";

const API_URL = "http://localhost:3001/api";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Auth API
export const authAPI = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
  resendVerification: (data) => api.post("/auth/resend-verification", data),
};

// Machine API
export const machineAPI = {
  getAll: () => api.get("/machines"),
  getById: (id) => api.get(`/machines/${id}`),
  create: (data) => api.post("/machines", data),
  update: (id, data) => api.put(`/machines/${id}`, data),
  delete: (id) => api.delete(`/machines/${id}`),
  getMyMachines: () => api.get("/machines/my-machines"),
  updateAvailability: (id, data) =>
    api.patch(`/machines/${id}/availability`, data),
};

// Rental API
export const rentalAPI = {
  getAll: () => api.get("/rentals"),
  getById: (id) => api.get(`/rentals/${id}`),
  create: (data) => api.post("/rentals", data),
  updateStatus: (id, data) => api.patch(`/rentals/${id}/status`, data),
  complete: (id) => api.patch(`/rentals/${id}/complete`),
  cancel: (id, data) => api.post(`/rentals/${id}/cancel`, data),
  submitReview: (id, reviewData) =>
    api.post(`/rentals/${id}/review`, reviewData),
  updateReview: (id, reviewData) =>
    api.put(`/rentals/${id}/review`, reviewData),
  getReviewsByMachine: (machineId) =>
    api.get(`/rentals/machine/${machineId}/reviews`),
  getMyRentals: () => api.get("/rentals/my-rentals"),
  getRentalRequests: () => api.get("/rentals/requests"), // For owners
};

// ============== COMPREHENSIVE PAYMENT API WITH ESCROW ==============
export const paymentAPI = {
  // ========== PAYMENT PROCESSING ==========
  // Stripe Payments
  // ✅ NEW: Create Stripe Checkout Session (USE THIS!)
  createCheckoutSession: (data) =>
    api.post("/payments/stripe/create-checkout-session", data),

  // ✅ NEW: Verify payment status after redirect
  verifySession: (sessionId) =>
    api.get(`/payments/stripe/verify-session/${sessionId}`),

  // Old methods (keep for backward compatibility)
  createStripePayment: (data) =>
    api.post("/payments/stripe/create-intent", data),
  confirmStripePayment: (paymentIntentId) =>
    api.post("/payments/stripe/confirm", { paymentIntentId }),

  // PayPal Payments
  createPayPalOrder: (data) => api.post("/payments/paypal/create-order", data),
  capturePayPalOrder: (orderId) =>
    api.post("/payments/paypal/capture-order", { orderId }),
  createPayPalBillingAgreement: (data) =>
    api.post("/payments/paypal/create-billing-agreement", data),

  // Mobile Money Payments
  initiateMobileMoney: (data) =>
    api.post("/payments/mobile-money/initiate", data),
  checkMobileMoneyStatus: (transactionId) =>
    api.get(`/payments/mobile-money/status/${transactionId}`),
  verifyMobileMoneyPayment: (transactionId) =>
    api.post(`/payments/mobile-money/verify/${transactionId}`),

  // ========== ESCROW MANAGEMENT ==========

  // Renter Actions
  confirmCompletion: (rentalId, data) =>
    api.post(`/payments/confirm-completion/${rentalId}`, data),
  openDispute: (rentalId, data) =>
    api.post(`/payments/escrow/open-dispute/${rentalId}`, data),
  withdrawDispute: (rentalId) =>
    api.post(`/payments/escrow/withdraw-dispute/${rentalId}`),

  // Owner Actions
  requestPayout: (rentalId, data) =>
    api.post(`/payments/escrow/request-payout/${rentalId}`, data),
  provideServiceProof: (rentalId, data) =>
    api.post(`/payments/escrow/provide-proof/${rentalId}`, data),

  // ========== PAYMENT STATUS & HISTORY ==========

  // General Payment Info
  getPaymentMethods: () => api.get("/payments/methods"),
  getPaymentHistory: () => api.get("/payments/history"),
  getPaymentDetails: (paymentId) => api.get(`/payments/${paymentId}`),
  getRentalPaymentStatus: (rentalId) => api.get(`/payments/rental/${rentalId}`),

  // Escrow Status
  getEscrowStatus: (rentalId) => api.get(`/payments/escrow/status/${rentalId}`),
  getActiveEscrows: () => api.get("/payments/escrow/active"),
  getEscrowHistory: () => api.get("/payments/escrow/history"),

  // ========== REFUNDS & CANCELLATIONS ==========

  processRefund: (paymentId, data) =>
    api.post(`/payments/${paymentId}/refund`, data),
  requestRefund: (rentalId, data) =>
    api.post(`/payments/refund/request/${rentalId}`, data),
  cancelPayment: (paymentId, data) =>
    api.post(`/payments/${paymentId}/cancel`, data),

  // ========== OWNER EARNINGS & PAYOUTS ==========

  getOwnerEarnings: () => api.get("/payments/owner/earnings"),
  getPendingPayouts: () => api.get("/payments/owner/pending-payouts"),
  getReleasedPayments: () => api.get("/payments/admin/released-payments"),
  getPayoutHistory: () => api.get("/payments/owner/payout-history"),
  requestWithdrawal: (data) =>
    api.post("/payments/owner/request-withdrawal", data),
  getBalance: () => api.get("/payments/owner/balance"),

  // ========== ADMIN FUNCTIONS ==========

  // Escrow Management
  getEscrowBalance: () => api.get("/payments/admin/escrow-balance"),
  verifyAndRelease: (paymentId, data) =>
    api.post(`/payments/admin/verify-and-release/${paymentId}`, data),
  forceRelease: (paymentId, data) =>
    api.post(`/payments/admin/force-release/${paymentId}`, data),
  extendEscrow: (paymentId, data) =>
    api.post(`/payments/admin/extend-escrow/${paymentId}`, data),

  // Dispute Resolution
  resolveDispute: (paymentId, data) =>
    api.post(`/payments/admin/resolve-dispute/${paymentId}`, data),
  getAllDisputes: () => api.get("/payments/admin/disputes"),
  getDisputeDetails: (disputeId) =>
    api.get(`/payments/admin/disputes/${disputeId}`),
  assignDispute: (disputeId, data) =>
    api.post(`/payments/admin/disputes/${disputeId}/assign`, data),

  // System Management
  checkAutoRelease: () => api.get("/payments/admin/auto-release-check"),
  runAutoRelease: () => api.post("/payments/admin/auto-release"),
  getSystemStats: () => api.get("/payments/admin/system-stats"),
  getPendingVerifications: () =>
    api.get("/payments/admin/pending-verifications"),

  // ========== NOTIFICATIONS & WEBHOOKS ==========

  getPaymentNotifications: () => api.get("/payments/notifications"),
  markNotificationRead: (notificationId) =>
    api.patch(`/payments/notifications/${notificationId}/read`),
  setupPaymentWebhook: (data) => api.post("/payments/webhooks/setup", data),
  // Admin functions
  getPendingReleases: () => api.get("/payments/admin/pending-releases"),

  // ========== SECURITY & VERIFICATION ==========

  verifyPayment: (paymentId) => api.post(`/payments/${paymentId}/verify`),
  getSecurityLogs: () => api.get("/payments/security/logs"),
  enable2FA: () => api.post("/payments/security/enable-2fa"),
  disable2FA: () => api.post("/payments/security/disable-2fa"),

  // ========== SUPPORT & DOCUMENTATION ==========

  getPaymentSupport: () => api.get("/payments/support"),
  submitSupportTicket: (data) => api.post("/payments/support/ticket", data),
  getPaymentGuides: () => api.get("/payments/guides"),
};

// Upload API
export const uploadAPI = {
  uploadImages: async (files) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("images", file);
    });

    return api.post("/upload/images", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },

  uploadDocuments: async (files) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("documents", file);
    });

    return api.post("/upload/documents", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },

  uploadPaymentProof: async (file) => {
    const formData = new FormData();
    formData.append("proof", file);

    return api.post("/upload/payment-proof", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },
};

// User API
export const userAPI = {
  getProfile: () => api.get("/users/profile"),
  updateProfile: (data) => api.put("/users/profile", data),
  updatePaymentPreferences: (data) =>
    api.put("/users/payment-preferences", data),
  getPaymentMethods: () => api.get("/users/payment-methods"),
  addPaymentMethod: (data) => api.post("/users/payment-methods", data),
  removePaymentMethod: (methodId) =>
    api.delete(`/users/payment-methods/${methodId}`),
  setDefaultPaymentMethod: (methodId) =>
    api.patch(`/users/payment-methods/${methodId}/default`),
  getBillingHistory: () => api.get("/users/billing-history"),
  getTaxDocuments: () => api.get("/users/tax-documents"),
};

// Notification API
export const notificationAPI = {
  getAll: () => api.get("/notifications"),
  markAsRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.patch("/notifications/read-all"),
  getUnreadCount: () => api.get("/notifications/unread-count"),
  getSettings: () => api.get("/notifications/settings"),
  updateSettings: (data) => api.put("/notifications/settings", data),
};

// Support API
export const supportAPI = {
  createTicket: (data) => api.post("/support/tickets", data),
  getTickets: () => api.get("/support/tickets"),
  getTicket: (id) => api.get(`/support/tickets/${id}`),
  addMessage: (ticketId, data) =>
    api.post(`/support/tickets/${ticketId}/messages`, data),
  closeTicket: (ticketId) => api.patch(`/support/tickets/${ticketId}/close`),
  getCategories: () => api.get("/support/categories"),
  getFaqs: () => api.get("/support/faqs"),
};

// Analytics API (for owners/admins)
export const analyticsAPI = {
  getDashboardStats: () => api.get("/analytics/dashboard"),
  getEarningsReport: (period) =>
    api.get(`/analytics/earnings?period=${period}`),
  getRentalAnalytics: (period) =>
    api.get(`/analytics/rentals?period=${period}`),
  getMachinePerformance: (machineId) =>
    api.get(`/analytics/machines/${machineId}/performance`),
  getPaymentAnalytics: (period) =>
    api.get(`/analytics/payments?period=${period}`),
};

export default api;
