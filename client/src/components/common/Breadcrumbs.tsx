import React from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  /** When given, the click is handled here and the link is not followed (for client-side routing). */
  onClick?: () => void;
}

export interface BreadcrumbsProps {
  /** The last item is the current page. */
  items: BreadcrumbItem[];
}

/** Files › Folder › Folder, the last one bold. */
export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items }) => (
  <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm leading-5 text-ink-3">
    {items.map((item, index) => {
      const last = index === items.length - 1;
      return (
        <React.Fragment key={`${index}-${item.label}`}>
          {index > 0 && <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden="true" />}
          {last ? (
            <span aria-current="page" className="font-semibold text-ink">
              {item.label}
            </span>
          ) : (
            <a
              href={item.href ?? '#'}
              onClick={(e) => {
                if (item.onClick) {
                  e.preventDefault();
                  item.onClick();
                }
              }}
              className="rounded text-ink-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {item.label}
            </a>
          )}
        </React.Fragment>
      );
    })}
  </nav>
);
