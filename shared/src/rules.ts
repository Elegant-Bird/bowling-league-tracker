// League rules & FAQ content — the single source of truth, rendered by the
// client's Rules page. Pure rules/definitions, no personal data, safe to
// commit. Update here when the league's rules change.

export interface FaqItem {
  question: string
  /** Answer paragraphs (rendered in order). */
  answer: string[]
}

export const LEAGUE_RULES: FaqItem[] = [
  {
    question: 'How is a match scored?',
    answer: [
      'Each week, two teams face each other on a pair of adjacent lanes and play 3 games.',
      'Four points are available per match: one point for each of the 3 games, plus one point for the series total (the sum of all 3 games).',
      'For each game, the team with the higher score wins that point. The team with the higher 3-game series total wins the series point.',
    ],
  },
  {
    question: 'What happens on a tie?',
    answer: [
      'If two teams tie on a single game or on the series total, that point is split — each team gets half a point.',
      'Because of this, every match always distributes exactly 4 points between the two teams.',
    ],
  },
  {
    question: 'What is a team handicap?',
    answer: [
      'The team handicap levels the field between teams of different skill. For a given match it is the difference between the two teams’ averages: the higher team’s average minus the lower team’s average.',
      'Only the team with the lower average receives the handicap; the higher-average team gets a handicap of 0. The handicap is never negative.',
      'This team handicap (used for matches) is a separate number from the individual handicaps listed for each bowler.',
    ],
  },
  {
    question: 'What does it mean when a team’s game scores are all identical?',
    answer: [
      'Identical scores across all 3 games indicate the team was absent that week.',
      'When a team is absent, their "vacant/absent" score is used in place of real games: the team’s average plus that week’s handicap, applied the same way to each of the 3 games.',
    ],
  },
  {
    question: 'Where do "home" and "away" come from?',
    answer: [
      'They don’t — the league has no real home/away concept. Everyone bowls at the same alley each week.',
      '"Home" and "away" are just labels for the two sides of a match on a lane pair.',
    ],
  },
]
