import { describe, expect, it } from 'vitest';
import {
  clozeNumbersIn,
  extractMediaFilenames,
  renderAnkiCard,
  renderCloze,
  type AnkiModel,
} from './apkg-render';

const basicModel: AnkiModel = {
  id: '1',
  name: 'Basic (reversed)',
  type: 0,
  flds: [
    { name: 'Front', ord: 0 },
    { name: 'Back', ord: 1 },
  ],
  tmpls: [
    { ord: 0, name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr>{{Back}}' },
    { ord: 1, name: 'Card 2', qfmt: '{{Back}}', afmt: '{{FrontSide}}<hr>{{Front}}' },
  ],
};

const clozeModel: AnkiModel = {
  id: '2',
  name: 'Cloze',
  type: 1,
  flds: [
    { name: 'Text', ord: 0 },
    { name: 'Extra', ord: 1 },
  ],
  tmpls: [{ ord: 0, name: 'Cloze', qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}{{#Extra}}<hr>{{Extra}}{{/Extra}}' }],
};

describe('apkg render — standard', () => {
  it('renders the front template and answer', () => {
    const card = renderAnkiCard(
      basicModel,
      { id: 'n1', mid: '1', fields: ['Powerhouse of the cell?', 'Mitochondria'], tags: ['cell'] },
      { id: 'c1', nid: 'n1', ord: 0, deckName: 'Biology::Cell' },
    );
    expect(card.type).toBe('basic');
    expect(card.frontHtml).toContain('Powerhouse of the cell?');
    expect(card.backHtml).toContain('Mitochondria');
    expect(card.backHtml).toContain('Powerhouse of the cell?'); // FrontSide
    expect(card.tags).toEqual(['cell', 'Biology::Cell']);
  });

  it('renders the reversed template (ord 1)', () => {
    const card = renderAnkiCard(
      basicModel,
      { id: 'n1', mid: '1', fields: ['Front text', 'Back text'], tags: [] },
      { id: 'c2', nid: 'n1', ord: 1 },
    );
    expect(card.frontHtml).toContain('Back text');
    expect(card.backHtml).toContain('Front text');
  });
});

describe('apkg render — cloze', () => {
  const note = {
    id: 'n2',
    mid: '2',
    fields: ['{{c1::Paris}} is the capital of {{c2::France}}', 'European geography'],
    tags: [],
  };

  it('blanks the active cloze and shows the others (front), reveals on back', () => {
    const c1 = renderAnkiCard(clozeModel, note, { id: 'c1', nid: 'n2', ord: 0 });
    expect(c1.type).toBe('cloze');
    expect(c1.frontHtml).toContain('[...]');
    expect(c1.frontHtml).toContain('France'); // other cloze shown
    expect(c1.frontHtml).not.toContain('Paris'); // active blanked on front
    expect(c1.backHtml).toContain('Paris'); // revealed on back
    expect(c1.backHtml).toContain('European geography'); // Extra section included
  });

  it('targets the second cloze for ord 1', () => {
    const c2 = renderAnkiCard(clozeModel, note, { id: 'c2', nid: 'n2', ord: 1 });
    expect(c2.frontHtml).toContain('Paris'); // other cloze shown
    expect(c2.frontHtml).toContain('[...]'); // France blanked
    expect(c2.frontHtml).not.toContain('France');
  });

  it('honors a cloze hint', () => {
    expect(renderCloze('{{c1::Paris::capital}}', 1, false)).toContain('[capital]');
    expect(clozeNumbersIn('{{c1::a}} {{c3::b}} {{c1::c}}')).toEqual([1, 3]);
  });
});

describe('apkg render — media & conditionals', () => {
  it('extracts media and rewrites sound tags', () => {
    const card = renderAnkiCard(
      basicModel,
      {
        id: 'n3',
        mid: '1',
        fields: ['<img src="diagram.png"> look', 'answer [sound:clip.mp3]'],
        tags: [],
      },
      { id: 'c3', nid: 'n3', ord: 0 },
    );
    expect(card.backHtml).toContain('<audio');
    expect(card.backHtml).toContain('src="clip.mp3"');
    expect(card.mediaFilenames.sort()).toEqual(['clip.mp3', 'diagram.png']);
  });

  it('drops empty conditional sections', () => {
    const card = renderAnkiCard(
      clozeModel,
      { id: 'n4', mid: '2', fields: ['{{c1::x}}', ''], tags: [] },
      { id: 'c4', nid: 'n4', ord: 0 },
    );
    expect(card.backHtml).not.toContain('<hr>');
  });

  it('lists media filenames from html helper', () => {
    expect(extractMediaFilenames('<img src="a.png"><audio src="b.mp3">')).toEqual([
      'a.png',
      'b.mp3',
    ]);
  });
});
