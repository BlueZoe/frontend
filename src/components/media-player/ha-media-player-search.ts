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
  "#f19d9bff", "#eb89a9ff", "#cb9dd4ff", "#8a75afff", "#7c86c0ff",
  "#9fd0f9ff", "#b4dff3ff", "#7eadb4ff", "#7aaea9ff", "#94ca97ff",
  "#c0daa2ff", "#d6dbaaff", "#dfd790ff", "#ded2aeff", "#d9c6aaff",
  "#eca590ff", "#8D6E63", "#BDBDBD", "#78909C"
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

    return html`
      <ha-list>
        <lit-virtualizer
          scroller
          .items=${children}
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

  // TODO: add & remove favorite
  private _renderListItem = (child: MediaPlayerItem): TemplateResult => {
    const showListImages = false;
    
    const avatarColor = this._generateColor(child.title);
    const firstLetter = child.title.charAt(0).toUpperCase();

    const backgroundImage =
      showListImages && child.thumbnail
        ? this._getThumbnailURLorBase64(child.thumbnail).then(
            (value) => `url(${value})`
          )
        : "none";

    return html`
      <ha-list-item
        @click=${this._childClicked}
        .item=${child}
        graphic="medium"
      >
        ${
          backgroundImage === "none" && !child.can_play
            ? html`<ha-svg-icon icon="mdi:folder" slot="graphic"></ha-svg-icon>`
            : html`
                <div
                  class=${classMap({
                    graphic: true,
                    thumbnail: showListImages,
                    "letter-avatar": true,
                  })}
                  style=${styleMap({
                    backgroundImage: until(backgroundImage, "none"),
                    backgroundColor: backgroundImage === "none" ? avatarColor : "transparent",
                  })}
                  slot="graphic"
                >
                  ${backgroundImage === "none" && !child.can_play ? nothing : 
                    html`<span class="avatar-letter">${firstLetter}</span>`
                  }

                  ${child.can_play
                    ? html`<ha-icon-button
                        class="play ${classMap({
                          show: !showListImages || !child.thumbnail,
                        })}"
                        .item=${child}
                        .path=${mdiPlay}
                        @click=${this._actionClicked}
                      ></ha-icon-button>`
                    : nothing}
                </div>
              `
        }
        <span class="title">${child.title}</span>
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
      ha-list-item .graphic {
        background-size: cover;
        background-repeat: no-repeat;
        background-position: center;
        border-radius: 4px;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
      }
      .avatar-letter {
        font-size: 20px;
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
        
        --mdc-icon-button-size: 40px;
        --mdc-icon-size: 24px;
      }
      
      ha-list-item .play.show {
        opacity: 0;
      }
      
      ha-list-item:hover .play.show,
      ha-list-item:hover .play {
        opacity: 1;
        color: white; 
      }
      
      ha-list-item .title {
        margin-left: 16px;
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
