import { useEffect, useSyncExternalStore } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

export interface MenuComment {
  id: string;
  menuId: string;
  itemId: string;
  itemName: string;
  categoryName?: string;
  author: string;
  text: string;
  createdAt: number;
  resolved: boolean;
  resolvedAt?: number;
  resolvedBy?: string;
  attachmentUrl?: string;
}

const COMMENTS_KEY = 'mjr_comments_v1';
const REVIEWER_KEY = 'mjr_reviewer_name';

export function getSessionIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const sp = new URLSearchParams(window.location.search);
  return sp.get('sessionId') || sp.get('runId');
}

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors 
  }
}

const listeners = new Set<() => void>();
let comments: MenuComment[] = [];
let reviewerName: string = safeRead<string>(REVIEWER_KEY, '') ?? '';

// Read sessionId dynamically every time we need it. It can change mid-tab
// after "Save & Share Link" / "Submit Reviews" calls pushState to update the
// URL — capturing it once at module load meant comments added after that
// were never pushed to Supabase, so they vanished when the link was opened
// in another browser.
function getActiveSessionId(): string | null {
  return getSessionIdFromUrl();
}

function emit() {
  for (const l of listeners) l();
}

function persistComments() {
  // Only persist to localStorage in true offline mode. When Supabase is
  // configured it is the source of truth, and writing to localStorage just
  // causes ghost-comment leaks across unrelated sessions.
  if (!isSupabaseConfigured) {
    safeWrite(COMMENTS_KEY, comments);
  }
  emit();
}

function persistReviewer() {
  safeWrite(REVIEWER_KEY, reviewerName);
  emit();
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

const getCommentsSnapshot = () => comments;
const getReviewerSnapshot = () => reviewerName;

export function useAllComments(): MenuComment[] {
  return useSyncExternalStore(subscribe, getCommentsSnapshot, getCommentsSnapshot);
}

export function useReviewerName(): [string, (name: string) => void] {
  const name = useSyncExternalStore(subscribe, getReviewerSnapshot, getReviewerSnapshot);
  return [name, setReviewerName];
}

export function useItemComments(menuId: string | null, itemId: string): MenuComment[] {
  const all = useAllComments();
  if (!menuId) return [];
  return all.filter((c) => c.menuId === menuId && c.itemId === itemId);
}

export function useMenuComments(menuId: string | string[] | null): MenuComment[] {
  const all = useAllComments();
  if (!menuId) return [];
  // Compare-mode comments are stored with a slot prefix ("A:" / "B:") to keep
  // each side's feedback distinct. The overview should still surface them all.
  // When invoked with an array of menuIds (compare view passes both A and B
  // menu ids), a comment matches if it belongs to ANY of those menus.
  const ids = Array.isArray(menuId) ? menuId : [menuId];
  if (ids.length === 0) return [];
  return all.filter((c) =>
    ids.some((id) => c.menuId === id || c.menuId === `A:${id}` || c.menuId === `B:${id}`),
  );
}

export function setReviewerName(name: string) {
  reviewerName = name.trim();
  persistReviewer();
}

export async function uploadCommentAttachment(file: File): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    // Fallback: convert file to a base64 Data URL for local dev
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExt}`;
  const filePath = `attachments/${fileName}`;

  const { error } = await supabase.storage
    .from('comment-attachments')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw error;

  const { data: publicUrlData } = supabase.storage
    .from('comment-attachments')
    .getPublicUrl(filePath);

  return publicUrlData.publicUrl;
}

export function addComment(input: {
  menuId: string;
  itemId: string;
  itemName: string;
  categoryName?: string;
  author: string;
  text: string;
  attachmentUrl?: string;
}): MenuComment {
  const newId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const c: MenuComment = {
    id: newId,
    menuId: input.menuId,
    itemId: input.itemId,
    itemName: input.itemName,
    categoryName: input.categoryName,
    author: input.author.trim() || 'Anonymous',
    text: input.text.trim(),
    createdAt: Date.now(),
    resolved: false,
    attachmentUrl: input.attachmentUrl,
  };

  // Local state update (instant UI feedback)
  comments = [...comments, c];
  persistComments();

  // Supabase push (if configured)
  const activeSessionId = getActiveSessionId();
  if (isSupabaseConfigured && activeSessionId && supabase) {
    supabase
      .from('comments')
      .insert({
        id: newId,
        session_id: activeSessionId,
        menu_id: input.menuId,
        item_id: input.itemId,
        item_name: input.itemName,
        category_name: input.categoryName || null,
        author: c.author,
        text: c.text,
        resolved: false,
        attachment_url: input.attachmentUrl || null,
      })
      .then(({ error }) => {
        if (error) console.error('Error inserting comment to Supabase:', error);
      });
  }

  return c;
}

export function resolveComment(id: string, resolvedBy: string) {
  // Local state update (instant UI feedback)
  comments = comments.map((c) =>
    c.id === id
      ? { ...c, resolved: true, resolvedAt: Date.now(), resolvedBy: resolvedBy.trim() || 'Anonymous' }
      : c,
  );
  persistComments();

  // Supabase push
  if (isSupabaseConfigured && getActiveSessionId() && supabase) {
    supabase
      .from('comments')
      .update({
        resolved: true,
        resolved_by: resolvedBy.trim() || 'Anonymous',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('Error resolving comment in Supabase:', error);
      });
  }
}

export function unresolveComment(id: string) {
  // Local state update (instant UI feedback)
  comments = comments.map((c) =>
    c.id === id ? { ...c, resolved: false, resolvedAt: undefined, resolvedBy: undefined } : c,
  );
  persistComments();

  // Supabase push
  if (isSupabaseConfigured && getActiveSessionId() && supabase) {
    supabase
      .from('comments')
      .update({
        resolved: false,
        resolved_by: null,
        resolved_at: null,
      })
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('Error unresolving comment in Supabase:', error);
      });
  }
}

export function deleteComment(id: string) {
  // Local state update (instant UI feedback)
  comments = comments.filter((c) => c.id !== id);
  persistComments();

  // Supabase push
  if (isSupabaseConfigured && getActiveSessionId() && supabase) {
    supabase
      .from('comments')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('Error deleting comment in Supabase:', error);
      });
  }
}

export function exportCommentsAsJson(
  menuId: string | string[] | null,
  menuName: string,
): void {
  if (typeof window === 'undefined') return;
  const ids = menuId == null ? null : Array.isArray(menuId) ? menuId : [menuId];
  const subset = ids
    ? comments.filter((c) =>
        ids.some((id) => c.menuId === id || c.menuId === `A:${id}` || c.menuId === `B:${id}`),
      )
    : comments;
  const payload = {
    exportedAt: new Date().toISOString(),
    menuId,
    menuName,
    comments: subset,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = menuName.replace(/[^a-z0-9-_ ]/gi, '_').slice(0, 40) || 'menu';
  a.download = `${safeName}-comments-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importCommentsFromJson(jsonText: string): number {
  try {
    const parsed = JSON.parse(jsonText);
    const incoming: MenuComment[] = Array.isArray(parsed?.comments) ? parsed.comments : [];
    if (incoming.length === 0) return 0;
    const byId = new Map(comments.map((c) => [c.id, c]));
    for (const c of incoming) {
      if (c && typeof c.id === 'string') byId.set(c.id, c);
    }
    comments = Array.from(byId.values());
    persistComments();
    return incoming.length;
  } catch {
    return 0;
  }
}

