/**
 * Authoring-loop validation gate for app-native lessons.
 *
 * Loads every registered lesson and checks: (1) the script/presentation pair is
 * structurally valid (validateLessonPreviewPair), and (2) every MCQ has a correct
 * option that exists and complete per-option feedback. Run with `node scripts/validate-app-native.mjs`.
 */
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  root: new URL('..', import.meta.url).pathname,
  logLevel: 'silent',
  server: { middlewareMode: true },
});

try {
  const contract = await server.ssrLoadModule('/src/app-native/contract.ts');
  const mod = await server.ssrLoadModule('/src/app-native/index.ts');
  const lessons = mod.APP_NATIVE_LESSONS;
  let questions = 0;
  for (const { script, presentation } of lessons) {
    contract.validateLessonPreviewPair(script, presentation);
    for (const node of script.nodes) {
      if (node.kind !== 'question') continue;
      questions += 1;
      const ids = node.options.map((o) => o.id);
      const correct = node.evaluation.correctOptionId;
      if (!ids.includes(correct)) {
        throw new Error(`${script.id}/${node.id}: correct option ${correct} not in options`);
      }
      for (const id of ids) {
        if (!node.evaluation.feedbackByOption[id]) {
          throw new Error(`${script.id}/${node.id}: missing feedback for option ${id}`);
        }
      }
    }
  }
  console.log(`OK: ${lessons.length} lessons, ${questions} questions validated.`);
} finally {
  await server.close();
}
