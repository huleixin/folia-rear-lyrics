import React from 'react';
import { ChevronDown, Heart, Play, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LibraryCollectionDescriptor } from '../../core/contracts/collection';
import type { ProviderCollection } from '../../../types/onlineMusic';
import type { CollectionActions } from '../../core/bindings/useCollectionActions';
import { omni } from '../../../services/onlineMusic/omni';
import MobileArtwork from './MobileArtwork';

// src/library/suites/mobile/MobilePlaylistHeader.tsx
// 只呈现资源快照已有的歌单信息；所有播放与收藏动作由原集合控制器提供。
export default function MobilePlaylistHeader({
    collection, detail, name, count, actions, canSubscribe, subscribeEnabled, subscribed, onSubscribe,
}: {
    collection: LibraryCollectionDescriptor;
    detail?: ProviderCollection | null;
    name: string;
    count: number;
    actions: CollectionActions;
    canSubscribe: boolean;
    subscribeEnabled: boolean;
    subscribed: boolean;
    onSubscribe: () => void;
}) {
    const { t } = useTranslation();
    const creator = detail?.creator ?? collection.creator;
    const description = detail?.description || collection.description;
    const source = collection.source === 'online'
        ? omni.getProviderLabel(collection.providerId)
        : t(collection.source === 'local' ? 'search.sourceLocal' : 'search.sourceNavidrome');
    const descriptionCopy = description && <span>{description}</span>;
    return <header className="ml-playlist-header">
        <div className="ml-playlist-hero">
            <MobileArtwork src={detail?.coverUrl || collection.coverUrl} className="ml-playlist-cover" priority />
            <div className="ml-playlist-info">
                <h1 title={name}>{name}</h1>
                <p className="ml-playlist-count">{t('mobileLibrary.trackCount', { count })}</p>
                <div className="ml-playlist-creator">
                    {creator?.avatarUrl && <MobileArtwork src={creator.avatarUrl} priority />}
                    <span>{creator?.nickname || source}</span>
                </div>
            </div>
        </div>
        {description && (description.length > 80 || description.includes('\n')
            ? <details className="ml-playlist-description" key={description}>
                <summary aria-label={t('mobileLibrary.playlistDescription')}>{descriptionCopy}<ChevronDown size={16} /></summary>
            </details>
            : <p className="ml-playlist-description">{descriptionCopy}</p>)}
        <div className="ml-playlist-actions">
            <button className="ml-playlist-play" disabled={!actions.capabilities.scope.enabled} onClick={actions.playScope}>
                <Play size={20} fill="currentColor" />{t('mobileLibrary.playAll')}
            </button>
            <div className="ml-playlist-auxiliary">
                {actions.capabilities.scope.supported && <button
                    className="ml-playlist-action" disabled={!actions.capabilities.scope.enabled}
                    onClick={actions.enqueueScope} aria-label={t('mobileLibrary.enqueue')} title={t('mobileLibrary.enqueue')}
                ><Plus size={24} /></button>}
                {canSubscribe && <button
                    className="ml-playlist-action" disabled={!subscribeEnabled} aria-pressed={subscribed}
                    onClick={onSubscribe} aria-label={t(subscribed ? 'mobileLibrary.saved' : 'mobileLibrary.save')}
                    title={t(subscribed ? 'mobileLibrary.saved' : 'mobileLibrary.save')}
                ><Heart size={22} fill={subscribed ? 'currentColor' : 'none'} /></button>}
            </div>
        </div>
        <div className="ml-playlist-song-heading">
            <h2><span>{t('mobileLibrary.playlistSongs')}</span><small>{count}</small></h2>
        </div>
    </header>;
}
