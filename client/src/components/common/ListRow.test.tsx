import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ListRow, RowList, RowMarker } from './ListRow';

describe('ListRow', () => {
  it('renders title, meta, markers and actions inside a list', () => {
    render(
      <RowList>
        <ListRow
          icon={<span>i</span>}
          title="Bank accounts.txt"
          meta="1 KB · 28 Sep"
          markers={<RowMarker tone="shared">Shared with 1</RowMarker>}
          actions={<button type="button">More</button>}
        />
      </RowList>
    );
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Bank accounts.txt')).toBeInTheDocument();
    expect(screen.getByText('1 KB · 28 Sep')).toBeInTheDocument();
    expect(screen.getByText('Shared with 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
  });

  it('fires onClick from the name area and not from the actions', () => {
    const onClick = vi.fn();
    render(
      <RowList>
        <ListRow icon={null} title="Estate" onClick={onClick} actions={<button type="button">More</button>} />
      </RowList>
    );
    fireEvent.click(screen.getByText('Estate'));
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('exposes the selected state', () => {
    render(
      <RowList>
        <ListRow icon={null} title="Estate" onClick={() => {}} selected />
      </RowList>
    );
    expect(screen.getByRole('button', { name: /Estate/ })).toHaveAttribute('aria-pressed', 'true');
  });
});
