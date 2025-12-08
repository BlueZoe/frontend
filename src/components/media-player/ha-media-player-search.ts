import { grid } from "@lit-labs/virtualizer/layouts/grid";
import { mdiMagnify, mdiPlay } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
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
import { showToast } from "../../util/toast";
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

const ACCENT_COLORS = [
  "#f19d9bff",
  "#eb89a9ff",
  "#cb9dd4ff",
  "#8a75afff",
  "#7c86c0ff",
  "#9fd0f9ff",
  "#b4dff3ff",
  "#7eadb4ff",
  "#7aaea9ff",
  "#94ca97ff",
  "#c0daa2ff",
  "#d6dbaaff",
  "#dfd790ff",
  "#ded2aeff",
  "#d9c6aaff",
  "#eca590ff",
  "#8D6E63",
  "#BDBDBD",
  "#78909C",
];

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
                @click=${() => this._handleFilterClick(filter)}
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

  private _generateColor(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash % ACCENT_COLORS.length);
    return ACCENT_COLORS[index];
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

    // Include liked songs state in items, preferring is_liked from backend
    const itemsWithLikedSongs = children.map((child) => ({
      ...child,
      _isLiked:
        child.is_liked ??
        (child.media_content_id
          ? this._likedSongsTrackIds.has(child.media_content_id)
          : false),
    }));

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
      <div class="child" .item=${child} @click=${this._childClicked}>
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
    // Consider removing the avatar letter, because when the liked songs icon re-renders,
    // the avatar letter also re-renders and causes a flicker effect.
    const avatarColor = this._generateColor(child.title);
    const firstLetter = child.title.charAt(0).toUpperCase();

    const backgroundImage = child.thumbnail
      ? this._getThumbnailURLorBase64(child.thumbnail).then(
          (value) => `url(${value})`
        )
      : "none";

    const isLiked =
      child._isLiked ??
      (child.media_content_id
        ? this._likedSongsTrackIds.has(child.media_content_id)
        : false);

    return html`
      <ha-list-item
        @click=${this._childClicked}
        .item=${child}
        graphic="medium"
      >
        ${!child.thumbnail && !child.can_play
          ? html`<ha-svg-icon icon="mdi:folder" slot="graphic"></ha-svg-icon>`
          : html`
              <div
                class=${classMap({
                  graphic: true,
                  thumbnail: !!child.thumbnail,
                  "letter-avatar": !child.thumbnail,
                })}
                style="background-image: ${until(
                  backgroundImage,
                  ""
                )}; background-color: ${!child.thumbnail
                  ? avatarColor
                  : "transparent"};"
                slot="graphic"
              >
                ${!child.thumbnail
                  ? html`<span class="avatar-letter">${firstLetter}</span>`
                  : nothing}
                ${child.can_play
                  ? html`<ha-icon-button
                      class="play ${classMap({
                        show: !child.thumbnail,
                      })}"
                      .item=${child}
                      .path=${mdiPlay}
                      @click=${this._actionClicked}
                    ></ha-icon-button>`
                  : nothing}
              </div>
            `}
        <div class="title-container">
          <span class="title">${child.title}</span>
          ${child.media_content_id
            ? html`
                <ha-icon-button
                  class="favorite-button"
                  .item=${child}
                  @click=${this._toggleLikedSongs}
                  aria-label=${isLiked
                    ? "Remove from liked songs"
                    : "Add to liked songs"}
                >
                  ${isLiked
                    ? html`
                        <svg
                          data-encore-id="icon"
                          role="img"
                          aria-hidden="true"
                          class="favorite-icon favorite-icon-active"
                          viewBox="0 0 16 16"
                        >
                          <path
                            d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m11.748-1.97a.75.75 0 0 0-1.06-1.06l-4.47 4.47-1.405-1.406a.75.75 0 1 0-1.061 1.06l2.466 2.467 5.53-5.53z"
                          ></path>
                        </svg>
                      `
                    : html`
                        <svg
                          data-encore-id="icon"
                          role="img"
                          aria-hidden="true"
                          class="favorite-icon"
                          viewBox="0 0 16 16"
                        >
                          <path
                            d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8"
                          ></path>
                          <path
                            d="M11.75 8a.75.75 0 0 1-.75.75H8.75V11a.75.75 0 0 1-1.5 0V8.75H5a.75.75 0 0 1 0-1.5h2.25V5a.75.75 0 0 1 1.5 0v2.25H11a.75.75 0 0 1 .75.75"
                          ></path>
                        </svg>
                      `}
                </ha-icon-button>
              `
            : nothing}
        </div>
      </ha-list-item>
    `;
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

  /**
   * Rolls back the liked songs state for a track to its previous state.
   * Used when an optimistic update fails and needs to be reverted.
   *
   * @param mediaContentId - The track's media content ID
   * @param shouldBeLiked - Whether the track should be in liked state (true) or not (false)
   */
  private _rollbackLikedState = (
    mediaContentId: string,
    shouldBeLiked: boolean
  ): void => {
    const rollback = new Set(this._likedSongsTrackIds);
    if (shouldBeLiked) {
      rollback.add(mediaContentId);
    } else {
      rollback.delete(mediaContentId);
    }
    this._likedSongsTrackIds = rollback;
    this.requestUpdate();
  };

  private _childClicked = async (ev: MouseEvent): Promise<void> => {
    const target = ev.currentTarget as any;
    const item: MediaPlayerItem = target.item;

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

  /**
   * Toggles the liked songs status of a track.
   * Uses optimistic UI updates for instant feedback and reverts on error.
   *
   * Flow:
   * 1. Optimistically update UI immediately (user sees instant feedback)
   * 2. Call backend API to perform the actual toggle
   * 3. On success: Confirm the state matches backend response
   * 4. On error: Roll back optimistic update and show error message
   */
  private _toggleLikedSongs = async (ev: MouseEvent): Promise<void> => {
    ev.stopPropagation();
    ev.preventDefault();
    const item = (ev.currentTarget as any).item as MediaPlayerItem;
    if (!item.media_content_id) return;

    // Get current liked state
    const isLiked = this._likedSongsTrackIds.has(item.media_content_id);

    // Optimistic update: immediately toggle UI state for instant feedback
    // This makes the interface feel responsive while the API call is in progress
    const next = new Set(this._likedSongsTrackIds);
    if (isLiked) {
      next.delete(item.media_content_id);
    } else {
      next.add(item.media_content_id);
    }
    this._likedSongsTrackIds = next;
    this.requestUpdate();

    try {
      // Call backend API to perform the actual toggle
      // Backend response title format: "success:added" or "success:removed" or "error:message"
      const result = await browseMediaPlayer(
        this.hass,
        this.entityId,
        `${item.media_content_id}?action=${!isLiked}`,
        "spotify:liked_songs_action"
      );

      const title = result?.title || "";

      // Handle success response: confirm state matches backend
      if (title.startsWith("success:")) {
        // Parse action type from response title (e.g., "success:added" -> "added")
        const shouldBeLiked = title.split(":")[1] === "added";

        // Ensure state is correctly set (should match optimistic update)
        const updated = new Set(this._likedSongsTrackIds);
        if (shouldBeLiked) {
          updated.add(item.media_content_id);
        } else {
          updated.delete(item.media_content_id);
        }
        this._likedSongsTrackIds = updated;

        // Update search results data to reflect new liked status
        // This ensures the icon updates correctly in the rendered list
        if (this._searchResults?.children) {
          this._searchResults = {
            ...this._searchResults,
            children: this._searchResults.children.map((child) =>
              child.media_content_id === item.media_content_id
                ? { ...child, is_liked: shouldBeLiked }
                : child
            ),
          };
        }

        this.requestUpdate();
      } else if (title.startsWith("error:")) {
        // Handle error response: roll back optimistic update
        this._rollbackLikedState(item.media_content_id, isLiked);
        showToast(this, {
          message:
            title.replace("error:", "").trim() ||
            "Failed to update liked songs",
          duration: 5000,
        });
      }
    } catch (err: any) {
      // Handle exception: roll back optimistic update and show error
      this._rollbackLikedState(item.media_content_id, isLiked);
      showToast(this, {
        message:
          err?.message || err?.body?.message || "Failed to update liked songs",
        duration: 5000,
      });
    }
  };

  private _handleSearchInput(ev: any) {
    this._searchQuery = ev.target.value;
  }

  private _handleSearchKeyup(ev: KeyboardEvent) {
    if (ev.key === "Enter") {
      this._fetchResults();
    }
  }

  private _handleFilterClick(filter: string) {
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
      // Update liked songs set based on is_liked field from backend
      if (result?.children) {
        for (const child of result.children) {
          if (child.media_content_id) {
            if (child.is_liked === true) {
              this._likedSongsTrackIds.add(child.media_content_id);
            } else if (child.is_liked === false) {
              this._likedSongsTrackIds.delete(child.media_content_id);
            }
          }
        }
      }
    } catch (err) {
      console.error("Search failed:", err);
      this._searchResults = undefined;
    } finally {
      this._loading = false;
    }
  }

  static get styles(): CSSResultGroup {
    return css`
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
        border-radius: var(--ha-border-radius-sm) var(--ha-border-radius-sm) 0 0;
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
        width: 100%;
      }
      ha-list-item .mdc-deprecated-list-item__primary-text {
        position: relative;
      }
      ha-list-item .title-container {
        display: flex;
        align-items: center;
        position: absolute;
        left: 84px;
        right: var(--mdc-list-side-padding, 20px);
        top: 0;
        bottom: 0;
      }
      ha-list-item .title {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      ha-list-item .graphic {
        background-size: cover;
        background-repeat: no-repeat;
        background-position: center;
        border-radius: 4px;
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
      }
      .avatar-letter {
        font-size: 24px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.8);
        pointer-events: none;
      }

      ha-list-item .play {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        background-color: rgba(0, 0, 0, 0.5);
        border-radius: 4px;
        color: white;
        transition: opacity 0.2s;

        --mdc-icon-button-size: 48px;
        --mdc-icon-size: 28px;
      }

      ha-list-item .play.show {
        opacity: 0;
      }

      ha-list-item:hover .play.show,
      ha-list-item:hover .play {
        opacity: 1;
        color: white;
      }

      ha-list-item .favorite-button {
        flex-shrink: 0;
        margin-left: 8px;
        --mdc-icon-button-size: 40px;
        --mdc-icon-size: 20px;
        color: rgb(179, 179, 179);
      }

      ha-list-item .favorite-button:hover {
        color: var(--primary-color);
      }

      ha-list-item .favorite-icon {
        width: 20px;
        height: 20px;
        fill: rgb(179, 179, 179);
      }

      ha-list-item .favorite-icon-active {
        fill: rgb(30, 215, 96);
      }

      ha-list-item .favorite-button:has(.favorite-icon-active) {
        color: rgb(30, 215, 96);
      }

      lit-virtualizer {
        contain: size layout;
        flex: 1;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-media-player-search": HaMediaPlayerSearch;
  }
}
