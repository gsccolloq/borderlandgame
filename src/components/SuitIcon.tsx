import type { CardSuit } from '../types/game';
import { SUIT_META } from '../types/game';

interface SuitIconProps {
  suit: CardSuit;
  className?: string;
}

export function SuitIcon({ suit, className = 'w-5 h-5' }: SuitIconProps) {
  const color = SUIT_META[suit].color;

  if (suit === 'spades') {
    return (
      <svg viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
        <path d="M12 2C9 6.5 4 10.2 4 14.2C4 17 6.2 19 8.7 19C10.1 19 11.2 18.3 11.7 17.4L10.4 22H13.6L12.3 17.4C12.8 18.3 13.9 19 15.3 19C17.8 19 20 17 20 14.2C20 10.2 15 6.5 12 2Z" />
      </svg>
    );
  }

  if (suit === 'hearts') {
    return (
      <svg viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
        <path d="M12 21.35L10.55 20.03C5.4 15.36 2 12.27 2 8.5C2 5.41 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.08C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.41 22 8.5C22 12.27 18.6 15.36 13.45 20.03L12 21.35Z" />
      </svg>
    );
  }

  if (suit === 'clubs') {
    return (
      <svg viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
        <path d="M12 2.5C9.9 2.5 8.2 4.2 8.2 6.3C8.2 7.5 8.8 8.6 9.7 9.3C9.1 9.1 8.5 9 7.8 9C5.7 9 4 10.7 4 12.8C4 14.9 5.7 16.6 7.8 16.6C9.5 16.6 10.9 15.5 11.4 14L10.3 21.5H13.7L12.6 14C13.1 15.5 14.5 16.6 16.2 16.6C18.3 16.6 20 14.9 20 12.8C20 10.7 18.3 9 16.2 9C15.5 9 14.9 9.1 14.3 9.3C15.2 8.6 15.8 7.5 15.8 6.3C15.8 4.2 14.1 2.5 12 2.5Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
      <path d="M12 2L20.5 12L12 22L3.5 12L12 2Z" />
    </svg>
  );
}
