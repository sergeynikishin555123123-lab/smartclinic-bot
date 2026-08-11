// ФАБРИКА ДЛЯ СОЗДАНИЯ БОТОВ

const MaxBot = require('./MaxBot');
const VKBot = require('./VKBot');

class BotFactory {
  static create(platform, config) {
    switch (platform) {
      case 'max':
        return new MaxBot(config.token);
      case 'vk':
        return new VKBot(config.token, config.groupId);
      default:
        throw new Error(`Unknown platform: ${platform}`);
    }
  }
}

module.exports = BotFactory;
