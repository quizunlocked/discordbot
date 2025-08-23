import { EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { databaseService } from '../../services/DatabaseService.js';
import { partition } from '../../utils/arrayUtils.js';
import Papa from 'papaparse';

interface CSVCorpusEntry {
  tags: string[];
  questionVariants: string[];
  answerVariants: string[];
  hintTitles: string[];
  hintVariants: Record<string, string[]>;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export const cooldown = 10; // 10 second cooldown

// Use global fetch (Node.js 18+)
declare const fetch: typeof globalThis.fetch;

// Track in-progress uploads to prevent duplicates
const uploadInProgress = new Map<string, boolean>();

// Helper function to safely exit with cleanup
function safeReturn(uploadKey: string): void {
  uploadInProgress.delete(uploadKey);
}

export async function handleUpload(interaction: ChatInputCommandInteraction): Promise<void> {
  const uploadKey = `${interaction.user.id}-${interaction.id}`;

  // Prevent duplicate executions
  if (uploadInProgress.has(uploadKey)) {
    logger.warn(
      `Corpus CSV upload already in progress for interaction ${interaction.id}, skipping duplicate`
    );
    return;
  }

  // Mark upload as in progress
  uploadInProgress.set(uploadKey, true);

  let isDeferred = false;

  try {
    // Quick validation that the interaction is still valid
    if (interaction.replied || interaction.deferred) {
      logger.warn('Interaction already processed, skipping corpus CSV upload');
      safeReturn(uploadKey);
      return;
    }

    // Try to defer the reply, but don't fail if the interaction is already expired
    try {
      await interaction.deferReply({ ephemeral: true });
      isDeferred = true;
      logger.info(`Corpus CSV upload started for user ${interaction.user.tag} (${interaction.id})`);
    } catch (deferError) {
      logger.warn('Failed to defer reply, will attempt direct reply instead:', deferError);
      isDeferred = false;
    }

    const title = interaction.options.getString('title', true);
    const attachment = interaction.options.getAttachment('file');

    if (!attachment) {
      await safeEditReply(
        interaction,
        isDeferred,
        '❌ No file was provided. Please attach a CSV file.'
      );
      safeReturn(uploadKey);
      return;
    }

    // Validate file type and size
    if (!attachment.contentType?.includes('text/csv') && !attachment.name?.endsWith('.csv')) {
      await safeEditReply(
        interaction,
        isDeferred,
        '❌ Invalid file type. Please upload a CSV file.'
      );
      safeReturn(uploadKey);
      return;
    }

    if (attachment.size > 25 * 1024 * 1024) {
      // 25MB limit
      await safeEditReply(
        interaction,
        isDeferred,
        '❌ File too large. Please upload a CSV file smaller than 25MB.'
      );
      safeReturn(uploadKey);
      return;
    }

    // Check if corpus title already exists
    const existingCorpus = await databaseService.prisma.corpus.findUnique({
      where: { title },
    });

    if (existingCorpus) {
      await safeEditReply(
        interaction,
        isDeferred,
        `❌ A corpus with the title "${title}" already exists. Please choose a different title.`
      );
      safeReturn(uploadKey);
      return;
    }

    // Download and parse the CSV file
    const csvContent = await downloadAttachment(attachment.url);
    if (!csvContent) {
      await safeEditReply(
        interaction,
        isDeferred,
        '❌ Failed to download the CSV file. Please try again.'
      );
      safeReturn(uploadKey);
      return;
    }

    // Parse CSV content using functional approach
    const { entries, errors: parseErrors } = parseCorpusCSV(csvContent);

    if (parseErrors.length > 0) {
      const errorMessage = formatValidationErrors(parseErrors);
      await safeEditReply(
        interaction,
        isDeferred,
        `❌ Corpus CSV validation failed:\n\n${errorMessage}`
      );
      safeReturn(uploadKey);
      return;
    }

    if (entries.length === 0) {
      await safeEditReply(
        interaction,
        isDeferred,
        '❌ No valid corpus entries found in the CSV file.'
      );
      safeReturn(uploadKey);
      return;
    }

    if (entries.length > 1000) {
      await safeEditReply(
        interaction,
        isDeferred,
        '❌ Too many entries. Maximum allowed is 1000 entries per corpus.'
      );
      safeReturn(uploadKey);
      return;
    }

    // Create corpus in database
    const corpusId = `corpus_${interaction.id}_${Date.now()}`;

    await databaseService.prisma.$transaction(async tx => {
      // Create corpus
      const corpus = await tx.corpus.create({
        data: {
          id: corpusId,
          title: title,
        },
      });

      // Create corpus entries
      const entryData = entries.map(entry => ({
        corpusId: corpus.id,
        tags: entry.tags,
        questionVariants: entry.questionVariants,
        answerVariants: entry.answerVariants,
        hintTitles: entry.hintTitles,
        hintVariants: entry.hintVariants,
      }));

      await tx.corpusEntry.createMany({
        data: entryData,
      });
    });

    // Create success embed
    const embed = new EmbedBuilder()
      .setTitle('✅ Corpus Created Successfully')
      .setDescription(`**${title}** has been created from your CSV file!`)
      .addFields(
        { name: 'Corpus ID', value: corpusId, inline: true },
        { name: 'Entries', value: entries.length.toString(), inline: true },
        { name: 'Created By', value: interaction.user.username, inline: true },
        { name: 'Hint Types', value: entries[0]?.hintTitles.length.toString() || '0', inline: true }
      )
      .setColor('#00ff00')
      .setTimestamp();

    await safeEditReply(interaction, isDeferred, { embeds: [embed] });

    logger.info(
      `Corpus "${title}" created from CSV by ${interaction.user.tag} with ${entries.length} entries`
    );
  } catch (error) {
    logger.error('Error uploading corpus CSV:', error);
    await safeEditReply(
      interaction,
      isDeferred,
      '❌ An error occurred while processing your corpus CSV file. Please check the format and try again.'
    );
  } finally {
    // Always clean up the tracking map
    uploadInProgress.delete(uploadKey);
  }
}

async function safeEditReply(
  interaction: ChatInputCommandInteraction,
  isDeferred: boolean,
  content: string | any
): Promise<void> {
  try {
    // Check if we can still respond to the interaction
    if (interaction.replied) {
      logger.warn('Interaction already replied to, cannot send response');
      return;
    }

    if (isDeferred) {
      // Try to edit the deferred reply
      await interaction.editReply(content);
    } else {
      // Try to send a direct reply
      const replyContent =
        typeof content === 'string'
          ? { content, ephemeral: true }
          : { ...content, ephemeral: true };
      await interaction.reply(replyContent);
    }
  } catch (error) {
    // Log the error but don't throw - we don't want to crash the command
    logger.error('Failed to send interaction response:', error);

    // If this is an "Unknown interaction" error, the user won't see any response
    // but at least we won't crash the bot
    if (error instanceof Error && error.message.includes('Unknown interaction')) {
      logger.warn('Interaction expired - user will not receive response');
    }
  }
}

async function downloadAttachment(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    logger.error('Error downloading attachment:', error);
    return null;
  }
}

function identifyColumns(headers: string[]): {
  questionCol: string | null;
  answerCol: string | null;
  tagCol: string | null;
  hintCols: string[];
  errors: ValidationError[];
} {
  const questionPatterns = /^questions?$/i;
  const answerPatterns = /^answers?$/i;
  const tagPatterns = /^tags?$/i;

  let questionCol: string | null = null;
  let answerCol: string | null = null;
  let tagCol: string | null = null;
  const hintCols: string[] = [];
  const errors: ValidationError[] = [];

  // Find question column
  questionCol = headers.find(h => questionPatterns.test(h)) || null;

  // Find answer column
  answerCol = headers.find(h => answerPatterns.test(h)) || null;

  // Find tag column (optional)
  tagCol = headers.find(h => tagPatterns.test(h)) || null;

  // Validation
  if (!questionCol) {
    errors.push({
      row: 1,
      field: 'Headers',
      message: 'CSV must contain a "question" or "questions" column (case-insensitive)',
    });
  }

  if (!answerCol) {
    errors.push({
      row: 1,
      field: 'Headers',
      message: 'CSV must contain an "answer" or "answers" column (case-insensitive)',
    });
  }

  // Remaining columns are hint columns
  for (const header of headers) {
    if (header !== questionCol && header !== answerCol && header !== tagCol) {
      hintCols.push(header);
    }
  }

  return { questionCol, answerCol, tagCol, hintCols, errors };
}

function parseCorpusCSV(csvContent: string): {
  entries: CSVCorpusEntry[];
  errors: ValidationError[];
} {
  const parseResult = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  // Handle parsing errors
  if (parseResult.errors.length > 0) {
    const errors = parseResult.errors.map(error => ({
      row: (error.row || 0) + 1,
      field: 'CSV Format',
      message: error.message,
    }));
    return { entries: [], errors };
  }

  // Get column headers and identify column types
  const headers = Object.keys(parseResult.data[0] || {});
  if (headers.length < 2) {
    return {
      entries: [],
      errors: [
        {
          row: 1,
          field: 'Headers',
          message: 'CSV must have at least question and answer columns',
        },
      ],
    };
  }

  const {
    questionCol,
    answerCol,
    tagCol,
    hintCols,
    errors: columnErrors,
  } = identifyColumns(headers);

  if (columnErrors.length > 0) {
    return { entries: [], errors: columnErrors };
  }

  // Process rows functionally
  const rowsWithValidation = parseResult.data.map((row: any, index: number) => ({
    row,
    index: index + 1,
    errors: validateCorpusRow(row, index + 1, questionCol!, answerCol!, tagCol, hintCols),
  }));

  // Partition into valid and invalid rows
  const [validRows, invalidRows] = partition(
    rowsWithValidation,
    ({ errors }: { errors: ValidationError[] }) => errors.length === 0
  );

  // Extract entries from valid rows
  const entries = validRows.map(({ row }: { row: any }) =>
    transformRowToCorpusEntry(row, questionCol!, answerCol!, tagCol, hintCols)
  );

  // Extract errors from invalid rows
  const errors = invalidRows.flatMap(({ errors }: { errors: ValidationError[] }) => errors);

  return { entries, errors };
}

function transformRowToCorpusEntry(
  row: any,
  questionCol: string,
  answerCol: string,
  tagCol: string | null,
  hintCols: string[]
): CSVCorpusEntry {
  // Parse tag variants (newline-delimited, optional)
  const tags =
    tagCol && row[tagCol]
      ? (row[tagCol] || '')
          .trim()
          .split('\n')
          .map((t: string) => t.trim().toLowerCase()) // Normalize to lowercase
          .filter((t: string) => t.length > 0)
      : [];

  // Parse question variants (newline-delimited)
  const questionVariants = (row[questionCol] || '')
    .trim()
    .split('\n')
    .map((q: string) => q.trim())
    .filter((q: string) => q.length > 0);

  // Parse answer variants (newline-delimited)
  const answerVariants = (row[answerCol] || '')
    .trim()
    .split('\n')
    .map((a: string) => a.trim())
    .filter((a: string) => a.length > 0);

  // Parse hint variants for each hint column
  const hintVariants: Record<string, string[]> = {};
  const validHintTitles: string[] = [];

  for (const hintCol of hintCols) {
    const hintContent = (row[hintCol] || '').trim();
    if (hintContent) {
      const variants = hintContent
        .split('\n')
        .map((h: string) => h.trim())
        .filter((h: string) => h.length > 0);

      if (variants.length > 0) {
        hintVariants[hintCol] = variants;
        validHintTitles.push(hintCol);
      }
    }
  }

  return {
    tags,
    questionVariants,
    answerVariants,
    hintTitles: validHintTitles,
    hintVariants,
  };
}

function validateCorpusRow(
  row: any,
  rowNumber: number,
  questionCol: string,
  answerCol: string,
  tagCol: string | null,
  hintCols: string[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check required fields
  const questionText = (row[questionCol] || '').trim();
  if (!questionText) {
    errors.push({
      row: rowNumber,
      field: questionCol,
      message: 'Question variants are required',
    });
  } else {
    const questionVariants = questionText
      .split('\n')
      .map((q: string) => q.trim())
      .filter((q: string) => q.length > 0);
    if (questionVariants.length === 0) {
      errors.push({
        row: rowNumber,
        field: questionCol,
        message: 'At least one question variant is required',
      });
    }
  }

  const answerText = (row[answerCol] || '').trim();
  if (!answerText) {
    errors.push({
      row: rowNumber,
      field: answerCol,
      message: 'Answer variants are required',
    });
  } else {
    const answerVariants = answerText
      .split('\n')
      .map((a: string) => a.trim())
      .filter((a: string) => a.length > 0);
    if (answerVariants.length === 0) {
      errors.push({
        row: rowNumber,
        field: answerCol,
        message: 'At least one answer variant is required',
      });
    }
  }

  // Validate tag column (optional)
  if (tagCol && row[tagCol]) {
    const tagText = (row[tagCol] || '').trim();
    if (tagText) {
      const tags = tagText
        .split('\n')
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 0);

      // Check for excessively long tags
      for (const tag of tags) {
        if (tag.length > 50) {
          errors.push({
            row: rowNumber,
            field: tagCol,
            message: `Tag "${tag}" is too long (max 50 characters)`,
          });
        }

        // Check for empty tags after trimming
        if (tag.length === 0) {
          errors.push({
            row: rowNumber,
            field: tagCol,
            message: 'Empty tags are not allowed',
          });
        }
      }
    }
  }

  // Validate hint columns (optional, but if present must have content)
  for (const hintCol of hintCols) {
    const hintContent = (row[hintCol] || '').trim();
    if (hintContent) {
      const hintVariants = hintContent
        .split('\n')
        .map((h: string) => h.trim())
        .filter((h: string) => h.length > 0);
      if (hintVariants.length === 0) {
        errors.push({
          row: rowNumber,
          field: hintCol,
          message: 'Hint column must contain at least one variant or be empty',
        });
      }
    }
  }

  return errors;
}

function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) return '';

  const errorGroups = new Map<string, ValidationError[]>();

  errors.forEach(error => {
    const key = error.row === 0 ? 'General' : `Row ${error.row}`;
    if (!errorGroups.has(key)) {
      errorGroups.set(key, []);
    }
    errorGroups.get(key)!.push(error);
  });

  let message = '';

  for (const [group, groupErrors] of errorGroups) {
    message += `**${group}:**\n`;
    groupErrors.forEach(error => {
      message += `• ${error.field}: ${error.message}\n`;
    });
    message += '\n';
  }

  return message.trim();
}
