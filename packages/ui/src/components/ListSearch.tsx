/** The one search bar used on every admin list (contacts, clients, projects): same look, same place. Extra filters go in as children. */
export function ListSearch({ label, placeholder, q, hidden, children }: {
  label: string; placeholder: string; q?: string; hidden?: Record<string, string>; children?: React.ReactNode;
}) {
  return (
    <form method="get" role="search" className="listsearch">
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="sr-only" htmlFor="list-q">{label}</label>
      <input id="list-q" name="q" type="search" defaultValue={q ?? ""} placeholder={placeholder} maxLength={100} />
      {children}
      <button className="btn primary" type="submit">Cerca</button>
    </form>
  );
}
