#!/usr/bin/env node
import { createMcatApp } from '../lib/app.js';

const stage = process.env.MCAT_STAGE ?? 'dev';
createMcatApp({ stage, target: process.env });
