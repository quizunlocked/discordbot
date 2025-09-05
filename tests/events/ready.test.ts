import { vi } from 'vitest';
import { execute } from '../../app/events/ready';
import { logger } from '../../app/utils/logger';

vi.mock('../../app/utils/logger', () => ({ logger: { info: vi.fn() } }));

describe('ready event', () => {
  it('should log ready and set bot activity', async () => {
    const setActivity = vi.fn();
    const client = {
      user: { tag: 'TestBot#1234', setActivity },
      guilds: { cache: { size: 5 } },
    };
    execute(client as any);
    expect(logger.info).toHaveBeenCalledWith('Ready! Logged in as TestBot#1234');
    expect(setActivity).toHaveBeenCalledWith('quizzes', { type: 2 });
    expect(logger.info).toHaveBeenCalledWith('Bot is now online and ready to serve 5 guilds');
  });
});
