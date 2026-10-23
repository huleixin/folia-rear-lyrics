import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight, MoreVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LibraryHomeSurfaceProps } from "../../core/contracts/suite";
import type { LibraryHomeCard } from "../../core/contracts/homeModel";
import type { LibraryHomeSources } from "../../core/bindings/useLibraryHomeSources";
import { useLibraryHomeOnline } from "../../core/bindings/useLibraryHomeOnline";
import { buildOnlinePlaylistCards } from "../../core/model/homeCards";
import { useLibraryTrackPlayback } from "../../../hooks/useLibraryTrackPlayback";
import { isSongUnavailable } from "../../../services/onlineMusic/songAvailability";
import { useMobileLibraryStore } from "../../../stores/useMobileLibraryStore";
import {
  getProviderSongMetadata,
  getSongCoverUrl,
} from "../../../services/onlineMusic/songMetadata";
import MobileArtwork from "./MobileArtwork";
import MobileDirectory from "./MobileDirectory";
import MobileScrollFrame from "./MobileScrollFrame";
import MobileRecommendations from "./MobileRecommendations";
import { getPlaybackSongKey } from "../../../utils/appPlaybackGuards";
import { collectionKey } from "../../core/model/collectionIdentity";
import type { SongResult } from "../../../types";
import MobileSheet from "./MobileSheet";

