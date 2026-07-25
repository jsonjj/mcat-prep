import assert from 'node:assert/strict';
import { link, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertManifestSafe,
  assertSafeOutputTarget,
  buildSourceAnchorReferences,
  projectSourceRecord,
  writeFileAtomically,
} from './generate-v3-lesson-authoring-manifest.mjs';

test('source projections reject unknown top-level and nested fields', () => {
  assert.throws(
    () =>
      projectSourceRecord(
        { support_id: 'V3-SUP-TEST', unexpected_authoring_field: true },
        'support',
        'test support',
      ),
    /unallowlisted field/,
  );
  assert.throws(
    () =>
      projectSourceRecord(
        {
          support_id: 'V3-SUP-TEST',
          purpose: { unexpected_nested_authoring_field: true },
        },
        'support',
        'test support',
      ),
    /unallowlisted nested field/,
  );
});

test('pre-write safety scan rejects protected fields, stale fields, and machine paths', () => {
  assert.throws(() => assertManifestSafe({ payload: { exact_text: 'protected' } }), /sensitive/);
  assert.throws(
    () => assertManifestSafe({ source_stage_review_status: 'PENDING' }),
    /stale pre-completion/,
  );
  assert.throws(
    () => assertManifestSafe({ provenance: '/Users/example/private/source.json' }),
    /machine path/,
  );
  assert.throws(
    () => assertManifestSafe({ provenance: 'C:\\Users\\example\\private\\source.json' }),
    /machine path/,
  );
  assert.doesNotThrow(() =>
    assertManifestSafe({ source_file: { path: 'curriculum-architecture-v3/source.json' } }),
  );
});

test('pre-write safety scan rejects generic absolute paths without flagging prose or URLs', () => {
  for (const machinePath of [
    '/root/private/source.json',
    'generated under /workspace/project/output.json',
    'mounted at /mnt/data/package.json',
    'binary: /usr/local/bin/node',
    'cache in /Library/Application Support/tool',
    'custom location /arbitrary/machine/root/file.json',
    'file:///var/tmp/source.json',
    '~/private/source.json',
    '$HOME/private/source.json',
    '${WORKSPACE}/private/source.json',
    'C:\\build\\private\\source.json',
    '\\\\server\\share\\private\\source.json',
  ]) {
    assert.throws(() => assertManifestSafe({ value: machinePath }), /machine path/);
  }

  for (const safeText of [
    'Compare input/output behavior and report rates in m/s.',
    'Use 1 / 2 as the illustrative ratio.',
    'See https://example.org/usr/local/reference?redirect=/root/source.',
    'See http://localhost:3000/workspace/reference.',
    'See //docs.example.org/usr/reference for public documentation.',
  ]) {
    assert.doesNotThrow(() => assertManifestSafe({ value: safeText }));
  }
});

