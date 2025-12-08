import { mdiPlay, mdiPlus } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, nothing } from "lit";
import { classMap } from "lit/directives/class-map";
import { until } from "lit/directives/until";
import type { HomeAssistant } from "../../types";
import type {
  MediaPlayerBrowseAction,
  MediaPlayerItem,
} from "../../data/media-player";
import { MediaClassBrowserSettings } from "../../data/media-player";
import "../ha-icon-button";
import "../ha-list-item";
import "../ha-svg-icon";
import "./ha-media-player-like-button";

/**
 * Unified CSS styles for media player list items.
 * Import and include this in component styles arrays.
 */
export const haMediaPlayerListItemStyles: CSSResultGroup = css`
  ha-list-item {
    width: 100%;
  }

  ha-list-item .title-container {
    display: flex;
    align-items: center;
    position: absolute;
    left: 80px;
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

  ha-list-item:hover .graphic .play {
    opacity: 1;
    color: var(--primary-text-color);
  }

  ha-list-item .graphic .play.show {
    opacity: 1;
    background-color: transparent;
  }
`;

/**
 * Renders a media player list item.
 * This function encapsulates the rendering logic for list items in both browse and search components.
 *
 * @param item - The media player item to render
 * @param hass - Home Assistant instance
 * @param entityId - Entity ID of the media player
 * @param getThumbnail - Function to get thumbnail URL or base64 data
 * @param options - Rendering options
 * @returns Template result for the list item
 */
export const renderMediaPlayerListItem = (
  item: MediaPlayerItem,
  hass: HomeAssistant,
  entityId: string,
  getThumbnail: (
    hass: HomeAssistant,
    thumbnailUrl: string | undefined
  ) => Promise<string>,
  options: {
    mediaClass?: keyof typeof MediaClassBrowserSettings;
    action?: MediaPlayerBrowseAction;
    isLiked?: boolean;
    hideLikeButton?: boolean;
    onItemClick: (ev: MouseEvent) => void;
    onActionClick: (ev: MouseEvent) => void;
    onLikedChanged: (
      ev: CustomEvent<{ item: MediaPlayerItem; isLiked: boolean }>
    ) => void;
  }
): TemplateResult => {
  // Determine media class settings
  const settings = options.mediaClass
    ? MediaClassBrowserSettings[options.mediaClass]
    : MediaClassBrowserSettings.track;
  const showImages = settings.show_list_images ?? !!item.thumbnail;

  const backgroundImage =
    showImages && item.thumbnail
      ? getThumbnail(hass, item.thumbnail).then((value) => `url(${value})`)
      : "none";

  const iconPath =
    item.media_class === "directory"
      ? MediaClassBrowserSettings[
          (item.children_media_class ||
            item.media_class) as keyof typeof MediaClassBrowserSettings
        ]?.icon
      : MediaClassBrowserSettings[
          item.media_class as keyof typeof MediaClassBrowserSettings
        ]?.icon || settings.icon;

  const action = options.action || "play";
  const isLiked = options.isLiked ?? false;

  return html`
    <ha-list-item
      @click=${options.onItemClick}
      .item=${item}
      .graphic=${showImages ? "medium" : "avatar"}
    >
      ${backgroundImage === "none" && !item.can_play
        ? html`<ha-svg-icon .path=${iconPath} slot="graphic"></ha-svg-icon>`
        : html`<div
            class=${classMap({
              graphic: true,
              thumbnail: showImages,
            })}
            style="background-image: ${until(backgroundImage, "")}"
            slot="graphic"
          >
            ${item.can_play
              ? html`<ha-icon-button
                  class="play ${classMap({
                    show: !showImages || !item.thumbnail,
                  })}"
                  .item=${item}
                  .label=${hass.localize(
                    `ui.components.media-browser.${action}-media`
                  )}
                  .path=${action === "play" ? mdiPlay : mdiPlus}
                  @click=${options.onActionClick}
                ></ha-icon-button>`
              : nothing}
          </div>`}
      <div class="title-container">
        <span class="title">${item.title}</span>
        ${!options.hideLikeButton &&
        item.media_content_id &&
        item.media_content_type?.startsWith("spotify")
          ? html`
              <ha-media-player-like-button
                .hass=${hass}
                .entityId=${entityId}
                .item=${item}
                .isLiked=${isLiked}
                @liked-changed=${options.onLikedChanged}
              ></ha-media-player-like-button>
            `
          : nothing}
      </div>
    </ha-list-item>
  `;
};
