// src/services/api.js
import axios from "axios";

const API_URL = "http://localhost:3001/api";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor
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

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 403 &&
      error.response?.data?.requiresVerification
    ) {
      return Promise.reject(error);
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
  resendVerification: (data) => api.post("/auth/resend-verification", data),
  sendSMSVerification: (data) => api.post("/auth/send-sms-verification", data),
  verifySMSCode: (data) => api.post("/auth/verify-sms-code", data),
  forgotPassword: (data) => api.post("/auth/forgot-password", data),
  resetPassword: (token, data) =>
    api.post(`/auth/reset-password/${token}`, data),
  verifyEmail: (token) => api.get(`/auth/verify-email/${token}`),
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
  getCategories: () => api.get("/machines/categories"),
};

// Rental API
export const rentalAPI = {
  getAll: () => api.get("/rentals"),
  getById: (id) => api.get(`/rentals/${id}`),
  create: (data) => api.post("/rentals", data),
  updateStatus: (id, data) => api.patch(`/rentals/${id}/status`, data),
  complete: (id) => api.patch(`/rentals/${id}/complete`),
  confirmCompletion: (id, data) =>
    api.patch(`/rentals/${id}/confirm-completion`, data),
  cancel: (id, data) => api.post(`/rentals/${id}/cancel`, data),
  submitReview: (id, reviewData) =>
    api.post(`/rentals/${id}/review`, reviewData),
  updateReview: (id, reviewData) =>
    api.put(`/rentals/${id}/review`, reviewData),
  getReviewsByMachine: (machineId) =>
    api.get(`/rentals/machine/${machineId}/reviews`),
  getMyRentals: () => api.get("/rentals/my-rentals"),
  getRentalRequests: () => api.get("/rentals/requests"),
};

// Payment API - CORRECTED TO MATCH BACKEND ROUTES
export const paymentAPI = {
  // Stripe Checkout Session (for payment processing)
  createCheckoutSession: (data) =>
    api.post("/payments/stripe/create-checkout-session", data),
  verifySession: (sessionId) =>
    api.get(`/payments/stripe/verify-session/${sessionId}`),

  // Rental Payment Completion (renter confirms)
  confirmCompletion: (rentalId, data) =>
    api.post(`/payments/confirm-completion/${rentalId}`, data),

  // Owner marks rental as complete
  markComplete: (rentalId, data) =>
    api.post(`/payments/owner/mark-complete/${rentalId}`, data),

  // Dispute Operations
  openDispute: (rentalId, data) =>
    api.post(`/payments/open-dispute/${rentalId}`, data),

  ownerConfirm: (rentalId, data) =>
    api.post(`/payments/rentals/${rentalId}/owner-confirm`, data),

  renterConfirm: (rentalId, data) =>
    api.post(`/payments/rentals/${rentalId}/renter-confirm`, data),
  getAdminPendingPayments: () => api.get("/payments/admin/pending-payments"),
  getAdminPendingReleases: () => api.get("/payments/admin/pending-releases"),
  releasePayment: (paymentId, data) =>
    api.post(`/payments/admin/release-payment/${paymentId}`, data),
  resolveDispute: (paymentId, data) =>
    api.post(`/payments/admin/resolve-dispute/${paymentId}`, data),
  getDashboardStats: () => api.get("/payments/admin/dashboard-stats"),
  getDisputes: () => api.get("/payments/admin/disputes"),

  // Payment Status & Info
  getRentalPaymentStatus: (rentalId) =>
    api.get(`/payments/rental/${rentalId}/payment-status`),
  checkRentalStatus: (rentalId) =>
    api.get(`/payments/debug/check-rental/${rentalId}`),

  // Test endpoint
  testPayments: () => api.get("/payments/test"),

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
};

// User API
export const userAPI = {
  getProfile: () => api.get("/users/profile"),
  updateProfile: (data) => api.put("/users/profile", data),
  getVerificationStatus: () => api.get("/users/verification-status"),
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

// Analytics API
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
