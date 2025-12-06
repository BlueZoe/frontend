import { mdiMagnify } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { fireEvent } from "../../common/dom/fire_event"; // 假设路径一致，根据实际文件结构调整
import { MediaPlayerItem, browseMediaPlayer } from "../../data/media-player";
import type { HomeAssistant } from "../../types";
import "../ha-svg-icon";
import "../ha-textfield";

@customElement("ha-media-player-search")
export class HaMediaPlayerSearch extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public item!: MediaPlayerItem;

  @property({ attribute: false }) public entityId!: string;

  @state() private _searchQuery = "";

  @state() private _searchFilter = "track";

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
          ${["track", "playlist", "album"].map(
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

        <div class="search-results-placeholder">
          ${this._searchQuery
            ? html`<p>
                Searching for "<strong>${this._searchQuery}</strong>" in
                ${this._searchFilter}s...
              </p>`
            : html`<p>Type to search Spotify</p>`}
        </div>
      </div>
    `;
  }

  private _handleFilterClick(filter: string) {
    if (this._searchFilter === filter) return;
    this._searchFilter = filter;
    this._fetchResults(); // 切换 Tab 时触发搜索
  }

  private _handleSearchInput(ev: any) {
    this._searchQuery = ev.target.value;
  }

  private _handleSearchKeyup(ev: KeyboardEvent) {
    if (ev.key === "Enter") {
      this._fetchResults();
    }
  }

  private async _fetchResults() {
    const query = this._searchQuery.trim();
    if (!query) return;

    // 修改：使用字符串拼接代替 new URL()，避免部分浏览器对自定义 scheme 报错
    const currentId = this.item.media_content_id;
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("type", this._searchFilter);

    // 判断 currentId 是否已经包含参数（虽然 search 入口通常不含，但作为防守编程）
    const separator = currentId.includes("?") ? "&" : "?";
    const mediaContentId = `${currentId}${separator}${params.toString()}`;

    try {
      const result = await browseMediaPlayer(
        this.hass,
        this.entityId,
        mediaContentId,
        "search"
      );
      // 成功获取数据后在控制台输出
      console.log("Search Results:", result);
    } catch (err) {
      console.error("Search failed:", err);
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

      /* 复用 Header 样式 */
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

      /* Search Specific Styles */
      .content {
        flex: 1;
        overflow-y: auto;
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
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-media-player-search": HaMediaPlayerSearch;
  }
}
