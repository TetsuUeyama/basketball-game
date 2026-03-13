import Link from 'next/link';

const pages = [
  { href: '/character-move-1on1', label: 'Character Move 1on1' },
  { href: '/league', label: 'League' },
  { href: '/league/match', label: 'League Match' },
  { href: '/teams', label: 'Teams' },
];

export default function Home() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ marginBottom: '1.5rem' }}>Basketball Game</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        {pages.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            target="_blank"
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #444',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              color: '#ddd',
              backgroundColor: '#222',
            }}
          >
            {page.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
