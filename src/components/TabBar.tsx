export type Tab = 'log' | 'stats' | 'settings';

// The single source of tab order, left to right. Swipe navigation (App.tsx) imports this too, so
// the gesture direction and the visible bar order can never drift apart.
export const TAB_ORDER: Tab[] = ['log', 'stats', 'settings'];
const LABELS: Record<Tab, string> = { log: 'Log', stats: 'Stats', settings: 'Settings' };

export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav className="tabbar">
      {TAB_ORDER.map((key) => (
        <button
          key={key}
          type="button"
          className={'tab' + (tab === key ? ' tab-active' : '')}
          aria-current={tab === key ? 'page' : undefined}
          onClick={() => onTab(key)}
        >
          {LABELS[key]}
        </button>
      ))}
    </nav>
  );
}
