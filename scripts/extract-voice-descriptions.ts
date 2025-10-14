#!/usr/bin/env tsx

/**
 * Voice Description Extractor - Proof of Concept
 *
 * Extracts voice IDs and personality descriptions from scraped ElevenLabs HTML.
 *
 * Usage:
 *   pnpm tsx scripts/extract-voice-descriptions.ts
 *
 * Output:
 *   data/voice-descriptions.json
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

interface VoiceDescription {
  voiceId: string;
  voiceName: string;
  description: string;
}

/**
 * Clean HTML entities and excessive whitespace
 */
function cleanText(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Remove age/expiry suffixes like "2y", "180d", "0d" from end of descriptions
 */
function stripAgeSuffix(text: string): string {
  // Match pattern: space + digits + 'y' or 'd' at end of string
  return text.replace(/\s+\d+[dy]$/, '').trim();
}

/**
 * Extract voice ID from data-testid attribute
 * Pattern: "voices-item-{VOICE_ID}"
 */
function extractVoiceId(testId: string): string | null {
  const match = testId.match(/^voices-item-(.+)$/);
  return match ? match[1] : null;
}

/**
 * Main extraction logic
 */
async function extractVoiceDescriptions(): Promise<Map<string, VoiceDescription>> {
  const htmlPath = path.join(process.cwd(), 'data', 'elevenlabs-voices.html');

  console.log('📖 Reading HTML file...');
  const html = fs.readFileSync(htmlPath, 'utf-8');

  console.log('🔍 Parsing HTML with Cheerio...');
  const $ = cheerio.load(html);

  const descriptions = new Map<string, VoiceDescription>();
  let processed = 0;
  let skipped = 0;

  // Find all voice list items
  $('li[data-testid^="voices-item-"]').each((_, element) => {
    const $item = $(element);

    // Extract voice ID from data-testid
    const testId = $item.attr('data-testid');
    if (!testId) {
      skipped++;
      return;
    }

    const voiceId = extractVoiceId(testId);
    if (!voiceId) {
      skipped++;
      return;
    }

    // Extract voice name from the button aria-label or the paragraph
    const ariaLabel = $item.find('button[data-type="list-item-trigger-overlay"]').attr('aria-label');
    let voiceName = '';

    if (ariaLabel) {
      // aria-label format: "Name - Description - ..."
      // Extract just the name part
      const namePart = ariaLabel.split(' - ')[0];
      voiceName = cleanText(namePart);
    }

    // If we couldn't get name from aria-label, try the paragraph
    if (!voiceName) {
      const nameElement = $item.find('p.text-sm.text-foreground.font-semibold span.truncate');
      voiceName = cleanText(nameElement.text());
    }

    // Extract description from the specific paragraph class
    const descElement = $item.find('p.text-sm.text-subtle.font-normal.line-clamp-1');
    const description = stripAgeSuffix(cleanText(descElement.text()));

    if (description) {
      descriptions.set(voiceId, {
        voiceId,
        voiceName,
        description,
      });
      processed++;
    } else {
      console.warn(`⚠️  No description found for voice: ${voiceId} (${voiceName})`);
      skipped++;
    }
  });

  console.log(`\n✅ Processed: ${processed} voices`);
  console.log(`⚠️  Skipped: ${skipped} items`);

  return descriptions;
}

/**
 * Save results to JSON files
 */
function saveResults(descriptions: Map<string, VoiceDescription>): void {
  const outputDir = path.join(process.cwd(), 'data');

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Convert Map to object for JSON serialization
  const descriptionsObj: Record<string, string> = {};
  const detailedObj: VoiceDescription[] = [];

  descriptions.forEach((value, key) => {
    descriptionsObj[key] = value.description;
    detailedObj.push(value);
  });

  // Save simple mapping (voice ID → description)
  const simplePath = path.join(outputDir, 'voice-descriptions.json');
  fs.writeFileSync(simplePath, JSON.stringify(descriptionsObj, null, 2), 'utf-8');
  console.log(`\n💾 Saved simple mapping: ${simplePath}`);
  console.log(`   ${Object.keys(descriptionsObj).length} voice descriptions`);

  // Save detailed data (includes names)
  const detailedPath = path.join(outputDir, 'voice-descriptions-detailed.json');
  fs.writeFileSync(detailedPath, JSON.stringify(detailedObj, null, 2), 'utf-8');
  console.log(`\n💾 Saved detailed data: ${detailedPath}`);

  // Print sample
  console.log('\n📋 Sample output:');
  const sample = Array.from(descriptions.values()).slice(0, 3);
  sample.forEach((voice) => {
    console.log(`\n  ${voice.voiceId}`);
    console.log(`  Name: ${voice.voiceName}`);
    console.log(`  Description: ${voice.description.substring(0, 80)}${voice.description.length > 80 ? '...' : ''}`);
  });
}

/**
 * Main execution
 */
async function main() {
  console.log('🎤 ElevenLabs Voice Description Extractor - POC\n');

  try {
    const descriptions = await extractVoiceDescriptions();

    if (descriptions.size === 0) {
      console.error('❌ No descriptions extracted! Check HTML structure.');
      process.exit(1);
    }

    saveResults(descriptions);

    console.log('\n✨ Extraction complete!\n');
  } catch (error) {
    console.error('❌ Extraction failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { extractVoiceDescriptions };
export type { VoiceDescription };
