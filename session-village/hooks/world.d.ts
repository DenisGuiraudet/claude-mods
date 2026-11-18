// Types for world.js, the engine and map of the village.
export type Activity = 'idle' | 'thinking' | 'bash' | 'edit' | 'read' | 'web';
export type ModelKey = 'opus' | 'sonnet' | 'haiku' | 'fable';
export type EffortKey = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type Steps = { commit: boolean; push: boolean; pr: boolean; merged: boolean };

export interface SessionState {
  started: boolean;
  model: ModelKey;
  effort: EffortKey;
  activity: Activity;
  context: number;
  rate: number;
  cost: number;
  subagents: number;
  wavesTotal: number;
  waveCurrent: number;
  todoDone: number;
  todoTotal: number;
  steps: Steps;
}
export interface WorldState {
  dirty: boolean;
  /** Steps taken, one a second: still poses go one step a frame. */
  frame: number;
  /** Frames over budget, drawn again without walk cycles. */
  lite: number;
  fx: unknown[];
  fires: unknown[];
  ents: unknown[];
  seed: number;
  ambNext: number;
}
export interface Place { name: string; look: string; note: string }
export interface View {
  name: string;
  places: Record<string, Place>;
  extraLook?: [string, string, string][];
}
export interface Derived { m: { name: string; a: string; b: string }; pre: boolean }

export const S: SessionState;
export const W: WorldState;
export const MODELS: Record<ModelKey, { name: string; cls: string; a: string; b: string }>;
export const SIG: Record<string, { col: string | null; what: string }>;
export const VIEWS: { valley: View };
export function derive(now: number): Derived;
export function newWorld(now: number): void;
export function step(now: number): void;
export function retarget(now: number): void;
export function wake(now: number): void;
/** The scene at `now`; `margins` (px) leave room on each side, in full from a 1600 px wide window. */
export function compose(now: number, margins?: { left: number; right: number }): string;
export function busy(since: number): boolean;
export function ambient(now: number, D: Derived, V: View, id?: string): { id: string; name: string } | null;
export function evPrompt(now: number): void;
export function evError(now: number): void;
export function evCompact(now: number): void;
export function evMerge(now: number): void;
export function evCommit(now: number): void;
export function evPush(now: number): void;
export function sigActive(id: string, now: number): boolean;
export function sigValue(id: string): string;
export function sigCol(id: string, D: Derived): string;
export function progress(): number;
