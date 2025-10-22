const axios = require('axios');

class OrangeMoneyService {
  constructor() {
    this.baseURL = process.env.ORANGE_MONEY_API_URL || 'https://api.orange.com/orange-money-webpay/dev/v1';
    this.clientId = process.env.ORANGE_MONEY_CLIENT_ID;
    this.clientSecret = process.env.ORANGE_MONEY_CLIENT_SECRET;
    this.merchantKey = process.env.ORANGE_MONEY_MERCHANT_KEY;
    this.currency = process.env.ORANGE_MONEY_CURRENCY || 'USD';
    this.accessToken = null;
    this.tokenExpiry = null;

    if (!this.clientId || !this.clientSecret || !this.merchantKey) {
      console.warn('⚠️ Orange Money credentials not fully configured');
    } else {
      console.log('✅ Orange Money service initialized');
    }
  }

  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(
        'https://api.orange.com/oauth/v3/token',
        new URLSearchParams({
          grant_type: 'client_credentials'
        }),
        {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (3500 * 1000);
      
      console.log('✅ Orange Money access token obtained');
      return this.accessToken;
    } catch (error) {
      console.error('❌ Failed to get Orange Money token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Orange Money');
    }
  }

  async initPayment(data) {
    const {
      amount,
      currency = this.currency,
      orderRef,
      customerPhone,
      description
    } = data;

    try {
      const token = await this.getAccessToken();

      const response = await axios.post(
        `${this.baseURL}/webpayment`,
        {
          merchant_key: this.merchantKey,
          currency: currency,
          order_id: orderRef,
          amount: amount,
          return_url: process.env.ORANGE_MONEY_RETURN_URL || `${process.env.FRONTEND_URL}/payment/success`,
          cancel_url: process.env.ORANGE_MONEY_CANCEL_URL || `${process.env.FRONTEND_URL}/payment/cancel`,
          notif_url: process.env.ORANGE_MONEY_NOTIF_URL || `${process.env.BACKEND_URL}/api/payments/orange-money-webhook`,
          lang: 'en',
          reference: orderRef,
          description: description || 'AgriRent Payment',
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ Orange Money payment initialized:', response.data);

      return {
        success: true,
        paymentUrl: response.data.payment_url,
        paymentToken: response.data.payment_token,
        transactionId: response.data.notif_token,
      };
    } catch (error) {
      console.error('❌ Orange Money payment init failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to initialize Orange Money payment');
    }
  }

  async transferMoney(data) {
    const {
      amount,
      currency = this.currency,
      recipientPhone,
      recipientName,
      reference,
      description
    } = data;

    try {
      const token = await this.getAccessToken();

      const response = await axios.post(
        `${this.baseURL}/cashout`,
        {
          partner_id: this.merchantKey,
          amount: amount,
          currency: currency,
          recipient_phone: recipientPhone,
          recipient_name: recipientName,
          reference: reference,
          description: description || 'AgriRent Payout',
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ Orange Money transfer successful:', response.data);

      return {
        success: true,
        transactionId: response.data.transaction_id,
        status: response.data.status,
      };
    } catch (error) {
      console.error('❌ Orange Money transfer failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to transfer money');
    }
  }

  async checkTransactionStatus(transactionId) {
    try {
      const token = await this.getAccessToken();

      const response = await axios.get(
        `${this.baseURL}/transaction/${transactionId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          }
        }
      );

      return {
        success: true,
        status: response.data.status,
        data: response.data,
      };
    } catch (error) {
      console.error('❌ Failed to check transaction status:', error.response?.data || error.message);
      throw new Error('Failed to check transaction status');
    }
  }

  verifyWebhookSignature(payload, signature) {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', this.clientSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
    
    return signature === expectedSignature;
  }
}

module.exports = new OrangeMoneyService();
