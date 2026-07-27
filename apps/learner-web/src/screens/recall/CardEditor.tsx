import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { clozeNumbersIn, renderCloze } from '@mcat/recall-core';
import {
  useCreateBasic,
  useCreateCloze,
  useRecallService,
  useUpdateImportedCard,
  useUpdateUserNote,
} from '../../app/recall-queries';
import { sanitizeCardHtml } from '../../recall/adapters/html-sanitize';
import type { RecallService } from '../../recall/recall-service';

/**
 * Create/edit flashcards with a native-styled WYSIWYG editor.
 *
 *  - Create (`/app/recall/new`): pick Basic / Basic + reversed / Cloze, author the
 *    rich fields, preview, tag, then Save (or Save & add another).
 *  - Edit (`/app/recall/edit/:cardId`): user notes edit their fields and propagate
 *    to siblings; imported cards edit that one card's front/back in place.
 *
 * Rich text uses `document.execCommand`; media (image/audio) is stored in the
 * platform media store and referenced by a stable `data-recall-media` placeholder,
 * so the volatile `blob:` object URL is stripped on save (see stripBlobSrc).
 * Recall is fact-only and never touches mastery.
 */

type CreateType = 'basic' | 'basic-reversed' | 'cloze';
type ActiveType = 'basic' | 'cloze';

interface InsertedMedia {
  id: string;
  url: string;
  kind: 'image' | 'audio';
}

const CREATE_TYPES: { id: CreateType; label: string }[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'basic-reversed', label: 'Basic + reversed' },
  { id: 'cloze', label: 'Cloze' },
];

