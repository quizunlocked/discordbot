import { execute } from '../../src/events/ready';

jest.mock('@/utils/logger', () => ({ logger: { info: jest.fn() } }));

describe('ready event', () => {
  it('should log ready and set bot activity', () => {
    const setActivity = jest.fn();
    const client = {
      user: { tag: 'TestBot#1234', setActivity },
      guilds: { cache: { size: 5 } },
    };
    execute(client as any);
    const { logger } = require('@/utils/logger');
    expect(logger.info).toHaveBeenCalledWith('Ready! Logged in as TestBot#1234');
    expect(setActivity).toHaveBeenCalledWith('quizzes', { type: 2 });
    expect(logger.info).toHaveBeenCalledWith('Bot is now online and ready to serve 5 guilds');
  });
}); 