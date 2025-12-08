import { type CSSResultGroup, LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import type { HomeAssistant } from "../../types";
import type { MediaPlayerItem } from "../../data/media-player";
import { browseMediaPlayer } from "../../data/media-player";
import { showToast } from "../../util/toast";
import "../ha-icon-button";

/**
 * Extended MediaPlayerItem interface that includes saved status.
 * This is only used in the like button component and related utilities.
 */
export interface MediaPlayerItemWithSaved extends MediaPlayerItem {
  is_saved?: boolean;
}

/**
 * Enriches MediaPlayerItem objects with liked status information.
 * Prefers is_saved from backend, otherwise checks against liked track IDs set.
 *
 * @param items - Array of MediaPlayerItem objects to enrich
 * @param likedTrackIds - Set of track IDs that are liked
 * @returns Array of items with _isLiked field added
 */
export const enrichItemsWithLikedStatus = (
  items: MediaPlayerItem[],
  likedTrackIds: Set<string>
): (MediaPlayerItem & { _isLiked?: boolean })[] =>
  items.map((item) => {
    const itemWithSaved = item as MediaPlayerItemWithSaved;
    return {
      ...item,
      _isLiked:
        itemWithSaved.is_saved ??
        (item.media_content_id
          ? likedTrackIds.has(item.media_content_id)
          : false),
    };
  });

/**
 * Updates the liked status of a specific item in a MediaPlayerItem's children array.
 * Returns a new MediaPlayerItem with the updated children, or the original if not found.
 *
 * @param parentItem - The parent MediaPlayerItem containing children
 * @param itemId - The media_content_id of the item to update
 * @param isLiked - The new liked status
 * @returns New MediaPlayerItem with updated children, or original if no match
 */
export const updateItemLikedStatus = (
  parentItem: MediaPlayerItem | undefined,
  itemId: string,
  isLiked: boolean
): MediaPlayerItem | undefined => {
  if (!parentItem?.children) {
    return parentItem;
  }

  return {
    ...parentItem,
    children: parentItem.children.map((child) => {
      if (child.media_content_id === itemId) {
        const childWithSaved = { ...child } as MediaPlayerItemWithSaved;
        childWithSaved.is_saved = isLiked;
        return childWithSaved;
      }
      return child;
    }),
  };
};

@customElement("ha-media-player-like-button")
class HaMediaPlayerLikeButton extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entityId!: string;

  @property({ attribute: false }) public item!: MediaPlayerItem;

  @property({ type: Boolean, attribute: "is-liked" }) public isLiked = false;

  @property({ type: Boolean }) public disabled = false;

  @state() private _optimisticLiked?: boolean;

  protected render() {
    if (!this.item?.media_content_id) {
      return nothing;
    }

    // Use optimistic state if available, otherwise use prop
    const displayLiked = this._optimisticLiked ?? this.isLiked;

    return html`
      <ha-icon-button
        class="favorite-button"
        .disabled=${this.disabled}
        @click=${this._handleClick}
        aria-label=${displayLiked
          ? "Remove from liked songs"
          : "Add to liked songs"}
      >
        ${displayLiked
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
    `;
  }

  static readonly styles: CSSResultGroup = css`
    .favorite-button {
      flex-shrink: 0;
      margin-left: 8px;
      --mdc-icon-button-size: 40px;
      --mdc-icon-size: 20px;
      color: rgb(179, 179, 179);
    }

    .favorite-button:hover {
      color: var(--primary-color);
    }

    .favorite-icon {
      width: 20px;
      height: 20px;
      fill: rgb(179, 179, 179);
    }

    .favorite-icon-active {
      fill: rgb(30, 215, 96);
    }

    .favorite-button:has(.favorite-icon-active) {
      color: rgb(30, 215, 96);
    }
  `;

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
  private _handleClick = async (ev: MouseEvent): Promise<void> => {
    ev.stopPropagation();
    ev.preventDefault();

    if (!this.item?.media_content_id || !this.entityId) return;

    const currentLiked = this._optimisticLiked ?? this.isLiked;

    // Optimistic update: immediately toggle UI state for instant feedback
    this._optimisticLiked = !currentLiked;
    this.requestUpdate();

    try {
      // Call backend API to perform the actual toggle
      // Backend response title format: "success:added" or "success:removed" or "error:message"
      const result = await browseMediaPlayer(
        this.hass,
        this.entityId,
        `${this.item.media_content_id}?action=${!currentLiked}`,
        "spotify:liked_songs_action"
      );

      const title = result?.title || "";

      // Handle success response: confirm state matches backend
      if (title.startsWith("success:")) {
        // Parse action type from response title (e.g., "success:added" -> "added")
        const shouldBeLiked = title.split(":")[1] === "added";
        this._optimisticLiked = shouldBeLiked;

        // Emit event so parent components can update their state
        this.dispatchEvent(
          new CustomEvent("liked-changed", {
            detail: { item: this.item, isLiked: shouldBeLiked },
            bubbles: true,
            composed: true,
          })
        );
      } else if (title.startsWith("error:")) {
        // Handle error response: roll back optimistic update
        this._optimisticLiked = currentLiked;
        showToast(this, {
          message:
            title.replace("error:", "").trim() ||
            "Failed to update liked songs",
          duration: 5000,
        });
      }
    } catch (err: any) {
      // Handle exception: roll back optimistic update and show error
      this._optimisticLiked = currentLiked;
      showToast(this, {
        message:
          err?.message || err?.body?.message || "Failed to update liked songs",
        duration: 5000,
      });
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-media-player-like-button": HaMediaPlayerLikeButton;
  }
}
