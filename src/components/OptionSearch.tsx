import {
  FunctionComponent,
  KeyboardEvent,
  MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "./OptionSearch.module.css";

export type OptionSearchType = {
  className?: string;
  wrapperClassName?: string;
  wrap?: boolean;
  searchbar?: boolean;
  sortButton?: boolean;
  filterButton?: boolean;
  detailsButton?: boolean;
  addButton?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onSearchSubmit?: (value: string) => void;
  filterActive?: boolean;
  onFilterClick?: () => void;
  detailsActive?: boolean;
  onDetailsClick?: () => void;
  onAddClick?: () => void;
  onSortClick?: () => void;
  sortActive?: boolean;
  sortOptions?: Array<{ key: string; label: string }>;
  sortColumn?: string;
  sortOrder?: "asc" | "desc";
  onSortChange?: (payload: { key: string; order: "asc" | "desc" }) => void;
};

const OptionSearch: FunctionComponent<OptionSearchType> = ({
  className = "",
  wrapperClassName = "",
  wrap = false,
  searchbar = true,
  sortButton = true,
  filterButton = true,
  detailsButton = true,
  addButton = true,
  searchValue = "",
  onSearchChange,
  onSearchSubmit,
  filterActive,
  onFilterClick,
  detailsActive,
  onDetailsClick,
  onAddClick,
  onSortClick,
  sortActive = false,
  sortOptions,
  sortColumn,
  sortOrder = "asc",
  onSortChange,
}) => {
  const [isSortOpen, setSortOpen] = useState(false);
  const sortContainerRef = useRef<HTMLDivElement | null>(null);
  const effectiveSearchValue = searchValue ?? "";

  useEffect(() => {
    const handleWindowClick = () => {
      setSortOpen(false);
    };
    window.addEventListener("click", handleWindowClick);
    return () => {
      window.removeEventListener("click", handleWindowClick);
    };
  }, []);

  const hasSortOptions = Array.isArray(sortOptions) && sortOptions.length > 0 && typeof onSortChange === "function";

  const handleSortButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (hasSortOptions) {
      setSortOpen((prev) => !prev);
      return;
    }

    onSortClick?.();
  };

  const handleSortSelection = (optionKey: string) => {
    if (!hasSortOptions) {
      return;
    }

    const payload = {
      key: optionKey,
      order: sortColumn === optionKey
        ? (sortOrder === "asc" ? "desc" : "asc")
        : "asc",
    };
    onSortChange?.(payload as { key: string; order: "asc" | "desc" });
    setSortOpen(false);
  };

  const content = (
    <div className={[styles.optionsearch, className].join(" ")}>
      {searchbar && (
        <div className={styles.searchbar}>
          <input
            className={styles.searchtext}
            placeholder="Rechercher"
            type="text"
            value={effectiveSearchValue}
            onChange={(event) => onSearchChange?.(event.target.value)}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSearchSubmit?.(effectiveSearchValue);
              }
            }}
          />
          <button
            type="button"
            className={styles.searchButton}
            onClick={() => onSearchSubmit?.(effectiveSearchValue)}
          >
            <img
              className={styles.searchlogoIcon}
              alt="Rechercher"
              src="/searchLogo.svg"
            />
          </button>
        </div>
      )}
      {sortButton && (
        hasSortOptions ? (
          <div
            className={styles.sortButtonContainer}
            ref={(node) => {
              sortContainerRef.current = node;
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className={[
                styles.optionActions,
                isSortOpen ? styles.optionActionsActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              onClick={handleSortButtonClick}
            >
              <img
                className={styles.sortbuttonIcon}
                alt=""
                src="/sortButton.svg"
              />
            </button>
            {isSortOpen && (
              <div className={styles.sortPopover}>
                <p className={styles.sortPopoverLabel}>Trier par</p>
                <div className={styles.sortOptions}>
                  {sortOptions?.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={[
                        styles.sortOption,
                        sortColumn === option.key ? styles.sortOptionActive : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => handleSortSelection(option.key)}
                    >
                      <span>{option.label}</span>
                      {sortColumn === option.key && (
                        <span className={styles.sortOptionArrow}>
                          {sortOrder === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            className={[
              styles.optionActions,
              sortActive ? styles.optionActionsActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            onClick={handleSortButtonClick}
          >
            <img className={styles.sortbuttonIcon} alt="" src="/sortButton.svg" />
          </button>
        )
      )}
      {filterButton && (
        <button
          className={[
            styles.optionActions,
            filterActive ? styles.optionActionsActive : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          onClick={onFilterClick}
        >
          <img className={styles.filterbuttonIcon} alt="Filtrer" src="/filterButton.svg" />
        </button>
      )}
      {detailsButton && (
        <button
          className={[
            styles.optionActions,
            detailsActive ? styles.optionActionsActive : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          onClick={onDetailsClick}
        >
          <img
            className={styles.searchlogoIcon}
            alt="Détails"
            src="/detailsButton.svg"
          />
        </button>
      )}
      {addButton && (
        <button
          className={styles.optionActions}
          type="button"
          onClick={() => {
            if (typeof onAddClick === "function") {
              onAddClick();
              return;
            }
            window.dispatchEvent(new CustomEvent("openAddAgentOverlay"));
          }}
        >
          <img className={styles.searchlogoIcon} alt="" src="/addButton.svg" />
        </button>
      )}
    </div>
  );

  if (!wrap) {
    return content;
  }

  return (
    <section className={[styles.wrapper, wrapperClassName].join(" ")}>
      {content}
    </section>
  );
};

export default OptionSearch;
