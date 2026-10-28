<!-- docs/android-compose-settings.md -->
# Settings and playlist follow-up — 1.3.20-beta.9

## Playlist detail

`NativePlaylistPage` follows `MobilePlaylistHeader`, `MobileTrackList` and
`mobilePlaylistDetail.css`: side-by-side cover and title/creator/count; expandable
description; 42px primary play button and icon actions; songs heading; optional
toolbar search; contiguous 52px rows with separate numbers, 36px artwork and duration.
Existing collection controllers own playback, queue, subscription, filtering and
100-row paging. Other collection types retain their renderer.

## Native settings document

The established React forms remain the setting/state/validation owner. A measured
display list transfers their original layout, text runs, borders, gradients and
Lucide geometry to Compose Canvas. Compose handles form painting, scroll/fling,
IME, field selection, range dragging and accessibility actions. Native actions feed
the original React handlers. This avoids a second independently maintained settings
design or a replacement list with different sizes. It is not a screenshot of a page.

The first settings index still uses its dedicated Compose renderer. Secondary
sections, the rear guide, theme editor, lyric filtering and timing editor use the
document path. Existing lyric/theme live preview engines remain explicit WebView
islands: they are not rewritten in Compose. Their mutations do not rebuild forms.
Native scrolls synchronize those islands, while long logs transmit a visible window
instead of every line. Blob image thumbnails reuse the existing image adapter.

Settings documents are memory-only and excluded from `NativeShellCache`, since
they can contain user-entered credentials. Only the public settings index is cached.

## Navigation and entry

Index entry records `returnToIndex` atomically. Returning from a section resets the
central store, remounting the current native index. Direct stage entry closes back
to the stage. Nested editors go back to their parent section. Native presence does
not retain exiting HTML editors, and unloaded editors never substitute the index.
The settings module warms during idle time/on pointer intent. Preview engine mount
is deferred by two animation frames so it does not compete with control entry.

Route frames now carry a navigation revision as well as their adapter session.
An outgoing frame cannot claim a newer route, including another settings page with
the same surface id. The host retains up to 12 logical page presentations in memory;
adapter removal retires input, not the return presentation. Index, section and editor
keys remain distinct. Boot-cache UI is used only at initial home startup, never to
fill a normal navigation gap. Direct editor entry initializes its final subview before
capture, and incomplete document models are not published. The app-level settings
presence also removes outgoing HTML immediately, preventing a second exit animation.

Native page navigation shares a 220 ms eased, short horizontal transition, reversed
on return. Data/clock revisions do not restart it. Initial home data does not animate
over the startup presentation, and the existing reduced-motion preference skips it.
The WebView stays below the native route layer except for actual WebView dialogs.

Generic settings SVGs retain their viewBox, aspect ratio, group transforms and
resolved fill/stroke opacity. The 160×100 device illustrations no longer use Lucide's
24×24 icon coordinates. Each SVG clips to its own measured viewport. Playlist ambient
art is separately composited with a vertical fade to transparent; the image covers
the fade bounds, so its old fixed-height edge cannot cut across the track list.

## Validation limits

Type checking, targeted JS tests, Android JVM tests, release compilation and mocked
browser bridge workflows cover contracts and routing. Browser tests include the
playlist header, optional search, all visible mobile sections, the startup guide,
custom selects, theme color dragging, lyric filtering, calibration and stage return.
They do not render Compose pixels or exercise Android's real IME/touch system.
No phone is connected and the local emulator is unavailable. Pixel parity, real
gesture smoothness, startup/frame timing and power consumption remain unmeasured.
