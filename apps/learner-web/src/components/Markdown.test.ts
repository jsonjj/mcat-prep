// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import {
  act,
  create,
  type ReactTestRenderer,
  type ReactTestRendererJSON,
} from 'react-test-renderer';
import { Markdown } from './Markdown';

/**
 * <Markdown> is the minimal, safe renderer for AI feedback. It must (1) turn
 * `**bold**` into <strong> and `- ` lines into a real <ul>/<li> list with no raw
 * asterisks or bullet markers left in the text, and (2) never emit raw HTML from
 * model output — everything is escaped React text, so injection is impossible.
 */

type Walkable = ReactTestRendererJSON | ReactTestRendererJSON[] | string | null;

function render(content: string): Walkable {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(createElement(Markdown, { content }));
  });
  return r.toJSON();
}

function walk(node: Walkable, visit: (n: ReactTestRendererJSON | string) => void): void {
  if (node === null) return;
  if (typeof node === 'string') {
    visit(node);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((c) => walk(c, visit));
    return;
  }
  visit(node);
  if (node.children) node.children.forEach((c) => walk(c, visit));
}

function collect(content: string): { types: string[]; strings: string[] } {
  const types: string[] = [];
  const strings: string[] = [];
  walk(render(content), (n) => {
    if (typeof n === 'string') strings.push(n);
    else types.push(n.type);
  });
  return { types, strings };
}

describe('Markdown (minimal safe renderer)', () => {
  it('renders **bold** as <strong> and leaves no literal asterisks', () => {
    const { types, strings } = collect('**Strongest point you made:**');
    expect(types).toContain('strong');
    expect(strings.join(' ')).toContain('Strongest point you made:');
    expect(strings.join('')).not.toContain('*');
  });

  it('renders "- " lines as one real <ul> with <li> items (markers consumed)', () => {
    const md = ['**Heading:**', '- first idea', '- second idea', '- third idea'].join('\n');
    const { types, strings } = collect(md);
    expect(types.filter((t) => t === 'ul')).toHaveLength(1);
    expect(types.filter((t) => t === 'li')).toHaveLength(3);
    expect(strings.join(' ')).toContain('first idea');
    // No leftover bullet markers or asterisks in the rendered text.
    expect(strings.some((s) => s.trimStart().startsWith('- '))).toBe(false);
    expect(strings.join('')).not.toContain('*');
  });

  it('escapes raw HTML from model output (injection-safe)', () => {
    const { types, strings } = collect('- <img src=x onerror=alert(1)>');
    expect(types).not.toContain('img');
    // The markup survives only as inert, escaped text inside a list item.
    expect(strings.join('')).toContain('<img src=x onerror=alert(1)>');
  });

  it('falls back to a plain paragraph for unstyled text', () => {
    const { types, strings } = collect('Just a sentence.');
    expect(types).toContain('p');
    expect(types).not.toContain('ul');
    expect(strings.join(' ')).toContain('Just a sentence.');
  });
});
