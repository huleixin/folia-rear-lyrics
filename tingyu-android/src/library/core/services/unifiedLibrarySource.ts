import { omni } from '../../../services/onlineMusic/omni';
import { providerResourceScope as libraryScope } from '../../../services/onlineMusic/providerResourceScope';
import { UnifiedLibrary } from './unifiedLibrary';

// src/library/core/services/unifiedLibrarySource.ts
export { invalidateProviderResources as invalidateUnifiedLibrary, providerResourceScope as libraryScope } from '../../../services/onlineMusic/providerResourceScope';

export const unifiedLibrary = new UnifiedLibrary({
    scope: libraryScope,
    supports: (id, resource) => {
        try { return omni.getLibraryCapabilities(id)[resource] && omni.getProviderAvailability(id).configured; }
        catch { return false; }
    },
    read: (id, userId, resource, limit, offset) => resource === 'albums'
        ? omni.getProviderUserAlbums(id, userId, { limit, offset })
        : omni.getProviderUserPlaylists(id, userId, { limit, offset }),
});
