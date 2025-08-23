import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { databaseService } from '../../app/services/DatabaseService.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Corpus Template Integration', () => {
  beforeAll(async () => {
    await databaseService.connect();
  });

  afterAll(async () => {
    // Clean up any test data
    await databaseService.prisma.corpusEntry.deleteMany({
      where: { corpus: { title: { startsWith: 'test-template-' } } },
    });
    await databaseService.prisma.corpus.deleteMany({
      where: { title: { startsWith: 'test-template-' } },
    });
  });

  describe('Template Format Validation', () => {
    it('should parse the new template format with tags correctly', async () => {
      // Read the actual template file
      const templatePath = path.join(process.cwd(), 'data', 'corpus-template.csv');
      const templateContent = await fs.readFile(templatePath, 'utf-8');

      // Verify the template has the expected structure
      const lines = templateContent.split('\n');
      const headers = lines[0]?.split(',') || [];

      // Should have the new column names
      expect(headers[0]?.toLowerCase()).toBe('questions');
      expect(headers[1]?.toLowerCase()).toBe('answers');
      expect(headers[2]?.toLowerCase()).toBe('tags');

      // Should have hint columns
      expect(headers.length).toBeGreaterThan(3);
    });

    it('should successfully upload and parse template-format CSV with tags', async () => {
      const testCSV = `questions,answers,tags,hint1
"What is the capital of France?
Name France's capital city","Paris
City of Light","europe
geography
capitals","Paris is the largest city in France"
"What is 2+2?
Two plus two equals what?","4
Four","mathematics
arithmetic","Basic addition operation"
"What is the capital of Italy?
Name Italy's capital","Rome
Roma","europe
geography
capitals","Rome has ancient history"`;

      // Create a test corpus
      const testCorpus = await databaseService.prisma.corpus.create({
        data: {
          id: 'test-template-corpus',
          title: 'test-template-corpus',
        },
      });

      // Simulate CSV parsing (using the logic from our upload handler)
      const Papa = await import('papaparse');
      const parseResult = Papa.parse(testCSV, {
        header: true,
        skipEmptyLines: true,
      });

      expect(parseResult.errors).toHaveLength(0);
      expect(parseResult.data).toHaveLength(3);

      // Test the column identification logic
      const headers = Object.keys(parseResult.data[0] || {});
      const questionPatterns = /^questions?$/i;
      const answerPatterns = /^answers?$/i;
      const tagPatterns = /^tags?$/i;

      const questionCol = headers.find(h => questionPatterns.test(h));
      const answerCol = headers.find(h => answerPatterns.test(h));
      const tagCol = headers.find(h => tagPatterns.test(h));

      expect(questionCol).toBe('questions');
      expect(answerCol).toBe('answers');
      expect(tagCol).toBe('tags');

      // Test parsing of the first row
      const firstRow = parseResult.data[0] as any;
      expect(firstRow.questions).toContain('What is the capital of France?');
      expect(firstRow.answers).toContain('Paris');
      expect(firstRow.tags).toContain('europe');

      // Test tag normalization
      const tags = (firstRow.tags || '')
        .trim()
        .split('\n')
        .map((t: string) => t.trim().toLowerCase())
        .filter((t: string) => t.length > 0);

      expect(tags).toEqual(['europe', 'geography', 'capitals']);
    });

    it('should handle mixed tagged and untagged entries in template format', async () => {
      const testCSV = `questions,answers,tags,hint1
"Tagged question 1","Answer 1","category1
category2","Hint for tagged question"
"Untagged question","Answer 2","","Hint for untagged question"
"Another tagged question","Answer 3","category1","Another hint"`;

      const Papa = await import('papaparse');
      const parseResult = Papa.parse(testCSV, {
        header: true,
        skipEmptyLines: true,
      });

      expect(parseResult.data).toHaveLength(3);

      const rows = parseResult.data as any[];

      // First row: has tags
      const tags1 = (rows[0].tags || '')
        .trim()
        .split('\n')
        .map((t: string) => t.trim().toLowerCase())
        .filter((t: string) => t.length > 0);
      expect(tags1).toEqual(['category1', 'category2']);

      // Second row: no tags (empty string)
      const tags2 =
        rows[1].tags &&
        (rows[1].tags || '')
          .trim()
          .split('\n')
          .map((t: string) => t.trim().toLowerCase())
          .filter((t: string) => t.length > 0);
      expect(tags2 || []).toEqual([]);

      // Third row: has tags
      const tags3 = (rows[2].tags || '')
        .trim()
        .split('\n')
        .map((t: string) => t.trim().toLowerCase())
        .filter((t: string) => t.length > 0);
      expect(tags3).toEqual(['category1']);
    });

    it('should demonstrate tag intersection logic with template data', () => {
      // Sample entries like those in the template
      const entries = [
        { tags: ['polish', 'greetings', 'basic'], answerVariants: ['Cześć', 'Dzień dobry'] },
        { tags: ['polish', 'politeness', 'basic'], answerVariants: ['Dziękuję'] },
        { tags: ['geography', 'poland', 'capitals'], answerVariants: ['Warsaw', 'Warszawa'] },
        { tags: [], answerVariants: ['Universal answer'] }, // Untagged
      ];

      // Test tag intersection logic
      const hasTagIntersection = (tags1: string[], tags2: string[]): boolean => {
        if (tags1.length === 0 || tags2.length === 0) {
          return false;
        }

        const normalizedTags1 = tags1.map(tag => tag.toLowerCase().trim());
        const normalizedTags2 = tags2.map(tag => tag.toLowerCase().trim());

        return normalizedTags1.some(tag => normalizedTags2.includes(tag));
      };

      // Polish entries should intersect
      expect(hasTagIntersection(entries[0].tags, entries[1].tags)).toBe(true); // both have 'polish' and 'basic'

      // Polish and geography shouldn't intersect
      expect(hasTagIntersection(entries[0].tags, entries[2].tags)).toBe(false);

      // Untagged entry doesn't intersect with anything
      expect(hasTagIntersection(entries[0].tags, entries[3].tags)).toBe(false);
      expect(hasTagIntersection(entries[3].tags, entries[2].tags)).toBe(false);

      // Filter entries by tag intersection for a polish question
      const polishEntry = entries[0];
      const candidateEntries = entries.filter(entry => {
        const entryTags = entry.tags;
        // Only include entries that have tags AND share at least one tag
        return entryTags && entryTags.length > 0 && hasTagIntersection(polishEntry.tags, entryTags);
      });

      // Should include both polish entries but not geography or untagged
      expect(candidateEntries).toHaveLength(2);
      expect(candidateEntries).toContain(entries[0]);
      expect(candidateEntries).toContain(entries[1]);
      expect(candidateEntries).not.toContain(entries[2]);
      expect(candidateEntries).not.toContain(entries[3]);
    });

    it('should validate template shows proper tag examples', async () => {
      const templatePath = path.join(process.cwd(), 'data', 'corpus-template.csv');
      const templateContent = await fs.readFile(templatePath, 'utf-8');

      // Should contain examples of proper tag usage
      expect(templateContent.toLowerCase()).toContain('polish');
      expect(templateContent.toLowerCase()).toContain('geography');
      expect(templateContent.toLowerCase()).toContain('basic');

      // Should show newline-separated tags
      expect(templateContent).toContain('polish\ngreetings\nbasic');
      expect(templateContent).toContain('geography\npoland\ncapitals');

      // Should demonstrate both tagged and potentially different categories
      expect(templateContent.toLowerCase()).toContain('greetings');
      expect(templateContent.toLowerCase()).toContain('capitals');
    });
  });
});
