import { logger } from '../../src/utils/logger';

// Mock winston
jest.mock('winston', () => ({
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    json: jest.fn(),
    colorize: jest.fn(),
    simple: jest.fn(),
  },
  transports: {
    File: jest.fn(),
    Console: jest.fn(),
  },
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    add: jest.fn(),
  })),
}));

describe('Logger', () => {
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
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