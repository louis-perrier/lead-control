import {
  FunctionComponent,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./OptionSearch.module.css";

export type OptionSearchType = {
  className?: string;
  wrapperClassName?: string;
  centeredLayout?: boolean;
  enlargedSearch?: boolean;
  wrap?: boolean;
  searchbar?: boolean;
  sortButton?: boolean;
  filterButton?: boolean;
  filterCount?: number;
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
  filterPopover?: ReactNode;
};

export type AgentFilterOption = {
  agent_id: string;
  label: string;
};

export type AgentFiltersPopoverProps = {
  favOnly: boolean;
  activeOnly: boolean;
  selectedAgentIds: Set<string>;
  typeOptions: AgentFilterOption[];
  onToggleFavorite: () => void;
  onToggleActive: () => void;
  onToggleAgentType: (agentId: string) => void;
  onResetAll?: () => void;
};

const FilterPopover: FunctionComponent<AgentFiltersPopoverProps> = ({
  favOnly,
  activeOnly,
  selectedAgentIds,
  typeOptions,
  onToggleFavorite,
  onToggleActive,
  onToggleAgentType,
  onResetAll,
}) => (
  <div className={styles.filterPopover}>
    <div className={styles.filterPopoverHeaderRow}>
      <span className={styles.filterPopoverTitle}>Filtres</span>
      <button
        type="button"
        className={styles.filterResetButton}
        onClick={onResetAll}
        disabled={!favOnly && !activeOnly && selectedAgentIds.size === 0}
      >
        Reinitialiser
      </button>
    </div>
    <div className={styles.filterSection}>
      <span className={styles.filterHeading}>Filtres rapides</span>
      <div className={styles.filterQuickGrid}>
        <button
          type="button"
          className={[
            styles.filterQuickButton,
            favOnly ? styles.filterQuickButtonActive : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={onToggleFavorite}
        >
          Favoris
        </button>
        <button
          type="button"
          className={[
            styles.filterQuickButton,
            activeOnly ? styles.filterQuickButtonActive : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={onToggleActive}
        >
          Actifs
        </button>
      </div>
    </div>
    <div className={styles.filterSection}>
      <div className={styles.filterSectionHeader}>
        <span className={styles.filterHeading}>Types d'agent</span>
        <span className={styles.filterCountText}>
          {selectedAgentIds.size} selectionne(s)
        </span>
      </div>
      <div className={styles.filterTypeGrid}>
        {typeOptions.map((option) => (
          <button
            key={option.agent_id}
            type="button"
            className={[
              styles.filterTypeChip,
              selectedAgentIds.has(option.agent_id)
                ? styles.filterTypeChipActive
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onToggleAgentType(option.agent_id)}
          >
            {option.label}
          </button>
        ))}
        {typeOptions.length === 0 && (
          <span className={styles.filterEmpty}>Aucun agent enregistre</span>
        )}
      </div>
    </div>
  </div>
);
export const AgentFiltersPopover = FilterPopover;

const OptionSearch: FunctionComponent<OptionSearchType> = ({
  className = "",
  wrapperClassName = "",
  centeredLayout = false,
  enlargedSearch = false,
  wrap = false,
  searchbar = true,
  sortButton = true,
  filterButton = true,
  filterCount = 0,
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
  filterPopover,
}) => {
  const [isSortOpen, setSortOpen] = useState(false);
  const sortContainerRef = useRef<HTMLDivElement | null>(null);
  const [sortOrderByKey, setSortOrderByKey] = useState<
    Record<string, "asc" | "desc">
  >({});
  const [isFilterOpen, setFilterOpen] = useState(false);
  const filterContainerRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    const handleWindowClick = (event: globalThis.MouseEvent) => {
      if (!filterContainerRef.current?.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    };
    window.addEventListener("mousedown", handleWindowClick);
    return () => {
      window.removeEventListener("mousedown", handleWindowClick);
    };
  }, []);

  useEffect(() => {
    if (!filterPopover) {
      setFilterOpen(false);
    }
  }, [filterPopover]);

  useEffect(() => {
    if (!sortColumn) {
      return;
    }
    setSortOrderByKey((prev) => ({
      ...prev,
      [sortColumn]: sortOrder,
    }));
  }, [sortColumn, sortOrder]);

  const hasSortOptions = Array.isArray(sortOptions) && sortOptions.length > 0 && typeof onSortChange === "function";
  const activeSortLabel =
    sortOptions?.find((option) => option.key === sortColumn)?.label ?? "Tri";
  const activeSortKey = useMemo(() => {
    if (sortColumn) {
      return sortColumn;
    }
    return sortOptions?.[0]?.key;
  }, [sortColumn, sortOptions]);
  const displayedDirectionOrder =
    (activeSortKey ? sortOrderByKey[activeSortKey] : undefined) ?? sortOrder;

  const getOrderForOption = (optionKey: string): "asc" | "desc" =>
    sortOrderByKey[optionKey] ?? (optionKey === sortColumn ? sortOrder : "asc");

  const handleSortButtonClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (hasSortOptions) {
      setSortOpen((prev) => !prev);
      return;
    }

    onSortClick?.();
  };

  const handleFilterButtonClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (filterPopover) {
      setFilterOpen((prev) => !prev);
    }
    onFilterClick?.();
  };

  const handleSortSelection = (optionKey: string) => {
    if (!hasSortOptions) {
      return;
    }

    const nextOrder = getOrderForOption(optionKey);
    setSortOrderByKey((prev) => ({
      ...prev,
      [optionKey]: nextOrder,
    }));

    const payload = {
      key: optionKey,
      order: nextOrder,
    };
    onSortChange?.(payload as { key: string; order: "asc" | "desc" });
    setSortOpen(false);
  };

  const handleSortDirectionToggle = (
    event: ReactMouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();
    if (!hasSortOptions || !activeSortKey) {
      return;
    }
    const nextOrder: "asc" | "desc" =
      displayedDirectionOrder === "asc" ? "desc" : "asc";
    setSortOrderByKey((prev) => ({
      ...prev,
      [activeSortKey]: nextOrder,
    }));
    onSortChange?.({ key: activeSortKey, order: nextOrder });
  };

  const content = (
    <div
      className={[
        styles.optionsearch,
        centeredLayout ? styles.optionsearchCentered : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {searchbar && (
        <div
          className={[
            styles.searchbar,
            enlargedSearch ? styles.searchbarLarge : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
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
            className={styles.sortControlsGroup}
            ref={(node) => {
              sortContainerRef.current = node;
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.sortButtonContainer}>
              <button
                className={[
                  styles.optionActions,
                  styles.sortTriggerButton,
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
                <span className={styles.sortTriggerText}>{activeSortLabel}</span>
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
                        <span className={styles.sortOptionArrow}>
                          {getOrderForOption(option.key) === "asc"
                            ? "Croissant"
                            : "Decroissant"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              className={[styles.optionActions, styles.sortDirectionButton]
                .filter(Boolean)
                .join(" ")}
              onClick={handleSortDirectionToggle}
              aria-label="Changer le sens du tri"
              title={
                displayedDirectionOrder === "asc"
                  ? "Tri ascendant"
                  : "Tri descendant"
              }
            >
              {displayedDirectionOrder === "asc"
                ? "Croissant"
                : "Decroissant"}
            </button>
          </div>
        ) : (
          <button
            className={[
              styles.optionActions,
              styles.sortTriggerButton,
              sortActive ? styles.optionActionsActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            onClick={handleSortButtonClick}
          >
            <img className={styles.sortbuttonIcon} alt="" src="/sortButton.svg" />
            <span className={styles.sortTriggerText}>Tri</span>
          </button>
        )
      )}
      {filterButton && (
        <div
          className={styles.filterButtonContainer}
          ref={filterContainerRef}
        >
          <button
            className={[
              styles.optionActions,
              styles.filterTriggerButton,
              filterActive ? styles.optionActionsActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            onClick={handleFilterButtonClick}
          >
            <img className={styles.filterbuttonIcon} alt="Filtrer" src="/filterButton.svg" />
            <span className={styles.filterTriggerText}>Filtres</span>
            {filterCount > 0 && (
              <span className={styles.filterTriggerBadge}>{filterCount}</span>
            )}
          </button>
          {isFilterOpen && filterPopover}
        </div>
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
          className={[styles.optionActions, styles.addAgentTriggerButton]
            .filter(Boolean)
            .join(" ")}
          type="button"
          onClick={() => {
            if (typeof onAddClick === "function") {
              onAddClick();
              return;
            }
            window.dispatchEvent(new CustomEvent("openAddAgentOverlay"));
          }}
          aria-label="Ajouter un agent"
        >
          <img className={styles.searchlogoIcon} alt="" src="/addButton.svg" />
          <span className={styles.addTriggerText}>Ajouter</span>
        </button>
      )}
    </div>
  );

  if (!wrap) {
    return content;
  }

  return (
    <section
      className={[
        styles.wrapper,
        centeredLayout ? styles.wrapperCentered : "",
        wrapperClassName,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {content}
    </section>
  );
};

export default OptionSearch;