test('source anchors preserve direct-heading and multi-topic breadth deterministically', () => {
  const occurrences = [
    {
      source_occurrence_id: 'SRC-BB-1',
      occurrence_kind: 'AAMC_TEACHABLE_TOPIC',
      source_anchor_ids: ['BB-SA-0017'],
      official_topic: 'Amino Acids (BC, OC)',
      official_path: ['Section', 'Amino Acids (BC, OC)'],
      printed_pages: [26],
      section: 'Section',
      source_topic_id: 'TOPIC-BB-1',
    },
    {
      source_occurrence_id: 'SRC-BB-2',
      occurrence_kind: 'AAMC_TEACHABLE_TOPIC',
      source_anchor_ids: ['BB-SA-0017'],
      official_topic: 'Protein Structure (BIO, BC, OC)',
      official_path: ['Section', 'Protein Structure (BIO, BC, OC)'],
      printed_pages: [27],
      section: 'Section',
      source_topic_id: 'TOPIC-BB-2',
    },
    {
      source_occurrence_id: 'SRC-BB-3',
      occurrence_kind: 'AAMC_TEACHABLE_TOPIC',
      source_anchor_ids: ['BB-SA-0017'],
      official_topic: 'Nonenzymatic Protein Function (BIO, BC)',
      official_path: ['Section', 'Nonenzymatic Protein Function (BIO, BC)'],
      printed_pages: [27],
      section: 'Section',
      source_topic_id: 'TOPIC-BB-3',
    },
    {
      source_occurrence_id: 'SRC-BB-4',
      occurrence_kind: 'AAMC_TEACHABLE_TOPIC',
      source_anchor_ids: ['BB-SA-0017'],
      official_topic: 'Enzyme Structure and Function (BIO, BC)',
      official_path: ['Section', 'Enzyme Structure and Function (BIO, BC)'],
      printed_pages: [27],
      section: 'Section',
      source_topic_id: 'TOPIC-BB-4',
    },
    {
      source_occurrence_id: 'SRC-BB-5',
      occurrence_kind: 'AAMC_TEACHABLE_TOPIC',
      source_anchor_ids: ['BB-SA-0017'],
      official_topic: 'Control of Enzyme Activity (BIO, BC)',
      official_path: ['Section', 'Control of Enzyme Activity (BIO, BC)'],
      printed_pages: [27, 28],
      section: 'Section',
      source_topic_id: 'TOPIC-BB-5',
    },
    {
      source_occurrence_id: 'SRC-BB-DIRECT',
      occurrence_kind: 'AAMC_SOURCE_ANCHOR',
      source_anchor_id: 'BB-SA-0017',
      official_topic: null,
      official_path: ['MCAT', 'Foundational Concept 1', 'Content Category 1A'],
      printed_pages: [26, 27, 28],
      section: 'Section',
      source_topic_id: null,
    },
    {
      source_occurrence_id: 'SRC-DIRECT',
      occurrence_kind: 'AAMC_SOURCE_ANCHOR',
      source_anchor_ids: ['ANCHOR-PATH'],
      official_topic: null,
      official_path: ['Section', 'Final Official Path Label'],
      printed_pages: [4],
      section: 'Section',
      source_topic_id: null,
    },
    {
      source_occurrence_id: 'SRC-SINGLE',
      occurrence_kind: 'AAMC_TEACHABLE_TOPIC',
      source_anchor_ids: ['ANCHOR-SINGLE'],
      official_topic: 'Only Associated Topic',
      official_path: ['Section', 'Only Associated Topic'],
      printed_pages: [5],
      section: 'Section',
      source_topic_id: 'TOPIC-SINGLE',
    },
    {
      source_occurrence_id: 'SRC-MULTI-A',
      occurrence_kind: 'AAMC_TEACHABLE_TOPIC',
      source_anchor_ids: ['ANCHOR-INCLUSIVE'],
      official_topic: 'Zeta Topic',
      official_path: ['Section', 'Zeta Topic'],
      printed_pages: [6],
      section: 'Section',
      source_topic_id: 'TOPIC-MULTI-A',
    },
    {
      source_occurrence_id: 'SRC-MULTI-B',
      occurrence_kind: 'AAMC_TEACHABLE_TOPIC',
      source_anchor_ids: ['ANCHOR-INCLUSIVE'],
      official_topic: 'Alpha Topic',
      official_path: ['Section', 'Alpha Topic'],
      printed_pages: [6],
      section: 'Section',
      source_topic_id: 'TOPIC-MULTI-B',
    },
    {
      source_occurrence_id: 'SRC-LONG-A',
      occurrence_kind: 'AAMC_TEACHABLE_TOPIC',
      source_anchor_ids: ['ANCHOR-LONG-MULTI'],
      official_topic: `Alpha ${'A'.repeat(94)}`,
      official_path: ['Section', `Alpha ${'A'.repeat(94)}`],
      printed_pages: [7, 8],
      section: 'Section',
      source_topic_id: 'TOPIC-LONG-A',
    },
    {
      source_occurrence_id: 'SRC-LONG-B',
      occurrence_kind: 'AAMC_TEACHABLE_TOPIC',
      source_anchor_ids: ['ANCHOR-LONG-MULTI'],
      official_topic: `Beta ${'B'.repeat(95)}`,
      official_path: ['Section', `Beta ${'B'.repeat(95)}`],
      printed_pages: [7, 8],
      section: 'Section',
      source_topic_id: 'TOPIC-LONG-B',
    },
    {
      source_occurrence_id: 'SRC-PAGE',
      occurrence_kind: 'EDITORIAL_SUMMARY',
      source_anchor_ids: ['ANCHOR-PAGE'],
      official_topic: null,
      official_path: [],
      printed_pages: [7, 8],
      section: 'Section',
      source_topic_id: null,
    },
    {
      source_occurrence_id: 'SRC-ID',
      occurrence_kind: 'EDITORIAL_SUMMARY',
      source_anchor_ids: ['ANCHOR-ID'],
      official_topic: null,
      official_path: [],
      printed_pages: [],
      section: 'Section',
      source_topic_id: null,
    },
  ];

  const anchors = buildSourceAnchorReferences(occurrences);
  assert.deepEqual(anchors, buildSourceAnchorReferences([...occurrences].reverse()));
  const byId = Object.fromEntries(anchors.map((anchor) => [anchor.source_anchor_id, anchor]));
  assert.deepEqual(
    [
      byId['BB-SA-0017'].label,
      byId['BB-SA-0017'].label_source,
      byId['BB-SA-0017'].associated_topic_count,
    ],
    ['Content Category 1A', 'direct_aamc_source_anchor_heading', 5],
  );
  assert.deepEqual(
    [byId['ANCHOR-PATH'].label, byId['ANCHOR-PATH'].label_source],
    ['Final Official Path Label', 'direct_aamc_source_anchor_heading'],
  );
  assert.deepEqual(
    [byId['ANCHOR-SINGLE'].label, byId['ANCHOR-SINGLE'].label_source],
    ['Only Associated Topic', 'single_official_topic'],
  );
  assert.deepEqual(
    [
      byId['ANCHOR-INCLUSIVE'].label,
      byId['ANCHOR-INCLUSIVE'].label_source,
      byId['ANCHOR-INCLUSIVE'].associated_topic_count,
    ],
    ['Alpha Topic; Zeta Topic', 'inclusive_official_topics', 2],
  );
  assert.deepEqual(
    [byId['ANCHOR-LONG-MULTI'].label, byId['ANCHOR-LONG-MULTI'].label_source],
    ['Pages 7–8 — ANCHOR-LONG-MULTI', 'printed_pages_and_anchor_id'],
  );
  assert.deepEqual(
    [byId['ANCHOR-PAGE'].label, byId['ANCHOR-PAGE'].label_source],
    ['Pages 7–8 — ANCHOR-PAGE', 'printed_pages_and_anchor_id'],
  );
  assert.deepEqual(
    [byId['ANCHOR-ID'].label, byId['ANCHOR-ID'].label_source],
    ['Source anchor ANCHOR-ID', 'anchor_id'],
  );
  assert(
    anchors
      .filter((anchor) => anchor.associated_topic_count > 1)
      .every((anchor) => anchor.label_source !== 'single_official_topic'),
  );
  assert(anchors.every((anchor) => anchor.label.length > 0));
});