export function useCommentsSync() {
  const sessionId = getSessionIdFromUrl();
  useEffect(() => {
    let active = true;
    let channel: any = null;

    if (isSupabaseConfigured && sessionId && supabase) {
      comments = [];
      emit();

      // 1. Initial Fetch
      supabase
        .from('comments')
        .select('*')
        .eq('session_id', sessionId)
        .then(({ data, error }) => {
          if (!active) return;
          if (error) {
            console.error(
              `[useCommentsSync] Error fetching comments for session ${sessionId}:`,
              error,
            );
            return;
          }
          const rows = data ?? [];
          console.info(
            `[useCommentsSync] Fetched ${rows.length} comment(s) for session ${sessionId}`,
          );
          comments = rows.map((d: any) => ({
            id: d.id,
            menuId: d.menu_id,
            itemId: d.item_id,
            itemName: d.item_name,
            categoryName: d.category_name || undefined,
            author: d.author,
            text: d.text,
            createdAt: new Date(d.created_at).getTime(),
            resolved: d.resolved,
            resolvedAt: d.resolved_at ? new Date(d.resolved_at).getTime() : undefined,
            resolvedBy: d.resolved_by || undefined,
            attachmentUrl: d.attachment_url || undefined,
          }));
          emit();
        });

      // 2. Real-time Subscription
      channel = supabase
        .channel(`comments:${sessionId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'comments',
            filter: `session_id=eq.${sessionId}`,
          },
          (payload) => {
            if (!active) return;
            const { eventType, new: newRow, old: oldRow } = payload;
            if (eventType === 'INSERT') {
              const mapped: MenuComment = {
                id: newRow.id,
                menuId: newRow.menu_id,
                itemId: newRow.item_id,
                itemName: newRow.item_name,
                categoryName: newRow.category_name || undefined,
                author: newRow.author,
                text: newRow.text,
                createdAt: new Date(newRow.created_at).getTime(),
                resolved: newRow.resolved,
                resolvedAt: newRow.resolved_at ? new Date(newRow.resolved_at).getTime() : undefined,
                resolvedBy: newRow.resolved_by || undefined,
                attachmentUrl: newRow.attachment_url || undefined,
              };
              if (!comments.some((c) => c.id === mapped.id)) {
                comments = [...comments, mapped];
                emit();
              }
            } else if (eventType === 'UPDATE') {
              comments = comments.map((c) =>
                c.id === newRow.id
                  ? {
                      ...c,
                      resolved: newRow.resolved,
                      resolvedAt: newRow.resolved_at ? new Date(newRow.resolved_at).getTime() : undefined,
                      resolvedBy: newRow.resolved_by || undefined,
                      attachmentUrl: newRow.attachment_url || undefined,
                    }
                  : c
              );
              emit();
            } else if (eventType === 'DELETE') {
              comments = comments.filter((c) => c.id !== oldRow.id);
              emit();
            }
          }
        )
        .subscribe();
    } else if (!isSupabaseConfigured) {
      // True offline mode: persist locally so the user doesn't lose comments
      // between page loads.
      comments = safeRead<MenuComment[]>(COMMENTS_KEY, []);
      emit();
    } else {
      // Supabase is configured but no sessionId is in the URL yet (e.g. the
      // user just landed on "/"). Start with a clean slate — otherwise
      // comments saved to localStorage during a previous session would leak
      // into a fresh upload as ghost feedback.
      comments = [];
      emit();
    }

    return () => {
      active = false;
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [sessionId]);
}