/** Remove the ephemeral `blob:` object URL, leaving only the media placeholder. */
function stripBlobSrc(html: string): string {
  return html.replace(/\s*src=(["'])blob:[^"']*\1/gi, '');
}

/** Add a resolved `src` next to each stored media placeholder so it renders while editing. */
async function hydrateMediaForEditing(html: string, service: RecallService): Promise<string> {
  const ids = [
    ...new Set(
      [...html.matchAll(/data-recall-media="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  let out = html;
  for (const id of ids) {
    const url = await service.mediaStore.getUrl(id);
    if (url) {
      out = out
        .split(`data-recall-media="${id}"`)
        .join(`data-recall-media="${id}" src="${url}"`);
    }
  }
  return out;
}

/** A field is "empty" only when it has no text AND no media. */
function isBlank(html: string): boolean {
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return text.length === 0 && !/<(?:img|audio)\b/i.test(html);
}

function placeCaretAtEnd(el: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function caretRangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?(cx: number, cy: number): Range | null;
    caretPositionFromPoint?(cx: number, cy: number): { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretRangeFromPoint === 'function') return doc.caretRangeFromPoint(x, y);
  if (typeof doc.caretPositionFromPoint === 'function') {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      const range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
      return range;
    }
  }
  return null;
}

interface RichFieldProps {
  id: string;
  label: string;
  defaultHtml: string;
  onChange: (html: string) => void;
  onInsertMedia: (file: File) => Promise<InsertedMedia | null>;
  showCloze?: boolean;
  autoFocus?: boolean;
  hint?: string;
}

/** A single contentEditable field with a formatting/media toolbar. */
function RichField({
  id,
  label,
  defaultHtml,
  onChange,
  onInsertMedia,
  showCloze = false,
  autoFocus = false,
  hint,
}: RichFieldProps) {
  const editableRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Seed the editor once on mount; parent controls re-seeding by remounting (key).
  useEffect(() => {
    const el = editableRef.current;
    if (!el) return;
    el.innerHTML = defaultHtml;
    if (autoFocus) {
      el.focus();
      placeCaretAtEnd(el);
    }
  }, []);

  const emit = useCallback(() => {
    onChange(editableRef.current?.innerHTML ?? '');
  }, [onChange]);

  const saveSelection = useCallback(() => {
    const selection = window.getSelection();
    if (
      selection &&
      selection.rangeCount > 0 &&
      editableRef.current?.contains(selection.anchorNode)
    ) {
      savedRange.current = selection.getRangeAt(0).cloneRange();
    }
  }, []);

  const runCommand = useCallback(
    (command: string) => {
      editableRef.current?.focus();
      document.execCommand(command, false);
      emit();
    },
    [emit],
  );

  const insertHtml = useCallback(
    (html: string) => {
      const el = editableRef.current;
      if (!el) return;
      el.focus();
      const selection = window.getSelection();
      const range = savedRange.current;
      if (selection) {
        if (range && el.contains(range.commonAncestorContainer)) {
          selection.removeAllRanges();
          selection.addRange(range);
        } else if (!el.contains(selection.anchorNode)) {
          placeCaretAtEnd(el);
        }
      }
      document.execCommand('insertHTML', false, html);
      savedRange.current = null;
      emit();
    },
    [emit],
  );

  const insertMediaFile = useCallback(
    async (file: File) => {
      const media = await onInsertMedia(file);
      if (!media) return;
      const html =
        media.kind === 'image'
          ? `<img src="${media.url}" data-recall-media="${media.id}" alt="" />`
          : `<audio controls src="${media.url}" data-recall-media="${media.id}"></audio>`;
      insertHtml(html);
    },
    [insertHtml, onInsertMedia],
  );

  const onPickFile = useCallback(
    (input: HTMLInputElement | null) => {
      const file = input?.files?.[0];
      if (input) input.value = '';
      if (file) void insertMediaFile(file);
    },
    [insertMediaFile],
  );

  const onCloze = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;
    el.focus();
    const selection = window.getSelection();
    const selected = selection && selection.rangeCount > 0 ? selection.toString() : '';
    const numbers = clozeNumbersIn(el.innerHTML);
    const next = (numbers.length > 0 ? Math.max(...numbers) : 0) + 1;
    document.execCommand('insertHTML', false, `{{c${next}::${selected}}}`);
    emit();
  }, [emit]);

  const onPaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      let fileItem: DataTransferItem | null = null;
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (
          item &&
          item.kind === 'file' &&
          (item.type.startsWith('image/') || item.type.startsWith('audio/'))
        ) {
          fileItem = item;
          break;
        }
      }
      if (!fileItem) return; // let normal text/html paste proceed
      event.preventDefault();
      saveSelection();
      const file = fileItem.getAsFile();
      if (file) void insertMediaFile(file);
    },
    [insertMediaFile, saveSelection],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const files = event.dataTransfer?.files;
      let file: File | null = null;
      for (let i = 0; i < (files?.length ?? 0); i += 1) {
        const candidate = files?.[i];
        if (candidate && (candidate.type.startsWith('image/') || candidate.type.startsWith('audio/'))) {
          file = candidate;
          break;
        }
      }
      setDragOver(false);
      if (!file) return;
      event.preventDefault();
      const el = editableRef.current;
      if (el) {
        el.focus();
        const range = caretRangeFromPoint(event.clientX, event.clientY);
        savedRange.current = range && el.contains(range.commonAncestorContainer) ? range : null;
      }
      void insertMediaFile(file);
    },
    [insertMediaFile],
  );

  const labelId = `${id}-label`;
  const hintId = hint ? `${id}-hint` : undefined;

  const toolButton = (
    command: string,
    ariaLabel: string,
    content: ReactNode,
  ): ReactNode => (
    <button
      type="button"
      className="mc-recall-editor__tool"
      aria-label={ariaLabel}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => runCommand(command)}
    >
      {content}
    </button>
  );

  return (
    <div className="mc-recall-editor__field">
      <span className="mc-recall-editor__label" id={labelId}>
        {label}
      </span>
      <div className="mc-recall-editor__toolbar" role="toolbar" aria-label={`${label} formatting`}>
        {toolButton('bold', 'Bold', <b>B</b>)}
        {toolButton('italic', 'Italic', <i>I</i>)}
        {toolButton('underline', 'Underline', <u>U</u>)}
        {toolButton('insertUnorderedList', 'Bulleted list', '• List')}
        {toolButton('insertOrderedList', 'Numbered list', '1. List')}
        <span className="mc-recall-editor__tool-sep" aria-hidden="true" />
        <button
          type="button"
          className="mc-recall-editor__tool"
          aria-label="Insert image"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => imageInputRef.current?.click()}
        >
          Image
        </button>
        <button
          type="button"
          className="mc-recall-editor__tool"
          aria-label="Insert audio"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => audioInputRef.current?.click()}
        >
          Audio
        </button>
        {showCloze ? (
          <button
            type="button"
            className="mc-recall-editor__tool mc-recall-editor__tool--cloze"
            aria-label="Make cloze deletion from selection"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onCloze}
          >
            Cloze
          </button>
        ) : null}
      </div>
      <div
        ref={editableRef}
        id={id}
        role="textbox"
        aria-multiline="true"
        aria-labelledby={labelId}
        aria-describedby={hintId}
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        className={`mc-recall-editor__editable${dragOver ? ' is-dragover' : ''}`}
        onInput={emit}
        onBlur={saveSelection}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
      />
      {hint ? (
        <p className="mc-fineprint mc-muted" id={hintId}>
          {hint}
        </p>
      ) : null}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="mc-visually-hidden"
        onChange={() => onPickFile(imageInputRef.current)}
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        className="mc-visually-hidden"
        onChange={() => onPickFile(audioInputRef.current)}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

