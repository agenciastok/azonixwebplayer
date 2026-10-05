export type PlayerPage = "home" | "movies" | "series" | "live" | "kids" | "games" | "account";

type RailProps = {
  page: PlayerPage;
  onChange: (page: PlayerPage) => void;
  onRefresh: () => void;
};

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

const items: Array<{ page: PlayerPage; label: string; path: string }> = [
  { page: "home", label: "Início", path: "M4 11.5 12 4l8 7.5M6 10.5V20h12v-9.5" },
  { page: "live", label: "Canais", path: "M4 7h12a2 2 0 0 1 2 2v8H6a2 2 0 0 1-2-2Zm14 3 4-2v8l-4-2" },
  { page: "movies", label: "Filmes", path: "M5 6h10a2 2 0 0 1 2 2v8H7a2 2 0 0 1-2-2Zm0 3h12M8 6l2 3M12 6l2 3" },
  { page: "series", label: "Séries", path: "M8 6h11v12H8zM5 8h3v10H5zM10 10.5v3l3-1.5z" },
];

export function Rail({ page, onChange, onRefresh }: RailProps) {
  return (
    <aside className="rail">
      <img className="rail__logo" src="/brand/azonix-play.png" alt="AZONIX PLAY" />
      <nav className="rail__nav">
        {items.map((item) => (
          <button key={item.page} className={page === item.page ? "is-on" : ""} aria-label={item.label} onClick={() => onChange(item.page)}>
            <Icon path={item.path} />
            <span className="rail__label">{item.label}</span>
          </button>
        ))}
        <button className={`rail__kids ${page === "kids" ? "is-on" : ""}`} onClick={() => onChange("kids")}>
          KIDS
        </button>
        <button className={`rail__games ${page === "games" ? "is-on" : ""}`} aria-label="Jogos do dia" onClick={() => onChange("games")}>
          <Icon path="M12 4a8 8 0 1 0 8 8M12 8v4l3 2M8 14h.01M16 14h.01" />
          <span className="rail__label">Jogos</span>
        </button>
      </nav>
      <div className="rail__foot">
        <button className={page === "account" ? "is-on" : ""} aria-label="Perfil" onClick={() => onChange("account")}>
          <Icon path="M12 15.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6M5 19.2A7.2 7.2 0 0 1 12 15a7.2 7.2 0 0 1 7 4.2" />
          <span className="rail__label">Perfil</span>
        </button>
        <button aria-label="Atualizar lista" onClick={onRefresh}>
          <Icon path="M20 12a8 8 0 1 1-2.2-5.5M20 4v5h-5" />
          <span className="rail__label">Atualizar</span>
        </button>
      </div>
    </aside>
  );
}
