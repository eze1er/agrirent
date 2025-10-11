// src/services/paymentAPI.js
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

// Payment API
export const paymentAPI = {
  // Create payment intent for Stripe
  createStripePayment: (data) => api.post("/payments/stripe/create-intent", data),
  
  // Confirm Stripe payment
  confirmStripePayment: (paymentIntentId) => 
    api.post("/payments/stripe/confirm", { paymentIntentId }),
  
  // Create PayPal order
  createPayPalOrder: (data) => api.post("/payments/paypal/create-order", data),
  
  // Capture PayPal order
  capturePayPalOrder: (orderId) => 
    api.post("/payments/paypal/capture-order", { orderId }),
  
  // Initiate Mobile Money payment (Orange Money, MTN, etc.)
  initiateMobileMoney: (data) => 
    api.post("/payments/mobile-money/initiate", data),
  
  // Check Mobile Money payment status
  checkMobileMoneyStatus: (transactionId) => 
    api.get(`/payments/mobile-money/status/${transactionId}`),
  
  // Get payment methods available
  getPaymentMethods: () => api.get("/payments/methods"),
  
  // Get payment history
  getPaymentHistory: () => api.get("/payments/history"),
  
  // Get payment details
  getPaymentDetails: (paymentId) => api.get(`/payments/${paymentId}`),
  
  // Process refund
  processRefund: (paymentId, data) => 
    api.post(`/payments/${paymentId}/refund`, data),
};

export default paymentAPI;