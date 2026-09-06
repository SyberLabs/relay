import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const slogans = [
  'Selection is the largest lever',
  'Make your next move.',
  'Correct the writer, not the letter.',
  'Choose between two jobs. Not between two sliders.',
  'Close the loop, and know what you claimed.',
  'Facts it may claim. Voice it must use.',
  'Evidence before action',
  'Decisions carry forward.',
  'Revealed, not declared.',
  'Put the next hunt through its history.',
  'Good decisions start',
  'History stays with the job.',
  'CAREER / REVIEW',
  'START WITH YOUR REAL WORK',
  'REVIEW · CALIBRATE THE WRITER',
  'PROFILE · WHAT THE AGENT WRITES FROM',
  'PREFERENCES · WHAT A JOB IS WORTH TO YOU',
  'WHAT CAME BACK, AND WHAT YOU MUST DEFEND',
  'THIS WEEK · WHAT TO ACTUALLY APPLY TO',
  'SYBERLABS / PRIVATE WORKSPACE',
  'Working version · Research and preparation',
  'Research. Prepare. Review.',
  'Outcomes are what make the estimates real.',
  'Preferences decide what reaches your week.',
  'The agent reads this. Only you write it.',
  'Review changes the writer, not just the text.',
  'Claims are pre-checked.',
  'One opportunity. One history.',
  'Your next move',
  'Bring the history with you.',
];

async function appScreens() {
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith('.tsx')) files.push(path);
    }
  };
  await walk('app');
  return files;
}

void test('web screens name the work instead of shipping manifesto slogans', async () => {
  const hits = [];
  for (const file of await appScreens()) {
    const text = await readFile(file, 'utf8');
    for (const slogan of slogans)
      if (text.includes(slogan)) hits.push(`${file}: ${slogan}`);
  }
  assert.deepEqual(hits, []);
});
