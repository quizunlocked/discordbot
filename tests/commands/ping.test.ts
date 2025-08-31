import { vi } from 'vitest';
import { execute } from '../../app/commands/ping';

describe('quiz ping command', () => {
  let interaction: any;
  beforeEach(() => {
    interaction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      createdTimestamp: 50,
    };
  });

  it('should defer reply and then respond with Pong!', async () => {
    await execute(interaction as any);
    expect(interaction.deferReply).toHaveBeenCalledWith();
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Pong! Latency is'));
  });
});
