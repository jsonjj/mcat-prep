import { useResolvedHtml } from '../../app/recall-queries';

/**
 * Render sanitized card HTML, resolving media placeholders (data-recall-media) to
 * object URLs. Content is sanitized on write (import/editor), so this is display-only.
 */
export function CardHtml({ html, className }: { html: string; className?: string }) {
  const resolved = useResolvedHtml(html);
  return <div className={className} dangerouslySetInnerHTML={{ __html: resolved }} />;
}
