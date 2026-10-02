// Shown while a database loads: the shape of the table, so the page does not jump when the rows arrive.
export default function Loading() {
  return (
    <div className="ws-split">
      <section className="ws-content" aria-busy="true" aria-label="Carregant">
        <div className="ws-skel ws-skel-title" />
        <div className="ws-skel ws-skel-bar" />
        <div className="ws-tablewrap">
          {Array.from({ length: 9 }, (_, i) => <div key={i} className="ws-skel ws-skel-row" style={{ opacity: 1 - i * 0.09 }} />)}
        </div>
      </section>
    </div>
  );
}
