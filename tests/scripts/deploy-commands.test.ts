import { getGuildIdFromArgs, getDeploymentTarget } from '../../scripts/deploy-commands';

describe('getGuildIdFromArgs', () => {
  it('returns the guildId when present as argument', () => {
    const args = ['node', 'script.js', '--guildId=123456'];
    expect(getGuildIdFromArgs(args)).toBe('123456');
    expect(getDeploymentTarget(getGuildIdFromArgs(args), {})).toBe('arg');
  });

  it('returns undefined and target is dev when only devGuildId is provided', () => {
    const args = ['node', 'script.js'];
    const devGuildId = 'dev-987';
    expect(getGuildIdFromArgs(args)).toBeUndefined();
    expect(getDeploymentTarget(getGuildIdFromArgs(args), { devGuildId })).toBe('dev');
  });

  it('returns undefined and target is global when neither argument nor devGuildId is provided', () => {
    const args = ['node', 'script.js'];
    expect(getGuildIdFromArgs(args)).toBeUndefined();
    expect(getDeploymentTarget(getGuildIdFromArgs(args), {})).toBe('global');
  });

  it('returns the first --guildId if multiple are present', () => {
    const args = ['node', 'script.js', '--guildId=abc', '--guildId=def'];
    expect(getGuildIdFromArgs(args)).toBe('abc');
    expect(getDeploymentTarget(getGuildIdFromArgs(args), {})).toBe('arg');
  });
});

describe('getDeploymentTarget', () => {
  it('returns "arg" if argGuildId is provided', () => {
    expect(getDeploymentTarget('123', { devGuildId: 'dev' })).toBe('arg');
    expect(getDeploymentTarget('123', { })).toBe('arg');
  });

  it('returns "dev" if no argGuildId but devGuildId is set', () => {
    expect(getDeploymentTarget(undefined, { devGuildId: 'dev' })).toBe('dev');
  });

  it('returns "global" if neither argGuildId nor devGuildId is set', () => {
    expect(getDeploymentTarget(undefined, { })).toBe('global');
  });
}); 