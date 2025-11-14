const axios = require('axios');

class Bitrix24 {
  constructor() {
    this.webhookUrl = process.env.BITRIX24_WEBHOOK_URL;
  }

  async createDeal(dealData) {
    try {
      const response = await axios.post(`${this.webhookUrl}/crm.deal.add`, {
        fields: {
          TITLE: `Подписка Smart Clinic - ${dealData.userName}`,
          TYPE_ID: 'SALE',
          STAGE_ID: 'NEW',
          CURRENCY_ID: 'RUB',
          OPPORTUNITY: dealData.amount,
          ASSIGNED_BY_ID: process.env.BITRIX24_MANAGER_ID,
          ...dealData.customFields
        }
      });

      return response.data;
    } catch (error) {
      console.error('❌ Bitrix24 deal creation error:', error.response?.data || error.message);
      throw error;
    }
  }

  async findContactByEmail(email) {
    try {
      const response = await axios.post(`${this.webhookUrl}/crm.contact.list`, {
        filter: { 'EMAIL': email },
        select: ['ID', 'NAME', 'EMAIL']
      });

      return response.data;
    } catch (error) {
      console.error('❌ Bitrix24 contact search error:', error);
      return null;
    }
  }

  async updateDealStage(dealId, stageId) {
    try {
      const response = await axios.post(`${this.webhookUrl}/crm.deal.update`, {
        id: dealId,
        fields: { STAGE_ID: stageId }
      });

      return response.data;
    } catch (error) {
      console.error('❌ Bitrix24 deal update error:', error);
      throw error;
    }
  }
}

module.exports = new Bitrix24();
