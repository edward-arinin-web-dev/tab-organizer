/**
 * Custom Rules store — the user's hand-written natural-language grouping
 * directives.
 *
 * Distinct from the auto-learned `LearnedRule` (core/automation/rules.ts):
 * those are URL-pattern → workspace mappings grown from accept/reject feedback;
 * these are authored by the user and compiled (on-device) into structured
 * {@link Clause}s that steer both bulk grouping and new-tab assignment.
 *
 * Stored in chrome.storage.local; newest-first; bounded at MAX_INSTRUCTIONS.
 */

import { storage } from '#imports';
import type { Clause, Matcher } from '~/core/ai/instruction-schema';

export type { Clause, Matcher };

/** How a rule's `compiled` clauses were produced. `pending` = compile in flight. */
export type CompiledBy = 'nano' | 'floor' | 'pending';

export interface Instruction {
  id: string;
  /** Raw natural-language text the user typed. */
  text: string;
  enabled: boolean;
  /** Structured form; absent until the first compile resolves. */
  compiled?: Clause[];
  compiledBy?: CompiledBy;
  createdAt: number;
  updatedAt: number;
}

const MAX_INSTRUCTIONS = 200;

const item = storage.defineItem<Instruction[]>('local:instructions', {
  fallback: [],
});

export const instructions = {
  list: () => item.getValue(),
  listEnabled: async (): Promise<Instruction[]> =>
    (await item.getValue()).filter((i) => i.enabled),
  get: async (id: string): Promise<Instruction | undefined> =>
    (await item.getValue()).find((i) => i.id === id),
  add: async (text: string): Promise<Instruction> => {
    const now = Date.now();
    const inst: Instruction = {
      id: crypto.randomUUID(),
      text: text.trim(),
      enabled: true,
      compiledBy: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    const cur = await item.getValue();
    const next = [inst, ...cur];
    if (next.length > MAX_INSTRUCTIONS) next.length = MAX_INSTRUCTIONS;
    await item.setValue(next);
    return inst;
  },
  patch: async (
    id: string,
    p: Partial<Omit<Instruction, 'id' | 'createdAt'>>,
  ): Promise<Instruction | undefined> => {
    const cur = await item.getValue();
    let updated: Instruction | undefined;
    const next = cur.map((i) => {
      if (i.id !== id) return i;
      updated = { ...i, ...p, updatedAt: Date.now() };
      return updated;
    });
    if (!updated) return undefined;
    await item.setValue(next);
    return updated;
  },
  remove: async (id: string): Promise<void> => {
    const cur = await item.getValue();
    await item.setValue(cur.filter((i) => i.id !== id));
  },
  watch: (cb: (next: Instruction[]) => void) => item.watch(cb),
};
