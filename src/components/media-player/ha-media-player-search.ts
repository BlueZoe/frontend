import { grid } from "@lit-labs/virtualizer/layouts/grid";
import { mdiMagnify, mdiPlay } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { until } from "lit/directives/until";
import { fireEvent } from "../../common/dom/fire_event";
import { slugify } from "../../common/string/slugify";
import { browseMediaPlayer } from "../../data/media-player";
import type { MediaPlayerItem } from "../../data/media-player";
import type { HomeAssistant } from "../../types";
import {
  brandsUrl,
  extractDomainFromBrandUrl,
  isBrandUrl,
} from "../../util/brands-url";
import "../ha-card";
import "../ha-icon-button";
import "../ha-list";
import "../ha-list-item";
import "../ha-svg-icon";
import "../ha-textfield";
import "../ha-tooltip";
import { loadVirtualizer } from "../../resources/virtualizer";
import {
  enrichItemsWithLikedStatus,
  updateItemLikedStatus,
  type MediaPlayerItemWithSaved,
} from "./ha-media-player-like-button";
import {
  renderMediaPlayerListItem,
  haMediaPlayerListItemStyles,
} from "./ha-media-player-list-item";

@customElement("ha-media-player-search")
export class HaMediaPlayerSearch extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public item!: MediaPlayerItem;

  @property({ attribute: false }) public entityId!: string;

  @property({ attribute: false }) public navigateIds!: any[];

  @state() private _searchQuery = "";

  @state() private _searchFilter = "track";

  @state() private _searchResults?: MediaPlayerItem;

  @state() private _loading = false;

  @state() private _likedSongsTrackIds = new Set<string>();

  public willUpdate(changedProps: PropertyValues<this>): void {
    super.willUpdate(changedProps);

    if (!this.hasUpdated) {
      loadVirtualizer();
    }
  }

  protected render(): TemplateResult {
    return html`
      <div class="content padding">
        <div class="search-bar">
          <ha-textfield
            .label=${this.hass.localize("ui.common.search")}
            .value=${this._searchQuery}
            iconTrailing
            @keyup=${this._handleSearchKeyup}
            @input=${this._handleSearchInput}
          >
            <ha-svg-icon slot="trailingIcon" .path=${mdiMagnify}></ha-svg-icon>
          </ha-textfield>
        </div>

        <div class="filter-tabs">
          ${["track", "album", "playlist"].map(
            (filter) => html`
              <div
                class="tab ${classMap({
                  active: this._searchFilter === filter,
                })}"
                .filter=${filter}
                @click=${this._handleFilterClick}
              >
                ${filter.charAt(0).toUpperCase() + filter.slice(1)}s
              </div>
            `
          )}
        </div>

        ${this._renderContent()}
      </div>
    `;
  }

  private _renderContent() {
    if (this._loading) {
      return html`<div class="loading">Loading...</div>`;
    }

    if (!this._searchResults) {
      return html`
        <div class="search-results-placeholder">
          <p>Type to search Spotify</p>
        </div>
      `;
    }

    const children = this._searchResults.children || [];

    if (children.length === 0) {
      return html`
        <div class="search-results-placeholder">
          <p>No results found for "<strong>${this._searchQuery}</strong>"</p>
        </div>
      `;
    }

    // List layout for tracks, Grid layout for others
    const isGrid = this._searchFilter !== "track";

    if (isGrid) {
      return html`
        <lit-virtualizer
          scroller
          .layout=${grid({
            itemSize: {
              width: "175px",
              height: "225px",
            },
            gap: "16px",
            justify: "space-evenly",
            direction: "vertical",
          })}
          .items=${children}
          .renderItem=${this._renderGridItem}
          class="children"
        ></lit-virtualizer>
      `;
    }

    // Include liked songs state in items, preferring is_saved from backend
    const itemsWithLikedSongs = enrichItemsWithLikedStatus(
      children,
      this._likedSongsTrackIds
    );

    return html`
      <ha-list>
        <lit-virtualizer
          scroller
          .items=${itemsWithLikedSongs}
          style=${styleMap({
            height: `${children.length * 72 + 26}px`,
          })}
          .renderItem=${this._renderListItem}
        ></lit-virtualizer>
      </ha-list>
    `;
  }

  private _renderGridItem = (child: MediaPlayerItem): TemplateResult => {
    const backgroundImage = child.thumbnail
      ? this._getThumbnailURLorBase64(child.thumbnail).then(
          (value) => `url(${value})`
        )
      : "none";

    return html`
      <div class="child" .item=${child} @click=${this._handleGridItemClick}>
        <ha-card outlined>
          <div class="thumbnail">
            ${child.thumbnail
              ? html`
                  <div
                    class="image"
                    style="background-image: ${until(backgroundImage, "")}"
                  ></div>
                `
              : html`
                  <div class="icon-holder image">
                    <ha-svg-icon class="folder" icon="mdi:folder"></ha-svg-icon>
                  </div>
                `}
            ${child.can_play
              ? html`
                  <ha-icon-button
                    class="play ${classMap({
                      can_expand: child.can_expand,
                    })}"
                    .item=${child}
                    .path=${mdiPlay}
                    @click=${this._actionClicked}
                  ></ha-icon-button>
                `
              : nothing}
          </div>
          <ha-tooltip .for="grid-${slugify(child.title)}" distance="-4">
            ${child.title}
          </ha-tooltip>
          <div .id="grid-${slugify(child.title)}" class="title">
            ${child.title}
          </div>
        </ha-card>
      </div>
    `;
  };

  private _renderListItem = (
    child: MediaPlayerItem & { _isLiked?: boolean }
  ): TemplateResult => {
    // Use pre-computed _isLiked from enrichItemsWithLikedStatus
    const isLiked = child._isLiked ?? false;

    return renderMediaPlayerListItem(
      child,
      this.hass,
      this.entityId,
      (_hass: HomeAssistant, thumbnailUrl: string | undefined) =>
        this._getThumbnailURLorBase64(thumbnailUrl),
      {
        mediaClass: "track",
        action: "play",
        isLiked,
        onItemClick: this._childClicked,
        onActionClick: this._actionClicked,
        onLikedChanged: this._handleLikedChanged,
      }
    );
  };

  private async _getThumbnailURLorBase64(
    thumbnailUrl: string | undefined
  ): Promise<string> {
    if (!thumbnailUrl) {
      return "";
    }

    if (thumbnailUrl.startsWith("/")) {
      return new Promise((resolve, reject) => {
        this.hass
          .fetchWithAuth(thumbnailUrl!)
          .then((response) => response.blob())
          .then((blob) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result;
              resolve(typeof result === "string" ? result : "");
            };
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(blob);
          });
      });
    }

    if (isBrandUrl(thumbnailUrl)) {
      thumbnailUrl = brandsUrl({
        domain: extractDomainFromBrandUrl(thumbnailUrl),
        type: "icon",
        useFallback: true,
        darkOptimized: this.hass.themes?.darkMode,
      });
    }

    return thumbnailUrl;
  }

  private _actionClicked = (ev: MouseEvent): void => {
    ev.stopPropagation();
    const item = (ev.currentTarget as any).item;
    this._runAction(item);
  };

  private _runAction(item: MediaPlayerItem): void {
    fireEvent(this, "media-picked", { item, navigateIds: [] });
  }

  private _handleItemClick = async (item: MediaPlayerItem): Promise<void> => {
    if (!item) return;

    if (!item.can_expand) {
      this._runAction(item);
      return;
    }

    fireEvent(this, "media-browsed", {
      ids: [...this.navigateIds, item],
      current: item,
      replace: false,
    });
  };

  private _handleGridItemClick = async (ev: MouseEvent): Promise<void> => {
    const target = ev.currentTarget as any;
    const item: MediaPlayerItem = target.item;
    await this._handleItemClick(item);
  };

  private _childClicked = async (ev: MouseEvent): Promise<void> => {
    const target = ev.currentTarget as any;
    const item: MediaPlayerItem = target.item;
    await this._handleItemClick(item);
  };

  /**
   * Handles liked status changes from the like button component.
   * Updates internal state to keep search results in sync.
   */
  private _handleLikedChanged = (
    ev: CustomEvent<{ item: MediaPlayerItem; isLiked: boolean }>
  ): void => {
    const { item, isLiked } = ev.detail;
    if (!item.media_content_id) return;

    // Update liked songs set
    const updated = new Set(this._likedSongsTrackIds);
    if (isLiked) {
      updated.add(item.media_content_id);
    } else {
      updated.delete(item.media_content_id);
    }
    this._likedSongsTrackIds = updated;

    // Update search results data to reflect new liked status
    this._searchResults = updateItemLikedStatus(
      this._searchResults,
      item.media_content_id,
      isLiked
    );

    this.requestUpdate();
  };

  private _handleSearchInput(ev: any) {
    this._searchQuery = ev.target.value;
  }

  private _handleSearchKeyup(ev: KeyboardEvent) {
    if (ev.key === "Enter") {
      this._fetchResults();
    }
  }

  private _handleFilterClick(ev: Event) {
    const target = ev.currentTarget as HTMLElement;
    const filter = (target as any).filter as string;
    if (this._searchFilter === filter) return;
    this._searchFilter = filter;
    if (this._searchQuery.trim()) {
      this._fetchResults();
    }
  }

  private async _fetchResults() {
    const query = this._searchQuery.trim();
    if (!query) return;

    this._loading = true;
    const currentId = this.item.media_content_id;
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("type", this._searchFilter);

    const separator = currentId.includes("?") ? "&" : "?";
    const mediaContentId = `${currentId}${separator}${params.toString()}`;

    try {
      const result = await browseMediaPlayer(
        this.hass,
        this.entityId,
        mediaContentId,
        "search"
      );
      this._searchResults = result;
      // Update liked songs set based on is_saved field from backend
      if (result?.children) {
        for (const child of result.children) {
          if (child.media_content_id) {
            const childWithSaved = child as MediaPlayerItemWithSaved;
            if (childWithSaved.is_saved === true) {
              this._likedSongsTrackIds.add(child.media_content_id);
            } else if (childWithSaved.is_saved === false) {
              this._likedSongsTrackIds.delete(child.media_content_id);
            }
          }
        }
      }
    } catch (_err) {
      // Search failed - silently handle error and clear results
      this._searchResults = undefined;
    } finally {
      this._loading = false;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haMediaPlayerListItemStyles,
      css`
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }
        .header {
          display: flex;
          justify-content: space-between;
          border-bottom: 1px solid var(--divider-color);
          background-color: var(--card-background-color);
          padding: 16px;
        }
        .header-content {
          display: flex;
          flex-wrap: wrap;
          flex-grow: 1;
          align-items: flex-start;
        }
        .header-info {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-self: stretch;
          min-width: 0;
          flex: 1;
        }
        .breadcrumb .title {
          font-size: var(--ha-font-size-4xl);
          line-height: var(--ha-line-height-condensed);
          font-weight: var(--ha-font-weight-bold);
          margin: 0;
        }
        .content {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }
        .padding {
          padding: 16px;
        }
        .search-bar {
          margin-bottom: 16px;
        }
        ha-textfield {
          width: 100%;
        }
        .filter-tabs {
          display: flex;
          border-bottom: 1px solid var(--divider-color);
          margin-bottom: 16px;
        }
        .tab {
          padding: 8px 16px;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          font-weight: 500;
          color: var(--secondary-text-color);
          text-transform: uppercase;
        }
        .tab.active {
          border-bottom-color: var(--primary-color);
          color: var(--primary-color);
        }
        .tab:hover {
          background-color: rgba(var(--rgb-primary-color), 0.05);
        }
        .search-results-placeholder {
          text-align: center;
          color: var(--secondary-text-color);
          margin-top: 32px;
        }
        .loading {
          text-align: center;
          padding: 20px;
          color: var(--secondary-text-color);
        }

        /* Grid Layout Styles */
        .child {
          display: flex;
          flex-direction: column;
          cursor: pointer;
        }
        ha-card {
          position: relative;
          width: 100%;
          box-sizing: border-box;
        }
        ha-card .thumbnail {
          width: 100%;
          position: relative;
          box-sizing: border-box;
          padding-bottom: 100%;
        }
        .image {
          position: absolute;
          top: 0;
          right: 0;
          left: 0;
          bottom: 0;
          background-size: cover;
          background-repeat: no-repeat;
          background-position: center;
          border-radius: var(--ha-border-radius-sm) var(--ha-border-radius-sm) 0
            0;
        }
        .icon-holder {
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: var(--secondary-background-color);
        }
        .folder {
          color: var(--secondary-text-color);
          --mdc-icon-size: 50px;
        }
        .child .play {
          position: absolute;
          transition: color 0.5s;
          border-radius: 50%;
          top: calc(50% - 25px);
          right: calc(50% - 25px);
          opacity: 0;
          transition: opacity 0.1s ease-out;
          --mdc-icon-button-size: 50px;
          --mdc-icon-size: 30px;
          background-color: var(--primary-color);
          color: var(--text-primary-color);
        }
        ha-card:hover .image {
          filter: brightness(70%);
          transition: filter 0.5s;
        }
        ha-card:hover .play {
          opacity: 1;
        }
        .title {
          font-size: var(--ha-font-size-m);
          padding: 12px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* List Layout Styles */
        ha-list {
          --mdc-list-vertical-padding: 0;
        }
        ha-list-item {
          cursor: pointer;
        }
        ha-list-item .mdc-deprecated-list-item__primary-text {
          position: relative;
        }
        lit-virtualizer {
          contain: size layout;
          flex: 1;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-media-player-search": HaMediaPlayerSearch;
  }
}
