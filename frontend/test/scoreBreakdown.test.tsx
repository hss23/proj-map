import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { driversPhrase, ScoreBreakdownView } from '@/components/detail/ScoreBreakdown';
import type { ScoreBreakdown } from '@/lib/types';

const hot: ScoreBreakdown = {
  base: 10,
  factors: [
    { factor: 'size', tone: 'positive', label: '50-199 employees: multi-line opportunity', points: 28, max: 32 },
    { factor: 'telus', tone: 'positive', label: 'Not a TELUS customer (with Rogers)', points: 20, max: 20 },
    { factor: 'renewal', tone: 'positive', label: 'Rogers contract ends in 38 days', points: 25, max: 25 },
    { factor: 'contact', tone: 'negative', label: 'Contacted 12 days ago', points: -10, max: 5 },
    { factor: 'industry', tone: 'neutral', label: 'Retail: standard connectivity needs', points: 0, max: 5 },
  ],
  raw: 73,
  total: 73,
  scoredAt: new Date().toISOString(),
};

describe('ScoreBreakdownView', () => {
  it('lists the starting score, every factor with signed points, and the total', () => {
    render(<ScoreBreakdownView breakdown={hot} />);
    const list = screen.getByRole('list', { name: 'Score breakdown' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(7);
    expect(rows[0]).toHaveTextContent('Starting score10');
    expect(within(list).getByLabelText('+28 of 32 possible points')).toBeInTheDocument();
    expect(within(list).getByLabelText('−10 of 5 possible points')).toBeInTheDocument(); // recent contact counts against
    expect(within(list).getByLabelText('0 of 5 possible points')).toBeInTheDocument();
    expect(rows[6]).toHaveTextContent(/Lead score.*73/);
    expect(screen.getByText('Contract renewal')).toBeInTheDocument();
  });

  it('summarises the top drivers by factor', () => {
    expect(driversPhrase(hot)).toBe('company size (+28) and contract renewal (+25)');
    render(<ScoreBreakdownView breakdown={hot} />);
    expect(screen.getByText(/mainly because of company size \(\+28\) and contract renewal \(\+25\)/)).toBeInTheDocument();
  });

  it('says so when nothing is pushing the score up', () => {
    const cold: ScoreBreakdown = { ...hot, factors: hot.factors.map((f) => ({ ...f, points: Math.min(0, f.points) })), raw: 0, total: 0 };
    expect(driversPhrase(cold)).toBeNull();
    render(<ScoreBreakdownView breakdown={cold} />);
    expect(screen.getByText('No strong buying signals yet.')).toBeInTheDocument();
  });
});
