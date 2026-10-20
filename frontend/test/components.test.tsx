import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimCta } from '@/components/detail/ClaimCta';
import { ActiveFilters } from '@/components/panel/FilterBar';
import { DEFAULT_FILTERS } from '@/lib/constants';
import { useUi } from '@/lib/store';

describe('ClaimCta', () => {
  const handlers = () => ({ onAdd: vi.fn(), onRemove: vi.fn(), onPriorityChange: vi.fn() });

  it('unclaimed: adds with the chosen priority', () => {
    const h = handlers();
    render(<ClaimCta claim={{ status: 'unclaimed' }} {...h} />);
    fireEvent.click(screen.getByRole('radio', { name: 'High' }));
    fireEvent.click(screen.getByRole('button', { name: /add to my queue/i }));
    expect(h.onAdd).toHaveBeenCalledWith('high');
  });

  it('mine: shows the current priority and lets me remove', () => {
    const h = handlers();
    render(<ClaimCta claim={{ status: 'mine', priority: 'low' }} {...h} />);
    expect(screen.getByText(/in your queue/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Low' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Medium' }));
    expect(h.onPriorityChange).toHaveBeenCalledWith('medium');
    fireEvent.click(screen.getByRole('button', { name: /remove from queue/i }));
    expect(h.onRemove).toHaveBeenCalled();
  });

  it("other agent's claim: action is disabled and explains why", () => {
    const h = handlers();
    render(<ClaimCta claim={{ status: 'other', agentId: 'agent-sam', agentName: 'Sam Chen' }} {...h} />);
    const btn = screen.getByRole('button', { name: /claimed by sam chen/i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(h.onAdd).not.toHaveBeenCalled();
    expect(screen.getByText(/only be worked by one agent/i)).toBeInTheDocument();
  });
});

describe('ActiveFilters', () => {
  beforeEach(() => {
    useUi.setState({ filters: { ...DEFAULT_FILTERS, industry: ['Retail', 'Technology'], minScore: 75 } });
  });

  it('renders a chip per active filter and removes just that one', () => {
    render(<ActiveFilters />);
    expect(screen.getByText('Retail')).toBeInTheDocument();
    expect(screen.getByText('Score 75+')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove filter Retail' }));
    expect(useUi.getState().filters.industry).toEqual(['Technology']);
    expect(useUi.getState().filters.minScore).toBe(75);
  });

  it('"Clear all" resets every filter', () => {
    render(<ActiveFilters />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(useUi.getState().filters).toEqual(DEFAULT_FILTERS);
  });
});
