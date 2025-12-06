import { mdiMagnify } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { fireEvent } from "../../common/dom/fire_event"; // 假设路径一致，根据实际文件结构调整
import type { MediaPlayerItem } from "../../data/media-player";
import type { HomeAssistant } from "../../types";
import "../ha-svg-icon";
import "../ha-textfield";

@customElement("ha-media-player-search")
export class HaMediaPlayerSearch extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public item!: MediaPlayerItem;

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
          ${["track", "artist", "album"].map(
            (filter) => html`
              <div
                class="tab ${classMap({
                  active: this._searchFilter === filter,
                })}"
                @click=${() => (this._searchFilter = filter)}
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

  private _handleSearchInput(ev: any) {
    this._searchQuery = ev.target.value;
  }

  private _handleSearchKeyup(ev: KeyboardEvent) {
    if (ev.key === "Enter") {
      // 触发搜索事件，父组件可以监听这个事件（如果需要），
      // 或者这里直接调用 API（推荐在第二阶段在这里直接处理数据获取）
      fireEvent(this, "search-triggered", {
        query: this._searchQuery,
        filter: this._searchFilter,
      });
      console.log("Trigger Search:", this._searchQuery, this._searchFilter);
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