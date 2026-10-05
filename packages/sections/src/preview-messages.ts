// The messages between the visual editor (CMS admin) and its live preview (the website's /admin/preview, in an iframe).
// One definition, so the two apps cannot drift apart. Types only: each side checks the other's origin itself.
export type ToEditor =
  | { apex: "select"; id: string }
  | { apex: "drop"; payload: string; target: { index: number } | { section: string; col: string; index: number } }
  | { apex: "edit"; id: string; field: string; value: string }
  | { apex: "located"; target: { index: number } | { section: string; col: string; index: number } }; // the answer to a committed "locate"
export type ToPreview =
  | { apex: "selected"; id: string | null }
  // A block dragged from the editor's library is dropped on a transparent layer the EDITOR draws over the preview (browsers do not
  // reliably deliver drags into a frame of another origin). The editor sends the pointer position (in the preview's own pixels);
  // the preview shows the drop line there (commit false) or, on the drop (commit true), answers with "located".
  | { apex: "locate"; x: number; y: number; commit: boolean }
  | { apex: "locate-end" };
