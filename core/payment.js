const database = require('./database');

class PaymentService {
  async createPayment(userId, amount, currency = 'RUB') {
    const payments = database.readTable('payments');
    const payment = {
      id: database.generateId(),
      user_id: String(userId),
      amount: parseFloat(amount),
      currency: currency || 'RUB',
      status: 'pending',
      created_at: database.now(),
      updated_at: database.now()
    };
    payments.push(payment);
    database.writeTable('payments', payments);
    return payment;
  }

  async getPaymentById(paymentId) {
    const payments = database.readTable('payments');
    return payments.find(p => p.id === paymentId) || null;
  }

  async confirmPayment(paymentId) {
    const payments = database.readTable('payments');
    const index = payments.findIndex(p => p.id === paymentId);
    if (index === -1) return null;
    
    payments[index].status = 'success';
    payments[index].updated_at = database.now();
    database.writeTable('payments', payments);
    return payments[index];
  }

  async checkPaymentStatus(paymentId) {
    return await this.getPaymentById(paymentId);
  }

  async getUserPayments(userId) {
    const payments = database.readTable('payments');
    return payments.filter(p => String(p.user_id) === String(userId));
  }
}

module.exports = new PaymentService();