// src/library/suites/mobile/MobileHomeOverview.tsx
export default function MobileHomeOverview({
  props,
  sources,
  overview,
}: {
  props: LibraryHomeSurfaceProps;
  sources: LibraryHomeSources;
  overview: boolean;
}) {
  const { t } = useTranslation();
  const online = useLibraryHomeOnline(props.homeResources, {
    ...sources,
    tab: overview ? "radio" : sources.tab,
  });
  const mine = useMemo(
    () => buildOnlinePlaylistCards(sources.online.collections, t),
    [sources.online.collections, t]
  );
  const recent = useMobileLibraryStore((state) => state.recentTracks);
  const playRecent = useLibraryTrackPlayback(
    props.onPlaySong,
    props.onTogglePlayback
  );
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [menu, setMenu] = useState<
    | { kind: "track"; song: SongResult }
    | { kind: "playlist"; card: LibraryHomeCard }
    | null
  >(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const open = useCallback(
    (card: LibraryHomeCard, play = false) => {
      void props.homeResources.actions.openOnlineCard(
        card,
        sources.online.providerId,
        (collection) => {
          if (play) {
            useMobileLibraryStore
              .getState()
              .requestCollectionPlay(collectionKey(collection));
          }
          props.onOpenGridView(collection);
        }
      );
    },
    [
      props.homeResources.actions,
      props.onOpenGridView,
      sources.online.providerId,
    ]
  );
  useLayoutEffect(() => {
    if (!overview) return;
    const content = contentRef.current;
    const page = content?.closest(".ml-home");
    if (!content || !page) return;
    let footer: HTMLElement | null = null;
    const measure = () => {
      const pageBottom = page.getBoundingClientRect().bottom;
      if (!footer) return;
      const footerTop = footer.getBoundingClientRect().top;
      content.style.setProperty(
        "--ml-home-bottom-clearance",
        `${Math.max(18, pageBottom - footerTop + 18)}px`
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    const connectFooter = () => {
      footer = document.querySelector<HTMLElement>(".ml-footer");
      if (!footer) return false;
      observer.observe(footer);
      measure();
      return true;
    };
    // The persistent stage is lazy-loaded independently of the home surface.
    const mounted = new MutationObserver(() => {
      if (connectFooter()) mounted.disconnect();
    });
    if (!connectFooter())
      mounted.observe(document.body, { childList: true, subtree: true });
    window.visualViewport?.addEventListener("resize", measure);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      mounted.disconnect();
      window.visualViewport?.removeEventListener("resize", measure);
      window.removeEventListener("resize", measure);
    };
  }, [overview]);
  if (!overview)
    return online.items.length ? (
      <MobileDirectory cards={online.items} onOpen={(card) => open(card)} />
    ) : (
      <p className="ml-empty" role="status">
        {online.emptyMessage}
      </p>
    );
  const viewLibrary = () => {
    sources.setTab("playlist");
    useMobileLibraryStore.getState().setPage("library");
  };
  const allButton = (onClick: () => void, label = t("mobileLibrary.all")) => (
    <button className="ml-home-all" onClick={onClick}>
      {label}
      <ChevronRight size={15} />
    </button>
  );
  return (
    <>
      <MobileScrollFrame
        fill
        restoreAxis="vertical"
        restoreKey={`home:${sources.online.providerId}:${
          sources.online.user?.id ?? ""
        }`}
      >
        <div className="ml-home-scroll" ref={contentRef}>
          {showAllRecent ? (
            <section className="ml-recent-full-section">
              <div className="ml-home-section-heading">
                <h2>{t("mobileLibrary.recent")}</h2>
                <button
                  className="ml-home-all"
                  onClick={() => setShowAllRecent(false)}
                >
                  <ChevronLeft size={15} />
                  {t("mobileLibrary.back")}
                </button>
              </div>
              {recent.length ? (
                <div className="ml-recent-full">
                  {recent.map((song) => (
                    <button
                      key={getPlaybackSongKey(song)}
                      disabled={isSongUnavailable(song)}
                      onClick={() => playRecent(song, recent)}
                    >
                      <MobileArtwork src={getSongCoverUrl(song)} />
                      <span>
                        <strong>{song.name}</strong>
                        <small>
                          {getProviderSongMetadata(song)
                            .artists.map((artist) => artist.name)
                            .join(", ")}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="ml-empty ml-empty-small">
                  {t("mobileLibrary.noRecent")}
                </p>
              )}
            </section>
          ) : (
            <>
              <MobileRecommendations
                key={`${sources.online.providerId}:${
                  sources.online.user?.id ?? "anonymous"
                }`}
                props={props}
                source={sources.online}
                cards={online.items}
              />
              <section>
                <div className="ml-home-section-heading">
                  <h2>{t("mobileLibrary.recent")}</h2>
                  {allButton(() => setShowAllRecent(true))}
                </div>
                {recent.length ? (
                  <MobileScrollFrame className="ml-recent-scroll">
                    <div className="ml-recent">
                      {recent.slice(0, 12).map((song) => (
                        <div
                          className="ml-recent-card"
                          key={getPlaybackSongKey(song)}
                        >
                          <button
                            aria-label={`${t("mobileLibrary.play")} ${
                              song.name
                            }`}
                            disabled={isSongUnavailable(song)}
                            onClick={() => playRecent(song, recent)}
                          >
                            <MobileArtwork src={getSongCoverUrl(song)} />
                          </button>
                          <div className="ml-home-item-meta">
                            <button
                              disabled={isSongUnavailable(song)}
                              onClick={() => playRecent(song, recent)}
                            >
                              <strong>{song.name}</strong>
                              <small>
                                {getProviderSongMetadata(song)
                                  .artists.map((artist) => artist.name)
                                  .join(", ")}
                              </small>
                            </button>
                            <button
                              className="ml-home-more"
                              aria-label={t("mobileLibrary.trackActions", {
                                name: song.name,
                              })}
                              onClick={() => setMenu({ kind: "track", song })}
                            >
                              <MoreVertical size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </MobileScrollFrame>
                ) : (
                  <p className="ml-empty ml-empty-small">
                    {t("mobileLibrary.noRecent")}
                  </p>
                )}
              </section>
              <section>
                <div className="ml-home-section-heading">
                  <h2>{t("mobileLibrary.myPlaylists")}</h2>
                  {allButton(viewLibrary)}
                </div>
                {mine.length ? (
                  <div className="ml-playlist-grid">
                    {mine.slice(0, 4).map((card) => (
                      <div
                        className="ml-home-playlist-card"
                        key={`${card.type}:${card.id}`}
                      >
                        <button
                          aria-label={t("mobileLibrary.openPlaylist", {
                            name: card.name,
                          })}
                          onClick={() => open(card)}
                        >
                          <MobileArtwork src={card.coverUrl} />
                        </button>
                        <button
                          className="ml-home-playlist-copy"
                          onClick={() => open(card)}
                        >
                          <strong>{card.name}</strong>
                          <small>
                            {card.trackCount != null
                              ? t("mobileLibrary.trackCount", {
                                  count: card.trackCount,
                                })
                              : card.description}
                          </small>
                        </button>
                        <button
                          className="ml-home-more"
                          aria-label={`${t("mobileLibrary.playlistActions")}：${
                            card.name
                          }`}
                          onClick={() => setMenu({ kind: "playlist", card })}
                        >
                          <MoreVertical size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="ml-empty ml-empty-small">
                    {t("mobileLibrary.noPlaylists")}
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </MobileScrollFrame>
      {menu && (
        <MobileSheet
          title={menu.kind === "track" ? menu.song.name : menu.card.name}
          onClose={() => setMenu(null)}
        >
          {menu.kind === "track" ? (
            <>
              <button
                className="ml-sheet-action"
                disabled={isSongUnavailable(menu.song)}
                onClick={() => {
                  playRecent(menu.song, recent);
                  setMenu(null);
                }}
              >
                {t("mobileLibrary.play")}
              </button>
              {props.onAddSongToQueue && (
                <button
                  className="ml-sheet-action"
                  disabled={isSongUnavailable(menu.song)}
                  onClick={() => {
                    props.onAddSongToQueue?.(menu.song);
                    setMenu(null);
                  }}
                >
                  {t("mobileLibrary.enqueue")}
                </button>
              )}
            </>
          ) : (
            <>
              <button
                className="ml-sheet-action"
                onClick={() => {
                  open(menu.card);
                  setMenu(null);
                }}
              >
                {t("mobileLibrary.openPlaylist", { name: menu.card.name })}
              </button>
              <button
                className="ml-sheet-action"
                onClick={() => {
                  open(menu.card, true);
                  setMenu(null);
                }}
              >
                {t("mobileLibrary.playAll")}
              </button>
            </>
          )}
        </MobileSheet>
      )}
    </>
  );
}