function PreviewFace({ label, html }: { label: string; html: string }) {
  const clean = sanitizeCardHtml(html);
  return (
    <div className="mc-recall-editor__preview-face">
      <span className="mc-recall-editor__preview-label">{label}</span>
      {clean ? (
        <div className="mc-recall__face" dangerouslySetInnerHTML={{ __html: clean }} />
      ) : (
        <div className="mc-recall__face mc-muted">Nothing yet</div>
      )}
    </div>
  );
}

type EditContext =
  | { source: 'user'; noteId: string; noteType: ActiveType }
  | { source: 'imported'; cardId: string };

export function CardEditor() {
  const { cardId } = useParams();
  const isEdit = Boolean(cardId);
  const navigate = useNavigate();
  const service = useRecallService();

  const createBasic = useCreateBasic();
  const createCloze = useCreateCloze();
  const updateImported = useUpdateImportedCard();
  const updateUser = useUpdateUserNote();

  const [type, setType] = useState<CreateType>('basic');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [text, setText] = useState('');
  const [extra, setExtra] = useState('');
  const [tags, setTags] = useState('');
  const [formKey, setFormKey] = useState(0);
  const [status, setStatus] = useState('');

  const [loaded, setLoaded] = useState(!isEdit);
  const [notFound, setNotFound] = useState(false);
  const [editContext, setEditContext] = useState<EditContext | null>(null);

  useEffect(() => {
    if (!isEdit || !service || !cardId) return;
    const svc = service;
    const id = cardId;
    let active = true;
    void (async () => {
      const card = await svc.getCard(id);
      if (!active) return;
      if (!card) {
        setNotFound(true);
        setLoaded(true);
        return;
      }
      setTags(card.tags.join(', '));
      if (card.source === 'user') {
        const note = await svc.getNote(card.noteId);
        if (!active) return;
        const noteType: ActiveType = note?.type === 'cloze' ? 'cloze' : 'basic';
        if (noteType === 'cloze') {
          setText(await hydrateMediaForEditing(note?.fields.Text ?? '', svc));
          setExtra(await hydrateMediaForEditing(note?.fields.Extra ?? '', svc));
        } else {
          setFront(await hydrateMediaForEditing(note?.fields.Front ?? '', svc));
          setBack(await hydrateMediaForEditing(note?.fields.Back ?? '', svc));
        }
        if (!active) return;
        setEditContext({ source: 'user', noteId: card.noteId, noteType });
      } else {
        setFront(await hydrateMediaForEditing(card.frontHtml, svc));
        setBack(await hydrateMediaForEditing(card.backHtml, svc));
        if (!active) return;
        setEditContext({ source: 'imported', cardId: card.id });
      }
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [isEdit, service, cardId]);

  const insertMedia = useCallback(
    async (file: File): Promise<InsertedMedia | null> => {
      if (!service) return null;
      const kind: InsertedMedia['kind'] | null = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('audio/')
          ? 'audio'
          : null;
      if (!kind) return null;
      const id = await service.mediaStore.put(file.name || kind, file);
      const url = await service.mediaStore.getUrl(id);
      if (!url) return null;
      return { id, url, kind };
    },
    [service],
  );

  const parsedTags = (): string[] => tags.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);

  const userClozeEdit =
    editContext !== null && editContext.source === 'user' && editContext.noteType === 'cloze';
  const activeType: ActiveType = isEdit
    ? userClozeEdit
      ? 'cloze'
      : 'basic'
    : type === 'cloze'
      ? 'cloze'
      : 'basic';
  const reversedActive = !isEdit && type === 'basic-reversed';

  const busy =
    createBasic.isPending ||
    createCloze.isPending ||
    updateImported.isPending ||
    updateUser.isPending;

  const primaryFilled = activeType === 'cloze' ? !isBlank(text) : !isBlank(front);
  const clozeOk = activeType !== 'cloze' || clozeNumbersIn(text).length > 0;
  const reversedOk = !reversedActive || !isBlank(back);
  const canSave = loaded && !notFound && !!service && primaryFilled && clozeOk && reversedOk;

  const resetForNext = () => {
    setFront('');
    setBack('');
    setText('');
    setExtra('');
    setFormKey((k) => k + 1);
  };

  const save = async (addAnother: boolean) => {
    if (!service || !canSave || busy) return;
    const tagList = parsedTags();

    if (isEdit && editContext) {
      if (editContext.source === 'user') {
        const fields: Record<string, string> =
          editContext.noteType === 'cloze'
            ? { Text: stripBlobSrc(text), Extra: stripBlobSrc(extra) }
            : { Front: stripBlobSrc(front), Back: stripBlobSrc(back) };
        await updateUser.mutateAsync({ noteId: editContext.noteId, fields, tags: tagList });
      } else {
        await updateImported.mutateAsync({
          cardId: editContext.cardId,
          front: stripBlobSrc(front),
          back: stripBlobSrc(back),
          tags: tagList,
        });
      }
      navigate('/app/recall/browse');
      return;
    }

    if (activeType === 'cloze') {
      await createCloze.mutateAsync({
        text: stripBlobSrc(text),
        extra: stripBlobSrc(extra),
        tags: tagList,
      });
    } else {
      await createBasic.mutateAsync({
        front: stripBlobSrc(front),
        back: stripBlobSrc(back),
        tags: tagList,
        reversed: reversedActive,
      });
    }

    if (addAnother) {
      resetForNext();
      setStatus('Card added — the deck is updated. Add another.');
    } else {
      navigate('/app/recall');
    }
  };

  let previewFront = '';
  let previewBack = '';
  if (activeType === 'cloze') {
    const numbers = clozeNumbersIn(text);
    const first = numbers[0] ?? 1;
    previewFront = renderCloze(text, first, false);
    previewBack = renderCloze(text, first, true) + (isBlank(extra) ? '' : `<hr />${extra}`);
  } else {
    previewFront = front;
    previewBack = back;
  }

  const clozeHint =
    'Select text and press Cloze to hide it as {{c1::…}}. Each Cloze button press adds the next number.';

  return (
    <div className="mc-screen mc-recall-editor">
      <header className="mc-screen__head">
        <h1 className="mc-h1">{isEdit ? 'Edit card' : 'Add cards'}</h1>
        <p className="mc-muted">
          {isEdit
            ? 'Update this card. Edits to your own notes update every card made from them.'
            : 'Write your own flashcards. They stay private to you and are scheduled with spaced repetition.'}
        </p>
      </header>

      {notFound ? (
        <Card elevated>
          <Stack gap={3}>
            <Eyebrow>Card not found</Eyebrow>
            <p className="mc-muted">That card may have been deleted.</p>
            <Link to="/app/recall/browse" className="mc-textbtn">
              Back to the card browser
            </Link>
          </Stack>
        </Card>
      ) : !loaded ? (
        <Card elevated>
          <p className="mc-muted">Loading card…</p>
        </Card>
      ) : (
        <>
          {!isEdit ? (
            <div className="mc-segmented" role="group" aria-label="Card type">
              {CREATE_TYPES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`mc-segmented__opt${type === option.id ? ' is-active' : ''}`}
                  aria-pressed={type === option.id}
                  onClick={() => setType(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}

          <Card elevated>
            <Stack gap={4}>
              {activeType === 'cloze' ? (
                <>
                  <RichField
                    key={`text-${formKey}`}
                    id="recall-field-text"
                    label="Text"
                    defaultHtml={text}
                    onChange={setText}
                    onInsertMedia={insertMedia}
                    showCloze
                    autoFocus
                    hint={clozeHint}
                  />
                  <RichField
                    key={`extra-${formKey}`}
                    id="recall-field-extra"
                    label="Extra (optional)"
                    defaultHtml={extra}
                    onChange={setExtra}
                    onInsertMedia={insertMedia}
                  />
                </>
              ) : (
                <>
                  <RichField
                    key={`front-${formKey}`}
                    id="recall-field-front"
                    label="Front"
                    defaultHtml={front}
                    onChange={setFront}
                    onInsertMedia={insertMedia}
                    autoFocus
                  />
                  <RichField
                    key={`back-${formKey}`}
                    id="recall-field-back"
                    label={reversedActive ? 'Back (also becomes its own front)' : 'Back'}
                    defaultHtml={back}
                    onChange={setBack}
                    onInsertMedia={insertMedia}
                  />
                </>
              )}

              <div className="mc-recall-editor__field">
                <label className="mc-recall-editor__label" htmlFor="recall-field-tags">
                  Tags
                </label>
                <input
                  id="recall-field-tags"
                  className="mc-input"
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="space or comma separated, e.g. biochem enzymes"
                />
              </div>
            </Stack>
          </Card>

          <Card elevated>
            <Stack gap={3}>
              <Eyebrow>Preview</Eyebrow>
              <div className="mc-recall-editor__preview">
                <PreviewFace label="Front" html={previewFront} />
                <PreviewFace label="Back" html={previewBack} />
              </div>
            </Stack>
          </Card>

          <div className="mc-recall-editor__actions">
            <Button
              variant="primary"
              size="lg"
              disabled={!canSave || busy}
              onClick={() => void save(false)}
            >
              {isEdit ? 'Save changes' : 'Save card'}
            </Button>
            {!isEdit ? (
              <Button
                variant="secondary"
                size="lg"
                disabled={!canSave || busy}
                onClick={() => void save(true)}
              >
                Save &amp; add another
              </Button>
            ) : null}
            <Link to={isEdit ? '/app/recall/browse' : '/app/recall'} className="mc-textbtn">
              Cancel
            </Link>
          </div>
        </>
      )}

      <p className="mc-visually-hidden" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
