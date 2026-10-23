// mods/sample-beta-hello/client.mjs
// The beta-channel sample: the smallest possible mod. It needs no permissions and
// only logs to the renderer console when enabled. It is signed with the Folium
// beta key (folium-beta-2026-1), so the mods panel labels it "beta" instead of
// "verified" and the enable confirmation shows the beta warning.

export default function activate(folium) {
    console.log('hello world');
}
