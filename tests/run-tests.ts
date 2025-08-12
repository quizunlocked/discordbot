#!/usr/bin/env node

/**
 * Test runner for the Discord Quiz Bot
 * This script runs all tests and generates coverage reports
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

console.log('🧪 Starting Discord Quiz Bot Test Suite...\n');

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!existsSync(logsDir)) {
  mkdirSync(logsDir);
}

// Ensure coverage directory exists
const coverageDir = path.join(process.cwd(), 'coverage');
if (!existsSync(coverageDir)) {
  mkdirSync(coverageDir);
}

// Ensure tests/commands directory exists for command handler tests
// (No code needed here, just a note for the test suite organization)

try {
  // Run tests with coverage
  console.log('📋 Running tests with coverage...');
  execSync('npm test -- --coverage --verbose', {
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  console.log('\n✅ All tests completed successfully!');
  console.log('\n📊 Coverage report generated in ./coverage/');
  console.log('📁 Test results saved in ./coverage/');
} catch (error) {
  console.error('\n❌ Tests failed!');
  console.error('Error:', error);
  process.exit(1);
}