test('output alias checks reject direct, symlink, and hardlink source aliases', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'v3-manifest-alias-'));
  try {
    const protectedPath = join(directory, 'protected.json');
    const hardlinkPath = join(directory, 'hardlink.json');
    const symlinkPath = join(directory, 'symlink.json');
    const safePath = join(directory, 'safe.json');
    await writeFile(protectedPath, 'protected', 'utf8');
    await link(protectedPath, hardlinkPath);
    await symlink(protectedPath, symlinkPath);

    await assert.rejects(
      assertSafeOutputTarget(protectedPath, [protectedPath]),
      /aliases protected source/,
    );
    await assert.rejects(
      assertSafeOutputTarget(hardlinkPath, [protectedPath]),
      /inode aliases protected source/,
    );
    await assert.rejects(
      assertSafeOutputTarget(symlinkPath, [protectedPath]),
      /real path aliases protected source|aliases protected source/,
    );
    await assert.doesNotReject(assertSafeOutputTarget(safePath, [protectedPath]));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('atomic writer replaces output without leaving temporary files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'v3-manifest-atomic-'));
  try {
    const protectedPath = join(directory, 'protected.json');
    const outputPath = join(directory, 'manifest.json');
    await writeFile(protectedPath, 'protected', 'utf8');
    await writeFileAtomically(outputPath, '{"version":1}\n', [protectedPath]);
    assert.equal(await readFile(outputPath, 'utf8'), '{"version":1}\n');
    assert.deepEqual(
      (await readdir(directory)).filter((name) => name.endsWith('.tmp')),
      [],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('checked-in manifest pins the reconciled contract and required KC projection', async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL('../curriculum/v3/v3-lesson-authoring-manifest.json', import.meta.url),
      'utf8',
    ),
  );

  assert.deepEqual(manifest.metadata.canonical_contract, {
    path: 'docs/design/mcat-complete-learning-flow.md',
    sha256: '81f0de7ac2a57b0c794467ed0af94714309abb8602d1b0df29ff7602aa88d642',
    version: '0.3',
  });
  assert.equal(
    manifest.metadata.source_files.find(
      (source) => source.path === 'docs/design/mcat-complete-learning-flow.md',
    ).schema_version,
    'design-specification-0.3',
  );

  for (const lesson of manifest.curriculum.lessons) {
    assert.deepEqual(
      lesson.ordered_required_kc_ids,
      lesson.nested_kc_ids,
      `${lesson.lesson_id} current required-KC projection`,
    );
  }
});
