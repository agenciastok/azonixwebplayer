import { useEffect, useMemo, useState } from "react";

export function FolderPicker({
  folders,
  current,
  onSelect,
}: {
  folders: string[];
  current: string;
  onSelect: (folder: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return folders;
    return folders.filter((folder) => folder.toLowerCase().includes(term));
  }, [folders, query]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function choose(folder: string) {
    onSelect(folder);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="folder-search"
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
      >
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        Buscar pastas
      </button>
      {open ? (
        <div className="folder-sheet" role="dialog" aria-modal="true" aria-label="Buscar pastas">
          <button type="button" className="folder-sheet__backdrop" aria-label="Fechar" onClick={() => setOpen(false)} />
          <div className="folder-sheet__panel">
            <div className="folder-sheet__bar">
              <h2>Pastas</h2>
              <button type="button" onClick={() => setOpen(false)}>
                Fechar
              </button>
            </div>
            <label className="side__search">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                autoFocus
                value={query}
                placeholder="Buscar pastas"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="folder-sheet__list">
              {shown.map((folder) => (
                <button key={folder} type="button" className={folder === current ? "is-on" : ""} onClick={() => choose(folder)}>
                  {folder}
                </button>
              ))}
              {shown.length === 0 ? <p>Nenhuma pasta encontrada.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
