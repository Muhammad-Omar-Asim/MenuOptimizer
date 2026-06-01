import { create } from 'zustand';
import type {
  NormalizedMenu,
  SalesChannel,
  DemoScenario,
  ReviewProductScopes,
} from '../types';

interface AppState {
  menu: NormalizedMenu | null;
  /** Second menu loaded for split-screen comparison. */
  menuB: NormalizedMenu | null;
  /** Which products (web/app vs POS) this menu applies to — set when the agent uploads. */
  reviewProductScopes: ReviewProductScopes | null;
  activeChannel: SalesChannel;
  activeScenario: DemoScenario | null;
  activeStepIndex: number;
  highlightedItem: { menuId: string; itemId: string; itemName?: string } | null;
  sessionSubmitted: boolean;

  setMenu: (menu: NormalizedMenu | null) => void;
  setMenuB: (menu: NormalizedMenu | null) => void;
  setReviewProductScopes: (scopes: ReviewProductScopes | null) => void;
  setActiveChannel: (channel: SalesChannel) => void;
  setActiveScenario: (scenario: DemoScenario | null) => void;
  setHighlightedItem: (highlightedItem: { menuId: string; itemId: string; itemName?: string } | null) => void;
  setSessionSubmitted: (submitted: boolean) => void;
  nextStep: () => void;
  prevStep: () => void;
  resetScenario: () => void;
}

export const useStore = create<AppState>((set) => ({
  menu: null,
  menuB: null,
  reviewProductScopes: null,
  activeChannel: 'Collection',
  activeScenario: null,
  activeStepIndex: -1,
  highlightedItem: null,
  sessionSubmitted: false,

  setMenu: (menu) => set({ menu }),
  setMenuB: (menuB) => set({ menuB }),
  setReviewProductScopes: (scopes) => set({ reviewProductScopes: scopes }),

  setActiveChannel: (channel) => set({ activeChannel: channel }),
  
  setActiveScenario: (scenario) => set({ 
    activeScenario: scenario, 
    activeStepIndex: scenario ? 0 : -1 
  }),
  
  setHighlightedItem: (highlightedItem) => set({ highlightedItem }),
  
  setSessionSubmitted: (submitted) => set({ sessionSubmitted: submitted }),
  
  nextStep: () => set((state) => ({
    activeStepIndex: Math.min(state.activeStepIndex + 1, (state.activeScenario?.steps.length || 0) - 1)
  })),
  
  prevStep: () => set((state) => ({
    activeStepIndex: Math.max(state.activeStepIndex - 1, 0)
  })),
  
  resetScenario: () => set({ activeStepIndex: 0 })
}));
