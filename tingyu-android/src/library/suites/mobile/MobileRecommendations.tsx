import React, { useMemo, useRef, useState } from "react";
import { Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  LibraryHomeCard,
  LibraryHomeOnlineSource,
} from "../../core/contracts/homeModel";
import type { LibraryHomeSurfaceProps } from "../../core/contracts/suite";
import { isPersonalFmCard } from "../../core/model/homeCards";
import { collectionKey } from "../../core/model/collectionIdentity";
import { useMobileLibraryStore } from "../../../stores/useMobileLibraryStore";
import { orderMobileRecommendations } from "./mobileRecommendationOrder";
import MobileScrollFrame from "./MobileScrollFrame";
import "./mobileRecommendations.css";
import { useNewReleaseChart } from "../../../hooks/useNewReleaseChart";

// src/library/suites/mobile/MobileRecommendations.tsx
export default function MobileRecommendations({
  props,
  source,
  cards,
}: {
  props: LibraryHomeSurfaceProps;
  source: LibraryHomeOnlineSource;
  cards: LibraryHomeCard[];
}) {
  const { t } = useTranslation();
  const chart = useNewReleaseChart(source.providerId);
  const sourceRef = useRef(source.providerId);
  sourceRef.current = source.providerId;
  const recommendations = useMemo(
    () => orderMobileRecommendations(cards),
    [cards]
  );
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const pending = useRef(false);
  const rail = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const open = async (card: LibraryHomeCard, play: boolean) => {
    if (pending.current) return;
    if (source.accountView === "resolving") return;
    const special =
      isPersonalFmCard(card) || card.type === "daily_recommendations";
    if (special && (!source.user || source.needsRelogin)) {
      void props.account.startLogin(source.providerId);
      return;
    }
    pending.current = true;
    setBusy(String(card.id));
    setNotice("");
    try {
      const result = await props.homeResources.actions.openOnlineCard(
        card,
        source.providerId,
        (collection) => {
          if (sourceRef.current !== source.providerId) return;
          if (play)
            useMobileLibraryStore
              .getState()
              .requestCollectionPlay(collectionKey(collection));
          props.onOpenGridView(collection);
        }
      );
      if (!result.ok) setNotice(t("mobileLibrary.recommendationUnavailable"));
    } catch {
      setNotice(t("mobileLibrary.recommendationUnavailable"));
    } finally {
      pending.current = false;
      setBusy("");
    }
  };
  const personal = recommendations.find(isPersonalFmCard);
  const daily = recommendations.find(
    (card) => card.type === "daily_recommendations"
  );
  const renderCard = (
    kind: "personal" | "daily" | "new",
    card?: LibraryHomeCard
  ) => {
    const title =
      kind === "personal"
        ? t("mobileLibrary.guessYouLike")
        : kind === "daily"
        ? t("mobileLibrary.dailyThirty")
        : t("mobileLibrary.newReleases");
    const subtitle =
      kind === "personal"
        ? t("mobileLibrary.personalRadioDescription")
        : kind === "daily"
        ? t("mobileLibrary.dailyDescription")
        : t("mobileLibrary.newReleasesDescription");
    const image =
      kind === "personal"
        ? "/assets/mobile-home/guess-you-like.png"
        : kind === "daily"
        ? "/assets/mobile-home/daily-30.png"
        : "/assets/mobile-home/new-releases.png";
    return (
      <article
        className={`ml-feature-card ml-feature-card-${kind}`}
        data-recommendation-kind={kind}
        key={kind}
      >
        <div className="ml-hero-art">
          <img
            className="ml-hero-background"
            src={image}
            width={1400}
            height={1200}
            decoding="async"
            loading={kind === "personal" ? "eager" : "lazy"}
            alt=""
            aria-hidden="true"
          />
          <div className="ml-hero-copy">
            {kind === "new" && card && (
              <button className="ml-new-chart-open" aria-label={title} onClick={() => void open(card, false)} />
            )}
            {kind === "personal" && (
              <span className="ml-poster-brand">TINGYU</span>
            )}
            <h3 className={`ml-poster-title ml-poster-title-${kind}`}>
              {kind === "personal" ? (
                <>
                  {t("mobileLibrary.guessLineOne")}
                  <br />
                  {t("mobileLibrary.guessLineTwo")}
                </>
              ) : kind === "daily" ? (
                <>
                  {t("mobileLibrary.dailyHeading")}
                  <br />
                  {t("mobileLibrary.dailyCountHeading")}
                </>
              ) : (
                title
              )}
            </h3>
            {kind === "personal" && (
              <span className="ml-hero-divider" aria-hidden="true" />
            )}
            <p>{subtitle}</p>
            {card ? (
              <button
                className="ml-hero-play"
                aria-label={t("mobileLibrary.playPlaylist", { name: title })}
                disabled={
                  busy === String(card.id) || source.accountView === "resolving"
                }
                onClick={() => void open(card, true)}
              >
                <Play fill="currentColor" size={17} />
                <span>{t("mobileLibrary.playNow")}</span>
              </button>
            ) : kind === "new" && chart.supported ? (
              <button className="ml-hero-unavailable" disabled={chart.status === 'loading'} onClick={chart.retry}
                title={t("mobileLibrary.recommendationUnavailable")}>
                <Play fill="currentColor" size={17} />
                <span>{t(chart.status === 'loading' ? "mobileLibrary.newReleasesLoading" : "mobileLibrary.newReleasesRetry")}</span>
              </button>
            ) : (
              <span
                className="ml-hero-unavailable"
                aria-disabled="true"
                title={t(
                  kind === "new"
                    ? "mobileLibrary.newReleasesUnavailable"
                    : "mobileLibrary.recommendationUnavailable"
                )}
              >
                <Play fill="currentColor" size={17} />
                <span>{t("mobileLibrary.unavailable")}</span>
              </span>
            )}
          </div>
        </div>
      </article>
    );
  };
  const selectCard = (index: number) => {
    const element = rail.current?.children.item(index) as HTMLElement | null;
    const first = rail.current?.firstElementChild as HTMLElement | null;
    if (element && first)
      rail.current?.scrollTo({
        left: element.offsetLeft - first.offsetLeft,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    setActiveIndex(index);
  };
  return (
    <section className="ml-featured">
      <MobileScrollFrame>
        <div
          className="ml-feature-rail"
          aria-label={t("mobileLibrary.forYou")}
          ref={rail}
          onScroll={(event) => {
            const element = event.currentTarget;
            const first = element.firstElementChild as HTMLElement | null;
            if (!first) return;
            const gap =
              Number.parseFloat(getComputedStyle(element).columnGap || "0") ||
              0;
            setActiveIndex(
              Math.max(
                0,
                Math.min(
                  2,
                  Math.round(element.scrollLeft / (first.offsetWidth + gap))
                )
              )
            );
          }}
        >
          {renderCard("personal", personal)}
          {renderCard("daily", daily)}
          {renderCard("new", chart.supported && chart.collection ? { ...chart.collection, raw: chart.collection } : undefined)}
        </div>
      </MobileScrollFrame>
      <div
        className="ml-feature-dots"
        role="group"
        aria-label={t("mobileLibrary.recommendationPages")}
      >
        {[0, 1, 2].map((index) => (
          <button
            key={index}
            aria-label={t("mobileLibrary.recommendationPage", {
              count: index + 1,
            })}
            aria-current={activeIndex === index ? "true" : undefined}
            onClick={() => selectCard(index)}
          />
        ))}
      </div>
      {notice && (
        <p className="ml-error" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
