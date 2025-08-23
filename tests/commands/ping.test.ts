import { vi } from 'vitest';
import { execute } from '../../app/commands/ping';

describe('quiz ping command', () => {
  let interaction: any;
  beforeEach(() => {
    interaction = {
      reply: vi.fn().mockResolvedValue({ createdTimestamp: 100, editReply: vi.fn() }),
      editReply: vi.fn().mockResolvedValue(undefined),
      createdTimestamp: 50,
    };
  });

  it('should reply with Pinging... and then Pong!', async () => {
    await execute(interaction as any);
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'Pinging...', fetchReply: true });
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Pong! Latency is'));
  });
});
