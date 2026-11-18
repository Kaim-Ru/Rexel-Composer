export function Icon({ name }: { name: string }) {
  return <span aria-hidden="true" className={`codicon codicon-${name} shrink-0`} />;
}

interface IconButtonProps {
  readonly icon: string;
  readonly label: string;
  readonly onClick: () => void;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
}

export function IconButton({ icon, label, onClick, pressed, disabled }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center justify-center rounded-sm border-0 bg-transparent p-1 text-fg hover:bg-toolbar-hover disabled:cursor-default disabled:opacity-50 aria-pressed:bg-toolbar-hover"
    >
      <Icon name={icon} />
    </button>
  );
}

interface TextButtonProps {
  readonly children: React.ReactNode;
  readonly onClick: () => void;
  readonly primary?: boolean;
  readonly icon?: string;
}

export function TextButton({ children, onClick, primary, icon }: TextButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-sm border border-contrast px-2.5 py-1 ${
        primary === true
          ? "bg-button text-button-fg hover:bg-button-hover"
          : "bg-secondary text-secondary-fg hover:bg-secondary-hover"
      }`}
    >
      {icon !== undefined && <Icon name={icon} />}
      {children}
    </button>
  );
}
