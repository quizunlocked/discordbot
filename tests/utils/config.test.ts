import { config } from '../../src/utils/config';

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('environment variables', () => {
    it('should load required environment variables', () => {
      // Set environment variables for this test
      const testEnv = {
        ...originalEnv,
        DISCORD_TOKEN: 'test-token',
        DISCORD_CLIENT_ID: 'test-client-id',
        DATABASE_URL: 'file:./test.db',
      };
      
      // Mock process.env for this test
      Object.defineProperty(process, 'env', {
        value: testEnv,
        writable: true,
      });

      // Re-import config to get fresh values
      jest.resetModules();
      const { config: freshConfig } = require('../../src/utils/config');
      
      expect(freshConfig.token).toBe('test-token');
      expect(freshConfig.clientId).toBe('test-client-id');
      expect(freshConfig.databaseUrl).toBe('file:./test.db');
    });

    it('should use default values for optional environment variables', () => {
      // Set environment variables for this test, excluding optional ones
      const testEnv: NodeJS.ProcessEnv = {
        ...originalEnv,
        DISCORD_TOKEN: 'test-token',
        DISCORD_CLIENT_ID: 'test-client-id',
        DATABASE_URL: 'file:./test.db',
      };
      
      // Remove optional variables
      delete testEnv['NODE_ENV'];
      delete testEnv['LOG_LEVEL'];
      
      // Mock process.env for this test
      Object.defineProperty(process, 'env', {
        value: testEnv,
        writable: true,
      });

      // Re-import config to get fresh values
      jest.resetModules();
      const { config: freshConfig } = require('../../src/utils/config');
      
      expect(freshConfig.nodeEnv).toBe('development');
      expect(freshConfig.logLevel).toBe('info');
    });
  });

  describe('quiz configuration', () => {
    it('should have valid quiz settings', () => {
      expect(config.quiz.defaultQuestionTimeout).toBeDefined();
      expect(config.quiz.defaultQuestionTimeout).toBeGreaterThan(0);
      expect(config.quiz.defaultQuizTimeout).toBeDefined();
      expect(config.quiz.defaultQuizTimeout).toBeGreaterThan(0);
      expect(config.quiz.pointsPerCorrectAnswer).toBeDefined();
      expect(config.quiz.pointsPerCorrectAnswer).toBeGreaterThan(0);
    });
  });

  describe('discord configuration', () => {
    it('should have discord settings', () => {
      expect(config.token).toBeDefined();
      expect(config.clientId).toBeDefined();
    });
  });

  describe('database configuration', () => {
    it('should have database settings', () => {
      expect(config.databaseUrl).toBeDefined();
    });
  });
}); 