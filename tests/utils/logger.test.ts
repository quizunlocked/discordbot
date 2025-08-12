import { vi } from 'vitest';
import { logger } from '../../src/utils/logger';

// Mock winston
vi.mock('winston', () => {
  const winston = {
    format: {
      combine: vi.fn(),
      timestamp: vi.fn(),
      errors: vi.fn(),
      json: vi.fn(),
      colorize: vi.fn(),
      simple: vi.fn(),
    },
    transports: {
      File: vi.fn(),
      Console: vi.fn(),
    },
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      log: vi.fn(),
      add: vi.fn(),
    })),
  };
  return {
    default: winston,
    ...winston,
  };
});

describe('Logger', () => {
  let mockLogger: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = logger as any;
  });

  describe('logger methods', () => {
    it('should have info method', () => {
      expect(typeof mockLogger.info).toBe('function');
    });

    it('should have warn method', () => {
      expect(typeof mockLogger.warn).toBe('function');
    });

    it('should have error method', () => {
      expect(typeof mockLogger.error).toBe('function');
    });

    it('should have debug method', () => {
      expect(typeof mockLogger.debug).toBe('function');
    });

    it('should have log method', () => {
      expect(typeof mockLogger.log).toBe('function');
    });
  });

  describe('logger configuration', () => {
    it('should be properly configured', () => {
      expect(mockLogger).toBeDefined();
      expect(mockLogger.info).toBeDefined();
      expect(mockLogger.warn).toBeDefined();
      expect(mockLogger.error).toBeDefined();
      expect(mockLogger.debug).toBeDefined();
    });
  });
});
