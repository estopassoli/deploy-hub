/** Marca do DeployHub: um nó com três ramos. Herda a cor do texto. */
export function HubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <line x1="12" y1="12.5" x2="12" y2="19.5" />
      <line x1="12" y1="12.5" x2="5.75" y2="8.5" />
      <line x1="12" y1="12.5" x2="18.25" y2="8.5" />
      <circle cx="12" cy="12.5" r="3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="20" r="2.25" fill="currentColor" stroke="none" />
      <circle cx="5.25" cy="8.25" r="2.25" fill="currentColor" stroke="none" />
      <circle cx="18.75" cy="8.25" r="2.25" fill="currentColor" stroke="none" />
    </svg>
  );
}
