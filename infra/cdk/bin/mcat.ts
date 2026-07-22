#!/usr/bin/env node
import { createMcatApp, DEFAULT_RUNTIME_ENTRIES } from '../lib/app.js';

const stage = process.env.MCAT_STAGE ?? 'dev';
createMcatApp({
  stage,
  target: process.env,
  learnerRuntimeEntry: DEFAULT_RUNTIME_ENTRIES.learner,
  workerRuntimeEntries: DEFAULT_RUNTIME_ENTRIES.workers,
});
