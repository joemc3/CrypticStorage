import React from 'react';

/**
 * The container for rows: a bordered list with no gaps. With `columns` it draws the desktop column
 * heading above the rows. The box does not clip, so a row menu can open past its edge.
 */
export const RowList: React.FC<{ children: React.ReactNode; className?: string; columns?: boolean }> = ({ children, className = '', columns = false }) => (
  <div className={`rounded-xl border border-line bg-surface ${className}`}>
    {columns && (
      <div aria-hidden="true" className="hidden items-center gap-3 rounded-t-[11px] border-b border-line bg-surface-2 py-2 pl-4 pr-2 text-xs font-medium text-ink-3 md:flex">
        <span className="flex-1">Name</span>
        <span className="w-24 text-right">Size</span>
        <span className="w-28 text-right">Modified</span>
        <span className="w-11" />
      </div>
    )}
    <ul role="list">{children}</ul>
  </div>
);

const markerTone = { default: 'text-ink-3', handoff: 'text-accent-text', shared: 'text-info-text' } as const;

/** Twelve-pixel icon plus word that says what applies to a row: shared, link, handoff. */
export const RowMarker: React.FC<{ tone?: keyof typeof markerTone; icon?: React.ReactNode; children: React.ReactNode }> = ({ tone = 'default', icon, children }) => (
  <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium leading-4 ${markerTone[tone]}`}>
    {icon && (
      <span className="flex h-3.5 w-3.5 items-center justify-center" aria-hidden="true">
        {icon}
      </span>
    )}
    {children}
  </span>
);

export interface ListRowProps {
  /** Leading icon, drawn in a 36 px tile. */
  icon: React.ReactNode;
  tone?: 'file' | 'folder';
  title: string;
  /** One line of meta under the name. On desktop, give `size` and `date` instead and they become columns. */
  meta?: React.ReactNode;
  /** Desktop columns. On phone they are folded into the meta line. */
  size?: string;
  date?: string;
  markers?: React.ReactNode;
  /** Optional control before the icon, for example a checkbox. */
  leading?: React.ReactNode;
  /** Trailing buttons and menus. Clicks here never reach `onClick`. */
  actions?: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
}

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent';

/** One row of a safe: icon, name, meta, markers, actions. Sixty pixels at least. */
export const ListRow: React.FC<ListRowProps> = ({ icon, tone = 'file', title, meta, size, date, markers, leading, actions, onClick, selected = false }) => {
  const phoneMeta = [size, date].filter(Boolean).join(' · ');
  const body = (
    <>
      <span
        aria-hidden="true"
        className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg ${tone === 'folder' ? 'bg-accent-soft text-accent-text' : 'bg-surface-2 text-ink-2'}`}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate font-medium text-ink">{title}</span>
        {(meta || phoneMeta || markers) && (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-[18px] text-ink-3">
            {meta ? <span>{meta}</span> : phoneMeta ? <span className="md:hidden">{phoneMeta}</span> : null}
            {markers}
          </span>
        )}
      </span>
    </>
  );

  return (
    <li className={`flex min-h-[60px] items-center gap-3 border-b border-line py-2 pl-4 pr-2 first:rounded-t-[11px] last:rounded-b-[11px] last:border-b-0 ${selected ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
      {leading}
      {onClick ? (
        <button type="button" onClick={onClick} aria-pressed={selected || undefined} className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left ${focus}`}>
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      {size !== undefined && <span className="hidden w-24 text-right text-sm tabular-nums text-ink-2 md:block">{size}</span>}
      {date !== undefined && <span className="hidden w-28 text-right text-sm tabular-nums text-ink-2 md:block">{date}</span>}
      {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
    </li>
  );
};
