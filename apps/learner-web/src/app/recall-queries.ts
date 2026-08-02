/**
 * React Query bindings for the Recall (flashcards) feature. All data is per-learner
 * (keyed by the app-owned learnerId) and lives client-side in IndexedDB via the
 * RecallService. Recall never touches the authority/mastery caches.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Card, CardQuery, RecallRating } from '@mcat/recall-core';
import { useBootstrap } from './queries';
import {
  getRecallService,
  type CreateBasicInput,
  type CreateClozeInput,
  type RecallService,
} from '../recall/recall-service';

/** The Recall service for the current learner, or null until bootstrap resolves. */
export function useRecallService(): RecallService | null {
  const learnerId = useLearnerId();
  return learnerId ? getRecallService(learnerId) : null;
}

/**
 * Null while bootstrap is in flight and also for a signed-out visitor, which is
 * what keeps a signed-out browser from opening — or reading — a per-learner
 * IndexedDB database.
 */
function useLearnerId(): string | null {
  const bootstrap = useBootstrap();
  return bootstrap.data?.authenticated === true ? bootstrap.data.learnerId : null;
}

export function useRecallLoad() {
  const service = useRecallService();
  const learnerId = useLearnerId();
  return useQuery({
    queryKey: ['recall', 'load', learnerId],
    queryFn: () => service!.estimateLoad(),
    enabled: service !== null,
  });
}

export function useRecallCards(query: CardQuery = {}) {
  const service = useRecallService();
  const learnerId = useLearnerId();
  return useQuery({
    queryKey: ['recall', 'cards', learnerId, query],
    queryFn: () => service!.listCards(query),
    enabled: service !== null,
  });
}

export function useRecallTrash() {
  const service = useRecallService();
  const learnerId = useLearnerId();
  return useQuery({
    queryKey: ['recall', 'trash', learnerId],
    queryFn: () => service!.listTrash(),
    enabled: service !== null,
  });
}

export function useRecordReview() {
  const service = useRecallService();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { cardId: string; rating: RecallRating; elapsedSeconds: number }) =>
      service!.recordReview(v.cardId, v.rating, v.elapsedSeconds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recall'] }),
  });
}

export function useCreateBasic() {
  const service = useRecallService();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBasicInput) => service!.createBasic(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recall'] }),
  });
}

export function useCreateCloze() {
  const service = useRecallService();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClozeInput) => service!.createCloze(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recall'] }),
  });
}

export function useUpdateImportedCard() {
  const service = useRecallService();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { cardId: string; front: string; back: string; tags: string[] }) =>
      service!.updateImportedCard(v.cardId, v.front, v.back, v.tags),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recall'] }),
  });
}

export function useUpdateUserNote() {
  const service = useRecallService();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { noteId: string; fields: Record<string, string>; tags: string[] }) =>
      service!.updateUserNote(v.noteId, v.fields, v.tags),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recall'] }),
  });
}

export function useCardMutation<T>(run: (service: RecallService, input: T) => Promise<unknown>) {
  const service = useRecallService();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: T) => run(service!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recall'] }),
  });
}

export const useSetSuspended = () =>
  useCardMutation<{ cardId: string; suspended: boolean }>((s, v) =>
    s.setSuspended(v.cardId, v.suspended),
  );
export const useResetCard = () =>
  useCardMutation<{ cardId: string }>((s, v) => s.resetCard(v.cardId));
export const useSoftDeleteCard = () =>
  useCardMutation<{ cardId: string }>((s, v) => s.softDeleteCard(v.cardId));
export const useSoftDeleteNote = () =>
  useCardMutation<{ noteId: string }>((s, v) => s.softDeleteNote(v.noteId));
export const useRestoreCard = () =>
  useCardMutation<{ cardId: string }>((s, v) => s.restoreCard(v.cardId));
export const usePurgeCard = () =>
  useCardMutation<{ cardId: string }>((s, v) => s.purgeCard(v.cardId));

/** Resolve media placeholders → object URLs for display (returns the input until ready). */
export function useResolvedHtml(html: string): string {
  const service = useRecallService();
  const [resolved, setResolved] = useState(html);
  useEffect(() => {
    let active = true;
    if (!service) {
      setResolved(html);
      return;
    }
    void service.resolveHtml(html).then((out) => {
      if (active) setResolved(out);
    });
    return () => {
      active = false;
    };
  }, [service, html]);
  return resolved;
}

export type { Card };
